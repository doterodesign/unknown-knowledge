import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityIndex, resolveRecord, getIdentityIndexDescriptor } from '../payload/engine/lib/record-identity-index.js';
import { validateIdentityLedger } from '../payload/engine/lib/identity-ledger.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { createDocumentBudget, getDocumentBudgetUsage, guardCapturedDocument } from '../payload/engine/lib/document-budget.js';

const namespace = 'b4e15b6e-f1c9-4a3d-86fa-d05628402252';
const foreign = 'da6a05da-fbd3-4188-84df-6301458f3c53';
const ref = (id = 'D-000001', kind = 'decision') => ({ namespace, kind, id });
const locator = (file, path = '') => ({ file, path });
const allocation = (id = 'D-000001', kind = 'decision', state = 'allocated') => ({
  id, kind, state, publication: { id: foreign, review: 'review:publication' },
  ...(state === 'allocated' ? {} : { reason: 'reviewed terminal disposition' }),
});
const documentBudget = (maxDocumentNodes = 10000, maxDocumentTextUnits = 10000) =>
  createDocumentBudget({ maxDocumentNodes, maxDocumentTextUnits });
function input() {
  const file = 'decisions/entries/direction.yaml';
  return {
    identity: { 'schema-version': 1, 'identity-format': 1, namespace, allocations: [allocation()] },
    identitySource: locator('_identity.yaml'),
    records: [{ kind: 'decision', entry: { id: 'D-000001', file,
      record: { id: 'D-000001', status: 'accepted', title: 'Direction', subjects: [] } },
    locator: locator(file, 'entries[0]') }],
    declarations: [{ kind: 'decision', id: 'D-000001', target: file,
      locator: locator('decisions/_catalog.yaml', 'entries[0]') }],
  };
}

test('one record, catalog pointer and allocation corroborate a loaded typed identity', () => {
  const data = input();
  const result = resolveRecord(buildIdentityIndex(data), ref());
  assert.deepEqual(result, { status: 'loaded', ref: ref(), entry: data.records[0].entry });
  data.records[0].entry.record.status = 'archived';
  assert.equal(resolveRecord(buildIdentityIndex(data), ref()).status, 'loaded', 'archival does not retire identity');
});

test('declared-only, occupied-only and unknown IDs remain distinct and never invent a payload', () => {
  const data = input();
  data.records = [];
  assert.deepEqual(resolveRecord(buildIdentityIndex(data), ref()), {
    status: 'declared-only', ref: ref(), declarations: [{ target: data.declarations[0].target, locator: data.declarations[0].locator }],
  });
  data.declarations = [];
  assert.deepEqual(resolveRecord(buildIdentityIndex(data), ref()), { status: 'missing', ref: ref(), allocation: allocation() });
  assert.deepEqual(resolveRecord(buildIdentityIndex(data), ref('D-999999')), { status: 'missing', ref: ref('D-999999') });
});

test('retired or cancelled identities can retain the same historical payload without ambiguity', () => {
  for (const state of ['retired', 'cancelled']) {
    const data = input();
    data.identity.allocations[0] = allocation('D-000001', 'decision', state);
    assert.deepEqual(resolveRecord(buildIdentityIndex(data), ref()), {
      status: 'retired', ref: ref(), allocation: data.identity.allocations[0], entry: data.records[0].entry,
    });
    data.records = [];
    assert.deepEqual(resolveRecord(buildIdentityIndex(data), ref()), {
      status: 'retired', ref: ref(), allocation: data.identity.allocations[0],
    });
  }
});

test('competing record, catalog or allocation claims are ambiguous with deterministic real locators', () => {
  for (const category of ['records', 'declarations', 'allocations']) {
    const data = input();
    if (category === 'allocations') data.identity.allocations.push({ ...allocation(), publication: { id: namespace, review: 'review:competitor' } });
    else {
      const competing = structuredClone(data[category][0]);
      competing.locator = locator(category === 'records' ? 'decisions/entries/a.yaml' : 'decisions/another-catalog.yaml', 'entries[7]');
      if (category === 'records') competing.entry.file = competing.locator.file;
      data[category].push(competing);
    }
    const result = resolveRecord(buildIdentityIndex(data), ref());
    assert.equal(result.status, 'ambiguous');
    assert.equal(Object.hasOwn(result, 'entry'), false);
    assert.deepEqual(result.candidates.map((c) => c.source), ['allocation', ...(category === 'allocations' ? ['allocation'] : []),
      'catalog', ...(category === 'declarations' ? ['catalog'] : []), 'record', ...(category === 'records' ? ['record'] : [])]);
    assert.deepEqual(result.candidates[0].locator, locator('_identity.yaml', 'allocations[0]'));
    if (category !== 'allocations') {
      data[category].reverse();
      assert.deepEqual(resolveRecord(buildIdentityIndex(data), ref()), result);
    }
  }
});

