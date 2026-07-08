// Promotion registry — the ts-object-keys anchor in a .ts file (K-106).
// Adversarial-but-extractable: quoted keys with dashes, unquoted keys,
// nested object values, a nested ARRAY whose members must not leak into
// the top-level key set. Expected clean extraction.
export const PROMOTIONS = {
  'welcome-bonus': { maxCents: 50000 },
  reload: { maxCents: 10000 },
  "odds-boost": {
    appliesTo: ['nfl', 'nba'], // nested array — not top-level keys
  },
  referral: { maxCents: 2500 },
};

export type PromotionKind = keyof typeof PROMOTIONS;
