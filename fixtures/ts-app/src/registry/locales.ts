// Locale registry — the TRUE home of the locale value set. Concept K-108
// deliberately points its descriptor at src/registry/export-formats.ts:
// every claimed value is missing from that (real, parseable) file, which is
// exactly the wrong-pointer signature the value validator must detect (A3).
export const LOCALES = ['en-US', 'es-MX', 'pt-BR'];
