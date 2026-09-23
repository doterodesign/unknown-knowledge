/** One bounded child collector for fixed captured engine commands. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { EngineRefusal } from './engine-refusal.js';
import { isCalendarDate } from './iso-date.js';

const entries = Object.freeze({
  structural: 'engine/validate.js',
  values: 'engine/validate-values.js',
  assignment: 'engine/lib/prepared-assignment-check.js',
  migration: 'engine/lib/prepared-migration-check.js',
  promotion: 'engine/lib/prepared-promotion-check.js',
  'record-promotion': 'engine/lib/prepared-record-promotion-check.js',
  'equivalent-merge': 'engine/lib/prepared-equivalent-merge-check.js',
  'subject-split': 'engine/lib/prepared-subject-split-check.js',
  'subject-metadata': 'engine/lib/prepared-subject-metadata-check.js',
  'subject-proposal-suppression': 'engine/lib/prepared-subject-proposal-suppression-check.js',
  'subject-reconsideration': 'engine/lib/prepared-subject-reconsideration-check.js',
  'subject-creation': 'engine/lib/prepared-subject-creation-check.js',
  'subject-retirement': 'engine/lib/prepared-subject-retirement-check.js',
  'historical-structural': 'engine/compatibility/identity-migration-08066b5/engine/validate.js',
  'historical-values': 'engine/compatibility/identity-migration-08066b5/engine/validate-values.js',
  'ordinary-historical': 'engine/compatibility/identity-migration-08066b5/engine/resolve.js',
  'ordinary-current': 'engine/resolve.js',
  'historical-audit': 'engine/compatibility/identity-migration-08066b5/engine/audit.js',
  'current-audit': 'engine/audit.js',
});
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const text = (v) => typeof v === 'string' && v.length > 0 && !v.includes('\0') && Buffer.from(v).toString() === v;
const refuse = () => { throw new EngineRefusal('unsupported prepared engine invocation'); };
function invocation(check) {
  if (!check || !Object.hasOwn(entries, check.kind)) refuse();
  if (['assignment', 'migration', 'equivalent-merge', 'subject-retirement', 'subject-split', 'subject-reconsideration', 'subject-metadata', 'subject-proposal-suppression', 'subject-creation', 'promotion', 'record-promotion'].includes(check.kind)) {
    if (!closed(check, ['kind', 'jobFile']) || !text(check.jobFile)) refuse();
    return [check.jobFile];
  }
  if (['structural', 'values', 'historical-structural', 'historical-values'].includes(check.kind)) {
    if (!closed(check, ['kind', 'root']) || !text(check.root)) refuse();
    return ['--json', '--root', check.root];
  }
  if (['historical-audit', 'current-audit'].includes(check.kind)) {
    if (!closed(check, ['kind', 'root', 'today']) || !text(check.root) || !isCalendarDate(check.today)) refuse();
    return ['--json', '--root', check.root, '--today', check.today];
  }
  if (!closed(check, ['kind', 'root', 'today', 'request']) || !text(check.root) || typeof check.today !== 'string' || !isCalendarDate(check.today)
    || !closed(check.request, ['kind', 'value']) || !text(check.request.value)) refuse();
  const args = ['--json', '--root', check.root, '--today', check.today];
  if (check.request.kind === 'query' && !check.request.value.startsWith('--')) return [...args, check.request.value];
  if (check.request.kind === 'path') return [...args, `--path=${check.request.value}`];
  if (check.request.kind === 'document' && ['../migration-replays/probe.md', '../migration-replays/probe.txt'].includes(check.request.value)) {
    return [...args, '--doc', check.request.value];
  }
  refuse();
}

/** Caller is the fixed worker with its already verified actual captured runtime. */
export async function executePreparedEngineCheck(runtime, manifest, limits, check) {
  const args = invocation(check); const entrypoint = entries[check.kind];
  if (!['maxOutputBytesPerCheck', 'maxCheckMilliseconds'].every((key) => Number.isSafeInteger(limits?.[key]) && limits[key] > 0)
    || limits.maxCheckMilliseconds > 2147483647) refuse();
  const output = { stdout: [], stderr: [] }; let size = 0; let reason = null;
  const child = spawn(manifest.executables.node.path, [join(runtime, entrypoint), ...args],
    { cwd: runtime, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = (why) => { reason ??= why; child.kill('SIGKILL'); };
  const timer = setTimeout(() => stop('timeout'), limits.maxCheckMilliseconds);
  for (const stream of ['stdout', 'stderr']) child[stream].on('data', (bytes) => {
    const remaining = Math.max(0, limits.maxOutputBytesPerCheck - size);
    output[stream].push(bytes.subarray(0, remaining)); size += bytes.length;
    if (size > limits.maxOutputBytesPerCheck) stop('output-limit');
  });
  child.on('error', (error) => { reason ??= error.code ?? 'spawn-failure'; });
  const { exitCode, signal } = await new Promise((done) => child.on('close', (exitCode, signal) => done({ exitCode, signal })));
  clearTimeout(timer);
  return { entrypoint, exitCode, signal, reason, stdout: Buffer.concat(output.stdout), stderr: Buffer.concat(output.stderr) };
}
