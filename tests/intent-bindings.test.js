import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectIntentBindings } from '../payload/engine/lib/intent-bindings.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { buildIdentityIndex } from '../payload/engine/lib/record-identity-index.js';

const namespace = '12345678-1234-4234-8234-123456789abc';
const foreign = 'b4e15b6e-f1c9-4a3d-86fa-d05628402252';
const subject = (id, label, aliases = [], status = 'active') => ({ id, label, aliases, status,
  definition: { text: `Meaning of ${label}`, includes: [], excludes: [] }, related: [] });
const document = () => ({ schemaVersion: 1, namespace, revision: 3, hierarchyRevision: 2,
  subjects: [subject('S-000001', 'Color', [{ label: 'Hue', locale: 'en' }]),
    subject('S-000002', 'Hue', [], 'retired')] });
const plan = () => ({ version: 1, inputRef: 'request:color', inventoryStatus: 'declared-complete',
  units: [{ key: 'color', sourceRef: 'request:color', disposition: 'mapped' }],
  bindings: [{ key: 'color', unitKeys: ['color'], target: { namespace, kind: 'subject', id: 'S-000001' },
    label: 'Color', basis: 'alias', sourceRef: 'lookup:color' }],
  constraints: [], branches: [], clarifications: [],
  requirements: [{ key: 'source', unitKeys: ['color'], description: 'Read evidence for color.' }] });
const context = (subjectDocument = document()) => ({ subjectDocument,
  lookupRequests: { 'lookup:color': { text: ' hue ', options: { locale: 'en' }, expected: {
    namespace, revision: 3, normalizerVersion: 1, documentSha256: canonicalSha256(subjectDocument) } } } });

test('captured lookup preserves every homonym and the original claim without approval', () => {
  const p = plan();
  const c = context();
  const before = structuredClone({ p, c });
  const result = inspectIntentBindings(p, c);
  assert.equal(result.inspectionScope, 'captured-navigation-only');
  assert.equal(result.queryValidation, 'not-run');
  assert.equal(result.governanceValidation, 'not-run');
  assert.equal(result.planValidation.readiness, 'unresolved-intent');
  const row = result.bindings[0];
  assert.equal(row.sourceRef, 'lookup:color');
  assert.deepEqual(row.claim, p.bindings[0]);
  assert.equal(row.target.status, 'loaded');
  assert.equal(row.basisCheck, 'supported');
  assert.equal(row.lookup.status, 'available');
  assert.equal(row.lookup.text, ' hue ');
  assert.deepEqual(row.lookup.options, { locale: 'en' });
  assert.deepEqual(row.lookup.candidates.map(c => [c.ref, c.status]), [
    [{ namespace, kind: 'subject', id: 'S-000001' }, 'active'],
    [{ namespace, kind: 'subject', id: 'S-000002' }, 'retired'],
  ]);
  assert.equal(row.lookup.captured.documentSha256, canonicalSha256(c.subjectDocument));
  result.bindings[0].claim.label = 'changed';
  result.bindings[0].lookup.candidates[0].definition.text = 'changed';
  assert.deepEqual({ p, c }, before);
  assert.deepEqual(inspectIntentBindings(p, c), inspectIntentBindings(p, c));
});

test('exact basis and preferred label must match the rerun witness; inference stays inference', () => {
  const p = plan();
  p.bindings[0].basis = 'label';
  assert.equal(inspectIntentBindings(p, context()).bindings[0].basisCheck, 'unsupported');
  p.bindings[0].basis = 'alias';
  p.bindings[0].label = 'Hue';
  assert.equal(inspectIntentBindings(p, context()).bindings[0].basisCheck, 'unsupported');
  p.bindings[0].label = 'Color';
  p.bindings[0].basis = 'inference';
  const row = inspectIntentBindings(p, context()).bindings[0];
  assert.equal(row.basisCheck, 'inference');
  assert.equal(row.lookup.candidates.length, 2);
  assert.equal(row.claim.basis, 'inference');
});

test('same revision with changed content is stale; missing requests never become inferred proof', () => {
  const c = context();
  c.subjectDocument.subjects[0].definition.text = 'Changed same-revision meaning';
  let row = inspectIntentBindings(plan(), c).bindings[0];
  assert.equal(row.lookup.status, 'stale-context');
  assert.equal(row.basisCheck, 'not-run');
  assert.notEqual(row.lookup.captured.documentSha256, row.lookup.expected.documentSha256);
  delete c.lookupRequests['lookup:color'];
  row = inspectIntentBindings(plan(), c).bindings[0];
  assert.equal(row.lookup.status, 'unavailable');
  assert.equal(row.basisCheck, 'not-run');
  for (const field of ['namespace', 'revision', 'normalizerVersion']) {
    const changed = context();
    changed.lookupRequests['lookup:color'].expected[field] = field === 'namespace' ? foreign : 99;
    assert.equal(inspectIntentBindings(plan(), changed).bindings[0].lookup.status, 'stale-context');
  }
});

