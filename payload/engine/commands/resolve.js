/**
 * Resolver (KK-06) — the runtime loop's RESOLVE step and the ACT step's
 * pre-commit reverse lookup (PRD §4, §7). Plain CLI so any agent that can run
 * a shell command gets resolution — no MCP required.
 *
 *   node payload/engine/resolve.js <query terms...> [--json] [--root <dir>]
 *   node payload/engine/resolve.js --paths <file1,file2> [--json] [--root <dir>]
 *   node payload/engine/resolve.js --doc <document> [--json] [--root <dir>]
 *
 * ONE ENTRY POINT, THREE INPUT SHAPES (UCS-1156). A query, a set of repo paths,
 * and a whole document all enter here, and the pipeline is SIZE- AND
 * FORMAT-INVARIANT because a query is processed as a ONE-BLOCK DOCUMENT through
 * the same code: `resolveQuery` and `--doc` both reach the store through
 * `joinText`, so a query and its equivalent one-block document produce
 * identical joins by construction rather than by two implementations agreeing.
 * A second document-shaped matcher is how two surfaces come to disagree about
 * what a store contains, and the disagreement would be invisible — both would
 * return plausible results.
 *
 * --doc mode emits a COVERAGE MAP (lib/coverage.js): per-section joins and
 * candidates, a gather rollup with verdicts and scope-mismatch flags, and
 * ranked candidates each carrying a section locator for just-in-time reads. Its
 * size grows with content RICHNESS, not document length — a long redundant
 * document repeats vocabulary that joins nothing new, so it produces a smaller
 * map than a short dense one. An agent's context cost is the map plus the
 * sections it chooses to open, never the document.
 *
 * An unsupported format, or content outside an adapter's envelope, is a HARD
 * ERROR WITH CONDUCT and exits 2 — a parse that never ran is a failure, never a
 * silent partial that would report a document as covered when half of it was
 * never read (PRD §5.1).
 *
 * Query mode — scored term matching over the ontology. The query is the terms
 * joined by single spaces, lowercased. A concept scores on the HIGHEST rung it
 * reaches (rungs never add up); the scoring is pinned so ranking is stable:
 *
 *   100 exact-term      query == term (case-insensitive)
 *    80 exact-alias     query == an alias
 *    60 term-match      term starts with the query, or every query word is a
 *                       whole word of the term
 *    50 alias-match     an alias starts with the query, or every query word is
 *                       a whole word of an alias — aliases are the synonyms
 *                       recorded to cure retrieval-struggle findings, so they
 *                       get the same rung treatment as terms (slightly lower)
 *    40 summary-match   every query word is a whole word of the summary
 *
 *   -30 draft/proposed concepts are downranked (floor 1) — §3.5: the resolver
 *       downranks, preflight verdicts them unknown. Deprecated concepts keep
 *       their score but are surfaced flagged (status travels with the result).
 *
 * Each result carries: id/term/summary/status, score + matched rung, the
 * concept's source-of-truth pointers (GATHER follows these), knowledge entry
 * points (leaves whose `terms` name the concept's term or an alias — the
 * knowledge-catalog descent, PRD §4), and confusable-with surfaced with each
 * referenced concept's term so disambiguation needs no second lookup.
 *
 * Each knowledge entry point publishes `id`, the accession (L-NNNNNN) that IS
 * the leaf's identity and the only spelling anything cites it by (UCS-1147),
 * and `notation`, the optional legacy display label, null when the leaf carries
 * none. Two fields because they answer two questions — which leaf this is, and
 * what it was once filed as — and only the first is an identity.
 *
 * Frontmatter v2 adds three more (UCS-1149), all stable keys that may be null
 * rather than fields that come and go:
 *
 *   stage       the leaf's promotion stage (facets.stage), or null
 *   excerpt     the first sentence of the BODY, derived — v2 retired the
 *               authored `description`, so display prose is read back from the
 *               content and cannot drift from it
 *   provenance  { author, skill-version }, carried through untouched
 *
 * Typed edges add two more (UCS-1151), on every leaf the resolver publishes in
 * either mode:
 *
 *   via       how this leaf was reached — `declared` (it names the concept in
 *             its `concepts` edge) or `terms` (its term text matched), and in
 *             --paths mode `direct` (it names the path) or `concept` (the path
 *             is under a concept it declares). Two joins of different strength,
 *             so the result says which one fired rather than leaving a reader
 *             to assume the stronger one
 *   relates   the leaf's ONE-HOP neighborhood, keyed by edge kind (depends-on /
 *             see-also / contradicts / supersedes), each neighbor a minimal
 *             reference {id, notation, heading, file}. Outgoing edges only —
 *             what this leaf's author asserted. Exactly one hop: a neighbor's
 *             neighbors are absent, because the hop exists to show what sits
 *             immediately around a hit, and depth 2 is most of the store
 *             arriving unranked
 *
 * Knowledge entry points now join STRUCTURALLY as well as textually: a leaf
 * that declares a concept surfaces under it whether or not any term text
 * matches, so knowledge stops depending on two authors choosing the same words.
 *
 * A leaf at a pre-promotion stage is DOWNRANKED: flagged `downranked: true` and
 * sorted below every promoted entry point. The flag comes off the same
 * `isPrePromotionStatus` predicate preflight verdicts on, so the resolver's
 * demotion and preflight's unknown verdict cannot disagree about which leaves
 * are provisional.
 *
 * The Time facet adds two more published fields and a second demotion
 * (UCS-1150):
 *
 *   time       the leaf's freshness verdict — {verdict, stale, volatility,
 *              verified, age, limit, reason}, from the shared
 *              lib/time-verdicts.js that preflight and the derived layer also
 *              read. Verdict classes: trusted, stale, skipped (no --today was
 *              injected), exempt (the leaf declares no volatility), undated
 *              (it declares one but carries no usable date)
 *   demotions  every demotion that fired, each with its reason — `stage` for a
 *              pre-promotion leaf, `time` for a stale one. Never a bare flag:
 *              a demotion a reader cannot explain is one they cannot act on
 *
 * `downranked` is now the UNION of both demotions, so a stale leaf sorts below
 * the fresh ones through the comparator the draft demotion already used. It is
 * still a demotion and never a filter — a stale leaf is still the best answer
 * when it is the only answer, and hiding it would send the reader to invent one.
 *
 * `--today <YYYY-MM-DD>` injects the date verdicts are measured against, and
 * the engine never reads the wall clock (D-012). WITHOUT it, time verdicts
 * report themselves `skipped` and the output SAYS so on a `time-check` line
 * present in every payload: a run that computed no freshness verdicts must not
 * read like one that checked and found everything fresh.
 *
 * QUERY DECOMPOSITION (UCS-1152) turns the query itself into joins against the
 * governed vocabularies, and says what did not join. Three axes, three
 * vocabularies, and none of them guessing:
 *
 *   verb  -> the `knowledge/operations` registry     "add a sport" -> add-sport
 *   noun  -> concept terms and aliases               "sport"       -> K-101
 *   place -> the `knowledge/jurisdictions` registry  "new jersey"  -> new-jersey
 *
 * Four sections join the payload, every one a STABLE key that may be empty:
 *
 *   decomposition  what each axis resolved to, the tokens it consumed, the
 *                  near-misses, the residue, and the resolved context residue
 *                  should be recorded alongside
 *   scoring        the signal→score table the ranking was computed with, so a
 *                  consumer reproducing it never vendors a copy that goes stale
 *   leaves         leaves as FIRST-CLASS SCORED RESULTS, each carrying the
 *                  signals that scored it. Before this ticket a leaf could only
 *                  appear as an attachment to a concept, which made an entire
 *                  class of correct answer unreachable: "add a sport" resolves a
 *                  VERB, and the leaf declaring that operation is the answer
 *                  whether or not any concept matched
 *   exclusions     leaves the query's scope excluded, each with its REASON —
 *                  excluded, never silently absent
 *
 * EXTENSION, NOT REPLACEMENT. `results` and its concept-attached `knowledge`
 * lists are untouched, and concept scores are exactly what they were: the
 * ladder still decides them, and a concept the ask merely NAMED (reached by the
 * token-level phrase test but not the whole-query ladder) appears in
 * `decomposition.concepts` without being given an invented rung in `results`.
 * Every pre-1152 consumer keeps working; a new one can read leaves directly.
 *
 * SCOPE EXCLUSION is the criterion that most needs saying out loud: a leaf
 * whose `applies.jurisdictions` is non-empty and excludes the query's
 * jurisdiction is published in `exclusions` with the reason, never dropped.
 * "No knowledge about settling bets in Malta" and "the knowledge about settling
 * bets is New-Jersey-only" demand opposite conduct, and a filtered-away leaf
 * makes them indistinguishable. An empty `applies` is UNIVERSAL and never
 * excluded; a query naming no jurisdiction excludes nothing.
 *
 * RESIDUE is the unconsumed non-stopword tokens — the store's own record of
 * what it does not yet know — emitted with `resolved-context` so the gap is
 * localized enough to act on. The stopword list is pinned and shipped in the
 * engine (lib/decomposition.js), never configurable per run.
 *
 * --paths mode — reverse lookup over BOTH pointer families: "which concepts
 * point at these files, and which leaves govern them" (UCS-1151). The join runs
 * over concept source-of-truth pointers and over leaf `paths` declarations, so
 * a diff-shaped input surfaces the knowledge that governs the files before an
 * edit rather than stopping at the concept and leaving the reader to make that
 * hop by hand. A path matches a pointer when equal to it or
 * nested under a FOLDER pointer (§3.1). Folder-ness is read from the
 * filesystem, not from the name — `src/api.v2` is a directory whose extname is
 * ".v2" — and from the name only when the pointer is gone, since a diff names
 * deleted paths; see folderPointerTest. Paths are normalized with path.posix
 * semantics (dots resolved, separators collapsed, backslashes converted,
 * absolute paths relativized against the store root) so attribution survives
 * the forms real tooling emits. An entry naming the repo root is a usage
 * error, never a silently dropped lookup. A lookup, not subset validation (no
 * D-012 conflict). Paths are deduped and sorted ascending.
 *
 * Zero resolution is a NORMAL outcome (PRD §7 — common in month one): exit 0
 * with an explicit empty result plus the fallback conduct (search within
 * survey-scope.yaml; append a retrieval-miss finding only if the topic
 * plausibly should be mapped). Exit codes (PRD §5): 0 = the lookup ran (hits
 * or none), 2 = usage/engine failure — a lookup that never ran is a failure,
 * never a silent empty result. The resolver emits no findings, so it never
 * exits 1; gating on store health is preflight's job. Store health is still
 * surfaced (single health model), and resolution runs on whatever loaded.
 *
 * JSON output is deterministic and stable-sorted — results by score desc then
 * id asc; paths/pointers/entry points lexicographic — with no timestamps.
 */
