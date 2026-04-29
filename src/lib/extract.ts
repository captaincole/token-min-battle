import { RESET_CSS } from './engine';

// Pull the last fenced code block out of an assistant response.
// Falls back to the whole string if there is no fence.
export function extractCode(text: string): string | null {
  const fenceRegex = /```(?:html|HTML|css|CSS)?\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = fenceRegex.exec(text)) !== null) {
    last = match[1];
  }
  if (last !== null) return last.trim();

  // Heuristic: if the text looks like HTML/CSS, take it as-is.
  const trimmed = text.trim();
  if (
    trimmed.startsWith('<') ||
    trimmed.startsWith('<!') ||
    /[.#\w-]+\s*\{[^}]*\}/.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
}

const RESET_TAG = `<style>${RESET_CSS}</style>`;

function injectReset(doc: string): string {
  // Place reset as the first thing in <head> so the model can override it.
  if (/<head[^>]*>/i.test(doc)) {
    return doc.replace(/<head[^>]*>/i, (m) => `${m}${RESET_TAG}`);
  }
  if (/<html[^>]*>/i.test(doc)) {
    return doc.replace(
      /<html[^>]*>/i,
      (m) => `${m}<head>${RESET_TAG}</head>`
    );
  }
  return `${RESET_TAG}${doc}`;
}

// Wrap raw output in a minimal HTML host (with reset) and ensure the reset
// is applied even if the model emitted a full document.
export function ensureHtmlDoc(snippet: string): string {
  const looksLikeFullDoc = /<\s*html\b/i.test(snippet);
  if (looksLikeFullDoc) {
    return injectReset(snippet);
  }

  const looksLikeHtmlFragment = /<\s*(body|div|span|main|section|p|button|a|svg)\b/i.test(
    snippet
  );
  if (looksLikeHtmlFragment) {
    return `<!doctype html><html><head>${RESET_TAG}</head><body>${snippet}</body></html>`;
  }

  // CSS-only — host as a style block.
  return `<!doctype html><html><head>${RESET_TAG}<style>${snippet}</style></head><body></body></html>`;
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// Lightweight HTML pretty-printer for display purposes.
// Splits on tag boundaries and re-indents based on nesting depth.
// Doesn't reformat <style> or <script> bodies — those stay as-is.
export function prettyHtml(html: string): string {
  const tokens: string[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) {
        tokens.push(html.slice(i));
        break;
      }
      const tag = html.slice(i, end + 1);
      tokens.push(tag);
      i = end + 1;
      // For <style>/<script>, gulp the body verbatim so it stays one line.
      const tagNameMatch = tag.match(/^<([a-zA-Z]+)/);
      const tagName = tagNameMatch?.[1].toLowerCase();
      if (tagName === 'style' || tagName === 'script') {
        const closeTag = `</${tagName}>`;
        const closeIdx = html.toLowerCase().indexOf(closeTag, i);
        if (closeIdx !== -1) {
          tokens.push(html.slice(i, closeIdx));
          tokens.push(html.slice(closeIdx, closeIdx + closeTag.length));
          i = closeIdx + closeTag.length;
        }
      }
    } else {
      const next = html.indexOf('<', i);
      const end = next === -1 ? html.length : next;
      const text = html.slice(i, end);
      if (text.trim()) tokens.push(text.trim());
      i = end;
    }
  }

  const INDENT = '  ';
  let depth = 0;
  const lines: string[] = [];
  let inStyleScript = false;
  let styleScriptOpenDepth = 0;

  for (const t of tokens) {
    if (t.startsWith('<')) {
      const lower = t.toLowerCase();
      const isClosing = lower.startsWith('</');
      const isComment = lower.startsWith('<!--');
      const isDoctype = lower.startsWith('<!doctype');
      const tagMatch = t.match(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/);
      const tagName = (tagMatch?.[1] ?? '').toLowerCase();
      const isVoid = VOID_TAGS.has(tagName) || t.endsWith('/>') || isDoctype;

      if (isComment) {
        lines.push(INDENT.repeat(depth) + t);
        continue;
      }

      if (tagName === 'style' || tagName === 'script') {
        if (isClosing) {
          inStyleScript = false;
          depth = styleScriptOpenDepth;
          lines.push(INDENT.repeat(depth) + t);
        } else {
          lines.push(INDENT.repeat(depth) + t);
          inStyleScript = true;
          styleScriptOpenDepth = depth;
          depth++;
        }
        continue;
      }

      if (isClosing) {
        depth = Math.max(0, depth - 1);
        lines.push(INDENT.repeat(depth) + t);
      } else {
        lines.push(INDENT.repeat(depth) + t);
        if (!isVoid) depth++;
      }
    } else {
      // Text content. If we're inside <style>/<script>, leave it raw.
      if (inStyleScript) {
        lines.push(INDENT.repeat(depth) + t);
      } else {
        lines.push(INDENT.repeat(depth) + t);
      }
    }
  }
  return lines.join('\n');
}
