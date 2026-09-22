import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as governance from '../payload/engine/lib/subject-governance.js';
import { subjectSplitCreationFixture } from './helpers/subject-split-creation-fixture.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { promotionLimits } from './helpers/subject-promotion-fixture.js';

const create = (input, options) => governance.validateSubjectSplitCreation(input, options);
const refused = (result, code) => {
  assert.equal(result.ok, false); assert.equal(result.governance, null); assert.equal(result.publicationReady, false);
  if (code) assert.ok(result.diagnostics.some(row => row.code === code), JSON.stringify(result.diagnostics));
};
const composed = input => { const { budget, ...rest } = input; return rest; };

for (const objectFormat of ['sha1', 'sha256']) test(`actual ${objectFormat} two-event model creation composes exact allocation and governance`, t => {
  const f = subjectSplitCreationFixture(t, { objectFormat, nested: objectFormat === 'sha256' });
  assert.equal(f.input.candidateModel.ok, true, JSON.stringify(f.input.candidateModel.diagnostics));
  const result = create(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.publicationReady, false);
  assert.deepEqual(result.allocation.ids, f.operation.successors);
  assert.deepEqual(Object.keys(result).sort(), ['ok', 'governance', 'publicationReady', 'diagnostics', 'used', 'allocation', 'assessment', 'resources'].sort());
  assert.deepEqual(result.allocation.publication, { id: f.operation.id, review: f.activation.review.reference });
  assert.equal(result.allocation.beforeIdentityDigest, canonicalSha256(f.input.beforeModel.identity));
  assert.equal(result.allocation.candidateIdentityDigest, canonicalSha256(f.input.candidateModel.identity));
  assert.deepEqual(result.resources.allocation.used, {
    ledgerRows: f.input.beforeModel.identity.allocations.length + f.input.candidateModel.identity.allocations.length,
    successors: f.ids.length });
  assert.equal(result.assessment.semanticCompleteness, 'asserted-in-reviewed-evidence');
});

test('existing ordinary and single-activation APIs refuse the actual two-event candidate', t => {
  const f = subjectSplitCreationFixture(t);
  const ordinary = governance.validateSubjectTransition({ before: f.input.beforeModel.subjectRegistry.document,
    candidate: f.input.candidateModel.subjectRegistry.document, model: f.input.candidateModel,
    identityIndex: f.input.candidateModel.identityIndex, decisionCaptures: f.input.decisionCaptures,
    assessmentCaptures: [f.input.beforeCaptures] });
  assert.equal(ordinary.ok, false); assert.equal(ordinary.diagnostics[0].code, 'unsupported-action');
  const activation = governance.validateSubjectActivation(f.input);
  assert.equal(activation.ok, false); assert.equal(activation.diagnostics[0].code, 'invalid-promotion');
});

test('unchanged addressed authorizer and valid fresh/old-descendant parents are accepted', t => {
  const f = subjectSplitCreationFixture(t, { reviewStatus: 'addressed', parents: ['S-000002', 'S-000004'] });
  const result = create(f.input); assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(f.input.candidateModel.subjectRegistry.hierarchyRevision, f.input.beforeModel.subjectRegistry.hierarchyRevision + 1);
});

for (const [name, options] of [
  ['allocated but unloaded before', { unloadedBefore: true }],
  ['proposed before', { beforeStatus: 'proposed' }],
  ['archived before', { beforeStatus: 'archived' }],
  ['accepted to addressed drift', { candidateStatus: 'addressed' }],
  ['changed full before record', { beforeDecisionChange: record => { record.context = 'Different original reasoning'; } }],
]) test(`both-model authorizer check refuses ${name}`, t => {
  const f = subjectSplitCreationFixture(t, options);
  assert.equal(f.input.beforeModel.ok, true); assert.equal(f.input.candidateModel.ok, true);
  const result = create(f.input); refused(result);
  assert.ok(result.diagnostics.some(row => ['ineffective-authorizer', 'authorizer-capture-mismatch'].includes(row.code)), JSON.stringify(result.diagnostics));
  assert.ok(result.allocation, 'later authorizer failure retains the independently completed allocation observation');
});