import process from 'node:process';
import { readFileSync, statSync } from 'node:fs';
import { join, posix, resolve as resolvePath } from 'node:path';
import {
  LEAF_PATHS_FIELD, RELATES_FIELD, RELATES_KINDS, healthSummary, isPrePromotionStatus,
  leafIdentityOf, leafStage, loadStores, storeHealth,
} from '../lib/load-stores.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { UsageError, parseArgs as parseFlags, rethrowIfBug } from '../lib/cli.js';
import { compare } from '../lib/validate-record.js';
// Query decomposition (UCS-1152) — the joins against the governed vocabularies,
// and the scoring table those joins are weighed by. Both extracted into lib so
// the signal→score mapping is one declaration rather than arithmetic spread
// through the matcher.
import {
  STOPWORDS, mintedValues, phraseHit, phraseOverlap, phraseWords, tokenize, valuePhrases,
} from '../lib/decomposition.js';
import { conceptScore, leafScore, scoringTable } from '../lib/scoring.js';
// The Time facet (UCS-1150). The resolver computes no verdict of its own — one
// implementation, shared with preflight and the derived layer, so a leaf ranked
// stale here is never verdicted trusted there.
import { timeCheckStatus, timeVerdict } from '../lib/time-verdicts.js';
import { isCalendarDate } from '../lib/iso-date.js';
// The document coverage map (UCS-1156) and the adapter seam it reads. The
// coverage module owns the MAP; this command owns the JOINS, and passes its own
// joiner in — so the document path cannot grow a second matcher.
import { buildCoverageMap } from '../lib/coverage.js';
import { AdaptError, UnsupportedFormatError, adapt, adapterFor } from '../lib/format-adapters.js';
import { loadSuppressions } from '../lib/suppressions.js';

export const USAGE = `usage: node payload/engine/resolve.js <query terms...> [--json] [--root <dir>] [--today <YYYY-MM-DD>]
       node payload/engine/resolve.js --paths <file1,file2> [--json] [--root <dir>] [--today <YYYY-MM-DD>]
       node payload/engine/resolve.js --doc <document> [--json] [--root <dir>] [--today <YYYY-MM-DD>]`;

// The concept ladder and the draft downrank moved to lib/scoring.js (UCS-1152)
// — one signal→score table, so a reader asking "what is a score of 70 made of"
// has one place to look and `explain`-style reproduction is possible at all.
// The NUMBERS are unchanged and pinned by the existing goldens: the extraction
// moved this arithmetic, it did not renegotiate it.

/** Registry keys the query's verb and place axes join through (UCS-1148). */
const OPERATIONS_REGISTRY = 'knowledge/operations';
const JURISDICTIONS_REGISTRY = 'knowledge/jurisdictions';

/** The leaf front-matter fields the structured joins read. */
const OPERATIONS_FIELD = 'operations';
const APPLIES_FIELD = 'applies';
const JURISDICTIONS_FIELD = 'jurisdictions';

/**
 * The first sentence of a leaf's body, or null when it has none (UCS-1149).
 *
 * Frontmatter v2 retired the free-prose `description` field, so display prose
 * is DERIVED rather than authored: a leaf opens its body with a topic sentence
 * and this reads it back. The point is that the summary cannot drift from the
 * content — an authored one-liner is a second copy of the claim, and the copy
 * is what goes stale when the body is edited and the frontmatter is not.
 *
 * Deliberately literal about what a "first sentence" is, because a clever
 * extractor that guesses wrong is worse than a plain one that occasionally
 * returns a long line:
 *
 *   - Markdown structure is skipped LINE BY LINE, not block by block. That is
 *     the whole subtlety: structure in markdown is a property of a line, and a
 *     heading needs no blank line after it, so `# Title\nThe real opening.` is
 *     one block whose first line is a heading and whose second is the prose.
 *     Discarding the block would blank the excerpt for a perfectly ordinary
 *     body; discarding just the heading line finds the sentence underneath.
 *   - Fenced code is skipped WHOLE, tracked as state across lines rather than
 *     matched line by line, in both CommonMark spellings (``` and ~~~).
 *     Matching only the fence markers would leave the code between them
 *     looking like ordinary prose, which is how `code();` ends up published as
 *     a leaf's excerpt. An unclosed fence runs to the end of the body.
 *   - Prose then runs to the next blank line or structural line, with internal
 *     newlines collapsed to single spaces: bodies are hard-wrapped, so a
 *     sentence routinely spans two lines and a line-based reader would truncate
 *     it mid-clause.
 *   - A sentence ends at `.`/`!`/`?` followed by whitespace or end-of-text.
 *     `§4.2` and `v3.` do not end a sentence mid-token, which is why the
 *     following character must be whitespace rather than anything at all.
 *   - Prose with no terminator IS the excerpt — a body whose opening line is a
 *     fragment still has display prose, and returning null there would silently
 *     blank the surface rather than show what the author wrote.
 *
 * @param {string|undefined} body the markdown below the front matter
 * @returns {string|null}
 */
