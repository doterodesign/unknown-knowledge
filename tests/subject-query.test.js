import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeSubjectTruth } from '../payload/engine/lib/subject-query.js';

// Fixed expected tables, independent of the production evaluator. These are
// recorded-membership truths; no row asserts a negative fact about the world.
const unary = [['T', 'F'], ['F', 'T'], ['U', 'U']];
const binary = [
  ['T', 'T', 'T', 'T'],
  ['T', 'F', 'F', 'T'],
  ['T', 'U', 'U', 'T'],
  ['F', 'T', 'F', 'T'],
  ['F', 'F', 'F', 'F'],
  ['F', 'U', 'F', 'U'],
  ['U', 'T', 'U', 'T'],
  ['U', 'F', 'F', 'U'],
  ['U', 'U', 'U', 'U'],
];

for (const [value, expected] of unary) {
  test(`NOT ${value} = ${expected}`, () => {
    assert.equal(composeSubjectTruth('not', [value]), expected);
  });
}
for (const [left, right, and, or] of binary) {
  test(`${left} AND ${right} = ${and}`, () => {
    assert.equal(composeSubjectTruth('and', [left, right]), and);
  });
  test(`${left} OR ${right} = ${or}`, () => {
    assert.equal(composeSubjectTruth('or', [left, right]), or);
  });
}

test('n-ary composition preserves decisive truth and missing metadata', () => {
  assert.equal(composeSubjectTruth('and', ['T', 'T', 'T']), 'T');
  assert.equal(composeSubjectTruth('and', ['T', 'U', 'T']), 'U');
  assert.equal(composeSubjectTruth('and', ['U', 'F', 'T']), 'F');
  assert.equal(composeSubjectTruth('or', ['F', 'F', 'F']), 'F');
  assert.equal(composeSubjectTruth('or', ['F', 'U', 'F']), 'U');
  assert.equal(composeSubjectTruth('or', ['U', 'T', 'F']), 'T');
  assert.equal(composeSubjectTruth('and', ['T']), 'T');
  assert.equal(composeSubjectTruth('or', ['F']), 'F');
});

test('excluded middle does not invent classified metadata', () => {
  assert.equal(composeSubjectTruth('or', ['U', composeSubjectTruth('not', ['U'])]), 'U');
});

test('composition does not mutate operands', () => {
  const operands = Object.freeze(['U', 'T', 'F']);
  composeSubjectTruth('and', operands);
  composeSubjectTruth('or', operands);
  assert.deepEqual(operands, ['U', 'T', 'F']);
});

test('invalid operators, arities and truth values refuse instead of becoming truth', () => {
  const cases = [
    ['xor', ['T', 'F']], [undefined, ['T']],
    ['not', []], ['not', ['T', 'F']], ['and', []], ['or', []],
    ['and', null], ['or', 'T'],
    ['and', ['F', 'invalid']], ['or', ['T', undefined]],
    ['not', [true]], ['not', [null]], ['and', new Array(1)],
  ];
  for (const [operator, operands] of cases) {
    assert.throws(() => composeSubjectTruth(operator, operands),
      (error) => error.code === 'invalid-truth-expression',
      `${operator}: ${JSON.stringify(operands)}`);
  }
});
