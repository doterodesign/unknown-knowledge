// Market-type registry — planted drift anchor (K-102).
// The store additionally claims 'futures', which is NOT here: the value
// validator must emit value-not-in-source for it (A3, drift direction 1).
export const MARKET_TYPES = ['moneyline', 'spread', 'totals', 'parlay'];

export function isMarketType(value: string): boolean {
  return MARKET_TYPES.includes(value);
}
