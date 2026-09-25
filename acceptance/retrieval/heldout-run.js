// Test-only: the held-out agent comparison (UCS-1584).
//
// Reads sealed cases from the custody directory, builds the development-v2
// corpus for both runtimes (materialize-corpus.js, then arms.js), runs one
// fresh reader per case and runtime, and grades each session blind
// (grade.js). Traces and grader rationales are written only to the custody
// directory. Standard output and the summary carry case IDs, runtimes,
// verdict codes, critical flags, cost, time and output size: nothing about
// prompts, answers or judgments.
//
// Usage: node acceptance/retrieval/heldout-run.js --custody <dir> --model <reader model>
//          --summary <file> [--repeats 1] [--first-repeat 1] [--budget-usd 2]
//
// --first-repeat numbers later passes after earlier ones (r2, r3, ...) so their
// traces never overwrite an earlier pass's.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareBaselineRuntime } from './materialize.js';
import { materializeCorpus } from './materialize-corpus.js';
import { currentInstallation } from './arms.js';
import { runReader } from './reader.js';
import { grade } from './grade.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const custody = arg('custody');
const model = arg('model');
const summaryFile = arg('summary');
const repeats = Number(arg('repeats', 1));
const firstRepeat = Number(arg('first-repeat', 1));
if (!custody || !model || !summaryFile) {
  process.stderr.write('usage: heldout-run.js --custody <dir> --model <id> --summary <file> [--repeats 1] [--budget-usd 2]\n');
  process.exit(2);
}
const { cases } = JSON.parse(readFileSync(join(custody, 'cases.json'), 'utf8'));
const sessions = join(custody, 'sessions');
mkdirSync(sessions, { recursive: true });

const STORE_KIND = { ontology: 'ontology', knowledge: 'knowledge', decisions: 'decision' };
const scratch = mkdtempSync(join(tmpdir(), 'uk-heldout-'));
const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
const original = materializeCorpus(join(scratch, 'original'), runtime);
mkdirSync(join(scratch, 'current'));
// `installation:passage` -> record ID, per runtime.
const ids = { original: new Map(), current: new Map() };
for (const [name, built] of Object.entries(original)) {
  const mapping = currentInstallation(built.root, join(scratch, 'current', name));
  const to = new Map(mapping.map((m) => [`${m.kind}:${m.from}`, m.to]));
  for (const record of built.records.filter((r) => r.passage)) {
    ids.original.set(`${name}:${record.passage}`, record.id);
    ids.current.set(`${name}:${record.passage}`, to.get(`${STORE_KIND[record.kind]}:${record.id}`));
  }
}

/** A task root: the one installation, or a directory holding copies of several side by side. */
function taskRoot(arm, installations) {
  if (installations.length === 1) return join(scratch, arm, installations[0]);
  const dir = mkdtempSync(join(scratch, `${arm}-multi-`));
  for (const name of installations) cpSync(join(scratch, arm, name), join(dir, name), { recursive: true, verbatimSymlinks: true });
  return dir;
}

const refs = (arm, bundle) => bundle.map((ref) => ids[arm].get(`${ref.installation}:${ref.passage}`) ?? null);
const rows = [];
for (const kase of cases) {
  for (const arm of ['original', 'current']) {
    for (let repeat = firstRepeat; repeat < firstRepeat + repeats; repeat += 1) {
      const tag = `${kase.id}.${arm}.r${repeat}`;
      if (existsSync(join(sessions, `${tag}.trace.json`))) throw new Error(`${tag} already exists; choose another --first-repeat`);
      const root = taskRoot(arm, kase.installations);
      const trace = await runReader({ root, question: kase.prompt, model, budgetUsd: Number(arg('budget-usd', 2)) });
      writeFileSync(join(sessions, `${tag}.trace.json`), `${JSON.stringify(trace, null, 2)}\n`);
      const graded = grade({
        prompt: kase.prompt, answerable: kase.answerable, expectedAnswer: kase.expectedAnswer,
        abstentionTarget: kase.abstentionTarget, criticalFailures: kase.criticalFailures,
        goldBundles: (kase.answerable ? kase.bundles : kase.explanationBundles ?? []).map((b) => refs(arm, b)),
        judgments: (kase.judgments ?? []).map((j) => ({ id: ids[arm].get(`${j.installation}:${j.passage}`) ?? null,
          grade: j.grade, applicable: j.applicable, reason: j.reason })),
      }, trace, { rationaleFile: join(sessions, `${tag}.grade.json`) });
      const row = { case: kase.id, arm, repeat, verdict: graded.verdict, critical: graded.critical,
        graderError: graded.graderError ?? false, readerError: trace.isError, toolCalls: trace.toolCalls.length,
        toolOutputBytes: trace.toolOutputBytes, ms: trace.durationMs ?? trace.wallMs, costUsd: trace.costUsd };
      rows.push(row);
      process.stdout.write(`${tag}: ${row.verdict}${row.critical.length ? ` [${row.critical.join(',')}]` : ''}, `
        + `${row.toolCalls} calls, ${row.toolOutputBytes} B, ${Math.round(row.ms / 1000)} s, $${row.costUsd}\n`);
    }
  }
}
const passed = (arm) => rows.filter((r) => r.arm === arm && r.verdict !== 'failed').length;
const summary = { model, repeats, firstRepeat, cases: cases.length, rows,
  completion: { original: passed('original'), current: passed('current'), of: cases.length * repeats } };
writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`completion: original ${summary.completion.original}/${summary.completion.of}, `
  + `current ${summary.completion.current}/${summary.completion.of}\n`);