test('raw references are closed, exact and namespace-qualified before lookup', () => {
  const index = buildIdentityIndex(input());
  for (const [value, reason] of [
    [null, 'invalid-ref'], [{ ...ref(), previousId: 'D-1' }, 'invalid-ref'],
    [ref('D-000001', 'decisions'), 'invalid-kind'], [ref('S-000001', 'subject'), 'invalid-kind'],
    [ref('D-1'), 'invalid-id'], [ref('D-000001\n'), 'invalid-id'], [ref('D-000001', 'knowledge'), 'invalid-id'],
    [{ ...ref(), namespace: namespace.toUpperCase() }, 'invalid-namespace'],
    [{ ...ref(), namespace: foreign }, 'namespace-mismatch'],
  ]) assert.deepEqual(resolveRecord(index, value), { status: 'invalid', ref: value, reason });
});

test('diagnosing duplicate allocations never makes the authoritative ledger valid', () => {
  const data = input();
  data.identity.allocations.push(allocation());
  const before = validateIdentityLedger(data.identity);
  assert.equal(before.ok, false);
  assert.ok(before.diagnostics.some(({ code }) => code === 'duplicate-allocation'));
  const index = buildIdentityIndex(data);
  assert.equal(resolveRecord(index, ref()).status, 'ambiguous');
  assert.equal(Object.hasOwn(index, 'ok'), false, 'a diagnostic index does not issue a model health verdict');
  assert.deepEqual(validateIdentityLedger(data.identity), before);
});

test('old K text has only its new Knowledge meaning after explicit format selection', () => {
  const data = input();
  data.identity.allocations.push(allocation('K-000001', 'knowledge'));
  data.records.push({ kind: 'knowledge', entry: { id: 'K-000001', record: { id: 'K-000001', heading: 'World evidence' } },
    locator: locator('knowledge/evidence.md') });
  const index = buildIdentityIndex(data);
  assert.equal(resolveRecord(index, ref('K-000001', 'knowledge')).entry.record.heading, 'World evidence');
  assert.equal(resolveRecord(index, ref('K-000001', 'ontology')).reason, 'invalid-id');
  assert.equal(resolveRecord(index, ref('L-000001', 'knowledge')).reason, 'invalid-id');
});

test('unallocated and contradictory catalog claims do not masquerade as loaded identities', () => {
  const data = input();
  data.identity.allocations = [];
  assert.equal(resolveRecord(buildIdentityIndex(data), ref()).reason, 'unallocated-record');
  data.identity.allocations = [allocation()];
  data.declarations[0].target = 'entries/direction.yaml';
  assert.equal(resolveRecord(buildIdentityIndex(data), ref()).reason, 'declaration-target-mismatch');
  data.declarations[0].target = 'pending-import';
  assert.equal(resolveRecord(buildIdentityIndex(data), ref()).reason, 'declaration-target-mismatch');
});

test('unsupported or malformed index inputs are operation failures, including alongside duplicate allocations', () => {
  const mutations = [
    (d) => { delete d.identitySource; }, (d) => { d.identity['identity-format'] = 0; },
    (d) => { d.identity.namespace += '\n'; }, (d) => { d.records = null; },
    (d) => { d.records[0].entry.record.id = 'D-000009'; },
    (d) => { d.records[0].entry.file = 'different.yaml'; },
    (d) => { d.declarations[0].id = 'D-1'; },
    (d) => { d.identity.allocations.push(allocation()); d.identity.previousIds = {}; },
    (d) => { d.records[0].entry.record.callback = () => {}; },
  ];
  for (const mutate of mutations) {
    const data = input();
    mutate(data);
    assert.throws(() => buildIdentityIndex(data), { name: 'IdentityOperationError' });
  }
  assert.throws(() => resolveRecord({}, ref()), { name: 'IdentityOperationError' });
});

test('the captured index is independent of input and returned payload/retirement mutations', () => {
  const data = input();
  const expected = structuredClone(data.records[0].entry);
  const index = buildIdentityIndex(data);
  data.records[0].entry.record.id = 'D-999999';
  data.records[0].entry.record.status = 'proposed';
  data.records[0].entry.record.subjects.push('S-000099');
  data.identity.allocations[0].state = 'retired';
  data.identity.allocations[0].reason = 'later change';
  data.declarations[0].target = 'different.yaml';
  const first = resolveRecord(index, ref());
  assert.deepEqual(first, { status: 'loaded', ref: ref(), entry: expected });
  first.entry.record.status = 'rejected';
  first.entry.record.subjects.push('S-000088');
  assert.deepEqual(resolveRecord(index, ref()), { status: 'loaded', ref: ref(), entry: expected });
  const retiredInput = input();
  retiredInput.identity.allocations[0] = allocation('D-000001', 'decision', 'retired');
  const retiredIndex = buildIdentityIndex(retiredInput);
  const retiredResult = resolveRecord(retiredIndex, ref());
  retiredResult.allocation.state = 'allocated';
  retiredResult.allocation.publication.review = 'changed output';
  assert.deepEqual(resolveRecord(retiredIndex, ref()).allocation, retiredInput.identity.allocations[0]);
});

