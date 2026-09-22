import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSubjectContexts } from '../payload/engine/lib/subject-contexts.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { subjectQueryFixture, subjectQuery, queryBudgets, assigned } from './helpers/subject-query-fixture.js';

const budgets = { version: 1, maxRecords: 30, maxAssignments: 50, maxHierarchyNodes: 30,
  maxHierarchyEdges: 30, maxRedirects: 30, maxContexts: 10 };
const options = (changes = {}) => ({ budgets: { ...budgets, ...changes } });
const knownFixture = (fields) => {
  const context = subjectQueryFixture(fields);
  context.model.leaves.get('K-000005').record.subjects = [];
  return context;
};

test('one-step contexts use full real counts despite zero result and explanation pages', () => {
  const context = knownFixture();
  const query = subjectQuery(undefined, { budgets: { ...queryBudgets, maxResultsPerStore: 0, maxExplanationNodes: 0 } });
  const result = countSubjectContexts(context, query, options());
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.contexts.map(({ subject }) => subject), ['S-000002', 'S-000003']);
  assert.deepEqual(result.contexts.map(({ counts }) => counts.knowledge.strict), [1, 1]);
  for (const candidate of result.contexts) {
    const actual = querySubjects(context, { ...query, where: { op: 'and', args: [query.where, assigned(candidate.subject)] } },
      { collect: 'counts' });
    assert.deepEqual(candidate.counts, actual.counts);
    assert.equal(candidate.input.fingerprint, actual.input.fingerprint);
  }
  assert.equal(result.resources.queries.calls, 3, 'base count plus two single extensions');
  assert.equal(result.resources.queries.used.recordsStarted, 18);
  assert.equal(result.coverage.enumerationComplete, true);
  assert.equal(result.coverage.countsComplete, true);
  assert.equal(result.coverage.topContextsClaimed, false);
});

test('context counts preserve original filters, store scope, lifecycle and proposal identity', () => {
  const context = knownFixture();
  const draft = [...context.model.proposals.knowledge.values()][0];
  draft.record.subjects = ['S-000001', 'S-000002'];
  const all = countSubjectContexts(context, subjectQuery(undefined, { view: 'all' }), options());
  assert.equal(all.contexts[0].counts.knowledge.strict, 2, 'canonical and proposal are distinct records');
  const filtered = subjectQuery({ op: 'and', args: [assigned('S-000001'), { op: 'not', arg: assigned('S-000003') }] });
  const result = countSubjectContexts(context, filtered, options());
  assert.deepEqual(result.contexts.map(({ subject }) => subject), ['S-000002']);
  assert.equal(result.contexts[0].counts.knowledge.strict, 0);
  assert.deepEqual(result.contexts[0].query.where.args[0], filtered.where);
});

test('descendant context enumeration includes actual ancestors absent from direct assignments', () => {
  const context = knownFixture({ descendants: true });
  context.model.leaves.get('K-000001').record.subjects = ['S-000002'];
  context.model.leaves.get('K-000002').record.subjects = ['S-000002', 'S-000003'];
  const direct = countSubjectContexts(context, subjectQuery(assigned('S-000003')), options());
  assert.deepEqual(direct.contexts.map(({ subject }) => subject), ['S-000002']);
  const expanded = countSubjectContexts(context, subjectQuery(assigned('S-000003'), { expansion: 'self-and-descendants' }), options());
  assert.equal(expanded.status, 'complete');
  assert.deepEqual(expanded.contexts.map(({ subject }) => subject), ['S-000001', 'S-000002']);
  assert.deepEqual(expanded.contexts.map(({ counts }) => counts.knowledge.strict), [1, 1]);
  assert.equal(expanded.resources.enumeration.used.hierarchyNodes, 3, 'cached Shape path plus Size path');
});

test('enumeration limits and count limits have separate coverage and observed work', () => {
  const context = knownFixture();
  const limited = countSubjectContexts(context, subjectQuery(), options({ maxContexts: 1 }));
  assert.equal(limited.status, 'incomplete');
  assert.equal(limited.coverage.enumerationComplete, true);
  assert.equal(limited.coverage.countsComplete, false);
  assert.equal(limited.contexts[0].counts.knowledge.basis, 'exact');
  assert.equal(limited.resources.queries.calls, 2);
  for (const change of [{ maxRecords: 1 }, { maxAssignments: 0 }]) {
    const result = countSubjectContexts(context, subjectQuery(), options(change));
    assert.equal(result.status, 'incomplete');
    assert.equal(result.coverage.enumerationComplete, false);
  }
});

