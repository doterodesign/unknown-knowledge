import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIntentQueryPlan } from '../payload/engine/lib/intent-query-plan.js';
import { subjectQueryFixture, subjectQuery } from './helpers/subject-query-fixture.js';

function plan(count = 2) {
  return { version: 1, inputRef: 'request:bounded', inventoryStatus: 'declared-complete',
    units: [{ key: 'request', sourceRef: 'request:bounded', disposition: 'mapped' }],
    bindings: [], clarifications: [],
    requirements: [{ key: 'source', unitKeys: ['request'], description: 'Inspect source evidence.' }],
    branches: Array.from({ length: count }, (_, i) => ({ key: `branch-${i}`, kind: i ? 'alternative' : 'strict',
      unitKeys: ['request'], assumptions: i ? ['Explicit alternative interpretation.'] : [], relaxes: [],
      query: subjectQuery({ op: 'all' }) })),
    constraints: Array.from({ length: count }, (_, i) => ({ key: `constraint-${i}`, origin: 'inferred',
      unitKeys: ['request'], bindingKeys: [], requirementKeys: ['source'],
      queryRefs: ['/where', '/stores', '/view'].map(path => ({ branch: `branch-${i}`, path })) })),
  };
}
const admission = (overrides = {}) => ({ admission: { version: 1, maxBranches: 2,
  maxReservedAstNodes: 64, maxReservedRedirects: 16, ...overrides } });

test('denied whole-plan admission performs no query calls and preserves every unvalidated branch', () => {
  let calls = 0;
  const context = { get model() { calls += 1; throw new Error('must not query'); } };
  for (const limits of [{ maxBranches: 1 }, { maxReservedAstNodes: 63 }, { maxReservedRedirects: 15 }]) {
    const result = validateIntentQueryPlan(plan(), context, admission(limits));
    assert.equal(result.valid, false);
    assert.equal(result.queryValidation, 'not-run');
    assert.equal(result.handoff, null);
    assert.equal(result.admission.status, 'denied');
    assert.equal(result.work.queryValidationCalls, 0);
    assert.deepEqual(result.work.branches.map(b => [b.key, b.status]),
      [['branch-0', 'not-run'], ['branch-1', 'not-run']]);
    assert.deepEqual(result.work.observed, { astNodes: 0, astDepth: 0, redirects: 0 });
  }
  assert.equal(calls, 0);
});

test('admitted duplicate queries reserve both allowances and preserve authored budgets and order', () => {
  const p = plan(); const before = structuredClone(p);
  const options = admission();
  const result = validateIntentQueryPlan(p, subjectQueryFixture(), options);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.equal(result.admission.status, 'admitted');
  assert.deepEqual(result.admission.reserved, { astNodes: 64, redirects: 16 });
  assert.equal(result.work.declaredBranches, 2);
  assert.equal(result.work.queryValidationCalls, 2);
  assert.equal(result.work.queryValidationReturns, 2);
  assert.deepEqual(result.work.branches.map(b => b.key), ['branch-0', 'branch-1']);
  assert.deepEqual(result.work.observed, { astNodes: 2, astDepth: 1, redirects: 0 });
  assert.deepEqual(result.work.knownObserved, result.work.observed);
  assert.deepEqual(result.branches.map(b => b.validation.query.budgets), before.branches.map(b => b.query.budgets));
  assert.deepEqual(result.branches.map(b => b.validation.input.options.budgets), before.branches.map(b => b.query.budgets));
  result.admission.limits.maxBranches = 10;
  assert.equal(options.admission.maxBranches, 2);
  assert.deepEqual(p, before);
});