export function firstSentence(body) {
  if (typeof body !== 'string') return null;
  // Headings, list items, ordered items, block quotes, and table rows.
  const structural = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\|)/;
  // Both fence spellings — CommonMark allows ~~~ as well as ```.
  const fence = /^(```|~~~)/;
  // A fence has to be tracked as STATE, not matched as a line: skipping the
  // fence markers alone would leave the code BETWEEN them looking like
  // ordinary prose, and `code();` would be published as a leaf's excerpt.
  // So everything from an opening fence to its closing one is skipped whole.
  const prose = [];
  let fenced = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (fence.test(line)) {
      // An unclosed fence runs to the end of the body — which is the honest
      // reading of a malformed block, and never leaves code in the excerpt.
      fenced = !fenced;
      if (prose.length) break; // prose already collected; a fence ends it
      continue;
    }
    if (fenced) continue;
    if (line === '' || structural.test(line)) {
      // Prose stops AT structure rather than swallowing it, so an excerpt
      // never shows markup; before any prose, structure is just skipped.
      if (prose.length) break;
      continue;
    }
    prose.push(line);
  }
  if (!prose.length) return null;
  const flat = prose.join(' ').replace(/\s+/g, ' ').trim();
  const stop = flat.search(/[.!?](\s|$)/);
  return stop === -1 ? flat : flat.slice(0, stop + 1);
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------- query mode

/** Prefix or whole-word rung shared by terms and aliases. */
const rungMatch = (query, queryWords, name) =>
  norm(name).startsWith(query) || queryWords.every((w) => words(name).includes(w));

/** Highest scoring rung the concept reaches for this query, or null. */
function matchConcept(query, queryWords, record) {
  const term = typeof record.term === 'string' ? record.term : '';
  const aliases = strings(record.aliases);
  if (norm(term) === query) return 'exact-term';
  if (aliases.some((alias) => norm(alias) === query)) return 'exact-alias';
  if (rungMatch(query, queryWords, term)) return 'term-match';
  if (aliases.some((alias) => rungMatch(query, queryWords, alias))) return 'alias-match';
  const summaryWords = words(typeof record.summary === 'string' ? record.summary : '');
  if (queryWords.every((w) => summaryWords.includes(w))) return 'summary-match';
  return null;
}

/**
 * A leaf's declared operations (UCS-1152) — the single reader of the
 * `operations` spelling, for the same reason `leafConcepts` is for `concepts`.
 *
 * Non-strings are dropped rather than coerced: the schema already diagnoses the
 * wrong type, and a coerced value would join a leaf to an operation nobody
 * declared.
 *
 * @param {object} record a leaf's front-matter record
 * @returns {string[]}
 */
const leafOperations = (record) => strings(record?.[OPERATIONS_FIELD]);

/**
 * The jurisdictions a leaf declares itself applicable to (UCS-1152).
 *
 * An EMPTY list is the universal case and is load-bearing: a leaf that declares
 * no jurisdictions applies everywhere and is never scope-excluded. The
 * distinction between "applies to nowhere" and "applies everywhere" is
 * precisely the one an empty array has to carry, and it reads as universal
 * because that is what an author who wrote no jurisdiction meant — the
 * alternative would silently hide every leaf in every store that has not yet
 * adopted the facet.
 *
 * @param {object} record a leaf's front-matter record
 * @returns {string[]}
 */
function leafJurisdictions(record) {
  const applies = record?.[APPLIES_FIELD];
  return isObject(applies) ? strings(applies[JURISDICTIONS_FIELD]) : [];
}

/** confusable-with ids, each resolved to its term for one-lookup disambiguation. */
function confusables(model, record) {
  return strings(record['confusable-with'])
    .sort(compare)
    .map((id) => ({ id, term: model.concepts.get(id)?.record.term ?? null }));
}

/**
 * Knowledge entry points: leaves whose `terms` name the concept term/alias.
 *
 * Ordered promoted-first (UCS-1149): a pre-promotion leaf sorts BELOW every
 * promoted one, and ties keep the loader's id order so output stays byte-stable.
 * That ordering is the resolver's half of the draft-stage contract — an agent
 * reading the list top-down reaches certified knowledge before provisional
 * knowledge — and it is deliberately a demotion rather than a filter: a draft
 * leaf is still the best answer when it is the only answer, and hiding it would
 * send the reader to invent one instead.
 */
/**
 * One leaf's one-hop `relates` neighborhood, typed and labeled by edge kind
 * (UCS-1151).
 *
 * The shape is a MAP keyed by edge kind, not a flat list with a `kind` field,
 * because the kinds are not interchangeable: `contradicts` and `see-also` ask
 * an agent to do different things, and a flat list invites reading the first
 * few entries as if the kind were incidental. Every declared kind is present as
 * a key even when empty, for the reason every other v2 field is a stable key
 * that may be null — one result shape, so a consumer never needs a presence
 * check to tell "no contradictions" from "this engine predates contradicts".
 *
 * Exactly ONE hop, and that is a deliberate boundary rather than a first
 * increment. A neighbor's neighbors are absent: the point of the hop is to show
 * an agent what sits immediately around a hit so it can decide what to read
 * next, and two hops would put material in front of it that nothing it asked
 * for actually touches — the relates graph is dense enough that depth 2 is most
 * of the store, arriving unranked and unexplained. Each neighbor carries what
 * it takes to decide whether to follow it (`heading`) and to actually go
 * (`file`, and both ids); following IS the second hop, and that is the caller's
 * call to make.
 *
 * OUTGOING edges only. The ticket says the resolver expands over relates edges
 * FROM a hit, and outgoing is what this leaf's author asserted: a leaf declares
 * what IT depends on, what IT contradicts. An incoming edge is somebody else's
 * claim about this leaf, which is a genuinely useful thing to see and a
 * different question — it belongs to whatever surface presents "what cites
 * this", where it can be labeled as such rather than blended into the leaf's
 * own assertions.
 *
 * Neighbors resolve through `leafIdentityOf`, the one lookup every surface
 * asks — so an edge citing a leaf by its retired notation reaches nothing here
 * for the same reason it fails validation (UCS-1147), rather than through a
 * second rule this function spells itself. An edge that resolves to nothing is
 * DROPPED here rather than
 * published as a stub: the loader has already raised the unresolved-ref finding
 * against it, and a neighborhood entry naming a leaf that does not exist would
 * send a reader after a file nobody can open.
 *
 * @param {object} model the loaded store model
 * @param {object} record the leaf's front-matter record
 * @returns {Record<string, Array<{id, notation, heading, file}>>}
 */
function relatesNeighborhood(model, record) {
  const declared = isObject(record[RELATES_FIELD]) ? record[RELATES_FIELD] : {};
  const neighborhood = {};
  for (const kind of RELATES_KINDS) {
    const seen = new Set();
    const neighbors = [];
    for (const cited of strings(declared[kind])) {
      const identity = leafIdentityOf(model, cited);
      // Unresolvable: the loader already reported it as unresolved-ref. A stub
      // here would be a second report of one defect, wearing the shape of a
      // real neighbor.
      if (identity === undefined || seen.has(identity)) continue;
      seen.add(identity);
      const entry = model.leaves.get(identity);
      neighbors.push({
        id: typeof entry.id === 'string' ? entry.id : null,
        notation: typeof entry.notation === 'string' ? entry.notation : null,
        heading: entry.record?.heading ?? null,
        file: entry.file,
      });
    }
    // Sorted by identity, so a neighborhood is byte-stable regardless of the
    // order the author happened to list the citations in.
    neighborhood[kind] = neighbors.sort((a, b) => compare(a.id ?? a.notation, b.id ?? b.notation));
  }
  return neighborhood;
}

/**
 * The published shape of one knowledge leaf — every surface that surfaces a
 * leaf builds it HERE.
 *
 * Extracted in UCS-1151 because a leaf now reaches the caller three ways: as a
 * concept's knowledge entry point (by term text or by declared `concepts`
 * edge), and as a governing leaf in reverse path lookup. Three call sites
 * spelling this object out would be three chances for a field to be published
 * one way in one mode and another way in the next — and the fields most at risk
 * are exactly the ones whose whole contract is that they are STABLE keys that
 * may be null.
 */
function publishLeaf(model, entry, today) {
  const { file, record: leaf } = entry;
  const stage = leafStage(leaf);
  const provenance = leaf.provenance;
  // The Time facet's verdict (UCS-1150), computed once per published leaf and
  // carried on it. Published on EVERY leaf including the exempt and the
  // skipped ones, for the reason every other v2 field is a stable key: a
  // consumer must never need a presence check to tell "this leaf is fresh"
  // from "this run never asked what day it is".
  const time = timeVerdict(leaf, today);
  return {
    // `notation` and `id` are this command's PUBLISHED field names (§4), so
    // they are spelled here on purpose; the VALUES come from the loader's
    // indexed entry, which is what an id-space change moves (UCS-1142).
    // Wire name and storage field are two different decisions.
    //
    // `id` is the accession — the leaf's IDENTITY (UCS-1147), and the only
    // spelling anything may cite it by. Placed first for that reason;
    // JSON.stringify preserves insertion order, so this fixes the field's
    // position in the byte-stable output for good.
    //
    // `notation` is the OPTIONAL LEGACY display label, published alongside and
    // never as identity. It stays because it is still a fact about the leaf a
    // reader may want to see, and because a published field that vanished would
    // break consumers as surely as one that changed meaning — but nothing
    // resolves through it, and a store keying on it is keying on a label.
    //
    // Both are published as STRING-OR-NULL, tested with `typeof` rather than
    // `??`: `??` only catches null/undefined, so an unquoted YAML `id: 12345` —
    // a number, not an accession — would travel into the JSON as a number and
    // break the field's published type for every consumer. `id` is null only
    // for a leaf no check has approved: the schema requires an accession, but
    // the resolver never gates on store health (a lookup runs on whatever
    // loaded, §4), so it is the one surface that can be asked to publish an id
    // the store should not have had. A stable key whose value is null is what
    // it says then, rather than a key that disappears.
    // Same `typeof` test the loader and the orphan check use.
    id: typeof entry.id === 'string' ? entry.id : null,
    notation: typeof entry.notation === 'string' ? entry.notation : null,
    heading: leaf.heading ?? null,
    // `stage`, `excerpt`, and `provenance` are frontmatter v2 (UCS-1149).
    // Like `id` they are stable keys whose value may be null, never omitted
    // keys: a store mid-migration must emit ONE result shape, or every
    // consumer needs a presence check to tell "this leaf declares no stage"
    // from "this engine predates stages".
    //
    // `excerpt` is DERIVED from the body, not read from a field — v2 retired
    // the authored `description` precisely so display prose cannot drift from
    // the content it summarizes.
    //
    // `provenance` travels verbatim: no registry governs it, so the resolver
    // has no judgement to apply and passing it through unchanged is the whole
    // contract. Spelled field by field rather than spread, so a later
    // provenance field cannot leak into published output before anyone
    // decided it should be public.
    stage,
    excerpt: firstSentence(entry.body),
    provenance: isObject(provenance)
      ? {
        author: typeof provenance.author === 'string' ? provenance.author : null,
        'skill-version': typeof provenance['skill-version'] === 'string' ? provenance['skill-version'] : null,
      }
      : null,
    // The SAME predicate preflight verdicts on (UCS-1149). A leaf whose
    // stage is pre-promotion is downranked here and verdicted unknown
    // there; reading the two off one predicate is what stops the surfaces
    // disagreeing about which leaves are provisional.
    //
    // `downranked` is now the UNION of two independent demotions (UCS-1150):
    // a pre-promotion stage and a stale time verdict. It stays a single
    // boolean because it answers a single question — does this leaf sort
    // below the promoted ones — and every consumer already reads it that way.
    // WHICH demotions fired is `demotions`, so a leaf that is both draft and
    // stale reports both rather than having one silently absorb the other.
    downranked: isPrePromotionStatus(stage) || time.stale,
    // Never a bare flag: the ticket's demand is that a demotion is never
    // silent, so the reason travels with it. Empty for a leaf that was not
    // demoted — a stable key whose value is an empty array, like every other
    // v2 field that may be absent-but-present.
    demotions: [
      ...(isPrePromotionStatus(stage)
        ? [{ reason: 'stage', detail: `stage "${stage}" is pre-promotion — no moderator has certified this leaf's citations (UCS-1149)` }]
        : []),
      ...(time.stale ? [{ reason: 'time', detail: time.reason }] : []),
    ],
    // The full time verdict (UCS-1150) — verdict class, the declared facts it
    // was computed from, and the reason. Carried on every leaf so a projection
    // can show WHY without recomputing, which is what keeps every surface
    // reading one answer.
    time,
    file,
    // The one-hop structural neighborhood (UCS-1151) — every leaf the resolver
    // publishes carries it, so "any hit carries its relates neighborhood" is
    // true by construction rather than by remembering to attach it per mode.
    [RELATES_FIELD]: relatesNeighborhood(model, leaf),
  };
}

/**
 * How a leaf came to be attached to a concept (UCS-1151).
 *
 * Published on every entry point, because the two joins answer differently and
 * a reader deserves to know which one fired. `declared` means the leaf names
 * this concept in its `concepts` edge — a curatorial claim, checked by the ref
 * graph. `terms` means the leaf's `terms` text matched the concept's term or an
 * alias, which is the pre-1151 join and is exactly as reliable as the two
 * authors' vocabularies happening to agree.
 *
 * A leaf that does both reads `declared`: the structural edge is the stronger
 * claim, and it is the one that survives a concept being renamed.
 */
