import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { unaccountedEditions } from '../payload/engine/lib/phoenix.js';
import { rewriteIdentityCandidate } from '../payload/engine/lib/identity-migration.js';
import { load } from 'js-yaml';

const root = fileURLToPath(new URL('fixtures/identity-cutover/phoenix/', import.meta.url));
const validator = fileURLToPath(new URL('../payload/engine/validate.js', import.meta.url));
const eventFile = 'knowledge/_phoenix/P-001.yaml';
const read = (base, path) => readFileSync(join(base, path), 'utf8');
const body = (text) => text.slice(text.indexOf('\n---\n', 4) + 5);

test('actual offline Phoenix conversion equals the independent canonical byte fixture', () => {
  const before = fileURLToPath(new URL('fixtures/identity-migration/phoenix-before/', import.meta.url));
  // Explicit corpus manifest: expected coverage is not discovered by converter traversal.
  const documents = [
    ['ontology/_catalog.yaml', 'catalog'], ['decisions/_catalog.yaml', 'catalog'],
    ['decisions/entries/retained.yaml', 'decision-entry'], ['knowledge/_catalog.yaml', 'catalog'],
    ['knowledge/_registries/domains.yaml', 'registry'], ['knowledge/_registries/stage.yaml', 'registry'],
    ['knowledge/_phoenix/P-001.yaml', 'phoenix-event'], ['knowledge/moved.md', 'knowledge-leaf'],
    ['knowledge/carried.md', 'knowledge-leaf'],
  ].map(([file, kind]) => ({ file, kind, bytes: readFileSync(join(before, file)) }));
  const snapshots = documents.map((row) => Buffer.from(row.bytes));
  const candidate = rewriteIdentityCandidate(documents, {
    namespace: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    publication: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', review: 'fixture:retained-phoenix-cutover' },
    targetVersions: { 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2, catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 },
  });
  assert.equal(candidate.ok, true, JSON.stringify(candidate));
  assert.equal(candidate.publicationReady, false);
  assert.equal(candidate.files.length, 9);
  for (const file of candidate.files) assert.deepEqual(file.bytes, readFileSync(join(root, file.file)), file.file);
  assert.deepEqual(candidate.identity, load(read(root, '_identity.yaml')));
  for (const [i, source] of documents.entries()) assert.deepEqual(source.bytes, snapshots[i]);
});

test('converted retained Phoenix event keeps one move and one carry with original evidence', () => {
  const model = loadStores(root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.deepEqual([...model.phoenix.keys()], ['knowledge/P-001']);
  assert.deepEqual([...model.phoenix.values()].map((entry) => entry.event), ['P-001']);
  assert.deepEqual([...model.decisions.keys()], ['D-000001']);
  assert.deepEqual([...model.leaves.keys()], ['K-000001', 'K-000002']);
  assert.equal(model.identity.allocations.length, 3);
  assert.deepEqual(unaccountedEditions(model), []);
  const moved = model.leaves.get('K-000001').record;
  const carried = model.leaves.get('K-000002').record;
  assert.equal(moved.edition, 2);
  assert.equal(carried.edition, 1);
  assert.equal(moved.facets.domain, 'after');
  assert.equal(carried.facets.domain, 'before');
  for (const record of [moved, carried]) {
    assert.equal(record.verified, '2026-08-01');
    assert.equal(record.citations[0].accessed, '2026-07-30');
    assert.equal(record.facets.stage, 'verified');
  }
  assert.equal(model.decisions.get('D-000001').record.date, '2026-08-17');
  assert.equal(body(read(root, 'knowledge/moved.md')), '\nThe first claim remains exactly as recorded before identity conversion.\nIts source and dates do not become newer when its identity changes.\n');
  assert.equal(body(read(root, 'knowledge/carried.md')), '\nThe second claim remains exactly as recorded before identity conversion.\nReviewing this leaf did not move it or increment its edition.\n');
  assert.equal(read(root, eventFile), `schema-version: 2
event: P-001
title: Retained move and carry
decision: D-000001
applied: "2026-08-17"
scope:
  facet: facets.domain
  values: [before]
leaves:
  - id: K-000001
    to: after
    why: The first leaf describes material owned by the destination category.
  - id: K-000002
    why: The second leaf was reviewed and deliberately stayed in its original category.
`);
  const result = spawnSync(process.execPath, [validator, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).findings, []);
});

test('retained move deletion, invented carry move and edition changes fail actual accounting', (t) => {
  for (const [name, mutate, expected] of [
    ['deleted move', (base) => writeFileSync(join(base, eventFile), read(base, eventFile).replace('  - id: K-000001\n    to: after\n    why: The first leaf describes material owned by the destination category.\n', '')), ['K-000001', 2, 1]],
    ['invented carry move', (base) => writeFileSync(join(base, eventFile), read(base, eventFile).replace('  - id: K-000002\n', '  - id: K-000002\n    to: after\n')), ['K-000002', 1, 2]],
    ['extra edition', (base) => writeFileSync(join(base, 'knowledge/moved.md'), read(base, 'knowledge/moved.md').replace('edition: 2', 'edition: 3')), ['K-000001', 3, 2]],
  ]) {
    const base = mkdtempSync(join(tmpdir(), 'identity-phoenix-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    cpSync(root, base, { recursive: true });
    mutate(base);
    const model = loadStores(base);
    assert.equal(model.ok, true, `${name}: ${JSON.stringify(model.diagnostics)}`);
    assert.deepEqual(unaccountedEditions(model).map(({ id, edition, expected }) => [id, edition, expected]), [expected], name);
    const result = spawnSync(process.execPath, [validator, '--root', base, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.ok(JSON.parse(result.stdout).findings.some((row) => row.code === 'unaccounted-edition' && row.id === expected[0]), name);
  }
});
