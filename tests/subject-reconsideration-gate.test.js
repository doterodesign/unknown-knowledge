import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectReconsiderationGateFixture } from './helpers/subject-reconsideration-gate-fixture.js';
import { inspectSubjectReconsiderationCore } from '../payload/engine/lib/subject-reconsideration-core.js';

test('actual Git healthy core control precedes the fixed eventless gate', async t => {
  const f = subjectReconsiderationGateFixture(t, { parent: true, related: true });
  const core = await inspectSubjectReconsiderationCore(f.input());
  assert.equal(core.ok, true, JSON.stringify(core.diagnostics));
  assert.equal(core.assignments, null);
  assert.equal(core.ownerPreservation.changedPaths.length, 2);
  const { inspectSubjectReconsiderationGate } = await import('../payload/engine/lib/subject-reconsideration-gate.js');
  const report = await inspectSubjectReconsiderationGate(f.gateInput());
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.equal(report.publicationReady, false);
  assert.equal(report.assignments, null);
  assert.equal(report.core.ok, true);
  assert.equal(report.impacts.replays.coverage.assessmentComplete, true);
  assert.equal(report.resources.contexts.before.outputBytesWritten, 0);
  assert.equal(report.resources.contexts.after.outputBytesWritten, 0);
});

test('a second actual reconsideration retains the first material in its fresh before context', async t => {
  const f = subjectReconsiderationGateFixture(t, { priorReconsideration: true });
  const { inspectSubjectReconsiderationGate: inspect } = await import('../payload/engine/lib/subject-reconsideration-gate.js');
  const report = await inspect(f.gateInput());
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.deepEqual(report.impacts.bindings.before.excludedMaterialLocators, []);
  assert.equal(report.operation.subject, 'S-000002');
  assert.ok(report.impacts.replays.subjects.filter(row => row.id === 'S-000001')
    .every(row => row.outcome.eligible === true && row.outcome.verification === 'verified'));
  const missing = await inspect(f.gateInput({ evidence: { ...f.evidence, materialCaptures: [] } }));
  assert.equal(missing.ok, false);
  assert.equal(missing.impacts, null);
});
