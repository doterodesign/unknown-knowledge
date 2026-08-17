// Blend-mode registry — planted drift anchor (K-102). The store claims one
// EXTRA blend mode deliberately absent here — lexically too: naming it even
// in a comment would hide the drift from grep-level detectors (A3, dir. 1).
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay'];

export function isBlendMode(value: string): boolean {
  return BLEND_MODES.includes(value);
}
