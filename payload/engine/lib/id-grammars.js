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
/**
 * The body of an anchored pattern — what it matches, without its ^ and $.
 *
 * Only `union` below uses it, and only so a union can be COMPOSED from the
 * grammars it accepts instead of restating them. A union that restated its
 * members would be exactly the defect this module exists to remove, one level
 * up: three spellings of the notation grammar, two of which drift silently.
 *
 * @param {string} pattern an anchored pattern source
 * @returns {string} the same pattern with its anchors stripped
 */
const body = (pattern) => pattern.replace(/^\^/, '').replace(/\$$/, '');

/**
 * An anchored alternation over other grammars' patterns, with the hints joined
 * the way a finding should read them.
 *
 * Each alternative is parenthesized before joining: `a|b` and `c` must compose
 * to `^((a|b)|c)$`, never `^(a|b|c)$` — same language here, but not in general,
 * and a union that is only accidentally right is a trap for the next member.
 *
 * @param {Array<{ pattern: string, hint: string }>} members grammars to accept
 * @param {string} conjunction how the hints read when joined ('or')
 * @returns {{ pattern: string, hint: string }} the composed grammar
 */
const union = (members, conjunction) => Object.freeze({
  pattern: `^(${members.map((m) => `(${body(m.pattern)})`).join('|')})$`,
  hint: members.map((m) => m.hint).join(` ${conjunction} `),
});

const ontology = Object.freeze({
  pattern: '^K-[0-9]+$',
  hint: 'K-NNN',
});

const knowledge = Object.freeze({
  pattern: '^[0-9]+(\\.[0-9]+)*$',
  hint: 'dotted notation, e.g. "362.1"',
});

const decisions = Object.freeze({
  pattern: '^D-([0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)$',
  hint: 'D-NNN or provisional D-YYYY-MM-DD-slug',
});

/**
 * A leaf's accession id (UCS-1144) — opaque, minted at PR time, never reused,
 * never positional. Six digits is the mint width the K-/D- conventions imply
 * read at library scale; it is FIXED, unlike K-NNN, because an accession
 * carries no structure to grow into: L-000001 and L-1 would be two spellings
 * of one identity, and "never reused" cannot survive two spellings.
 */
const accessions = Object.freeze({
  pattern: '^L-[0-9]{6}$',
  hint: 'L-NNNNNN',
});

export const ID_GRAMMARS = Object.freeze({
  ontology,
  knowledge,
  decisions,
  accessions,
  /**
   * What a CITATION of a leaf may look like — either shape, for as long as
   * both are legal (UCS-1144's expand phase). Distinct from `accessions` and
   * `knowledge`, which each say what one id space MINTS: a leaf mints exactly
   * one identity, but a reference to it may spell either, so the minting
   * grammars stay strict while this one widens. When the migrate batches
   * finish and notation is retired, this narrows to `accessions` alone and
   * every consumer follows, because they all read it from here.
   */
  'leaf-ref': union([accessions, knowledge], 'or'),
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
 * The two leaf entries are the whole shape of UCS-1144's expand phase, and the
 * reason they are separate defs. `notation` is what a leaf MINTS as its
 * positional id, and it stays dotted-only. `leafRef` is what a record may
 * CITE a leaf as, and it accepts either shape while both are legal. They were
 * one def before this ticket, which is precisely why widening citations would
 * otherwise have widened leaf notation itself — letting a leaf mint `L-000001`
 * into the `notation` field and quietly hold two identities at once.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const SCHEMA_DEFS = Object.freeze({
  knowledge: 'notation',
  'leaf-ref': 'leafRef',
  accessions: 'accession',
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
