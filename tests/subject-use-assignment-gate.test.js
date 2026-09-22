import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { runPreparedSubjectUseAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { subjectUseAssignmentFixture } from './helpers/subject-use-assignment-fixture.js';

test('actual shared merge derives scope and preserves full assignment history without upgrading raw unknown inventory', async (t) => {
  const f = subjectUseAssignmentFixture(t);
  const pending = runPreparedSubjectUseAssignmentGate(f.input);
  f.input.operation.survivor = 'S-999999';
  f.input.evidence.decisionCaptures[0].bytes.fill(0);
  const result = await pending;
  assert.equal(result.core.ok, true, JSON.stringify(result));
  assert.equal(result.assignment.ok, true, JSON.stringify(result));
  assert.equal(result.core.inventory.status, 'incomplete');
  assert.equal(result.core.authoredReferenceClosure.semanticCompleteness, 'unknown');
  assert.deepEqual(result.assignment.scope.refs, result.core.assignments.map(({ ref }) => ref));
  assert.equal(result.assignment.checks.history.status, 'passed');
  assert.equal(result.assignment.checks.authorizer.status, 'passed');
  assert.equal(result.assignment.publicationReady, false);
  assert.deepEqual(Object.keys(result), ['version', 'core', 'assignment']);
});

test('public joint gate rejects caller scope, callbacks and successful reports at admission', async () => {
  const result = await runPreparedSubjectUseAssignmentGate({ core: { ok: true }, context: {}, check: () => true });
  assert.equal(result.core, null);
  assert.equal(result.assignment.ok, false);
  assert.equal(result.assignment.diagnostics[0].code, 'invalid-assignment-gate-input');
});

test('actual core refusal is retained without running assignment capture or approval checks', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.input.operation.retainedUnknowns.pop();
  const result = await runPreparedSubjectUseAssignmentGate(f.input);
  assert.equal(result.core.ok, false);
  assert.equal(result.core.diagnostics[0].code, 'merge-retained-unknown-scope');
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-merge-scope-refused');
  assert.equal(result.assignment.checks.captures.status, 'not-performed');
});

test('operation digest and event rows cannot substitute for the exact independently derived merge scope', async (t) => {
  const f = subjectUseAssignmentFixture(t);
  f.input.operation.assignmentEvent.changeDigest = '0'.repeat(64);
  let result = await runPreparedSubjectUseAssignmentGate(f.input);
  assert.equal(result.core.ok, true);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-merge-binding-mismatch');
  f.assignmentEvent.rows.pop(); f.baseline.baselines.pop();
  result = await runPreparedSubjectUseAssignmentGate(f.save());
  assert.equal(result.core.ok, true);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-merge-binding-mismatch');
});

test('registry and assignment reviews require the full same Decision tuple including review reference', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.assignmentEvent.review.reference = 'review:different-reference';
  const result = await runPreparedSubjectUseAssignmentGate(f.save());
  assert.equal(result.core.ok, true);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-merge-decision-mismatch');
  assert.equal(result.assignment.ok, false);
});

test('registry exception never authorizes unrelated candidate files', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.put('unrelated.txt', 'outside operation');
  const result = await runPreparedSubjectUseAssignmentGate(f.save());
  assert.equal(result.core.ok, true);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-unselected-path-changed');
});

test('actual selected record metadata and exact review note remain protected after P2 scope passes', async (t) => {
  const f = subjectUseAssignmentFixture(t);
  f.put('knowledge/K-000001.md', f.read('knowledge/K-000001.md').replace('Existing evidence metadata retained.', 'Evidence rewritten.'));
  const result = await runPreparedSubjectUseAssignmentGate(f.save());
  assert.equal(result.core.ok, true);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-preservation-failed');
});

test('assignment capture allowance separately charges actual registry correspondence', async (t) => {
  const f = subjectUseAssignmentFixture(t); f.input.limits.assignments.maxCaptureBytes = 0;
  const result = await runPreparedSubjectUseAssignmentGate(f.input);
  assert.equal(result.core.ok, true);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-byte-budget');
  assert.ok(result.assignment.used.captureBytes > 0);
});

test('registry content permission does not permit an executable-bit change', async (t) => {
  const f = subjectUseAssignmentFixture(t); chmodSync(join(f.kitRoot, 'subjects/registry.yaml'), 0o755);
  const result = await runPreparedSubjectUseAssignmentGate(f.save());
  assert.equal(result.core.ok, true);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-merge-registry-mismatch');
});