const VIA_DECLARED = 'declared';
const VIA_TERMS = 'terms';

function knowledgeEntryPoints(model, record, conceptId, today) {
  const names = new Set(
    [record.term, ...strings(record.aliases)]
      .filter((s) => typeof s === 'string')
      .map(norm),
  );
  // The STRUCTURAL half of the join (UCS-1151): leaves that declared this
  // concept, read off the reverse index the loader derived at load. This is
  // what makes a concept's knowledge reachable without term luck — the leaf
  // said which concept it is about, so renaming the concept's term, or writing
  // the leaf in different words, cannot silently sever them.
  const declaring = new Set(model.leavesByConcept.get(conceptId) ?? []);
  const out = [];
  for (const entry of model.leaves.values()) {
    const { record: leaf } = entry;
    const declared = declaring.has(entry.identity);
    if (declared || strings(leaf.terms).some((t) => names.has(norm(t)))) {
      // `via` records WHICH join fired, because the two are not equally
      // reliable and a reader should not have to guess. The structural edge
      // wins a tie: it is the claim that survives a concept rename.
      out.push({ via: declared ? VIA_DECLARED : VIA_TERMS, ...publishLeaf(model, entry, today) });
    }
  }
  // Stable by construction: model.leaves is already sorted by leaf id, and a
  // boolean comparator moves only the downranked ones, so ties never reorder.
  // `downranked` now folds in the stale verdict (UCS-1150), so a stale leaf
  // sorts below the fresh ones through the SAME comparator the draft demotion
  // already used — one ordering rule, not two competing ones.
  return out.sort((a, b) => Number(a.downranked) - Number(b.downranked));
}

/**
 * Decompose the query against the governed vocabularies (UCS-1152).
 *
 * Three axes, three vocabularies, no guessing — the module header of
 * lib/decomposition.js argues the semantics; this is the join itself. Each axis
 * records the TOKENS it consumed, because residue is defined as what no join
 * consumed and that is only computable if every join says what it took.
 *
 * Concept matching runs the pre-1152 ladder (`matchConcept`), NOT the phrase
 * test, so published concept scores stay exactly what they were. The phrase
 * test is used only to learn which tokens the concept consumed — a concept that
 * matched on `summary-match` consumed nothing nameable, and claiming otherwise
 * would delete residue the store should have reported.
 *
 * @returns {{operations, concepts, jurisdictions, tokens, consumed, nearMiss}}
 */
function decompose(model, query, queryWords, tokens) {
  const consumed = new Set();
  const consume = (taken) => { for (const t of taken) consumed.add(t); };

  /** Join one registry's minted values, recording the spelling that matched. */
  const joinRegistry = (key) => {
    const hits = [];
    for (const value of mintedValues(model, key)) {
      for (const { spelling, words: phrase } of valuePhrases(value)) {
        const taken = phraseHit(phrase, tokens);
        if (!taken) continue;
        consume(taken);
        hits.push({ value, matched: spelling, tokens: [...taken] });
        break; // one value resolves once; the first (identifier) spelling wins
      }
    }
    return hits;
  };

  const operations = joinRegistry(OPERATIONS_REGISTRY);
  const jurisdictions = joinRegistry(JURISDICTIONS_REGISTRY);

  // The NOUN axis. Two joins are asked, and they answer different questions:
  //
  //   ladder  `matchConcept` — the pre-1152 whole-query ladder that produces
  //           the published concept `score`. It is deliberately strict: it
  //           tests the query AS A WHOLE against a term, so "add a sport" does
  //           NOT reach "Sport", and the concept result list stays exactly what
  //           consumers already rank on.
  //   phrase  the token-level phrase test — does the concept's name appear IN
  //           the ask at all? "add a sport" does contain "sport", and the leaf
  //           declaring K-101 is a correct answer to it.
  //
  // Before this ticket only the ladder existed, so a concept the ask genuinely
  // named went unjoined whenever the ask said anything else as well — which is
  // every real query. Running both, and keeping them separate, is what lets the
  // decomposition find the noun without renegotiating the published ranking:
  // `match` is the ladder's verdict and is null when only the phrase test
  // fired, so a reader can always tell which join reached the concept.
  const concepts = [];
  for (const { id, file, record } of model.concepts.values()) {
    const match = matchConcept(query, queryWords, record);
    // Which tokens this concept's own vocabulary accounts for. Only the term
    // and aliases are consulted — a `summary-match` consumes nothing, because
    // a summary is prose about the concept, not a name for it, and treating it
    // as one would silently absorb tokens the store cannot actually resolve.
    const taken = [];
    for (const name of [record.term, ...strings(record.aliases)]) {
      if (typeof name !== 'string') continue;
      const hit = phraseHit(phraseWords(name), tokens);
      if (hit) taken.push(...hit);
    }
    if (match === null && !taken.length) continue;
    consume(taken);
    concepts.push({ id, file, record, match, tokens: [...new Set(taken)] });
  }

  return { operations, concepts, jurisdictions, tokens, consumed, nearMiss: nearMisses(model, tokens, operations, concepts, jurisdictions) };
}

/**
 * Vocabulary entries that share tokens with the query but did NOT match
 * (UCS-1152).
 *
 * The answer that was nearly right, reported with the overlap that carried it.
 * A reader whose query returned nothing useful needs to see these more than
 * anyone: the near-miss is where a store's vocabulary and its users' vocabulary
 * are visibly drifting apart, and a search that reports only its hits lets that
 * drift run silently until the store stops being usable.
 *
 * All three axes are swept, not just concepts, because a verb or a place can
 * near-miss exactly as a noun can — an ask that half-names a place should say
 * which jurisdiction it was a token away from rather than reporting a bare zero.
 *
 * Sorted by kind then id, so the section is byte-stable regardless of the order
 * the vocabularies happened to load in.
 */
function nearMisses(model, tokens, operations, concepts, jurisdictions) {
  const out = [];
  const matchedValues = (hits) => new Set(hits.map((h) => h.value));

  const sweepRegistry = (kind, key, hits) => {
    const already = matchedValues(hits);
    for (const value of mintedValues(model, key)) {
      if (already.has(value)) continue;
      // The widest spelling decides the overlap: `add-sport` opened into
      // ["add","sport"] shares a token with "sport" that the closed spelling
      // never would, and reporting the narrower answer would hide the miss.
      let overlap = [];
      for (const { words: phrase } of valuePhrases(value)) {
        const shared = phraseOverlap(phrase, tokens);
        if (shared.length > overlap.length) overlap = shared;
      }
      if (overlap.length) out.push({ kind, id: value, overlap });
    }
  };

  sweepRegistry('operation', OPERATIONS_REGISTRY, operations);
  sweepRegistry('jurisdiction', JURISDICTIONS_REGISTRY, jurisdictions);

  const matchedConcepts = new Set(concepts.map((c) => c.id));
  for (const { id, record } of model.concepts.values()) {
    if (matchedConcepts.has(id)) continue;
    let overlap = [];
    for (const name of [record.term, ...strings(record.aliases)]) {
      if (typeof name !== 'string') continue;
      const shared = phraseOverlap(phraseWords(name), tokens);
      if (shared.length > overlap.length) overlap = shared;
    }
    if (overlap.length) out.push({ kind: 'concept', id, overlap });
  }

  return out.sort((a, b) => compare(a.kind, b.kind) || compare(a.id, b.id));
}

/**
 * The leaves a decomposed query reaches, as FIRST-CLASS SCORED RESULTS
 * (UCS-1152).
 *
 * Before this ticket a leaf could only appear as an attachment to a concept
 * result, which made an entire class of correct answer unreachable: "add a
 * sport" resolves a VERB, and the leaf declaring that operation is the answer
 * whether or not any concept matched. Hanging it off a concept meant either
 * guessing a noun to hang it on or losing it.
 *
 * Scored additively over the structured joins — see lib/scoring.js for why this
 * family adds where the concept ladder does not. Every leaf carries its
 * `signals`, so the score is reproducible: `sum(signals[].score) === score`.
 *
 * Concept-declaration joins read the loader's reverse index (`leavesByConcept`),
 * the same structural edge UCS-1151 built, so a leaf reaches its concept without
 * term luck here exactly as it does there.
 */
function scoreLeaves(model, decomposition, today) {
  const { operations, concepts, tokens } = decomposition;
  const declaringConcept = new Map(); // leaf identity -> concept ids it declares
  for (const { id } of concepts) {
    for (const identity of model.leavesByConcept.get(id) ?? []) {
      if (!declaringConcept.has(identity)) declaringConcept.set(identity, []);
      declaringConcept.get(identity).push(id);
    }
  }

  const scored = [];
  for (const entry of model.leaves.values()) {
    const { record: leaf } = entry;
    // Signals are gathered in DESCENDING weight — operation, concept, term —
    // so the strongest reason a leaf surfaced reads first in the output.
    //
    // WITHIN each weight class they are sorted by `via`, and that sort is a
    // determinism requirement rather than tidiness. Every one of these three
    // sources is an AUTHORED array (the query's matched operations, the leaf's
    // declared concepts, the leaf's `terms`), so emitting them in encounter
    // order would make the published `signals` depend on the order somebody
    // happened to write a list in — two stores with identical content and
    // different authoring order would produce different bytes, which is exactly
    // what D-012 forbids. Sorting on the value makes the output a function of
    // WHAT a leaf declares, never of the sequence it was typed in.
    const declaredOps = leafOperations(leaf);
    const operationSignals = operations
      .filter(({ value }) => declaredOps.includes(value))
      .map(({ value }) => ({ signal: 'operation', via: value }));
    const conceptSignals = [...(declaringConcept.get(entry.identity) ?? [])]
      .map((id) => ({ signal: 'concept', via: id }));
    const termTokens = [];
    const termSignals = [];
    for (const term of strings(leaf.terms)) {
      const hit = phraseHit(phraseWords(term), tokens);
      if (!hit) continue;
      termTokens.push(...hit);
      termSignals.push({ signal: 'term', via: term });
    }
    const byVia = (a, b) => compare(a.via, b.via);
    const signals = [
      ...operationSignals.sort(byVia),
      ...conceptSignals.sort(byVia),
      ...termSignals.sort(byVia),
    ];
    if (!signals.length) continue;
    // A leaf's own term text consumes tokens too — it is a join like any other,
    // and a token it accounted for is not unresolved. Recorded on the shared
    // consumed set so residue sees it.
    for (const t of termTokens) decomposition.consumed.add(t);
    const { score, signals: weighted } = leafScore(signals);
    scored.push({ entry, score, signals: weighted });
  }
  // Both declared arrays are SORTED before publication, for the same reason the
  // signals are: they are authored lists, and byte-stable output must be a
  // function of what a leaf declares rather than the order its author typed it
  // (D-012). Sorted copies, never in place — mutating the loaded record would
  // reorder the model every other surface reads.
  return scored.map(({ entry, score, signals }) => ({
    score,
    signals,
    applies: [...leafJurisdictions(entry.record)].sort(compare),
    [OPERATIONS_FIELD]: [...leafOperations(entry.record)].sort(compare),
    ...publishLeaf(model, entry, today),
  }));
}