for (const side of ['beforeModel', 'candidateModel']) test(`${side} public Decision must match its own authentic index`, t => {
  const f = subjectSplitCreationFixture(t);
  f.input[side].decisions.get(f.ref.id).record.context = 'Public mutation after index capture';
  const result = create(f.input); refused(result, 'authorizer-capture-mismatch'); assert.ok(result.allocation);
});

test('missing old source evidence refuses even with intact new review Decision evidence', t => {
  const f = subjectSplitCreationFixture(t); f.input.decisionCaptures = [f.reviewCapture];
  const result = create(f.input); refused(result, 'governance-unavailable'); assert.ok(result.allocation);
});

for (const [name, mutate, code] of [
  ['before pair duplicated in historical evidence', f => { f.input.assessmentCaptures = [f.input.beforeCaptures]; }, 'invalid-refusal-assessment'],
  ['missing before pair', f => { f.input.beforeCaptures = undefined; }, 'invalid-split-creation-input'],
  ['corrupt before bytes', f => { f.input.beforeCaptures = { ...f.input.beforeCaptures,
    registry: { ...f.input.beforeCaptures.registry, bytes: Buffer.from('corrupt') } }; }, 'invalid-evidence'],
  ['duplicate Decision evidence', f => { f.input.decisionCaptures.push(f.reviewCapture); }, 'ambiguous-evidence'],
  ['missing selected Decision evidence', f => { f.input.decisionCaptures = f.input.decisionCaptures.slice(0, 1); }, 'governance-unavailable'],
  ['mismatched assessment source locator', f => { f.activation.refusalAssessment.scope.beforeRegistry.capture = {
    ...f.activation.refusalAssessment.scope.beforeRegistry.capture, source: { ...f.beforeCaptures.registry.capture.source, tree: 'a'.repeat(40) } }; f.reload(); }, 'assessment-evidence-unavailable'],
]) test(`split creation refuses ${name}`, t => {
  const f = subjectSplitCreationFixture(t); mutate(f); const result = create(f.input);
  refused(result, code); assert.ok(result.allocation);
});

test('a valid retained before ledger cannot replace the actual model ledger', t => {
  const f = subjectSplitCreationFixture(t);
  const wrong = structuredClone(f.input.beforeModel.identity); wrong.allocations.at(-1).publication.review = 'review:different-before';
  f.put('_identity.yaml', wrong); f.put('subjects/registry.yaml', f.beforeCaptures.registry.bytes);
  const changed = f.commit('different captured before ledger');
  const pair = { registry: f.capture(changed, 'subjects/registry.yaml'), identity: f.capture(changed, '_identity.yaml') };
  f.input.beforeCaptures = pair;
  f.activation.refusalAssessment.scope = { beforeRegistry: { capture: pair.registry.capture,
    documentDigest: canonicalSha256(f.input.beforeModel.subjectRegistry.document) }, identityDigest: canonicalSha256(wrong) };
  f.reload(); const result = create(f.input); refused(result, 'input-mismatch'); assert.ok(result.allocation);
});

for (const [name, mutate] of [
  ['successor permutation', f => { f.operation.successors.reverse(); }],
  ['event permutation', f => { f.operation.registryEvents.reverse(); }],
  ['duplicate event IDs', f => { f.operation.registryEvents[1].id = f.operation.registryEvents[0].id; }],
  ['wrong event digest', f => { f.operation.registryEvents[0].changeDigest = 'a'.repeat(64); }],
  ['wrong source', f => { f.operation.subject = 'S-000002'; }],
  ['different operation publication', f => { f.operation.id = 'c1000000-0000-4000-8000-000000000001'; }],
  ['operator review substituted', f => { for (const event of [f.activation, f.split]) event.review.reference = 'operator:approval'; f.reload(); }],
  ['changed common tuple', f => { f.split.review.reference = 'review:other'; f.reload(); }],
  ['rewritten prior history', f => { f.document.history[0].reason = 'Different prior event'; f.reload(); }],
]) test(`model split binding refuses ${name}`, t => {
  const f = subjectSplitCreationFixture(t); mutate(f); refused(create(f.input));
});

