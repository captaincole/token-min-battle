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
