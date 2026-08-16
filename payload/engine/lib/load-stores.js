/**
 * Store loader (KK-04) — the engine's single shared substrate (PRD §4).
 *
 * Parses all three stores (ontology, knowledge, decisions) from a kit root
 * directory ONCE into an indexed in-memory model, with diagnostics on one
 * error/warning scale. Every downstream surface — structural validator
 * (KK-05), value validator (KK-07), audit (KK-12), resolver (KK-06),
 * preflight (KK-26) — consumes these same diagnostics: the single-health-model
 * guarantee that validator, audit, and preflight can never disagree.
 *
 * Layout loaded (PRD §9.1):
 *   ontology/   _catalog.yaml  _rules.yaml  classes/*.yaml   (concept records)
 *   knowledge/  _catalog.yaml  _rules.yaml  **\/*.md          (leaf = YAML front
 *                                                             matter + markdown body)
 *   decisions/  _catalog.yaml  entries/*.yaml                (decision records)
 *   <store>/    _registries/*.yaml                          (governed vocabularies,
 *                                                            UCS-1148 — optional;
 *                                                            also the trust
 *                                                            graduation category
 *                                                            table, UCS-1155)
 *
 * Which files a store carries is DATA, not control flow: STORE_DESCRIPTORS
 * below is the table, so a registry is a declared file class rather than a
 * fourth bespoke reader.
 *
 * Model shape (all collections deterministically sorted — PRD §5 diffability):
 *   {
 *     root,                     // absolute root the stores were loaded from
 *     stores: { ontology|knowledge|decisions:
 *       { present, catalog, rules, files } },   // parsed docs (null if absent),
 *                                               // record files root-relative
 *     concepts:  Map id       -> { id, file, record },
 *     leaves:    Map accession -> { identity, id, notation, file, record, body },
 *                               // `identity` is the neutral id key consumers
 *                               // read (UCS-1142); since UCS-1147 it is the
 *                               // leaf's accession and nothing else. `id` and
 *                               // `notation` are the two public wire names —
 *                               // `id` the accession, `notation` the OPTIONAL
 *                               // LEGACY display label, null when absent and
 *                               // never an identity anything resolves through
 *     decisions: Map id       -> { id, file, record },
 *     registries: Map "<store>/<name>" ->
 *                  { name, store, file, hierarchical, minted:Set, suppressed:Set },
 *                               // governed vocabularies (UCS-1148): the closed
 *                               // value sets facets draw from. Membership is a
 *                               // structural-validator check (KK-05), never a
 *                               // schema enum — the vocabulary grows by steward
 *                               // review, not by an engine release
 *     graduations: Map "<store>/<table>" ->
 *                  { table, store, file, categories:Map name->row },
 *                               // trust graduation category tables (UCS-1155):
 *                               // which change categories may graduate from
 *                               // full inspection to sampling and which are
 *                               // permanently gated. Autonomy is per CATEGORY,
 *                               // never per leaf, so this table is what a
 *                               // graduation or revocation entry is held against
 *     phoenix:   Map "<store>/<event>" ->
 *                  { event, store, file, decision, scope, rows:Map id->row },
 *                               // retained phoenix event mappings (UCS-1154):
 *                               // the record of a bulk re-taxonomy that already
 *                               // happened, kept so the validator can hold every
 *                               // non-1 edition against a sanctioning event
 *                               // without reading git history
 *     pointers:  Map source-of-truth path -> [concept ids],  // KK-06 --paths
 *     leavesByConcept: Map concept id -> [leaf identities],
 *                               // the leaf→concept edge derived in REVERSE at
 *                               // load (UCS-1151). Declared leaf-side, walked
 *                               // from either end: resolving a concept surfaces
 *                               // its declaring leaves structurally, with no
 *                               // dependence on whether any term text matches
 *     refs:      [{ from, type, to, file, path, resolved }], // cross-ref graph
 *     diagnostics: [{ severity, code, file, path, message }],
 *     ok,                       // true iff no error-severity diagnostic
 *   }
 *
 * Diagnostics (severity 'error' | 'warning'), stable-sorted by file/path/code:
 *   parse-error        error    unparseable YAML, multi-doc file, or a leaf
 *                               without front matter
 *   <validate-record>  error    every schema/convention code from KK-02
 *                               (missing-required, non-string-enumerates-value,
 *                               …) carried through unchanged — including the
 *                               §3.5 YAML-coercion hard error: files are parsed
 *                               with scalar types intact (js-yaml YAML 1.2 core
 *                               schema), so true/1.0/null enumerates values are
 *                               detected as non-strings, never stringified
 *   duplicate-id       error    same id minted twice across (or within) files
 *   unresolved-ref     error    typed ref to an id that neither loaded as an
 *                               entry nor is declared in the target store's
 *                               catalog (catalog-declared ids with pending
 *                               files resolve — the catalog never implies a
 *                               recorded id is absent; file-pointer resolution
 *                               is KK-05's check)
 *   missing-store      warning  store directory absent (pre-init / partial
 *                               repos load well-defined; post-init repos always
 *                               have all three)
 *   missing-catalog    error    store directory present without _catalog.yaml
 *                               (the navigational entry point, PRD §3)
 *   registry-name-mismatch
 *                      error    a registry's declared name disagrees with its
 *                               filename, so a finding could not name both the
 *                               registry and the file a steward opens (UCS-1148)
 *   registry-store-mismatch
 *                      error    a registry's declared store disagrees with the
 *                               directory it sits in (UCS-1148)
 *   duplicate-registry-value
 *                      error    one value declared twice in a registry —
 *                               redundantly, or as both minted AND suppressed,
 *                               which the engine must never settle by file
 *                               order (UCS-1148)
 *
 * A nonexistent/unreadable root THROWS — an engine failure (exit-code 2
 * territory, PRD §5), never a silent diagnostic.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load, YAMLException } from 'js-yaml';
import { validateStoreFile, ERROR_CODES, compare } from './validate-record.js';
// The accession grammar, from the one module that owns it (UCS-1142) — the same
// source the schemas bind to, so what the loader will INDEX and what the
// validator will ACCEPT can never be two different notions of a leaf id.
import { idPattern } from './id-grammars.js';
import { UsageError } from './usage-error.js';

export const SEVERITIES = Object.freeze(['error', 'warning']);

/**
 * The field holding a leaf's LEGACY dotted notation (UCS-1142, UCS-1147).
 *
 * Named ONCE, here. It was the leaf's id field; since the contract phase it is
 * an optional display label that nothing treats as identity and no citation
 * resolves through. It is still read in one place — the loader copies it onto
 * the indexed entry — because it remains a PUBLISHED resolver field (§4), and
 * a published field needs a single spelling as much as an id space does.
 */
export const LEAF_ID_FIELD = 'notation';

/**
 * The field a knowledge leaf mints its ACCESSION id in (UCS-1144).
 *
 * An accession is opaque, minted at PR time, never reused, never positional —
 * everything a dotted notation is not. Since UCS-1147 every leaf carries one
 * and it IS the leaf's identity: the only key the store indexes by, and the
 * only spelling any record may cite it as.
 */
export const LEAF_ACCESSION_FIELD = 'id';

/**
 * A leaf's identity: its accession, and nothing else (UCS-1147).
 *
 * The contract phase's whole shape, in one function. A leaf IS its accession —
 * that is what every consumer reads, reports, indexes and serializes, and it is
 * the only spelling a citation may reach it by. The expand phase (UCS-1144) let
 * this fall back to the notation for a leaf that had not been minted one yet,
 * and returned a second `keys` list of alternate spellings so notation-form
 * citations kept resolving while the migrate batches ran. Both are gone: the
 * migrations finished, the accession is required, and a leaf answers to exactly
 * one name again.
 *
 * A leaf with NO accession therefore has no identity, and this says so by
 * returning `undefined` rather than reaching for the notation. That is the
 * honest answer and it is also the useful one: indexRecord declines a
 * non-string id, so an unaccessioned leaf simply does not enter the index, and
 * the schema's `missing-required` on `id` is the finding the author acts on.
 * Falling back to the notation would instead index the leaf under a spelling
 * nothing may cite — present in every enumeration, reachable by no reference.
 *
 * The id is checked against the ACCESSION GRAMMAR, not merely for being a
 * string, and that is load-bearing rather than defensive. The index is what ref
 * resolution consults, so whatever key a leaf lands under becomes a spelling
 * that RESOLVES. A leaf carrying `id: "700.2"` would otherwise take identity
 * under its own notation and quietly restore the dual-shape contract this
 * ticket retired: the schema would report both records, and the citation would
 * resolve anyway — the two mechanisms disagreeing about whether a notation is a
 * citation. Refusing the malformed id here keeps one answer. The defect is
 * already reported (a `pattern-mismatch` on the leaf's `id`, and `id-shape` on
 * any catalog row naming it), so this adds no finding; it only declines to
 * build an index entry on top of a value no check approved.
 *
 * Non-string and malformed ids are dropped rather than coerced — KK-02 already
 * diagnoses both, and a coerced key would index a leaf under a spelling no
 * author ever wrote.
 *
 * @param {object} record a parsed leaf front matter
 * @returns {string|undefined} the leaf's identity, or undefined when it mints none
 */
