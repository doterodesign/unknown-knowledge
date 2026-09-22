import { test } from 'node:test';
import assert from 'node:assert/strict';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQueryFixture, subjectQuery, queryBudgets, assigned } from './helpers/subject-query-fixture.js';
const strictIds = (result) => result.groups.knowledge.strict.map(({ ref, proposalRef }) => ref?.id ?? proposalRef.key);
const A = assigned('S-000001');
const B = assigned('S-000002');
const C = assigned('S-000003');

test('actual captured query applies Boolean set semantics per record with unknown metadata separate', () => {
  const context = subjectQueryFixture();
  const result = querySubjects(context, subjectQuery({ op: 'and', args: [A, B] }, { possibleMatches: true }));
  assert.equal(result.status, 'complete');
  assert.deepEqual(strictIds(result), ['K-000002']);
  assert.deepEqual(result.groups.knowledge.possible.map(({ ref }) => ref.id), ['K-000005']);
  assert.deepEqual(result.counts.knowledge, { strict: 1, possible: 1, excluded: 4, evaluated: 6, unevaluated: 0, basis: 'exact' });
  const excludedC = querySubjects(context, subjectQuery({ op: 'and', args: [A, { op: 'not', arg: C }] }));
  assert.deepEqual(strictIds(excludedC), ['K-000001']);
});

test('all-view scans separately typed proposals, current explicitly excludes them', () => {
  const context = subjectQueryFixture();
  const all = querySubjects(context, subjectQuery(A, { view: 'all' }));
  assert.equal(all.status, 'complete');
  assert.equal(all.counts.knowledge.strict, 3);
  const draft = all.groups.knowledge.strict.find(({ identityType }) => identityType === 'proposal');
  assert.ok(draft.proposalRef.key.startsWith('proposal:knowledge:'));
  assert.equal(Object.hasOwn(draft, 'ref'), false);
  assert.equal(querySubjects(context, subjectQuery()).counts.knowledge.strict, 2);
});

test('one prepared expansion is reused across repeated atoms and every scanned record', () => {
  const context = subjectQueryFixture({ descendants: true });
  const result = querySubjects(context, subjectQuery({ op: 'and', args: [A, A] }, { expansion: 'self-and-descendants',
    budgets: { ...queryBudgets, maxHierarchyNodes: 2, maxHierarchyEdges: 1 } }));
  assert.equal(result.status, 'complete');
  assert.deepEqual(strictIds(result), ['K-000001', 'K-000002', 'K-000003']);
  assert.equal(result.resources.used.hierarchyNodes, 2);
  assert.equal(result.resources.used.hierarchyEdges, 1);
  assert.equal(result.resources.used.predicateSteps, 18);
});

test('bounded hierarchy absence stays unknown under NOT while known positives are sound', () => {
  const context = subjectQueryFixture({ descendants: true });
  const result = querySubjects(context, subjectQuery({ op: 'not', arg: A }, { expansion: 'self-and-descendants', possibleMatches: true,
    budgets: { ...queryBudgets, maxHierarchyNodes: 1, maxHierarchyEdges: 0 } }));
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(strictIds(result), ['K-000004']);
  assert.equal(result.counts.knowledge.basis, 'lower-bound');
  assert.ok(result.groups.knowledge.possible.some(({ ref }) => ref.id === 'K-000003'));
  assert.equal(result.coverage.rankComplete, false);
});

test('bounded scan exposes unvalidated remainder and exact strict witnessed partial positives', () => {
  const result = querySubjects(subjectQueryFixture(), subjectQuery(A, { budgets: { ...queryBudgets, maxRecords: 2 } }));
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(strictIds(result), ['K-000001', 'K-000002']);
  assert.equal(result.resources.used.recordsStarted, 2);
  assert.equal(result.resources.used.recordsCompleted, 2);
  assert.equal(result.counts.knowledge.unevaluated, 4);
  assert.equal(result.coverage.unvalidatedRecords, 4);
  assert.equal(result.coverage.rankComplete, false);
});

test('global predicate-step budget does not reset per record or manufacture NOT matches', () => {
  const result = querySubjects(subjectQueryFixture(), subjectQuery({ op: 'not', arg: A }, { possibleMatches: true,
    budgets: { ...queryBudgets, maxPredicateSteps: 1 } }));
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(strictIds(result), []);
  assert.equal(result.resources.used.predicateSteps, 1);
});

test('an encountered invalid assignment clears earlier matches even behind an all constant', () => {
  const context = subjectQueryFixture();
  context.model.leaves.get('K-000006').record.subjects = ['S-999999'];
  const result = querySubjects(context, subjectQuery({ op: 'all' }));
  assert.equal(result.status, 'refused');
  assert.equal(result.groups, null);
  assert.equal(result.counts, null);
  assert.equal(result.diagnostics[0].code, 'unknown-subject');
});

test('record assignment governance unavailable is refusal, never membership U or zero', () => {
  const result = querySubjects(subjectQueryFixture({ unavailable: true }), subjectQuery({ op: 'all' }));
  assert.equal(result.status, 'refused');
  assert.equal(result.diagnostics[0].code, 'governance-unavailable');
  assert.equal(result.groups, null);
});

