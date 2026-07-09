// D-009 extractor fixture — ts-enum. TWO legitimate facets (member NAMES vs
// raw string VALUES); the descriptor pins one with `emit:` (§3.5) — this
// pair pins `emit: names`, so the expected set is the uppercase names, not
// the lowercase raw values. Adversarial-but-extractable: string initializers,
// mixed quotes, interleaved comment, trailing comma. Pair: EXPECTED.yaml.
export enum Currency {
  USD = 'usd',
  EUR = "eur", // euro zone
  GBP = 'gbp',
  CAD = 'cad',
}
