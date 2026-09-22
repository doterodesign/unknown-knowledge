import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSubjectPredicate } from '../payload/engine/lib/subject-query.js';

const budgets = { maxAstNodes: 32, maxAstDepth: 8 };
const assigned = (subject) => ({ op: 'assigned', subject });
const check = (where, limits = budgets) => validateSubjectPredicate(where, limits);

test('collects exact subject requirements without rewriting AST paths or operands', () => {
  const where = Object.freeze({ op: 'and', args: Object.freeze([
    Object.freeze(assigned('S-000003')),
    Object.freeze({ op: 'not', arg: Object.freeze(assigned('S-000001')) }),
    Object.freeze(assigned('S-000003')),
  ]) });
  assert.deepEqual(check(where), {
    ok: true, validationScope: 'syntax-only',
    requirements: { subjects: ['S-000001', 'S-000003'] },
    used: { astNodes: 5, astDepth: 3 },
  });
  assert.equal(where.args[0].subject, 'S-000003');
});

test('explicit all, none and assignment presence are supported constants/atoms', () => {
  for (const op of ['all', 'none', 'subjects-present']) {
    assert.deepEqual(check({ op }), {
      ok: true, validationScope: 'syntax-only', requirements: { subjects: [] },
      used: { astNodes: 1, astDepth: 1 },
    });
  }
});

test('malformed shapes, extra fields and unsupported operators refuse explicitly', () => {
  const invalid = [null, [], 'all', {}, { op: 'xor', args: [] },
    { op: 'all', subject: 'S-000001' }, { op: 'and', args: [] },
    { op: 'or', args: 'all' }, { op: 'not', args: [{ op: 'all' }] },
    { op: 'not', arg: { op: 'all' }, extra: true }, { op: 'assigned' },
    { op: 'assigned', subject: 'S-000000' }, assigned(' S-000001'),
    assigned('S-000001\n'), assigned('s-000001'),
    { op: 'and', args: new Array(1) }];
  for (const where of invalid) {
    const result = check(where);
    assert.equal(result.ok, false, JSON.stringify(where));
    assert.ok(result.diagnostics[0].code);
    assert.ok(result.diagnostics[0].path.startsWith('/where'));
    assert.equal(Object.hasOwn(result, 'requirements'), false);
  }
});

test('unsupported dead branch remains an error at its original JSON Pointer', () => {
  const result = check({ op: 'or', args: [{ op: 'all' }, { op: 'guess', subject: 'S-000001' }] });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'unsupported-operator');
  assert.equal(result.diagnostics[0].path, '/where/args/1/op');
});

test('exact budget boundaries permit completion; over-budget validation refuses', () => {
  const where = { op: 'not', arg: { op: 'not', arg: { op: 'all' } } };
  assert.equal(check(where, { maxAstNodes: 3, maxAstDepth: 3 }).ok, true);
  for (const limits of [{ maxAstNodes: 2, maxAstDepth: 3 }, { maxAstNodes: 3, maxAstDepth: 2 }]) {
    const result = check(where, limits);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'ast-budget-exceeded');
  }
  for (const limits of [undefined, {}, { maxAstNodes: 0, maxAstDepth: 8 },
    { maxAstNodes: Infinity, maxAstDepth: 8 }, { maxAstNodes: 5, maxAstDepth: 1.5 }]) {
    assert.equal(validateSubjectPredicate({ op: 'all' }, limits).ok, false);
  }
});

test('iterative validation handles deep input with an explicit bound', () => {
  let where = { op: 'all' };
  for (let i = 1; i < 12000; i += 1) where = { op: 'not', arg: where };
  const result = check(where, { maxAstNodes: 12000, maxAstDepth: 12000 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.used, { astNodes: 12000, astDepth: 12000 });
});

test('cycles are invalid while shared object references represent separate AST occurrences', () => {
  const cyclic = { op: 'not' };
  cyclic.arg = cyclic;
  assert.equal(check(cyclic).ok, false);
  const atom = assigned('S-000001');
  assert.deepEqual(check({ op: 'and', args: [atom, atom] }).used, { astNodes: 3, astDepth: 2 });
});

test('wide input is rejected before scheduling children beyond the AST budget', () => {
  const result = check({ op: 'or', args: new Array(10000).fill({ op: 'all' }) });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'ast-budget-exceeded');
  assert.deepEqual(result.used, { astNodes: 1, astDepth: 1 });
});

test('extra-field diagnostics escape JSON Pointer path segments', () => {
  const result = check({ op: 'all', 'a/b~c': true });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].path, '/where/a~1b~0c');
});
