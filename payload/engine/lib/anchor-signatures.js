/**
 * Anchor-candidate signatures (KK-25) — ONE regex table shared between the
 * survey map's pre-scan and the extractor kinds (KK-08/09 import from here).
 * A kind describes the shape of a declaration, not the file type (PRD §5.1):
 * .tsx/.jsx are extensions handled by the TS/JS kinds, not separate kinds.
 *
 * Each signature is a cheap lexical sniff — "this file plausibly contains an
 * anchor of this kind" — never a parse. Extraction (and the syntactic-envelope
 * hard-error discipline) belongs to the extractor recipes; the survey map only
 * surfaces candidates for agent triage. Patterns are stored as source strings
 * so the table stays data (importable, testable, greppable), compiled by
 * consumers. `pattern: null` marks a directory-shape kind (dir-modules) that
 * is detected structurally, not by content.
 *
 * Sorted by kind; a kind may carry several signatures when one anchor shape
 * lives in more than one file format (strings-keys: legacy `.strings` and the
 * JSON `.xcstrings` catalog). DEEP-frozen — the entries AND their extensions
 * arrays — so extending the kind set stays a KK-08/09-style change with
 * fixtures, never an in-session mutation (D-005).
 *
 * Known limitation: legacy UTF-16 .strings files (BOM-marked, common in older
 * Xcode exports) do not decode as UTF-8, so a content sniff cannot see their
 * `"key" = "value"` lines. The survey map treats a UTF-16 BOM as "candidate by
 * extension" instead of skipping silently — see sniffKinds() in survey-map.js.
 */
const TS_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const YAML_EXTENSIONS = Object.freeze(['.yaml', '.yml']);

export const ANCHOR_SIGNATURES = Object.freeze([
  {
    kind: 'dir-modules',
    extensions: null, // directory shape: siblings sharing one extension
    pattern: null,
    flags: '',
    reads: 'subfolder/file names, with pattern/strip options',
  },
  {
    kind: 'json-keys',
    extensions: ['.json'],
    pattern: '^\\s*"[^"\\n]+"\\s*:',
    flags: 'm',
    reads: 'top-level keys of a JSON object',
  },
  {
    kind: 'json-map-keys',
    extensions: ['.json'],
    pattern: '"[^"\\n]+"\\s*:\\s*\\{',
    flags: 'm',
    reads: 'keys under a dotted path in a JSON object',
  },
  {
    kind: 'strings-keys',
    extensions: ['.strings'],
    pattern: '^\\s*"[^"\\n]+"\\s*=\\s*"',
    flags: 'm',
    reads: 'localization keys of a legacy `"key" = "value"` .strings table',
  },
  {
    kind: 'strings-keys',
    extensions: ['.xcstrings'],
    pattern: '"strings"\\s*:\\s*\\{',
    flags: 'm',
    reads: 'localization keys of an .xcstrings JSON catalog ("strings" map)',
  },
  {
    kind: 'swift-const-array',
    extensions: ['.swift'],
    pattern: '\\b(?:static\\s+)?let\\s+\\w+\\s*(?::\\s*\\[[^\\]\\n]*\\])?\\s*=\\s*\\[',
    flags: 'm',
    reads: 'static let / let array literals',
  },
  {
    kind: 'swift-enum',
    extensions: ['.swift'],
    pattern: '\\benum\\s+\\w+\\s*(?::\\s*[^{\\n]+)?\\{',
    flags: 'm',
    reads: 'cases of a Swift enum',
  },
  {
    kind: 'ts-const-array',
    extensions: TS_EXTENSIONS,
    pattern: '\\bexport\\s+(?:const|let|var)\\s+\\w+\\s*(?::\\s*[^=\\n]+)?=\\s*\\[',
    flags: 'm',
    reads: 'exported const array (works for JS too)',
  },
  {
    kind: 'ts-enum',
    extensions: TS_EXTENSIONS,
    pattern: '\\b(?:export\\s+)?(?:const\\s+)?enum\\s+\\w+\\s*\\{',
    flags: 'm',
    reads: 'TS enum members',
  },
  {
    kind: 'ts-object-keys',
    extensions: TS_EXTENSIONS,
    pattern: '\\bexport\\s+(?:const|let)\\s+\\w+\\s*(?::\\s*[^=\\n]+)?=\\s*\\{',
    flags: 'm',
    reads: 'keys of an exported object literal',
  },
  {
    kind: 'ts-union',
    extensions: TS_EXTENSIONS,
    pattern: "\\btype\\s+\\w+\\s*=\\s*[^;\\n]*['\"][^'\"\\n]*['\"]\\s*\\|",
    flags: 'm',
    reads: 'string-literal union members',
  },
  {
    kind: 'yaml-keys',
    extensions: YAML_EXTENSIONS,
    pattern: '^[A-Za-z_][\\w.-]*\\s*:',
    flags: 'm',
    reads: 'top-level keys of a YAML document',
  },
  {
    kind: 'yaml-map-keys',
    extensions: YAML_EXTENSIONS,
    pattern: '^[A-Za-z_][\\w.-]*\\s*:\\s*$',
    flags: 'm',
    reads: 'keys under a dotted path in a YAML document',
  },
].map((sig) => {
  // Deep freeze: a mutable (or aliased) extensions array would let a push
  // onto one kind silently rewire every kind sharing the same array.
  if (sig.extensions !== null) Object.freeze(sig.extensions);
  return Object.freeze(sig);
}));
