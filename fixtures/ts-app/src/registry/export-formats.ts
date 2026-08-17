// Export-format registry — the canonical ts-const-array anchor (K-101).
// Adversarial-but-extractable (PRD §5.1): multi-line, trailing comma, inline
// line/block comments, mixed quote styles, `as const` — all inside the
// ts-const-array syntactic envelope. Expected clean extraction.
export const EXPORT_FORMATS = [
  'png', // raster default
  "svg",
  'jpg',
  'webp', /* modern raster */
  'pdf',
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}
