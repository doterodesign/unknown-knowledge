import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { finalMigrationFixture } from './helpers/final-migration-fixture.js';
import { runFinalPreparedMigrationGate } from '../payload/engine/lib/final-prepared-migration.js';

test('fresh fixed migration worker proves actual semantic preservation with exact retained input digest', async (t) => {
  const f = await finalMigrationFixture(t);
  const first = await runFinalPreparedMigrationGate(f.input);
  assert.equal(first.status, 'passed', JSON.stringify({ diagnostics: first.diagnostics, gate: first.gate?.diagnostics }));
  assert.equal(first.gate.status, 'complete'); assert.equal(first.gate.namespace, f.migrationInputs.namespace);
  const second = await runFinalPreparedMigrationGate(f.input); assert.deepEqual(second, first);
  assert(!JSON.stringify(first).includes('PRIVATE'));
  const missing = await runFinalPreparedMigrationGate({ ...f.input, migration: null });
  assert.equal(missing.status, 'failed'); assert.equal(missing.gate, null);
  const wrong = structuredClone(f.input); wrong.migration.migrationInputs.publication.review += ' changed private input';
  const changed = await runFinalPreparedMigrationGate(wrong);
  assert.equal(changed.status, 'failed'); assert.equal(changed.gate, null);
  const noProfile = await runFinalPreparedMigrationGate({ ...f.input, approvedRuntimeProfile: null });
  assert.equal(noProfile.status, 'failed'); assert.equal(noProfile.gate, null);
});

test('unexpected private worker diagnostics cannot escape through final migration result or thrown error', async (t) => {
  const f = await finalMigrationFixture(t); const original = childProcess.spawn;
  childProcess.spawn = (exe, _args, options) => original(exe, ['-e', 'console.error("PRIVATE adjudication leak"); throw new TypeError("PRIVATE replacement")'], options);
  syncBuiltinESMExports();
  try {
    const result = await runFinalPreparedMigrationGate(f.input);
    assert.equal(result.status, 'failed'); assert.equal(result.gate, null);
    assert(!JSON.stringify(result).includes('PRIVATE'));
  } finally { childProcess.spawn = original; syncBuiltinESMExports(); }
  const overflow = await runFinalPreparedMigrationGate({ ...f.input,
    limits: { ...f.input.limits, runtime: { ...f.runtimeLimits, maxOutputBytesPerCheck: 1000 } } });
  assert.equal(overflow.status, 'failed'); assert(!JSON.stringify(overflow).includes('PRIVATE'));
  const read = fs.readFileSync;
  fs.readFileSync = (path, ...args) => {
    const value = read(path, ...args);
    if (String(path).endsWith('/engine/lib/final-migration-check.js') && Buffer.isBuffer(value)) {
      const changed = Buffer.from(value); changed[0] = 32; return changed;
    }
    return value;
  };
  syncBuiltinESMExports();
  try {
    const drift = await runFinalPreparedMigrationGate(f.input);
    assert.equal(drift.status, 'failed'); assert.equal(drift.gate, null); assert.equal(drift.runtimeDigest, null);
  } finally { fs.readFileSync = read; syncBuiltinESMExports(); }
});