export function leafIdentity(record) {
  const accession = record[LEAF_ACCESSION_FIELD];
  return typeof accession === 'string' && idPattern('accessions').test(accession)
    ? accession
    : undefined;
}

/**
 * The id of one indexed record, whatever store it came from.
 *
 * Concepts and decisions carry `id`, leaves carry `identity` — one accessor,
 * so a consumer that walks all three spaces (catalog checks, orphan checks)
 * never names a store-specific field. The Map key is the same value; this is
 * for the code paths that hold the entry rather than the pair.
 *
 * @param {{ id?: string, identity?: string }} entry an indexed record
 * @returns {string|undefined} the record's id
 */
export const recordId = (entry) => entry.identity ?? entry.id;

export const DIAGNOSTIC_CODES = Object.freeze([
  ...ERROR_CODES,
  'parse-error',
  'read-error',
  'duplicate-id',
  'unresolved-ref',
  'skipped-file',
  'missing-store',
  'missing-catalog',
  'missing-rules',
  'registry-name-mismatch',
  'registry-store-mismatch',
  'duplicate-registry-value',
  'phoenix-name-mismatch',
  'duplicate-phoenix-row',
  'graduation-table-name-mismatch',
  'graduation-table-store-mismatch',
  'duplicate-graduation-category',
  'graduation-threshold-shape',
]);

/**
 * Freeze a ref-field table through every level it has: the table, each kind's
 * row array, each row, and an array-form field path. `Object.freeze` is
 * shallow, so freezing only the outer object would leave every row writable —
 * and a mutated row is a silently rewritten cross-reference graph.
 *
 * @template {Record<string, Array<{ field: string|string[], space: string }>>} T
 * @param {T} table the declaration table
 * @returns {Readonly<T>} the same table, frozen all the way down
 */
function deepFreezeTable(table) {
  for (const rows of Object.values(table)) {
    for (const row of rows) {
      if (Array.isArray(row.field)) Object.freeze(row.field);
      Object.freeze(row);
    }
    Object.freeze(rows);
  }
  return Object.freeze(table);
}

/**
 * Typed cross-references per store record shape (§3.1–3.3): field path → id space.
 *
 * This table IS the cross-reference graph. Every typed edge the engine knows
 * about is a row here, and `collectRefs`/`resolveRefs` are generic over it —
 * so a new edge is a new declaration, never a bespoke check bolted onto the
 * walker. That property is what the rest of the frontmatter-v2 work leans on:
 * `relates.depends-on`, `relates.contradicts` and friends arrive as rows.
 *
 * A `field` is a path of object keys ending at an ARRAY of id strings, spelled
 * either as a dotted string ('relates.depends-on') or as an array of segments
 * (['relates', 'depends-on']). Depth is arbitrary — one level, two, or the
 * three that v2's nested `relates` map needs — because the walker descends the
 * segments rather than destructuring a fixed `[head, tail]` pair, which is all
 * it used to handle. Segments containing a literal dot must use the array form.
 *
 * The declared path doubles as the edge's `type` (a published field on
 * `model.refs`, quoted in the unresolved-ref message), so it always reads as
 * the dotted path an author would find in their own file.
 *
 * A row may set `scalar: true` for a field holding ONE id rather than a list
 * (UCS-1155's `graduation.revokes`). It is declared rather than inferred from
 * the value's runtime type: sniffing would silently accept `supersedes: D-001`
 * — a field whose contract is a list — and index it as a working edge, turning
 * a shape error into a reference that appears to resolve.
 *
 * Frozen all the way down (rows, and any array-form path): the table is a
 * declaration every surface reads, so a consumer that could mutate a row would
 * be rewriting the cross-reference graph out from under the loader.
 *
 * @type {Readonly<Record<string, ReadonlyArray<{ field: string|string[], space: string, scalar?: boolean }>>>}
 */
export const REF_FIELDS = deepFreezeTable({
  'ontology-concept': [
    { field: 'used-by', space: 'concepts' },
    { field: 'confusable-with', space: 'concepts' },
    { field: 'rationale', space: 'decisions' },
  ],
  'knowledge-leaf': [
    { field: 'cross-references.class-elsewhere', space: 'leaves' },
    { field: 'cross-references.see-also', space: 'leaves' },
    // Typed edges (UCS-1151). `concepts` is the leaf→ontology edge, declared
    // leaf-side because deciding what a leaf is ABOUT is curatorial and the
    // leaf is what sits under the human write gate; the loader derives the
    // reverse direction at load (leavesByConcept). The four `relates` rows are
    // the leaf→leaf edge kinds, each a distinct claim, each reaching the leaf
    // space — which is what the prefactor's arbitrary-depth walker was built
    // for. Note what is NOT here: `paths` names the working tree rather than an
    // id space, so it cannot be a ref row (see checkLeafPaths in validate.js).
    { field: 'concepts', space: 'concepts' },
    { field: 'relates.depends-on', space: 'leaves' },
    { field: 'relates.see-also', space: 'leaves' },
    { field: 'relates.contradicts', space: 'leaves' },
    { field: 'relates.supersedes', space: 'leaves' },
  ],
  'decision-entry': [
    { field: 'supersedes', space: 'decisions' },
    { field: 'superseded-by', space: 'decisions' },
    { field: 'relates-to.concepts', space: 'concepts' },
    { field: 'relates-to.leaves', space: 'leaves' },
    { field: 'relates-to.decisions', space: 'decisions' },
    // A revocation names the graduation it withdraws (UCS-1155) — ONE id, so
    // the row is `scalar`. Declared here rather than checked bespokely, so a
    // revocation citing no real graduation is the same `unresolved-ref` error
    // it would be anywhere else, and the withdrawal stays connected in the
    // record to the thing it withdrew.
    { field: 'graduation.revokes', space: 'decisions', scalar: true },
  ],
});

/**
 * The leaf→leaf edge KINDS, in the order a neighborhood presents them
 * (UCS-1151), and the field the map itself lives under.
 *
 * Read from REF_FIELDS rather than restated, so the kinds a resolver expands
 * over and the kinds the ref graph resolves are the same list by construction.
 * Declaring a fifth kind is one more row in the table above; nothing here, and
 * nothing in the resolver, has to learn about it.
 *
 * Order is the DECLARATION order, deliberately not alphabetical: `depends-on`
 * before `see-also` before `contradicts` before `supersedes` is a rough reading
 * of how load-bearing each edge is, and the table is where that judgement is
 * recorded. Output within each kind is sorted; the kinds themselves keep this
 * order, so a neighborhood is stable without being arbitrary.
 */
export const RELATES_FIELD = 'relates';
export const RELATES_KINDS = Object.freeze(
  REF_FIELDS['knowledge-leaf']
    .map(({ field }) => (Array.isArray(field) ? field : field.split('.')))
    .filter((segments) => segments.length === 2 && segments[0] === RELATES_FIELD)
    .map((segments) => segments[1]),
);

/**
 * The leaf field holding repo-tree paths (UCS-1151) — named once, here.
 *
 * Two surfaces read it and they must never disagree about the spelling: the
 * validator checks each path EXISTS, and the resolver joins reverse lookups
 * over the same list. A rename that reached one and not the other would leave
 * paths reverse-looked-up but unchecked, or checked but unreachable — either
 * way a seam that silently half-works.
 */
export const LEAF_PATHS_FIELD = 'paths';

/**
 * The concepts one leaf declares (UCS-1151) — the single reader of the leaf's
 * `concepts` spelling, for the same reason `leafStage` is for `facets.stage`.
 *
 * Non-strings are dropped rather than coerced: KK-02 already diagnoses the
 * wrong type, and a coerced id would join a leaf to a concept nobody named.
 *
 * @param {object} record a leaf's front-matter record
 * @returns {string[]} the declared concept ids, in authored order
 */
export function leafConcepts(record) {
  const declared = record?.concepts;
  return Array.isArray(declared) ? declared.filter((id) => typeof id === 'string') : [];
}

/** The id spaces a ref row may target, and the store each one is declared in. */
const SPACE_TO_STORE = Object.freeze({
  concepts: 'ontology',
  leaves: 'knowledge',
  decisions: 'decisions',
});

