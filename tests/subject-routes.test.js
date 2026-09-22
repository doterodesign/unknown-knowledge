import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileIntersectionRoute, executeIntersectionRoute } from '../payload/engine/lib/subject-routes.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQueryFixture, subjectQuery } from './helpers/subject-query-fixture.js';

test('an explicit intersection compiles to same-record AND and preserves operand provenance', () => {
  const route = { version: 1, kind: 'intersection', subjects: ['S-000003', 'S-000001'] };
  const before = structuredClone(route);
  assert.deepEqual(compileIntersectionRoute(route), {
    ok: true,
    where: { op: 'and', args: [
      { op: 'assigned', subject: 'S-000003' },
      { op: 'assigned', subject: 'S-000001' },
    ] },
  });
  assert.deepEqual(route, before);
  assert.deepEqual(compileIntersectionRoute({ ...route, subjects: ['S-000001'] }), {
    ok: true, where: { op: 'assigned', subject: 'S-000001' },
  });
});

test('semantic paths and bare label paths cannot silently become intersections', () => {
  for (const route of [
    'accessibility/color',
    { version: 1, kind: 'semantic-path', subjects: ['S-000001', 'S-000002'] },
  ]) {
    const result = compileIntersectionRoute(route);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'invalid-intersection-route');
    assert.equal(Object.hasOwn(result, 'where'), false);
  }
});

test('closed route syntax refuses malformed, duplicate or formatted subject identities', () => {
  const valid = { version: 1, kind: 'intersection', subjects: ['S-000001'] };
  for (const route of [null, {}, { ...valid, version: 2 }, { ...valid, kind: 'parent' },
    { ...valid, inferred: true }, { ...valid, subjects: [] }, { ...valid, subjects: 'S-000001' },
    ...[['S-000001', 'S-000001'], [' S-000001'], ['S-1'], ['S-000001\n'], ['S-000000'], ['K-000001'], [null]]
      .map((subjects) => ({ ...valid, subjects })),
  ]) {
    const result = compileIntersectionRoute(route);
    assert.equal(result.ok, false, JSON.stringify(route));
    assert.equal(result.diagnostics.length > 0, true);
    assert.equal(typeof result.diagnostics[0].path, 'string');
  }
});

test('compiler emits syntax only: exact unknown IDs require the real query validator', () => {
  assert.deepEqual(compileIntersectionRoute({ version: 1, kind: 'intersection', subjects: ['S-999999'] }), {
    ok: true, where: { op: 'assigned', subject: 'S-999999' },
  });
});

test('actual route execution preserves complete typed candidates and ranks when reversed', () => {
  const context = subjectQueryFixture();
  const route = { version: 1, kind: 'intersection', subjects: ['S-000001', 'S-000002'] };
  const { where, ...options } = subjectQuery(undefined, { view: 'all', possibleMatches: true });
  const first = executeIntersectionRoute(context, route, options);
  assert.equal(first.status, 'complete');
  assert.deepEqual(first.groups.knowledge.strict.map(({ ref }) => ref.id), ['K-000002']);
  const reverse = executeIntersectionRoute(context, { ...route, subjects: [...route.subjects].reverse() }, options);
  const identityRank = (result) => Object.fromEntries(Object.entries(result.groups.knowledge)
    .map(([kind, rows]) => [kind, rows.map(({ ref, proposalRef, rank }) => ({ ref, proposalRef, rank }))]));
  assert.deepEqual(identityRank(reverse), identityRank(first));
  assert.deepEqual(reverse.counts, first.counts);
  assert.deepEqual(first.route, route);
  assert.deepEqual(first.query.where, compileIntersectionRoute(route).where);
  const singleton = executeIntersectionRoute(context, { ...route, subjects: ['S-000001'] }, options);
  const draft = singleton.groups.knowledge.strict.find(({ identityType }) => identityType === 'proposal');
  assert.ok(draft.proposalRef.key.startsWith('proposal:knowledge:'));
  assert.equal(Object.hasOwn(draft, 'ref'), false);
  const counts = executeIntersectionRoute(context, route, options, { collect: 'counts' });
  assert.equal(counts.groups, null);
  assert.deepEqual(counts.counts, first.counts);
  assert.deepEqual(counts, { ...querySubjects(context, { ...options, where: compileIntersectionRoute(route).where },
    { collect: 'counts' }), route });
});

test('route execution retains real query refusal and bounded count outcomes', () => {
  const context = subjectQueryFixture();
  const route = { version: 1, kind: 'intersection', subjects: ['S-000001'] };
  const { where, ...options } = subjectQuery();
  const partial = executeIntersectionRoute(context, route, {
    ...options, budgets: { ...options.budgets, maxRecords: 1 },
  }, { collect: 'counts' });
  assert.equal(partial.status, 'incomplete');
  assert.equal(partial.counts.knowledge.basis, 'lower-bound');
  assert.equal(partial.counts.knowledge.possibleBasis, 'provisional');
  assert.equal(executeIntersectionRoute(context, route, { ...options, where }).status, 'refused');
  assert.equal(executeIntersectionRoute(context, { ...route, kind: 'semantic-path' }, options).status, 'refused');
  assert.equal(executeIntersectionRoute(context, { ...route, subjects: ['S-999999'] }, options).status, 'refused');
  const unavailable = executeIntersectionRoute(subjectQueryFixture({ unavailable: true }), route, options);
  assert.equal(unavailable.status, 'refused');
  assert.equal(unavailable.counts, null);
  assert.equal(unavailable.diagnostics[0].code, 'governance-unavailable');
});