test('the opaque index binds its captured full ledger digest without granting forgeable identity', () => {
  const data = input();
  const expected = canonicalSha256(data.identity);
  const index = buildIdentityIndex(data);
  assert.equal(index.identityDigest, expected);
  assert.throws(() => { index.identityDigest = 'changed'; }, TypeError);
  data.identity.allocations[0].publication.review = 'different-review';
  assert.notEqual(canonicalSha256(data.identity), index.identityDigest, 'same namespace is not the same ledger capture');
  assert.equal(index.identityDigest, expected, 'input mutation does not change the captured digest');
  const different = buildIdentityIndex(data);
  assert.notEqual(different.identityDigest, expected);
  assert.throws(() => resolveRecord({ ...index }, ref()), { code: 'invalid-model' });
});

test('renaming, moving and reclassifying a record preserve its exact canonical target', () => {
  const data = input();
  const original = resolveRecord(buildIdentityIndex(data), ref());
  data.records[0].entry.record.title = 'Renamed direction';
  data.records[0].entry.record.category = 'governance';
  const moved = 'decisions/entries/moved.yaml';
  data.records[0].entry.file = moved;
  data.records[0].locator.file = moved;
  data.declarations[0].target = moved;
  const result = resolveRecord(buildIdentityIndex(data), ref());
  assert.equal(result.status, 'loaded');
  assert.deepEqual(result.ref, original.ref);
  assert.equal(result.entry.file, moved);
  assert.equal(result.entry.record.title, 'Renamed direction');
});


test('descriptor access authenticates empty and populated private captures without exposing entries', () => {
  for (const empty of [false, true]) {
    const data = input();
    if (empty) { data.identity.allocations = []; data.records = []; data.declarations = []; }
    const index = buildIdentityIndex(data);
    const expected = { namespace: data.identity.namespace, identityFormat: 1, identityDigest: canonicalSha256(data.identity) };
    const descriptor = getIdentityIndexDescriptor(index);
    assert.deepEqual(descriptor, expected);
    assert.notEqual(descriptor, index);
    descriptor.namespace = 'changed';
    descriptor.identityDigest = 'changed';
    data.identity.namespace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    assert.deepEqual(getIdentityIndexDescriptor(index), expected);
    for (const fake of [null, undefined, 1, {}, { ...index }, descriptor]) {
      assert.throws(() => getIdentityIndexDescriptor(fake), { code: 'invalid-model' });
    }
  }
});

test('bounded resolution guards actual private bytes before cloning despite a smaller public record', (t) => {
  const data = input();
  data.records[0].entry.record.title = 'x'.repeat(1000);
  const index = buildIdentityIndex(data);
  data.records[0].entry.record.title = 'small public replacement';
  const clone = t.mock.method(globalThis, 'structuredClone');
  assert.throws(() => resolveRecord(index, ref(), { documentBudget: documentBudget(100, 100), phase: 'private-record' }),
    { code: 'document-budget-exhausted', counter: 'documentTextUnits', phase: 'private-record' });
  assert.equal(clone.mock.callCount(), 0, 'no recursive clone begins before the private guard passes');
  assert.equal(resolveRecord(index, ref()).entry.record.title.length, 1000, 'the two-argument API is unchanged');
});

test('one mixed-policy result walk charges each actual occurrence to the aggregate budget', () => {
  const data = input();
  data.records[0].entry = { record: { id: 'D-000001' }, notation: undefined };
  const index = buildIdentityIndex(data);
  const budget = documentBudget(20, 222);
  const options = { documentBudget: budget, phase: 'shared-lookup' };
  const expected = resolveRecord(index, ref());
  assert.deepEqual(resolveRecord(index, ref(), options), expected);
  // The full result includes the authored {id}: 10 nodes and 111 text units.
  assert.deepEqual(getDocumentBudgetUsage(budget), { documentNodes: 10, documentTextUnits: 111 });
  assert.deepEqual(resolveRecord(index, ref(), options), expected);
  assert.deepEqual(getDocumentBudgetUsage(budget), { documentNodes: 20, documentTextUnits: 222 });
  assert.throws(() => resolveRecord(index, ref(), options), { code: 'document-budget-exhausted' });
});

