import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCanonicalId, parseProposalKey, iterateCurrentRecords } from '../payload/engine/lib/record-identity.js';

const kinds = { knowledge: 'K', ontology: 'O', decision: 'D', subject: 'S' };
const uuid = 'e8ba2f20-1d77-4f95-a30c-8f447acc1dc3';

test('canonical identities accept exactly the first and last occupied slots in each kind', () => {
  for (const [kind, prefix] of Object.entries(kinds)) {
    for (const suffix of ['000001', '999999']) {
      const id = `${prefix}-${suffix}`;
      assert.deepEqual(parseCanonicalId(kind, id), { ok: true, kind, id });
    }
  }
});

const namespace = 'b4e15b6e-f1c9-4a3d-86fa-d05628402252';
function currentModel() {
  return {
    ok: true,
    identity: { 'identity-format': 1, namespace },
    stores: { knowledge: { present: true }, ontology: { present: true }, decisions: { present: true } },
    leaves: new Map([
      ['K-000002', { id: 'K-000002', identity: 'K-000002', record: { id: 'K-000002', subjects: [] } }],
      ['K-000001', { id: 'K-000001', identity: 'K-000001', record: { id: 'K-000001' } }],
    ]),
    concepts: new Map([['O-000001', { id: 'O-000001', record: { id: 'O-000001', term: 'Source' } }]]),
    decisions: new Map([['D-000001', { id: 'D-000001', record: { id: 'D-000001', status: 'archived' } }]]),
  };
}

test('current records preserve qualified identity, original payloads, and missing versus empty assignments', () => {
  const model = currentModel();
  const rows = [...iterateCurrentRecords(model, { kinds: ['ontology', 'knowledge', 'decision'] })];
  assert.deepEqual(rows.map(({ ref }) => ref), [
    { namespace, kind: 'decision', id: 'D-000001' },
    { namespace, kind: 'knowledge', id: 'K-000001' },
    { namespace, kind: 'knowledge', id: 'K-000002' },
    { namespace, kind: 'ontology', id: 'O-000001' },
  ]);
  assert.equal(rows[0].entry, model.decisions.get('D-000001'), 'archived is loaded identity, not retirement');
  assert.equal(rows[1].entry, model.leaves.get('K-000001'));
  assert.equal(Object.hasOwn(rows[1].entry.record, 'subjects'), false);
  assert.equal(rows[2].entry.record.subjects, model.leaves.get('K-000002').record.subjects);
  assert.deepEqual(rows[2].entry.record.subjects, []);
});

test('current record selection must explicitly name unique content kinds', () => {
  for (const options of [undefined, null, {}, { kinds: [] }, { kinds: ['subject'] }, { kinds: ['knowledge', 'knowledge'] },
    { kinds: 'knowledge' }, { kinds: ['decisions'] }]) {
    assert.throws(() => [...iterateCurrentRecords(currentModel(), options)], { code: 'invalid-selection' });
  }
});

test('current record coverage distinguishes an absent selected store from a loaded empty store', () => {
  const model = currentModel();
  model.stores.ontology.present = false;
  model.concepts = new Map();
  assert.equal([...iterateCurrentRecords(model, { kinds: ['decision'] })].length, 1);
  assert.throws(() => [...iterateCurrentRecords(model, { kinds: ['ontology'] })], { code: 'unavailable-store' });
  model.stores.ontology.present = true;
  assert.deepEqual([...iterateCurrentRecords(model, { kinds: ['ontology'] })], []);
});

test('unhealthy, unsupported and malformed model inputs cannot appear as an empty universe', () => {
  const cases = [
    [null, 'invalid-model'],
    [{ ...currentModel(), ok: false }, 'invalid-model'],
    [{ ...currentModel(), identity: null }, 'unsupported-identity-format'],
    [{ ...currentModel(), identity: { 'identity-format': 2, namespace } }, 'unsupported-identity-format'],
    [{ ...currentModel(), identity: { 'identity-format': 1, namespace: namespace + '\n' } }, 'invalid-namespace'],
    [{ ...currentModel(), leaves: [] }, 'invalid-model'],
  ];
  for (const [model, code] of cases) {
    assert.throws(() => [...iterateCurrentRecords(model, { kinds: ['knowledge'] })], { code });
  }
});

