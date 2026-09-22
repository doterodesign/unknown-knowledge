import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rows from '../payload/engine/lib/assignment-validation.js';
import { evaluateSubjectGovernance, validateSubjectGovernanceCapture } from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { subjectReconsiderationFixture } from './helpers/subject-reconsideration-fixture.js';

function bound(f, materialCaptures = f.materialCaptures) {
  const operationBudget = createSubjectValidationBudget(f.budget);
  const model = f.candidateModel;
  const evaluated = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
    identityIndex: model.identityIndex, decisionCaptures: f.decisionCaptures,
    assessmentCaptures: [f.beforeCaptures], materialCaptures }, { operationBudget });
  assert.equal(evaluated.ok, true, JSON.stringify(evaluated.diagnostics));
  const binding = validateSubjectGovernanceCapture(evaluated.governance, { model }, { operationBudget });
  assert.equal(binding.ok, true, JSON.stringify(binding.diagnostics));
  return { governance: evaluated.governance, operationBudget };
}
function change(f, governance, kind = 'knowledge', before = [], candidate = ['S-000001']) {
  const id = { knowledge: 'K-000001', ontology: 'O-000001', decision: 'D-000001' }[kind];
  const row = subjects => ({ ref: { namespace: f.candidateModel.identity.namespace, kind, id }, entry: {
    id, file: `${kind}/owner.yaml`, record: { id, subjects,
      ...(kind === 'knowledge' ? { facets: { stage: 'verified' } } : { status: kind === 'ontology' ? 'active' : 'accepted' }) },
  } });
  return { before: row(before), candidate: row(candidate), governance };
}
const continued = (input, operationBudget) => rows.validateContinuedAssignmentChange(input, { budget: { redirects: 0 }, operationBudget });

test('fixed ordinary continuation uses actual reconsideration governance for K/O/D rows', t => {
  const f = subjectReconsiderationFixture(t);
  const actual = bound(f);
  for (const kind of ['knowledge', 'ontology', 'decision']) {
    const input = change(f, actual.governance, kind);
    const expected = rows.validateAssignmentChange(input, { purpose: 'new-assignment', budget: { redirects: 0 } });
    assert.equal(expected.ok, true, JSON.stringify(expected.diagnostics));
    const result = continued(input, actual.operationBudget);
    assert.deepEqual(result, expected);
    assert.equal(result.publicationReady, false);
    assert.deepEqual(result.changes.newEffective, ['S-000001']);
  }
});

test('zero-target rows charge ownership once and refuse different or exhausted allowances', t => {
  const f = subjectReconsiderationFixture(t), actual = bound(f);
  const input = change(f, actual.governance, 'knowledge', ['S-000001'], []);
  const before = actual.operationBudget.used;
  assert.equal(continued(input, actual.operationBudget).ok, true);
  assert.deepEqual(actual.operationBudget.used, { ...before, validationSteps: before.validationSteps + 1 });
  const other = bound(f);
  assert.equal(continued(input, other.operationBudget).diagnostics[0].code, 'subject-operation-mismatch');
  assert.throws(() => actual.operationBudget.charge('validationSteps', f.budget.maxValidationSteps, 'test-exhaustion'));
  const result = continued(input, actual.operationBudget);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'subject-validation-budget');
});

test('newly effective unavailable subject refuses while retained use does not waive P3 query checks', t => {
  const f = subjectReconsiderationFixture(t), actual = bound(f, []);
  const added = continued(change(f, actual.governance), actual.operationBudget);
  assert.equal(added.ok, false);
  const retained = change(f, actual.governance, 'knowledge', ['S-000001'], ['S-000001']);
  assert.equal(continued(retained, actual.operationBudget).ok, true);
  const query = rows.validateAssignments(retained.candidate, actual.governance,
    { purpose: 'query', policy: 'current', budget: { redirects: 0 }, operationBudget: actual.operationBudget });
  assert.equal(query.ok, false);
});

test('invalid continued options refuse before reading rows and do not widen legacy options', () => {
  let calls = 0;
  const trapped = { get before() { calls++; throw new Error('before'); } };
  for (const options of [undefined, {}, { budget: { redirects: 0 }, operationBudget: {} },
    { budget: { redirects: 0 }, operationBudget: {}, policy: 'historical' }]) {
    assert.equal(rows.validateContinuedAssignmentChange(trapped, options).ok, false);
  }
  assert.equal(calls, 0);
  assert.equal(rows.validateAssignmentChange({ before: null, candidate: null, governance: null },
    { purpose: 'new-assignment', operationBudget: {} }).ok, false);
});
