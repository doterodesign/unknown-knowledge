import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectUseAssignmentFixture } from './helpers/subject-use-assignment-fixture.js';
import { runPreparedEquivalentMergeGate } from '../payload/engine/lib/subject-equivalent-merge-gate.js';
import { admitEquivalentMergeInput } from '../payload/engine/lib/subject-equivalent-merge-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

test('actual joint merge gate composes assignment history, preserved unknowns and mandatory impacts without publication approval', async (t) => {
  const f = subjectUseAssignmentFixture(t); const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.publicationReady, false);
  assert.equal(result.inputDigest, admitEquivalentMergeInput(f.input).inputDigest);
  assert.deepEqual(result.inputs, { before: f.input.before, candidate: f.input.candidate });
  assert.equal(Object.keys(result.checks).length, 8);
  assert.ok(Object.values(result.checks).every(({ status }) => status === 'passed'));
  assert.equal(result.assignments.checks.impactPolicy.status, 'not-performed');
  assert.equal(result.inventory.status, 'incomplete');
  assert.equal(result.impacts.reach.status, 'incomplete');
  assert.equal(result.authoredReferenceClosure.status, 'complete');
  assert.equal(result.impacts.subjectTree.status, 'complete');
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  assert.equal(result.impacts.routes.status, 'requires-final-capability');
  assert.equal(result.sources.registryCapture.source.tree, f.input.candidate.tree);
  assert.equal(result.sources.assignmentEvent.eventDigest, f.input.operation.assignmentEvent.changeDigest);
  assert.equal(result.sources.assignmentEvent.eventCapture.source.tree, f.input.candidate.tree);
});

test('a partial actual event row set cannot claim full merge coverage', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.assignmentEvent.rows.pop(); f.save();
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.publicationReady, false);
  assert.equal(result.checks.assignments.status, 'failed');
  assert.equal(result.impacts.representativeReplays, null);
});

test('an actual Knowledge body edit refuses despite matching event capture digests', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.put('knowledge/K-000001.md', `${f.read('knowledge/K-000001.md')}Unreviewed content.\n`); f.save();
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.checks.preservation.status, 'failed');
});

test('the gate never accepts a caller-supplied route assessment or approval', async (t) => {
  const f = subjectUseAssignmentFixture(t);
  for (const extra of [{ impact: { ...f.input.impact, routes: { kind: 'captured-inventory', inventory: [] } } }, { publicationReady: true }]) {
    const result = await runPreparedEquivalentMergeGate({ ...f.input, ...extra });
    assert.equal(result.ok, false); assert.equal(result.checks.admission.status, 'failed');
    assert.equal(result.inputs, null); assert.equal(result.assignments, null);
  }
});

test('zero tree capacity cannot produce a successful mechanical gate', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.input.limits.views.maxViews = 0;
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.checks.impacts.status, 'failed');
  assert.equal(result.impacts.subjectTree.status, 'incomplete');
});

test('the admitted operation is detached and its complete report is deterministic on actual rerun', async (t) => {
  const f = subjectUseAssignmentFixture(t); const admitted = admitEquivalentMergeInput(f.input);
  const pending = runPreparedEquivalentMergeGate(f.input);
  f.input.operation.survivor = 'S-999999'; f.input.limits.views.maxViews = 0;
  f.input.evidence.decisionCaptures[0].bytes.fill(0);
  const result = await pending;
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.inputDigest, admitted.inputDigest);
  assert.deepEqual(result.operation, admitted.input.operation);
  const rerun = await runPreparedEquivalentMergeGate(admitted.input);
  assert.deepEqual(rerun, result);
  assert.equal(canonicalSha256(rerun), canonicalSha256(result));
});

test('an omitted actual unknown owner refuses authored closure before impacts', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.input.operation.retainedUnknowns.pop();
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.checks.authoredReferences.status, 'failed');
  assert.equal(result.checks.registry.status, 'passed');
  assert.equal(result.checks.impacts.status, 'not-performed');
  assert.equal(result.impacts.reach, null);
});

test('exhausted replay capacity preserves the raw refusal and prevents mechanical success', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.input.limits.replays.maxCases = 0;
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.checks.impacts.status, 'failed');
  assert.equal(result.impacts.subjectTree.status, 'complete');
  assert.equal(result.impacts.representativeReplays.status, 'incomplete');
  assert.equal(result.publicationReady, false);
});

test('a wrong tree for either actual commit refuses before invoking the assignment adapter', async (t) => {
  const f = subjectUseAssignmentFixture(t);
  for (const side of ['before', 'candidate']) {
    const input = admitEquivalentMergeInput(f.input).input;
    input[side].tree = input[side === 'before' ? 'candidate' : 'before'].tree;
    const result = await runPreparedEquivalentMergeGate(input);
    assert.equal(result.ok, false); assert.equal(result.checks.models.status, 'failed');
    assert.equal(result.diagnostics[0].code, 'merge-tree-mismatch');
    assert.equal(result.diagnostics[0].side, side);
    assert.equal(result.assignments, null); assert.equal(result.inputs, null);
  }
});