test('query budget partial counts retain provisional possible basis and independent enumeration completion', () => {
  const context = knownFixture();
  const result = countSubjectContexts(context, subjectQuery(undefined, {
    budgets: { ...queryBudgets, maxRecords: 2 },
  }), options());
  assert.equal(result.status, 'incomplete');
  assert.equal(result.coverage.enumerationComplete, true);
  assert.equal(result.coverage.countsComplete, false);
  assert.equal(result.contexts[0].counts.knowledge.basis, 'lower-bound');
  assert.equal(result.contexts[0].counts.knowledge.possibleBasis, 'provisional');
});

test('missing assignments cannot become an apparently complete empty context universe', () => {
  const context = subjectQueryFixture();
  for (const entry of context.model.leaves.values()) delete entry.record.subjects;
  const result = countSubjectContexts(context, subjectQuery(), options());
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.contexts, []);
  assert.equal(result.coverage.unknownAssignments, 6);
  assert.equal(result.coverage.enumerationComplete, false);
  assert.equal(result.base.counts.knowledge.basis, 'exact');
});

test('unavailable authority and invalid unvisited assignments refuse rather than generate contexts', () => {
  const unavailable = countSubjectContexts(subjectQueryFixture({ unavailable: true }), subjectQuery(), options());
  assert.equal(unavailable.status, 'refused');
  assert.equal(unavailable.contexts, null);
  const context = knownFixture();
  context.model.leaves.get('K-000006').record.subjects = ['S-999999'];
  const invalid = countSubjectContexts(context, subjectQuery(undefined, { budgets: { ...queryBudgets, maxRecords: 0 } }), options());
  assert.equal(invalid.status, 'refused');
  assert.equal(invalid.contexts, null);
  assert.equal(invalid.diagnostics[0].code, 'unknown-subject');
});

test('equivalent ancestor enumeration uses real assignment outcomes and shares traversal cache', () => {
  const context = knownFixture({ equivalent: true });
  const result = countSubjectContexts(context, subjectQuery(assigned('S-000003'), {
    subjectPolicy: 'equivalent', expansion: 'self-and-descendants',
  }), options({ maxHierarchyNodes: 2 }));
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.contexts.map(({ subject }) => subject), ['S-000001', 'S-000002']);
  assert.equal(result.resources.enumeration.used.hierarchyNodes, 2);
  assert.equal(result.resources.enumeration.used.redirects, 2);
  const partial = countSubjectContexts(context, subjectQuery(assigned('S-000003'), { subjectPolicy: 'equivalent' }),
    options({ maxRedirects: 0 }));
  assert.equal(partial.status, 'incomplete');
  assert.equal(partial.coverage.enumerationComplete, false);
});

test('context enumeration refuses implicit or malformed budgets', () => {
  for (const input of [undefined, {}, options({ maxContexts: -1 }), options({ maxRecords: Infinity }),
    { ...options(), extra: true }]) {
    const result = countSubjectContexts(knownFixture(), subjectQuery(), input);
    assert.equal(result.status, 'refused');
    assert.equal(result.diagnostics[0].code, 'invalid-context-options');
  }
});

test('bounded ancestry remains partial without changing exact counts for known candidates', () => {
  const context = knownFixture({ descendants: true });
  const result = countSubjectContexts(context, subjectQuery(assigned('S-000003'), { expansion: 'self-and-descendants' }),
    options({ maxHierarchyNodes: 0 }));
  assert.equal(result.status, 'incomplete');
  assert.equal(result.coverage.enumerationComplete, false);
  assert.equal(result.coverage.countsComplete, true);
  assert.ok(result.contexts.every(({ counts }) => counts.knowledge.basis === 'exact'));
  assert.equal(result.resources.enumeration.used.hierarchyNodes, 0);
  const exhausted = countSubjectContexts(context, subjectQuery(), options({ maxAssignments: 0 }));
  assert.equal(exhausted.coverage.validatedRecords, 0);
  assert.equal(exhausted.coverage.unvalidatedRecords, 6);
});

test('complete context order and fingerprints survive record map permutations without mutation', () => {
  const context = knownFixture();
  const before = structuredClone(context.model);
  const first = countSubjectContexts(context, subjectQuery(), options());
  assert.deepEqual(context.model, before);
  context.model.leaves = new Map([...context.model.leaves].reverse());
  assert.deepEqual(countSubjectContexts(context, subjectQuery(), options()), first);
  const bounded = countSubjectContexts(context, subjectQuery(), options({ maxContexts: 1 }));
  assert.notEqual(bounded.input.fingerprint, first.input.fingerprint);
});