test('actual candidate revision changes are checked independently of history grammar', t => {
  const f = subjectSplitCreationFixture(t);
  f.input.candidateModel = { ...f.input.candidateModel, subjectRegistry: { ...f.input.candidateModel.subjectRegistry,
    document: { ...f.input.candidateModel.subjectRegistry.document, revision: 99 } } };
  const result = create(f.input); refused(result, 'invalid-revision'); assert.ok(result.allocation);
});

test('wrong authentic index and forged indexes cannot bind actual model identities', t => {
  const f = subjectSplitCreationFixture(t);
  for (const identityIndex of [f.input.candidateModel.identityIndex, {}]) {
    const result = create({ ...f.input, beforeModel: { ...f.input.beforeModel, identityIndex } });
    refused(result); assert.ok(result.allocation);
  }
});

test('dual allowance rejects both/neither/forged and returned governance belongs to the shared operation', t => {
  const f = subjectSplitCreationFixture(t); const allowance = createSubjectValidationBudget(promotionLimits);
  refused(create(f.input, { operationBudget: allowance }), 'invalid-split-creation-input');
  refused(create(composed(f.input)), 'invalid-split-creation-input');
  refused(create(composed(f.input), { operationBudget: {} }), 'invalid-subject-validation-budget-handle');
  allowance.charge('validationSteps', 7, 'existing-owner-work');
  const result = create(composed(f.input), { operationBudget: allowance });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); assert.deepEqual(result.used, allowance.used);
  for (const id of f.ids) assert.equal(governance.subjectEligibility(result.governance, id, {
    purpose: 'new-assignment', policy: 'current', operationBudget: allowance }).eligible, true);
  assert.equal(governance.validateSubjectGovernanceCapture(result.governance, { model: f.input.candidateModel }, { operationBudget: allowance }).ok, true);
  assert.throws(() => governance.subjectEligibility(result.governance, f.ids[0], {
    purpose: 'query', operationBudget: createSubjectValidationBudget(promotionLimits) }), { code: 'subject-operation-mismatch' });
});

test('allocation admits both populations atomically and does not touch nested getters on refusal', t => {
  const f = subjectSplitCreationFixture(t); let reads = 0;
  const identity = structuredClone(f.input.candidateModel.identity);
  Object.defineProperty(identity.allocations[0].publication, 'review', { enumerable: true, get() { reads++; throw new Error('getter executed'); } });
  for (const allocationLimits of [{ ...f.input.allocationLimits, maxLedgerRows: 0 }, { ...f.input.allocationLimits, maxSuccessors: 0 }]) {
    const result = create({ ...f.input, candidateModel: { ...f.input.candidateModel, identity }, allocationLimits });
    refused(result, 'split-allocation-budget'); assert.equal(result.allocation, null);
    assert.deepEqual(result.resources.allocation.used, { ledgerRows: 0, successors: 0 });
  }
  const ledger = { ...f.input.beforeModel.identity };
  Object.defineProperty(ledger, 'allocations', { enumerable: true, get() { reads++; throw new Error('getter executed'); } });
  refused(create({ ...f.input, beforeModel: { ...f.input.beforeModel, identity: ledger } }), 'invalid-split-allocation-input');
  assert.equal(reads, 0);
});

