// Sport registry — the canonical ts-const-array anchor (K-101).
// Adversarial-but-extractable (PRD §5.1): multi-line, trailing comma, inline
// line/block comments, mixed quote styles, `as const` — all inside the
// ts-const-array syntactic envelope. Expected clean extraction.
export const SUPPORTED_SPORTS = [
  'nfl', // american football
  "nba",
  'mlb',
  'nhl', /* ice hockey */
  'soccer',
] as const;

export type Sport = (typeof SUPPORTED_SPORTS)[number];

export function isSupportedSport(value: string): value is Sport {
  return (SUPPORTED_SPORTS as readonly string[]).includes(value);
}
