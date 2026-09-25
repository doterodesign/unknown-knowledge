// Test-only: run fresh readers on the six public pilot tasks (UCS-1580).
//
// Builds each pilot task for the chosen runtime arm, runs one reader session
// per (task, model) with reader.js, and writes the traces plus a summary with
// a mechanical citation check: did the answer cite every record of some gold
// bundle? That check is a screen, not a grade; the blind grader (UCS-1582)
// decides completion. Pilot tasks are public development data, so nothing
// here is held out.
//
// Usage: node acceptance/retrieval/pilot-readers.js --out <dir>
//          --models claude-haiku-4-5-20251001,claude-sonnet-5 [--arm current|original]
//          [--tasks engineering-01,...] [--budget-usd 2]
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBaselineRuntime, materializeTask } from './materialize.js';
import { currentInstallation } from './arms.js';
import { runReader } from './reader.js';

const pilot = fileURLToPath(new URL('pilot/', import.meta.url));
const TASKS = JSON.parse(readFileSync(join(pilot, 'tasks.json'), 'utf8')).tasks;
const JUDGMENTS = new Map(JSON.parse(readFileSync(join(pilot, 'judgments.json'), 'utf8')).tasks.map((t) => [t.id, t]));
const STORE_KIND = { ontology: 'ontology', knowledge: 'knowledge', decisions: 'decision' };

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

/** Record IDs, in the arm's own ID format, for each gold bundle of a task. */
function goldIds(task, roots, mappings) {
  const judgment = JUDGMENTS.get(task.id);
  const idOf = new Map();
  roots.forEach((root, i) => {
    const to = mappings?.[i] ? new Map(mappings[i].map((m) => [`${m.kind}:${m.from}`, m.to])) : null;
    for (const record of root.records.filter((r) => r.passage)) {
      const kind = STORE_KIND[record.kind];
      idOf.set(`${root.namespace}/${record.kind}#${record.passage}`, to ? to.get(`${kind}:${record.id}`) : record.id);
    }
  });
  const bundles = judgment.answerable ? judgment.bundles : judgment.explanationBundles;
  return (bundles ?? []).map((bundle) => bundle.map((ref) => {
    const [namespace, store] = ref.id.split('/');
    return idOf.get(`${namespace}/${store}#${ref.passage.split('#')[1]}`);
  }));
}

const out = arg('out');
const models = (arg('models') ?? '').split(',').filter(Boolean);
const arm = arg('arm', 'current');
const only = arg('tasks') ? new Set(arg('tasks').split(',')) : null;
if (!out || !models.length || !['current', 'original'].includes(arm)) {
  process.stderr.write('usage: pilot-readers.js --out <dir> --models <id,...> [--arm current|original] [--tasks ...] [--budget-usd 2]\n');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'uk-pilot-readers-'));
const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
mkdirSync(join(scratch, 'original'));
mkdirSync(join(scratch, 'current'));
const rows = [];
for (const task of TASKS.filter((t) => !only || only.has(t.id))) {
  const materialized = materializeTask(task.id, join(scratch, 'original', task.id), runtime);
  let root = join(scratch, 'original', task.id);
  let mappings = null;
  if (arm === 'current') {
    root = join(scratch, 'current', task.id);
    if (materialized.roots.length > 1) mkdirSync(root);
    mappings = materialized.roots.map((r) => currentInstallation(r.root,
      materialized.roots.length > 1 ? join(root, r.namespace) : root));
  }
  const gold = goldIds(task, materialized.roots, mappings);
  for (const model of models) {
    // The materializer rewrites holding-company's O-000001 to the 2.x K-101;
    // converted stores use the original spelling again.
    const question = arm === 'current' ? task.prompt : materialized.prompt;
    const trace = await runReader({ root, question, model, budgetUsd: Number(arg('budget-usd', 2)) });
    const file = join(out, `${task.id}.${arm}.${model}.json`);
    writeFileSync(file, `${JSON.stringify({ task: task.id, arm, gold, ...trace }, null, 2)}\n`);
    const cited = gold.some((bundle) => bundle.length && bundle.every((id) => id && (trace.answer ?? '').includes(id)));
    rows.push({ task: task.id, arm, model, answered: !trace.isError, citedGoldBundle: cited,
      toolCalls: trace.toolCalls.length, toolOutputBytes: trace.toolOutputBytes,
      ms: trace.durationMs ?? trace.wallMs, costUsd: trace.costUsd });
    process.stdout.write(`${task.id} ${model}: ${cited ? 'cites gold' : 'no gold cite'}, ${trace.toolCalls.length} calls, `
      + `${trace.toolOutputBytes} B, ${Math.round((trace.durationMs ?? trace.wallMs) / 1000)} s, $${trace.costUsd}\n`);
  }
}
writeFileSync(join(out, `summary.${arm}.json`), `${JSON.stringify(rows, null, 2)}\n`);