/**
 * The subdirectory a store keeps its governed vocabulary REGISTRIES in
 * (UCS-1148), and the extension those files carry.
 *
 * Underscore-prefixed like `_catalog.yaml` and `_rules.yaml`, and for the same
 * reason: it is governed store META, not a record. `listFiles` already skips
 * every `_`-prefixed entry, so the record walks cannot see registries and a
 * registry can never be mistaken for a leaf — the naming grammar does the
 * separating, with no exception list to keep in sync.
 */
/**
 * The derived layer's directory name (UCS-1158) — declared HERE, where the
 * loader that must ignore it lives.
 *
 * The derived layer is engine output: plural browse trees, synthesized call
 * numbers, a resolution index. It is regenerable and disposable, and the
 * property that makes those words true is that nothing reads it back. The
 * loader is the surface that would break that first — browse trees are markdown
 * files under `knowledge/`, exactly like leaves — so the name lives beside the
 * walk that skips it rather than in lib/derived.js, which would make the loader
 * import the layer it is supposed to be independent of.
 *
 * lib/derived.js re-exports this so the generating side and the ignoring side
 * name one string.
 */
export const DERIVED_DIR = 'derived';

export const REGISTRY_DIR = '_registries';
const REGISTRY_EXTENSION = '.yaml';

/**
 * Where a store keeps its phoenix event mappings (UCS-1154).
 *
 * `_`-prefixed for the same reason `_registries` is: the record walks skip
 * every underscore entry, so an event mapping can never be mistaken for a
 * leaf. The mappings are RETAINED in the store after the event applies,
 * because they are what lets the structural validator confirm — from the
 * working tree alone, with no git history — that every non-1 edition was
 * sanctioned by a phoenix event rather than typed by hand.
 */
export const PHOENIX_DIR = '_phoenix';
const PHOENIX_EXTENSION = '.yaml';

/**
 * The trust graduation category table's file class (UCS-1155).
 *
 * It lives in `_registries/` rather than a directory of its own, and that is a
 * deliberate reading of what it IS: a governed table declaring a closed
 * vocabulary — the change categories autonomy may ever be scoped to — with a
 * warrant and a Decisions entry per row, which is precisely a registry's shape.
 * A second directory would have split one governance idea across two file
 * classes for no gain a steward can see.
 *
 * It is a distinct KIND inside that directory because it answers a different
 * question. A vocabulary registry says which values a facet may take; this
 * table says how much INSPECTION a class of change gets, and carries an
 * eligibility and a threshold no registry row has. Loading it as a registry
 * would have meant either bending the registry schema to hold graduation
 * fields, or letting the table pass unvalidated — so the file class is shared
 * and the schema is not, keyed off the document's own `table` key.
 *
 * The table is filed under DECISIONS because graduation governs the change
 * process rather than the knowledge: the truth anchor is the team (D-003).
 */
export const GRADUATION_TABLE_KEY = 'table';
const GRADUATION_EXTENSION = '.yaml';

/**
 * Per-store file-class descriptors (UCS-1148) — what a store IS, as data.
 *
 * The loader used to carry each store's shape in its control flow: which
 * directory the records sit in, which extension they wear, whether the walk
 * recurses, whether a `_rules.yaml` is expected, and a `store !== 'decisions'`
 * ternary at the call site. Adding registries as a fourth bespoke code path
 * would have been the fifth place a store's shape is spelled, so the shape
 * moved here instead: a store is a row, a registry is a declared file class,
 * and `loadStores` reads the table rather than knowing the stores.
 *
 *   dir         the store directory, root-relative (also the store's name)
 *   records     how the record files are found and read, or null for a store
 *               whose records are loaded by a bespoke reader (knowledge leaves
 *               are front matter + body, which is a parser, not a descriptor)
 *   reader      names that bespoke reader in BESPOKE_READERS, for a store with
 *               no `records` shape — so "how is this store read" stays a fact
 *               in the table rather than a branch in the load loop
 *     subdir      where under the store the record files live
 *     kind        the KK-02 record kind each file validates as
 *     space       the id space the records index into
 *     extension   the file extension the walk reads
 *     recursive   whether the walk descends into subdirectories
 *   rules       whether the store declares a `_rules.yaml` (decisions does
 *               not, by design — §9.1)
 *   registries  whether the store may carry `_registries/*.yaml`
 *   phoenix     whether the store may carry `_phoenix/*.yaml` — the retained
 *               event mappings a bulk re-taxonomy leaves behind (UCS-1154)
 *
 * Frozen: every surface reads this table, so a consumer able to mutate a row
 * would be redefining a store's shape out from under the loader.
 *
 * @type {Readonly<Record<string, Readonly<object>>>}
 */
export const STORE_DESCRIPTORS = Object.freeze({
  ontology: Object.freeze({
    dir: 'ontology',
    records: Object.freeze({
      subdir: 'classes', kind: 'ontology-concept', space: 'concepts',
      extension: '.yaml', recursive: false,
    }),
    rules: true,
    registries: true,
  }),
  knowledge: Object.freeze({
    dir: 'knowledge',
    // Leaves are YAML front matter plus a markdown body — a parse shape, not a
    // walk shape, so no `records` descriptor can express them. `reader` names
    // the bespoke loader instead, which keeps the branch in the TABLE rather
    // than in the load loop: the loop asks each store how it is read and never
    // learns that one store is special.
    records: null,
    reader: 'loadLeafFiles',
    rules: true,
    registries: true,
    // Only knowledge carries phoenix events: an event re-taxonomizes LEAVES,
    // and the leaves live here.
    phoenix: true,
  }),
  decisions: Object.freeze({
    dir: 'decisions',
    records: Object.freeze({
      subdir: 'entries', kind: 'decision-entry', space: 'decisions',
      extension: '.yaml', recursive: false,
    }),
    rules: false, // §9.1: decisions has no _rules.yaml
    registries: true,
  }),
});

/** The store directories the loader walks, in load order. */
export const STORES = Object.freeze(Object.keys(STORE_DESCRIPTORS));

/**
 * The stores that may carry phoenix events, derived from the descriptors
 * (UCS-1154).
 *
 * DERIVED, never restated. The loader reads `descriptor.phoenix` to decide
 * where to look for mappings; a consumer that hardcoded "knowledge" instead
 * would keep working right up until a second store gained the flag, at which
 * point that store's events would load into `model.phoenix` and be unreachable
 * from the command line — present in the model, absent from every lookup. One
 * table decides, and everything asks it.
 */
export const PHOENIX_STORES = Object.freeze(
  STORES.filter((store) => STORE_DESCRIPTORS[store].phoenix),
);

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function sortedMap(map) {
  return new Map([...map.entries()].sort((a, b) => compare(a[0], b[0])));
}

/** Parse one YAML document with scalar types intact (§3.5 coercion trap). */
function parseYaml(ctx, file, text) {
  try {
    return { doc: load(text, { filename: file }) };
  } catch (error) {
    const reason = error instanceof YAMLException ? error.reason ?? error.message : error.message;
    ctx.diagnostics.push({
      severity: 'error', code: 'parse-error', file, path: '',
      message: `unparseable YAML: ${reason}`,
    });
    return null;
  }
}

/** Validate a store file via KK-02 and map its errors onto the one scale. */
function validateInto(ctx, kind, file, doc) {
  const { ok, errors } = validateStoreFile(kind, doc);
  for (const { path, code, message } of errors) {
    ctx.diagnostics.push({ severity: 'error', code, file, path, message });
  }
  return ok;
}

/**
 * Index one record by id; the second mint of an id is a duplicate-id error.
 *
 * @returns {boolean} whether the record took the id. A caller with further
 *   indexing to do for the same record must check: a record that LOST a
 *   collision owns nothing, and anything else indexed in its name would be
 *   filed under the winner (see loadLeafFiles).
 */
function indexRecord(ctx, space, id, file, path, entry) {
  if (typeof id !== 'string') return false; // shape defects already diagnosed by KK-02
  const existing = ctx[space].get(id);
  if (existing) {
    ctx.diagnostics.push({
      severity: 'error', code: 'duplicate-id', file, path,
      message: `id "${id}" is already minted in ${existing.file} — published ids are immutable; the later PR renumbers its own entry (§3.5)`,
    });
    return false;
  }
  ctx[space].set(id, entry);
  return true;
}

/**
 * The segments of a declared ref field path. Dotted strings are the ordinary
 * spelling; the array form exists for a segment that contains a literal dot.
 *
 * @param {string|string[]} field as declared in REF_FIELDS
 * @returns {string[]} the object keys to descend, outermost first
 */
const fieldSegments = (field) => (Array.isArray(field) ? field : field.split('.'));