test('exact-fit and one-short cumulative governance allowances retain partial proof without success', t => {
  const f = subjectSplitCreationFixture(t); const baseline = create(f.input); assert.equal(baseline.ok, true);
  const counters = { captureBytes: 'maxCaptureBytes', documentNodes: 'maxDocumentNodes', documentTextUnits: 'maxDocumentTextUnits',
    subjects: 'maxSubjects', historyRows: 'maxHistoryRows', validationSteps: 'maxValidationSteps' };
  const exact = Object.fromEntries(Object.entries(counters).map(([counter, limit]) => [limit, baseline.used[counter]]));
  assert.equal(create({ ...f.input, budget: exact }).ok, true);
  for (const [counter, limit] of Object.entries(counters)) {
    const allowance = createSubjectValidationBudget({ ...exact, [limit]: exact[limit] - 1 });
    const result = create(composed(f.input), { operationBudget: allowance }); refused(result, 'subject-validation-budget');
    const used = allowance.used; const failure = allowance.failure;
    if (counter === 'documentNodes') {
      assert.equal(failure.phase, 'binding-model-authorizer');
      assert.ok(result.allocation, 'late actual candidate binding failure retains allocation but no governance handle');
    }
    const again = create(composed(f.input), { operationBudget: allowance }); refused(again, 'subject-validation-budget');
    assert.deepEqual(allowance.used, used, counter); assert.deepEqual(allowance.failure, failure, counter);
    assert.equal(again.allocation, null);
  }
});

test('closed model input refuses malformed event/evidence shapes without TypeErrors or getters', t => {
  const f = subjectSplitCreationFixture(t);
  for (const registryEvents of [[null, null], [f.operation.registryEvents[0], null]]) {
    refused(create({ ...f.input, operation: { ...f.operation, registryEvents } }));
  }
  refused(create({ ...f.input, assessmentCaptures: null }));
  refused(create({ ...f.input, operatorReference: 'not-a-selected-registry-review' }));
  let reads = 0; const input = { ...f.input };
  Object.defineProperty(input, 'beforeCaptures', { enumerable: true, get() { reads++; throw new Error('getter executed'); } });
  refused(create(input)); assert.equal(reads, 0);
});

for (const [name, mutate] of [
  ['null event rows', f => { f.operation.registryEvents = [null, null]; }],
  ['explicit null historical evidence', f => { f.input.assessmentCaptures = null; }],
  ['null before Subject row', f => { const model = f.input.beforeModel; f.input.beforeModel = { ...model,
    subjectRegistry: { ...model.subjectRegistry, document: { ...model.subjectRegistry.document,
      subjects: [null, ...model.subjectRegistry.document.subjects.slice(1)] } } }; }],
  ['null activation Decision ref', f => { const model = f.input.candidateModel; const document = structuredClone(model.subjectRegistry.document);
    const event = document.history.at(-2); event.decision = null;
    const { review, ...body } = event; review.changeDigest = canonicalSha256(body);
    f.operation.registryEvents[0].changeDigest = review.changeDigest;
    f.input.candidateModel = { ...model, subjectRegistry: { ...model.subjectRegistry, document } }; }],
]) test(`admission review: ${name} is a typed refusal`, t => {
  const f = subjectSplitCreationFixture(t); mutate(f); refused(create(f.input));
});

for (const side of ['beforeModel', 'candidateModel']) for (const field of ['id', 'identity']) {
  test(`admission review: ${side} optional ${field} getter is never invoked`, t => {
    const f = subjectSplitCreationFixture(t); let reads = 0;
    Object.defineProperty(f.input[side].decisions.get(f.ref.id), field, { enumerable: true, get() { reads++; return f.ref.id; } });
    refused(create(f.input)); assert.equal(reads, 0);
  });
}

