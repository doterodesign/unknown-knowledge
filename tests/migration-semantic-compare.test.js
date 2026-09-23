import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compareMigrationRetrieval, compareMigrationViews, generateMigrationViews, verifyMigrationRenderers } from '../payload/engine/lib/migration-semantic-compare.js';
import * as current from '../payload/engine/lib/derived.js';
import * as historical from '../payload/engine/compatibility/identity-migration-08066b5/engine/lib/derived.js';
import { loadStores } from '../payload/engine/compatibility/identity-migration-08066b5/engine/lib/load-stores.js';
import { synthesizeCallNumber } from '../payload/engine/compatibility/identity-migration-08066b5/engine/lib/call-numbers.js';

const root = resolve('tests/fixtures/migration-08066b5');
const today = '2026-09-01';
const identity = { before: (_kind, id) => id, candidate: (_kind, id) => id };
function actual(args) {
  const result = spawnSync(process.execPath, ['payload/engine/compatibility/identity-migration-08066b5/engine/resolve.js',
    '--root', root, '--json', '--today', today, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
}

test('actual historical query/path/document DTOs admit unchanged values and reject unexplained content', (t) => {
  const temp = mkdtempSync('/tmp/migration-compare-'); t.after(() => rmSync(temp, { force: true, recursive: true }));
  const doc = join(temp, 'probe.md'); writeFileSync(doc, '# Passage one\n\nComponent\n\n# Passage two\n\nadd-component\n\n# Unmatched\n\nxyzzquuxprobe\n');
  for (const args of [['component'], ['--path=src/feed/latency.ts'], ['--doc', doc]]) {
    const output = actual(args); const saved = structuredClone(output);
    assert.equal(compareMigrationRetrieval(output, output, identity).status, 'complete', JSON.stringify(output));
    const changed = structuredClone(output); changed.extra = 'future output';
    assert.equal(compareMigrationRetrieval(output, changed, identity).status, 'failed');
    assert.deepEqual(output, saved);
  }
});

test('mixed context is independently corroborated and vocabulary never gets ID translation', () => {
  const before = actual(['component add-component']); const after = structuredClone(before);
  after.decomposition.concepts[0].id = 'O-000001'; for (const row of after.results) row.id = 'O-000001';
  after.decomposition['resolved-context'] = before.decomposition['resolved-context'].map((v) => v === 'K-102' ? 'O-000001' : v);
  const ids = { before: (kind, id) => kind === 'ontology' && id === 'K-102' ? 'O-000001' : id, candidate: identity.candidate };
  assert.equal(compareMigrationRetrieval(before, after, ids).status, 'complete');
  after.decomposition['resolved-context'].reverse();
  assert.equal(compareMigrationRetrieval(before, after, ids).status, 'failed');
  const bothInvalid = structuredClone(before); bothInvalid.decomposition['resolved-context'].reverse();
  assert.equal(compareMigrationRetrieval(bothInvalid, bothInvalid, identity).status, 'failed');
  const altered = structuredClone(before); altered.leaves[0].excerpt += ' Changed content.';
  assert.equal(compareMigrationRetrieval(before, altered, identity).status, 'failed');
});

test('actual generated trees/index preserve all fields and order; forged call numbers refuse', () => {
  const entries = [...loadStores(root).leaves.values()];
  const output = generateMigrationViews(historical, entries, today);
  verifyMigrationRenderers(output, current, today);
  assert.throws(() => verifyMigrationRenderers(output, { ...current,
    renderTree: (...args) => `${current.renderTree(...args)}Unreviewed renderer footer.\n` }, today));
  const synthesis = { before: synthesizeCallNumber, candidate: synthesizeCallNumber };
  assert.equal(compareMigrationViews(output, output, identity, synthesis).status, 'complete');
  const bad = structuredClone(output); bad.index.leaves[0].positions['domain-form']['call-number'] = 'forged';
  assert.equal(compareMigrationViews(output, bad, identity, synthesis).status, 'failed');
  const reordered = structuredClone(output); reordered.index.leaves.reverse();
  assert.equal(compareMigrationViews(output, reordered, identity, synthesis).status, 'failed');
  const omitted = structuredClone(output); omitted.index.leaves.pop();
  assert.equal(compareMigrationViews(output, omitted, identity, synthesis).status, 'failed');
});
