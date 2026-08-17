// D-009 extractor fixture — ts-object-keys (facet: the TOP-LEVEL keys of an
// exported object literal; nested objects/arrays are values, never keys).
// The .tsx extension is deliberate (§5.1: kinds describe declaration shape,
// not file type) and the JSX below plants an inline object literal
// ({{ color: ... }}) OUTSIDE the anchored symbol's span — it must not match.
// Adversarial-but-extractable: quoted dashed keys, bare keys, nested object
// and nested array values. Pair: EXPECTED.yaml.
export const PANELS = {
  'layers-panel': { defaultWidth: 240 },
  inspector: { defaultWidth: 280 },
  "assets-panel": {
    appliesTo: ['editor', 'whiteboard'], // nested array — not top-level keys
  },
  comments: { defaultWidth: 320 },
};

export function PanelTag({ id }: { id: keyof typeof PANELS }) {
  return (
    <span className="panel-tag" style={{ color: '#1db954' }}>
      {id}
    </span>
  );
}
