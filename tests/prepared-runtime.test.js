import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { capturePreparedRuntime } from '../payload/engine/lib/prepared-runtime.js';

// Fault injection models operational failures without changing host binaries or
// depending on scheduler speed to create a genuine spawn error or timeout.
test('trusted probe refusals preserve exit, signal, spawn error and bounded output evidence', (t) => {
  const limits = { maxRuntimeFiles: 1000, maxRuntimeBytes: 20_000_000, maxCheckMilliseconds: 10_000 };
  const original = childProcess.spawnSync;
  for (const result of [
    { status: 7, signal: null, stdout: 'partial version\n', stderr: 'native diagnostic\n' },
    { status: null, signal: null, error: Object.assign(new Error('spawn unavailable'), { code: 'EAGAIN' }), stdout: '', stderr: '' },
    { status: null, signal: 'SIGTERM', error: Object.assign(new Error('probe deadline'), { code: 'ETIMEDOUT' }), stdout: 'partial', stderr: 'interrupted' },
  ]) {
    const work = mkdtempSync(join(tmpdir(), 'prepared-probe-test-'));
    t.after(() => rmSync(work, { recursive: true, force: true }));
    childProcess.spawnSync = (path, args, options) => {
      assert.equal(path, realpathSync(process.execPath)); assert.deepEqual(args, ['--version']);
      assert.equal(options.timeout, limits.maxCheckMilliseconds); assert.equal(options.maxBuffer, 8192);
      return result;
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => capturePreparedRuntime(work, limits, 'identity-migration'), (error) => {
        assert.equal(error.code, 'prepared-runtime-probe-failed');
        assert.deepEqual(error.probe, { executable: realpathSync(process.execPath), arguments: ['--version'],
          exitCode: result.status, signal: result.signal, errorCode: result.error?.code ?? null,
          errorMessage: result.error?.message ?? null, stdout: result.stdout, stderr: result.stderr });
        assert.match(error.message, /--version; exit=/);
        return true;
      });
    } finally { childProcess.spawnSync = original; syncBuiltinESMExports(); }
  }
});