for (const side of ['beforeModel', 'candidateModel']) {
  for (const field of ['record', 'id', 'identity']) test(`historical shell: ${side} D1 ${field} getter is never invoked`, t => {
    const f = subjectSplitCreationFixture(t); let reads = 0;
    const entry = f.input[side].decisions.get('D-000001'); const value = entry[field];
    Object.defineProperty(entry, field, { enumerable: true, get() { reads++; return value; } });
    const result = create(f.input); assert.equal(reads, 0); refused(result); assert.ok(result.allocation);
  });
  test(`historical shell: ${side} own Map.get getter is never invoked`, t => {
    const f = subjectSplitCreationFixture(t); let reads = 0;
    Object.defineProperty(f.input[side].decisions, 'get', { get() { reads++; return Map.prototype.get; } });
    const result = create(f.input); assert.equal(reads, 0); refused(result); assert.ok(result.allocation);
  });
  test(`historical shell: ${side} Map subclass is refused`, t => {
    const f = subjectSplitCreationFixture(t);
    class DecisionMap extends Map {}
    f.input[side] = { ...f.input[side], decisions: new DecisionMap(f.input[side].decisions) };
    refused(create(f.input), 'input-mismatch');
  });
  test(`historical shell: ${side} unrelated map entry is not visited`, t => {
    const f = subjectSplitCreationFixture(t); let reads = 0;
    const entry = {};
    for (const field of ['record', 'id', 'identity']) Object.defineProperty(entry, field, {
      enumerable: true, get() { reads++; throw new Error('unrelated getter executed'); } });
    f.input[side].decisions.set('D-999999', entry);
    const result = create(f.input); assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); assert.equal(reads, 0);
  });
  test(`historical shell: ${side} null registry document is a typed refusal`, t => {
    const f = subjectSplitCreationFixture(t); const model = f.input[side];
    f.input[side] = { ...model, subjectRegistry: { ...model.subjectRegistry, document: null } };
    refused(create(f.input), 'input-mismatch');
  });
}

