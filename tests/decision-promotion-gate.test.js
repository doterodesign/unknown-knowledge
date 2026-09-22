import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPreparedDecisionPromotionGate } from '../payload/engine/lib/assignment-gate.js';
import { decisionPromotionGateFixture } from './helpers/decision-promotion-gate-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { decisionPromotionInputWire } from '../payload/engine/lib/decision-promotion-input.js';

test('promotion gate accepts no caller success, model or callback proof', async () => {
  const result = await runPreparedDecisionPromotionGate({ approval: true, model: {}, core: { ok: true } });
  assert.equal(result.ok, false); assert.equal(result.inputDigest, null);
  assert.equal(result.assignment, null); assert.equal(result.publicationReady, false);
});

for (const format of ['sha1', 'sha256']) test(`actual ${format} Decisions-only promotion proves exact creation without Subject authority`, async (t) => {
  const f = await decisionPromotionGateFixture(t, { format });
  f.put(f.file, 'Uncommitted user content');
  const result = await runPreparedDecisionPromotionGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.inputDigest, canonicalSha256(decisionPromotionInputWire(f.input)));
  assert.equal(result.promotion.status, 'passed');
  assert.equal(result.assignment.checks.authorizer.status, 'passed');
  assert.deepEqual(result.capabilities, {
    before: { knowledge: false, ontology: false, decisions: true, subjectRegistry: false, assignmentHistory: false },
    candidate: { knowledge: false, ontology: false, decisions: true, subjectRegistry: false, assignmentHistory: true },
  });
  assert.deepEqual(result.assignment.rows.map(({ eligibility }) => eligibility.before), [null, null]);
  assert.equal(result.assignment.checks.history.status, 'passed');
  assert.equal(result.assignment.checks.impactPolicy.scope, 'actual-decisions-only-capabilities-and-creation-obligations');
  assert.equal(result.assignment.optionalImpact.representativeReplays.status, 'not-assessed');
  assert.equal(result.assignment.checks.humanApproval.status, 'not-performed');
  assert.equal(result.publicationReady, false);
  assert.equal(f.read(f.file), 'Uncommitted user content');
  assert.equal(f.git('rev-parse', 'HEAD').toString().trim(), f.commit);
});

test('proposal source capture and occupied canonical identity refuse through actual fixed P1 planning', async (t) => {
  const f = await decisionPromotionGateFixture(t);
  for (const change of [
    (input) => { input.promotion.rows[0].beforeCapture.sha256 = '0'.repeat(64); },
    (input) => { input.promotion.rows[0].canonicalRef.id = 'D-000001'; },
  ]) {
    const input = structuredClone(f.input); change(input);
    const result = await runPreparedDecisionPromotionGate(input);
    assert.equal(result.ok, false);
    assert.equal(result.promotion.status, 'failed');
    assert.equal(result.assignment.diagnostics[0].code, 'promotion-transformation-refused');
  }
});

test('actual promotion refuses unrelated candidate bytes outside the exact planned file set', async (t) => {
  const f = await decisionPromotionGateFixture(t); f.put('unrelated.txt', 'Not part of promotion');
  const result = await runPreparedDecisionPromotionGate(f.save());
  assert.equal(result.ok, false);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-unselected-path-changed');
});

test('shared authorizer record and original evidence cannot change inside a planned file', async (t) => {
  const f = await decisionPromotionGateFixture(t);
  f.put(f.file, f.read(f.file).replace('Original π reasoning', 'Changed reasoning'));
  const result = await runPreparedDecisionPromotionGate(f.save());
  assert.equal(result.ok, false);
  assert.equal(result.assignment.diagnostics[0].code, 'promotion-candidate-transformation-mismatch');
});

test('a newly created Decision cannot authorize its own canonical creation', async (t) => {
  const f = await decisionPromotionGateFixture(t); f.event.decision.id = 'D-000002';
  const result = await runPreparedDecisionPromotionGate(f.save());
  assert.equal(result.ok, false);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-authorizer-changed');
});

test('allocation and event operation review references must match', async (t) => {
  const f = await decisionPromotionGateFixture(t); f.event.review.reference = 'review:another-operation';
  const result = await runPreparedDecisionPromotionGate(f.save());
  assert.equal(result.ok, false);
  assert.equal(result.assignment.diagnostics[0].code, 'promotion-review-mismatch');
});

