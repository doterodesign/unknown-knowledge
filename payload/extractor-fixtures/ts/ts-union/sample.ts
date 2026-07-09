// D-009 extractor fixture — ts-union (facet: the string-literal members of a
// type union). Adversarial-but-extractable: leading-pipe multi-line union
// with an interleaved comment. Pair: EXPECTED.yaml.
export type BetStatus =
  | 'open'
  | 'settled'
  // terminal states below
  | 'voided'
  | 'cashed-out';