/**
 * The author-facing spelling of a declared path — the edge's `type`, and the
 * stem of the `path` a finding quotes.
 *
 * Deliberately a plain dotted join, with NO escaping. This string's whole job
 * is to be findable: an author reading `cross-references.see-also[0]` searches
 * their own file for exactly that. An escaped rendering (`v1\.2.refs[0]`)
 * would match nothing they wrote, so escaping would trade a real, everyday
 * cost against a collision that only two DECLARATIONS can create.
 *
 * That collision is instead refused at the source (assertDistinctPaths): two
 * rows like ['a.b','c'] and ['a','b.c'] would render identically, and the fix
 * is to reject the ambiguous TABLE, not to disfigure every finding message.
 *
 * @param {string[]} segments the declared segments
 * @returns {string} the dotted path as an author would find it in their file
 */
const pathLabel = (segments) => segments.join('.');

/**
 * Refuse a ref-field table in which two rows render the same author-facing
 * path — an engine failure at load, never a silent diagnostic.
 *
 * Only the array form can cause this (a segment carrying a literal dot), and
 * only against another row of the same record kind. Two indistinguishable
 * edges would make a finding ambiguous about which declaration it came from,
 * so the table is refused rather than believed: shipping it would be a check
 * whose output cannot be acted on (PRD §5).
 *
 * @param {Record<string, ReadonlyArray<{ field: string|string[] }>>} table
 * @throws {Error} if any record kind declares two rows with the same rendering
 */
export function assertDistinctPaths(table) {
  for (const [kind, rows] of Object.entries(table)) {
    const seen = new Map();
    for (const { field } of rows) {
      const label = pathLabel(fieldSegments(field));
      const previous = seen.get(label);
      if (previous !== undefined) {
        throw new Error(
          `ref-field table for "${kind}" declares two edges that render the same path "${label}" `
          + `(${JSON.stringify(previous)} and ${JSON.stringify(field)}) — findings could not say which edge they came from; `
          + 'spell one of them so the rendered paths differ',
        );
      }
      seen.set(label, field);
    }
  }
}

// The shipped table is checked as this module loads: an ambiguous declaration
// is a defect in the kit itself, and must surface the moment it is introduced
// rather than as a confusing finding in somebody's repo.
assertDistinctPaths(REF_FIELDS);

/**
 * Follow a declared field path into one record, at any depth.
 *
 * Returns the value at the end of the path, or undefined if any intermediate
 * segment is missing or is not an object — a record that simply does not carry
 * the edge is the common case, not a defect, and shape defects at the leaf are
 * already diagnosed by KK-02. The caller decides what a non-array end means.
 *
 * @param {object} record the parsed record
 * @param {string[]} segments object keys to descend, outermost first
 * @returns {unknown} the value at the path's end, or undefined
 */
function valueAtPath(record, segments) {
  let node = record;
  for (const segment of segments) {
    if (!isObject(node)) return undefined;
    node = node[segment];
  }
  return node;
}

/**
 * The typed ref edges one record declares — the whole ref-graph walker.
 *
 * Generic over the DECLARATION at any depth: it descends the declared segments,
 * so a nested map of typed arrays (frontmatter v2's `relates`) walks the same
 * code path as a top-level array. Both the edge's `type` and its `path` are
 * built from the declaration, which is why introducing an edge is adding a row
 * to REF_FIELDS and nothing else — there is no per-edge branch to extend.
 *
 * Pure: it takes the rows rather than reaching for REF_FIELDS, and returns
 * edges rather than pushing into the loader's context. That is what lets a
 * test drive a synthetic record kind through the real walker without a fake
 * edge being added to the shipped table (tests/load-stores.test.js).
 *
 * Non-string members are skipped: KK-02 already diagnoses the wrong type, and
 * a second complaint from the ref graph would double-report one defect.
 *
 * @param {ReadonlyArray<{ field: string|string[], space: string }>} rows the
 *   declared edges for this record kind
 * @param {object} record the parsed record to read edges out of
 * @param {{ from: string, file: string, basePath?: string }} origin what the
 *   edges are attributed to — the record's id, its file, and the path prefix
 *   the record sits at within that file ('' for a one-record file)
 * @returns {Array<{ from, type, to, file, path, space }>} edges in declaration
 *   order, then array order
 */
export function refEdges(rows, record, { from, file, basePath = '' }) {
  const edges = [];
  for (const { field, space, scalar } of rows) {
    const segments = fieldSegments(field);
    const value = valueAtPath(record, segments);
    const type = pathLabel(segments);
    // A `scalar` row holds ONE id rather than a list. Declared on the row, not
    // sniffed from the value: inferring "array means list, string means scalar"
    // would silently accept `supersedes: D-001` — a field whose whole contract
    // is a list — and index it as a resolvable edge, so a shape error would
    // read as a working reference (KK-02 diagnoses the wrong type instead).
    if (scalar) {
      if (typeof value !== 'string') continue; // absent, or a wrong-type KK-02 diagnosed
      edges.push({
        from, type, to: value, file,
        path: basePath ? `${basePath}.${type}` : type,
        space,
      });
      continue;
    }
    if (!Array.isArray(value)) continue;
    value.forEach((to, i) => {
      if (typeof to !== 'string') return; // wrong-type already diagnosed
      const path = basePath ? `${basePath}.${type}[${i}]` : `${type}[${i}]`;
      edges.push({ from, type, to, file, path, space });
    });
  }
  return edges;
}

/** Collect one record's declared edges into the loader's graph. */
function collectRefs(ctx, kind, from, file, basePath, record) {
  ctx.refs.push(...refEdges(REF_FIELDS[kind], record, { from, file, basePath }));
}

/**
 * Read one store file. Only a genuinely absent file returns null; any other
 * failure (permissions, I/O) is an engine-visible read-error — an unread
 * file must never masquerade as a missing or malformed one (PRD §5).
 */
function readText(ctx, file) {
  try {
    return readFileSync(join(ctx.root, file), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      ctx.diagnostics.push({
        severity: 'error', code: 'read-error', file, path: '',
        message: `cannot read file: ${error.message}`,
      });
    }
    return null;
  }
}

/**
 * One pipeline for every store meta file: read → parse → validate → assign.
 *
 * `kind` may be a function of the PARSED document rather than a fixed string,
 * for a directory holding more than one kind (`_registries/` carries both the
 * vocabulary registries and the trust graduation category table, UCS-1155).
 * Dispatching inside the pipeline keeps one read and one parse: a caller that
 * peeked at the file first to choose a kind would read every registry twice and
 * could diagnose a parse error twice with it.
 */
function loadMetaFile(ctx, file, kind, { onMissing, onParsed } = {}) {
  const text = readText(ctx, file);
  if (text === null) {
    onMissing?.();
    return null;
  }
  const parsed = parseYaml(ctx, file, text);
  if (!parsed) return null;
  const resolvedKind = typeof kind === 'function' ? kind(parsed.doc) : kind;
  const valid = validateInto(ctx, resolvedKind, file, parsed.doc);
  onParsed?.(parsed.doc, valid, resolvedKind);
  return valid ? parsed.doc : null;
}

function loadCatalogAndRules(ctx, store, hasRules) {
  const meta = ctx.stores[store];
  meta.catalog = loadMetaFile(ctx, `${store}/_catalog.yaml`, 'catalog', {
    onMissing: () => ctx.diagnostics.push({
      severity: 'error', code: 'missing-catalog', file: `${store}/_catalog.yaml`, path: '',
      message: `store "${store}" has no _catalog.yaml — the navigational entry point every store shares (PRD §3)`,
    }),
    // Harvest declared ids from every id-bearing row even when the catalog
    // has schema defects elsewhere: one bad row must not turn every ref to a
    // validly declared pending id into a spurious unresolved-ref cascade.
    onParsed: (doc) => {
      if (!isObject(doc) || !Array.isArray(doc.entries)) return;
      for (const entry of doc.entries) {
        if (isObject(entry) && typeof entry.id === 'string') ctx.declared[store].add(entry.id);
      }
    },
  });
  if (hasRules) {
    meta.rules = loadMetaFile(ctx, `${store}/_rules.yaml`, 'rules', {
      onMissing: () => ctx.diagnostics.push({
        severity: 'warning', code: 'missing-rules', file: `${store}/_rules.yaml`, path: '',
        message: `store "${store}" has no _rules.yaml (§9.1) — rules-dependent surfaces have no input`,
      }),
    });
  }
}

