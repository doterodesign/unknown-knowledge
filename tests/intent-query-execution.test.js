import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as plans from '../payload/engine/lib/intent-query-plan.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQueryFixture, subjectQuery } from './helpers/subject-query-fixture.js';

const policies = () => ({
  admission: { version: 1, maxBranches: 10, maxReservedAstNodes: 320, maxReservedRedirects: 80 },
  executionAdmission: { version: 1, maxBranches: 10, maxReservedAstNodes: 320, maxAstDepth: 8,
    maxReservedRedirects: 80, maxReservedHierarchyNodes: 640, maxReservedHierarchyEdges: 640,
    maxReservedRecords: 1000, maxReservedPredicateSteps: 10000,
    maxReservedExplanationNodes: 100000, maxReservedResultSlots: 100 },
});

function plan(count = 1) {
  const branches = Array.from({ length: count }, (_, i) => ({ key: `branch-${i}`, unitKeys: ['meaning'],
    kind: i ? 'alternative' : 'strict', query: subjectQuery(),
    assumptions: i ? ['Another declared interpretation.'] : [], relaxes: [] }));
  return { version: 1, inputRef: 'request:meaning', inventoryStatus: 'declared-complete',
    units: [{ key: 'meaning', sourceRef: 'request:meaning', disposition: 'mapped' }], bindings: [],
    requirements: [{ key: 'source', unitKeys: ['meaning'], description: 'Read original source support.' }],
    constraints: branches.flatMap(b => ['/where', '/stores', '/view'].map((path, i) => ({
      key: `${b.key}-${i}`, unitKeys: ['meaning'], origin: 'explicit', bindingKeys: [],
      queryRefs: [{ branch: b.key, path }], requirementKeys: ['source'],
    }))), branches, clarifications: [] };
}

test('executes actual queries separately after whole-plan validation, retaining original intent', () => {
  const input = plan(3); const context = subjectQueryFixture(); const before = structuredClone(input);
  Object.assign(input.branches[2], { kind: 'recovery', baseBranch: 'branch-0', relaxes: ['branch-0-0'] });
  Object.assign(before.branches[2], input.branches[2]);
  const result = plans.executeIntentQueryPlan(input, context, policies());
  assert.equal(result.status, 'complete');
  assert.equal(result.execution, 'complete');
  assert.equal(result.validation.work.queryValidationCalls, 3);
  assert.equal(result.work.queryExecutionCalls, 3);
  assert.equal(result.work.queryExecutionReturns, 3);
  assert.deepEqual(result.branches.map(b => b.kind), ['strict', 'alternative', 'recovery']);
  assert.equal(result.branches[2].baseBranch, 'branch-0');
  assert.deepEqual(result.branches[2].relaxes, ['branch-0-0']);
  for (const [index, branch] of result.branches.entries()) {
    assert.equal(branch.fingerprintCheck, 'matched');
    assert.deepEqual(branch.result, querySubjects(context, input.branches[index].query, { collect: 'results' }));
  }
  assert.equal(result.admission.validation.reserved.astNodes, 96);
  assert.equal(result.admission.execution.reserved.astNodes, 96, 'executor repeats validation');
  assert.equal(result.admission.execution.reserved.resultSlots, 30);
  assert.equal(result.admission.execution.reserved.astDepth, 8, 'depth is not summed');
  assert.equal(result.handoff, null);
  assert.equal(result.evidenceReview, 'not-run');
  assert.equal(result.bindingValidation, 'not-run');
  assert.deepEqual(input, before);
  assert.deepEqual(plans.executeIntentQueryPlan(input, context, policies()), result);
  const other = structuredClone(result.branches[1].result.assignmentEvidence);
  result.branches[0].result.assignmentEvidence.outcomes['S-000001'].resolution.redirects.push({ from: 'caller', to: 'caller' });
  assert.deepEqual(result.branches[1].result.assignmentEvidence, other, 'tables belong to one branch only');
});

test('both explicit policies pre-admit all duplicate branches before any P4 call', () => {
  const context = { get model() { throw new Error('P4 must not run'); } };
  for (const stage of ['admission', 'executionAdmission']) {
    const limits = policies(); limits[stage].maxReservedAstNodes = 32;
    const result = plans.executeIntentQueryPlan(plan(2), context, limits);
    assert.equal(result.status, 'refused');
    assert.equal(result.execution, 'not-run');
    assert.equal(result.validation, null);
    assert.equal(result.work.queryExecutionCalls, 0);
    assert.ok(result.branches.every(b => b.status === 'not-run'));
  }
  for (const options of [{}, { admission: policies().admission }, { ...policies(), typo: true }]) {
    assert.equal(plans.executeIntentQueryPlan(plan(), context, options).status, 'refused');
  }
  assert.equal(plans.executeIntentQueryPlan({}, context, policies()).status, 'refused');
});

test('reservations reject overflow, excessive depth and page slots without invoking queries', () => {
  const context = { get model() { throw new Error('P4 must not run'); } };
  for (const field of ['maxRecords', 'maxResultsPerStore']) {
    const input = plan(2);
    for (const b of input.branches) b.query.budgets[field] = Number.MAX_SAFE_INTEGER;
    const result = plans.executeIntentQueryPlan(input, context, policies());
    assert.equal(result.status, 'refused');
    assert.ok(result.diagnostics.some(d => d.code === 'plan-reservation-overflow'));
    assert.equal(result.admission.execution.allocations.length, 2);
  }
  const limits = policies(); limits.executionAdmission.maxAstDepth = 7;
  assert.equal(plans.executeIntentQueryPlan(plan(), context, limits).status, 'refused');
  limits.executionAdmission.maxAstDepth = 8; limits.executionAdmission.maxReservedResultSlots = 9;
  assert.equal(plans.executeIntentQueryPlan(plan(), context, limits).status, 'refused');
});

