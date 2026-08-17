// Panel registry — the ts-object-keys anchor in a .ts file (K-106).
// Adversarial-but-extractable: quoted keys with dashes, unquoted keys,
// nested object values, a nested ARRAY whose members must not leak into
// the top-level key set. Expected clean extraction.
export const PANELS = {
  'layers-panel': { defaultWidth: 240 },
  inspector: { defaultWidth: 280 },
  "assets-panel": {
    appliesTo: ['editor', 'whiteboard'], // nested array — not top-level keys
  },
  comments: { defaultWidth: 320 },
};

export type PanelId = keyof typeof PANELS;
