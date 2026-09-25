// Test-only: the single-call answer path on the six public pilot tasks.
//
// Usage: node acceptance/retrieval/pilot-one-shot.js --out <dir> --models <id,...>
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBaselineRuntime, materializeTask } from './materialize.js';
import { currentInstallation } from './arms.js';
import { answerOnce } from './one-shot.js';
import { grade } from './grade.js';

const pilot = fileURLToPath(new URL('pilot/', import.meta.url));
const TASKS = JSON.parse(readFileSync(join(pilot, 'tasks.json'), 'utf8')).tasks;
const JUDGMENTS = new Map(JSON.parse(readFileSync(join(pilot, 'judgments.json'), 'utf8')).tasks.map((t) => [t.id, t]));
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const out = arg('out');
const models = (arg('models') ?? '').split(',').filter(Boolean);
if (!out || !models.length) {
  process.stderr.write('usage: pilot-one-shot.js --out <dir> --models <id,...>\n');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'uk-one-shot-'));
const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
mkdirSync(join(scratch, 'original'));
mkdirSync(join(scratch, 'current'));
const rows = [];
for (const task of TASKS) {
  const built = materializeTask(task.id, join(scratch, 'original', task.id), runtime);
  const roots = built.roots.map((r) => {
    const dest = join(scratch, 'current', `${task.id}-${r.namespace}`);
    currentInstallation(r.root, dest);
    return dest;
  });
  const judgment = JUDGMENTS.get(task.id);
  for (const model of models) {
    const trace = answerOnce({ roots, question: task.prompt, model });
    const tag = `${task.id}.one-shot.${model}`;
    writeFileSync(join(out, `${tag}.json`), `${JSON.stringify(trace, null, 2)}\n`);
    const graded = grade({ prompt: task.prompt, answerable: judgment.answerable, expectedAnswer: judgment.adequateAnswer,
      abstentionTarget: judgment.abstentionTarget, criticalFailures: judgment.criticalFailures }, trace,
    { rationaleFile: join(out, `${tag}.grade.json`) });
    rows.push({ task: task.id, model, verdict: graded.verdict, critical: graded.critical, costUsd: trace.costUsd,
      ms: trace.wallMs, askMs: trace.askMs, promptBytes: trace.promptBytes, usage: trace.usage });
    process.stdout.write(`${tag}: ${graded.verdict}${graded.critical.length ? ` [${graded.critical}]` : ''}, `
      + `$${trace.costUsd}, ${trace.wallMs} ms (ask ${trace.askMs} ms), prompt ${trace.promptBytes} B\n`);
  }
}
writeFileSync(join(out, 'summary.json'), `${JSON.stringify(rows, null, 2)}\n`);
