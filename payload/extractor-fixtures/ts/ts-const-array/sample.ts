// D-009 extractor fixture — ts-const-array (facet: the element strings of an
// exported const array literal; reads .js the same way — kinds describe
// declaration shape, not file type). Adversarial-but-extractable: multi-line,
// trailing comma, line + block comments between members, mixed quote styles,
// `as const`. Pair: EXPECTED.yaml.
export const EXPORT_FORMATS = [
  'png', // raster default
  "svg",
  'jpg', /* legacy raster */
  'webp',
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
