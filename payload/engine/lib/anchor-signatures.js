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
 * Sorted by kind; frozen — extending the kind set is a KK-08/09-style change
 * with fixtures, never an in-session edit (D-005).
 */
const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const YAML_EXTENSIONS = ['.yaml', '.yml'];

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
    extensions: ['.strings', '.xcstrings'],
    pattern: '^\\s*"[^"\\n]+"\\s*=\\s*"',
    flags: 'm',
    reads: 'localization keys of a .strings/.xcstrings table',
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
].map(Object.freeze));
