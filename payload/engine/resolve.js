#!/usr/bin/env node
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
 * --paths mode — reverse lookup over the loader's pointer index: "which
 * concepts point at these files". A path matches a pointer when equal to it or
 * nested under a FOLDER pointer (§3.1 folder pointers — a pointer with an
 * extension is a file pointer; nothing nests under a file). Paths are
 * normalized with path.posix semantics (dots resolved, separators collapsed,
 * backslashes converted, absolute paths relativized against the store root) so
 * attribution survives the forms real tooling emits. A lookup, not subset
 * validation (no D-012 conflict). Paths are deduped and sorted ascending.
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
import { loadStores, locateKitRoot } from './lib/load-stores.js';
import { EXIT_CODES } from './lib/exit-codes.js';
import { compare } from './lib/validate-record.js';

const USAGE = `usage: node payload/engine/resolve.js <query terms...> [--json] [--root <dir>]
       node payload/engine/resolve.js --paths <file1,file2> [--json] [--root <dir>]`;

const MATCH_SCORES = Object.freeze({
  'exact-term': 100,
  'exact-alias': 80,
  'term-match': 60,
  'alias-match': 50,
  'summary-match': 40,
});
const STATUS_DOWNRANK = 30; // draft/proposed (§3.5); floor 1 — a match still surfaces

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

class UsageError extends Error {}

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

/** Knowledge entry points: leaves whose `terms` name the concept term/alias. */
function knowledgeEntryPoints(model, record) {
  const names = new Set(
    [record.term, ...strings(record.aliases)]
      .filter((s) => typeof s === 'string')
      .map(norm),
  );
  const out = [];
  for (const { notation, file, record: leaf } of model.leaves.values()) {
    if (strings(leaf.terms).some((t) => names.has(norm(t)))) {
      out.push({ notation, heading: leaf.heading ?? null, file });
    }
  }
  return out; // model.leaves is already sorted by notation
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
 * Stat once per pointer: `--paths` crosses every pointer with every path.
 */
function folderPointerTest(repoRoot) {
  const cache = new Map();
  return (pointer) => {
    if (!cache.has(pointer)) {
      const stat = statSync(join(repoRoot, pointer), { throwIfNoEntry: false });
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
  const opts = { json: false, root: process.cwd(), paths: null, terms: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // Both conventional flag spellings: `--flag value` and `--flag=value`.
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (flag === '--json') {
      if (eq !== -1) throw new UsageError('--json takes no value');
      opts.json = true;
    } else if (flag === '--root' || flag === '--paths') {
      let value;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
        // `--root=` is as valueless as a bare `--root`: an empty root would
        // silently resolve to cwd, answering about a repo nobody named.
        if (value === '') throw new UsageError(`${flag} requires a value`);
      } else {
        value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new UsageError(`${flag} requires a value`);
        }
        i += 1;
      }
      if (flag === '--root') opts.root = value;
      else opts.paths = [...(opts.paths ?? []), ...value.split(',')];
    } else if (arg.startsWith('--')) {
      throw new UsageError(`unknown flag ${arg}`);
    } else {
      opts.terms.push(arg);
    }
  }
  if (opts.paths && opts.terms.length) {
    throw new UsageError('give either query terms or --paths, not both');
  }
  if (!opts.paths && !opts.terms.length) {
    throw new UsageError('nothing to resolve — give query terms or --paths');
  }
  return opts;
}

function storeHealth(model) {
  const errors = model.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = model.diagnostics.filter((d) => d.severity === 'warning').length;
  return { ok: model.ok, errors, warnings };
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
      for (const k of r.knowledge) lines.push(`    ${k.notation}  ${k.heading}  (${k.file})`);
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

function main(argv) {
  try {
    const opts = parseArgs(argv);

    let model;
    try {
      // KK-08 two-root convention: --root is the REPO root; the stores live
      // at <root>/unknown-knowledge/ when seeded (§9.1) or at the root itself
      // (dogfood layout).
      model = loadStores(locateKitRoot(opts.root));
    } catch (error) {
      process.stderr.write(`resolve: ${error.message}\n`);
      return EXIT_CODES.FAILURE;
    }

    const health = storeHealth(model);
    const payload = opts.paths
      ? { mode: 'paths', 'store-health': health, paths: resolvePaths(model, opts.paths, opts.root) }
      : { mode: 'query', 'store-health': health, ...resolveQuery(model, opts.terms) };

    const lines = opts.json
      ? [JSON.stringify(payload, null, 2)]
      : (payload.mode === 'query' ? renderQuery(payload) : renderPaths(payload));
    process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
    return EXIT_CODES.CLEAN;
  } catch (error) {
    // One handler for every phase's usage errors, so the paths never drift.
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`resolve: ${error.message}\n${USAGE}\n`);
    return EXIT_CODES.FAILURE;
  }
}

// exitCode, never process.exit(): exit() drops queued async stdout writes, so
// piped --json output would truncate at the ~64KB pipe buffer (corrupt JSON
// with exit 0). Node exits on its own once stdout drains.
process.exitCode = main(process.argv.slice(2));
