// UCS-953: Verdict rules through the importable seam, with real loaded Stores
// and validators. CLI tests retain output, logging, and exit-code coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { computeVerdicts } from '../payload/engine/lib/verdicts.js';

const fixture = (name) => fileURLToPath(new URL(`fixtures/preflight/${name}`, import.meta.url));

function copyStore(t, name) {
  const root = mkdtempSync(join(tmpdir(), 'uk-verdicts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixture(name), root, { recursive: true });
  return root;
}

test('callers can compute a concept verdict directly from a loaded Store', () => {
  const repoRoot = fixture('clean');
  const result = computeVerdicts(loadStores(repoRoot), { concepts: ['K-100'], repoRoot });
  assert.equal(result.storeVerdict, 'trusted');
  assert.deepEqual(result.verdicts.map(({ concept, verdict }) => [concept, verdict]), [['K-100', 'trusted']]);
  assert.deepEqual(result.leafVerdicts, []);
});

for (const status of ['draft', 'proposed']) {
  test(`${status} concepts stay unknown even when their unvalidated claims drift`, (t) => {
    const repoRoot = copyStore(t, 'clean');
    const file = join(repoRoot, 'ontology/classes/100-registries.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('status: draft', `status: ${status}`));
    const result = computeVerdicts(loadStores(repoRoot), { repoRoot, concepts: ['K-130'] });
    assert.equal(result.storeVerdict, 'trusted');
    assert.deepEqual(result.verdicts.map(({ concept, status, verdict, evidence }) =>
      ({ concept, status, verdict, evidence })), [
      { concept: 'K-130', status, verdict: 'unknown', evidence: [] },
    ]);
    assert.match(result.verdicts[0].reason, /structural checks only/);
  });
}

test('structural errors, value drift, and hard errors quarantine only their owning concept', (t) => {
  const repoRoot = copyStore(t, 'drift');
  const file = join(repoRoot, 'ontology/classes/100-registries.yaml');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace('source-of-truth: [src/icons.txt]', 'source-of-truth: [src/icons.txt, src/missing.txt]')
    .replace('values: [grid, list, star]', `values: [grid, list, star]
      - kind: test-lines
        source: src/missing.txt
        values: [missing]`));
  const result = computeVerdicts(loadStores(repoRoot), {
    repoRoot, concepts: ['K-130', 'K-110', 'K-100'],
  });
  assert.equal(result.storeVerdict, 'trusted', JSON.stringify(result.health));
  assert.deepEqual(result.verdicts.map(({ concept, verdict }) => [concept, verdict]), [
    ['K-100', 'quarantined'], ['K-110', 'trusted'], ['K-130', 'unknown'],
  ]);
  assert.deepEqual(result.verdicts[0].evidence.map(({ check, code, severity }) => [check, code, severity]), [
    ['structural', 'missing-path', 'error'],
    ['value', 'source-value-missing', 'error'],
    ['value', 'value-not-in-source', 'error'],
    ['value', 'source-missing', 'hard-error'],
  ]);
  assert.deepEqual(result.verdicts.slice(1).map(({ evidence }) => evidence), [[], []]);
});

test('evidence has a stable literal order regardless of claim and source ordering', (t) => {
  const repoRoot = copyStore(t, 'drift');
  const file = join(repoRoot, 'ontology/classes/100-registries.yaml');
  const original = readFileSync(file, 'utf8');
  writeFileSync(file, original.replace('[grid, list, star]', '[zebra, grid, star, apple]'));
  const options = { repoRoot, concepts: ['K-100'] };
  const first = computeVerdicts(loadStores(repoRoot), options).verdicts[0].evidence;
  assert.deepEqual(first.map(({ code, value }) => [code, value]), [
    ['source-value-missing', 'list'],
    ['source-value-missing', 'search'],
    ['value-not-in-source', 'apple'],
    ['value-not-in-source', 'star'],
    ['value-not-in-source', 'zebra'],
  ]);
  writeFileSync(file, original.replace('[grid, list, star]', '[apple, zebra, grid, star]'));
  writeFileSync(join(repoRoot, 'src/icons.txt'), 'list\nsearch\ngrid\n');
  assert.deepEqual(computeVerdicts(loadStores(repoRoot), options).verdicts[0].evidence, first);
});

test('one store-wide failure degrades every requested concept and leaf, including unloaded ids', (t) => {
  const repoRoot = copyStore(t, 'clean');
  writeFileSync(join(repoRoot, 'ontology/classes/broken.yaml'), 'entries: [\n');
  const result = computeVerdicts(loadStores(repoRoot), {
    repoRoot, concepts: ['K-999', 'K-130', 'K-100'], leaves: ['L-999999', 'L-000117'],
    today: '2026-08-16',
  });
  assert.equal(result.storeVerdict, 'unknown');
  assert.ok(result.health.errors.some(({ code }) => code === 'parse-error'));
  assert.deepEqual(result.verdicts.map(({ concept, verdict }) => [concept, verdict]), [
    ['K-100', 'unknown'], ['K-130', 'unknown'], ['K-999', 'unknown'],
  ]);
  assert.deepEqual(result.leafVerdicts.map(({ leaf, verdict }) => [leaf, verdict]), [
    ['L-000117', 'unknown'], ['L-999999', 'unknown'],
  ]);
  for (const verdict of [...result.verdicts, ...result.leafVerdicts]) {
    assert.match(verdict.reason, /store-wide failure/);
    assert.deepEqual(verdict.evidence, []);
  }
});