test('historical shell: archived actual D1 preserves historical authority while selected D2 stays accepted', t => {
  const f = subjectSplitCreationFixture(t);
  const file = 'decisions/entries/approval.yaml'; const document = JSON.parse(f.read(file));
  document.entries[0].status = 'archived'; f.put(file, document); f.reload();
  assert.equal(f.input.candidateModel.ok, true, JSON.stringify(f.input.candidateModel.diagnostics));
  const result = create(f.input); assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

for (const kind of ['knowledge', 'ontology']) test(`unrelated store: split does not read candidate ${kind} presence`, t => {
  const f = subjectSplitCreationFixture(t); let reads = 0;
  Object.defineProperty(f.input.candidateModel.stores, kind, { enumerable: true,
    get() { reads++; throw new Error('unrelated store getter executed'); } });
  const result = create(f.input); assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); assert.equal(reads, 0);
});

const deepJson = depth => {
  let value = null;
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
};

for (const [name, target, partial] of [
  ['retained history', document => document.history[0], false],
  ['new activation', document => document.history.at(-2), true],
  ['current Subject state', document => document.subjects[0], true],
]) test(`native depth: ${name} returns a typed capture refusal`, t => {
  const f = subjectSplitCreationFixture(t); const model = f.input.candidateModel;
  const document = structuredClone(model.subjectRegistry.document); target(document).extra = deepJson(10000);
  const allowance = createSubjectValidationBudget(promotionLimits);
  const result = create({ ...composed(f.input), candidateModel: { ...model,
    subjectRegistry: { ...model.subjectRegistry, document } } }, { operationBudget: allowance });
  refused(result, 'invalid-captured-input'); assert.equal(Boolean(result.allocation), partial);
  assert.deepEqual(result.used, allowance.used); assert.ok(result.used.documentNodes >= 10000);
});

for (const side of ['beforeModel', 'candidateModel']) for (const id of ['D-000001', 'D-000002']) {
  test(`native depth: ${side} ${id} public record returns a typed capture refusal`, t => {
    const f = subjectSplitCreationFixture(t); f.input[side].decisions.get(id).record.extra = deepJson(10000);
    const result = create(f.input); refused(result, 'invalid-captured-input'); assert.ok(result.allocation);
  });
  test(`native depth: ${side} ${id} record RangeError getter is not invoked`, t => {
    const f = subjectSplitCreationFixture(t); let reads = 0;
    Object.defineProperty(f.input[side].decisions.get(id).record, 'extra', { enumerable: true,
      get() { reads++; throw new RangeError('unexpected property failure'); } });
    const result = create(f.input); refused(result); assert.equal(reads, 0);
    assert.ok(result.diagnostics.every(row => row.code !== 'invalid-captured-input'));
  });
}

test('native depth: clone succeeds but activation canonicalization still refuses', t => {
  const f = subjectSplitCreationFixture(t); const model = f.input.candidateModel;
  const document = structuredClone(model.subjectRegistry.document);
  let extra = null; for (let index = 0; index < 2800; index += 1) extra = [extra];
  document.history.at(-2).extra = extra;
  assert.equal(indexSubjects(document).ok, true, 'actual native registry capture succeeds');
  const { review, ...body } = document.history.at(-2);
  assert.throws(() => canonicalSha256(body), RangeError, 'unchanged native canonical serializer overflows');
  const result = create({ ...f.input, candidateModel: { ...model, subjectRegistry: { ...model.subjectRegistry, document } } });
  refused(result, 'invalid-captured-input'); assert.ok(result.allocation);
});

test('native depth: public evaluation and binding cannot select private split capture adaptation', t => {
  const f = subjectSplitCreationFixture(t); const document = structuredClone(f.input.candidateModel.subjectRegistry.document);
  document.history.at(-2).extra = deepJson(10000);
  assert.throws(() => governance.evaluateSubjectGovernance({ registry: { ...f.input.candidateModel.subjectRegistry, document },
    identity: f.input.candidateModel.identity, identityIndex: f.input.candidateModel.identityIndex },
  { operationBudget: createSubjectValidationBudget(promotionLimits), splitCreation: true }), RangeError);
  const unexpected = new RangeError('caller property failure');
  assert.throws(() => canonicalSha256({ get value() { throw unexpected; } }), error => error === unexpected);
  const allowance = createSubjectValidationBudget(promotionLimits);
  const result = create(composed(f.input), { operationBudget: allowance }); assert.equal(result.ok, true);
  f.input.candidateModel.decisions.get('D-000001').record.extra = deepJson(10000);
  assert.throws(() => governance.validateSubjectGovernanceCapture(result.governance, { model: f.input.candidateModel },
    { operationBudget: allowance, splitCreation: true }), RangeError);
});

test('native near-exhaustion forwards real counts before model index coherence without a mock planner', t => {
  const f = subjectSplitCreationFixture(t, { count: 2 });
  // Rejection-only public model mutation: authentic indexes must not be reached
  // after the real allocator refuses this native-valid occupied population.
  const occupied = 999998;
  const publication = { id: 'd1000000-0000-4000-8000-000000000001', review: 'review:occupied' };
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace: f.ref.namespace,
    allocations: Array.from({ length: occupied }, (_, index) => ({ id: `S-${String(index + 1).padStart(6, '0')}`,
      kind: 'subject', state: 'allocated', publication })) };
  const result = create({ ...f.input, beforeModel: { ...f.input.beforeModel, identity }, candidateModel: { ...f.input.candidateModel, identity },
    allocationLimits: { maxLedgerRows: occupied * 2, maxSuccessors: 2 },
    budget: { ...promotionLimits, maxDocumentNodes: 50000000, maxDocumentTextUnits: 1000000000 } });
  refused(result, 'id-space-exhausted'); assert.equal(result.allocation, null);
  const diagnostic = result.diagnostics.find(row => row.code === 'id-space-exhausted');
  assert.equal(diagnostic.occupied, occupied); assert.equal(diagnostic.remaining, 1);
  assert.deepEqual(result.resources.allocation.used, { ledgerRows: occupied * 2, successors: 2 });
  assert.equal(result.resources.allocation.failure, null);
});
