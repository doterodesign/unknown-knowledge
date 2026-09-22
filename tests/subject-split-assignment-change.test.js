import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rows from '../payload/engine/lib/assignment-validation.js';
import * as governance from '../payload/engine/lib/subject-governance.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { subjectSplitCreationFixture } from './helpers/subject-split-creation-fixture.js';
import { promotionLimits } from './helpers/subject-promotion-fixture.js';

const split = (input, options) => rows.validateSubjectSplitAssignmentChange(input, options);
const assertOperation = (handle, options) => governance.assertSubjectGovernanceOperation(handle, options);
const delta = (after, before) => Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]]));
const onlySteps = (used, steps) => ({ ...Object.fromEntries(Object.keys(used).map(key => [key, 0])), validationSteps: steps });
const refused = (result, code) => {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.publicationReady, false);
  assert.ok(result.diagnostics.some(item => item.code === code), JSON.stringify(result.diagnostics));
};

// These literal row states test the row-local boundary; the actual core owns source and mapping proof.
function change(f, kind = 'knowledge', successors = [], handle) {
  const id = { knowledge: 'K-000001', ontology: 'O-000001', decision: 'D-000003' }[kind];
  const row = subjects => ({ ref: { namespace: f.ref.namespace, kind, id }, entry: {
    id, file: `${kind}/${id}.yaml`, record: { id, subjects,
      ...(kind === 'knowledge' ? { facets: { stage: 'verified' } } : { status: kind === 'ontology' ? 'active' : 'accepted' }) },
  } });
  return { before: row([f.operation.subject]), candidate: row([...successors]), governance: handle };
}

function evidence(f) {
  const model = f.input.candidateModel;
  return { registry: model.subjectRegistry, identity: model.identity, identityIndex: model.identityIndex,
    decisionCaptures: f.input.decisionCaptures,
    assessmentCaptures: [f.input.beforeCaptures, ...f.input.assessmentCaptures] };
}

function bound(f, limits = promotionLimits) {
  const operationBudget = createSubjectValidationBudget(limits);
  const evaluated = governance.evaluateSubjectGovernance(evidence(f), { operationBudget });
  assert.equal(evaluated.ok, true, JSON.stringify(evaluated.diagnostics));
  const binding = governance.validateSubjectGovernanceCapture(evaluated.governance,
    { model: f.input.candidateModel }, { operationBudget });
  assert.equal(binding.ok, true, JSON.stringify(binding.diagnostics));
  return { handle: evaluated.governance, operationBudget };
}

