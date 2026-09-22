import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSubjectGovernance, validateSubjectGovernanceCapture, subjectEligibility, getGovernedSubjectRegistry, getSubjectGovernanceDescriptor } from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { subjectQueryFixture } from './helpers/subject-query-fixture.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { readSubjectRegistry } from '../payload/engine/lib/subject-registry-reader.js';

import { validateAssignments } from '../payload/engine/lib/assignment-validation.js';
import { iterateCurrentRecords } from '../payload/engine/lib/record-identity.js';

const limits = { maxCaptureBytes: 1000000, maxDocumentNodes: 1000000, maxDocumentTextUnits: 1000000,
  maxSubjects: 1000000, maxHistoryRows: 1000000, maxValidationSteps: 1000000 };

test('governance rejects a forged operation handle before trusting caller methods', () => {
  const f = subjectQueryFixture(); let invoked = false;
  const fake = { guard() { invoked = true; }, charge() { invoked = true; } };
  assert.throws(() => evaluateSubjectGovernance({ registry: f.model.subjectRegistry, identity: f.model.identity,
    identityIndex: f.model.identityIndex }, { operationBudget: fake }), { code: 'invalid-subject-validation-budget-handle' });
  assert.equal(invoked, false);
});

test('actual reader, governance binding and eligibility share the same exhaustion', (t) => {
  const f = subjectQueryDiskFixture(t);
  const operationBudget = createSubjectValidationBudget({ ...limits, maxHistoryRows: 0 });
  assert.throws(() => readSubjectRegistry({ kitDir: f.kitRoot, identity: f.context.model.identity, operationBudget }),
    { code: 'subject-validation-budget', counter: 'historyRows' });
  assert.throws(() => validateSubjectGovernanceCapture(f.context.subjectGovernance, { model: f.context.model }, { operationBudget }),
    { code: 'subject-validation-budget', counter: 'historyRows' });
  assert.throws(() => subjectEligibility(f.context.subjectGovernance, 'S-000001', { purpose: 'query', operationBudget }),
    { code: 'subject-validation-budget', counter: 'historyRows' });
});


test('repeated actual governance proof shares raw admission but debits every parsed validation visit', (t) => {
  const f = subjectQueryDiskFixture(t);
  const operationBudget = createSubjectValidationBudget(limits);
  const input = { registry: f.context.model.subjectRegistry, identity: f.context.model.identity,
    identityIndex: f.context.model.identityIndex, decisionCaptures: f.decisionCaptures };
  const first = evaluateSubjectGovernance(input, { operationBudget });
  assert.equal(first.ok, true);
  const used = operationBudget.used;
  const second = evaluateSubjectGovernance(input, { operationBudget });
  assert.equal(second.ok, true); assert.equal(operationBudget.used.captureBytes, used.captureBytes);
  assert.equal(operationBudget.used.documentNodes, used.documentNodes * 2);
  assert.equal(operationBudget.used.historyRows, used.historyRows * 2);
  assert.equal(subjectEligibility(second.governance, 'S-000001', { purpose: 'query', budget: { redirects: 0 }, operationBudget }).eligible, true);
  assert.ok(operationBudget.used.validationSteps > used.validationSteps * 2);
  assert.throws(() => evaluateSubjectGovernance(input, { budget: operationBudget, operationBudget }), { code: 'ambiguous-subject-validation-budget' });
  assert.throws(() => validateSubjectGovernanceCapture(second.governance, { model: f.context.model }, { operationBudget: { ...operationBudget } }),
    { code: 'invalid-subject-validation-budget-handle' });
  f.decisionCaptures[0].bytes[0] = 0;
  const corrupt = evaluateSubjectGovernance(input, { operationBudget });
  assert.equal(corrupt.ok, false, 'admission is never integrity approval');
  assert.equal(operationBudget.used.captureBytes, used.captureBytes * 2);
});


