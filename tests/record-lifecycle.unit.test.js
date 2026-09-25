import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordLifecycleState, leafStage } from '../payload/engine/lib/record-lifecycle.js';
import { leafStage as loaderLeafStage } from '../payload/engine/lib/load-stores.js';
const namespace = '11111111-1111-4111-8111-111111111111';
const specs = {
  knowledge: { prefix: 'K', effective: ['verified'], inactive: ['draft', 'proposed'] },
  ontology: { prefix: 'O', effective: ['active'], inactive: ['draft', 'proposed', 'deprecated'] },
  decision: { prefix: 'D', effective: ['accepted', 'addressed'], inactive: ['proposed', 'archived', 'rejected', 'superseded'] },
};
function row(kind, lifecycle, proposal = false) {
  const id = proposal ? `proposal:${kind}:${namespace}` : `${specs[kind].prefix}-000001`;
  return {
    ...(proposal ? { proposalRef: { namespace, kind, key: id } } : { ref: { namespace, kind, id } }),
    entry: { id, record: { id, ...(kind === 'knowledge' ? { facets: { stage: lifecycle } } : { status: lifecycle }) } },
  };
}

test('shared exact lifecycle table classifies captured canonical records without inferring evidence', () => {
  for (const [kind, spec] of Object.entries(specs)) {
    for (const [values, state] of [[spec.effective, 'effective'], [spec.inactive, 'non-effective']]) {
      for (const lifecycle of values) {
        const input = row(kind, lifecycle);
        const before = structuredClone(input);
        assert.deepEqual(recordLifecycleState(input), { basis: 'lifecycle-only', state, lifecycle });
        assert.deepEqual(input, before);
      }
    }
  }
});

test('missing, malformed and unsupported canonical lifecycle stays unknown', () => {
  for (const kind of Object.keys(specs)) {
    for (const lifecycle of [undefined, null, 1, 'custom-review', 'toString']) {
      assert.deepEqual(recordLifecycleState(row(kind, lifecycle)), {
        basis: 'lifecycle-only', state: 'unknown', lifecycle: typeof lifecycle === 'string' ? lifecycle : null,
      });
    }
  }
});

test('exact proposal keys are always unpublished, never a canonical lifecycle claim', () => {
  for (const [kind, { effective }] of Object.entries(specs)) {
    for (const lifecycle of ['draft', ...effective, undefined]) {
      assert.deepEqual(recordLifecycleState(row(kind, lifecycle, true)), {
        basis: 'lifecycle-only', state: 'unpublished', lifecycle: lifecycle ?? null,
      });
    }
  }
});

test('malformed, mismatched and mixed typed ownership refuses before lifecycle classification', () => {
  const valid = row('knowledge', 'verified');
  for (const input of [null, {}, { ...valid, proposalRef: row('knowledge', 'draft', true).proposalRef },
    { ...valid, ref: { ...valid.ref, namespace: 'invalid' } },
    { ...valid, ref: { ...valid.ref, kind: 'subject' } },
    { ...valid, ref: { ...valid.ref, id: 'K-1' } },
    { ...valid, entry: { ...valid.entry, record: { ...valid.entry.record, id: 'K-000002' } } },
    { ...row('knowledge', 'draft', true), proposalRef: { namespace, kind: 'knowledge', key: 'K-000001' } },
  ]) assert.throws(() => recordLifecycleState(input), { code: 'invalid-record' });
});

test('loader leafStage is the shared function, preserving null semantics without a second field reader', () => {
  assert.equal(loaderLeafStage, leafStage);
  for (const record of [undefined, {}, { facets: {} }, { facets: { stage: 1 } }]) assert.equal(leafStage(record), null);
  assert.equal(leafStage({ facets: { stage: 'draft' } }), 'draft');
});
