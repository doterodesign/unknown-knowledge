import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSubjectValidationBudget, getSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';

import { guardCapturedDocument, getDocumentBudgetFailure } from '../payload/engine/lib/document-budget.js';

const limits = { maxCaptureBytes: 100, maxDocumentNodes: 100, maxDocumentTextUnits: 100,
  maxSubjects: 100, maxHistoryRows: 100, maxValidationSteps: 100 };
test('one explicit budget counts expanded occurrences and refuses before exceeding a shared limit', () => {
  const budget = createSubjectValidationBudget({ ...limits, maxCaptureBytes: 4 });
  budget.charge('captureBytes', 2, 'registry');
  budget.charge('captureBytes', 2, 'identity');
  assert.equal(budget.used.captureBytes, 4);
  const alias = { x: '😀' };
  budget.guard([alias, alias], 'aliases');
  assert.equal(budget.used.documentNodes, 5);
  assert.equal(budget.used.documentTextUnits, 6, 'each key and UTF-16 string occurrence is counted');
  assert.throws(() => budget.charge('captureBytes', 1, 'decision'), { code: 'subject-validation-budget' });
});
test('budgets require all safe integer limits and cycles are not discounted as shared objects', () => {
  for (const bad of [undefined, {}, { ...limits, maxSubjects: -1 }, { ...limits, extra: 1 },
    { ...limits, maxHistoryRows: 1.5 }, { ...limits, maxCaptureBytes: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => createSubjectValidationBudget(bad), { code: 'invalid-subject-validation-budget' });
  }
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => createSubjectValidationBudget(limits).guard(cyclic, 'registry'), { code: 'cyclic-subject-input' });
  const zero = createSubjectValidationBudget(Object.fromEntries(Object.keys(limits).map((key) => [key, 0])));
  assert.throws(() => zero.guard(null, 'registry'), { code: 'subject-validation-budget' });
});

test('a failed debit prevents later work even when another counter has room', () => {
  const budget = createSubjectValidationBudget({ ...limits, maxCaptureBytes: 0 });
  assert.throws(() => budget.charge('captureBytes', 1, 'first'), { code: 'subject-validation-budget' });
  assert.throws(() => budget.guard(null, 'later'), { code: 'subject-validation-budget', counter: 'captureBytes', phase: 'first' });
  assert.equal(budget.used.documentNodes, 0);
});


test('authentic frozen budgets cannot be copied or replenished through returned state', () => {
  const budget = createSubjectValidationBudget(limits);
  assert.equal(Object.isFrozen(budget), true);
  assert.equal(getSubjectValidationBudget(budget), budget);
  for (const fake of [null, {}, { ...budget }, JSON.parse(JSON.stringify(budget))]) {
    assert.throws(() => getSubjectValidationBudget(fake), { code: 'invalid-subject-validation-budget-handle' });
  }
  budget.charge('subjects', 4, 'first'); budget.used.subjects = 0;
  assert.equal(budget.used.subjects, 4);
  assert.throws(() => budget.charge('documentNodes', 1, 'bypass-neutral'), TypeError);
});

test('capture admission binds wrapper, buffer, length and current byte content', () => {
  const budget = createSubjectValidationBudget(limits);
  const capture = { bytes: Buffer.from('abc') };
  budget.admitCapture(capture); budget.admitCapture(capture);
  assert.equal(budget.used.captureBytes, 3);
  capture.bytes[0] = 100; budget.admitCapture(capture);
  assert.equal(budget.used.captureBytes, 6, 'same buffer identity cannot hide changed content');
  budget.admitCapture({ ...capture });
  assert.equal(budget.used.captureBytes, 9, 'copied wrapper is new admission');
  capture.bytes = Buffer.from(capture.bytes); budget.admitCapture(capture);
  assert.equal(budget.used.captureBytes, 12, 'replaced buffer is new admission');
  const other = createSubjectValidationBudget(limits); other.admitCapture(capture);
  assert.equal(other.used.captureBytes, 3, 'admission never crosses operation ownership');
});

test('capture reservations charge before decode and cannot be reused, forged or transferred', () => {
  const budget = createSubjectValidationBudget({ ...limits, maxCaptureBytes: 3 });
  const token = budget.reserveCaptureBytes(3);
  assert.equal(budget.used.captureBytes, 3);
  const capture = { bytes: Buffer.from('abc') };
  budget.admitCapture(capture, token); budget.admitCapture(capture);
  assert.equal(budget.used.captureBytes, 3);
  for (const wrong of [token, {}, { ...token }]) {
    assert.throws(() => budget.admitCapture(capture, wrong), { code: 'invalid-capture-reservation' });
  }
  const other = createSubjectValidationBudget(limits);
  assert.throws(() => other.admitCapture(capture, token), { code: 'invalid-capture-reservation' });
  const short = other.reserveCaptureBytes(2);
  assert.throws(() => other.admitCapture(capture, short), { code: 'invalid-capture-reservation' });
  assert.equal(other.used.captureBytes, 2, 'invalid consumption cannot refund reserved capacity');
  assert.throws(() => budget.reserveCaptureBytes(1), { code: 'subject-validation-budget' });
  assert.deepEqual(budget.failure, { code: 'subject-validation-budget', message: 'Limit maxCaptureBytes exhausted during raw-captures.',
    counter: 'captureBytes', phase: 'raw-captures', attempted: 1, remaining: 0 });
  budget.failure.remaining = 100;
  assert.equal(budget.failure.remaining, 0);
});

test('direct neutral guard exhaustion latches the outer Subject allowance', () => {
  const budget = createSubjectValidationBudget({ ...limits, maxDocumentNodes: 0 });
  assert.throws(() => guardCapturedDocument(null, budget.documentBudget, { phase: 'neutral-reader' }), { code: 'document-budget-exhausted' });
  assert.equal(getDocumentBudgetFailure(budget.documentBudget).attempted, 1);
  getDocumentBudgetFailure(budget.documentBudget).remaining = 99;
  assert.equal(getDocumentBudgetFailure(budget.documentBudget).remaining, 0);
  assert.throws(() => budget.charge('subjects', 1, 'later'), { code: 'subject-validation-budget', counter: 'documentNodes', phase: 'neutral-reader' });
  assert.equal(budget.used.subjects, 0);
  assert.equal(getSubjectValidationBudget(budget), budget, 'brand accessor still permits failure/usage inspection');
});
