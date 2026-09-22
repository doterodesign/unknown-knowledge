import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectReconsiderationCoreFixture } from './helpers/subject-reconsideration-core-fixture.js';
import { admitSubjectReconsiderationInput } from '../payload/engine/lib/subject-reconsideration-input.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';

const limits = { maxCaptureBytes: 100000, maxDocumentNodes: 100000,
  maxDocumentTextUnits: 100000, maxSubjects: 1000, maxHistoryRows: 1000, maxValidationSteps: 100000 };
const capture = (text = 'abc', file = 'material.txt') => {
  const bytes = Buffer.from(text);
  return { capture: describeCandidateBytes({ file, bytes, objectFormat: 'sha1' }), bytes, objectFormat: 'sha1' };
};
const evidence = () => ({ decisionCaptures: [capture()], assessmentCaptures: [], materialCaptures: [capture('xy', 'other.txt')] });
const api = () => import('../payload/engine/lib/subject-capture-admission.js');

test('actual pre-extraction input retains exact admission counters and failure phases', t => {
  const f = subjectReconsiderationCoreFixture(t);
  // Checkout coordinates are metadata text; their host-dependent length is charged once.
  const rootTextUnits = f.input().repoRoot.length;
  const expected = {
    success: { used: [4546, 69, 1696 + rootTextUnits, 4558], change: {} },
    bytes: { used: [0, 42, 937 + rootTextUnits, 3], change: { maxCaptureBytes: 0 }, phase: 'reconsideration-input-owned-copy', attempted: 704 },
    nodes: { used: [0, 0, 0, 1], change: { maxDocumentNodes: 0 }, phase: 'reconsideration-input-metadata', attempted: 1 },
    steps: { used: [0, 33, 671 + rootTextUnits, 1], change: { maxValidationSteps: 1 }, phase: 'reconsideration-input-capture-rows', attempted: 1 },
  };
  for (const [name, row] of Object.entries(expected)) {
    const budget = createSubjectValidationBudget({ ...f.limits.governance, ...row.change });
    const result = admitSubjectReconsiderationInput(f.input(), { operationBudget: budget });
    assert.equal(result.ok, name === 'success', JSON.stringify(result.diagnostics));
    assert.deepEqual(budget.used, { captureBytes: row.used[0], documentNodes: row.used[1],
      documentTextUnits: row.used[2], subjects: 0, historyRows: 0, validationSteps: row.used[3], relevantRefusalRows: 0 });
    if (row.phase) {
      assert.equal(budget.failure.phase, row.phase);
      assert.equal(budget.failure.attempted, row.attempted);
      assert.deepEqual(result.diagnostics, [{ code: 'subject-validation-budget', path: '', message: budget.failure.message }]);
    } else assert.equal(budget.failure, null);
  }
});

test('fixed raw wrappers own every supplied occurrence without changing caller bytes', async () => {
  const module = await api();
  for (const name of ['admitReconsiderationCaptureEvidence', 'admitAssignmentCaptureEvidence']) {
    const input = evidence(), budget = createSubjectValidationBudget(limits);
    const result = module[name](input, budget);
    assert.deepEqual(result, input);
    assert.notEqual(result.decisionCaptures[0].bytes, input.decisionCaptures[0].bytes);
    assert.equal(budget.used.captureBytes, 5);
    assert.equal(budget.used.validationSteps, 11); // 2 rows + 2 captures + (3+1)+(2+1).
    input.decisionCaptures[0].bytes.fill(0);
    assert.equal(result.decisionCaptures[0].bytes.toString(), 'abc');
  }
});

test('fixed capture boundary authenticates allowance before evidence getters', async () => {
  const module = await api();
  let calls = 0;
  const input = { get decisionCaptures() { calls++; throw new Error('getter'); } };
  for (const name of Object.keys(module)) {
    assert.throws(() => module[name](input, {}), { code: 'invalid-subject-validation-budget-handle' });
  }
  assert.equal(calls, 0);
});

test('raw one-short byte reservation refuses before copying that buffer', async t => {
  const { admitAssignmentCaptureEvidence } = await api();
  const input = evidence(), last = input.materialCaptures[0].bytes;
  const original = Buffer.from;
  let copies = 0;
  t.mock.method(Buffer, 'from', (value, ...args) => {
    if (value === last) copies++;
    return original(value, ...args);
  });
  const budget = createSubjectValidationBudget({ ...limits, maxCaptureBytes: 4 });
  assert.throws(() => admitAssignmentCaptureEvidence(input, budget), { code: 'subject-validation-budget' });
  assert.equal(copies, 0);
  assert.equal(budget.used.captureBytes, 3);
  assert.equal(budget.failure.phase, 'assignment-continuation-owned-copy');
});

