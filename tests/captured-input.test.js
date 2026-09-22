import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CapturedInputError } from '../payload/engine/lib/canonical-json.js';
import { iterateCurrentRecords, iterateProposalRecords } from '../payload/engine/lib/record-identity.js';
import {
  fingerprintCapturedInputs, fingerprintMetadata, fingerprintQueryInputs,
} from '../payload/engine/lib/captured-input.js';

const namespace = 'e8ba2f20-1d77-4f95-a30c-8f447acc1dc3';
const hash = (literal) => createHash('sha256').update(literal).digest('hex');
const registry = { schemaVersion: 1, namespace, revision: 2, hierarchyRevision: 1, subjects: [] };
const row = (id, body = 'evidence') => ({
  ref: { namespace, kind: 'knowledge', id },
  entry: { file: `${id}.md`, record: { id, subjects: [] }, body },
});

test('captured digests match independently written canonical bytes, including source contents', () => {
  const actual = fingerprintCapturedInputs({ namespace, records: [row('K-000001')], registry });
  const records = '[{"entry":{"body":"evidence","file":"K-000001.md","record":{"id":"K-000001","subjects":[]}},"ref":{"id":"K-000001","kind":"knowledge","namespace":"e8ba2f20-1d77-4f95-a30c-8f447acc1dc3"}}]';
  const subjects = '{"hierarchyRevision":1,"namespace":"e8ba2f20-1d77-4f95-a30c-8f447acc1dc3","revision":2,"schemaVersion":1,"subjects":[]}';
  assert.deepEqual(actual, {
    version: 1, consistency: 'captured-model', namespace,
    inputs: { records: hash(records), registry: hash(subjects) },
  });
});

test('qualified record order and object key order do not affect digests or mutate inputs', () => {
  const records = [row('K-000002'), row('K-000001')];
  const before = structuredClone(records);
  const first = fingerprintCapturedInputs({ namespace, records, registry });
  const reorderedRegistry = { subjects: [], hierarchyRevision: 1, revision: 2, namespace, schemaVersion: 1 };
  const second = fingerprintCapturedInputs({ namespace, records: [...records].reverse(), registry: reorderedRegistry });
  assert.deepEqual(first, second);
  assert.deepEqual(records, before);
});

test('payload, source locator, governance and authored array changes invalidate captured digests', () => {
  const original = { namespace, records: [row('K-000001')], registry: { ...registry, history: ['review-a', 'review-b'] } };
  const baseline = fingerprintCapturedInputs(original);
  for (const change of [
    (input) => { input.records[0].entry.body = 'changed evidence'; },
    (input) => { input.records[0].entry.file = 'moved.md'; },
    (input) => { input.registry.history.reverse(); },
    (input) => { input.registry.review = { decision: 'D-000001', material: 'review.md' }; },
  ]) {
    const input = structuredClone(original);
    change(input);
    assert.notDeepEqual(fingerprintCapturedInputs(input).inputs, baseline.inputs);
  }
});

test('metadata binds versions, route order, options and rendered date without including itself', () => {
  const base = {
    ...fingerprintCapturedInputs({ namespace, records: [], registry }),
    versions: { generator: 1, normalizer: 1 },
    revisions: { registry: 2, hierarchy: 1 },
    options: { route: ['S-000001', 'S-000002'], view: 'all' },
  };
  const first = fingerprintMetadata(base);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(fingerprintMetadata({ ...base, options: { view: 'all', route: ['S-000001', 'S-000002'] } }), first);
  for (const change of [
    { versions: { ...base.versions, generator: 2 } },
    { options: { ...base.options, route: ['S-000002', 'S-000001'] } },
    { today: '2026-09-18' },
  ]) assert.notEqual(fingerprintMetadata({ ...base, ...change }), first);
  assert.throws(() => fingerprintMetadata({ ...base, fingerprint: first }), /fingerprint/);
});

test('non-JSON authority is refused rather than hashed as empty or silently truncated', () => {
  const cycle = {};
  cycle.self = cycle;
  for (const invalid of [undefined, NaN, Infinity, 1n, () => {}, new Map(), new Date(), cycle, [, 1]]) {
    assert.throws(() => fingerprintCapturedInputs({
      namespace, records: [], registry: { ...registry, extension: invalid },
    }), /serializable|JSON|cyclic/);
  }
});