test('a first loaded or retired resolution fits one complete result walk before its unchanged clone', t => {
  for (const state of ['allocated', 'retired']) {
    const data = input();
    data.identity.allocations[0] = allocation('D-000001', 'decision', state);
    data.records[0].entry.record.title = 'x'.repeat(4096);
    data.records[0].entry.notation = undefined;
    const index = buildIdentityIndex(data), expected = resolveRecord(index, ref());
    const measured = documentBudget(10000, 10000);
    guardCapturedDocument(expected, measured, { phase: 'whole-result-oracle', allowUndefined: true });
    const { documentNodes, documentTextUnits } = getDocumentBudgetUsage(measured);
    const budget = documentBudget(documentNodes, documentTextUnits);
    const clone = t.mock.method(globalThis, 'structuredClone');
    try {
      assert.deepEqual(resolveRecord(index, ref(), { documentBudget: budget, phase: 'first-miss' }), expected);
      assert.deepEqual(getDocumentBudgetUsage(budget), getDocumentBudgetUsage(measured));
      assert.equal(clone.mock.callCount(), 1, 'full detached clone remains after successful admission');
    } finally { clone.mock.restore(); }
  }
});

test('bounded private authored records reject undefined and cycles before wrapper allowance or cloning', (t) => {
  for (const [mutate, code] of [
    [(record) => { record.authored = undefined; }, 'invalid-document'],
    [(record) => { record.self = record; }, 'cyclic-document'],
  ]) {
    const data = input(); mutate(data.records[0].entry.record);
    const index = buildIdentityIndex(data);
    const clone = t.mock.method(globalThis, 'structuredClone');
    assert.throws(() => resolveRecord(index, ref(), { documentBudget: documentBudget(), phase: 'authored' }), { code });
    assert.equal(clone.mock.callCount(), 0);
    clone.mock.restore();
  }
});

test('private array properties cannot bypass bounded cloning through authored data or wrapper metadata', (t) => {
  for (const location of ['authored', 'wrapper']) {
    const data = input();
    const array = [];
    array.extra = 'x'.repeat(1000000);
    if (location === 'authored') data.records[0].entry.record.subjects = array;
    else data.records[0].entry.metadata = array;
    const index = buildIdentityIndex(data);
    array.extra = 'small public replacement';
    const clone = t.mock.method(globalThis, 'structuredClone');
    try {
      assert.throws(() => resolveRecord(index, ref(), { documentBudget: documentBudget(100, 1000), phase: location }),
        { code: 'invalid-document' });
      assert.equal(clone.mock.callCount(), 0, `${location} array properties must refuse before copying`);
    } finally { clone.mock.restore(); }
    const entry = resolveRecord(index, ref()).entry;
    assert.equal((location === 'authored' ? entry.record.subjects : entry.metadata).extra.length, 1000000,
      'the unbudgeted API still returns its original private capture');
  }
});

test('every lookup outcome uses the authentic budget, including missing and invalid references', () => {
  const index = buildIdentityIndex(input());
  for (const value of [ref(), ref('D-999999'), null]) {
    for (const fake of [{}, { ...documentBudget() }, { guard() { assert.fail('a caller callback must never run'); } }, undefined]) {
      assert.throws(() => resolveRecord(index, value, { documentBudget: fake, phase: 'forged' }),
        { code: 'invalid-document-budget-handle' });
    }
    assert.throws(() => resolveRecord(index, value, { documentBudget: documentBudget(0), phase: 'empty' }),
      { code: 'document-budget-exhausted' });
  }
  const badRef = { ...ref(), extra: undefined };
  assert.equal(resolveRecord(index, badRef).status, 'invalid');
  assert.throws(() => resolveRecord(index, badRef, { documentBudget: documentBudget(), phase: 'invalid' }), { code: 'invalid-document' });
  for (const mutate of [
    (data) => { data.identity.allocations[0] = allocation('D-000001', 'decision', 'retired'); },
    (data) => { data.records = []; },
    (data) => { data.records = []; data.declarations = []; },
    (data) => { data.records.push(structuredClone(data.records[0])); },
  ]) {
    const data = input(); mutate(data);
    const changed = buildIdentityIndex(data);
    assert.deepEqual(resolveRecord(changed, ref(), { documentBudget: documentBudget(), phase: 'other-status' }), resolveRecord(changed, ref()));
    assert.throws(() => resolveRecord(changed, ref(), { documentBudget: documentBudget(0), phase: 'other-status' }),
      { code: 'document-budget-exhausted' });
  }
});