/**
 * Load one store's governed vocabulary registries (UCS-1148).
 *
 * A registry is a DECLARED FILE CLASS, reached through the store descriptor,
 * not a fourth bespoke reader: the same read → parse → validate pipeline every
 * store meta file rides, pointed at `<store>/_registries/*.yaml`.
 *
 * Registry ABSENCE is deliberately not diagnosed here, and that is the ticket's
 * central conduct choice. A store with no registries is the whole installed
 * base (and every fixture written before this ticket), so demanding registries
 * unconditionally would fail every existing store for a governance layer it
 * never opted into. Absence surfaces where it can actually mean something
 * instead: at the point a record CITES a governed facet. A leaf naming
 * `facets.domain` in a store with no domains registry is an explicit
 * `missing-registry` finding naming both the value and the registry it wanted —
 * never a silent pass, and never a demand on a store that governs nothing.
 *
 * A MALFORMED registry, by contrast, is a hard error the moment it is read:
 * unparseable YAML is `parse-error` and a schema defect carries its KK-02 code,
 * both error-severity, both gating the validator to exit 2. A vocabulary the
 * engine could not read is a check that never ran, so membership must never be
 * judged against half a registry.
 *
 * @param {object} ctx the loader context
 * @param {string} store the store whose registries to load
 */
function loadRegistryFiles(ctx, store) {
  const dir = `${store}/${REGISTRY_DIR}`;
  for (const file of listFiles(ctx, dir, REGISTRY_EXTENSION, false, { skipUnderscore: false })) {
    const name = file.slice(dir.length + 1, -REGISTRY_EXTENSION.length);
    ctx.stores[store].files.push(file);
    // The graduation category table shares this directory and is a different
    // KIND (see GRADUATION_TABLE_KEY). Dispatch on the document's own `table:`
    // key rather than on the filename, so the table is recognized by what it
    // says it is: keying off a reserved basename would mean a steward who
    // renamed the file got it silently validated as a registry, and every
    // graduation row would then read as an unknown-property defect pointing at
    // the wrong schema entirely.
    let isTable = false;
    const doc = loadMetaFile(ctx, file, (parsed) => {
      isTable = isObject(parsed) && typeof parsed[GRADUATION_TABLE_KEY] === 'string';
      return isTable ? 'graduation-categories' : 'registry';
    });
    if (doc === null) continue; // parse-error or schema defect already diagnosed
    if (isTable) {
      loadGraduationTable(ctx, store, file, name, doc);
      continue;
    }
    // A registry whose declared name disagrees with its filename would make
    // every membership finding cite a file that does not answer to the name it
    // quotes. Refusing here keeps "the registry a finding names" and "the file
    // a steward opens" the same thing.
    if (doc.registry !== name) {
      ctx.diagnostics.push({
        severity: 'error', code: 'registry-name-mismatch', file, path: 'registry',
        message: `registry declares name "${doc.registry}" but lives at ${file} — a finding that names a registry must name the file a steward opens`,
      });
      continue;
    }
    // The same argument one level up: a registry filed under the wrong store
    // governs facets in a store it does not sit in. Registries are keyed
    // "<store>/<name>", so believing the declaration would index this file
    // under a key its own path contradicts — and a steward following the key
    // would open a different store's directory.
    if (doc.store !== store) {
      ctx.diagnostics.push({
        severity: 'error', code: 'registry-store-mismatch', file, path: 'store',
        message: `registry declares store "${doc.store}" but lives under ${store}/ — a registry governs the store it sits in, and the two spellings must agree`,
      });
      continue;
    }
    const registry = {
      name,
      store,
      file,
      hierarchical: doc.hierarchical === true,
      minted: new Set(),
      suppressed: new Set(),
    };
    // A value is declared ONCE. Two rows claiming one value is a defect
    // whichever statuses they carry, and the two shapes fail differently:
    //
    //   same status twice  — a redundant row. Harmless to the sets, but one of
    //                        the two warrants is the live one and a reader
    //                        cannot tell which, so the vocabulary's own record
    //                        of why a term exists has become ambiguous.
    //   minted AND suppressed — the value lands in both sets, and `judgeValue`
    //                        tests suppression first, so a MINTED value silently
    //                        reads as refused. The registry contradicts itself
    //                        and the engine resolves it by evaluation order,
    //                        which is not a governance decision anyone made.
    //
    // Both are refused rather than reconciled: "minted or suppressed" is the
    // one question a registry exists to answer, and a file that answers it
    // twice must be fixed by a steward, never guessed at here.
    const declared = new Map(); // value -> the status its first row carried
    for (const [i, entry] of doc.values.entries()) {
      if (!isObject(entry) || typeof entry.value !== 'string') continue; // KK-02 diagnosed the shape
      const status = entry.status === 'suppressed' ? 'suppressed' : 'minted';
      const first = declared.get(entry.value);
      if (first !== undefined) {
        ctx.diagnostics.push({
          severity: 'error', code: 'duplicate-registry-value', file, path: `values[${i}].value`,
          message: first === status
            ? `value "${entry.value}" is declared twice, both times as ${status} — a value is declared once, and a duplicate row leaves two warrants with no way to tell which one governs`
            : `value "${entry.value}" is declared as both ${first} and ${status} — a registry cannot mint and refuse the same value, and resolving the contradiction by file order would be a governance decision nobody made`,
        });
        continue;
      }
      declared.set(entry.value, status);
      // "Each minting a Decisions entry" (UCS-1148) enforced rather than
      // merely documented: the citation rides the ordinary ref graph, so an
      // id naming no decision is the same `unresolved-ref` error it would be
      // anywhere else, and the registry's governance is checked by the same
      // machinery as every other cross-store citation.
      if (typeof entry.decision === 'string') {
        ctx.refs.push({
          // Store-qualified, matching the `<store>/<name>` registry key: `refs`
          // is a published, `from`-sorted model field, so two identically named
          // registries in different stores must not share an edge origin.
          from: `${store}/${name}/${entry.value}`,
          type: 'registry.decision',
          to: entry.decision,
          file,
          path: `values[${i}].decision`,
          space: 'decisions',
        });
      }
      // Absent status means minted; only an explicit suppression withholds a
      // value. Both sets are kept because they answer different questions: a
      // suppressed value is not usable, but it IS accounted for, and a finding
      // that can say so tells an author "this was refused" rather than the far
      // less useful "this does not exist".
      registry[status].add(entry.value);
    }
    ctx.registries.set(`${store}/${name}`, registry);
  }
}

/**
 * Index one trust graduation category table (UCS-1155).
 *
 * The table declares which change CATEGORIES may graduate from full inspection
 * to sampling and which are permanently gated. Autonomy is per category and
 * never per leaf, so the table is the only thing that can answer "may this
 * class of change graduate at all" — and a graduation Decisions entry naming a
 * category absent from it is a validator finding rather than a silent pass.
 *
 * Three defects are refused HERE rather than downstream, because each one makes
 * the table unable to answer the question it exists for:
 *
 *   graduation-table-name-mismatch
 *              the declared `table` disagrees with the filename, so a finding
 *              naming the table would cite a file no steward can open under
 *              that name — the same rule registries and phoenix events keep.
 *   graduation-table-store-mismatch
 *              the declared `store` disagrees with the directory the file sits
 *              in. Every store loads `_registries/`, so a table can physically
 *              land under knowledge/ while declaring `decisions` and pass its
 *              schema; the key it indexes under would then contradict its own
 *              path.
 *   duplicate-graduation-category
 *              one category declared twice. Which row governs would then be
 *              decided by file order: two rows can carry different
 *              eligibilities, so a category could be both graduation-eligible
 *              and permanently gated, and the engine would pick one by
 *              accident. That is a governance decision nobody made.
 *   graduation-threshold-shape
 *              an `eligible` row with no threshold, or a `gated` row carrying
 *              one. The schema cannot state this — the engine's keyword subset
 *              has no conditional — and a rule stated in a keyword nothing
 *              enforces is contract drift wearing the appearance of a check.
 *              An eligible category with no threshold is eligible against no
 *              bar at all; a gated one with a threshold advertises a bar that
 *              can never be met, which reads as an oversight either way.
 *
 * Each row's `decision` rides the ordinary ref graph exactly as a registry
 * minting's does, so a row citing no real decision is the same `unresolved-ref`
 * error it would be anywhere else: autonomy nobody signed is the ungoverned
 * drift this whole mechanism exists to prevent.
 *
 * @param {object} ctx the in-flight load context
 * @param {string} store the store directory carrying the table
 * @param {string} file the table's root-relative path
 * @param {string} name the table's basename
 * @param {object} doc the parsed, schema-valid table
 */