test('count sink shares full eligibility scan; page and explanation caps affect output only', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery(A, { budgets: { ...queryBudgets, maxResultsPerStore: 1 } });
  const results = querySubjects(context, query);
  const counts = querySubjects(context, query, { collect: 'counts' });
  assert.equal(results.status, 'complete');
  assert.equal(results.groups.knowledge.strict.length, 1);
  assert.equal(results.coverage.pageTruncated, true);
  assert.deepEqual(counts.counts, results.counts);
  assert.equal(counts.groups, null);
  assert.equal(counts.input.fingerprint, results.input.fingerprint);
  const hidden = querySubjects(context, subjectQuery(A, { budgets: { ...queryBudgets, maxExplanationNodes: 0 } }));
  assert.equal(hidden.status, 'complete');
  assert.deepEqual(strictIds(hidden), []);
  assert.equal(hidden.counts.knowledge.strict, 2);
  assert.equal(hidden.coverage.explanationsComplete, false);
  assert.equal(hidden.resources.used.explanationNodes, 0);
});

test('possible-match output cannot crowd out strict eligibility before pagination', () => {
  const context = subjectQueryFixture();
  delete context.model.leaves.get('K-000001').record.subjects;
  const result = querySubjects(context, subjectQuery(A, { possibleMatches: true,
    budgets: { ...queryBudgets, maxResultsPerStore: 1 } }));
  assert.equal(result.status, 'complete');
  assert.deepEqual(strictIds(result), ['K-000002']);
  assert.equal(result.groups.knowledge.possible.length, 0);
  assert.equal(result.counts.knowledge.possible, 2);
});

test('stable typed identity rank and complete candidate sets survive map/operand permutations', () => {
  const context = subjectQueryFixture();
  const first = querySubjects(context, subjectQuery({ op: 'or', args: [A, B] }));
  context.model.leaves = new Map([...context.model.leaves].reverse());
  const second = querySubjects(context, subjectQuery({ op: 'or', args: [B, A] }));
  assert.deepEqual(strictIds(first), strictIds(second));
  assert.deepEqual(first.groups.knowledge.strict.map(({ rank }) => rank), second.groups.knowledge.strict.map(({ rank }) => rank));
  assert.equal(first.groups.knowledge.strict[0].witness[1].path, '/where/args/0');
  assert.equal(second.groups.knowledge.strict[0].witness[1].path, '/where/args/0');
});

test('execution refuses unknown modes and invalid queries without a successful empty group', () => {
  const context = subjectQueryFixture();
  assert.equal(querySubjects(context, subjectQuery(), { collect: 'guess' }).status, 'refused');
  const result = querySubjects(context, subjectQuery({ op: 'all', extra: true }));
  assert.equal(result.status, 'refused');
  assert.equal(result.groups, null);
});

test('explicit equivalent policy compares resolved meanings while preserving authored IDs and approval outcomes', () => {
  const context = subjectQueryFixture({ equivalent: true });
  assert.equal(querySubjects(context, subjectQuery(B)).status, 'refused');
  const historical = querySubjects(context, subjectQuery(A, { subjectPolicy: 'historical' }));
  assert.equal(historical.status, 'complete');
  assert.deepEqual(strictIds(historical), ['K-000001', 'K-000002']);
  const equivalent = querySubjects(context, subjectQuery(B, { subjectPolicy: 'equivalent' }));
  assert.equal(equivalent.status, 'complete');
  assert.deepEqual(strictIds(equivalent), ['K-000001', 'K-000002', 'K-000003']);
  const row = equivalent.groups.knowledge.strict[0];
  assert.deepEqual(row.witness[0].matchedSubjects, ['S-000001']);
  assert.equal(equivalent.assignmentEvidence.outcomes[row.assignments.ids[0]].resolution.id, 'S-000002');
  assert.deepEqual(row.assignments.ids, ['S-000001']);
});

test('query-wide redirects are bounded across records and during upfront query preparation', () => {
  const context = subjectQueryFixture({ equivalent: true });
  const partial = querySubjects(context, subjectQuery(B, { subjectPolicy: 'equivalent',
    budgets: { ...queryBudgets, maxRedirects: 1 } }));
  assert.equal(partial.status, 'incomplete');
  assert.deepEqual(strictIds(partial), ['K-000001']);
  assert.equal(partial.resources.used.redirects, 1);
  assert.equal(partial.coverage.unvalidatedRecords, 5);
  assert.equal(partial.diagnostics[0].code, 'redirect-budget');
  const preparation = querySubjects(context, subjectQuery(A, { subjectPolicy: 'equivalent',
    budgets: { ...queryBudgets, maxRedirects: 0 } }));
  assert.equal(preparation.status, 'incomplete');
  assert.equal(preparation.groups, null);
  assert.equal(preparation.diagnostics[0].code, 'redirect-budget');
});

test('different requested IDs resolving to one subject share the same bounded expansion', () => {
  const result = querySubjects(subjectQueryFixture({ equivalent: true }), subjectQuery({ op: 'and', args: [A, B] },
    { subjectPolicy: 'equivalent', expansion: 'self-and-descendants',
      budgets: { ...queryBudgets, maxHierarchyNodes: 1, maxHierarchyEdges: 0 } }));
  assert.equal(result.status, 'complete');
  assert.equal(result.resources.used.hierarchyNodes, 1);
  assert.deepEqual(strictIds(result), ['K-000001', 'K-000002', 'K-000003']);
  const witness = result.groups.knowledge.strict[0].witness;
  assert.deepEqual(witness[1].redirects, [{ from: 'S-000001', to: 'S-000002' }]);
  assert.deepEqual(witness[2].redirects, []);
});
