// D-009 extractor fixture — ts-const-array (facet: the element strings of an
// exported const array literal; reads .js the same way — kinds describe
// declaration shape, not file type). Adversarial-but-extractable: multi-line,
// trailing comma, line + block comments between members, mixed quote styles,
// `as const`. Pair: EXPECTED.yaml.
export const SUPPORTED_SPORTS = [
  'nfl', // american football
  "nba",
  'mlb', /* baseball */
  'soccer',
] as const;

export type Sport = (typeof SUPPORTED_SPORTS)[number];