test('a late invalid selected identity refuses before any record can be yielded', () => {
  for (const entry of [
    { id: 'K-000003', record: { id: 'K-000099' } },
    { id: 'K-000099', record: { id: 'K-000003' } },
    { identity: 'K-000099', record: { id: 'K-000003' } },
    { id: 'K-000003', record: null },
  ]) {
    const model = currentModel();
    model.leaves.set('K-000003', entry);
    let delivered = 0;
    assert.throws(() => {
      for (const row of iterateCurrentRecords(model, { kinds: ['knowledge'] })) delivered += 1;
    }, { code: 'invalid-record' });
    assert.equal(delivered, 0);
  }
  const model = currentModel();
  model.leaves.set('L-000003', { id: 'L-000003', record: { id: 'L-000003' } });
  assert.throws(() => [...iterateCurrentRecords(model, { kinds: ['knowledge'] })], { code: 'invalid-record' });
});

test('canonical parsing rejects reserved, malformed and non-exact identities without coercion', () => {
  for (const [kind, prefix] of Object.entries(kinds)) {
    const id = `${prefix}-000001`;
    const invalid = [
      `${prefix}-000000`, `${prefix}-1`, `${prefix}-00001`, `${prefix}-1000000`,
      `${prefix}-+00001`, `${prefix}-0000.1`, `${prefix}-０００００１`,
      id.toLowerCase(), ` ${id}`, `${id} `, `${id}\n`, `${id}\r\n`, `${id}\u2028`,
      `${id}\0`, `${id}x`, '', null, undefined, 1, new String(id),
      { toString() { throw new Error('must not coerce'); } },
    ];
    for (const value of invalid) {
      assert.deepEqual(parseCanonicalId(kind, value), { ok: false, code: 'invalid-id' });
    }
    for (const other of Object.values(kinds).filter((p) => p !== prefix)) {
      assert.deepEqual(parseCanonicalId(kind, `${other}-000001`), { ok: false, code: 'invalid-id' });
    }
  }
});

test('kind validation is explicit and never accepts inherited property names', () => {
  for (const kind of ['concepts', 'decisions', 'K', 'toString', '__proto__', '', null, 1]) {
    assert.deepEqual(parseCanonicalId(kind, 'K-000001'), { ok: false, code: 'invalid-kind' });
    assert.deepEqual(parseProposalKey(kind, `proposal:knowledge:${uuid}`), { ok: false, code: 'invalid-kind' });
  }
});

test('proposal keys use their exact full kind and lowercase v4 UUID outside canonical space', () => {
  for (const kind of Object.keys(kinds)) {
    const id = `proposal:${kind}:${uuid}`;
    assert.deepEqual(parseProposalKey(kind, id), { ok: true, kind, id });
    assert.deepEqual(parseCanonicalId(kind, id), { ok: false, code: 'invalid-id' });
    assert.deepEqual(parseProposalKey(kind, `${kinds[kind]}-000001`), { ok: false, code: 'invalid-id' });
    for (const value of [
      `proposal:${kind}:${uuid.toUpperCase()}`, `proposal:${kind}:${uuid.replace('-4f95-', '-1f95-')}`,
      `proposal:${kind}:${uuid.replace('-a30c-', '-730c-')}`, id + '\n', ` ${id}`, id + ' ',
      `P-${uuid}`, `proposal:concepts:${uuid}`, null, 1,
    ]) assert.deepEqual(parseProposalKey(kind, value), { ok: false, code: 'invalid-id' });
    for (const other of Object.keys(kinds).filter((k) => k !== kind)) {
      assert.deepEqual(parseProposalKey(kind, `proposal:${other}:${uuid}`), { ok: false, code: 'invalid-id' });
    }
  }
});
