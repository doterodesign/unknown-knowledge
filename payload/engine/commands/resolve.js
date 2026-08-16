/**
 * Resolver (KK-06) — the runtime loop's RESOLVE step and the ACT step's
 * pre-commit reverse lookup (PRD §4, §7). Plain CLI so any agent that can run
 * a shell command gets resolution — no MCP required.
 *
 *   node payload/engine/resolve.js <query terms...> [--json] [--root <dir>]
 *   node payload/engine/resolve.js --paths <file1,file2> [--json] [--root <dir>]
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
 * Each knowledge entry point publishes both leaf ids: `id`, the accession
 * (L-NNNNNN) when the leaf has been minted one and null when it has not, and
 * `notation`, its position in the tree (UCS-1144). Two fields because they
 * answer two questions — which leaf this is, and where it sits — and once
 * accessions are minted those stop being the same string.
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
import { statSync } from 'node:fs';
import { join, posix } from 'node:path';
import {
  LEAF_PATHS_FIELD, RELATES_FIELD, RELATES_KINDS, healthSummary, isPrePromotionStatus,
  leafIdentityOf, leafStage, loadStores, storeHealth,
} from '../lib/load-stores.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { UsageError, parseArgs as parseFlags, rethrowIfBug } from '../lib/cli.js';
import { compare } from '../lib/validate-record.js';

export const USAGE = `usage: node payload/engine/resolve.js <query terms...> [--json] [--root <dir>]
       node payload/engine/resolve.js --paths <file1,file2> [--json] [--root <dir>]`;

const MATCH_SCORES = Object.freeze({
  'exact-term': 100,
  'exact-alias': 80,
  'term-match': 60,
  'alias-match': 50,
  'summary-match': 40,
});
const STATUS_DOWNRANK = 30; // draft/proposed (§3.5); floor 1 — a match still surfaces

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

function score(match, status) {
  const base = MATCH_SCORES[match];
  return status === 'draft' || status === 'proposed'
    ? Math.max(1, base - STATUS_DOWNRANK)
    : base;
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
 * Neighbors resolve through `leafIdentityOf`, so an edge citing a leaf by
 * notation reaches an accessioned leaf exactly as one citing it by accession
 * does (UCS-1144) — both spellings are legal, so neither is a second-class
 * lookup. An edge that resolves to nothing is DROPPED here rather than
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
function publishLeaf(model, entry) {
  const { file, record: leaf } = entry;
  const stage = leafStage(leaf);
  const provenance = leaf.provenance;
  return {
    // `notation` and `id` are this command's PUBLISHED field names (§4), so
    // they are spelled here on purpose; the VALUES come from the loader's
    // indexed entry, which is what an id-space change moves (UCS-1142).
    // Wire name and storage field are two different decisions.
    //
    // `id` is the accession, EXPLICITLY null for a leaf that has not been
    // minted one (UCS-1144) rather than omitted. Omission would make the key
    // set vary leaf by leaf, so a store mid-migration would emit two
    // different result shapes and every consumer would need a presence check
    // to tell "no accession" from "old engine". A stable key whose value is
    // null says the one thing that is true: this leaf has no accession yet.
    //
    // Placed before `notation` because it is the identity once minting
    // completes; JSON.stringify preserves insertion order, so this fixes the
    // field's position in the byte-stable output for good.
    //
    // `notation` stays the leaf's NOTATION, not its identity: once a leaf
    // mints an accession those stop being the same string, and a published
    // field that silently changed meaning would break every consumer
    // reading it as a tree position. Identity moves to `id`; `notation`
    // keeps saying what it always said.
    // Both ids are published as STRING-OR-NULL, tested with `typeof` rather
    // than `??`: `??` only catches null/undefined, so an unquoted YAML
    // `id: 12345` — a number, not an accession — would travel into the JSON
    // as a number and break the field's published type for every consumer.
    // The schema already rejects that leaf, but the resolver never gates on
    // store health (a lookup runs on whatever loaded, §4), so it is the one
    // surface that can be asked to publish an id no check has approved.
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
    downranked: isPrePromotionStatus(stage),
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

function knowledgeEntryPoints(model, record, conceptId) {
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
      out.push({ via: declared ? VIA_DECLARED : VIA_TERMS, ...publishLeaf(model, entry) });
    }
  }
  // Stable by construction: model.leaves is already sorted by leaf id, and a
  // boolean comparator moves only the downranked ones, so ties never reorder.
  return out.sort((a, b) => Number(a.downranked) - Number(b.downranked));
}

function resolveQuery(model, terms) {
  const query = norm(terms.join(' '));
  const queryWords = words(query);
  if (!queryWords.length) throw new UsageError('query terms must contain a word');
  const results = [];
  for (const { id, file, record } of model.concepts.values()) {
    const match = matchConcept(query, queryWords, record);
    if (!match) continue;
    results.push({
      id,
      term: record.term ?? null,
      summary: record.summary ?? null,
      status: record.status ?? null,
      score: score(match, record.status),
      match,
      file,
      'source-of-truth': strings(record['source-of-truth']),
      'confusable-with': confusables(model, record),
      knowledge: knowledgeEntryPoints(model, record, id),
    });
  }
  results.sort((a, b) => b.score - a.score || compare(a.id, b.id));
  return { query, results };
}

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

function resolvePaths(model, rawPaths, repoRoot) {
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
    return { path, concepts, knowledge: governingLeaves(model, path, concepts, leafPointers, governs) };
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
function governingLeaves(model, path, concepts, leafPointers, governs) {
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
    if (entry) out.push({ via: how, ...publishLeaf(model, entry) });
  }
  return out.sort((a, b) =>
    Number(a.downranked) - Number(b.downranked)
    || compare(a.id ?? a.notation, b.id ?? b.notation));
}

// ------------------------------------------------------------- CLI plumbing

function parseArgs(argv) {
  const { options, positionals } = parseFlags(argv, {
    boolean: ['json'],
    value: ['root'],
    repeatable: ['paths'],
    // Query terms arrive as bare arguments; --paths is the reverse lookup.
    positionals: true,
  });
  const opts = {
    json: !!options.json,
    root: options.root ?? process.cwd(),
    paths: options.paths ? options.paths.flatMap((v) => v.split(',')) : null,
    terms: positionals,
  };
  if (opts.paths && opts.terms.length) {
    throw new UsageError('give either query terms or --paths, not both');
  }
  if (!opts.paths && !opts.terms.length) {
    throw new UsageError('nothing to resolve — give query terms or --paths');
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

function renderQuery(payload) {
  const lines = [];
  const n = payload.results.length;
  lines.push(`resolve "${payload.query}" -> ${n} concept${n === 1 ? '' : 's'}`, '');
  renderHealth(payload['store-health'], lines);
  if (!n) {
    lines.push(
      'no concepts matched — a normal outcome (PRD §7). Fall back to search within',
      'survey-scope.yaml; append a retrieval-miss finding only if this topic plausibly',
      'should be mapped (an unmapped area the scope excludes is expected, not a miss).',
    );
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
      // The accession leads when there is one — it is the leaf's identity —
      // with the notation still shown, since that is what the tree and every
      // not-yet-migrated citation spell. An unminted leaf reads exactly as it
      // did before (UCS-1144).
      // The draft marker rides the same line as the heading, so the demotion is
      // visible where the ordering already put the leaf last — an agent
      // skimming the list sees WHY a leaf sits at the bottom without a second
      // lookup. The derived excerpt follows indented beneath, which is the
      // display prose the retired `description` field used to be for; a leaf
      // whose body opens with no prose simply shows no excerpt line.
      for (const k of r.knowledge) {
        lines.push(`    ${k.id ? `${k.id}  ` : ''}${k.notation}  ${k.heading}${k.downranked ? `  [${k.stage} — downranked]` : ''}  (${k.file})`);
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
        lines.push(`    ${k.id ? `${k.id}  ` : ''}${k.notation}  ${k.heading}  [via ${k.via}]${k.downranked ? `  [${k.stage} — downranked]` : ''}  (${k.file})`);
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
    try {
      // KK-08 two-root convention: --root is the REPO root; the stores live
      // at <root>/unknown-knowledge/ when seeded (§9.1) or at the root itself
      // (dogfood layout).
      model = loadStores(locateKitRoot(opts.root));
    } catch (error) {
      // An EXPECTED refusal from the loader — an unreadable root, an ambiguous
      // kit layout, a Store that will not load. The stores this command would
      // check never loaded, so its checks never ran: exit 2, never 1.
      process.stderr.write(`resolve: ${error.message}\n`);
      rethrowIfBug(error); // a bug, or a UsageError raised deep in the loader, is not ours to speak for
      return EXIT_CODES.FAILURE;
    }

    const health = healthSummary(storeHealth(model));
    const payload = opts.paths
      ? { mode: 'paths', 'store-health': health, paths: resolvePaths(model, opts.paths, opts.root) }
      : { mode: 'query', 'store-health': health, ...resolveQuery(model, opts.terms) };

    const lines = opts.json
      ? [JSON.stringify(payload, null, 2)]
      : (payload.mode === 'query' ? renderQuery(payload) : renderPaths(payload));
    process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
    return EXIT_CODES.CLEAN;
  }
}