test('invalid policies and missing branch reservation values refuse without query work', () => {
  const context = { get model() { throw new Error('must not query'); } };
  for (const options of [null, { unknown: true }, { admission: null }, admission({ version: 2 }),
    admission({ maxBranches: -1 }), admission({ maxReservedAstNodes: Infinity }),
    admission({ maxReservedRedirects: 0.5 }), admission({ maxBranches: Number.MAX_SAFE_INTEGER + 1 }),
    admission({ extra: 1 })]) {
    const result = validateIntentQueryPlan(plan(), context, options);
    assert.equal(result.admission.status, 'invalid');
    assert.equal(result.work.queryValidationCalls, 0);
    assert.equal(result.handoff, null);
  }
  for (const field of ['maxAstNodes', 'maxRedirects']) {
    const p = plan(); delete p.branches[1].query.budgets[field];
    const result = validateIntentQueryPlan(p, context, admission());
    assert.equal(result.admission.status, 'invalid');
    assert.ok(result.diagnostics.some(d => d.code === 'invalid-branch-reservation'));
  }
});

test('safe integer overflow is refused without rounded reservation totals or query calls', () => {
  const p = plan();
  p.branches.forEach(b => { b.query.budgets.maxAstNodes = Number.MAX_SAFE_INTEGER; });
  const result = validateIntentQueryPlan(p, { get model() { throw new Error('must not query'); } },
    admission({ maxReservedAstNodes: Number.MAX_SAFE_INTEGER }));
  assert.equal(result.admission.status, 'denied');
  assert.equal(result.admission.reserved.astNodes, null);
  assert.ok(result.diagnostics.some(d => d.code === 'plan-reservation-overflow'));
  assert.equal(result.work.queryValidationCalls, 0);
  assert.deepEqual(result.admission.allocations.map(a => a.astNodes), [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
});

test('hard query failure never refunds reservations or disguises missing observations as zero', () => {
  const p = plan(); p.branches[0].query.applicability = { jurisdictions: ['x'] };
  const result = validateIntentQueryPlan(p, subjectQueryFixture(), admission());
  assert.equal(result.admission.status, 'admitted');
  assert.deepEqual(result.admission.reserved, { astNodes: 64, redirects: 16 });
  assert.equal(result.queryValidation, 'failed');
  assert.equal(result.readiness, 'invalid');
  assert.equal(result.handoff, null);
  assert.equal(result.work.queryValidationCalls, 2);
  assert.deepEqual(result.work.branches.map(b => b.status), ['refused', 'validated']);
  assert.deepEqual(result.work.branches[0].observed, { astNodes: null, astDepth: null, redirects: null });
  assert.deepEqual(result.work.observed, { astNodes: null, astDepth: null, redirects: null });
  assert.deepEqual(result.work.knownObserved, { astNodes: 1, astDepth: 1, redirects: 0 });
  assert.ok(result.diagnostics.some(d => d.code === 'unsupported-applicability'));
});

test('partial owner counters survive AST refusal without inventing unreported redirect work', () => {
  const p = plan(1);
  p.branches[0].query.where = { op: 'not', arg: { op: 'all' } };
  p.branches[0].query.budgets.maxAstNodes = 1;
  const result = validateIntentQueryPlan(p, subjectQueryFixture(), admission());
  assert.equal(result.queryValidation, 'failed');
  assert.equal(result.work.branches[0].status, 'refused');
  assert.equal(result.work.observed.astNodes, result.branches[0].validation.used.astNodes);
  assert.equal(result.work.observed.redirects, null);
  assert.equal(result.admission.reserved.astNodes, 1);
});

test('unrequested admission is explicit and zero-branch evidence plans need no query allowance', () => {
  const unbounded = validateIntentQueryPlan(plan(1), subjectQueryFixture());
  assert.equal(unbounded.admission.status, 'not-requested');
  assert.equal(unbounded.admission.reserved, null);
  assert.equal(unbounded.work.queryValidationCalls, 1);
  const result = validateIntentQueryPlan(plan(0), {}, admission({
    maxBranches: 0, maxReservedAstNodes: 0, maxReservedRedirects: 0 }));
  assert.equal(result.valid, true);
  assert.equal(result.readiness, 'unresolved-intent');
  assert.equal(result.admission.status, 'admitted');
  assert.deepEqual(result.admission.reserved, { astNodes: 0, redirects: 0 });
  assert.equal(result.work.queryValidationCalls, 0);
});