test('duplicate or invalid qualified identities cannot form an apparently valid capture', () => {
  for (const records of [
    [row('K-000001'), row('K-000001')],
    [row('K-1')],
    [{ ...row('K-000001'), ref: { namespace, kind: 'ontology', id: 'K-000001' } }],
    [{ ...row('K-000001'), ref: { namespace: 'foreign', kind: 'knowledge', id: 'K-000001' } }],
  ]) assert.throws(() => fingerprintCapturedInputs({ namespace, records, registry }), /identity|namespace|duplicate/);
  assert.throws(() => fingerprintCapturedInputs({ namespace, records: [], registry: { ...registry, namespace: 'foreign' } }), /namespace/);
});

test('a loader leaf without optional display notation hashes its authoritative payload', () => {
  const minimal = row('K-000001');
  // loadLeafFiles creates these wrapper aliases even when notation is absent.
  const loaded = {
    ref: minimal.ref,
    entry: {
      identity: minimal.entry.record.id,
      id: minimal.entry.record.id,
      notation: minimal.entry.record.notation,
      file: minimal.entry.file,
      record: minimal.entry.record,
      body: minimal.entry.body,
    },
  };
  const actual = fingerprintCapturedInputs({ namespace, records: [loaded], registry });
  assert.deepEqual(actual, fingerprintCapturedInputs({ namespace, records: [minimal], registry }));
  assert.equal(Object.hasOwn(loaded.entry, 'notation'), true);
  assert.equal(loaded.entry.notation, undefined);
});

test('capture refuses a typed ref inconsistent with the authoritative record identity', () => {
  const mismatched = row('K-000001');
  mismatched.entry.record.id = 'K-000002';
  assert.throws(() => fingerprintCapturedInputs({ namespace, records: [mismatched], registry }), /identity/);
});

test('authored undefined is invalid, while only disposable wrapper fields are excluded', () => {
  const base = row('K-000001');
  for (const record of [
    { ...base.entry.record, subjects: undefined },
    { ...base.entry.record, notation: undefined },
    { ...base.entry.record, extension: { value: undefined } },
  ]) assert.throws(() => fingerprintCapturedInputs({
    namespace, records: [{ ...base, entry: { ...base.entry, record } }], registry,
  }), /JSON serializable/);
  const derived = { ...base, entry: { ...base.entry, reverseIndex: new Map([['ignored', 1]]) } };
  assert.deepEqual(
    fingerprintCapturedInputs({ namespace, records: [derived], registry }),
    fingerprintCapturedInputs({ namespace, records: [base], registry }),
  );
});

const proposal = (suffix = 'a', body = 'draft evidence') => {
  const key = `proposal:knowledge:12345678-1234-4234-8234-123456789ab${suffix}`;
  return {
    proposalRef: { namespace, kind: 'knowledge', key },
    entry: { id: key, file: `draft-${suffix}.md`, record: { id: key, subjects: [] }, body },
  };
};

test('query capture explicitly binds proposals in a separate versioned identity space', () => {
  const item = proposal();
  const captured = fingerprintQueryInputs({ namespace, records: [row('K-000001')], proposals: [item], registry });
  const literal = '[{"entry":{"body":"draft evidence","file":"draft-a.md","record":{"id":"proposal:knowledge:12345678-1234-4234-8234-123456789aba","subjects":[]}},"proposalRef":{"key":"proposal:knowledge:12345678-1234-4234-8234-123456789aba","kind":"knowledge","namespace":"e8ba2f20-1d77-4f95-a30c-8f447acc1dc3"}}]';
  const canonical = fingerprintCapturedInputs({ namespace, records: [row('K-000001')], registry });
  assert.deepEqual(captured, {
    ...canonical, version: 2, inputScope: 'records-and-proposals',
    inputs: { ...canonical.inputs, proposals: hash(literal) },
  });
  assert.equal(canonical.version, 1);
  assert.equal(Object.hasOwn(canonical.inputs, 'proposals'), false);
});

test('missing proposal capture refuses while an explicit captured empty set has its own digest', () => {
  for (const proposals of [undefined, null, {}]) assert.throws(() => fingerprintQueryInputs({
    namespace, records: [], proposals, registry,
  }), /proposals/);
  const empty = fingerprintQueryInputs({ namespace, records: [], proposals: [], registry });
  assert.equal(empty.inputs.proposals, hash('[]'));
});

