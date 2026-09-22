import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentBudget, guardCapturedDocument, guardCapturedRecordResult,
  getDocumentBudgetUsage, getDocumentBudgetFailure } from '../payload/engine/lib/document-budget.js';

const limits = { maxDocumentNodes: 100, maxDocumentTextUnits: 100 };
test('one authentic document budget counts repeated expanded values and UTF-16 text across calls', () => {
  const handle = createDocumentBudget(limits);
  const alias = { x: '😀' };
  guardCapturedDocument([alias, alias], handle, { phase: 'aliases' });
  assert.deepEqual(getDocumentBudgetUsage(handle), { documentNodes: 5, documentTextUnits: 6 });
  guardCapturedDocument('a', handle, { phase: 'second' });
  assert.deepEqual(getDocumentBudgetUsage(handle), { documentNodes: 6, documentTextUnits: 7 });
  const usage = getDocumentBudgetUsage(handle); usage.documentNodes = 0;
  assert.equal(getDocumentBudgetUsage(handle).documentNodes, 6);
  for (const fake of [{}, { ...handle }, { guard() { throw new Error('must not invoke'); } }]) {
    assert.throws(() => guardCapturedDocument(null, fake, { phase: 'forged' }), { code: 'invalid-document-budget-handle' });
  }
});
test('document limits debit before work and preserve exact counter/phase without integer overflow', () => {
  const handle = createDocumentBudget({ maxDocumentNodes: 2, maxDocumentTextUnits: 2 });
  guardCapturedDocument('😀', handle, { phase: 'first' });
  assert.throws(() => guardCapturedDocument('x', handle, { phase: 'second' }),
    { code: 'document-budget-exhausted', counter: 'documentTextUnits', phase: 'second' });
  assert.deepEqual(getDocumentBudgetUsage(handle), { documentNodes: 2, documentTextUnits: 2 });
  assert.throws(() => guardCapturedDocument(null, handle, { phase: 'third' }),
    { code: 'document-budget-exhausted', counter: 'documentTextUnits', phase: 'second' });
  const large = createDocumentBudget({ maxDocumentNodes: Number.MAX_SAFE_INTEGER, maxDocumentTextUnits: Number.MAX_SAFE_INTEGER });
  guardCapturedDocument(null, large, { phase: 'large' });
  assert.equal(getDocumentBudgetUsage(large).documentNodes, 1);
});
test('iterative visitor rejects ancestor cycles, distinguishes aliases, and allows wrapper undefined only explicitly', () => {
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => guardCapturedDocument(cyclic, createDocumentBudget(limits), { phase: 'cycle' }), { code: 'cyclic-document' });
  assert.throws(() => guardCapturedDocument({ notation: undefined }, createDocumentBudget(limits), { phase: 'authored' }), { code: 'invalid-document' });
  const wrapper = createDocumentBudget(limits);
  guardCapturedDocument({ notation: undefined }, wrapper, { phase: 'wrapper', allowUndefined: true });
  assert.deepEqual(getDocumentBudgetUsage(wrapper), { documentNodes: 2, documentTextUnits: 8 });
  let deep = null;
  for (let i = 0; i < 20000; i++) deep = [deep];
  const handle = createDocumentBudget({ maxDocumentNodes: 20001, maxDocumentTextUnits: 0 });
  guardCapturedDocument(deep, handle, { phase: 'deep' });
  assert.equal(getDocumentBudgetUsage(handle).documentNodes, 20001);
});
test('document budgets reject missing, extra, fractional, negative and unsafe limits', () => {
  for (const bad of [undefined, {}, { ...limits, extra: 1 }, { ...limits, maxDocumentNodes: -1 },
    { ...limits, maxDocumentNodes: 0.1 }, { ...limits, maxDocumentTextUnits: Infinity },
    { ...limits, maxDocumentTextUnits: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => createDocumentBudget(bad), { code: 'invalid-document-budget' });
  }
  const handle = createDocumentBudget({ maxDocumentNodes: 0, maxDocumentTextUnits: 0 });
  assert.throws(() => guardCapturedDocument(null, handle, { phase: 'zero' }), { code: 'document-budget-exhausted' });
});

test('array extra properties cannot hide copied data outside the declared document budget', () => {
  const array = []; array.extra = 'x'.repeat(1000000);
  assert.equal(structuredClone(array).extra.length, 1000000);
  const handle = createDocumentBudget({ maxDocumentNodes: 1, maxDocumentTextUnits: 0 });
  assert.throws(() => guardCapturedDocument(array, handle, { phase: 'array-extra' }), { code: 'invalid-document' });
});
test('guards never execute a custom iterator or accessor to inspect a different graph from native copying', () => {
  let called = false;
  const array = [1];
  array[Symbol.iterator] = function* () { called = true; };
  assert.throws(() => guardCapturedDocument(array, createDocumentBudget(limits), { phase: 'iterator' }), { code: 'invalid-document' });
  assert.equal(called, false);
  for (const value of [{}, []]) {
    Object.defineProperty(value, Array.isArray(value) ? '0' : 'x', { enumerable: true, get() { called = true; return 1; } });
    assert.throws(() => guardCapturedDocument(value, createDocumentBudget(limits), { phase: 'getter' }), { code: 'invalid-document' });
    assert.equal(called, false);
  }
  assert.throws(() => guardCapturedDocument(new Array(4), createDocumentBudget(limits), { phase: 'sparse' }), { code: 'invalid-document' });
});

test('record result policy visits every wrapper field while keeping authored descendants strict', () => {
  const value = { status: 'loaded', ref: { id: 'D-000001' },
    entry: { notation: undefined, record: { id: 'D-000001', nested: [{ text: '😀' }] }, body: 'tail' }, extra: 'visited' };
  const actual = createDocumentBudget({ maxDocumentNodes: 1000, maxDocumentTextUnits: 1000 });
  const reference = createDocumentBudget({ maxDocumentNodes: 1000, maxDocumentTextUnits: 1000 });
  guardCapturedDocument(value, reference, { phase: 'reference', allowUndefined: true });
  guardCapturedRecordResult(value, actual, { phase: 'mixed' });
  assert.deepEqual(getDocumentBudgetUsage(actual), getDocumentBudgetUsage(reference));
  value.entry.record.nested[0].bad = undefined;
  assert.throws(() => guardCapturedRecordResult(value, createDocumentBudget(limits), { phase: 'strict-descendant' }),
    { code: 'invalid-document' });
});

test('missing, hidden, accessor and nonobject wrapper slots cannot hide the authored subtree', () => {
  let getters = 0;
  const getterEntry = {}; Object.defineProperty(getterEntry, 'entry', { enumerable: true, get() { getters++; return { record: {} }; } });
  const getterRecord = {}; Object.defineProperty(getterRecord, 'record', { enumerable: true, get() { getters++; return {}; } });
  const hiddenEntry = {}; Object.defineProperty(hiddenEntry, 'entry', { value: { record: {} } });
  const hiddenRecord = {}; Object.defineProperty(hiddenRecord, 'record', { value: {} });
  for (const value of [{ entry: null }, { entry: 1 }, { entry: [] }, { entry: undefined },
    { entry: {} }, { entry: { record: undefined } }, getterEntry, { entry: getterRecord },
    hiddenEntry, { entry: hiddenRecord }]) {
    assert.throws(() => guardCapturedRecordResult(value, createDocumentBudget(limits), { phase: 'slot' }),
      { code: 'invalid-document' });
  }
  assert.equal(getters, 0);
});

test('alias occurrences retain path-specific strictness rather than an object-level exemption', () => {
  for (const alias of [{ bad: undefined }, { nested: [{ bad: undefined }] }]) {
    const value = { bookkeeping: alias, entry: { record: { alias } } };
    assert.throws(() => guardCapturedRecordResult(value, createDocumentBudget(limits), { phase: 'alias-strict' }),
      { code: 'invalid-document' });
  }
  const alias = { x: '😀' }, value = { bookkeeping: alias, entry: { record: { a: alias, b: alias } } };
  const actual = createDocumentBudget(limits), reference = createDocumentBudget(limits);
  guardCapturedRecordResult(value, actual, { phase: 'aliases' });
  guardCapturedDocument(value, reference, { phase: 'expanded' });
  assert.deepEqual(getDocumentBudgetUsage(actual), getDocumentBudgetUsage(reference));
  assert.equal(getDocumentBudgetUsage(actual).documentNodes, 9);
});

test('mixed traversal preserves cycles, prototypes, symbols and array shape refusals in either region', () => {
  const cycle = {}; cycle.self = cycle;
  const extra = []; extra.hiddenPayload = 'x';
  const symbol = { [Symbol('payload')]: 'x' };
  let getters = 0;
  const getter = {}; Object.defineProperty(getter, 'x', { enumerable: true, get() { getters++; return 'x'; } });
  for (const [invalid, code] of [[cycle, 'cyclic-document'], [new Date(), 'invalid-document'],
    [Object.create({ inherited: 'x' }), 'invalid-document'], [symbol, 'invalid-document'],
    [extra, 'invalid-document'], [new Array(1), 'invalid-document'], [getter, 'invalid-document']]) {
    for (const value of [{ extra: invalid, entry: { record: {} } }, { entry: { record: { invalid } } }]) {
      assert.throws(() => guardCapturedRecordResult(value, createDocumentBudget(limits), { phase: 'invalid' }), { code });
    }
  }
  assert.equal(getters, 0);
  const cross = { entry: { record: {} } }; cross.entry.record.root = cross;
  assert.throws(() => guardCapturedRecordResult(cross, createDocumentBudget(limits), { phase: 'cross-cycle' }), { code: 'cyclic-document' });
});

test('no-entry results remain strict and authentic handles and named phases remain mandatory', () => {
  const value = { status: 'missing', ref: { id: 'D-000001' } };
  const actual = createDocumentBudget(limits), reference = createDocumentBudget(limits);
  guardCapturedRecordResult(value, actual, { phase: 'missing' });
  guardCapturedDocument(value, reference, { phase: 'strict' });
  assert.deepEqual(getDocumentBudgetUsage(actual), getDocumentBudgetUsage(reference));
  assert.throws(() => guardCapturedRecordResult({ ...value, ignored: undefined }, actual,
    { phase: 'no-entry', allowUndefined: true }), { code: 'invalid-document' });
  for (const fake of [{}, { ...actual }, undefined]) {
    assert.throws(() => guardCapturedRecordResult(value, fake, { phase: 'forged' }), { code: 'invalid-document-budget-handle' });
  }
  for (const phase of [undefined, '', ' ', 1]) {
    assert.throws(() => guardCapturedRecordResult(value, actual, { phase }), TypeError);
  }
});

test('every mixed-guard debit boundary is sticky across malformed inputs and ordinary guards', () => {
  const value = { prefix: 'ab', entry: { notation: undefined, record: { id: 'cd', deep: ['ef'] } }, tail: 'gh' };
  const reference = createDocumentBudget(limits);
  guardCapturedRecordResult(value, reference, { phase: 'complete' });
  const usage = getDocumentBudgetUsage(reference);
  for (const [counter, limit] of [['documentNodes', 'maxDocumentNodes'], ['documentTextUnits', 'maxDocumentTextUnits']]) {
    for (let cap = 0; cap < usage[counter]; cap++) {
      const budget = createDocumentBudget({ ...limits, [limit]: cap });
      assert.throws(() => guardCapturedRecordResult(value, budget, { phase: 'first' }),
        { code: 'document-budget-exhausted', counter, phase: 'first' });
      const failure = getDocumentBudgetFailure(budget), used = getDocumentBudgetUsage(budget);
      assert.ok(used[counter] <= cap);
      assert.throws(() => guardCapturedRecordResult({ entry: null }, budget, { phase: 'malformed-later' }),
        { code: 'document-budget-exhausted', phase: 'first' });
      assert.throws(() => guardCapturedDocument(null, budget, { phase: 'ordinary-later' }),
        { code: 'document-budget-exhausted', phase: 'first' });
      assert.deepEqual(getDocumentBudgetFailure(budget), failure);
      assert.deepEqual(getDocumentBudgetUsage(budget), used);
    }
  }
});

test('wrapper-order admission can refuse before authored data without pretending old error ordering', () => {
  const value = { prefix: 'abc', entry: { record: { bad: undefined } } };
  const early = createDocumentBudget({ maxDocumentNodes: 100, maxDocumentTextUnits: 6 });
  assert.throws(() => guardCapturedRecordResult(value, early, { phase: 'ordered' }),
    { code: 'document-budget-exhausted', counter: 'documentTextUnits', attempted: 3, remaining: 0 });
  assert.deepEqual(getDocumentBudgetUsage(early), { documentNodes: 2, documentTextUnits: 6 });
  assert.throws(() => guardCapturedRecordResult(value, createDocumentBudget(limits), { phase: 'ordered' }),
    { code: 'invalid-document' });
});

test('deep strict authored descendants use the iterative visitor without recursion', () => {
  let deep = null;
  for (let i = 0; i < 20000; i++) deep = [deep];
  const budget = createDocumentBudget({ maxDocumentNodes: 20003, maxDocumentTextUnits: 11 });
  guardCapturedRecordResult({ entry: { record: deep } }, budget, { phase: 'deep' });
  assert.deepEqual(getDocumentBudgetUsage(budget), { documentNodes: 20003, documentTextUnits: 11 });
});
