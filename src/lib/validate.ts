// Heuristic: does this user message look like code rather than a prompt?
// We don't want players to bypass the game by pasting the answer in directly.
//
// Rules (any one trips the check):
// - starts with `<` after trimming (an HTML tag)
// - contains a CSS rule body like `selector { prop: val; }`
// - HTML tags account for >70% of the message
export function looksLikeCode(message: string): {
  flagged: boolean;
  reason?: string;
} {
  const trimmed = message.trim();
  if (!trimmed) return { flagged: false };

  if (trimmed.startsWith('<')) {
    return { flagged: true, reason: 'starts with an HTML tag' };
  }

  if (/[a-z\-#.][\w\-]*\s*\{[\s\S]*?[:;][\s\S]*?\}/i.test(trimmed)) {
    return { flagged: true, reason: 'contains a CSS rule block' };
  }

  const tagMatches = trimmed.match(/<\/?[a-z][a-z0-9-]*[^>]*>/gi);
  if (tagMatches) {
    const tagChars = tagMatches.reduce((sum, t) => sum + t.length, 0);
    if (tagChars / trimmed.length > 0.7) {
      return { flagged: true, reason: 'mostly HTML tags' };
    }
  }

  return { flagged: false };
}
