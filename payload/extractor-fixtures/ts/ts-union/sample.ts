// D-009 extractor fixture — ts-union (facet: the string-literal members of a
// type union). Adversarial-but-extractable: leading-pipe multi-line union
// with an interleaved comment. Pair: EXPECTED.yaml.
export type ReleaseStatus =
  | 'draft'
  | 'in-review'
  // terminal states below
  | 'published'
  | 'deprecated';
