import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateRecordedSubjectPredicate } from '../payload/engine/lib/subject-query.js';

const A = 'S-000001';
const B = 'S-000002';
const C = 'S-000003';
const CHILD = 'S-000004';
const UNKNOWN = 'S-000099';
const namespace = '12345678-1234-4234-8234-123456789abc';
const subject = (id, extra = {}) => ({ id, label: id,
  definition: { text: `Fixture meaning ${id}`, includes: ['Fixture material'], excludes: ['Other meanings'] },
  aliases: [], related: [], status: 'active', ...extra });
const indexed = indexSubjects({ schemaVersion: 1, namespace, revision: 1, hierarchyRevision: 1,
  subjects: [subject(A), subject(B), subject(C, { related: [{ type: 'association', target: A }] }),
    subject(CHILD, { parent: A })] });
assert.equal(indexed.ok, true);
const registry = indexed.registry;
const budgets = { maxAstNodes: 32, maxAstDepth: 8, maxHierarchyNodes: 32,
  maxHierarchyEdges: 32, maxPredicateSteps: 32 };
const atom = (subject) => ({ op: 'assigned', subject });
const not = (arg) => ({ op: 'not', arg });
const and = (...args) => ({ op: 'and', args });
const or = (...args) => ({ op: 'or', args });
const entry = (subjects) => ({ file: 'knowledge/fixture.md', record: {
  id: 'K-000001', ...(subjects === undefined ? {} : { subjects }),
} });
const evaluate = (where, subjects, extra = {}) => evaluateRecordedSubjectPredicate(where, entry(subjects), registry,
  { expansion: 'direct', budgets, ...extra });

test('independent fixed set oracle keeps extra subjects and never joins records', () => {
  const records = [[], [A], [B], [A, B], [A, B, C], [C], undefined];
  const expected = ['F', 'F', 'F', 'T', 'T', 'F', 'U'];
  assert.deepEqual(records.map((ids) => evaluate(and(atom(A), atom(B)), ids).truth), expected);
  assert.deepEqual(records.map((ids) => evaluate(and(atom(A), atom(B), not(atom(C))), ids).truth),
    ['F', 'F', 'F', 'T', 'F', 'F', 'U']);
  // Each evaluation owns exactly one record: A on one and B on another do not join.
  assert.equal(evaluate(and(atom(A), atom(B)), [A]).truth, 'F');
  assert.equal(evaluate(and(atom(A), atom(B)), [B]).truth, 'F');
});

test('known empty, missing metadata and authored presence remain distinct', () => {
  assert.equal(evaluate(atom(A), []).truth, 'F');
  assert.equal(evaluate(not(atom(A)), []).truth, 'T');
  assert.equal(evaluate(not(atom(A)), undefined).truth, 'U');
  assert.equal(evaluate({ op: 'subjects-present' }, []).truth, 'T');
  assert.equal(evaluate({ op: 'subjects-present' }, undefined).truth, 'F');
  assert.deepEqual(evaluate(atom(A), undefined).unknowns, [{ path: '/where', reason: 'missing-assignments' }]);
});

test('constants and decisive OR retain independent unknown diagnostics', () => {
  const result = evaluate(or({ op: 'all' }, atom(A)), undefined);
  assert.equal(result.truth, 'T');
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.unknowns, [{ path: '/where/args/1', reason: 'missing-assignments' }]);
  assert.equal(evaluate(and({ op: 'none' }, atom(A)), undefined).truth, 'F');
});

test('direct and descendant modes use P2 forest direction without related-link transfer', () => {
  assert.equal(evaluate(atom(A), [CHILD]).truth, 'F');
  assert.equal(evaluate(atom(A), [CHILD], { expansion: 'self-and-descendants', budgets }).truth, 'T');
  assert.equal(evaluate(atom(CHILD), [A], { expansion: 'self-and-descendants', budgets }).truth, 'F');
  assert.equal(evaluate(atom(A), [C], { expansion: 'self-and-descendants', budgets }).truth, 'F');
});

test('incomplete ancestry proves only observed matches, never absence under NOT', () => {
  const extra = { expansion: 'self-and-descendants', budgets: { ...budgets, maxHierarchyNodes: 1 } };
  const missing = evaluate(not(atom(A)), [CHILD], extra);
  assert.equal(missing.truth, 'U');
  assert.equal(missing.status, 'incomplete');
  assert.ok(missing.unknowns.some(({ reason }) => reason === 'incomplete-hierarchy'));
  const witnessed = evaluate(atom(A), [A], extra);
  assert.equal(witnessed.truth, 'T');
  assert.equal(witnessed.status, 'incomplete', 'traversal completion is separate from established truth');
  assert.equal(evaluate(atom(A), [], extra).truth, 'F', 'known empty recorded set remains empty');
});