test('fixed split rows use actual model governance and one shared operation', async t => {
  const f = subjectSplitCreationFixture(t);

  await t.test('void assertion charges one step and does not traverse or copy documents', sub => {
    const { handle, operationBudget } = bound(f);
    const before = operationBudget.used;
    sub.mock.method(globalThis, 'structuredClone', () => { throw new Error('ownership assertion must not clone'); });
    assert.equal(assertOperation(handle, { operationBudget }), undefined);
    assert.deepEqual(delta(operationBudget.used, before), onlySteps(before, 1));
  });

  await t.test('direct assertion rejects missing and forged budgets without touching the real allowance', () => {
    const { handle, operationBudget } = bound(f);
    const before = operationBudget.used;
    for (const options of [undefined, {}, { operationBudget: undefined }, { operationBudget: {} },
      { operationBudget: { ...operationBudget } }]) {
      assert.throws(() => assertOperation(handle, options), { code: 'invalid-subject-validation-budget-handle' });
      assert.deepEqual(operationBudget.used, before);
    }
  });

  for (const kind of ['knowledge', 'ontology', 'decision']) for (const count of [0, 1, 2]) {
    await t.test(`${kind}: ${count} successor choices preserve the existing row result and redirect counts`, () => {
      const { handle, operationBudget } = bound(f);
      const input = change(f, kind, f.ids.slice(0, count), handle);
      const original = structuredClone({ before: input.before, candidate: input.candidate });
      const expected = rows.validateAssignmentChange(input, { purpose: 'new-assignment', budget: { redirects: 0 } });
      assert.equal(expected.ok, true, JSON.stringify(expected.diagnostics));
      const start = operationBudget.used;
      const outcomes = input.candidate.entry.record.subjects.map(id => governance.subjectEligibility(handle, id,
        { purpose: 'new-assignment', policy: 'current', budget: { redirects: 0 }, operationBudget }));
      const eligibilityWork = delta(operationBudget.used, start);
      const before = operationBudget.used;
      const result = split(input, { budget: { redirects: 0 }, operationBudget });
      assert.deepEqual(result, expected);
      assert.deepEqual(result.subjects.map(item => item.outcome), outcomes);
      assert.deepEqual(delta(operationBudget.used, before), { ...eligibilityWork, validationSteps: eligibilityWork.validationSteps + 1 });
      assert.deepEqual(result.used, { redirects: outcomes.reduce((sum, item) => sum + item.resolution.redirects.length, 0) });
      assert.deepEqual({ before: input.before, candidate: input.candidate }, original);
      assert.equal(result.scope, 'row-local-assignment-eligibility');
      assert.equal(result.publicationReady, false);
      assert.equal(Object.hasOwn(result, 'governance'), false);
    });
  }

  await t.test('the frozen model API candidate handle is accepted without reevaluation', () => {
    const operationBudget = createSubjectValidationBudget(promotionLimits);
    const { budget, ...input } = f.input;
    const created = governance.validateSubjectSplitCreation(input, { operationBudget });
    assert.equal(created.ok, true, JSON.stringify(created.diagnostics));
    const start = operationBudget.used;
    assert.equal(split(change(f, 'decision', [], created.governance), { budget: { redirects: 0 }, operationBudget }).ok, true);
    assert.deepEqual(delta(operationBudget.used, start), onlySteps(start, 1));
  });

  for (const targets of [[], [f.ids[0]]]) for (const kind of ['different', 'unbounded', 'missing', 'forged']) {
    await t.test(`${kind} governance refuses with ${targets.length} targets`, () => {
      const actual = bound(f);
      const evaluated = kind === 'unbounded' ? governance.evaluateSubjectGovernance(evidence(f)) : null;
      if (evaluated) assert.equal(evaluated.ok, true);
      const handle = kind === 'different' ? bound(f).handle : kind === 'unbounded' ? evaluated.governance
        : kind === 'missing' ? undefined : { ...actual.handle };
      const code = ['different', 'unbounded'].includes(kind) ? 'subject-operation-mismatch' : 'governance-unavailable';
      refused(split(change(f, 'knowledge', targets, handle), { budget: { redirects: 0 }, operationBudget: actual.operationBudget }), code);
      assert.throws(() => assertOperation(handle, { operationBudget: actual.operationBudget }), { code });
    });
  }

  await t.test('forged and exhausted allowances refuse before row getter work, even with no targets', () => {
    const { handle, operationBudget } = bound(f);
    operationBudget.charge('validationSteps', promotionLimits.maxValidationSteps - operationBudget.used.validationSteps, 'prior-owner-work');
    assert.throws(() => operationBudget.charge('validationSteps', 1, 'prior-owner-exhaustion'), { code: 'subject-validation-budget' });
    for (const allowance of [{}, operationBudget]) {
      let reads = 0;
      const input = change(f, 'knowledge', [], handle);
      Object.defineProperty(input.before.entry, 'file', { enumerable: true, get() { reads++; throw new Error('row getter executed'); } });
      const used = operationBudget.used; const failure = operationBudget.failure;
      refused(split(input, { budget: { redirects: 0 }, operationBudget: allowance }),
        allowance === operationBudget ? 'subject-validation-budget' : 'invalid-subject-validation-budget-handle');
      assert.equal(reads, 0);
      assert.deepEqual(operationBudget.used, used);
      assert.deepEqual(operationBudget.failure, failure);
    }
  });

  await t.test('exact one-step capacity admits an empty row; one-short fails sticky without document work', () => {
    const baseline = bound(f).operationBudget.used;
    const exact = bound(f, { ...promotionLimits, maxValidationSteps: baseline.validationSteps + 1,
      maxDocumentNodes: baseline.documentNodes, maxDocumentTextUnits: baseline.documentTextUnits });
    assert.equal(split(change(f, 'knowledge', [], exact.handle), { budget: { redirects: 0 }, operationBudget: exact.operationBudget }).ok, true);
    assert.equal(exact.operationBudget.used.validationSteps, baseline.validationSteps + 1);
    assert.equal(exact.operationBudget.used.documentNodes, baseline.documentNodes);
    assert.equal(exact.operationBudget.used.documentTextUnits, baseline.documentTextUnits);
    const short = bound(f, { ...promotionLimits, maxValidationSteps: baseline.validationSteps });
    const start = short.operationBudget.used;
    refused(split(change(f, 'knowledge', [], short.handle), { budget: { redirects: 0 }, operationBudget: short.operationBudget }), 'subject-validation-budget');
    assert.deepEqual(short.operationBudget.used, start);
    assert.equal(short.operationBudget.failure.phase, 'governance-operation-binding');
    assert.equal(short.operationBudget.failure.attempted, 1);
    const failure = short.operationBudget.failure;
    refused(split(change(f, 'knowledge', [], short.handle), { budget: { redirects: 0 }, operationBudget: short.operationBudget }), 'subject-validation-budget');
    assert.deepEqual(short.operationBudget.failure, failure);
    assert.deepEqual(short.operationBudget.used, start);
  });

  await t.test('positive eligibility can exhaust the same allowance after the ownership debit', () => {
    const baseline = bound(f).operationBudget.used;
    const actual = bound(f, { ...promotionLimits, maxValidationSteps: baseline.validationSteps + 1 });
    const result = split(change(f, 'ontology', [f.ids[0]], actual.handle), { budget: { redirects: 0 }, operationBudget: actual.operationBudget });
    refused(result, 'subject-validation-budget');
    assert.equal(actual.operationBudget.used.validationSteps, baseline.validationSteps + 1);
    assert.equal(actual.operationBudget.failure.phase, 'subject-eligibility');
    assert.deepEqual(result.used, { redirects: 0 });
  });

  await t.test('fixed current policy keeps native split-source refusal and redirect accounting', () => {
    const { handle, operationBudget } = bound(f);
    const input = change(f, 'ontology', [f.operation.subject], handle);
    input.before.entry.record.subjects = [];
    const direct = governance.subjectEligibility(handle, f.operation.subject,
      { purpose: 'new-assignment', policy: 'current', budget: { redirects: 0 }, operationBudget });
    const result = split(input, { budget: { redirects: 0 }, operationBudget });
    refused(result, direct.code);
    assert.deepEqual(result.subjects[0].outcome, direct);
    assert.deepEqual(result.used, { redirects: direct.resolution.redirects.length });
  });

  await t.test('new options are closed, require both allowances and never invoke accessors', () => {
    const { handle, operationBudget } = bound(f);
    const valid = { budget: { redirects: 0 }, operationBudget };
    for (const options of [undefined, null, {}, { budget: { redirects: 0 } }, { operationBudget },
      { ...valid, purpose: 'new-assignment' }, { ...valid, policy: 'current' },
      { ...valid, extra: true }, { ...valid, budget: null }, { ...valid, budget: {} },
      { ...valid, budget: { redirects: -1 } }, { ...valid, budget: { redirects: 1.5 } },
      { ...valid, budget: { redirects: Number.MAX_SAFE_INTEGER + 1 } },
      { ...valid, budget: { redirects: 0, extra: 1 } }]) {
      let reads = 0; const input = change(f, 'knowledge', [], handle);
      Object.defineProperty(input.before.entry, 'file', { enumerable: true, get() { reads++; throw new Error('invalid options reached row'); } });
      assert.equal(split(input, options).ok, false);
      assert.equal(reads, 0);
    }
    for (const field of ['budget', 'operationBudget']) {
      let reads = 0; const options = { ...valid };
      Object.defineProperty(options, field, { enumerable: true, get() { reads++; throw new Error('option getter executed'); } });
      assert.equal(split(change(f, 'knowledge', [], handle), options).ok, false);
      assert.equal(reads, 0);
    }
    let reads = 0; const budget = {};
    Object.defineProperty(budget, 'redirects', { enumerable: true, get() { reads++; throw new Error('redirect getter executed'); } });
    assert.equal(split(change(f, 'knowledge', [], handle), { budget, operationBudget }).ok, false);
    assert.equal(reads, 0);
    const hidden = { ...valid }; Object.defineProperty(hidden, 'budget', { enumerable: false });
    for (const options of [hidden, { ...valid, [Symbol('extra')]: true }, Object.assign(Object.create({}), valid)]) {
      assert.equal(split(change(f, 'knowledge', [], handle), options).ok, false);
    }
  });

  await t.test('legacy options, empty semantics, results and operation counters stay unchanged', () => {
    const { handle, operationBudget } = bound(f);
    const input = change(f, 'knowledge', [], undefined);
    const start = operationBudget.used;
    assert.equal(rows.validateAssignmentChange(input, { purpose: 'new-assignment' }).ok, true);
    refused(rows.validateAssignmentChange(input, { purpose: 'new-assignment', operationBudget }), 'invalid-options');
    const positive = change(f, 'knowledge', [f.ids[0]], handle);
    assert.equal(rows.validateAssignmentChange(positive, { purpose: 'new-assignment', budget: { redirects: 0 } }).ok, true);
    assert.deepEqual(operationBudget.used, start);
  });
});
