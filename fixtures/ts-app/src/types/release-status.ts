// Library-release lifecycle — the ts-union anchor (K-103).
// Adversarial-but-extractable: leading-pipe multi-line union with an
// interleaved comment — gnarly formatting, still inside the envelope.
// Expected clean extraction.
export type ReleaseStatus =
  | 'draft'
  | 'in-review'
  // terminal states below
  | 'published'
  | 'deprecated';

export const TERMINAL_STATUSES: ReleaseStatus[] = ['published', 'deprecated'];