test('malformed own genesis origin never falls back to absent history or ordinary adoption', async (t) => {
  const f = await decisionPromotionGateFixture(t); f.baseline.baselines[0].origin = null;
  const result = await runPreparedDecisionPromotionGate(f.save());
  assert.equal(result.ok, false);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-model-unavailable');
  assert.equal(result.capabilities.candidate, null);
});

test('actual unsupported store layout cannot masquerade as absence merely because no directory loaded', async (t) => {
  const f = await decisionPromotionGateFixture(t); f.put('ontology', 'Not a store directory');
  const result = await runPreparedDecisionPromotionGate(f.save());
  assert.equal(result.ok, false);
  assert.equal(result.capabilities.candidate.ontology, true);
  assert.equal(result.assignment.diagnostics[0].code, 'promotion-capability-unsupported');
});

test('existing assignment history remains unsupported by the first promotion branch', async (t) => {
  const namespace = '11111111-1111-4111-8111-111111111111';
  const f = await decisionPromotionGateFixture(t, { edit: ({ extras }) => {
    extras['subjects/_assignments/_baselines.yaml'] = JSON.stringify({ 'schema-version': 1, namespace,
      baselines: [{ ref: { namespace, kind: 'decision', id: 'D-000001' }, state: { state: 'unknown', reason: 'absent' },
        capture: { file: 'decisions/entries/direction.yaml', blob: 'a'.repeat(40), sha256: 'b'.repeat(64) } }] });
  } });
  const result = await runPreparedDecisionPromotionGate(f.input);
  assert.equal(result.ok, false);
  assert.equal(result.assignment.diagnostics[0].code, 'promotion-capability-unsupported');
  assert.equal(result.capabilities.before.assignmentHistory, true);
});

test('classification with any SID is outside the actual subjectless promotion branch', async (t) => {
  const f = await decisionPromotionGateFixture(t);
  f.put(f.file, f.read(f.file).replace('"subjects": []', '"subjects": ["S-000001"]'));
  f.event.rows[1].after = { state: 'known', ids: ['S-000001'] }; f.baseline.baselines[1].state = f.event.rows[1].after;
  const result = await runPreparedDecisionPromotionGate(f.save());
  assert.equal(result.ok, false);
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-model-unavailable');
  assert.equal(result.promotion.status, 'not-performed');
});

test('actual promotion source and assignment capture allowances are independent and mandatory', async (t) => {
  const f = await decisionPromotionGateFixture(t);
  for (const [group, field, value, code] of [
    ['promotion', 'maxSourceBytes', 1, 'promotion-transformation-refused'],
    ['assignments', 'maxCaptureBytes', 0, 'assignment-byte-budget'],
  ]) {
    const input = structuredClone(f.input); input.limits[group][field] = value;
    const result = await runPreparedDecisionPromotionGate(input);
    assert.equal(result.ok, false); assert.equal(result.assignment.diagnostics[0].code, code);
  }
});

test('admitted operation is detached before actual asynchronous promotion checks', async (t) => {
  const f = await decisionPromotionGateFixture(t); const digest = canonicalSha256(decisionPromotionInputWire(f.input));
  const pending = runPreparedDecisionPromotionGate(f.input);
  f.input.promotion.rows[0].canonicalRef.id = 'D-999999'; f.input.publication.review = 'review:mutated';
  const result = await pending;
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.inputDigest, digest);
});

test('syntactically valid wrong commit/tree membership returns a real failed source check', async (t) => {
  const f = await decisionPromotionGateFixture(t); f.input.candidate.tree = f.input.before.tree;
  const result = await runPreparedDecisionPromotionGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.assignment.checks.source.status, 'failed');
  assert.equal(result.assignment.diagnostics[0].code, 'assignment-snapshot-unavailable');
  assert.equal(result.promotion.status, 'not-performed'); assert.equal(result.capabilities.before, null);
});

test('non-enumerable promotion array indices refuse before touching any snapshots', async (t) => {
  const f = await decisionPromotionGateFixture(t);
  f.input.repoRoot = '/not-a-repository/promotion-admission-must-stop-here';
  Object.defineProperty(f.input.promotion.rows, '0', { enumerable: false });
  const result = await runPreparedDecisionPromotionGate(f.input);
  assert.equal(result.ok, false); assert.equal(result.assignment, null);
  assert.equal(result.inputDigest, null); assert.equal(result.capabilities.before, null);
  assert.equal(result.promotion.diagnostics[0].code, 'invalid-decision-promotion-input');
});