test('assignment delegation preserves the authentic operation and exhaustion after diagnostic conversion', () => {
  const f = subjectQueryFixture();
  const operationBudget = createSubjectValidationBudget(limits);
  const evaluated = evaluateSubjectGovernance({ registry: f.model.subjectRegistry, identity: f.model.identity,
    identityIndex: f.model.identityIndex }, { operationBudget });
  assert.equal(evaluated.ok, true);
  operationBudget.charge('validationSteps', limits.maxValidationSteps - operationBudget.used.validationSteps, 'remaining');
  const row = iterateCurrentRecords(f.model, { kinds: ['knowledge'] })[0];
  const checked = validateAssignments(row, evaluated.governance, { purpose: 'query', budget: { redirects: 0 }, operationBudget });
  assert.equal(checked.ok, false);
  assert.equal(checked.diagnostics[0].code, 'subject-validation-budget');
  assert.equal(operationBudget.failure.counter, 'validationSteps');
  assert.throws(() => operationBudget.assertActive(), { code: 'subject-validation-budget' });
  const empty = { ...row, entry: { ...row.entry, record: { ...row.entry.record, subjects: [] } } };
  assert.equal(validateAssignments(empty, evaluated.governance, { purpose: 'query', operationBudget }).ok, false);
});


test('eligibility cannot reuse unbudgeted or different-operation governance to reset admission', (t) => {
  const f = subjectQueryDiskFixture(t);
  const operationBudget = createSubjectValidationBudget(limits);
  assert.throws(() => subjectEligibility(f.context.subjectGovernance, 'S-000001', { purpose: 'query', operationBudget }),
    { code: 'subject-operation-mismatch' });
  const evaluated = evaluateSubjectGovernance({ registry: f.context.model.subjectRegistry, identity: f.context.model.identity,
    identityIndex: f.context.model.identityIndex, decisionCaptures: f.decisionCaptures }, { operationBudget });
  assert.equal(evaluated.ok, true);
  const other = createSubjectValidationBudget(limits);
  assert.throws(() => subjectEligibility(evaluated.governance, 'S-000001', { purpose: 'query', operationBudget: other }),
    { code: 'subject-operation-mismatch' });
  assert.throws(() => validateSubjectGovernanceCapture(evaluated.governance, { model: f.context.model }, { operationBudget: other }),
    { code: 'subject-operation-mismatch' });
  assert.equal(validateSubjectGovernanceCapture(evaluated.governance, { model: f.context.model }, { operationBudget }).ok, true);
  const before = operationBudget.used;
  assert.equal(subjectEligibility(evaluated.governance, 'S-000001', { purpose: 'query', operationBudget }).eligible, true);
  assert.equal(operationBudget.used.subjects - before.subjects, 3, 'two actual resolutions and one verification row');
  assert.equal(operationBudget.used.documentNodes, before.documentNodes, 'no fabricated repeat whole immutable registry guard');
  const next = operationBudget.used;
  subjectEligibility(evaluated.governance, 'S-000001', { purpose: 'query', operationBudget });
  assert.equal(operationBudget.used.subjects - next.subjects, 0, 'the same immutable capture reuses verified current eligibility');
  assert.equal(operationBudget.used.validationSteps - next.validationSteps, 2, 'eligibility admission and private lookup remain actual work');
  assert.equal(operationBudget.used.documentNodes, next.documentNodes, 'reuse adds no fictional document traversal');
});


test('returned registry copies and descriptors debit actual repeated visits on the same operation', (t) => {
  const f = subjectQueryDiskFixture(t);
  const operationBudget = createSubjectValidationBudget(limits);
  const evaluated = evaluateSubjectGovernance({ registry: f.context.model.subjectRegistry, identity: f.context.model.identity,
    identityIndex: f.context.model.identityIndex, decisionCaptures: f.decisionCaptures }, { operationBudget });
  const before = operationBudget.used;
  const registry = getGovernedSubjectRegistry(evaluated.governance, { operationBudget });
  assert.equal(operationBudget.used.subjects - before.subjects, 3);
  assert.ok(operationBudget.used.documentNodes > before.documentNodes);
  const next = operationBudget.used.documentNodes;
  assert.equal(getSubjectGovernanceDescriptor(evaluated.governance, { operationBudget }).events.length, 1);
  assert.ok(operationBudget.used.documentNodes > next);
  registry.subjects.clear();
  assert.equal(subjectEligibility(evaluated.governance, 'S-000001', { purpose: 'query', operationBudget }).eligible, true);
  const other = createSubjectValidationBudget(limits);
  assert.throws(() => getGovernedSubjectRegistry(evaluated.governance, { operationBudget: other }), { code: 'subject-operation-mismatch' });
});
