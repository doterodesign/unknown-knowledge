// Test-only: regrade recorded held-out sessions with the evidence-aware grader.
//
// Traces recorded before reader.js kept tool outputs are replayed on a fresh
// build of the same installations (replay.js), then graded again. The earlier
// grade files are kept; new ones are written as `.grade-v2.json` in the
// custody directory. Output: verdict codes only.
//
// Usage: node acceptance/retrieval/heldout-regrade.js --custody <dir> --summary <file>
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareBaselineRuntime } from './materialize.js';
import { materializeCorpus } from './materialize-corpus.js';
import { currentInstallation } from './arms.js';
import { replayOutputs } from './replay.js';
import { grade } from './grade.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const custody = arg('custody');
const summaryFile = arg('summary');
if (!custody || !summaryFile) {
  process.stderr.write('usage: heldout-regrade.js --custody <dir> --summary <file>\n');
  process.exit(2);
}
const cases = new Map(JSON.parse(readFileSync(join(custody, 'cases.json'), 'utf8')).cases.map((c) => [c.id, c]));
const sessions = join(custody, 'sessions');

const STORE_KIND = { ontology: 'ontology', knowledge: 'knowledge', decisions: 'decision' };
const scratch = mkdtempSync(join(tmpdir(), 'uk-regrade-'));
const original = materializeCorpus(join(scratch, 'original'), prepareBaselineRuntime(join(scratch, 'runtime')));
mkdirSync(join(scratch, 'current'));
const ids = { original: new Map(), current: new Map() };
for (const [name, built] of Object.entries(original)) {
  const to = new Map(currentInstallation(built.root, join(scratch, 'current', name)).map((m) => [`${m.kind}:${m.from}`, m.to]));
  for (const record of built.records.filter((r) => r.passage)) {
    ids.original.set(`${name}:${record.passage}`, record.id);
    ids.current.set(`${name}:${record.passage}`, to.get(`${STORE_KIND[record.kind]}:${record.id}`));
  }
}
function taskRoot(arm, installations) {
  if (installations.length === 1) return join(scratch, arm, installations[0]);
  const dir = mkdtempSync(join(scratch, `${arm}-multi-`));
  for (const name of installations) cpSync(join(scratch, arm, name), join(dir, name), { recursive: true, verbatimSymlinks: true });
  return dir;
}
const refs = (arm, bundle) => bundle.map((ref) => ids[arm].get(`${ref.installation}:${ref.passage}`) ?? null);

const rows = [];
for (const file of readdirSync(sessions).filter((f) => f.endsWith('.trace.json')).sort()) {
  const [caseId, arm, repeat] = file.replace('.trace.json', '').split('.');
  const kase = cases.get(caseId);
  if (!kase) continue;
  const recorded = JSON.parse(readFileSync(join(sessions, file), 'utf8'));
  const before = existsSync(join(sessions, file.replace('.trace.json', '.grade.json')))
    ? JSON.parse(readFileSync(join(sessions, file.replace('.trace.json', '.grade.json')), 'utf8')).verdict ?? null : null;
  if (recorded.isError) {
    rows.push({ case: caseId, arm, repeat, before, after: 'blocked', critical: [] });
    continue;
  }
  const trace = recorded.toolCalls.some((c) => c.output != null) ? recorded : replayOutputs(recorded, taskRoot(arm, kase.installations));
  const graded = grade({
    prompt: kase.prompt, answerable: kase.answerable, expectedAnswer: kase.expectedAnswer,
    abstentionTarget: kase.abstentionTarget, criticalFailures: kase.criticalFailures,
    goldBundles: (kase.answerable ? kase.bundles : kase.explanationBundles ?? []).map((b) => refs(arm, b)),
    judgments: (kase.judgments ?? []).map((j) => ({ id: ids[arm].get(`${j.installation}:${j.passage}`) ?? null,
      grade: j.grade, applicable: j.applicable, reason: j.reason })),
  }, trace, { rationaleFile: join(sessions, file.replace('.trace.json', '.grade-v2.json')) });
  const row = { case: caseId, arm, repeat, before, after: graded.verdict, critical: graded.critical,
    graderError: graded.graderError ?? false, replayMatch: trace.replayMatch ?? null };
  rows.push(row);
  process.stdout.write(`${caseId}.${arm}.${repeat}: ${before} -> ${row.after}${row.critical.length ? ` [${row.critical}]` : ''}`
    + `${row.replayMatch == null ? '' : `, replay match ${Math.round(row.replayMatch * 100)}%`}\n`);
}
writeFileSync(summaryFile, `${JSON.stringify(rows, null, 2)}\n`);
