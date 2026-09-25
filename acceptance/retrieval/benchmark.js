// Test-only retrieval benchmark over the development-v2 gold judgments.
//
// Answers one question per retriever: for each task, how deep in the ranking
// does the first complete source bundle appear, and what did the call cost?
// A bundle is a minimal sufficient passage set from the independent source
// judgments; each passage maps to exactly one materialized record. Unanswerable
// tasks are scored on their explanation bundles (the evidence a scoped
// abstention rests on) and on whether the retriever declined to claim an answer.
//
// Usage: node acceptance/retrieval/benchmark.js MATERIALIZED_DIR [resolve|ask ...]
// MATERIALIZED_DIR is the output of materialize-development.js.
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const corpus = join(repository, 'acceptance/retrieval/development-v2');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const DEPTHS = [1, 3, 5, 10];

/** Gold tasks joined to materialized record handles (`installation/kind/id`). */
export function loadGold(materializedDir) {
  const tasks = read(join(corpus, 'tasks.json'));
  const materialization = read(join(materializedDir, 'materialization.json'));
  const judged = new Map();
  for (const file of readdirSync(join(corpus, 'source-judgments'))) {
    for (const task of read(join(corpus, 'source-judgments', file)).tasks) judged.set(task.id, task);
  }
  const byPassage = new Map(); // `${installation}:${passage}` -> handle
  for (const installation of materialization.installations) {
    for (const record of installation.records) {
      const passage = basename(record.excerpt, '.txt');
      byPassage.set(`${installation.installation}:${passage}`, `${installation.installation}/${record.kind}/${record.id}`);
    }
  }
  const roots = new Map(materialization.installations.map((i) => [i.installation, join(materializedDir, i.installation)]));
  const installationsOf = new Map(tasks.organizations.map((o) => [o.organization, o.installations]));
  const handlesFor = (installations, ref) => installations
    .map((name) => byPassage.get(`${name}:${ref.passage}`))
    .filter(Boolean);

  return tasks.tasks.filter((t) => judged.has(t.id)).map((task) => {
    const judgment = judged.get(task.id);
    const installations = installationsOf.get(task.organization);
    // A passage may exist in several installations of one organization; any
    // one of its records satisfies that passage.
    const toBundle = (bundle) => bundle.map((ref) => handlesFor(installations, ref));
    return {
      id: task.id,
      prompt: task.prompt,
      answerable: judgment.answerable,
      clarificationRequired: judgment.clarificationRequired === true,
      installations: installations.map((name) => ({ name, root: roots.get(name) })),
      bundles: (judgment.bundles ?? []).map(toBundle),
      explanationBundles: (judgment.explanationBundles ?? []).map(toBundle),
    };
  });
}

/** Smallest depth at which some bundle is fully inside the ranking, or null. */
export function bundleDepth(bundles, ranking) {
  let best = null;
  for (const bundle of bundles) {
    if (!bundle.length || bundle.some((alternatives) => !alternatives.length)) continue;
    let depth = 0;
    for (const alternatives of bundle) {
      const ranks = alternatives.map((h) => ranking.indexOf(h)).filter((r) => r >= 0);
      if (!ranks.length) { depth = null; break; }
      depth = Math.max(depth, Math.min(...ranks) + 1);
    }
    if (depth !== null && (best === null || depth < best)) best = depth;
  }
  return best;
}

// ------------------------------------------------------------------ retrievers

const node = (script, args) => {
  const started = process.hrtime.bigint();
  const stdout = execFileSync(process.execPath, [join(repository, script), ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return { stdout, ms: Number(process.hrtime.bigint() - started) / 1e6 };
};

/** The existing lexical resolver, one process per installation. */
function resolveRetriever(task, today) {
  const ranking = [];
  let bytes = 0;
  let ms = 0;
  for (const { name, root } of task.installations) {
    const run = node('payload/engine/resolve.js', [task.prompt, '--json', '--today', today, '--root', root]);
    bytes += Buffer.byteLength(run.stdout);
    ms += run.ms;
    const out = JSON.parse(run.stdout);
    for (const concept of out.results ?? []) ranking.push(`${name}/ontology/${concept.id}`);
    for (const leaf of out.leaves ?? []) ranking.push(`${name}/knowledge/${leaf.id}`);
  }
  return { ranking: [...new Set(ranking)], bytes, ms, confidence: null };
}

/** The confidence-tiered retriever, all installations in one call. */
function askRetriever(task) {
  const args = [task.prompt, '--json'];
  for (const { root } of task.installations) args.push('--root', root);
  const run = node('payload/engine/ask.js', args);
  const out = JSON.parse(run.stdout);
  const qualify = (r) => `${task.installations.length > 1 ? r.installation : task.installations[0].name}/${r.kind}/${r.id}`;
  return {
    ranking: out.records.map(qualify),
    bytes: Buffer.byteLength(run.stdout),
    ms: run.ms,
    confidence: out.confidence?.tier ?? null,
  };
}

export const RETRIEVERS = { resolve: resolveRetriever, ask: askRetriever };

// --------------------------------------------------------------------- report

export function runBenchmark(materializedDir, name, { today = '2026-09-19' } = {}) {
  const retriever = RETRIEVERS[name];
  const rows = loadGold(materializedDir).map((task) => {
    const run = retriever(task, today);
    const target = task.answerable ? task.bundles : task.explanationBundles;
    return {
      id: task.id,
      answerable: task.answerable,
      scored: target.some((b) => b.length),
      depth: bundleDepth(target, run.ranking),
      returned: run.ranking.length,
      bytes: run.bytes,
      ms: run.ms,
      confidence: run.confidence,
    };
  });
  return { retriever: name, rows, summary: summarize(rows) };
}

function summarize(rows) {
  const scored = rows.filter((r) => r.scored);
  const at = (k, set) => set.filter((r) => r.depth !== null && r.depth <= k).length;
  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  };
  const answerable = scored.filter((r) => r.answerable);
  const unanswerable = rows.filter((r) => !r.answerable);
  return {
    tasks: rows.length,
    scored: scored.length,
    bundleAt: Object.fromEntries(DEPTHS.map((k) => [k, `${at(k, scored)}/${scored.length}`])),
    answerableBundleAt: Object.fromEntries(DEPTHS.map((k) => [k, `${at(k, answerable)}/${answerable.length}`])),
    unanswerableNotClaimed: rows.some((r) => r.confidence)
      ? `${unanswerable.filter((r) => r.confidence !== 'covered').length}/${unanswerable.length}`
      : null,
    msP50: percentile(rows.map((r) => r.ms), 0.5),
    msP95: percentile(rows.map((r) => r.ms), 0.95),
    bytesP50: percentile(rows.map((r) => r.bytes), 0.5),
    bytesMax: Math.max(...rows.map((r) => r.bytes)),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dir, ...names] = process.argv.slice(2);
  if (!dir) throw new Error('usage: node acceptance/retrieval/benchmark.js MATERIALIZED_DIR [resolve|ask ...]');
  const verbose = names.includes('--rows');
  for (const name of names.filter((n) => n !== '--rows').length ? names.filter((n) => n !== '--rows') : ['resolve']) {
    const result = runBenchmark(dir, name);
    console.log(JSON.stringify({ retriever: name, ...result.summary }, null, 2));
    if (verbose) for (const row of result.rows) console.log(JSON.stringify(row));
  }
}