test('zero hierarchy budgets cannot produce a false negative', () => {
  const result = evaluate(not(atom(A)), [CHILD], { expansion: 'self-and-descendants',
    budgets: { ...budgets, maxHierarchyNodes: 0, maxHierarchyEdges: 0 } });
  assert.equal(result.truth, 'U');
  assert.equal(result.status, 'incomplete');
});

test('edge exhaustion and shared expansion budgets cannot masquerade as absence', () => {
  const result = evaluate(not(atom(A)), [CHILD], { expansion: 'self-and-descendants',
    budgets: { ...budgets, maxHierarchyEdges: 0 } });
  assert.equal(result.truth, 'U');
  assert.equal(result.status, 'incomplete');
  assert.equal(result.used.hierarchyEdges, 0);
  const shared = evaluate(and(atom(A), atom(B)), [A, B], { expansion: 'self-and-descendants',
    budgets: { ...budgets, maxHierarchyNodes: 2 } });
  assert.equal(shared.truth, 'U');
  assert.equal(shared.used.hierarchyNodes, 2, 'budgets do not reset for each subject');
  const repeated = evaluate(and(atom(A), atom(A)), [CHILD], { expansion: 'self-and-descendants', budgets });
  assert.equal(repeated.truth, 'T');
  assert.equal(repeated.used.hierarchyNodes, 2, 'one expansion per distinct subject within this invocation');
  assert.equal(repeated.used.hierarchyEdges, 1);
});

test('predicate-step exhaustion preserves Kleene truth with explicit incompleteness', () => {
  const extra = { budgets: { ...budgets, maxPredicateSteps: 2 } };
  const result = evaluate(or({ op: 'all' }, atom(A)), [A], extra);
  assert.equal(result.truth, 'T');
  assert.equal(result.status, 'incomplete');
  assert.equal(result.used.predicateSteps, 2);
  assert.equal(evaluate(not(atom(A)), [A], { budgets: { ...budgets, maxPredicateSteps: 1 } }).truth, 'U');
  assert.equal(evaluate(atom(A), [A], { budgets: { ...budgets, maxPredicateSteps: 0 } }).truth, 'U');
  assert.equal(evaluate(atom(A), [A], { budgets: { ...budgets, maxPredicateSteps: 1 } }).status, 'complete');
});

test('unknown query IDs and invalid assignments refuse even behind decisive constants', () => {
  for (const [where, ids] of [[or({ op: 'all' }, atom(UNKNOWN)), [A]],
    [{ op: 'all' }, [UNKNOWN]], [{ op: 'all' }, null], [{ op: 'all' }, [A, A]]]) {
    const result = evaluate(where, ids);
    assert.equal(result.status, 'refused');
    assert.equal(Object.hasOwn(result, 'truth'), false);
    assert.ok(result.diagnostics.length > 0);
  }
});

test('structural witness names original predicate and actual recorded matching subject', () => {
  const result = evaluate(atom(A), [CHILD], { expansion: 'self-and-descendants', budgets });
  assert.equal(result.validationScope, 'structural-only');
  assert.deepEqual(result.witness[0], { path: '/where', op: 'assigned', truth: 'T', subject: A,
    expansion: 'self-and-descendants', matchedSubjects: [CHILD], assignmentState: 'known' });
});

test('unavailable registry and unsupported options refuse, never produce empty classification', () => {
  assert.equal(evaluateRecordedSubjectPredicate(atom(A), entry([A]), null, { budgets }).status, 'refused');
  assert.equal(evaluate(atom(A), [A], { expansion: 'related', budgets }).status, 'refused');
  assert.equal(evaluate(atom(A), [A], { budgets: { ...budgets, maxPredicateSteps: -1 } }).status, 'refused');
});

test('structural inspection preserves entries and the captured registry', () => {
  const original = Object.freeze({ record: Object.freeze({ id: 'K-000001', subjects: Object.freeze([B, A]) }) });
  const before = JSON.stringify(registry.document);
  const result = evaluateRecordedSubjectPredicate(and(atom(A), atom(B)), original, registry, { budgets });
  assert.equal(result.truth, 'T');
  assert.deepEqual(original.record.subjects, [B, A]);
  assert.equal(JSON.stringify(registry.document), before);
});
