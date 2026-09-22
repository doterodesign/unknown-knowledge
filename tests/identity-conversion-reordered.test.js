import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { iterateCurrentRecords, iterateProposalRecords } from '../payload/engine/lib/record-identity.js';
import { resolveRecord } from '../payload/engine/lib/record-identity-index.js';

const fixture = (name) => fileURLToPath(new URL(`fixtures/derived/${name}/`, import.meta.url));
const namespace = '12121212-1212-4212-8212-121212121212';
const triage = 'proposal:knowledge:17117117-1171-4171-8171-171171171171';
const budget = 'proposal:knowledge:21321321-3213-4213-8213-213213213213';
const selection = { kinds: ['decision', 'knowledge', 'ontology'] };

test('reordered fixtures preserve the same canonical and provisional identity universe', () => {
  const models = ['store', 'store-reordered'].map((name) => loadStores(fixture(name)));
  for (const model of models) {
    assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
    assert.equal(model.identity.namespace, namespace);
    assert.deepEqual([...model.leaves.keys()], ['K-000001', 'K-000002', 'K-000003', 'K-000004']);
    assert.deepEqual([...model.proposals.knowledge.keys()], [triage, budget]);
    assert.equal(model.identity.allocations.length, 6);
    assert.ok(model.identity.allocations.every((row) => !row.id.startsWith('proposal:')));
    assert.equal(iterateCurrentRecords(model, selection).length, 6);
    assert.equal(iterateProposalRecords(model, selection).length, 2);
    assert.equal(resolveRecord(model.identityIndex, { namespace, kind: 'knowledge', id: triage }).status, 'invalid');
    assert.equal(model.proposals.knowledge.get(triage).record.facets.stage, 'draft');
    assert.equal(model.proposals.knowledge.get(triage).record.verified, '2026-03-15');
    assert.equal(model.proposals.knowledge.get(budget).record.facets.stage, 'draft');
    assert.equal(model.proposals.knowledge.get(budget).record.verified, '2026-07-30');
    assert.deepEqual(model.stores.knowledge.catalog.entries.map((row) => row.id).sort(), ['K-000001', 'K-000002', 'K-000003', 'K-000004', triage, budget].sort());
  }
  const current = (model) => iterateCurrentRecords(model, selection).map(({ ref, entry }) => ({ ref, record: entry.record, body: entry.body }));
  const proposals = (model) => iterateProposalRecords(model, selection).map(({ proposalRef, entry }) => ({ proposalRef, record: entry.record, body: entry.body }));
  assert.deepEqual(models[0].identity, models[1].identity);
  assert.deepEqual(current(models[0]), current(models[1]));
  assert.deepEqual(proposals(models[0]), proposals(models[1]));
  assert.notEqual(models[0].leaves.get('K-000001').file, models[1].leaves.get('K-000001').file);
});

test('ordinary derived trees keep both drafts visibly demoted and remain reorder-invariant', (t) => {
  const outputs = [];
  for (const name of ['store', 'store-reordered']) {
    const root = mkdtempSync(join(tmpdir(), 'identity-reordered-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    cpSync(fixture(name), root, { recursive: true });
    const cli = fileURLToPath(new URL('../payload/engine/derive.js', import.meta.url));
    const result = spawnSync(process.execPath, [cli, '--root', root, '--today', '2026-08-16', '--write', '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const trees = ['tree.domain-form.md', 'tree.form-domain.md'].map((file) => readFileSync(join(root, 'knowledge/derived', file), 'utf8'));
    for (const tree of trees) {
      assert.match(tree, /Component render budget — \*\*demoted\*\* \(stage\)/);
      assert.match(tree, /Visual regression triage playbook — \*\*demoted\*\* \(stage, time\)/);
      assert.ok(tree.includes(triage));
      assert.ok(tree.includes(budget));
    }
    outputs.push(trees);
  }
  assert.deepEqual(outputs[0], outputs[1]);
});
