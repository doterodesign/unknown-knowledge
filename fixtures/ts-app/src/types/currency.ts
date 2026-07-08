// Supported currencies — the ts-enum anchor (K-105).
// Adversarial-but-extractable: string initializers with mixed quote styles,
// an interleaved comment, trailing comma. Member NAMES differ from raw
// values, so the descriptor pins the facet with `emit: names` (§3.5).
// Expected clean extraction of [USD, EUR, GBP, CAD].
export enum Currency {
  USD = 'usd',
  EUR = "eur", // euro zone
  GBP = 'gbp',
  CAD = 'cad',
}

export const DEFAULT_CURRENCY = Currency.USD;