test('all branches validate before execution; failure in a later query prevents all execution', () => {
  const input = plan(2); input.branches[1].query.where.op = 'unsupported';
  const result = plans.executeIntentQueryPlan(input, subjectQueryFixture(), policies());
  assert.equal(result.status, 'refused');
  assert.equal(result.validation.work.queryValidationCalls, 2);
  assert.equal(result.work.queryExecutionCalls, 0);
  assert.ok(result.branches.every(b => b.result === null));
});

test('actual incomplete execution stops later branches and preserves earlier results for inspection', () => {
  const input = plan(3); input.branches[1].query.budgets.maxRecords = 0;
  const result = plans.executeIntentQueryPlan(input, subjectQueryFixture(), policies());
  assert.equal(result.status, 'incomplete');
  assert.equal(result.execution, 'incomplete');
  assert.deepEqual(result.branches.map(b => b.status), ['complete', 'incomplete', 'not-run']);
  assert.equal(result.work.queryExecutionCalls, 2);
  assert.equal(result.validation.work.queryValidationCalls, 3);
  assert.equal(result.branches[2].result, null);
  assert.equal(result.work.branches[2].observed.recordsStarted, null);
  assert.equal(result.handoff, null);
  assert.equal(result.branches[1].result.coverage.evaluationComplete, false);
});

test('actual assignment refusal differs from incomplete and stops the plan', () => {
  const context = subjectQueryFixture();
  context.model.leaves.get('K-000001').record.subjects = ['not-an-id'];
  const result = plans.executeIntentQueryPlan(plan(2), context, policies());
  assert.equal(result.status, 'refused');
  assert.equal(result.work.queryExecutionCalls, 1);
  assert.equal(result.branches[0].result.status, 'refused');
  assert.equal(result.branches[0].result.groups, null);
  assert.equal(result.branches[1].status, 'not-run');
});

test('empty results, paging/explanation loss and unresolved discovery remain distinct', () => {
  const empty = plan(); empty.branches[0].query.where = { op: 'not', arg: { op: 'all' } };
  empty.constraints.push({ ...structuredClone(empty.constraints[0]), key: 'negated',
    queryRefs: [{ branch: 'branch-0', path: '/where/arg' }] });
  const zero = plans.executeIntentQueryPlan(empty, subjectQueryFixture(), policies());
  assert.equal(zero.status, 'complete');
  assert.deepEqual(zero.branches[0].result.groups.knowledge.strict, []);
  for (const readiness of ['inventory-open', 'unresolved-intent']) {
    const input = plan();
    if (readiness === 'inventory-open') input.inventoryStatus = 'open';
    else input.units[0].disposition = 'unresolved';
    input.branches[0].query.budgets.maxResultsPerStore = 0;
    input.branches[0].query.budgets.maxExplanationNodes = 0;
    const result = plans.executeIntentQueryPlan(input, subjectQueryFixture(), policies());
    assert.equal(result.status, 'complete');
    assert.equal(result.readiness, readiness);
    assert.equal(result.branches[0].result.coverage.pageTruncated, true);
    assert.equal(result.handoff, null);
  }
  const result = plans.executeIntentQueryPlan(plan(0), subjectQueryFixture(), policies());
  assert.equal(result.status, 'refused');
  assert.ok(result.diagnostics.some(d => d.code === 'no-executable-branches'));
});

test('malformed complete capture contracts refuse; missing metrics remain unknown', () => {
  // Keep the real evaluator and authentic fixture. Only alter its returned
  // metadata at the module boundary to exercise otherwise unreachable failures.
  for (const [change, incomplete] of [
    ['delete result.input.fingerprint', false], ["result.input.fingerprint = 'different'", false],
    ['delete result.resources', false], ["result.input.fingerprint = 'different'", true],
    ['delete result.input.fingerprint', true],
  ]) {
    const input = plan(2);
    if (incomplete) input.branches[0].query.budgets.maxRecords = 0;
    const source = `
      import { mock } from 'node:test';
      import { validateSubjectQuery, querySubjects } from './payload/engine/lib/subject-query.js';
      import { subjectQueryFixture } from './tests/helpers/subject-query-fixture.js';
      mock.module('./payload/engine/lib/subject-query.js', { namedExports: {
        validateSubjectQuery, querySubjects: (...args) => {
          const result = querySubjects(...args); ${change}; return result;
        }
      }});
      const { executeIntentQueryPlan } = await import('./payload/engine/lib/intent-query-plan.js');
      process.stdout.write(JSON.stringify(executeIntentQueryPlan(${JSON.stringify(input)}, subjectQueryFixture(), ${JSON.stringify(policies())})));
    `;
    const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', source],
      { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    if (change.includes('resources')) {
      assert.equal(result.status, 'complete');
      assert.equal(result.work.observed.astNodes, null);
      assert.equal(result.work.knownObserved.astNodes, 0);
    } else {
      assert.equal(result.status, incomplete && change.startsWith('delete') ? 'incomplete' : 'refused');
      assert.equal(result.work.queryExecutionCalls, 1);
      assert.equal(result.branches[0].result.status, incomplete ? 'incomplete' : 'complete');
      assert.equal(result.branches[1].status, 'not-run');
      assert.equal(result.branches[0].fingerprintCheck, change.startsWith('delete') ? 'unavailable' : 'mismatch');
    }
  }
});

test('unexpected engine failures propagate instead of becoming a normal refusal', () => {
  assert.throws(() => plans.executeIntentQueryPlan(plan(), { get model() { throw new Error('unexpected'); } }, policies()), /unexpected/);
});
