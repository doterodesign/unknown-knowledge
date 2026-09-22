import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparedTypedAssignmentFixture } from './helpers/typed-assignment-publication-fixture.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { isPreparedTypedAssignmentReport } from '../payload/engine/lib/prepared-assignment-continuation.js';
import { runtimeLimits } from './helpers/typed-assignment-publication-fixture.js';

test('new retained selection rejects an accessor before invoking it', async t => {
  const f = await preparedTypedAssignmentFixture(t, { kind: 'ontology' });
  let reads = 0;
  Object.defineProperty(f.operationInputs, 'selection', { enumerable: true, get() { reads++; throw new Error('selector getter executed'); } });
  await assert.rejects(runPreparedCandidateChecks({ repoRoot: f.root, source: f.source, candidate: f.candidate,
    operation: 'subject-assignment', operationInputs: f.operationInputs, evidenceDirectory: f.evidenceDirectory, limits: runtimeLimits }),
  error => error.name === 'EngineRefusal');
  assert.equal(reads, 0);
});

test('original authored event order can differ from reviewed selection order', async t => {
  const f = await preparedTypedAssignmentFixture(t, { kind: 'mixed' });
  f.event.rows.reverse();
  const input = f.save();
  const gate = await runPreparedAssignmentGate({ ...input, impact: { ...f.operationInputs.impact, required: ['regeneratedViews', 'representativeReplays'] } });
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  assert.deepEqual(gate.rows.map(row => row.ref), input.selection.refs);
  assert.notDeepEqual(f.event.rows.map(row => row.ref), input.selection.refs);
  assert.equal(isPreparedTypedAssignmentReport(gate, { source: input.before, candidate: input.candidate, operationInputs: f.operationInputs }), true);
});

test('typed retained selector rejects sparse, inherited, duplicate and malformed metadata', async t => {
  const f = await preparedTypedAssignmentFixture(t, { kind: 'ontology' });
  const original = f.operationInputs.selection;
  const variants = [null, undefined, { kind: 'typed-records', refs: [] },
    { ...original, refs: [original.refs[0], original.refs[0]] },
    { ...original, refs: new Array(1) }, { ...original, extra: true },
    { ...original, refs: [{ ...original.refs[0], id: 'O-101' }] }];
  for (const selection of variants) {
    await assert.rejects(runPreparedCandidateChecks({ repoRoot: f.root, source: f.source, candidate: f.candidate,
      operation: 'subject-assignment', operationInputs: { ...f.operationInputs, selection },
      evidenceDirectory: f.evidenceDirectory, limits: runtimeLimits }), error => error.name === 'EngineRefusal');
  }
  const inherited = Object.assign(Object.create({ selection: original }), f.operationInputs);
  delete inherited.selection;
  await assert.rejects(runPreparedCandidateChecks({ repoRoot: f.root, source: f.source, candidate: f.candidate,
    operation: 'subject-assignment', operationInputs: inherited, evidenceDirectory: f.evidenceDirectory, limits: runtimeLimits }),
  error => error.name === 'EngineRefusal');
});

test('whole typed recipe reserves all cases and keeps incomplete output non-authoritative', async t => {
  const f = await preparedTypedAssignmentFixture(t, { kind: 'mixed' });
  const input = { ...f.input, impact: { ...f.operationInputs.impact, required: ['regeneratedViews', 'representativeReplays'] } };
  const control = await runPreparedAssignmentGate(input);
  assert.equal(control.ok, true);
  const count = control.optionalImpact.representativeReplays.resources.inventory.requiredCases;
  for (const [field, value] of [['maxCases', count - 1], ['maxInventoryBytes', 1]]) {
    const impact = structuredClone(input.impact); impact.representativeReplays.limits[field] = value;
    const refused = await runPreparedAssignmentGate({ ...input, impact });
    assert.equal(refused.ok, false);
    assert.ok(refused.diagnostics.some(row => row.code === 'assignment-required-impact-incomplete'));
    assert.notEqual(refused.optionalImpact.representativeReplays.status, 'complete');
    assert.equal(refused.optionalImpact.representativeReplays.comparison?.resources?.queries?.calls ?? 0, 0);
  }
  const impact = structuredClone(input.impact); impact.representativeReplays.queryBudgets.maxExplanationNodes = 0;
  const incomplete = await runPreparedAssignmentGate({ ...input, impact });
  assert.equal(incomplete.ok, false);
  assert.notEqual(incomplete.optionalImpact.representativeReplays.status, 'complete');
});

test('typed continuation accounts exact governance fit and rejects one-short without resetting allowance', async t => {
  const f = await preparedTypedAssignmentFixture(t, { kind: 'mixed', continuation: true });
  const control = await runPreparedAssignmentGate(f.input);
  assert.equal(control.ok, true, JSON.stringify(control.diagnostics));
  const used = control.continuation.governance.used;
  const caps = Object.fromEntries(Object.keys(f.input.continuation.limits.governance)
    .map(key => [key, used[key.slice(3, 4).toLowerCase() + key.slice(4)]]));
  const continuation = { ...f.input.continuation, limits: { governance: caps } };
  const exact = await runPreparedAssignmentGate({ ...f.input, continuation });
  assert.equal(exact.ok, true, JSON.stringify(exact.diagnostics));
  assert.deepEqual(exact.continuation.governance.used, used);
  const short = await runPreparedAssignmentGate({ ...f.input,
    continuation: { ...continuation, limits: { governance: { ...caps, maxValidationSteps: caps.maxValidationSteps - 1 } } } });
  assert.equal(short.ok, false);
  assert.equal(short.continuation.governance.failure.counter, 'validationSteps');
  assert.ok(short.continuation.governance.failure.phase);
  assert.ok(short.continuation.governance.used.captureBytes > 0);
});
