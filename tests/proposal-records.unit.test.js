import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iterateCurrentRecords, iterateProposalRecords, proposalIdentityMatches } from '../payload/engine/lib/record-identity.js';

const namespace = 'b4e15b6e-f1c9-4a3d-86fa-d05628402252';
const key = (kind, n = 1) => `proposal:${kind}:11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const entry = (kind, n = 1) => ({ id: key(kind, n), record: { id: key(kind, n), status: 'proposed' } });
function model() {
  return {
    ok: true, identity: { 'identity-format': 1, namespace },
    stores: { knowledge: { present: true }, ontology: { present: true }, decisions: { present: true } },
    leaves: new Map(), concepts: new Map(), decisions: new Map(),
    proposals: {
      knowledge: new Map([[key('knowledge', 2), entry('knowledge', 2)], [key('knowledge'), entry('knowledge')]]),
      ontology: new Map([[key('ontology'), entry('ontology')]]),
      decision: new Map([[key('decision'), entry('decision')]]),
    },
  };
}

test('shared proposal identity matching keeps injected assignment rows coherent', () => {
  const value = entry('knowledge');
  assert.equal(proposalIdentityMatches('knowledge', key('knowledge'), value), true);
  assert.equal(proposalIdentityMatches('ontology', key('knowledge'), value), false);
  assert.equal(proposalIdentityMatches('knowledge', 'K-000001', { record: { id: 'K-000001' } }), false);
  assert.equal(proposalIdentityMatches('knowledge', key('knowledge'), { ...value, identity: 'K-000001' }), false);
  assert.equal(proposalIdentityMatches('knowledge', key('knowledge'), { record: null }), false);
});

test('proposal iteration returns separately typed sorted references with original payloads', () => {
  const data = model();
  data.proposals.knowledge.get(key('knowledge', 2)).record.subjects = [];
  data.proposals.decision.get(key('decision')).record.status = 'rejected';
  const rows = iterateProposalRecords(data, { kinds: ['ontology', 'knowledge', 'decision'] });
  assert.deepEqual(rows.map(({ proposalRef }) => proposalRef), [
    { namespace, kind: 'decision', key: key('decision') },
    { namespace, kind: 'knowledge', key: key('knowledge') },
    { namespace, kind: 'knowledge', key: key('knowledge', 2) },
    { namespace, kind: 'ontology', key: key('ontology') },
  ]);
  assert.equal(rows[0].entry, data.proposals.decision.get(key('decision')));
  assert.equal(rows[0].entry.record.status, 'rejected', 'inspection includes rejected proposals without activating them');
  assert.equal(Object.hasOwn(rows[1].entry.record, 'subjects'), false);
  assert.equal(rows[2].entry.record.subjects, data.proposals.knowledge.get(key('knowledge', 2)).record.subjects);
  assert.equal(Object.hasOwn(rows[0], 'ref'), false, 'a proposal is not a canonical ref');
  assert.deepEqual(iterateCurrentRecords(data, { kinds: ['knowledge', 'ontology', 'decision'] }), []);
});

test('proposal selection is explicit, nonempty and unique', () => {
  for (const options of [undefined, null, {}, { kinds: [] }, { kinds: 'knowledge' },
    { kinds: ['subject'] }, { kinds: ['decisions'] }, { kinds: ['knowledge', 'knowledge'] }]) {
    assert.throws(() => iterateProposalRecords(model(), options), { code: 'invalid-selection' });
  }
});

test('missing proposal capture differs from captured empty maps and absent selected stores', () => {
  const data = model();
  data.proposals.ontology.clear();
  assert.deepEqual(iterateProposalRecords(data, { kinds: ['ontology'] }), []);
  delete data.proposals.knowledge;
  assert.deepEqual(iterateProposalRecords(data, { kinds: ['ontology'] }), []);
  assert.throws(() => iterateProposalRecords(data, { kinds: ['knowledge'] }), { code: 'unavailable-proposals' });
  data.stores.ontology.present = false;
  assert.throws(() => iterateProposalRecords(data, { kinds: ['ontology'] }), { code: 'unavailable-store' });
  delete data.proposals;
  assert.throws(() => iterateProposalRecords(data, { kinds: ['decision'] }), { code: 'unavailable-proposals' });
});

test('proposal iteration refuses unhealthy, unsupported and malformed input', () => {
  for (const [mutate, code] of [
    [(d) => { d.ok = false; }, 'invalid-model'],
    [(d) => { d.identity['identity-format'] = 2; }, 'unsupported-identity-format'],
    [(d) => { d.identity.namespace += '\n'; }, 'invalid-namespace'],
    [(d) => { d.proposals = []; }, 'invalid-model'],
    [(d) => { d.proposals = null; }, 'invalid-model'],
    [(d) => { d.proposals.knowledge = []; }, 'invalid-model'],
  ]) {
    const data = model();
    mutate(data);
    assert.throws(() => iterateProposalRecords(data, { kinds: ['knowledge'] }), { code });
  }
  assert.throws(() => iterateProposalRecords(null, { kinds: ['knowledge'] }), { code: 'invalid-model' });
});

test('canonical IDs, wrong kinds and inconsistent entry identities cannot masquerade as proposals', () => {
  for (const [id, value] of [
    ['K-000001', { record: { id: 'K-000001' } }],
    [key('decision'), entry('decision')],
    [key('knowledge') + '\n', { record: { id: key('knowledge') + '\n' } }],
    [key('knowledge', 3), { record: { id: key('knowledge', 4) } }],
    [key('knowledge', 3), { id: key('knowledge', 4), record: { id: key('knowledge', 3) } }],
    [key('knowledge', 3), { identity: key('knowledge', 4), record: { id: key('knowledge', 3) } }],
    [key('knowledge', 3), { record: null }],
  ]) {
    const data = model();
    data.proposals.knowledge.set(id, value);
    let delivered = 0;
    assert.throws(() => {
      for (const row of iterateProposalRecords(data, { kinds: ['decision', 'knowledge'] })) delivered += 1;
    }, { code: 'invalid-record' });
    assert.equal(delivered, 0, 'validate all selected entries before delivering any');
  }
});
