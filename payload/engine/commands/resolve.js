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
 * A leaf at a pre-promotion stage is DOWNRANKED: flagged `downranked: true` and
 * sorted below every promoted entry point. The flag comes off the same
 * `isPrePromotionStatus` predicate preflight verdicts on, so the resolver's
 * demotion and preflight's unknown verdict cannot disagree about which leaves
 * are provisional.
 *
 * --paths mode — reverse lookup over the loader's pointer index: "which
 * concepts point at these files". A path matches a pointer when equal to it or
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
import { healthSummary, isPrePromotionStatus, leafStage, loadStores, storeHealth } from '../lib/load-stores.js';
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
 *   - Leading blank lines and markdown structure are skipped. Fixture and
 *     template leaves carry no H1 (the frontmatter `heading` is the title), but
 *     a client's leaf may, and a heading is not a topic sentence.
 *   - The first PARAGRAPH is what gets read, with its internal newlines
 *     collapsed to single spaces: bodies are hard-wrapped, so a sentence
 *     routinely spans two lines and a line-based reader would truncate it.
 *   - A sentence ends at `.`/`!`/`?` followed by whitespace or end-of-text.
 *     `§4.2` and `v3.` do not end a sentence mid-token, which is why the
 *     following character must be whitespace rather than anything at all.
 *   - A paragraph with no terminator IS the excerpt — a body whose opening line
 *     is a fragment still has display prose, and returning null there would
 *     silently blank the surface rather than show what the author wrote.
 *
 * @param {string|undefined} body the markdown below the front matter
 * @returns {string|null}
 */
export function firstSentence(body) {
  if (typeof body !== 'string') return null;
  const paragraph = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    // Markdown structure is not prose: skip headings, list items, quotes, and
    // fenced code until an actual paragraph turns up.
    .find((block) => block !== '' && !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|\|)/.test(block));
  if (!paragraph) return null;
  const flat = paragraph.replace(/\s+/g, ' ').trim();
  const end = flat.search(/[.!?](\s|$)/);
  return end === -1 ? flat : flat.slice(0, end + 1);
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
function knowledgeEntryPoints(model, record) {
  const names = new Set(
    [record.term, ...strings(record.aliases)]
      .filter((s) => typeof s === 'string')
      .map(norm),
  );
  const out = [];
  for (const entry of model.leaves.values()) {
    const { file, record: leaf } = entry;
    if (strings(leaf.terms).some((t) => names.has(norm(t)))) {
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
      //
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
      const stage = leafStage(leaf);
      const provenance = leaf.provenance;
      out.push({
        id: typeof entry.id === 'string' ? entry.id : null,
        notation: typeof entry.notation === 'string' ? entry.notation : null,
        heading: leaf.heading ?? null,
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
      });
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
      knowledge: knowledgeEntryPoints(model, record),
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
  return paths.map((path) => {
    const seen = new Set();
    const concepts = [];
    for (const [pointer, ids] of model.pointers) {
      const p = normPath(repoRoot, pointer);
      if (path !== p && !(isFolderPointer(p) && path.startsWith(`${p}/`))) continue;
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
    return { path, concepts };
  });
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
  for (const { path, concepts } of payload.paths) {
    lines.push(path);
    if (!concepts.length) {
      lines.push('  no concepts point at this path');
    }
    for (const c of concepts) {
      lines.push(`  ${c.id}  ${c.term ?? '?'}  [${c.status}]  (pointer: ${c.pointer})`);
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
