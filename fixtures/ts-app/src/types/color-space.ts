// Supported color spaces — the ts-enum anchor (K-105).
// Adversarial-but-extractable: string initializers with mixed quote styles,
// an interleaved comment, trailing comma. Member NAMES differ from raw
// values, so the descriptor pins the facet with `emit: names` (§3.5).
// Expected clean extraction of [SRGB, P3, LAB, LCH].
export enum ColorSpace {
  SRGB = 'srgb',
  P3 = "display-p3", // wide gamut
  LAB = 'lab',
  LCH = 'lch',
}

export const DEFAULT_COLOR_SPACE = ColorSpace.SRGB;
