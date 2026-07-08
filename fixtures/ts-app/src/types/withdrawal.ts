// Withdrawal methods — planted drift anchor (K-104).
// 'crypto' exists here but the store's claim omits it: the value validator
// must emit source-value-missing for it (A3, drift direction 2).
export type WithdrawalMethod = 'ach' | 'wire' | 'paypal' | 'crypto';

export interface WithdrawalRequest {
  method: WithdrawalMethod;
  amountCents: number;
}