function loadGraduationTable(ctx, store, file, name, doc) {
  if (doc[GRADUATION_TABLE_KEY] !== name) {
    ctx.diagnostics.push({
      severity: 'error', code: 'graduation-table-name-mismatch', file, path: GRADUATION_TABLE_KEY,
      message: `graduation table declares name "${doc[GRADUATION_TABLE_KEY]}" but lives at ${file} — a finding that names a table must name the file a steward opens`,
    });
    return;
  }
  // The same argument one level up, and the same check a registry already
  // keeps: a table filed under the wrong store governs a trust boundary in a
  // store it does not sit in. Tables are keyed "<store>/<name>", so believing
  // the declaration would index this file under a key its own path
  // contradicts, and a steward following the key would open a different
  // store's directory. The schema requires the field; the loader is what makes
  // it mean something.
  if (doc.store !== store) {
    ctx.diagnostics.push({
      severity: 'error', code: 'graduation-table-store-mismatch', file, path: 'store',
      message: `graduation table declares store "${doc.store}" but lives under ${store}/ — a table governs the store it sits in, and the two spellings must agree`,
    });
    return;
  }
  const categories = new Map();
  for (const [i, row] of doc.categories.entries()) {
    if (!isObject(row) || typeof row.category !== 'string') continue; // KK-02 diagnosed the shape
    if (categories.has(row.category)) {
      ctx.diagnostics.push({
        severity: 'error', code: 'duplicate-graduation-category', file, path: `categories[${i}].category`,
        message: `category "${row.category}" is declared twice — one row per category, or the table states two eligibilities for one class of change and the engine would pick by file order`,
      });
      continue;
    }
    // The conditional the schema subset cannot express, checked where it can
    // name the row an author must edit.
    const hasThreshold = Number.isInteger(row.threshold);
    if (row.eligibility === 'eligible' && !hasThreshold) {
      ctx.diagnostics.push({
        severity: 'error', code: 'graduation-threshold-shape', file, path: `categories[${i}].threshold`,
        message: `category "${row.category}" is graduation-eligible but declares no threshold — N is the bar a steward judges the recorded approved-unmodified count against, and an eligible category without one is eligible against nothing`,
      });
      continue;
    }
    if (row.eligibility === 'gated' && hasThreshold) {
      ctx.diagnostics.push({
        severity: 'error', code: 'graduation-threshold-shape', file, path: `categories[${i}].threshold`,
        message: `category "${row.category}" is permanently gated but declares a threshold of ${row.threshold} — a gated category can never graduate, so a bar that can never be met reads as an eligibility somebody forgot to set`,
      });
      continue;
    }
    categories.set(row.category, {
      category: row.category,
      eligibility: row.eligibility,
      threshold: hasThreshold ? row.threshold : null,
      warrant: row.warrant,
      decision: row.decision,
      file,
      index: i,
    });
    // The row's warrant rides the ordinary ref graph, exactly as a registry
    // minting's does.
    if (typeof row.decision === 'string') {
      ctx.refs.push({
        from: `${store}/${name}/${row.category}`,
        type: 'graduation.decision',
        to: row.decision,
        file,
        path: `categories[${i}].decision`,
        space: 'decisions',
      });
    }
  }
  ctx.graduations.set(`${store}/${name}`, { table: name, store, file, categories });
}

/**
 * Load a store's retained phoenix event mappings (UCS-1154).
 *
 * Shaped after `loadRegistryFiles`, and for the same reason: the file's
 * declared id must agree with its filename, or a finding that names an event
 * would cite a file a steward cannot open under that name.
 *
 * The mapping is indexed but never APPLIED here. Applying it is the phoenix
 * command's job, and it happens once; what the loader publishes is the record
 * of an event that already happened, so the validator can hold every non-1
 * edition against it.
 *
 * @param {object} ctx the in-flight load context
 * @param {string} store the store directory carrying `_phoenix/`
 */
function loadPhoenixFiles(ctx, store) {
  const dir = `${store}/${PHOENIX_DIR}`;
  for (const file of listFiles(ctx, dir, PHOENIX_EXTENSION, false, { skipUnderscore: false })) {
    const name = file.slice(dir.length + 1, -PHOENIX_EXTENSION.length);
    ctx.stores[store].files.push(file);
    const doc = loadMetaFile(ctx, file, 'phoenix-event');
    if (doc === null) continue; // parse-error or schema defect already diagnosed
    if (doc.event !== name) {
      ctx.diagnostics.push({
        severity: 'error', code: 'phoenix-name-mismatch', file, path: 'event',
        message: `phoenix event declares id "${doc.event}" but lives at ${file} — a finding that names an event must name the file a steward opens`,
      });
      continue;
    }
    // The event's warrant rides the ordinary ref graph, exactly as a registry
    // minting's does: a decision id naming no decision is the same
    // `unresolved-ref` error it would be anywhere else. A bulk re-taxonomy
    // nobody signed is the ungoverned drift this mechanism exists to replace.
    ctx.refs.push({
      from: `${store}/${PHOENIX_DIR}/${doc.event}`,
      type: 'phoenix.decision',
      to: doc.decision,
      file,
      path: 'decision',
      space: 'decisions',
    });
    const rows = new Map();
    for (const [i, row] of doc.leaves.entries()) {
      if (!isObject(row) || typeof row.id !== 'string') continue; // KK-02 diagnosed the shape
      // One row per leaf. Two rows for one accession would make "what did this
      // event do to L-x" a question the file answers twice, and choosing by
      // file order would be a governance decision nobody made.
      if (rows.has(row.id)) {
        ctx.diagnostics.push({
          severity: 'error', code: 'duplicate-phoenix-row', file, path: `leaves[${i}].id`,
          message: `leaf "${row.id}" is mapped twice by event ${doc.event} — one row per leaf, or the event states two fates for one leaf and the engine would pick by file order`,
        });
        continue;
      }
      rows.set(row.id, { ...row, index: i });
    }
    ctx.phoenix.set(`${store}/${name}`, {
      event: doc.event, store, file, decision: doc.decision, scope: doc.scope, rows,
    });
  }
}

function listFiles(ctx, dir, extension, recursive, { skipUnderscore = true, skipDirs = [] } = {}) {
  const out = [];
  const skipped = new Set(skipDirs);
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(join(ctx.root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      // Underscore-prefixed names are governed store META (`_catalog.yaml`,
      // `_rules.yaml`, `_registries/`), never records — so a record walk skips
      // them, and the registry walk (which IS a meta walk, already pointed at
      // the `_registries` directory) does not.
      if (skipUnderscore && entry.name.startsWith('_')) continue;
      if (entry.name.startsWith('.')) continue;
      // A named directory the walk must not descend into, and must not warn
      // about either (UCS-1158). `derived/` holds engine OUTPUT in the same
      // extension the records use — browse trees are markdown, and so are
      // leaves — so neither the underscore rule nor the extension check can
      // tell them apart. Skipping by name is what keeps a generated artifact
      // from being loaded as a leaf, which would make the derived layer
      // load-bearing: the trees would enter the model, fail the leaf schema,
      // and a store's health would depend on a directory whose whole contract
      // is that deleting it loses nothing.
      if (entry.isDirectory() && skipped.has(entry.name)) continue;
      const relPath = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (recursive) walk(relPath);
      } else if (entry.name.endsWith(extension)) {
        // Symlinked record files load like regular ones (isFile() is false
        // for symlinks; the readFileSync that follows resolves them).
        out.push(relPath);
      } else {
        // A file the loader will not read must never be a silent pass
        // (PRD §5): its ids simply wouldn't exist, with nothing recorded.
        ctx.diagnostics.push({
          severity: 'warning', code: 'skipped-file', file: relPath, path: '',
          message: `not a ${extension} file — the loader only reads ${extension} records here; rename it or move it out of the store`,
        });
      }
    }
  };
  walk(dir);
  return out.sort(compare);
}

/**
 * Ontology class files / decision entries files: the storeFile envelope.
 * Driven by the store's `records` descriptor, so the two stores that share
 * this shape share it as data rather than as two call sites spelling it out.
 */
function loadEntriesFiles(ctx, store, { subdir, kind, space, extension, recursive }) {
  for (const file of listFiles(ctx, `${store}/${subdir}`, extension, recursive)) {
    ctx.stores[store].files.push(file);
    const text = readText(ctx, file);
    if (text === null) continue; // read-error already diagnosed
    const parsed = parseYaml(ctx, file, text);
    if (!parsed) continue;
    validateInto(ctx, kind, file, parsed.doc);
    if (!isObject(parsed.doc) || !Array.isArray(parsed.doc.entries)) continue;
    parsed.doc.entries.forEach((record, i) => {
      if (!isObject(record)) return;
      const basePath = `entries[${i}]`;
      indexRecord(ctx, space, record.id, file, `${basePath}.id`, { id: record.id, file, record });
      if (typeof record.id === 'string') collectRefs(ctx, kind, record.id, file, basePath, record);
    });
  }
}