/**
 * Split scored leaves into those the query's scope keeps and those it excludes
 * (UCS-1152).
 *
 * A leaf is EXCLUDED when it declares jurisdictions and the query named a
 * jurisdiction that is not among them. It is excluded WITH ITS REASON and
 * published in its own section — never silently absent, which is the acceptance
 * criterion and the whole point. "No knowledge about settling bets in Malta"
 * and "the knowledge about settling bets is New-Jersey-only" demand opposite
 * conduct from a reader, and a filtered-away leaf makes them indistinguishable.
 *
 * A leaf declaring NO jurisdictions is universal and never excluded — see
 * `leafJurisdictions`. A query naming no jurisdiction excludes nothing: with no
 * scope asserted there is nothing to be out of scope of.
 */
function applyScope(scored, jurisdictions) {
  if (!jurisdictions.length) return { kept: scored, excluded: [] };
  const asked = jurisdictions.map((j) => j.value);
  const kept = [];
  const excluded = [];
  for (const leaf of scored) {
    if (!leaf.applies.length || leaf.applies.some((j) => asked.includes(j))) {
      kept.push(leaf);
      continue;
    }
    excluded.push({
      id: leaf.id,
      notation: leaf.notation,
      heading: leaf.heading,
      file: leaf.file,
      applies: leaf.applies,
      asked,
      reason: `declares applies.jurisdictions [${leaf.applies.join(', ')}] — the query is scoped to [${asked.join(', ')}], which this leaf does not cover (UCS-1152)`,
    });
  }
  return { kept, excluded };
}

/**
 * Rank scored leaves: time-verdict and stage demotions first, then score
 * (UCS-1152).
 *
 * `downranked` is already the UNION of the stage and time demotions
 * (publishLeaf, UCS-1150), so sorting on it applies BOTH demotions through one
 * comparator rather than two competing ones — a stale leaf and a draft leaf
 * both sort below the promoted, fresh ones, and a leaf that is both reports
 * both reasons without either absorbing the other.
 *
 * Demotion before score, deliberately: a high-scoring stale leaf is still one
 * whose claims nobody has re-verified, and putting it above a fresh lower-scoring
 * answer would rank confidence above currency. It is a demotion and never a
 * filter — the leaf is still published, still scored, still explains itself.
 */
const rankLeaves = (leaves) => [...leaves].sort((a, b) =>
  Number(a.downranked) - Number(b.downranked)
  || b.score - a.score
  || compare(a.id ?? a.notation, b.id ?? b.notation));

/**
 * THE JOIN CORE — one text in, the store's joins out (UCS-1156).
 *
 * Extracted from `resolveQuery` so that a query and a document section reach
 * the store through the SAME function rather than through two implementations
 * that are supposed to agree. This is what makes the ticket's size-invariance
 * claim a property of the code instead of a promise: `resolveQuery` calls it
 * with the whole query, and `--doc` calls it once per section, so a query and
 * its equivalent one-block document cannot produce different joins.
 *
 * Everything here was already the query path's behavior — the decomposition,
 * the additive leaf scoring, the scope exclusion, the ranking. Nothing about
 * matching changed; only its call site moved so a second caller could exist.
 *
 * @param {object} model the loaded store model
 * @param {string} raw the text to join — a query, or one section's prose
 * @param {string|null} today the injected date verdicts are measured against
 * @returns {{query, tokens, decomposition, leaves, exclusions, residue, ...}}
 */
function joinText(model, raw, today) {
  const query = norm(raw);
  const queryWords = words(query);
  const tokens = tokenize(raw);
  const decomposition = decompose(model, query, queryWords, tokens);
  const { kept, excluded } = applyScope(scoreLeaves(model, decomposition, today), decomposition.jurisdictions);
  // Residue is computed LAST, after every join has had its chance to consume:
  // it is defined as what nothing resolved, so anything computed earlier would
  // be measuring a partially-run decomposition. De-duplicated, in query order —
  // a token the user typed twice is one unresolved thing.
  const residue = [...new Set(tokens.filter((t) => !decomposition.consumed.has(t) && !STOPWORDS.has(t)))];
  return {
    query,
    queryWords,
    tokens,
    decomposition,
    operations: decomposition.operations,
    concepts: decomposition.concepts,
    jurisdictions: decomposition.jurisdictions,
    leaves: rankLeaves(kept),
    exclusions: excluded.sort((a, b) => compare(a.id ?? a.notation, b.id ?? b.notation)),
    residue,
  };
}

function resolveQuery(model, terms, today) {
  const raw = terms.join(' ');
  if (!words(norm(raw)).length) throw new UsageError('query terms must contain a word');
  const joined = joinText(model, raw, today);
  const { query, decomposition, tokens, residue } = joined;

  // Concept results keep their pre-1152 shape and their pre-1152 scores — the
  // structured joins are ADDITIVE surface, never a renegotiation of a ranking
  // consumers already read.
  const results = [];
  for (const { id, file, record, match } of decomposition.concepts) {
    // Only LADDER matches become concept results. A concept the phrase test
    // reached but the ladder did not has no rung and therefore no score, and
    // inventing one would put concepts in this list that the pre-1152 engine
    // never returned — breaking the ranking this ticket promised to leave
    // alone. It is still published in `decomposition.concepts`, where it is
    // what it actually is: a noun the ask named, joined structurally to leaves.
    if (match === null) continue;
    results.push({
      id,
      term: record.term ?? null,
      summary: record.summary ?? null,
      status: record.status ?? null,
      score: conceptScore(match, record.status),
      match,
      file,
      'source-of-truth': strings(record['source-of-truth']),
      'confusable-with': confusables(model, record),
      knowledge: knowledgeEntryPoints(model, record, id, today),
    });
  }
  results.sort((a, b) => b.score - a.score || compare(a.id, b.id));

  return {
    query,
    // The decomposition itself, published (UCS-1152) — which vocabulary each
    // axis of the ask landed in, and what did not land anywhere. This is the
    // section that makes the resolution auditable: a reader can see that "add a
    // sport" resolved a VERB through the operations registry rather than
    // guessing at a noun.
    decomposition: {
      tokens,
      operations: decomposition.operations,
      concepts: decomposition.concepts.map((c) => ({ id: c.id, term: c.record.term ?? null, match: c.match, tokens: c.tokens })),
      jurisdictions: decomposition.jurisdictions,
      // Every one of these is a STABLE key that may be an empty array, never an
      // omitted one: a consumer must not need a presence check to tell "nothing
      // near-missed" from "this engine predates near-miss reporting".
      'near-miss': decomposition.nearMiss,
      residue,
      // The resolved context a residue finding is logged ALONGSIDE (UCS-1152).
      // The acceptance criterion is that residue is emitted "with the resolved
      // context attached" — a bare unresolved token is a finding nobody can act
      // on, while "`lacrosse` was unresolved in an ask that DID resolve
      // add-sport and new-jersey" localizes the gap precisely enough that the
      // minting decision writes itself.
      'resolved-context': [
        ...decomposition.operations.map((o) => o.value),
        ...decomposition.concepts.map((c) => c.id),
        ...decomposition.jurisdictions.map((j) => j.value),
      ],
    },
    // The scoring table the ranking above was computed with, so a consumer
    // reproducing it never hard-codes weights or vendors a copy that goes stale.
    scoring: scoringTable(),
    results,
    // Leaves as FIRST-CLASS scored results, not attachments (UCS-1152). The
    // concept-attached `knowledge` lists above are untouched and still
    // published: this extends the payload rather than breaking it, so every
    // existing consumer keeps working while a new one can read leaves directly.
    leaves: joined.leaves,
    // Excluded, never silently absent.
    exclusions: joined.exclusions,
    // Zero resolution is a NORMAL outcome and must be machine-distinguishable
    // from a failure (PRD §7). The conduct text is IN THE PAYLOAD rather than
    // only on the human surface, so an agent reading JSON is told what to do
    // next instead of inferring it from an empty array.
    ...(results.length || joined.leaves.length ? {} : { conduct: ZERO_RESOLUTION_CONDUCT }),
  };
}

/**
 * What to do when nothing resolved (PRD §7) — the fallback conduct, in the
 * payload.
 *
 * Zero resolution exits 0 and is a normal outcome, common in month one. What
 * makes it machine-distinguishable from a failure is not the exit code alone
 * but this: an explicit empty result WITH the conduct that follows from it. An
 * agent that receives empty arrays and no instruction has to guess whether the
 * lookup failed or the store is simply silent on the topic, and those demand
 * different next steps.
 */
