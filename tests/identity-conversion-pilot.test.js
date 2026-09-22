import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { resolveRecord } from '../payload/engine/lib/record-identity-index.js';

const repository = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) => join(repository, 'fixtures', name);
const namespace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function cli(command, name, args = []) {
  return spawnSync(process.execPath, [join(repository, 'payload/engine', command), '--root', fixture(name), '--json', ...args], { encoding: 'utf8' });
}
function output(command, status, args = []) {
  const result = cli(command, 'ts-app', args);
  assert.equal(result.status, status, result.stderr);
  return JSON.parse(result.stdout);
}

test('paired TypeScript fixture loads the literal canonical identity universe', () => {
  const model = loadStores(join(fixture('ts-app'), 'unknown-knowledge'));
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.deepEqual(model.diagnostics, []);
  assert.equal(model.identity.namespace, namespace);
  assert.deepEqual([...model.concepts.keys()], [
    'O-000001', 'O-000002', 'O-000003', 'O-000004', 'O-000005', 'O-000006',
    'O-000007', 'O-000008', 'O-000009', 'O-000010', 'O-000011', 'O-000012',
    'O-000013', 'O-000014', 'O-000015', 'O-000016',
  ]);
  assert.deepEqual([...model.leaves.keys()], ['K-000001', 'K-000002']);
  assert.deepEqual([...model.decisions.keys()], ['D-000001']);
  assert.equal(model.identity.allocations.length, 19);
  assert.ok(model.identity.allocations.every((row) => row.state === 'allocated'));
  assert.equal(resolveRecord(model.identityIndex, { namespace, kind: 'ontology', id: 'O-000001' }).status, 'loaded');
  assert.equal(resolveRecord(model.identityIndex, { namespace, kind: 'ontology', id: 'K-101' }).status, 'invalid');
  assert.equal(model.leaves.get('K-000002').record.verified, '2026-01-05');
  assert.equal(model.leaves.get('K-000002').record.edition, 1);
  assert.equal(model.leaves.get('K-000001').record.citations[0].accessed, '2026-07-08');
  assert.match(model.leaves.get('K-000001').body, /then update concept O-000001's/);
  assert.deepEqual(model.leaves.get('K-000002').record.relates['see-also'], ['K-000001']);
  assert.equal(model.decisions.get('D-000001').record.date, '2026-07-08');
  assert.equal(model.decisions.get('D-000001').record.status, 'accepted');
});

test('paired target structural validation retains exactly the two original value plants', () => {
  const result = output('validate.js', 1);
  assert.deepEqual(result['store-health'], { ok: true, errors: 0, warnings: 0 });
  assert.deepEqual(result.findings.map((row) => [row.code, row.id, row.path]), [
    ['unregistered-value', 'K-000001', 'applies.jurisdictions[0]'],
    ['unregistered-value', 'K-000001', 'facets.form'],
  ]);
});

test('paired target value validation retains clean anchors, planted drift and hard-error cases', () => {
  const clean = output('validate-values.js', 0, ['--concepts', 'O-000001,O-000003,O-000005']);
  assert.deepEqual(clean.findings, []);
  assert.deepEqual(clean['hard-errors'], []);
  const drift = output('validate-values.js', 1, ['--concepts', 'O-000002,O-000004,O-000008']);
  assert.deepEqual(drift['hard-errors'], []);
  assert.deepEqual(drift.findings.map((row) => [row.concept, row.code, row.value ?? null]), [
    ['O-000002', 'value-not-in-source', 'luminosity'],
    ['O-000004', 'source-value-missing', 'video'],
    ['O-000008', 'wrong-pointer', null],
  ]);
  const hard = output('validate-values.js', 2, ['--concepts', 'O-000013,O-000015,O-000016']);
  assert.deepEqual(hard.findings, []);
  assert.deepEqual(hard['hard-errors'].map((row) => [row.concept, row.code]), [
    ['O-000013', 'out-of-envelope'], ['O-000015', 'out-of-envelope'], ['O-000016', 'out-of-envelope'],
  ]);
});

test('paired target resolver and preflight retain literal rankings and evidence-date outcomes', () => {
  // resolve's query is positional; --root and --json still name the real target fixture.
  const resolved = output('resolve.js', 0, ['export format']);
  assert.equal(resolved.results[0].id, 'O-000001');
  assert.equal(resolved.results[0].score, 100);
  assert.ok(resolved.results[0]['confusable-with'].some((row) => row.id === 'O-000013'));
  const late = output('preflight.js', 1, ['--leaves', 'K-000001,K-000002', '--today', '2026-08-16']);
  assert.deepEqual(late['leaf-verdicts'].map((row) => [row.leaf, row.verdict]), [['K-000001', 'quarantined'], ['K-000002', 'stale']]);
  const early = output('preflight.js', 0, ['--leaves', 'K-000002', '--today', '2026-02-01']);
  assert.equal(early['leaf-verdicts'][0].verdict, 'trusted');
});

test('paired negative fixture reaches exactly its unresolved canonical reference', () => {
  const model = loadStores(join(fixture('plant-unresolved-relates'), 'unknown-knowledge'));
  assert.equal(model.ok, false);
  assert.ok(model.identity, 'valid surrounding identity must expose the intended reference defect');
  assert.deepEqual(model.diagnostics.filter((row) => row.severity === 'error').map((row) => [row.code, row.file, row.path]), [
    ['unresolved-ref', 'knowledge/product/100.1-adding-a-new-export-format.md', 'relates.see-also[0]'],
  ]);
  const result = cli('validate.js', 'plant-unresolved-relates');
  assert.equal(result.status, 2);
  const lines = result.stderr.trim().split('\n').filter((line) => /^\s+\S/.test(line));
  assert.equal(lines.length, 1, result.stderr);
  assert.match(lines[0], /unresolved-ref.*relates\.see-also\[0\].*K-000999/);
});
