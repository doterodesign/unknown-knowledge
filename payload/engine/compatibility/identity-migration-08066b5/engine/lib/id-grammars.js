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

const ontology = Object.freeze({
  pattern: '^K-[0-9]+$',
  hint: 'K-NNN',
});

/**
 * The LEGACY dotted notation (UCS-1147) — a leaf's optional display label.
 *
 * Still a grammar, because the field is still validated when present: a
 * malformed notation is a defect whether or not anything treats it as
 * identity. What it is no longer is an id space anything RESOLVES through —
 * `leaf-ref` does not accept it, and no leaf is indexed by it. The hint says
 * "legacy" out loud, so a finding quoting it cannot read as an invitation to
 * cite this way.
 */
const knowledge = Object.freeze({
  pattern: '^[0-9]+(\\.[0-9]+)*$',
  hint: 'legacy dotted notation, e.g. "362.1"',
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
 *
 * Since UCS-1147 this is a leaf's REQUIRED identity and the only shape a
 * citation of a leaf may take.
 */
const accessions = Object.freeze({
  pattern: '^L-[0-9]{6}$',
  // Says what to write AND why the field is there, because the reader of this
  // hint is most often an author whose leaf predates the contract: the
  // `missing-required` on a leaf's `id` quotes it, and "L-NNNNNN" alone would
  // tell them the shape of a field without saying that it is now the leaf's
  // identity or that assigning one is the migration.
  hint: 'an accession id of the form L-NNNNNN — every leaf mints one as its identity (UCS-1147)',
});

/**
 * What a finding says to an author who cited a leaf the retired way.
 *
 * Lives beside the grammars because it is the human half of the same fact: the
 * pattern says which spellings are legal, and this says what to do about the
 * one that no longer is. Both travel together into every message that quotes
 * them, for the reason this module exists — a hint that drifted from its
 * pattern would send an author to the wrong edit.
 */
export const ACCESSION_MIGRATION_HINT =
  'the leaf\'s accession id (L-NNNNNN); the dotted notation is a legacy display '
  + 'label and no longer resolves as a citation';

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
  ontology,
  knowledge,
  decisions,
  accessions,
  /**
   * What a CITATION of a leaf may look like: an accession, and nothing else
   * (UCS-1147's contract phase).
   *
   * It was a UNION of accession and notation while both spellings were legal
   * (UCS-1144's expand phase), and it narrowed here exactly as that ticket
   * predicted — the migrate batches (UCS-1145, UCS-1146) rewrote every
   * notation-form citation first, so narrowing breaks nothing that was left.
   *
   * It stays a named entry rather than collapsing into `accessions` at every
   * call site, and that is deliberate: `accessions` says what a leaf MINTS and
   * `leaf-ref` says what a record may CITE. Those are two claims that happen to
   * coincide today, and consumers read them by name for the same reason they
   * always did — the day they diverge again is a change to this table, not a
   * sweep through the surfaces that judge citations. The `hint` differs for
   * that reason too: a citation finding names the migration, a minting finding
   * names the shape.
   */
  'leaf-ref': Object.freeze({
    pattern: accessions.pattern,
    hint: ACCESSION_MIGRATION_HINT,
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
 * The three leaf entries stay three defs after UCS-1147 narrowed citations to
 * accessions, and the reason is what they each say rather than what they each
 * match. `accession` is a leaf's identity — required, and what `leafRef` cites.
 * `notation` is the optional LEGACY display label, still dotted-only and still
 * validated when present, because a malformed label is a defect even though
 * nothing resolves through it. `leafRef` and `accession` carry the same pattern
 * today; collapsing them would lose the distinction between what a leaf mints
 * and what a record may cite, which is exactly the distinction that let the
 * expand phase widen citations without ever widening leaf notation itself.
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
