// Market-type registry — planted drift anchor (K-102). The store claims one
// EXTRA market type deliberately absent here — lexically too: naming it even
// in a comment would hide the drift from grep-level detectors (A3, dir. 1).
export const MARKET_TYPES = ['moneyline', 'spread', 'totals', 'parlay'];

export function isMarketType(value: string): boolean {
  return MARKET_TYPES.includes(value);
}
