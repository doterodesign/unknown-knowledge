import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inventorySourceDocuments, planIdentityCorrespondence, rewriteIdentityCandidate } from '../payload/engine/lib/identity-migration.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { resolveRecord } from '../payload/engine/lib/record-identity-index.js';

const namespace = '11111111-1111-4111-8111-111111111111';
const publication = { id: '22222222-2222-4222-8222-222222222222', review: 'controlled-declaration-review' };
const targetVersions = { 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2,
  catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 };
const doc = (file, kind, text) => ({ file, kind, bytes: Buffer.from(text) });
const pending = (store = 'decisions', id = 'D-9') => doc(`${store}/_catalog.yaml`, 'catalog',
  `schema-version: 1\nstore: ${store}\nentries: [{id: ${id}, title: Pending, file: pending-import}]\n`);
const options = (documents) => ({ namespace, publication,
  declarations: inventorySourceDocuments(documents).records.filter((row) => row.availability === 'declared-only')
    .map((row) => ({ source: row.key, disposition: 'allocate' })) });

test('pending catalog occurrence requires an explicit allocation and never acquires a payload lifecycle', () => {
  const documents = [pending()]; const inventory = inventorySourceDocuments(documents);
  assert.equal(inventory.ok, true, JSON.stringify(inventory.diagnostics));
  assert.equal(inventory.records.length, 1);
  const row = inventory.records[0];
  assert.equal(row.availability, 'declared-only'); assert.equal(row.lifecycle, null);
  assert.deepEqual(row.declaration, { target: 'pending-import', locator: { file: 'decisions/_catalog.yaml', path: ['entries', 0] } });
  assert.equal(planIdentityCorrespondence(documents, { namespace, publication }).code, 'declaration-disposition-required');
  const plan = planIdentityCorrespondence(documents, options(documents));
  assert.equal(plan.ok, true); assert.equal(plan.ledger.allocations.length, 1);
  assert.equal(plan.ledger.allocations[0].id, 'D-000001');
  assert.equal(Object.hasOwn(plan.ledger.allocations[0], 'lifecycle'), false);
});

test('declaration choices reject duplicates, extras, malformed choices and unsupported proposal disposition', () => {
  const documents = [pending()]; const base = options(documents); const choice = base.declarations[0];
  assert.ok(choice, 'inventory must expose an exact declaration source key');
  for (const declarations of [[choice, choice], [{ ...choice, source: 'absent' }], [{ ...choice, extra: true }]]) {
    assert.equal(planIdentityCorrespondence(documents, { ...base, declarations }).code, 'invalid-declaration-disposition');
  }
  assert.equal(planIdentityCorrespondence(documents, { ...base, declarations: [{ ...choice, disposition: 'proposal' }] }).code,
    'declared-only-proposal-unsupported');
  for (const store of ['decisions', 'knowledge', 'ontology']) {
    for (const kind of ['decision', 'knowledge', 'ontology', 'subject']) {
      const proposalDocuments = [pending(store, `proposal:${kind}:33333333-3333-4333-8333-333333333333`)];
      assert.equal(planIdentityCorrespondence(proposalDocuments, options(proposalDocuments)).code,
        'declared-only-proposal-unsupported', `${store}/${kind}`);
    }
  }
});

test('catalog and payload join once only at the declared target; conflicts never allocate', () => {
  const payload = doc('decisions/entries/one.yaml', 'decision-entry', 'schema-version: 1\nentries: [{id: D-9, status: accepted}]\n');
  const catalog = (target) => doc('decisions/_catalog.yaml', 'catalog',
    `schema-version: 1\nstore: decisions\nentries: [{id: D-9, title: One, file: ${target}}]\n`);
  const joined = [catalog('entries/one.yaml'), payload];
  assert.equal(planIdentityCorrespondence(joined, { namespace, publication }).ledger.allocations.length, 1);
  for (const documents of [[pending(), payload], [catalog('entries/wrong.yaml'), payload],
    [doc('decisions/_catalog.yaml', 'catalog', 'schema-version: 1\nstore: decisions\nentries: [{id: D-9, title: One, file: pending-import}, {id: D-9, title: Two, file: pending-import}]\n')]]) {
    assert.equal(inventorySourceDocuments(documents).ok, false);
    assert.equal(planIdentityCorrespondence(documents, options(documents)).ok, false);
  }
});

