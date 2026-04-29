import { useEffect, useRef, useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import type { MLCEngineInterface } from '@mlc-ai/web-llm';
import { challenges } from './challenges';
import {
  MODEL_ID,
  STARTER_TEMPLATE,
  SYSTEM_PROMPT,
  loadEngine,
  runTurn,
  type EngineState,
} from './lib/engine';
import { extractCode, ensureHtmlDoc } from './lib/extract';
import { compareCanvases, snapshotIframe } from './lib/diff';
import { extractPalette } from './lib/palette';

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  promptTokens?: number;
  completionTokens?: number;
};

export default function App() {
  const challenge = challenges[0];

  const [engineState, setEngineState] = useState<EngineState>({ kind: 'idle' });
  const engineRef = useRef<MLCEngineInterface | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [totalPromptTokens, setTotalPromptTokens] = useState(0);
  const [totalCompletionTokens, setTotalCompletionTokens] = useState(0);

  const [matchPercent, setMatchPercent] = useState<number | null>(null);
  const [diffStats, setDiffStats] = useState<{
    changed: number;
    maxDiff: number;
  } | null>(null);
  const [solved, setSolved] = useState(false);
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);

  const userIframeRef = useRef<HTMLIFrameElement>(null);
  const diffMountRef = useRef<HTMLDivElement>(null);
  const targetCanvasRef = useRef<HTMLCanvasElement>(null);

  // Render the target onto a visible <canvas>. The source HTML lives in an
  // offscreen iframe just long enough to snapshot it, then the iframe is
  // removed so there's nothing for "Inspect Element" to find.
  useEffect(() => {
    const visibleCanvas = targetCanvasRef.current;
    if (!visibleCanvas) return;
    visibleCanvas.width = challenge.width;
    visibleCanvas.height = challenge.height;

    const iframe = document.createElement('iframe');
    iframe.width = String(challenge.width);
    iframe.height = String(challenge.height);
    iframe.style.position = 'absolute';
    iframe.style.left = '-99999px';
    iframe.style.top = '0';
    iframe.style.border = 'none';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.srcdoc = ensureHtmlDoc(challenge.targetBody);

    let removed = false;
    const cleanup = () => {
      if (!removed && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
        removed = true;
      }
    };

    const onLoad = async () => {
      try {
        await new Promise((r) => setTimeout(r, 50));
        const snap = await snapshotIframe(
          iframe,
          challenge.width,
          challenge.height
        );
        const ctx = visibleCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, challenge.width, challenge.height);
        ctx.drawImage(snap, 0, 0);
        setPalette(extractPalette(snap, 6));
      } catch (err) {
        console.error('target render failed', err);
      } finally {
        cleanup();
      }
    };

    iframe.addEventListener('load', onLoad);
    document.body.appendChild(iframe);
    return cleanup;
  }, [challenge.width, challenge.height, challenge.targetBody]);

  async function handleDownload() {
    if (engineRef.current) return;
    setEngineState({ kind: 'loading', progress: 0, text: 'starting…' });
    try {
      const engine = await loadEngine((p) => {
        setEngineState({
          kind: 'loading',
          progress: p.progress ?? 0,
          text: p.text ?? '',
        });
      });
      engineRef.current = engine;
      setEngineState({ kind: 'ready' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEngineState({ kind: 'error', message: msg });
    }
  }

  async function handleSend() {
    const engine = engineRef.current;
    if (!engine || !input.trim() || isGenerating) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsGenerating(true);

    const history: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as ChatCompletionMessageParam[],
    ];

    try {
      const result = await runTurn(engine, history);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.text,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      };
      setMessages((m) => [...m, assistantMsg]);
      setTotalPromptTokens((t) => t + result.promptTokens);
      setTotalCompletionTokens((t) => t + result.completionTokens);

      const code = extractCode(result.text);
      if (code) {
        const html = ensureHtmlDoc(code);
        setCurrentCode(html);
        const userIframe = userIframeRef.current;
        if (userIframe) {
          await new Promise<void>((resolve) => {
            const onLoad = () => {
              userIframe.removeEventListener('load', onLoad);
              resolve();
            };
            userIframe.addEventListener('load', onLoad);
            userIframe.srcdoc = html;
          });
          await new Promise((r) => setTimeout(r, 80));
          await runDiff();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => [
        ...m,
        { role: 'system', content: `error: ${msg}` },
      ]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function runDiff() {
    const userIframe = userIframeRef.current;
    const targetCanvas = targetCanvasRef.current;
    const mount = diffMountRef.current;
    if (!userIframe || !targetCanvas || !mount) return;
    try {
      const userCanvas = await snapshotIframe(
        userIframe,
        challenge.width,
        challenge.height
      );
      const result = compareCanvases(targetCanvas, userCanvas);
      setMatchPercent(result.similarity);
      setDiffStats({
        changed: result.changedPixels,
        maxDiff: result.maxChannelDiff,
      });
      mount.replaceChildren(result.diffCanvas);
      result.diffCanvas.style.display = 'block';
      result.diffCanvas.style.width = `${challenge.width}px`;
      result.diffCanvas.style.height = `${challenge.height}px`;

      if (result.similarity >= challenge.passThreshold) {
        setSolved(true);
      }
    } catch (err) {
      console.error('diff failed', err);
    }
  }

  const total = totalPromptTokens + totalCompletionTokens;
  const modelTag = MODEL_ID.split('-').slice(0, 3).join('-');

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          token<span className="accent">minning</span>
          <span className="brand-tag">· why use many token</span>
        </div>
        <div className="header-meta">
          <span className="meta-item">{challenge.name}</span>
          <span className="meta-divider">·</span>
          <span className="meta-item muted">{modelTag}</span>
          <span className="meta-divider">·</span>
          <span className="meta-item">
            <span className="muted">tokens</span>{' '}
            <strong className="accent">{total}</strong>
          </span>
          {solved && <span className="meta-pill good">SOLVED</span>}
        </div>
      </header>

      <div className="main">
        {/* CHAT COLUMN */}
        <div className="col chat-col">
          <div className="col-header">chat</div>

          {engineState.kind === 'idle' && (
            <div className="engine-status">
              <div className="row">
                <span className="muted small">
                  Model not loaded yet. ~1 GB download, cached after.
                </span>
              </div>
              <button onClick={handleDownload}>Download model</button>
            </div>
          )}
          {engineState.kind === 'loading' && (
            <div className="engine-status">
              <div className="progress-text">
                loading… {(engineState.progress * 100).toFixed(0)}%
              </div>
              <div className="meter">
                <div style={{ width: `${engineState.progress * 100}%` }} />
              </div>
              <div className="progress-text muted">{engineState.text}</div>
            </div>
          )}
          {engineState.kind === 'error' && (
            <div className="engine-status">
              <span style={{ color: 'var(--bad)' }}>
                load failed: {engineState.message}
              </span>
              <button onClick={handleDownload}>Retry</button>
            </div>
          )}

          <div className="transcript">
            {messages.length === 0 && (
              <div className="msg system">
                Send a prompt. Model output appears in the code panel and is
                rendered to the right. Score = total tokens.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <span className="role">
                  {m.role}
                  {m.completionTokens !== undefined &&
                    ` · ${m.promptTokens}+${m.completionTokens} tok`}
                </span>
                {m.content}
              </div>
            ))}
            {isGenerating && (
              <div className="msg assistant">
                <span className="role">assistant</span>…
              </div>
            )}
          </div>

          <div className="input-row">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                engineState.kind === 'ready'
                  ? 'message the model… (⌘↵ to send)'
                  : 'load the model first.'
              }
              disabled={engineState.kind !== 'ready' || isGenerating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={
                engineState.kind !== 'ready' ||
                isGenerating ||
                !input.trim()
              }
            >
              send
            </button>
          </div>

          <div className="token-meter">
            <div className="stat">
              <span className="label">prompt</span>
              <span className="value">{totalPromptTokens}</span>
            </div>
            <div className="stat">
              <span className="label">completion</span>
              <span className="value">{totalCompletionTokens}</span>
            </div>
            <div className="stat">
              <span className="label">total</span>
              <span className="value accent">{total}</span>
            </div>
          </div>
        </div>

        {/* CODE COLUMN */}
        <div className="col code-col">
          <div className="col-header">
            <span>{currentCode ? 'code' : 'starter template'}</span>
            <span className="char-count">
              {currentCode
                ? `${currentCode.length.toLocaleString()} chars`
                : `${STARTER_TEMPLATE.length} chars · waiting for model`}
            </span>
          </div>
          <Highlight
            code={currentCode ?? STARTER_TEMPLATE}
            language="markup"
            theme={themes.vsDark}
          >
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className={`code-body ${className}`}
                style={{ ...style, background: 'transparent' }}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })} className="code-line">
                    <span className="line-num">{i + 1}</span>
                    <span className="line-content">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>

        {/* OUTPUT COLUMN */}
        <div className="col output-col">
          <div className="col-header">output</div>

          <div className="problem">
            <h3>{challenge.name}</h3>
            <p>{challenge.prompt}</p>
            <p className="problem-meta">
              {challenge.width}×{challenge.height}px · pass ≥{' '}
              {(challenge.passThreshold * 100).toFixed(0)}%
            </p>
          </div>

          {palette.length > 0 && (
            <div className="palette">
              <span className="section-label">colors</span>
              <div className="chips">
                {palette.map((hex) => (
                  <div className="chip" key={hex}>
                    <span className="swatch" style={{ background: hex }} />
                    <span className="hex">{hex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="render-stack">
            <div className="render-cell">
              <span className="label">target</span>
              <div
                className="frame-wrap"
                style={{ width: challenge.width, height: challenge.height }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <canvas
                  ref={targetCanvasRef}
                  width={challenge.width}
                  height={challenge.height}
                  style={{
                    width: challenge.width,
                    height: challenge.height,
                    display: 'block',
                  }}
                />
              </div>
            </div>
            <div className="render-cell">
              <span className="label">your render</span>
              <div
                className="frame-wrap"
                style={{ width: challenge.width, height: challenge.height }}
              >
                <iframe
                  ref={userIframeRef}
                  title="user"
                  sandbox="allow-same-origin"
                  width={challenge.width}
                  height={challenge.height}
                  style={{ border: 'none', display: 'block' }}
                />
              </div>
            </div>
            <div className="render-cell">
              <span className="label">
                diff
                {diffStats && (
                  <span className="muted">
                    {' '}· {diffStats.changed.toLocaleString()} px off · max Δ{' '}
                    {diffStats.maxDiff}
                  </span>
                )}
              </span>
              <div
                ref={diffMountRef}
                className="frame-wrap diff-mount"
                style={{
                  width: challenge.width,
                  height: challenge.height,
                  background: '#000',
                }}
              />
            </div>
          </div>

          <div className="diff-bar">
            <span className="pct">
              {matchPercent === null
                ? '—'
                : `${(matchPercent * 100).toFixed(1)}%`}
            </span>
            <div className="meter">
              <div style={{ width: `${(matchPercent ?? 0) * 100}%` }} />
            </div>
            <span className="muted small">
              ≥ {(challenge.passThreshold * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
