/** Canonical base64 grammar only; no decoding, admission or evidence authority. */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Return decoded byte length, or null for noncanonical text. */
export function canonicalBase64DecodedLength(text) {
  if (typeof text !== 'string' || text.length % 4 !== 0) return null;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  // A linear scan avoids native regexp recursion on large admitted text.
  for (let index = 0; index < text.length - padding; index += 1) {
    if (alphabet.indexOf(text[index]) === -1) return null;
  }
  if (padding && (alphabet.indexOf(text[text.length - padding - 1]) & (padding === 2 ? 15 : 3)) !== 0) return null;
  return text.length / 4 * 3 - padding;
}