/** Knowledge leaves: YAML front matter + markdown body, one leaf per file. */
function loadLeafFiles(ctx) {
  for (const file of listFiles(ctx, 'knowledge', '.md', true, { skipDirs: [DERIVED_DIR] })) {
    ctx.stores.knowledge.files.push(file);
    const raw = readText(ctx, file);
    if (raw === null) continue; // read-error already diagnosed
    // Editors and autocrlf produce BOMs and CRLF; both are well-formed input.
    const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const match = /^---\n([^]*?\n)?---(?:\n|$)([^]*)$/.exec(text);
    if (!match) {
      ctx.diagnostics.push({
        severity: 'error', code: 'parse-error', file, path: '',
        message: 'knowledge leaf must open with YAML front matter fenced by "---" lines (§3.2)',
      });
      continue;
    }
    const parsed = parseYaml(ctx, file, match[1] ?? '');
    if (!parsed) continue;
    validateInto(ctx, 'knowledge-leaf', file, parsed.doc);
    const record = parsed.doc;
    if (!isObject(record)) continue;
    // The leaf's identity is read through leafIdentity(), never by naming a
    // field here: that function is the whole seam an id-space change moves
    // through (UCS-1142, UCS-1144, UCS-1147). `identity` is the neutral key
    // consumers read; `notation` stays alongside it because it is a PUBLIC
    // resolver field — the optional legacy display label — and `id` because it
    // is what the resolver publishes as the leaf's identity.
    const identity = leafIdentity(record);
    const entry = {
      identity,
      [LEAF_ACCESSION_FIELD]: record[LEAF_ACCESSION_FIELD] ?? null,
      [LEAF_ID_FIELD]: record[LEAF_ID_FIELD],
      file,
      record,
      body: match[2],
    };
    // `leaves` is keyed by the accession alone — one entry per leaf, under the
    // one name anything may cite it by. A leaf that mints no accession has no
    // identity to be keyed under, so indexRecord declines it (a non-string id)
    // and the schema's missing-required on `id` is the finding the author acts
    // on. Indexing it under its notation instead would put a leaf in every
    // enumeration that no citation could reach.
    //
    // Everything downstream is indexed under this leaf's identity, so it all
    // hangs on the leaf actually TAKING that identity. A leaf that lost the id
    // to an earlier file owns nothing, and its cross-references would otherwise
    // enter the graph as edges the WINNER never declared — worse than the leaf
    // simply not being there, which is what a losing mint means.
    if (indexRecord(ctx, 'leaves', identity, file, LEAF_ACCESSION_FIELD, entry)) {
      collectRefs(ctx, 'knowledge-leaf', identity, file, '', record);
    }
  }
}

/**
 * The bespoke record readers a descriptor may name, by name (UCS-1148).
 *
 * A store whose records are not a walk-and-parse shape names its reader in the
 * descriptor rather than being special-cased in the load loop. The indirection
 * through a name exists because the descriptor table is declared above these
 * functions: holding the function itself would be a forward reference into a
 * frozen const, and reordering the module to avoid it would put the store shape
 * table below the machinery that reads it.
 *
 * @type {Readonly<Record<string, (ctx: object, store: string) => void>>}
 */
const BESPOKE_READERS = Object.freeze({
  loadLeafFiles: (ctx) => loadLeafFiles(ctx),
});

/**
 * Refuse a descriptor naming a reader that does not exist — an engine failure
 * at load, never a silent pass. A store whose reader never resolves would load
 * ZERO records and report nothing, which reads exactly like an empty store.
 *
 * @param {Record<string, { reader?: string }>} descriptors
 * @throws {Error} if a named reader is not in BESPOKE_READERS
 */
export function assertReadersResolve(descriptors) {
  for (const [store, descriptor] of Object.entries(descriptors)) {
    if (descriptor.reader && !BESPOKE_READERS[descriptor.reader]) {
      throw new Error(
        `store "${store}" names reader "${descriptor.reader}", which does not exist — `
        + 'its records would silently fail to load and the store would read as empty',
      );
    }
  }
}

assertReadersResolve(STORE_DESCRIPTORS);

/** Pointer index: source-of-truth path → concept ids (KK-06 reverse lookup). */
function buildPointers(ctx) {
  const pointers = new Map();
  for (const { id, record } of ctx.concepts.values()) {
    if (!Array.isArray(record['source-of-truth'])) continue;
    for (const path of record['source-of-truth']) {
      if (typeof path !== 'string') continue;
      if (!pointers.has(path)) pointers.set(path, []);
      const ids = pointers.get(path);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  for (const ids of pointers.values()) ids.sort(compare);
  return sortedMap(pointers);
}

/**
 * The leaf↔concept edge, derived in BOTH directions at load (UCS-1151).
 *
 * The edge is authored once, leaf-side, because deciding what a leaf is about
 * is curatorial work under the human write gate. But it has to be traversable
 * from either end: an agent that resolves a concept needs the leaves that claim
 * it, and an agent holding a leaf needs the concepts it answers to. Deriving
 * the reverse here is what makes the concept→leaves direction STRUCTURAL — the
 * join is over declared ids, so it holds whether or not the leaf's `terms`
 * happen to spell the concept's term or one of its aliases. Text matching was
 * the only join before this ticket, which meant a leaf reached its concept by
 * term LUCK: rename the concept, or write the leaf with a different vocabulary,
 * and the two silently stopped seeing each other at exit 0.
 *
 * Keyed by concept id, valued by leaf IDENTITY (never the entry) so the index
 * cannot become a second copy of a leaf that the leaves map disagrees with.
 * Every list is de-duplicated and sorted, and the map itself is sorted, because
 * this is a published model field that resolver output is built from.
 *
 * Unresolvable concept ids are left in: this index says what the leaf CLAIMS,
 * and the ref graph is what judges whether the claim resolves. Filtering here
 * would silently drop the very edge the unresolved-ref finding is about.
 *
 * @param {object} ctx the loader context
 * @returns {Map<string, string[]>} concept id -> declaring leaf identities
 */
function buildLeavesByConcept(ctx) {
  const index = new Map();
  for (const entry of ctx.leaves.values()) {
    for (const id of leafConcepts(entry.record)) {
      if (!index.has(id)) index.set(id, []);
      const identities = index.get(id);
      if (!identities.includes(entry.identity)) identities.push(entry.identity);
    }
  }
  for (const identities of index.values()) identities.sort(compare);
  return sortedMap(index);
}

/** Resolve every collected edge; a miss is an unresolved-ref error. */
function resolveRefs(ctx) {
  for (const ref of ctx.refs) {
    const store = SPACE_TO_STORE[ref.space];
    // One index, one spelling. The alternate-spelling lookup the expand phase
    // added (UCS-1144) left with the alias table itself: a leaf answers to its
    // accession, and a notation-form citation resolves to nothing (UCS-1147).
    ref.resolved = ctx[ref.space].has(ref.to) || ctx.declared[store].has(ref.to);
    if (!ref.resolved) {
      ctx.diagnostics.push({
        severity: 'error', code: 'unresolved-ref', file: ref.file, path: ref.path,
        message: `${ref.type} ref "${ref.to}" does not resolve to any ${store} entry or catalog-declared id`,
      });
    }
    delete ref.space;
  }
  ctx.refs.sort((a, b) =>
    compare(a.from, b.from) || compare(a.type, b.type) || compare(a.to, b.to) || compare(a.path, b.path));
}

/**
 * Load the three stores under `root` into the indexed model described above.
 * @param {string} root kit root directory (the dir containing ontology/,
 *   knowledge/, decisions/ — absent stores yield missing-store warnings)
 * @returns the model; `model.ok` is the single health verdict every
 *   downstream surface shares
 */
export function loadStores(root) {
  const absRoot = resolve(root);
  if (!statSync(absRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`store root is not a readable directory: ${absRoot}`);
  }
  const ctx = {
    root: absRoot,
    stores: Object.fromEntries(STORES.map((store) =>
      [store, { present: false, catalog: null, rules: null, files: [] }])),
    declared: Object.fromEntries(STORES.map((store) => [store, new Set()])),
    concepts: new Map(),
    leaves: new Map(),
    decisions: new Map(),
    registries: new Map(),
    graduations: new Map(),
    phoenix: new Map(),
    refs: [],
    diagnostics: [],
  };

  for (const store of STORES) {
    const descriptor = STORE_DESCRIPTORS[store];
    const meta = ctx.stores[store];
    meta.present = !!statSync(join(absRoot, store), { throwIfNoEntry: false })?.isDirectory();
    if (!meta.present) {
      ctx.diagnostics.push({
        severity: 'warning', code: 'missing-store', file: store, path: '',
        message: `store directory "${store}/" is absent — loading proceeds; refs into it cannot resolve`,
      });
      continue;
    }
    loadCatalogAndRules(ctx, store, descriptor.rules);
    if (descriptor.registries) loadRegistryFiles(ctx, store);
    if (descriptor.phoenix) loadPhoenixFiles(ctx, store);
  }
  // Records load after every registry, in every store: membership is judged
  // against the whole governed vocabulary, so no record may be read before the
  // vocabulary it draws from is complete.
  for (const store of STORES) {
    if (!ctx.stores[store].present) continue;
    const { records, reader } = STORE_DESCRIPTORS[store];
    if (records) loadEntriesFiles(ctx, store, records);
    else if (reader) BESPOKE_READERS[reader](ctx, store);
  }

  const pointers = buildPointers(ctx);
  const leavesByConcept = buildLeavesByConcept(ctx);
  resolveRefs(ctx);
  ctx.diagnostics.sort((a, b) =>
    compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code));

  return {
    root: absRoot,
    stores: ctx.stores,
    concepts: sortedMap(ctx.concepts),
    leaves: sortedMap(ctx.leaves),
    decisions: sortedMap(ctx.decisions),
    registries: sortedMap(ctx.registries),
    graduations: sortedMap(ctx.graduations),
    phoenix: sortedMap(ctx.phoenix),
    pointers,
    leavesByConcept,
    refs: ctx.refs,
    diagnostics: ctx.diagnostics,
    ok: ctx.diagnostics.every((d) => d.severity !== 'error'),
  };
}

/**
 * Loader diagnostics summarized on the one scale every downstream surface
 * shares — validator, value check, and preflight report store health from
 * this single shape, so they can never disagree about it (PRD §4).
 */


/**
 * Store health — the ONE authority (UCS-939/945/951).
 *
 * The validator, the reverse audit and preflight can never disagree about a
 * Store, because they all ask this function rather than each filtering
 * `model.diagnostics` themselves. It once reported only counts, which is not
 * what any caller needed, so seven sites reached past it and the resolver
 * re-declared its own copy. A seam too narrow to be used is a seam that gets
 * walked around.
 *
 * Derived from `model.ok` and `model.diagnostics` — the single health model —
 * and from nothing else. `ok` is the loader's verdict, never recomputed from
 * the counts: a surface that recomputed it would BE a second health model.
 *
 * @param {object} model a loaded store model
 * @returns {{ ok: boolean, errors: object[], warnings: object[], errorCount: number, warningCount: number }}
 */
export function storeHealth(model) {
  const errors = model.diagnostics.filter((d) => d.severity === 'error');
  const warnings = model.diagnostics.filter((d) => d.severity === 'warning');
  return {
    ok: model.ok,
    errors,
    warnings,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}

/**
 * The wire shape of store health: counts, not Diagnostics. Every surface's
 * `store-health` JSON key is this, and it has looked like this since KK-04.
 *
 * It takes the HEALTH, never the model — so it is a projection of the one
 * authority and cannot become a second derivation of it. That is the whole
 * point: `healthSummary(storeHealth(model))` reads as what it is.
 *
 * @param {{ ok: boolean, errorCount: number, warningCount: number }} health
 * @returns {{ ok: boolean, errors: number, warnings: number }}
 */
export function healthSummary(health) {
  return { ok: health.ok, errors: health.errorCount, warnings: health.warningCount };
}

/**
 * A --concepts id the ontology does not carry — a check that never ran.
 * A usage error: the caller named something that does not exist, so the command
 * refused its arguments rather than failing mid-run. Exit 2, never 1.
 */
export class UnknownConceptsError extends UsageError {
  name = 'UnknownConceptsError';
}

/**
 * The `--leaves` counterpart (UCS-1149): an id the knowledge store does not
 * carry, under either of a leaf's two legal spellings. A usage error for the
 * same reason — the caller named something that does not exist, so the command
 * refused its arguments rather than reporting on nothing. Exit 2, never 1.
 */
export class UnknownLeavesError extends UsageError {
  name = 'UnknownLeavesError';
}

/**
 * The `--concepts` grammar, settled in one place (UCS-935).
 *
 * Ids are trimmed, empties dropped, duplicates collapsed, order stable. Every
 * surface taking the flag reads it the same way, because a filter that means
 * two different things is worse than no filter: the structural validator used
 * to accept `" K-101 "` while the value validator rejected the same argument
 * as a check that never ran, so a CI pipeline that padded its arguments got a
 * clean pass from one gate and a blocking defect from the other.
 *
 * Returns the normalized ids. Whether an EMPTY result is an error is the
 * caller's policy, not the grammar's: the validators refuse it (a filter that
 * names nothing never ran), while preflight reads it as store-health-only.
 *
 * @param {string[]} raw ids as spelled on the command line, pre-split on commas
 * @returns {string[]} trimmed, de-duplicated, stably sorted ids
 */
export function normalizeConceptIds(raw) {
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))].sort(compare);
}