test('declared navigation resolves but payload-dependent authorizers and dependencies remain unavailable', () => {
  const catalog = pending('knowledge', 'L-9');
  for (const edge of ['see-also', 'depends-on']) {
    const documents = [catalog, doc('knowledge/one.md', 'knowledge-leaf',
      `---\nschema-version: 2\nid: L-1\nfacets: {stage: verified}\nrelates: {${edge}: [L-9]}\n---\nBody\n`)];
    const plan = planIdentityCorrespondence(documents, options(documents));
    assert.equal(plan.ok, edge === 'see-also');
    if (edge === 'depends-on') assert.equal(plan.code, 'source-dependency-payload-unavailable');
  }
  const documents = [pending(), doc('knowledge/_registries/form.yaml', 'registry',
    'schema-version: 1\nvalues: [{value: guide, decision: D-9}]\n')];
  assert.equal(planIdentityCorrespondence(documents, options(documents)).code, 'source-dependency-payload-unavailable');
});

test('same source spelling in different typed catalogs remains distinct and ordinary missing target stays unsupported', () => {
  const documents = [pending('knowledge', 'K-9'), pending('ontology', 'K-9')];
  const plan = planIdentityCorrespondence(documents, options(documents));
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ledger.allocations.map(({ kind, id }) => [kind, id]), [['knowledge', 'K-000001'], ['ontology', 'O-000001']]);
  const ordinary = doc('decisions/_catalog.yaml', 'catalog',
    'schema-version: 1\nstore: decisions\nentries: [{id: D-9, title: Missing, file: entries/missing.yaml}]\n');
  const inventory = inventorySourceDocuments([ordinary]);
  assert.equal(inventory.ok, false);
  assert.ok(inventory.diagnostics.some(({ code }) => code === 'unsupported-missing-declaration-target'));
});

test('malformed or wrong-store pending declarations do not create an identity', () => {
  for (const text of [
    'schema-version: 1\nstore: decisions\nentries: [{id: D-9, file: pending-import}]\n',
    'schema-version: 1\nstore: knowledge\nentries: [{id: D-9, title: Pending, file: pending-import}]\n',
    'schema-version: 1\nstore: decisions\nentries: [{id: D-9, title: Pending, file: pending-import, status: accepted}]\n',
  ]) {
    const inventory = inventorySourceDocuments([doc('decisions/_catalog.yaml', 'catalog', text)]);
    assert.equal(inventory.ok, false); assert.equal(inventory.records.length, 0);
  }
});

test('actual rewrite preserves BOM/CRLF/unselected bytes and canonical reader returns declared-only without a body', (t) => {
  const original = '\uFEFFschema-version: 1\r\nstore: decisions\r\n# preserved π\r\nentries:\r\n  - id: "D-9" # untouched\r\n    title: Pending\r\n    file: pending-import\r\n';
  const documents = [doc('decisions/_catalog.yaml', 'catalog', original)];
  const result = rewriteIdentityCandidate(documents, { ...options(documents), targetVersions });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].bytes.toString(), original.replace('schema-version: 1', 'schema-version: 2').replace('"D-9"', '"D-000001"'));
  const root = mkdtempSync(join(tmpdir(), 'migration-declared-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'decisions'));
  writeFileSync(join(root, '_identity.yaml'), JSON.stringify(result.identity));
  writeFileSync(join(root, result.files[0].file), result.files[0].bytes);
  const model = loadStores(root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const resolved = resolveRecord(model.identityIndex, { namespace, kind: 'decision', id: 'D-000001' });
  assert.equal(resolved.status, 'declared-only'); assert.equal(Object.hasOwn(resolved, 'entry'), false);
  assert.equal(model.decisions.size, 0); assert.equal(existsSync(join(root, 'decisions/entries')), false);
  assert.equal(Object.hasOwn(result, 'correspondence'), false);
});
