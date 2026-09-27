// Test-only: fit the re-rank model (UCS-1612) from labelled retrieval sets.
//
// For every question in every set listed in rerank/training.json, `ask` runs
// with the model switched off, so each candidate record comes back with its
// BM25 features. A candidate is relevant when an independent source judgment
// graded its passage 2 or 3 and applicable. A logistic regression is fitted by
// plain gradient descent from zero with fixed settings, so the same manifest
// always gives the same coefficients. The script reports accuracy three ways:
// BM25 alone, leave-one-question-out (each question ranked by a model that
// never saw it), and in-sample, then writes payload/engine/lib/rerank-model.js.
//
// Usage: node acceptance/retrieval/fit-rerank.js [--check]
//   --check  fit and compare with the shipped model; exit 1 if they differ.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask } from '../../payload/engine/lib/ask.js';
import { FEATURES } from '../../payload/engine/lib/rerank.js';
import { RERANK_MODEL } from '../../payload/engine/lib/rerank-model.js';
import { loadAskIndex } from '../../payload/engine/lib/ask-service.js';
import { loadGold, bundleDepth, CANONICAL } from './benchmark.js';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(repository, 'acceptance/retrieval/rerank/training.json'), 'utf8'));
const MODEL_FILE = join(repository, 'payload/engine/lib/rerank-model.js');
const REPORT_FILE = join(repository, 'acceptance/retrieval/rerank/fit-report.json');
const FIT = Object.freeze({ learningRate: 0.5, iterations: 4000, l2: 0.01, digits: 4 });

/** development-v2: the committed canonical fixture and its source judgments. */
function developmentV2() {
  const corpus = join(repository, 'acceptance/retrieval/development-v2');
  const judged = new Map();
  for (const file of readdirSync(join(corpus, 'source-judgments'))) {
    for (const task of JSON.parse(readFileSync(join(corpus, 'source-judgments', file), 'utf8')).tasks) judged.set(task.id, task);
  }
  const records = JSON.parse(readFileSync(join(CANONICAL, 'records.json'), 'utf8')).installations;
  const passageOf = new Map();
  for (const { installation, records: rows } of records) {
    for (const r of rows) passageOf.set(`${installation}/${r.kind}/${r.id}`, r.passage ?? r.excerpt.split('/').at(-1).replace(/\.txt$/, ''));
  }
  const indexes = new Map();
  return loadGold().map((task) => {
    const roots = task.installations.map((i) => i.root);
    const key = roots.join('|');
    if (!indexes.has(key)) indexes.set(key, loadAskIndex(roots).index);
    const relevant = new Set(judged.get(task.id).passageJudgments
      .filter((j) => j.grade >= 2 && j.applicable !== false).map((j) => j.passage));
    return {
      id: `development-v2/${task.id}`, prompt: task.prompt, index: indexes.get(key),
      bundles: task.answerable ? task.bundles : task.explanationBundles,
      multi: task.installations.length > 1, single: task.installations[0].name,
      label: (handle) => (relevant.has(passageOf.get(handle)) ? 1 : 0),
    };
  });
}

const LOADERS = { 'development-v2': developmentV2 };

const handleOf = (question, doc) => `${question.multi ? doc.installation : question.single}/${doc.kind}/${doc.id}`;

/** Every BM25 candidate of every question, with features and label. */
function samples(questions) {
  return questions.map((q) => ask(q.index, q.prompt, { limit: 10_000, model: null }).ranked
    .filter((r) => r.features).map((r) => ({ x: r.features, y: q.label(handleOf(q, r.doc)) })));
}

function fit(rows) {
  const w = new Array(FEATURES.length).fill(0);
  let b = 0;
  const n = rows.length || 1;
  for (let it = 0; it < FIT.iterations; it += 1) {
    const gw = new Array(FEATURES.length).fill(0);
    let gb = 0;
    for (const { x, y } of rows) {
      let z = b;
      for (let i = 0; i < w.length; i += 1) z += w[i] * x[i];
      const err = 1 / (1 + Math.exp(-z)) - y;
      for (let i = 0; i < w.length; i += 1) gw[i] += err * x[i];
      gb += err;
    }
    for (let i = 0; i < w.length; i += 1) w[i] -= FIT.learningRate * (gw[i] / n + FIT.l2 * w[i]);
    b -= FIT.learningRate * (gb / n);
  }
  const round = (v) => Number(v.toFixed(FIT.digits));
  return { bias: round(b), weights: Object.fromEntries(FEATURES.map((f, i) => [f, round(w[i])])) };
}

function depthsWith(questions, modelFor) {
  return questions.map((q, i) => {
    const ranked = ask(q.index, q.prompt, { limit: 8, model: modelFor(i) }).ranked;
    return bundleDepth(q.bundles, ranked.map((r) => handleOf(q, r.doc)));
  });
}
const summary = (depths) => ({
  questions: depths.length,
  within8: depths.filter((d) => d !== null && d <= 8).length,
  within3: depths.filter((d) => d !== null && d <= 3).length,
  rank1: depths.filter((d) => d === 1).length,
});

for (const set of manifest.sets) {
  if (/held-?out/i.test(set.name)) throw new Error(`${set.name}: held-out cases never train the re-rank model`);
  if (!LOADERS[set.loader]) throw new Error(`${set.name}: unknown loader ${set.loader}`);
}
const questions = manifest.sets.flatMap((set) => LOADERS[set.loader]());
const perQuestion = samples(questions);
const model = { ...fit(perQuestion.flat()), trainedOn: manifest.sets.map((s) => s.name) };

if (process.argv.includes('--check')) {
  const same = JSON.stringify({ bias: RERANK_MODEL.bias, weights: RERANK_MODEL.weights, trainedOn: RERANK_MODEL.trainedOn })
    === JSON.stringify({ bias: model.bias, weights: model.weights, trainedOn: model.trainedOn });
  process.stdout.write(same ? 'fit-rerank: shipped model matches the manifest\n' : 'fit-rerank: shipped model differs from a fresh fit; run fit-rerank.js\n');
  process.exit(same ? 0 : 1);
}

const loqo = perQuestion.map((_, i) => fit(perQuestion.filter((__, j) => j !== i).flat()));
const report = {
  fit: FIT, features: FEATURES, trainedOn: model.trainedOn,
  samples: perQuestion.flat().length, relevant: perQuestion.flat().filter((s) => s.y).length,
  bm25: summary(depthsWith(questions, () => null)),
  leaveOneQuestionOut: summary(depthsWith(questions, (i) => loqo[i])),
  inSample: summary(depthsWith(questions, () => model)),
  model: { bias: model.bias, weights: model.weights },
};
writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(MODEL_FILE, `// GENERATED by acceptance/retrieval/fit-rerank.js from acceptance/retrieval/rerank/training.json;
// do not edit by hand. Refit when a labelled set is added. Report: acceptance/retrieval/rerank/fit-report.json.
export const RERANK_MODEL = Object.freeze({
  version: 1,
  trainedOn: Object.freeze(${JSON.stringify(model.trainedOn)}),
  bias: ${model.bias},
  weights: Object.freeze(${JSON.stringify(model.weights)}),
});
`);
process.stdout.write(`${JSON.stringify({ samples: report.samples, relevant: report.relevant, bm25: report.bm25,
  leaveOneQuestionOut: report.leaveOneQuestionOut, inSample: report.inSample, model: report.model }, null, 1)}\n`);
