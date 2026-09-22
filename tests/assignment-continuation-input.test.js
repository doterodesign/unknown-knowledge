import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { getSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';

const api = () => import('../payload/engine/lib/subject-assignment-continuation.js');
const limits = { maxCaptureBytes: 10000, maxDocumentNodes: 10000, maxDocumentTextUnits: 10000,
  maxSubjects: 100, maxHistoryRows: 100, maxValidationSteps: 10000 };
const raw = (text, file) => {
  const bytes = Buffer.from(text);
  return { capture: describeCandidateBytes({ file, bytes, objectFormat: 'sha256' }), bytes, objectFormat: 'sha256' };
};
const input = () => ({ decisionCaptures: [raw('old decision', 'decisions/old.yaml')],
  continuation: { version: 1, assessmentCaptures: [{ registry: raw('registry', 'subjects/registry.yaml'),
    identity: raw('identity', '_identity.yaml') }], materialCaptures: [raw('unchanged material', 'material.txt')],
  limits: { governance: { ...limits } } } });
const wireCapture = ({ bytes, ...row }) => ({ ...row, bytesBase64: bytes.toString('base64') });
const wire = value => ({ decisionCaptures: value.decisionCaptures.map(wireCapture), continuation: { ...value.continuation,
  assessmentCaptures: value.continuation.assessmentCaptures.map(pair => ({ registry: wireCapture(pair.registry), identity: wireCapture(pair.identity) })),
  materialCaptures: value.continuation.materialCaptures.map(wireCapture) } });

test('only absent continuation bypasses admission without touching legacy evidence', async () => {
  const module = await api();
  let calls = 0;
  const legacy = { get decisionCaptures() { calls++; throw new Error('old path'); } };
  for (const name of ['admitSubjectAssignmentContinuation', 'decodeSubjectAssignmentContinuation']) {
    assert.deepEqual(module[name](legacy), { ok: true, present: false, bundle: null, diagnostics: [] });
  }
  assert.equal(calls, 0);
});

test('raw and wire own the same evidence and digest using authentic single allowances', async () => {
  const { admitSubjectAssignmentContinuation, decodeSubjectAssignmentContinuation } = await api();
  const original = input(), transported = wire(original);
  const before = structuredClone(transported);
  const rawResult = admitSubjectAssignmentContinuation(original), wireResult = decodeSubjectAssignmentContinuation(transported);
  for (const result of [rawResult, wireResult]) {
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.present, true);
    assert.equal(getSubjectValidationBudget(result.bundle.operationBudget), result.bundle.operationBudget);
    assert.equal(result.bundle.inputDigest, canonicalSha256({ version: 1, ...before }));
    assert.deepEqual(result.bundle.limits, limits);
    assert.deepEqual(result.bundle.evidence, { decisionCaptures: original.decisionCaptures,
      assessmentCaptures: original.continuation.assessmentCaptures, materialCaptures: original.continuation.materialCaptures });
    assert.equal(result.bundle.operationBudget.used.captureBytes, 46); // 12 + 8 + 8 + 18.
    assert.equal(result.bundle.operationBudget.failure, null);
  }
  original.decisionCaptures[0].bytes.fill(0);
  original.continuation.limits.governance.maxCaptureBytes = 0;
  transported.continuation.materialCaptures[0].bytesBase64 = '';
  assert.equal(rawResult.bundle.evidence.decisionCaptures[0].bytes.toString(), 'old decision');
  assert.equal(wireResult.bundle.evidence.materialCaptures[0].bytes.toString(), 'unchanged material');
  assert.deepEqual(rawResult.bundle.limits, limits);
});

test('null undefined inherited accessors and alternative evidence aliases never become omission', async () => {
  const { admitSubjectAssignmentContinuation } = await api();
  let calls = 0;
  const attacks = [
    () => ({ ...input(), continuation: undefined }),
    () => ({ ...input(), continuation: null }),
    () => Object.assign(Object.create({ continuation: input().continuation }), { decisionCaptures: [] }),
    () => Object.defineProperty({}, 'continuation', { get() { calls++; throw new Error('continuation'); }, enumerable: true }),
    () => { const value = input(); value.continuation.decisionCaptures = []; return value; },
    () => { const value = input(); delete value.continuation.materialCaptures; return value; },
    () => { const value = input(); value.continuation.version = 2; return value; },
    () => { const value = input(); value.continuation.limits.governance = 1; return value; },
    () => { const value = input(); Object.defineProperty(value.continuation.limits.governance, 'maxCaptureBytes',
      { get() { calls++; throw new Error('limit'); }, enumerable: true }); return value; },
  ];
  for (const attack of attacks) {
    const result = admitSubjectAssignmentContinuation(attack());
    assert.equal(result.ok, false);
    assert.equal(result.present, true);
    assert.equal(result.diagnostics[0].code, 'invalid-assignment-continuation');
  }
  assert.equal(calls, 0);
});

test('provided empty lists still pay admission and every malformed family refuses', async () => {
  const { admitSubjectAssignmentContinuation } = await api();
  const value = input(); value.decisionCaptures = [];
  value.continuation.assessmentCaptures = []; value.continuation.materialCaptures = [];
  const empty = admitSubjectAssignmentContinuation(value);
  assert.equal(empty.ok, true);
  assert.equal(empty.bundle.operationBudget.used.captureBytes, 0);
  assert.ok(empty.bundle.operationBudget.used.documentNodes > 0);
  for (const family of ['decisionCaptures', 'assessmentCaptures', 'materialCaptures']) {
    for (const invalid of [undefined, null, new Array(1), Object.assign([], { extra: true })]) {
      const next = input(); (family === 'decisionCaptures' ? next : next.continuation)[family] = invalid;
      assert.equal(admitSubjectAssignmentContinuation(next).ok, false);
    }
  }
});

test('one-short admission retains actual exhausted allowance but no authoritative digest/evidence', async () => {
  const { admitSubjectAssignmentContinuation, decodeSubjectAssignmentContinuation } = await api();
  for (const [admit, convert] of [[admitSubjectAssignmentContinuation, value => value], [decodeSubjectAssignmentContinuation, wire]]) {
    const enough = input(); enough.continuation.limits.governance.maxCaptureBytes = 46;
    assert.equal(admit(convert(enough)).ok, true);
    enough.continuation.limits.governance.maxCaptureBytes = 45;
    const result = admit(convert(enough));
    assert.equal(result.ok, false);
    assert.equal(result.bundle.inputDigest, null);
    assert.equal(result.bundle.evidence, null);
    assert.equal(result.bundle.operationBudget.used.captureBytes, 28);
    assert.equal(result.bundle.operationBudget.failure.counter, 'captureBytes');
    assert.throws(() => result.bundle.operationBudget.assertActive(), { code: 'subject-validation-budget' });
  }
});

test('digest binds sole top-level Decisions, source locators, order and limits', async () => {
  const { admitSubjectAssignmentContinuation } = await api();
  const initial = admitSubjectAssignmentContinuation(input()).bundle.inputDigest;
  for (const edit of [
    value => { value.decisionCaptures[0] = raw('different', 'decisions/old.yaml'); },
    value => { value.decisionCaptures[0].capture.source = { commit: '1'.repeat(64), tree: '2'.repeat(64) }; },
    value => { value.continuation.limits.governance.maxSubjects++; },
    value => { value.continuation.materialCaptures.push(raw('other', 'other.txt')); },
  ]) {
    const value = input(); edit(value);
    const result = admitSubjectAssignmentContinuation(value);
    assert.equal(result.ok, true);
    assert.notEqual(result.bundle.inputDigest, initial);
  }
});
