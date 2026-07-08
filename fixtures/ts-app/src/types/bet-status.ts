// Bet lifecycle — the ts-union anchor (K-103).
// Adversarial-but-extractable: leading-pipe multi-line union with an
// interleaved comment — gnarly formatting, still inside the envelope.
// Expected clean extraction.
export type BetStatus =
  | 'open'
  | 'settled'
  // terminal states below
  | 'voided'
  | 'cashed-out';

export const TERMINAL_STATUSES: BetStatus[] = ['settled', 'voided', 'cashed-out'];
