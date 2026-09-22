/** Exact canonical and authoring grammars for the one-way identity cutover. */

/** New-format allocation kinds; subjects are metadata, not a content store. */
export const CANONICAL_ID_GRAMMARS = Object.freeze(Object.fromEntries(
  Object.entries({ knowledge: 'K', ontology: 'O', decision: 'D', subject: 'S' })
    .map(([kind, prefix]) => [kind, Object.freeze({
      prefix,
      // `$` alone also accepts a position before a final newline in JavaScript.
      pattern: `^${prefix}-(?!000000)[0-9]{6}(?![\\s\\S])$`,
      hint: `${prefix}-000001 through ${prefix}-999999`,
    })]),
));

export const UUID_V4_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/** Authoring references admit proposal keys, never legacy record spellings. */
export const AUTHORING_ID_GRAMMARS = Object.freeze(Object.fromEntries(
  Object.entries(CANONICAL_ID_GRAMMARS).map(([kind, grammar]) => [kind, Object.freeze({
    pattern: `^(?:${grammar.pattern.slice(1, -1)}|proposal:${kind}:${UUID_V4_PATTERN})(?![\\s\\S])$`,
    hint: `${grammar.hint} or proposal:${kind}:<lowercase-v4-uuid>`,
  })]),
));

/** Optional notation is a display label, never an identity or lookup key. */
const knowledge = Object.freeze({ pattern: '^[0-9]+(\\.[0-9]+)*$', hint: 'legacy dotted notation, e.g. "362.1"' });
export const ACCESSION_MIGRATION_HINT = 'the canonical Knowledge identity K-000001 through K-999999; notation never resolves as a citation';

/** Runtime identity grammars remain canonical-only. */
export const ID_GRAMMARS = Object.freeze({
  ontology: CANONICAL_ID_GRAMMARS.ontology,
  knowledge,
  decisions: CANONICAL_ID_GRAMMARS.decision,
  accessions: CANONICAL_ID_GRAMMARS.knowledge,
  'leaf-ref': Object.freeze({ pattern: CANONICAL_ID_GRAMMARS.knowledge.pattern, hint: ACCESSION_MIGRATION_HINT }),
});

/** Schema defs bound to runtime grammars, unless explicitly authoring refs. */
export const SCHEMA_DEFS = Object.freeze({ knowledge: 'notation', 'leaf-ref': 'leafRef', accessions: 'accession' });
export const SCHEMA_REF_KINDS = Object.freeze({ conceptRef: 'ontology', decisionRef: 'decision', leafRef: 'knowledge', accession: 'knowledge' });

/**
 * The compiled matcher for an id space. Anchored by construction (the patterns
 * above carry their own ^/$), cached per space so the hot id-shape loop does
 * not recompile.
 *
 * @param {string} space one of the keys of ID_GRAMMARS
 * @returns {RegExp} the compiled grammar
 */
const compiled = new Map();
export function idPattern(space) {
  let re = compiled.get(space);
  if (!re) {
    const grammar = ID_GRAMMARS[space];
    if (!grammar) {
      throw new TypeError(`unknown id space "${space}" (expected one of: ${Object.keys(ID_GRAMMARS).join(', ')})`);
    }
    re = new RegExp(grammar.pattern);
    compiled.set(space, re);
  }
  return re;
}