const ZERO_RESOLUTION_CONDUCT = 'zero resolution is a normal outcome (PRD §7): fall back to search within survey-scope.yaml; append a retrieval-miss finding only if this topic plausibly should be mapped (an unmapped area the scope excludes is expected, not a miss)';

// ---------------------------------------------------------------- paths mode

/**
 * Normalize a path to the repo-root-relative posix form pointers use (§9.1):
 * backslashes become '/', `..`/`.`/`//` resolve away (path.posix semantics),
 * trailing slashes drop, and absolute paths relativize against `root`.
 * Wrong normalization is wrong ATTRIBUTION — `a/b/../c.ts` must hit the file
 * pointer `a/c.ts`, not the folder pointer `a/b`.
 */
function normPath(root, p) {
  let path = posix.normalize(p.trim().replace(/\\/g, '/'));
  if (posix.isAbsolute(path)) path = posix.relative(root.replace(/\\/g, '/'), path);
  path = path.replace(/\/+$/, '');
  return path === '.' ? '' : path;
}

/**
 * §3.1: a folder pointer nests over its subtree. Ask the filesystem, never
 * the name — the map is never the fact. `src/api.v2` is a directory whose
 * `extname` is ".v2", so a name-based guess drops every path beneath it: a
 * silent missed attribution in exactly the ACT pre-commit check a developer
 * trusts to say which concepts their change touches.
 *
 * The filesystem decides whenever it can. It cannot when the pointer does not
 * exist — `--paths` is fed from a diff, and a diff names deleted paths — so a
 * missing pointer falls back to the name: no extension, treat as a folder.
 * That keeps deletion attribution working (deleting a source-of-truth
 * directory still flags its concept) while never nesting under something that
 * looks like a file. Erring this way keeps every residual gap on the
 * missed-attribution side: a deleted DOTTED directory stops nesting, which
 * under-reports. Over-reporting would put a concept the change never touched
 * in front of a human, and false attribution is the costlier error here.
 *
 * An unreadable pointer (EACCES on its parent) is epistemically the same as an
 * absent one — the filesystem declines to say — so it takes the same name
 * fallback rather than crashing a lookup that can still answer for every other
 * pointer. `throwIfNoEntry: false` silences ENOENT only.
 *
 * Stat once per pointer: `--paths` crosses every pointer with every path.
 */
function folderPointerTest(repoRoot) {
  const cache = new Map();
  const statOrNull = (path) => {
    try {
      return statSync(path, { throwIfNoEntry: false }) ?? null;
    } catch {
      return null; // unreadable: the filesystem cannot decide, so the name does
    }
  };
  return (pointer) => {
    if (!cache.has(pointer)) {
      const stat = statOrNull(join(repoRoot, pointer));
      cache.set(pointer, stat ? stat.isDirectory() : posix.extname(pointer) === '');
    }
    return cache.get(pointer);
  };
}

function resolvePaths(model, rawPaths, repoRoot, today) {
  // Pointers are repo-root-relative (§9.1), so both sides normalize against
  // the repo root — the KK-08 two-root convention (model.root may be the
  // nested unknown-knowledge/ store dir in a seeded repo).
  // An entry that normalizes away (empty, ".", "src/..") names the repo root,
  // not a path inside it. Dropping it silently would shrink the lookup the
  // caller asked for — a lookup that never ran, wearing a clean exit.
  const rootish = rawPaths.filter((p) => normPath(repoRoot, p) === '');
  if (rootish.length) {
    throw new UsageError(`--paths entries ${rootish.map((p) => JSON.stringify(p)).join(', ')} name the repo root, not a path inside it — name the files or directories the change touched`);
  }
  const paths = [...new Set(rawPaths.map((p) => normPath(repoRoot, p)))].sort(compare);
  if (!paths.length) {
    throw new UsageError('--paths must name at least one path — a lookup that never ran is a failure, never a silent empty result');
  }
  const isFolderPointer = folderPointerTest(repoRoot);
  // Leaf `paths` are the second pointer family (UCS-1151), indexed once for the
  // whole lookup rather than re-walked per path: --paths already crosses every
  // pointer with every path, and a diff is routinely hundreds of paths.
  const leafPointers = leafPathIndex(model);
  /**
   * Does this declared pointer govern this path — exactly, or by nesting?
   *
   * A pointer that normalizes to EMPTY names the repo root, and it is skipped
   * rather than treated as a folder that nests over everything. The structural
   * validator refuses such a pointer outright (`missing-path`: a pointer at
   * everything attributes nothing), so this branch only runs against a store
   * that has not been validated — and the resolver deliberately never gates on
   * store health (§4), so it is reachable. Matching every path here would put
   * one leaf in front of every developer regardless of what they touched,
   * which is the false-attribution direction §3.1 already calls the costlier
   * error. Skipping keeps the residual gap on the under-reporting side, and
   * the validator is where the author is told to fix it.
   */
  const governs = (pointer, path) => {
    const p = normPath(repoRoot, pointer);
    if (p === '') return false;
    return path === p || (isFolderPointer(p) && path.startsWith(`${p}/`));
  };
  return paths.map((path) => {
    const seen = new Set();
    const concepts = [];
    for (const [pointer, ids] of model.pointers) {
      if (!governs(pointer, path)) continue;
      for (const id of ids) {
        if (seen.has(id)) continue; // keep the lexicographically first pointer
        seen.add(id);
        const record = model.concepts.get(id)?.record;
        concepts.push({
          id,
          term: record?.term ?? null,
          status: record?.status ?? null,
          pointer,
        });
      }
    }
    concepts.sort((a, b) => compare(a.id, b.id));
    return { path, concepts, knowledge: governingLeaves(model, path, concepts, leafPointers, governs, today) };
  });
}

/**
 * Leaf `paths` declarations, indexed pointer → leaf identities (UCS-1151).
 *
 * The leaf-side mirror of the loader's concept pointer index, built here rather
 * than in the loader because it is a resolver concern: nothing else joins over
 * it. Same shape and same guarantees — de-duplicated, sorted, so the reverse
 * lookup is stable regardless of authoring order.
 *
 * @param {object} model the loaded store model
 * @returns {Map<string, string[]>} declared path -> leaf identities
 */
function leafPathIndex(model) {
  const index = new Map();
  for (const entry of model.leaves.values()) {
    for (const path of strings(entry.record?.[LEAF_PATHS_FIELD])) {
      if (!index.has(path)) index.set(path, []);
      const identities = index.get(path);
      if (!identities.includes(entry.identity)) identities.push(entry.identity);
    }
  }
  for (const identities of index.values()) identities.sort(compare);
  return index;
}

/**
 * The leaves that GOVERN one path — the reverse lookup's whole point
 * (UCS-1151).
 *
 * Two joins, unioned, because a leaf can be attached to a file two different
 * ways and a developer about to edit that file needs both:
 *
 *   direct    the leaf declares the path in its own `paths` — it says outright
 *             that it governs this part of the tree.
 *   concept   the path is under a CONCEPT's source-of-truth pointer, and the
 *             leaf declared that concept. The knowledge is one hop away through
 *             the ontology, which is exactly the join the concept pointers were
 *             always for; before this ticket the reverse lookup stopped at the
 *             concept and left the reader to make that hop by hand.
 *
 * `via` says which, and `direct` wins when both fire: it is the leaf's own
 * claim about this path rather than an inference through a third record.
 *
 * Concept attribution reuses the `concepts` already computed for this path, so
 * the two halves of one result can never disagree about which concepts the path
 * touched — a second pointer walk here would be a second answer to a question
 * already settled four lines up.
 *
 * Stable-sorted the same way knowledge entry points are: promoted before
 * downranked, then by identity. An agent reading top-down reaches certified
 * knowledge first, and byte-stability does not depend on store iteration order.
 */
function governingLeaves(model, path, concepts, leafPointers, governs, today) {
  const via = new Map(); // leaf identity -> how it was reached
  for (const [pointer, identities] of leafPointers) {
    if (!governs(pointer, path)) continue;
    for (const identity of identities) via.set(identity, 'direct');
  }
  for (const { id } of concepts) {
    for (const identity of model.leavesByConcept.get(id) ?? []) {
      if (!via.has(identity)) via.set(identity, 'concept');
    }
  }
  const out = [];
  for (const [identity, how] of via) {
    const entry = model.leaves.get(identity);
    if (entry) out.push({ via: how, ...publishLeaf(model, entry, today) });
  }
  return out.sort((a, b) =>
    Number(a.downranked) - Number(b.downranked)
    || compare(a.id ?? a.notation, b.id ?? b.notation));
}

// ---------------------------------------------------------------- doc mode

/**
 * Resolve a whole document into a COVERAGE MAP (UCS-1156).
 *
 * The document is adapted into the IR by the versioned adapter seam
 * (UCS-1153), then the coverage module sections it and streams the store's
 * vocabularies over each section — using THIS command's `joinText`, so a
 * section's join is the query pipeline run over that section's text.
 *
 * The suppression entries are loaded here, from the same client-zone
 * `suppressions.yaml` the reverse audit reads, and they FAIL OPEN exactly as
 * they do there: a malformed file suppresses nothing and its warnings travel
 * into the payload, because a suppression that could silence a candidate by
 * being broken is one nobody can trust.
 *
 * @param {object} model the loaded store model
 * @param {string} document the submitted document's path
 * @param {string} kitRoot where suppressions.yaml lives
 * @param {string|null} today the injected date
 */