test('qualified targets cannot cross namespaces, repair IDs or hide unknown fields', () => {
  for (const target of [{ namespace: foreign, kind: 'subject', id: 'S-000001' },
    { namespace, kind: 'subject', id: 'S-1' }, { namespace, kind: 'subject', id: 'S-000001', other: true },
    { kind: 'subject', id: 'S-000001' }]) {
    const p = plan(); p.bindings[0].target = target;
    const row = inspectIntentBindings(p, context()).bindings[0];
    assert.equal(row.target.status, 'invalid');
    assert.notEqual(row.basisCheck, 'supported');
  }
  const p = plan(); p.bindings[0].target.id = 'S-000009';
  assert.equal(inspectIntentBindings(p, context()).bindings[0].target.status, 'missing');
});

test('lookup derives only from captured document, never mutable caller lookup maps', () => {
  const indexed = indexSubjects(document()).registry;
  indexed.labels.clear();
  const row = inspectIntentBindings(plan(), context(indexed.document)).bindings[0];
  assert.equal(row.basisCheck, 'supported');
  assert.equal(row.lookup.candidates.length, 2);
});

test('malformed lookup or registry context produces bounded unavailable diagnostics', () => {
  for (const change of [c => { c.lookupRequests['lookup:color'].options = { fuzzy: true }; },
    c => { c.lookupRequests['lookup:color'].options = undefined; },
    c => { c.lookupRequests['lookup:color'].text = ''; },
    c => { delete c.lookupRequests['lookup:color'].expected.documentSha256; },
    c => { c.subjectDocument.subjects.push(structuredClone(c.subjectDocument.subjects[0])); }]) {
    const c = context(); change(c);
    const row = inspectIntentBindings(plan(), c).bindings[0];
    assert.equal(row.lookup.status, 'invalid-context');
    assert.equal(row.basisCheck, 'not-run');
  }
  assert.equal(inspectIntentBindings(plan(), {}).bindings[0].target.status, 'unavailable');
  assert.equal(inspectIntentBindings({}, context()).bindings.length, 0);
});

function identityInput() {
  const file = 'decisions/entries/direction.yaml';
  return {
    identity: { 'schema-version': 1, 'identity-format': 1, namespace, allocations: [
      { id: 'D-000001', kind: 'decision', state: 'allocated', publication: { id: foreign, review: 'review:fixture' } }] },
    identitySource: { file: '_identity.yaml', path: '' },
    records: [{ kind: 'decision', entry: { id: 'D-000001', file,
      record: { id: 'D-000001', status: 'accepted', title: 'Direction', subjects: [] } },
    locator: { file, path: 'entries[0]' } }], declarations: [],
  };
}

test('real record resolver retains loaded, declared-only and ambiguous identities without label proof', () => {
  const p = plan();
  p.bindings[0].target = { namespace, kind: 'decision', id: 'D-000001' };
  p.bindings[0].label = 'Direction'; p.bindings[0].basis = 'label';
  const data = identityInput();
  let row = inspectIntentBindings(p, { identityIndex: buildIdentityIndex(data) }).bindings[0];
  assert.equal(row.target.status, 'loaded');
  assert.equal(row.basisCheck, 'not-run', 'identity resolution does not authenticate a label lookup');
  data.records = [];
  data.declarations = [{ kind: 'decision', id: 'D-000001', target: 'decisions/entries/direction.yaml',
    locator: { file: 'decisions/_catalog.yaml', path: 'entries[0]' } }];
  row = inspectIntentBindings(p, { identityIndex: buildIdentityIndex(data) }).bindings[0];
  assert.equal(row.target.status, 'declared-only');
  data.declarations.push(structuredClone(data.declarations[0]));
  row = inspectIntentBindings(p, { identityIndex: buildIdentityIndex(data) }).bindings[0];
  assert.equal(row.target.status, 'ambiguous');
  assert.equal(Object.hasOwn(row.target, 'entry'), false);
  assert.equal(inspectIntentBindings(p, { identityIndex: {} }).bindings[0].target.status, 'invalid-context');
});
