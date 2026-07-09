// D-009 extractor fixture — ts-object-keys (facet: the TOP-LEVEL keys of an
// exported object literal; nested objects/arrays are values, never keys).
// The .tsx extension is deliberate (§5.1: kinds describe declaration shape,
// not file type) and the JSX below plants an inline object literal
// ({{ color: ... }}) OUTSIDE the anchored symbol's span — it must not match.
// Adversarial-but-extractable: quoted dashed keys, bare keys, nested object
// and nested array values. Pair: EXPECTED.yaml.
export const PROMOTIONS = {
  'welcome-bonus': { maxCents: 50000 },
  reload: { maxCents: 10000 },
  "odds-boost": {
    appliesTo: ['nfl', 'nba'], // nested array — not top-level keys
  },
  referral: { maxCents: 2500 },
};

export function PromoTag({ kind }: { kind: keyof typeof PROMOTIONS }) {
  return (
    <span className="promo-tag" style={{ color: '#1db954' }}>
      {kind}
    </span>
  );
}
