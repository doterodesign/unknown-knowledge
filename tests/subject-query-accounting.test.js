import { test } from 'node:test';
import assert from 'node:assert/strict';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQueryFixture, subjectQuery, queryBudgets } from './helpers/subject-query-fixture.js';

// Characterization of existing units, not a claim that these counters measure
// all loading, capture validation, hashing, allocation or elapsed-time work.
test('zero record allowance still fingerprints the complete captured record payload', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery(undefined, { budgets: { ...queryBudgets, maxRecords: 0 } });
  const before = querySubjects(context, query);
  context.model.leaves.get('K-000006').body = 'x'.repeat(65536);
  const after = querySubjects(context, query);
  for (const result of [before, after]) {
    assert.equal(result.status, 'incomplete');
    assert.equal(result.resources.used.recordsStarted, 0);
    assert.equal(result.resources.used.predicateSteps, 0);
    assert.equal(result.counts.knowledge.unevaluated, 6);
  }
  assert.notEqual(before.input.inputs.records, after.input.inputs.records);
});

test('zero predicate allowance still validates assignments and preserves incomplete unknown rows', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery(undefined, { possibleMatches: true,
    budgets: { ...queryBudgets, maxPredicateSteps: 0, maxRecords: 3 } });
  const result = querySubjects(context, query);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.resources.used.predicateSteps, 0);
  assert.equal(result.resources.used.recordsStarted, 3);
  assert.equal(result.resources.used.recordsCompleted, 0);
  assert.equal(result.counts.knowledge.possible, 3);
  assert.equal(result.counts.knowledge.possibleBasis, 'provisional');
  assert.equal(result.counts.knowledge.unevaluated, 3);
  assert.equal(result.groups.knowledge.possible[0].witness.length, 1);
  assert.equal(result.groups.knowledge.possible[0].unknowns[0].reason, 'predicate-budget');
  context.model.leaves.get('K-000001').record.subjects = ['S-999999'];
  const refused = querySubjects(context, query);
  assert.equal(refused.status, 'refused');
  assert.equal(refused.diagnostics[0].code, 'unknown-subject');
  assert.equal(refused.resources.used.predicateSteps, 0);
  assert.equal(refused.counts, null);
});

test('one predicate step and zero redirects can accompany different assignment workloads', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery({ op: 'all' }, { budgets: { ...queryBudgets, maxRecords: 1 } });
  const sparse = querySubjects(context, query);
  context.model.leaves.get('K-000001').record.subjects = ['S-000001', 'S-000002', 'S-000003'];
  const dense = querySubjects(context, query);
  for (const result of [sparse, dense]) {
    assert.equal(result.resources.used.recordsStarted, 1);
    assert.equal(result.resources.used.predicateSteps, 1);
    assert.equal(result.resources.used.redirects, 0);
    assert.equal(result.counts.knowledge.strict, 1);
  }
  assert.equal(sparse.groups.knowledge.strict[0].assignments.ids.length, 1);
  assert.equal(dense.groups.knowledge.strict[0].assignments.ids.length, 3);
});

test('zero explanation allowance and count mode preserve evaluation work and exact counts', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery(undefined, { budgets: { ...queryBudgets, maxExplanationNodes: 0 } });
  const rows = querySubjects(context, query);
  const counts = querySubjects(context, query, { collect: 'counts' });
  assert.equal(rows.status, 'complete');
  assert.equal(rows.coverage.explanationsComplete, false);
  assert.deepEqual(rows.groups.knowledge.strict, []);
  assert.equal(rows.resources.used.explanationNodes, 0);
  assert.equal(rows.resources.used.recordsCompleted, 6);
  assert.equal(rows.resources.used.predicateSteps, 6);
  assert.equal(counts.groups, null);
  assert.deepEqual(counts.counts, rows.counts);
  assert.equal(counts.counts.knowledge.basis, 'exact');
  assert.equal(counts.resources.used.explanationNodes, 0);
  assert.equal(counts.resources.used.predicateSteps, rows.resources.used.predicateSteps);
});

test('preparation redirect exhaustion reports incomplete without inventing zero resource usage', () => {
  const result = querySubjects(subjectQueryFixture({ equivalent: true }), subjectQuery(undefined,
    { subjectPolicy: 'equivalent', budgets: { ...queryBudgets, maxRedirects: 0 } }));
  assert.equal(result.status, 'incomplete');
  assert.equal(result.coverage.reason, 'query-preparation-budget');
  assert.equal(result.groups, null);
  assert.equal(result.counts, null);
  assert.equal(Object.hasOwn(result, 'resources'), false);
});