function resolveDoc(model, document, kitRoot, today) {
  // DISPATCH BEFORE READ, the same order ingest.js uses and for the same
  // reason: whether the bytes exist is irrelevant when no adapter claims the
  // format, and reading first would answer a `.docx` submission with "cannot
  // read", burying the conduct the submitter actually needs.
  adapterFor(document);
  let bytes;
  try {
    bytes = readFileSync(resolvePath(document));
  } catch (error) {
    rethrowIfBug(error);
    throw new UsageError(`cannot read ${document}: ${error.message}`);
  }
  const ir = adapt(document, bytes);
  const { entries, warnings } = loadSuppressions(kitRoot);
  const map = buildCoverageMap({
    document,
    ir,
    model,
    joinSection: (text) => joinText(model, text, today),
    suppressionEntries: entries,
  });
  // Warnings surface in the payload, never only on stderr: a malformed
  // suppressions file must not vanish silently from a machine-read output.
  // A STABLE KEY that may be an empty array, like every other field in this
  // payload — a consumer must never need a presence check to tell "the
  // suppressions file was clean" from "this engine predates the warning".
  return { ...map, 'suppression-warnings': warnings };
}

/**
 * The coverage map, for a human.
 *
 * Deliberately COMPACT. The map's whole promise is that it is cheaper to read
 * than the document, and a human surface that reprinted every join per section
 * would cost as much as the document it summarizes. So: one line per section
 * with its locator, one line per gathered leaf with its verdict, and the ranked
 * candidates. The `--json` payload carries everything.
 */
function renderDoc(payload) {
  const lines = [];
  const map = payload.map;
  lines.push(
    `resolve --doc ${map.document} -> ${map.sections.length} section(s) with signal, `
    + `${map.gather.length} governed leaf/leaves, ${map['candidates-ranked'].length} candidate(s)`,
    '',
    `adapter: ${map.adapter}  hash: ${map.hash}  (byte-identical resubmission dedupes on this hash)`,
    `ir: ${map.ir.blocks} block(s) -> ${map.ir.sections} section(s); `
    + `repetition threshold ${map.ir['repetition-threshold']} (pinned step function of document size)`,
    '',
  );
  renderTimeCheck(payload, lines);
  renderHealth(payload['store-health'], lines);

  if (map.sections.length) {
    lines.push('coverage by section:');
    for (const s of map.sections) {
      const at = s.locator.line === undefined
        ? `p${s.locator.page}-${s.locator.endPage}`
        : `L${s.locator.line}-${s.locator.endLine}`;
      lines.push(`  ${at}  ${s.section}`);
      const joins = [
        s.joins.operations.length ? `operations: ${s.joins.operations.join(', ')}` : null,
        s.joins.concepts.length ? `concepts: ${s.joins.concepts.join(', ')}` : null,
        s.joins.jurisdictions.length ? `jurisdictions: ${s.joins.jurisdictions.join(', ')}` : null,
        s.joins.leaves.length ? `leaves: ${s.joins.leaves.join(', ')}` : null,
      ].filter(Boolean);
      for (const join of joins) lines.push(`    ${join}`);
      if (s.candidates.length) lines.push(`    candidates: ${s.candidates.join(', ')}`);
      // Folded sections are named, not merely counted away: an agent may need
      // to open any one of them, so each keeps its own address and locator.
      if (s['repeats-count']) {
        const shown = s.repeats.map((r) => r.section).join(', ');
        const more = s['repeats-count'] - s.repeats.length;
        lines.push(`    same coverage in ${s['repeats-count']} other section(s): ${shown}${more ? ` (+${more} more)` : ''}`);
      }
    }
    lines.push('');
  }

  if (map.gather.length) {
    lines.push('gather rollup:');
    for (const g of map.gather) {
      lines.push(`  ${g.id ? `${g.id}  ` : ''}${g.notation}  ${g.heading}  score ${g.score}  [${g.verdict}]  (${g.file})`);
      const reached = `${g.sections.join(', ')}${g['sections-more'] ? ` (+${g['sections-more']} more)` : ''}`;
      lines.push(`    signals: ${g.signals.join(', ')}    sections: ${reached}`);
      // The flag is printed on its own line because it is a claim about
      // applicability the reader has to act on, not a detail of the hit.
      if (g['scope-mismatch']) lines.push(`    scope-mismatch: ${g['scope-mismatch']}`);
      for (const d of g.demotions) lines.push(`    demoted (${d.reason}): ${d.detail}`);
    }
    lines.push('');
  }

  if (map['candidates-ranked'].length) {
    lines.push('candidates (ranked — the document\'s residue, section-addressed):');
    for (const c of map['candidates-ranked']) {
      const where = `${c.sections.join(', ')}${c['sections-more'] ? ` (+${c['sections-more']} more)` : ''}`;
      lines.push(`  ${c.term}  x${c.count}  [${c.signatures.join(', ')}]  in ${where}`);
    }
    lines.push('');
  }
  // Suppressed candidates are NAMED, not counted away: "reported as suppressed
  // rather than silently absent" is the acceptance criterion, and a bare count
  // would leave a reader unable to tell which term a steward had settled.
  if (map.suppressed.length) {
    lines.push('suppressed candidates (a steward refused these; reported, never silently absent):');
    for (const c of map.suppressed) lines.push(`  ${c.term}  x${c.count}  in ${c.sections.join(', ')}`);
    lines.push('');
  }
  for (const w of payload.map['suppression-warnings'] ?? []) lines.push(w);
  lines.push('open a section just-in-time with its locator — the context cost is this map plus what you open, never the document');
  return lines;
}

// ------------------------------------------------------------- CLI plumbing

function parseArgs(argv) {
  const { options, positionals } = parseFlags(argv, {
    boolean: ['json'],
    value: ['root', 'today', 'doc'],
    repeatable: ['paths'],
    // Query terms arrive as bare arguments; --paths is the reverse lookup;
    // --doc is the third input shape (UCS-1156).
    positionals: true,
  });
  const opts = {
    json: !!options.json,
    root: options.root ?? process.cwd(),
    paths: options.paths ? options.paths.flatMap((v) => v.split(',')) : null,
    doc: options.doc ?? null,
    terms: positionals,
    // The injected date the time verdicts are measured against (UCS-1150).
    // Null is a legitimate answer, not a default to be filled in: without it
    // the verdicts report themselves skipped, and the output says so.
    today: options.today ?? null,
  };
  if (opts.today !== null && !isCalendarDate(opts.today)) {
    // Same strictness as audit and preflight (UCS-957): `Date.parse` rolls
    // 2026-02-30 forward to March 2nd, so a leaf's age would be measured from
    // a day the caller never named — and here that age decides a demotion.
    throw new UsageError(`--today must be a real calendar date (YYYY-MM-DD), got ${JSON.stringify(opts.today)}`);
  }
  // The three input shapes are alternatives, not a combination. Two of them at
  // once has no honest answer — a coverage map of a document is not a lookup of
  // a query — so it is a usage error rather than a silently-preferred mode.
  const shapes = [
    opts.terms.length ? 'query terms' : null,
    opts.paths ? '--paths' : null,
    opts.doc ? '--doc' : null,
  ].filter(Boolean);
  if (shapes.length > 1) {
    throw new UsageError(`give exactly one input shape, got ${shapes.join(' and ')} — a query, --paths, or --doc`);
  }
  if (!shapes.length) {
    throw new UsageError('nothing to resolve — give query terms, --paths, or --doc');
  }
  return opts;
}

function renderHealth(health, lines) {
  if (health.ok && !health.warnings) return; // warnings surface even when ok
  lines.push(
    `store health: ${health.errors} error(s), ${health.warnings} warning(s) — resolution ran on what loaded; run preflight for verdicts`,
    '',
  );
}

/**
 * A leaf's one-hop neighborhood, for the human surface (UCS-1151).
 *
 * Only NON-EMPTY kinds are printed, which is the opposite of the JSON contract
 * on purpose: JSON keeps every kind as a stable key so a consumer never needs a
 * presence check, while a human reading four "(none)" lines per leaf learns
 * nothing and loses the hits in the noise. The kind is always named — the whole
 * value of a typed edge is that `contradicts` and `see-also` do not mean the
 * same thing to the agent deciding what to read next.
 *
 * @param {object} leaf a published leaf
 * @param {string} indent leading whitespace for the block
 */
function renderRelates(leaf, indent = '      ') {
  const lines = [];
  for (const kind of RELATES_KINDS) {
    const neighbors = leaf[RELATES_FIELD]?.[kind] ?? [];
    if (!neighbors.length) continue;
    lines.push(`${indent}${kind}: ${neighbors.map((n) => `${n.id ?? n.notation} "${n.heading ?? '?'}"`).join(', ')}`);
  }
  return lines;
}

/**
 * The demotion marker for one published leaf, for the human surface
 * (UCS-1150).
 *
 * Every demotion that fired is named, on the line the ordering already put the
 * leaf on — a reader skimming top-down sees WHY a leaf sits at the bottom
 * without a second lookup. A leaf that is both draft and stale shows both: the
 * two are independent reasons to distrust it, and printing only the first would
 * hide a stale verdict behind a draft one.
 */
const renderDemotions = (leaf) => (leaf.demotions?.length
  ? `  [${leaf.demotions.map((d) => (d.reason === 'time'
    ? `stale — ${leaf.time.volatility} verified ${leaf.time.age}d ago > ${leaf.time.limit}d`
    : `${leaf.stage} — downranked`)).join('; ')}]`
  : '');

/**
 * Whether time verdicts ran, printed on every human run (UCS-1150).
 *
 * Unconditional, and that is the requirement rather than a stylistic choice: a
 * run without `--today` computed no freshness verdicts, and a surface that said
 * nothing would be indistinguishable from one that checked and found everything
 * fresh. A check that never ran is never a silent pass (PRD §5).
 */
const renderTimeCheck = (payload, lines) => lines.push(`time check: ${payload['time-check']}`, '');

