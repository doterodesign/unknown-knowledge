import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectRetirementAssignmentFixture } from './helpers/subject-retirement-assignment-fixture.js';
import { runPreparedSubjectRetirementAssignmentGate } from '../payload/engine/lib/assignment-gate.js';

for (const kind of ['knowledge','ontology','decision']) test(`actual ${kind} retirement uses the existing nonempty history and preservation pipeline`, async t => {
  const f = subjectRetirementAssignmentFixture(t, { kind, nested: kind === 'decision' });
  const result = await runPreparedSubjectRetirementAssignmentGate(f.input);
  assert.equal(result.core?.ok, true, JSON.stringify(result));
  assert.equal(result.assignment.ok, true, JSON.stringify(result.assignment));
  assert.equal(result.assignment.publicationReady, false);
  assert.equal(result.assignment.scope.basis, 'actual-retirement-affected-uses');
  assert.equal(result.assignment.checks.scope.scope, 'exact-actual-retirement-affected-uses');
  assert.equal(result.assignment.checks.candidateCommitMembership.status, 'passed');
  assert.equal(result.assignment.checks.impactPolicy.status, 'not-performed');
  assert.equal(result.assignment.checks.humanApproval.status, 'not-performed');
  assert.deepEqual(result.assignment.rows[0].eligibility.changes.newEffective, []);
  assert.equal(f.assignmentEvent.rows[0].after.state, 'known');
  assert.deepEqual(f.assignmentEvent.rows[0].after.ids, []);
});

test('eventless retirement cannot fabricate a successful assignment adapter report', async t => {
  const f = subjectRetirementAssignmentFixture(t, { zero: true });
  const result = await runPreparedSubjectRetirementAssignmentGate(f.input);
  assert.equal(result.core, null); assert.equal(result.assignment.ok, false);
  assert.equal(result.assignment.checks.history.status, 'not-performed');
});
