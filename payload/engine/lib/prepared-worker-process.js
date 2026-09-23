/** Bounded process group for fixed trusted prepared-check entrypoints. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { EngineRefusal } from './engine-refusal.js';

// One private process group contains the worker and its Git/check descendants.
// Reap the whole group before disposable bytes are removed, even after a crash.
export async function executePreparedWorker(runtime, jobFile, limits, kind) {
  if (!['validation', 'final-assignment', 'final-migration', 'final-equivalent-merge', 'final-subject-retirement', 'final-subject-split', 'final-subject-reconsideration', 'final-subject-metadata', 'final-subject-proposal-suppression', 'final-subject-creation', 'final-promotion', 'final-record-promotion'].includes(kind)) throw new EngineRefusal('unsupported prepared worker');
  const entrypoint = kind === 'validation'
    ? 'engine/lib/prepared-validation-worker.js' : kind === 'final-assignment'
      ? 'engine/lib/final-assignment-check.js' : kind === 'final-migration'
        ? 'engine/lib/final-migration-check.js' : kind === 'final-equivalent-merge'
          ? 'engine/lib/final-equivalent-merge-check.js' : kind === 'final-subject-retirement'
            ? 'engine/lib/final-subject-retirement-check.js' : kind === 'final-subject-split'
            ? 'engine/lib/final-subject-split-check.js' : kind === 'final-subject-reconsideration'
            ? 'engine/lib/final-subject-reconsideration-check.js' : kind === 'final-subject-metadata'
            ? 'engine/lib/final-subject-metadata-check.js' : kind === 'final-subject-proposal-suppression'
            ? 'engine/lib/final-subject-proposal-suppression-check.js' : kind === 'final-subject-creation'
            ? 'engine/lib/final-subject-creation-check.js' : kind === 'final-record-promotion'
            ? 'engine/lib/final-record-promotion-check.js' : 'engine/lib/final-promotion-check.js';
  const output = { stdout: [], stderr: [] }; let size = 0; let error = null;
  const worker = spawn(runtime.manifest.executables.node.path,
    [join(runtime.root, entrypoint), jobFile],
    { cwd: runtime.root, env: runtime.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const killGroup = () => {
    if (worker.pid) try { process.kill(-worker.pid, 'SIGKILL'); }
    catch (failure) { if (failure.code !== 'ESRCH') error ??= failure; }
  };
  const timer = setTimeout(() => { error ??= { code: 'ETIMEDOUT' }; killGroup(); }, limits.maxCheckMilliseconds * 3 + 10_000);
  for (const stream of ['stdout', 'stderr']) worker[stream].on('data', (bytes) => {
    output[stream].push(bytes.subarray(0, Math.max(0, limits.maxOutputBytesPerCheck - size)));
    size += bytes.length;
    if (size > limits.maxOutputBytesPerCheck) { error ??= { code: 'OUTPUT_LIMIT' }; killGroup(); }
  });
  worker.on('error', (failure) => { error ??= failure; });
  const result = await new Promise((done) => worker.on('close', (status, signal) => done({ status, signal })));
  clearTimeout(timer); killGroup();
  return { ...result, error, stdout: Buffer.concat(output.stdout), stderr: Buffer.concat(output.stderr) };
}
