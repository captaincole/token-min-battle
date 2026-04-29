import {
  CreateMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport,
  type ChatCompletionMessageParam,
} from '@mlc-ai/web-llm';

// Chosen for prototype. Same model + same settings for everyone.
export const MODEL_ID = 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC';

export const RESET_CSS =
  'html,body{margin:0;padding:0;width:100%;height:100%}*{box-sizing:border-box}';

export const STARTER_TEMPLATE = `<!doctype html>
<html>
<head><style>${RESET_CSS}</style></head>
<body>
  <!-- your markup -->
</body>
</html>`;

export const SYSTEM_PROMPT = `You are a CSS golf assistant. Replicate the requested image with the FEWEST tokens possible.

Rules:
- Output ONLY a single fenced \`\`\`html\`\`\` code block. No prose, no extra fences.
- Start from this template; fill in <body> and <style>:
${STARTER_TEMPLATE}
- A reset (margin/padding 0, box-sizing border-box) is already applied — don't repeat it.
- Use the exact hex colors the user provides.
- Be terse. Short class names, no comments, no whitespace.`;

export const GEN_SETTINGS = {
  temperature: 0,
  top_p: 1,
  max_tokens: 512,
};

export type EngineState =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: number; text: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export async function loadEngine(
  onProgress: (p: InitProgressReport) => void
): Promise<MLCEngineInterface> {
  return await CreateMLCEngine(MODEL_ID, {
    initProgressCallback: onProgress,
  });
}

export type ChatTurnResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

export async function runTurn(
  engine: MLCEngineInterface,
  history: ChatCompletionMessageParam[]
): Promise<ChatTurnResult> {
  const reply = await engine.chat.completions.create({
    messages: history,
    temperature: GEN_SETTINGS.temperature,
    top_p: GEN_SETTINGS.top_p,
    max_tokens: GEN_SETTINGS.max_tokens,
  });
  const choice = reply.choices?.[0];
  const text = choice?.message?.content ?? '';
  const usage = reply.usage;
  return {
    text,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  };
}