test('proposal ordering is stable and full payload changes alter the proposal digest only', () => {
  const a = proposal('a');
  const b = proposal('b');
  const inputs = { namespace, records: [row('K-000001')], registry };
  const first = fingerprintQueryInputs({ ...inputs, proposals: [a, b] });
  assert.deepEqual(fingerprintQueryInputs({ ...inputs, proposals: [b, a] }), first);
  const changed = fingerprintQueryInputs({ ...inputs, proposals: [proposal('a', 'changed evidence'), b] });
  assert.notEqual(changed.inputs.proposals, first.inputs.proposals);
  assert.equal(changed.inputs.records, first.inputs.records);
  assert.equal(changed.inputs.registry, first.inputs.registry);
});

test('proposal capture validates exact kind, namespace, identity agreement and authored values', () => {
  const valid = proposal();
  for (const proposals of [
    [valid, valid],
    [{ ...valid, proposalRef: { ...valid.proposalRef, key: 'K-000001' } }],
    [{ ...valid, proposalRef: { ...valid.proposalRef, kind: 'ontology' } }],
    [{ ...valid, proposalRef: { ...valid.proposalRef, namespace: 'foreign' } }],
    [{ ...valid, entry: { ...valid.entry, record: { ...valid.entry.record, id: proposal('b').proposalRef.key } } }],
    [{ ...valid, entry: { ...valid.entry, record: { ...valid.entry.record, subjects: undefined } } }],
  ]) assert.throws(() => fingerprintQueryInputs({ namespace, records: [], proposals, registry }));
  assert.throws(() => fingerprintCapturedInputs({ namespace, records: [valid], registry }), /namespace/);
});

test('real identity iterators feed query capture without erasing unavailable proposals', () => {
  const current = row('K-000001');
  const draft = proposal();
  const model = {
    ok: true, identity: { 'identity-format': 1, namespace },
    stores: { knowledge: { present: true } },
    leaves: new Map([[current.ref.id, {
      ...current.entry, id: current.ref.id, identity: current.ref.id, notation: undefined,
    }]]),
    proposals: { knowledge: new Map([[draft.proposalRef.key, {
      ...draft.entry, identity: draft.proposalRef.key, notation: undefined,
    }]]) },
  };
  const capture = () => fingerprintQueryInputs({
    namespace: model.identity.namespace,
    records: iterateCurrentRecords(model, { kinds: ['knowledge'] }),
    proposals: iterateProposalRecords(model, { kinds: ['knowledge'] }),
    registry,
  });
  const baseline = capture();
  assert.deepEqual(baseline, fingerprintQueryInputs({
    namespace, records: [current], proposals: [draft], registry,
  }));
  model.proposals.knowledge.get(draft.proposalRef.key).body = 'revised draft';
  const revised = capture();
  assert.notEqual(revised.inputs.proposals, baseline.inputs.proposals);
  assert.equal(revised.inputs.records, baseline.inputs.records);
  assert.equal(revised.inputs.registry, baseline.inputs.registry);
  model.proposals.knowledge.clear();
  assert.equal(capture().inputs.proposals, hash('[]'));
  delete model.proposals.knowledge;
  assert.throws(capture, { code: 'unavailable-proposals' });
  delete model.proposals;
  assert.throws(capture, { code: 'unavailable-proposals' });
});

test('capture validation exposes typed refusals without wrapping unexpected iterator failures', () => {
  const canonical = (records) => fingerprintCapturedInputs({ namespace, records, registry });
  for (const reject of [
    () => canonical([row('K-1')]),
    () => canonical([row('K-000001'), row('K-000001')]),
    () => canonical([{ ...row('K-000001'), entry: { record: { id: 'K-000002' } } }]),
    () => fingerprintCapturedInputs({ namespace: 'invalid', records: [], registry }),
    () => fingerprintMetadata({ fingerprint: 'self' }),
    () => fingerprintQueryInputs({ namespace, records: [], registry }),
    () => fingerprintQueryInputs({ namespace, records: [], registry, proposals: [proposal(), proposal()] }),
  ]) assert.throws(reject, (error) => {
    assert.ok(error instanceof TypeError);
    assert.ok(error instanceof CapturedInputError);
    assert.equal(error.name, 'CapturedInputError');
    assert.equal(error.code, 'invalid-captured-input');
    return true;
  });
  const bug = new TypeError('unexpected iterator failure');
  assert.throws(() => canonical({ [Symbol.iterator]() { throw bug; } }), (error) => error === bug);
});
