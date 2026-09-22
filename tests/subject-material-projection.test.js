import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as governance from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { subjectReconsiderationCoreFixture } from './helpers/subject-reconsideration-core-fixture.js';

test('material projection selects original object identities under a fresh authentic allowance', t => {
  const f = subjectReconsiderationCoreFixture(t);
  const project = governance.projectSubjectMaterialCaptures;
  assert.equal(typeof project, 'function');
  const before = project({ registryDocument: f.beforeDocument, materialCaptures: f.evidence.materialCaptures },
    { operationBudget: createSubjectValidationBudget(f.limits.governance) });
  assert.deepEqual(before.selected, []);
  assert.deepEqual(before.excludedLocators, f.evidence.materialCaptures.map(row => row.capture));
  const after = project({ registryDocument: f.candidateDocument, materialCaptures: f.evidence.materialCaptures },
    { operationBudget: createSubjectValidationBudget(f.limits.governance) });
  assert.equal(after.selected[0], f.evidence.materialCaptures[0]);
  assert.deepEqual(after.excludedLocators, []);
});

test('private selector extraction preserves the pre-extraction model counters and exact allowance boundary', t => {
  const f = subjectReconsiderationCoreFixture(t), { id, proposal, subject, registryEvent } = f.operation;
  const input = { beforeModel: f.beforeModel, candidateModel: f.candidateModel, beforeCaptures: f.beforeCaptures,
    decisionCaptures: f.evidence.decisionCaptures, materialCaptures: f.evidence.materialCaptures,
    assessmentCaptures: [], operation: { id, proposal, subject, registryEvent }, allocationLimits: f.limits.allocation };
  // Measured on the original model before the extraction; capture/object IDs vary, logical work does not.
  const expected = { captureBytes: 4546, documentNodes: 2177, documentTextUnits: 39782, subjects: 29,
    historyRows: 8, validationSteps: 118, relevantRefusalRows: 2 };
  const exactLimits = { maxCaptureBytes: expected.captureBytes, maxDocumentNodes: expected.documentNodes,
    maxDocumentTextUnits: expected.documentTextUnits, maxSubjects: expected.subjects,
    maxHistoryRows: expected.historyRows, maxValidationSteps: expected.validationSteps };
  const exact = governance.validateSubjectReconsiderationCreation({ ...input, budget: exactLimits });
  assert.equal(exact.ok, true, JSON.stringify(exact.diagnostics));
  assert.deepEqual(exact.used, expected);
  const allowance = createSubjectValidationBudget({ ...exactLimits, maxValidationSteps: expected.validationSteps - 1 });
  const short = governance.validateSubjectReconsiderationCreation(input, { operationBudget: allowance });
  assert.equal(short.ok, false);
  assert.equal(short.diagnostics.at(-1).code, 'subject-validation-budget');
  assert.equal(short.used.validationSteps, expected.validationSteps - 1);
});

test('material selector authenticates before any caller getter and rejects dense-array extras', t => {
  const f = subjectReconsiderationCoreFixture(t);
  assert.equal(typeof governance.projectSubjectMaterialCaptures, 'function');
  let reads = 0;
  const trapped = { get registryDocument() { reads++; throw new Error('must not read'); } };
  for (const operationBudget of [undefined, {}]) {
    assert.throws(() => governance.projectSubjectMaterialCaptures(trapped, { operationBudget }),
      { code: 'invalid-subject-validation-budget-handle' });
  }
  assert.equal(reads, 0);
  const captures = [...f.evidence.materialCaptures];
  Object.defineProperty(captures, Symbol.iterator, { value() { reads++; throw new Error('must not iterate'); } });
  assert.throws(() => governance.projectSubjectMaterialCaptures({ registryDocument: f.beforeDocument, materialCaptures: captures },
    { operationBudget: createSubjectValidationBudget(f.limits.governance) }));
  assert.equal(reads, 0);
});

test('new material projection refuses nonenumerable locator accessors and malformed history rows without evaluating them', t => {
  const f = subjectReconsiderationCoreFixture(t), locator = { ...f.evidence.materialCaptures[0].capture };
  let reads = 0;
  Object.defineProperty(locator, 'file', { get() { reads++; throw new Error('hidden locator getter'); }, enumerable: false });
  const input = { registryDocument: f.beforeDocument, materialCaptures: [{ ...f.evidence.materialCaptures[0], capture: locator }] };
  assert.throws(() => governance.projectSubjectMaterialCaptures(input,
    { operationBudget: createSubjectValidationBudget(f.limits.governance) }), { code: 'invalid-material-projection' });
  assert.equal(reads, 0);
  const document = structuredClone(f.candidateDocument);
  document.history.at(-1).reconsideration.sources = [null];
  assert.throws(() => governance.projectSubjectMaterialCaptures({ ...input, registryDocument: document, materialCaptures: [] },
    { operationBudget: createSubjectValidationBudget(f.limits.governance) }), { code: 'invalid-material-projection' });
});
