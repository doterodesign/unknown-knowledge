import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { finalSubjectRetirementFixture, retirementEvidenceVariant } from './helpers/final-subject-retirement-fixture.js';

for (const zero of [true, false]) test(`fresh retirement final proof binds actual ${zero ? 'zero' : 'positive'} owner and exact runtime`, async t => {
  const f = await finalSubjectRetirementFixture(t, { zero, tracked: zero, kind: zero ? 'knowledge' : 'ontology' });
  const { runFinalPreparedSubjectRetirementGate } = await import('../payload/engine/lib/final-prepared-subject-retirement.js');
  const result = await runFinalPreparedSubjectRetirementGate(f.input);
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.deepEqual(result.gate, f.gate);
  assert.equal(result.gate.publicationReady, false);
  assert.equal(result.gate.impacts.routes.status, 'requires-final-capability');
  assert.equal(result.gate.impacts.representativeReplays.comparison.status, 'incomplete');
  if (zero) assert.equal(result.gate.sources.assignmentEvent, null);
  for (const mutation of [
    { approvedRuntimeProfile: null },
    { expected: { ...f.input.expected, operation: 'subject-equivalent-merge' } },
    { expected: { ...f.input.expected, runtimeDigest: 'f'.repeat(64) } },
  ]) assert.equal((await runFinalPreparedSubjectRetirementGate({ ...f.input, ...mutation })).status, 'failed');
  for (const edit of [
    rows => { rows.splice(rows.findIndex(row => row.file === 'checks/operation/registry.yaml'), 1); },
    rows => { const row = rows.find(row => row.file === 'checks/operation/registry.yaml'); row.bytes = Buffer.concat([row.bytes, Buffer.from('\n')]); },
    rows => { rows.find(row => row.file === 'checks/operation/capture-limits.json').bytes = Buffer.from('{"maxEventBytes":1,"maxRegistryBytes":1}'); },
    rows => { rows.splice(rows.findIndex(row => row.file === 'runtime/files/engine/lib/prepared-subject-retirement-check.js'), 1); },
    rows => {
      if (zero) rows.push({ file: 'checks/operation/event.yaml', bytes: Buffer.from('unexpected: event\n') });
      else rows.splice(rows.findIndex(row => row.file === 'checks/operation/event.yaml'), 1);
    },
  ]) {
    const failed = await runFinalPreparedSubjectRetirementGate(retirementEvidenceVariant(f, edit));
    assert.equal(failed.status, 'failed', JSON.stringify(failed));
  }
  if (zero) {
    const remove = fs.rmSync; let injected = false;
    fs.rmSync = (path, options) => {
      remove(path, options);
      if (String(path).includes('/final-subject-retirement-')) {
        injected = true;
        throw Object.assign(new Error('one-shot final cleanup failure'), { errno: -13, code: 'EACCES' });
      }
    };
    syncBuiltinESMExports();
    let failed;
    try { failed = await runFinalPreparedSubjectRetirementGate(f.input); }
    finally { fs.rmSync = remove; syncBuiltinESMExports(); }
    assert.equal(injected, true); assert.equal(failed.gate.ok, true);
    assert.equal(failed.status, 'failed'); assert.equal(failed.diagnostics.at(-1).code, 'retirement-cleanup-failed');
  }
});
