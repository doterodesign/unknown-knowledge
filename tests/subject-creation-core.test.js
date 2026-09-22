import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectCreationFixture } from './helpers/subject-creation-fixture.js';
import { inspectSubjectCreationCore } from '../payload/engine/lib/subject-creation-core.js';
import { validateSubjectOrdinaryCreation, subjectEligibility } from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { wire } from './helpers/subject-reconsideration-fixture.js';
// Dynamic absence is an actual missing-boundary RED, after separate native controls pass.
for (const [name, options] of [['activate', {}], ['promote', { action: 'promote-proposal' }], ['union', { union: true }]]) {
  test(`actual committed creation core: ${name}`, async t => {
    const f = subjectCreationFixture(t, options);
    const api = await import('../payload/engine/lib/subject-creation-core.js').catch(error => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; return {};
    });
    assert.equal(typeof api.inspectSubjectCreationCore, 'function', 'fixed actual-source creation core is required');
    const result = await api.inspectSubjectCreationCore(f.input());
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.publicationReady, false); assert.equal(result.assignments, null);
    assert.deepEqual(result.allocation.proof.ids, [f.operation.subject]);
  });
}

const modelInput = f => ({ ...f.modelInput(), budget: undefined });
function nativeInput(f) {
  const { budget, ...input } = modelInput(f);
  const { version, assignmentEvent, ...operation } = f.operation;
  return { ...input, materialCaptures: f.evidence.materialCaptures, operation, allocationLimits: f.limits.allocation };
}
const refuses = result => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.publicationReady, false); };

test('composed creation keeps one authentic sticky allowance and exact native allocation counters', t => {
  const f = subjectCreationFixture(t);
  const allowance = createSubjectValidationBudget(f.limits.governance);
  allowance.charge('validationSteps', 7, 'existing-owner-work');
  const result = validateSubjectOrdinaryCreation(nativeInput(f), { operationBudget: allowance });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); assert.deepEqual(result.used, allowance.used);
  assert.deepEqual(result.resources.allocation.used, { ledgerRows: f.beforeIdentity.allocations.length + f.candidateIdentity.allocations.length, subjects: 1 });
  assert.equal(subjectEligibility(result.governance, f.operation.subject, { purpose: 'new-assignment', operationBudget: allowance }).eligible, true);
  const counters = { captureBytes: 'maxCaptureBytes', documentNodes: 'maxDocumentNodes', documentTextUnits: 'maxDocumentTextUnits',
    subjects: 'maxSubjects', historyRows: 'maxHistoryRows', validationSteps: 'maxValidationSteps' };
  const baseline = validateSubjectOrdinaryCreation(nativeInput(f), { operationBudget: createSubjectValidationBudget(f.limits.governance) });
  const exact = Object.fromEntries(Object.entries(counters).map(([counter, limit]) => [limit, baseline.used[counter]]));
  assert.equal(validateSubjectOrdinaryCreation(nativeInput(f), { operationBudget: createSubjectValidationBudget(exact) }).ok, true);
  for (const [counter, limit] of Object.entries(counters)) {
    const short = createSubjectValidationBudget({ ...exact, [limit]: exact[limit] - 1 });
    refuses(validateSubjectOrdinaryCreation(nativeInput(f), { operationBudget: short }));
    const used = short.used, failure = short.failure;
    assert.ok(failure, counter); refuses(validateSubjectOrdinaryCreation(nativeInput(f), { operationBudget: short }));
    assert.deepEqual(short.used, used); assert.deepEqual(short.failure, failure);
  }
});

test('native allocation rejects occupied identity and extra ledger mutation', t => {
  const f = subjectCreationFixture(t, { union: true });
  for (const mutate of [
    input => { input.operation.subject = 'S-000001'; },
    input => { input.candidateModel = { ...input.candidateModel, identity: { ...f.candidateIdentity,
      allocations: f.candidateIdentity.allocations.slice(1) } }; },
  ]) {
    const input = nativeInput(f); input.operation = structuredClone(input.operation); mutate(input);
    refuses(validateSubjectOrdinaryCreation(input, { operationBudget: createSubjectValidationBudget(f.limits.governance) }));
  }
});

test('ordinary promotion refuses a captured suppressed proposal without rewriting it', async t => {
  const f = subjectCreationFixture(t, { action: 'promote-proposal' });
  // Use actual retained refusal bytes from the fixture's first source, not a manufactured approval.
  const { subjectReconsiderationCoreFixture } = await import('./helpers/subject-reconsideration-core-fixture.js');
  const refusedFixture = subjectReconsiderationCoreFixture(t);
  const input = nativeInput(f);
  input.beforeModel = refusedFixture.beforeModel; input.beforeCaptures = refusedFixture.beforeCaptures;
  refuses(validateSubjectOrdinaryCreation(input, { operationBudget: createSubjectValidationBudget(f.limits.governance) }));
});

test('actual core refuses missing original pair, false source membership and unrelated changed files', async t => {
  const f = subjectCreationFixture(t);
  const noPair = { ...f.evidence, assessmentCaptures: [] };
  refuses(await inspectSubjectCreationCore(f.input({ evidence: noPair })));
  const captures = f.evidence.decisionCaptures.map(row => ({ ...row, capture: { ...row.capture,
    source: { commit: 'a'.repeat(row.capture.blob.length), tree: 'b'.repeat(row.capture.blob.length) } } }));
  refuses(await inspectSubjectCreationCore(f.input({ evidence: { ...f.evidence, decisionCaptures: captures } })));
  f.put('unexpected.txt', 'Unrelated candidate write'); const candidate = f.commit('unrelated file change');
  refuses(await inspectSubjectCreationCore(f.input({ candidate })));
});

test('actual creation rejects changed originals in a union and preserves original IDs on refusal', async t => {
  const f = subjectCreationFixture(t, { union: true });
  const original = structuredClone(f.beforeDocument.subjects);
  f.candidateDocument.subjects[0].definition.text = 'Silently broaden an old identity';
  f.put('subjects/registry.yaml', wire(f.candidateDocument)); const candidate = f.commit('invalid union rewriting original');
  refuses(await inspectSubjectCreationCore(f.input({ candidate })));
  assert.deepEqual(f.beforeDocument.subjects, original);
});

test('actual nested SHA256 core preserves source-bound original evidence', async t => {
  const f = subjectCreationFixture(t, { objectFormat: 'sha256', nested: true });
  const result = await inspectSubjectCreationCore(f.input());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.registry.before.capture, f.beforeCaptures.registry.capture);
  assert.equal(result.registry.before.capture.blob.length, 64);
});