test('raw buffer accessors, dense-array extras, duplicates and exotic bytes refuse', async () => {
  const { admitAssignmentCaptureEvidence } = await api();
  let calls = 0;
  const attacks = [
    input => Object.defineProperty(input.decisionCaptures[0].bytes, 'length', { get() { calls++; throw new Error('length'); } }),
    input => { input.decisionCaptures[0].bytes.extra = true; },
    input => { input.decisionCaptures = new Array(1); },
    input => { input.decisionCaptures.extra = true; },
    input => { input.decisionCaptures.push(input.decisionCaptures[0]); },
    input => { input.decisionCaptures[0].bytes = new Uint8Array([1]); },
    input => Object.defineProperty(input.decisionCaptures[0], 'bytes', { get() { calls++; throw new Error('bytes'); }, enumerable: true }),
  ];
  for (const attack of attacks) {
    const input = evidence(); attack(input);
    assert.throws(() => admitAssignmentCaptureEvidence(input, createSubjectValidationBudget(limits)));
  }
  assert.equal(calls, 0);
});

test('wire decoder reserves canonical decoded bytes once and rejects padding aliases', async t => {
  const { decodeAssignmentCaptureEvidence } = await api();
  const raw = evidence();
  const wire = () => ({ decisionCaptures: raw.decisionCaptures.map(({ bytes, ...row }) => ({ ...row, bytesBase64: bytes.toString('base64') })),
    assessmentCaptures: [], materialCaptures: [] });
  const original = Buffer.from;
  let decodes = 0;
  t.mock.method(Buffer, 'from', (value, ...args) => {
    if (args[0] === 'base64') decodes++;
    return original(value, ...args);
  });
  const budget = createSubjectValidationBudget({ ...limits, maxCaptureBytes: 3 });
  assert.deepEqual(decodeAssignmentCaptureEvidence(wire(), budget).decisionCaptures, raw.decisionCaptures);
  assert.equal(decodes, 1);
  assert.equal(budget.used.captureBytes, 3);
  const short = createSubjectValidationBudget({ ...limits, maxCaptureBytes: 2 });
  assert.throws(() => decodeAssignmentCaptureEvidence(wire(), short), { code: 'subject-validation-budget' });
  assert.equal(decodes, 1);
  for (const value of ['YQ=', 'Y Q==', 'YR==', '====', 'YQ==\n']) {
    const input = wire(); input.decisionCaptures[0].bytesBase64 = value;
    assert.throws(() => decodeAssignmentCaptureEvidence(input, createSubjectValidationBudget(limits)),
      { code: 'invalid-assignment-continuation' });
  }
});

test('large within-budget canonical wire and invalid tail do not exhaust native regex stack', async t => {
  const { decodeAssignmentCaptureEvidence } = await api();
  const bytes = Buffer.alloc(4000000, 97);
  const locator = describeCandidateBytes({ file: 'large-material.txt', bytes, objectFormat: 'sha1' });
  const text = bytes.toString('base64');
  const input = value => ({ decisionCaptures: [], assessmentCaptures: [], materialCaptures: [
    { capture: locator, objectFormat: 'sha1', bytesBase64: value },
  ] });
  const largeLimits = Object.fromEntries(Object.keys(limits).map(key => [key, 10000000]));
  const original = Buffer.from;
  let decodes = 0;
  t.mock.method(Buffer, 'from', (value, ...args) => {
    if (args[0] === 'base64') decodes++;
    return original(value, ...args);
  });
  await t.test('canonical control completes with one decode', () => {
    const budget = createSubjectValidationBudget(largeLimits);
    const result = decodeAssignmentCaptureEvidence(input(text), budget);
    assert.ok(result.materialCaptures[0].bytes.equals(bytes));
    assert.equal(budget.used.captureBytes, bytes.length);
    assert.equal(budget.failure, null);
    assert.equal(decodes, 1);
  });
  await t.test('invalid final alphabet character refuses before any decode', () => {
    const before = decodes, budget = createSubjectValidationBudget(largeLimits);
    assert.throws(() => decodeAssignmentCaptureEvidence(input(`${text.slice(0, -4)}!Q==`), budget),
      { code: 'invalid-assignment-continuation' });
    assert.equal(decodes, before);
    assert.equal(budget.failure, null);
  });
});
