import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSubjectQueryCandidates } from '../payload/engine/lib/subject-query-delta.js';
import { compareSubjectRoutes } from '../payload/engine/lib/subject-route-impact.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQueryFixture, subjectQuery, queryBudgets } from './helpers/subject-query-fixture.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';

test('actual complete results compare canonical and proposal identities without mutating outputs', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery(undefined, { view: 'all', possibleMatches: true });
  const before = querySubjects(context, query);
  const snapshot = structuredClone(before);
  const delta = compareSubjectQueryCandidates({ before, after: before, possibleMatches: true });
  assert.equal(delta.status, 'exact');
  assert.deepEqual(delta.strict.added, []);
  assert.deepEqual(delta.strict.removed, []);
  assert.deepEqual(delta.strict.retained.filter(({ ref }) => ref).map(({ ref }) => ref.id), ['K-000001', 'K-000002']);
  assert.deepEqual(delta.strict.retained.filter(({ proposalRef }) => proposalRef).map(({ proposalRef }) => proposalRef.key),
    ['proposal:knowledge:11111111-1111-4111-8111-111111111111']);
  assert.deepEqual(delta.possible.retained.map(({ ref }) => ref.id), ['K-000005']);
  assert.deepEqual(delta.strict.rankChanges, []);
  assert.deepEqual(before, snapshot);
});

test('actual membership and rank changes retain typed identity and complete rank metadata', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery(undefined, { view: 'all', possibleMatches: true });
  const before = querySubjects(context, query);
  context.model.leaves.get('K-000001').record.subjects = [];
  context.model.leaves.get('K-000004').record.subjects = ['S-000001'];
  context.model.leaves.get('K-000005').record.subjects = [];
  const after = querySubjects(context, query);
  const delta = compareSubjectQueryCandidates({ before, after, possibleMatches: true });
  assert.equal(delta.status, 'exact');
  assert.deepEqual(delta.strict.added.map(({ ref }) => ref.id), ['K-000004']);
  assert.deepEqual(delta.strict.removed.map(({ ref }) => ref.id), ['K-000001']);
  assert.deepEqual(delta.possible.removed.map(({ ref }) => ref.id), ['K-000005']);
  const changed = delta.strict.rankChanges.find(({ ref }) => ref?.id === 'K-000002');
  assert.deepEqual(changed.before, before.groups.knowledge.strict.find(({ ref }) => ref?.id === 'K-000002').rank);
  assert.deepEqual(changed.after, after.groups.knowledge.strict.find(({ ref }) => ref?.id === 'K-000002').rank);
  assert.notDeepEqual(changed.before, changed.after);
});

test('actual scan, page and explanation loss suppress exact deltas on either side', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery(undefined, { possibleMatches: true });
  const complete = querySubjects(context, query);
  for (const budget of [{ maxRecords: 1 }, { maxResultsPerStore: 0 }, { maxExplanationNodes: 0 }]) {
    const limited = querySubjects(context, { ...query, budgets: { ...queryBudgets, ...budget } });
    for (const side of ['before', 'after']) {
      const delta = compareSubjectQueryCandidates({ before: complete, after: complete, [side]: limited, possibleMatches: true });
      assert.equal(delta.status, 'unavailable');
      for (const category of ['strict', 'possible']) {
        for (const field of ['added', 'removed', 'retained', 'rankChanges']) assert.equal(delta[category][field], null);
        assert.deepEqual(delta[category].reasons, [{ side, code: 'full-query-output-unavailable' }]);
      }
    }
  }
});

test('actual counts-only or refused results cannot masquerade as complete empty output', () => {
  const context = subjectQueryFixture();
  const query = subjectQuery();
  for (const result of [querySubjects(context, query, { collect: 'counts' }),
    querySubjects(context, { ...query, cursor: 'unsupported' })]) {
    const delta = compareSubjectQueryCandidates({ before: result, after: result, possibleMatches: false });
    assert.equal(delta.status, 'unavailable');
    assert.equal(delta.strict.retained, null);
    assert.deepEqual(delta.possible, { status: 'not-requested' });
    assert.deepEqual(delta.strict.reasons.map(({ side }) => side), ['before', 'after']);
  }
});

test('unrequested possible category remains distinct from an exact empty category', () => {
  const result = querySubjects(subjectQueryFixture(), subjectQuery());
  const delta = compareSubjectQueryCandidates({ before: result, after: result, possibleMatches: false });
  assert.equal(delta.strict.status, 'exact');
  assert.deepEqual(delta.possible, { status: 'not-requested' });
});

test('route impact candidate DTO is identical to shared comparison of its actual results', (t) => {
  const f = subjectQueryDiskFixture(t);
  const { where, ...queryOptions } = subjectQuery(undefined, { view: 'all', possibleMatches: true });
  const report = compareSubjectRoutes({ version: 1,
    before: { capturedInputRef: 'before', context: f.context }, after: { capturedInputRef: 'after', context: f.context },
    inventory: { version: 1, coverage: 'complete', routes: [{ id: 'color',
      route: { version: 1, kind: 'intersection', subjects: ['S-000001'] }, queryOptions }] },
    limits: { version: 1, maxRoutes: 1, maxPathNodes: 10, maxPathEdges: 10 } });
  assert.equal(report.status, 'complete');
  const row = report.routes[0];
  assert.deepEqual(row.candidates, compareSubjectQueryCandidates({
    before: row.before.execution, after: row.after.execution, possibleMatches: true }));
});
