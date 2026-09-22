import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectSubjectQueryRecords } from '../payload/engine/lib/subject-query.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const proposalKey = 'proposal:knowledge:11111111-1111-4111-8111-111111111111';
const makeEntry = (id, fields = {}) => ({ id, file: `records/${id}.yaml`, record: { id, ...fields } });
function model() {
  return {
    ok: true, identity: { 'identity-format': 1, namespace },
    stores: { knowledge: { present: true }, ontology: { present: true }, decisions: { present: true } },
    leaves: new Map([
      ['K-000002', makeEntry('K-000002', { facets: { stage: 'draft' } })],
      ['K-000001', makeEntry('K-000001', { facets: { stage: 'verified' }, verified: '2000-01-01' })],
      ['K-000003', makeEntry('K-000003', { facets: { stage: 'proposed' } })],
    ]),
    concepts: new Map([
      ['O-000002', makeEntry('O-000002', { status: 'deprecated' })],
      ['O-000001', makeEntry('O-000001', { status: 'active' })],
    ]),
    decisions: new Map([
      ['D-000003', makeEntry('D-000003', { status: 'archived' })],
      ['D-000001', makeEntry('D-000001', { status: 'accepted' })],
      ['D-000002', makeEntry('D-000002', { status: 'addressed' })],
      ['D-000004', makeEntry('D-000004', { status: 'superseded' })],
      ['D-000005', makeEntry('D-000005', { status: 'rejected' })],
      ['D-000006', makeEntry('D-000006', { status: 'proposed' })],
    ]),
    proposals: { knowledge: new Map([[proposalKey, makeEntry(proposalKey, { facets: { stage: 'proposed' } })]]),
      ontology: new Map(), decision: new Map() },
  };
}
const stores = ['knowledge', 'ontology', 'decisions'];

test('default all view includes canonical history and separately typed proposals', () => {
  const data = model();
  const result = selectSubjectQueryRecords(data, { stores });
  assert.equal(result.view, 'all');
  assert.deepEqual(result.records.map(({ ref }) => ref.id),
    ['D-000001', 'D-000002', 'D-000003', 'D-000004', 'D-000005', 'D-000006',
      'K-000001', 'K-000002', 'K-000003', 'O-000001', 'O-000002']);
  assert.deepEqual(result.proposals.map(({ proposalRef }) => proposalRef),
    [{ namespace, kind: 'knowledge', key: proposalKey }]);
  assert.equal(Object.hasOwn(result.proposals[0], 'ref'), false);
  assert.equal(result.proposals[0].entry, data.proposals.knowledge.get(proposalKey));
});

test('current lifecycle selection has an explicit store-specific basis without freshness inference', () => {
  const data = model();
  const result = selectSubjectQueryRecords(data, { stores, view: 'current' });
  assert.deepEqual(result.records.map(({ ref }) => ref.id), ['D-000001', 'D-000002', 'K-000001', 'O-000001']);
  assert.deepEqual(result.proposals, []);
  assert.equal(result.records[2].entry.record.verified, '2000-01-01', 'lifecycle selection cannot refresh or omit stale evidence');
  assert.ok(result.coverage.every((row) => row.proposalScope === 'excluded' && row.basis === 'lifecycle-only'));
});

test('all view refuses missing proposal capture; current explicitly excludes it', () => {
  const data = model();
  delete data.proposals;
  assert.throws(() => selectSubjectQueryRecords(data, { stores }), { code: 'unavailable-proposals' });
  assert.equal(selectSubjectQueryRecords(data, { stores, view: 'current' }).records.length, 4);
});

test('current knowledge view refuses missing/custom stages instead of inventing lifecycle meaning', () => {
  for (const stage of [undefined, 'archived', 'deprecated', 'published']) {
    const data = model();
    data.leaves.set('K-000010', makeEntry('K-000010', stage === undefined ? {} : { facets: { stage } }));
    assert.equal(selectSubjectQueryRecords(data, { stores: ['knowledge'], view: 'all' }).records.length, 4);
    assert.throws(() => selectSubjectQueryRecords(data, { stores: ['knowledge'], view: 'current' }),
      { code: 'unsupported-current-lifecycle' });
  }
});

test('coverage counts selected identities and labels intentional proposal exclusion', () => {
  assert.deepEqual(selectSubjectQueryRecords(model(), { stores: ['knowledge'] }).coverage, [
    { store: 'knowledge', basis: 'all-valid-lifecycle', canonicalAvailable: 3, canonicalSelected: 3,
      proposalScope: 'included', proposalsSelected: 1 },
  ]);
  assert.deepEqual(selectSubjectQueryRecords(model(), { stores: ['knowledge'], view: 'current' }).coverage, [
    { store: 'knowledge', basis: 'lifecycle-only', canonicalAvailable: 3, canonicalSelected: 1,
      proposalScope: 'excluded', proposalsSelected: 0 },
  ]);
});

test('unknown store/view, duplicate selection, and malformed captured models refuse', () => {
  for (const options of [{}, { stores: [] }, { stores: ['decision'] }, { stores: ['knowledge', 'knowledge'] },
    { stores, view: 'latest' }, { stores, surprise: true }]) {
    assert.throws(() => selectSubjectQueryRecords(model(), options));
  }
  const unhealthy = model();
  unhealthy.ok = false;
  assert.throws(() => selectSubjectQueryRecords(unhealthy, { stores }), { code: 'invalid-model' });
  const missing = model();
  missing.stores.knowledge.present = false;
  assert.throws(() => selectSubjectQueryRecords(missing, { stores }), { code: 'unavailable-store' });
});

test('selection is deterministic and preserves original payload and assignment absence', () => {
  const data = model();
  const before = JSON.stringify([...data.leaves]);
  const a = selectSubjectQueryRecords(data, { stores });
  const b = selectSubjectQueryRecords(data, { stores: [...stores].reverse() });
  assert.deepEqual(a, b);
  assert.equal(a.records.find(({ ref }) => ref.id === 'K-000001').entry, data.leaves.get('K-000001'));
  assert.equal(Object.hasOwn(data.leaves.get('K-000001').record, 'subjects'), false);
  assert.equal(JSON.stringify([...data.leaves]), before);
});
