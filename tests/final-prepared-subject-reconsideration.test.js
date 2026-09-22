import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalReconsiderationFixture } from './helpers/prepared-reconsideration-fixture.js';
import { runFinalPreparedSubjectReconsiderationGate } from '../payload/engine/lib/final-prepared-subject-reconsideration.js';

for (const options of [{ objectFormat: 'sha1', nested: false }, { objectFormat: 'sha256', nested: true, parent: true, related: true }]) {
  test(`real eventless retained final ${options.objectFormat}/${options.nested ? 'nested' : 'root'}`, async t => {
    const f = await finalReconsiderationFixture(t, options);
    const final = await runFinalPreparedSubjectReconsiderationGate(f.finalInput);
    assert.equal(final.status, 'passed', JSON.stringify(final.diagnostics));
    assert.deepEqual(final.gate, f.gate);
    assert.equal(final.gate.assignments, null);
    assert.deepEqual(final.gate.core.allocation.proof.ids, [f.operation.subject]);
    assert.equal(final.gate.core.ownerPreservation.changedPaths.length, 2);
    assert.equal(Object.keys(final).length, 10);
  });
}

import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { artifactCapture, readRetainedPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';
import { reconsiderationEvidenceVariant } from './helpers/prepared-reconsideration-fixture.js';
import { isPreparedSubjectReconsiderationReport } from '../payload/engine/lib/prepared-subject-reconsideration.js';

function resealedReport(f, mutate) {
  const gate = structuredClone(f.gate); mutate(gate);
  assert.equal(isPreparedSubjectReconsiderationReport(gate, { source: f.source, candidate: f.candidate }, f.gateInput), true,
    'The rehashed report must pass the pure predicate before testing fresh equality.');
  const bytes = Buffer.from(`${JSON.stringify(gate)}\n`), report = structuredClone(f.validation.report);
  const operation = report.checks.find(row => row.id === 'operation');
  for (const name of ['stdout', 'result']) operation[name] = artifactCapture(`checks/operation/${name}`, bytes);
  const changed = { ...f, finalInput: { ...f.finalInput, expected: { ...f.finalInput.expected, reportDigest: canonicalSha256(report) } } };
  const input = reconsiderationEvidenceVariant(changed, rows => {
    for (const row of rows) {
      if (['checks/operation/stdout', 'checks/operation/result'].includes(row.file)) row.bytes = bytes;
      if (row.file === 'report.json') row.bytes = canonicalJsonBytes(report);
    }
  });
  assert.equal(readRetainedPreparedEvidence({ ...f.validationInput, expected: input.expected,
    bundleDigest: input.validationBundleDigest }).status, 'verified', 'Actual byte-integrity reseal is admitted.');
  return input;
}

test('retained final refuses policy, runtime, caps, deep JSON and plausible whole-report reseals', async t => {
  const f = await finalReconsiderationFixture(t);
  assert.equal((await runFinalPreparedSubjectReconsiderationGate(f.finalInput)).status, 'passed');
  for (const [label, edit] of [
    ...['registry', 'identity'].flatMap(name => [
      [`missing ${name}`, rows => { rows.splice(rows.findIndex(row => row.file === `checks/operation/${name}.yaml`), 1); }],
      [`changed ${name}`, rows => { const row = rows.find(row => row.file === `checks/operation/${name}.yaml`); row.bytes = Buffer.concat([row.bytes, Buffer.from('\n')]); }],
    ]),
    ['unexpected event', rows => rows.push({ file: 'checks/operation/event.yaml', bytes: Buffer.alloc(0) })],
    ...['prepared', 'final'].map(name => [`missing ${name} worker`, rows => {
      rows.splice(rows.findIndex(row => row.file === `runtime/files/engine/lib/${name}-subject-reconsideration-check.js`), 1);
    }]),
    ['changed policy bytes', rows => { rows.find(row => row.file === 'runtime/files/engine/policies/candidate-publication.json').bytes = Buffer.from('{}'); }],
    ['zero identity cap', rows => { rows.find(row => row.file === 'checks/operation/capture-limits.json').bytes = canonicalJsonBytes({ ...f.captureLimits, maxIdentityBytes: 0 }); }],
    ...['input.json', 'capture-limits.json'].map(name => [`deep ${name}`, rows => {
      rows.find(row => row.file === `checks/operation/${name}`).bytes = Buffer.from('['.repeat(12000) + 'null' + ']'.repeat(12000));
    }]),
  ]) await t.test(label, async () => {
    const result = await runFinalPreparedSubjectReconsiderationGate(reconsiderationEvidenceVariant(f, edit));
    assert.equal(result.status, 'failed', JSON.stringify(result)); assert.ok(result.diagnostics.length);
  });
  for (const [label, mutate] of [
    ['wrong operation', input => { input.expected.operation = 'subject-split'; }],
    ['stale runtime', input => { input.expected.runtimeDigest = '0'.repeat(64); }],
    ['missing capability', input => { input.approvedRuntimeProfile = null; }],
    ['changed capability', input => { input.approvedRuntimeProfile.profile.files.pop(); }],
  ]) await t.test(label, async () => {
    const input = structuredClone(f.finalInput); mutate(input);
    assert.equal((await runFinalPreparedSubjectReconsiderationGate(input)).status, 'failed');
  });
  for (const [label, mutate] of [
    ['native occupied count', gate => { gate.core.allocation.proof.occupied++; gate.core.allocation.proof.remaining--; }],
    ['plausible actual-work count', gate => { gate.core.resources.governance.used.validationSteps++; gate.resources.core = structuredClone(gate.core.resources); }],
  ]) await t.test(label, async () => {
    const result = await runFinalPreparedSubjectReconsiderationGate(resealedReport(f, mutate));
    assert.equal(result.status, 'failed'); assert.equal(result.gate?.ok, true, JSON.stringify(result));
    assert.equal(result.diagnostics.at(-1).code, 'reconsideration-fresh-proof-mismatch');
  });
});

test('second actual reconsideration retains the full original assessment and material union', async t => {
  const f = await finalReconsiderationFixture(t, { priorReconsideration: true });
  assert.equal(f.gateInput.evidence.assessmentCaptures.length, 2);
  assert.deepEqual(f.gate.core.allocation.proof.ids, ['S-000002']);
  assert.equal(f.gate.core.sourceMembership.status, 'passed');
  const final = await runFinalPreparedSubjectReconsiderationGate(f.finalInput);
  assert.equal(final.status, 'passed', JSON.stringify(final.diagnostics));
  assert.deepEqual(final.gate, f.gate);
});
