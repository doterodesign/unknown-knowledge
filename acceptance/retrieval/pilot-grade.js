// Test-only: grade pilot reader traces with the blind grader (UCS-1582).
//
// Pilot tasks are public development data, so here the grader's rationale may
// be read: this is how the grader is checked against a manual read before it
// grades any held-out session.
//
// Usage: node acceptance/retrieval/pilot-grade.js --traces <dir from pilot-readers.js>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grade } from './grade.js';

const pilot = fileURLToPath(new URL('pilot/', import.meta.url));
const TASKS = new Map(JSON.parse(readFileSync(join(pilot, 'tasks.json'), 'utf8')).tasks.map((t) => [t.id, t]));
const JUDGMENTS = new Map(JSON.parse(readFileSync(join(pilot, 'judgments.json'), 'utf8')).tasks.map((t) => [t.id, t]));

const i = process.argv.indexOf('--traces');
const dir = i > 0 ? process.argv[i + 1] : null;
if (!dir) {
  process.stderr.write('usage: pilot-grade.js --traces <dir>\n');
  process.exit(2);
}
const rows = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('summary') && !f.includes('.grade.'))) {
  const trace = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const task = TASKS.get(trace.task);
  const judgment = JUDGMENTS.get(trace.task);
  const graded = grade({
    prompt: task.prompt, answerable: judgment.answerable, expectedAnswer: judgment.adequateAnswer,
    abstentionTarget: judgment.abstentionTarget, criticalFailures: judgment.criticalFailures,
    goldBundles: trace.gold,
  }, trace, { rationaleFile: join(dir, file.replace(/\.json$/, '.grade.json')) });
  rows.push({ file, ...graded });
  process.stdout.write(`${file}: ${graded.verdict}${graded.critical.length ? ` [${graded.critical.join(',')}]` : ''}\n`);
}
writeFileSync(join(dir, 'grades.json'), `${JSON.stringify(rows, null, 2)}\n`);
