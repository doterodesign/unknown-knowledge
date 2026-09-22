import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { runFinalPreparedAssignmentGate } from '../payload/engine/lib/final-prepared-assignment.js';
import { preparedTypedAssignmentFixture, finalTypedAssignmentFixture, reviewTypedAssignmentFixture } from './helpers/typed-assignment-publication-fixture.js';
import { recordApprovedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';

for (const kind of ['knowledge', 'ontology', 'decision']) test(`${kind}: actual typed raw control then retained final`, async t => {
  const raw = await preparedTypedAssignmentFixture(t, { kind });
  const control = await runPreparedAssignmentGate(raw.input);
  assert.equal(control.ok, true, JSON.stringify(control));
  assert.equal(control.scope.basis, 'reviewed-typed-existing-records');
  const f = await finalTypedAssignmentFixture(t, { kind });
  assert.ok(f.validation.report.checks.filter(row => row.id !== 'operation').every(row => row.status === 'passed'));
  // Prepared execution cannot waive routes. Fresh final establishes actual unsupported persistence.
  const result = await runFinalPreparedAssignmentGate(f.finalInput);
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.policy.id, 'typed-subject-assignment-publication-v1');
  assert.equal(result.gate.optionalImpact.representativeReplays.policy.id, 'typed-assignment-replay-v1');
});

for (const setup of [{ kind: 'mixed', objectFormat: 'sha1', nested: false },
  { kind: 'mixed', objectFormat: 'sha256', nested: true, continuation: true },
  { kind: 'decision', decisionsOnly: true }]) test(`complete typed publication ${JSON.stringify(setup)}`, async t => {
  const f = await reviewTypedAssignmentFixture(t, setup);
  assert.equal(f.final.policy.id, 'typed-subject-assignment-publication-v1');
  assert.equal(f.final.gate.version, setup.continuation ? 2 : 1);
  assert.equal(f.source.commit.length, setup.objectFormat === 'sha256' ? 64 : 40);
  const saved = await recordApprovedCandidateReview(f.writer());
  assert.equal(saved.status, 'retained', JSON.stringify(saved));
  const published = await publishPreparedCandidate(f.publisher(saved));
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
});

test('literal mixed-record T/F/U expectations, full recipe count and allowed membership changes', async t => {
  const f = await preparedTypedAssignmentFixture(t, { kind: 'mixed' });
  const gate = await runPreparedAssignmentGate({ ...f.input, impact: { ...f.operationInputs.impact,
    required: ['regeneratedViews', 'representativeReplays'] } });
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  const replay = gate.optionalImpact.representativeReplays;
  // Literal source has three eligible canonical Subjects and three stores.
  assert.equal(replay.resources.inventory.requiredCases, 3 * 4 * (4 + 2 * 3 + 4 * 2));
  assert.equal(replay.comparison.resources.queries.calls, 432);
  const focal = new Set(['K-000101', 'O-000101', 'D-000101', 'D-000102', 'O-000102']);
  const members = (result, category) => Object.values(result.groups).flatMap(group => group[category])
    .map(row => row.ref?.id).filter(id => focal.has(id)).sort();
  const cases = name => replay.comparison.cases.filter(row => row.id.endsWith(`/current/direct/${name}`));
  const expected = {
    'assigned/S-000001': { before: { strict: ['D-000101', 'D-000102', 'O-000102'], possible: ['K-000101'] },
      after: { strict: ['O-000101', 'O-000102'], possible: ['D-000102'] } },
    'not-assigned/S-000001': { before: { strict: ['O-000101'], possible: ['K-000101'] },
      after: { strict: ['D-000101', 'K-000101'], possible: ['D-000102'] } },
    'and/S-000001/S-000002': { before: { strict: ['D-000101', 'O-000102'], possible: ['K-000101'] },
      after: { strict: ['O-000102'], possible: ['D-000102'] } },
  };
  for (const [name, sides] of Object.entries(expected)) for (const side of ['before', 'after']) for (const category of ['strict', 'possible']) {
    assert.deepEqual(cases(name).flatMap(row => members(row[side], category)).sort(), sides[side][category], `${name}/${side}/${category}`);
  }
  for (const row of [...cases('all'), ...cases('none')]) for (const category of ['strict', 'possible']) {
    assert.deepEqual(row.candidates[category].added, []); assert.deepEqual(row.candidates[category].removed, []);
  }
});
