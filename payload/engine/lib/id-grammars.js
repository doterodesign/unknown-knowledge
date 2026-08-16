/**
 * Id grammars (UCS-1142) — one module, one grammar per id space.
 *
 * Every store mints ids in its own shape (§3.5): concepts K-NNN, knowledge
 * leaves dotted notation, decisions D-NNN or a provisional D-YYYY-MM-DD-slug.
 * That shape is checked in two places that must never disagree — the shipped
 * JSON Schemas validate record-level ids, and the structural validator's
 * id-shape check validates catalog rows (plain strings there by design, since
 * a catalog row is a pointer, not a record). It used to be spelled five times:
 * four copy-pasted `$defs/notation` blocks plus a regex literal in the
 * validator, whose human-facing hint travelled separately from the pattern it
 * described. A grammar declared five times is five chances to change four.
 *
 * Here the pattern and the hint are ONE entry, and both consumers read it:
 *
 *   - validate-record.js injects `pattern` into each schema's `$defs` as the
 *     schema documents load, so the engine validates against this module even
 *     though the JSON files carry their own copy (see SCHEMA_DEFS below);
 *   - commands/validate.js compiles `pattern` for the id-shape check and
 *     quotes `hint` in the finding message.
 *
 * The pattern is stored as a STRING, not a RegExp: JSON Schema's `pattern`
 * keyword takes a string, and the validator compiles what it needs. One
 * spelling serves both, so the two can never drift apart.
 *
 * Adding an id space is this module plus its consumers' existing lookups —
 * no schema edit, no second copy (tests/id-grammars.test.js pins that).
 */

/**
 * Store → the id grammar its ids obey (§3.5).
 *
 * `pattern` is an anchored JSON-Schema-flavored regex source; `hint` is the
 * human-facing shape quoted back in findings, and travels WITH the pattern so
 * a grammar change cannot leave the prose describing the old one.
 *
 * @type {Readonly<Record<string, { pattern: string, hint: string }>>}
 */
export const ID_GRAMMARS = Object.freeze({
  ontology: Object.freeze({
    pattern: '^K-[0-9]+$',
    hint: 'K-NNN',
  }),
  knowledge: Object.freeze({
    pattern: '^[0-9]+(\\.[0-9]+)*$',
    hint: 'dotted notation, e.g. "362.1"',
  }),
  decisions: Object.freeze({
    pattern: '^D-([0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)$',
    hint: 'D-NNN or provisional D-YYYY-MM-DD-slug',
  }),
});

/**
 * Which `$defs` name in the shipped schemas each id space owns.
 *
 * The JSON files keep their own `$defs` copies so they stay self-contained for
 * external tools (a cross-file `$ref` is outside the keyword subset the engine
 * interprets, and would break every consumer that reads one schema alone).
 * This map is how the copies stop being a second source of truth: the loader
 * OVERWRITES each named def's pattern with the one above, so a JSON file that
 * drifts is corrected at load rather than silently believed.
 *
 * Only spaces whose grammar appears in a schema `$defs` are listed —
 * ontology/decisions ids reach the schemas through conceptRef/decisionRef and
 * are not part of the leaf-notation seam this ticket settles.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const SCHEMA_DEFS = Object.freeze({
  knowledge: 'notation',
});

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