/**
 * Select concepts by id (null/undefined = every concept). An unknown id
 * throws UnknownConceptsError: a verdict or finding set "filtered" to a typo
 * would be a check that never ran reading as a silent pass (PRD §5). Every
 * --concepts consumer shares this contract from here.
 */
export function selectConcepts(model, ids) {
  if (!ids) return [...model.concepts.values()];
  const unknown = ids.filter((id) => !model.concepts.has(id));
  if (unknown.length) {
    throw new UnknownConceptsError(`--concepts names id(s) not in the ontology: ${unknown.join(', ')} — a check that never ran is a blocking defect, never a silent pass (PRD §5)`);
  }
  return ids.map((id) => model.concepts.get(id));
}

/**
 * Select leaves by id (null/undefined = every leaf) — the `--leaves` analogue
 * of selectConcepts (UCS-1149).
 *
 * Same contract, for the same reason: an id the store does not carry throws
 * rather than filtering to nothing, because a verdict set "filtered" to a typo
 * is a check that never ran wearing a clean exit (PRD §5).
 *
 * Leaves are named by accession and nothing else (UCS-1147), the same spelling
 * a citation uses. The de-duplication below survives that narrowing: naming one
 * leaf twice is still one leaf, not two verdicts that would then disagree about
 * nothing.
 *
 * @param {object} model the loaded store model
 * @param {string[]|null} ids leaf ids as the caller spelled them
 * @returns {object[]} the indexed leaf entries, in the order named
 */
export function selectLeaves(model, ids) {
  if (!ids) return [...model.leaves.values()];
  const unknown = ids.filter((id) => leafIdentityOf(model, id) === undefined);
  if (unknown.length) {
    throw new UnknownLeavesError(`--leaves names id(s) not in the knowledge store: ${unknown.join(', ')} — a check that never ran is a blocking defect, never a silent pass (PRD §5)`);
  }
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const identity = leafIdentityOf(model, id);
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push(model.leaves.get(identity));
  }
  return out;
}

/**
 * The IDENTITY a leaf id names, or undefined when the store has no such leaf.
 *
 * Since UCS-1147 a leaf answers to exactly one spelling, so this no longer
 * TRANSLATES anything — it answers "is this a leaf of this store, and what is
 * its identity". It stays a named function, and exported, because that question
 * is still asked from two places that must answer it identically: preflight's
 * healthy path resolves ids through selectLeaves, and its store-wide-failure
 * path cannot (the verdicts are degraded without selecting anything). Inlining
 * `model.leaves.has(id)` at both would be the same code twice, which is how the
 * two drifted apart the first time.
 *
 * @param {object} model the loaded store model
 * @param {string} id a leaf id as the caller spelled it
 * @returns {string|undefined} the leaf's identity, or undefined if unknown
 */
export function leafIdentityOf(model, id) {
  return model.leaves.has(id) ? id : undefined;
}


/**
 * §3.5: draft/proposed concepts get structural checks only — the value check
 * skips them and preflight verdicts them unknown. One predicate, so the two
 * surfaces can never diverge on which statuses that means.
 *
 * Frontmatter v2 puts LEAVES through this same predicate (UCS-1149). A leaf has
 * no `status`; it has `facets.stage`, and `leafStage` below is the one place
 * that spelling is read. The predicate itself is unchanged and untyped as to
 * what it is judging, which is what lets a leaf's `draft` and a concept's
 * `draft` mean the same thing to every surface that asks.
 */
export const isPrePromotionStatus = (status) => status === 'draft' || status === 'proposed';

/**
 * A leaf's promotion stage, or null when it declares none (UCS-1149).
 *
 * The single reader of the `facets.stage` spelling. Two surfaces ask this
 * question — the resolver, to downrank a provisional leaf, and preflight, to
 * verdict one unknown — and if either reached into the record itself, a later
 * move of the field would leave one of them silently reading `undefined`:
 * a leaf that stopped being downranked, at exit 0, with nothing said.
 *
 * A stage that is not a string is null rather than the raw value: the schema
 * has already reported it, and passing a number into the predicate would just
 * return false, quietly promoting the leaf the defect was meant to hold back.
 *
 * @param {object} record a leaf's front-matter record
 * @returns {string|null}
 */
export function leafStage(record) {
  const stage = record?.facets?.stage;
  return typeof stage === 'string' ? stage : null;
}