/**
 * The decomposition block, for the human surface (UCS-1152).
 *
 * Printed BEFORE the results, because it is what the results follow from: a
 * reader who sees "verb: add-sport" first understands why leaves about sports
 * registries came back for an ask that named no concept. Only non-empty axes
 * print — except residue and exclusions, which print their absence explicitly
 * elsewhere, since "nothing was unresolved" is a claim worth making out loud.
 */
function renderDecomposition(payload, lines) {
  const d = payload.decomposition;
  if (!d) return;
  lines.push('decomposition:');
  if (d.operations.length) {
    lines.push(`  verb  -> operations: ${d.operations.map((o) => `${o.value} (matched "${o.matched}")`).join(', ')}`);
  }
  if (d.concepts.length) {
    // `match` is the ladder's rung, and it is null for a concept the phrase
    // test reached but the ladder did not. Printed as `named` rather than as
    // "null", because that is what it means: the ask named this concept without
    // being a query for it, which is the ordinary case for any ask that says
    // more than one thing.
    lines.push(`  noun  -> concepts: ${d.concepts.map((c) => `${c.id} "${c.term ?? '?'}" (${c.match ?? 'named'})`).join(', ')}`);
  }
  if (d.jurisdictions.length) {
    lines.push(`  place -> jurisdictions: ${d.jurisdictions.map((j) => `${j.value} (matched "${j.matched}")`).join(', ')}`);
  }
  if (!d.operations.length && !d.concepts.length && !d.jurisdictions.length) {
    lines.push('  no axis of this ask joined a governed vocabulary');
  }
  // Residue is stated either way. "Residue: none" is the store saying it
  // understood the whole ask, which is a different and more useful message than
  // saying nothing at all.
  lines.push(d.residue.length
    ? `  residue (unresolved): ${d.residue.join(', ')}  [resolved context: ${d['resolved-context'].join(', ') || 'none'}]`
    : '  residue: none — every non-stopword token resolved');
  for (const m of d['near-miss']) {
    lines.push(`  near-miss: ${m.kind} ${m.id} — token overlap [${m.overlap.join(', ')}] below the match threshold`);
  }
  lines.push('');
}

/** Scope exclusions, for the human surface — excluded, never silently absent. */
function renderExclusions(payload, lines) {
  if (!payload.exclusions?.length) return;
  lines.push('excluded by scope:');
  for (const x of payload.exclusions) {
    lines.push(`  ${x.id ? `${x.id}  ` : ''}${x.notation}  ${x.heading}  (${x.file})`);
    lines.push(`    ${x.reason}`);
  }
  lines.push('');
}

/** Leaves as first-class results, for the human surface (UCS-1152). */
function renderLeaves(payload, lines) {
  if (!payload.leaves?.length) return;
  lines.push(`knowledge leaves -> ${payload.leaves.length}`);
  for (const leaf of payload.leaves) {
    lines.push(`  ${leaf.id ? `${leaf.id}  ` : ''}${leaf.notation}  ${leaf.heading}  score ${leaf.score}${renderDemotions(leaf)}  (${leaf.file})`);
    // The signals, so the score is reproducible on the human surface too — a
    // ranking a reader cannot decompose is one they cannot check.
    lines.push(`    signals: ${leaf.signals.map((s) => `${s.signal}:${s.via} +${s.score}`).join(', ')}`);
    if (leaf.excerpt) lines.push(`    ${leaf.excerpt}`);
    lines.push(...renderRelates(leaf, '    '));
  }
  lines.push('');
}

function renderQuery(payload) {
  const lines = [];
  const n = payload.results.length;
  lines.push(`resolve "${payload.query}" -> ${n} concept${n === 1 ? '' : 's'}`, '');
  renderTimeCheck(payload, lines);
  renderHealth(payload['store-health'], lines);
  renderDecomposition(payload, lines);
  renderLeaves(payload, lines);
  renderExclusions(payload, lines);
  if (!n) {
    // The same conduct the payload carries, so the two surfaces cannot drift
    // into telling a reader different things about the same empty result.
    if (payload.conduct) lines.push(payload.conduct);
    else lines.push('no concepts matched, but knowledge leaves resolved directly — see above');
    return lines;
  }
  for (const r of payload.results) {
    lines.push(`${r.id}  ${r.term}  [${r.status}]  score ${r.score} (${r.match})`);
    for (const c of r['confusable-with']) {
      lines.push(`  confusable-with: ${c.id} "${c.term ?? '?'}" — confirm this is the concept you mean`);
    }
    if (r.summary) lines.push(`  summary: ${r.summary}`);
    if (r['source-of-truth'].length) {
      lines.push('  source-of-truth:');
      for (const p of r['source-of-truth']) lines.push(`    ${p}`);
    }
    if (r.knowledge.length) {
      lines.push('  knowledge entry points:');
      // The accession leads — it is the leaf's identity and what a citation
      // must spell (UCS-1147) — with the legacy notation still shown after it,
      // since a reader navigating an older tree still recognizes it.
      // The draft marker rides the same line as the heading, so the demotion is
      // visible where the ordering already put the leaf last — an agent
      // skimming the list sees WHY a leaf sits at the bottom without a second
      // lookup. The derived excerpt follows indented beneath, which is the
      // display prose the retired `description` field used to be for; a leaf
      // whose body opens with no prose simply shows no excerpt line.
      for (const k of r.knowledge) {
        lines.push(`    ${k.id ? `${k.id}  ` : ''}${k.notation}  ${k.heading}${renderDemotions(k)}  (${k.file})`);
        if (k.excerpt) lines.push(`      ${k.excerpt}`);
        lines.push(...renderRelates(k));
      }
    }
    lines.push('');
  }
  return lines;
}

function renderPaths(payload) {
  const lines = [];
  const n = payload.paths.length;
  lines.push(`resolve --paths -> ${n} path${n === 1 ? '' : 's'}`, '');
  renderTimeCheck(payload, lines);
  renderHealth(payload['store-health'], lines);
  for (const { path, concepts, knowledge } of payload.paths) {
    lines.push(path);
    if (!concepts.length) {
      lines.push('  no concepts point at this path');
    }
    for (const c of concepts) {
      lines.push(`  ${c.id}  ${c.term ?? '?'}  [${c.status}]  (pointer: ${c.pointer})`);
    }
    // The leaves that govern this path (UCS-1151) — the knowledge to read
    // BEFORE editing the file, which is the whole reason a diff is fed in here.
    // `via` is shown because "this leaf names your file" and "this leaf covers a
    // concept your file is under" are different strengths of claim.
    if (knowledge.length) {
      lines.push('  governing knowledge:');
      for (const k of knowledge) {
        lines.push(`    ${k.id ? `${k.id}  ` : ''}${k.notation}  ${k.heading}  [via ${k.via}]${renderDemotions(k)}  (${k.file})`);
        if (k.excerpt) lines.push(`      ${k.excerpt}`);
        lines.push(...renderRelates(k));
      }
    }
    lines.push('');
  }
  lines.push('update every concept listed above in the same commit as the change (PRD §7 ACT)');
  return lines;
}

export function main(argv) {
  {
    const opts = parseArgs(argv);

    let model;
    let kitRoot;
    try {
      // KK-08 two-root convention: --root is the REPO root; the stores live
      // at <root>/unknown-knowledge/ when seeded (§9.1) or at the root itself
      // (dogfood layout).
      kitRoot = locateKitRoot(opts.root);
      model = loadStores(kitRoot);
    } catch (error) {
      // An EXPECTED refusal from the loader — an unreadable root, an ambiguous
      // kit layout, a Store that will not load. The stores this command would
      // check never loaded, so its checks never ran: exit 2, never 1.
      process.stderr.write(`resolve: ${error.message}\n`);
      rethrowIfBug(error); // a bug, or a UsageError raised deep in the loader, is not ours to speak for
      return EXIT_CODES.FAILURE;
    }

    const health = healthSummary(storeHealth(model));
    // `time-check` is on EVERY payload, in both modes, whether or not --today
    // was passed (UCS-1150). A run that computed no verdicts must say so in
    // its output — otherwise it is indistinguishable from one that checked and
    // found everything fresh, which is a check that never ran wearing a clean
    // result (PRD §5).
    const timeCheck = timeCheckStatus(opts.today);
    let payload;
    if (opts.doc) {
      // An out-of-envelope submission is an ANTICIPATED REFUSAL, not a bug: it
      // exits 2 with the adapter's conduct, because a parse that never ran is a
      // failure and never a silent partial (PRD §5.1). The exit contract is
      // unchanged — 0 ran, 2 never ran, never 1.
      try {
        payload = {
          mode: 'doc',
          'time-check': timeCheck,
          'store-health': health,
          map: resolveDoc(model, opts.doc, kitRoot, opts.today),
        };
      } catch (error) {
        rethrowIfBug(error);
        if (!(error instanceof UnsupportedFormatError || error instanceof AdaptError)) throw error;
        // Nothing goes to stdout: a caller piping it must receive no map at
        // all, not a truncated one.
        process.stderr.write(`error: ${error.message}\n`);
        return EXIT_CODES.FAILURE;
      }
    } else if (opts.paths) {
      payload = {
        mode: 'paths', 'time-check': timeCheck, 'store-health': health,
        paths: resolvePaths(model, opts.paths, opts.root, opts.today),
      };
    } else {
      payload = {
        mode: 'query', 'time-check': timeCheck, 'store-health': health,
        ...resolveQuery(model, opts.terms, opts.today),
      };
    }

    const RENDER = { query: renderQuery, paths: renderPaths, doc: renderDoc };
    const lines = opts.json
      ? [JSON.stringify(payload, null, 2)]
      : RENDER[payload.mode](payload);
    process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
    return EXIT_CODES.CLEAN;
  }
}
