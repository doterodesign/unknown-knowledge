import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareBaselineRuntime, materializeTask } from '../acceptance/retrieval/materialize.js';
import { createTrialHost, runTrialOperation } from '../acceptance/retrieval/trial-host.js';
import { prepareInstalledTrialHost } from '../acceptance/retrieval/prepare-trial-host.js';

test('an oversized source is refused before its content is delivered', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'retrieval-host-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const root = join(scratch, 'fixture');
  mkdirSync(root);
  writeFileSync(join(root, 'source.md'), 'Undelivered specimen text');
  const stateFile = join(scratch, 'state.json');
  createTrialHost(stateFile, { root, namespace: 'specimen', sourceFiles: ['source.md'],
    metadataFiles: [], records: [], limits: { sourceBytes: 8 } });
  const result = runTrialOperation(stateFile, { type: 'read', path: 'source.md' });
  assert.equal(result.status, 'refused');
  assert.doesNotMatch(JSON.stringify(result), /Undelivered specimen/);
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(state.operations, 1);
  assert.equal(state.sourceBytes, 0);
  assert.equal(state.events[0].status, 'refused');
});

function fixture(t, limits = {}) {
  const root = mkdtempSync(join(tmpdir(), 'retrieval-host-accounting-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'source.md'), 'é🙂');
  writeFileSync(join(root, 'protocol.md'), 'Read the declared catalog.');
  writeFileSync(join(root, 'catalog.yaml'), 'entries:\n  - id: O-000001\n    title: First\n  - id: O-000002\n    title: Second\n');
  writeFileSync(join(root, 'records.yaml'), 'First full record\nSecond full record\n');
  writeFileSync(join(root, 'private.md'), 'Excluded specimen content');
  const stateFile = join(root, 'state.json');
  createTrialHost(stateFile, { root, namespace: 'specimen', sourceFiles: ['source.md'],
    metadataFiles: ['protocol.md', 'catalog.yaml'],
    records: ['O-000001','O-000002'].map(localId => ({ id: `specimen/ontology/${localId}`,
      kind: 'ontology', localId, file: 'records.yaml', catalog: 'catalog.yaml' })),
    limits: { sourceBytes: 1000, ...limits } });
  return { root, stateFile };
}

test('onboarding counts output but does not consume source-file bytes', (t) => {
  const { stateFile } = fixture(t, { sourceBytes: 0 });
  const result = runTrialOperation(stateFile, { type: 'read', path: 'protocol.md' });
  assert.equal(result.status, 'completed');
  const state = JSON.parse(readFileSync(stateFile));
  assert.equal(state.sourceBytes, 0);
  assert.ok(state.resultBytes > 0);
});

test('catalog exposure charges every row before delivery without full-record credit', (t) => {
  const { stateFile } = fixture(t, { records: 1 });
  const result = runTrialOperation(stateFile, { type: 'read', path: 'catalog.yaml' });
  assert.equal(result.status, 'refused');
  assert.doesNotMatch(JSON.stringify(result), /First|Second|O-00000/);
  const state = JSON.parse(readFileSync(stateFile));
  assert.deepEqual(state.recordIds, []);
  assert.deepEqual(state.fullRecordIds, []);
});

test('an undeclared file cannot be read or echoed into a refusal', (t) => {
  const { stateFile } = fixture(t);
  const result = runTrialOperation(stateFile, { type: 'read', path: 'private.md' });
  assert.equal(result.status, 'refused');
  assert.doesNotMatch(JSON.stringify(result), /Excluded specimen/);
});

test('repeated Unicode source reads charge actual UTF-8 bytes again', (t) => {
  const { stateFile } = fixture(t, { sourceBytes: 11 });
  assert.equal(runTrialOperation(stateFile, { type: 'read', path: 'source.md' }).status, 'completed');
  assert.equal(runTrialOperation(stateFile, { type: 'read', path: 'source.md' }).status, 'refused');
  const state = JSON.parse(readFileSync(stateFile));
  assert.equal(state.sourceBytes, 6);
  assert.equal(state.operations, 2);
});

test('changed catalogs are refused before newly introduced metadata is exposed', (t) => {
  const { root, stateFile } = fixture(t);
  writeFileSync(join(root, 'catalog.yaml'), 'entries:\n  - id: O-000003\n    title: Unexpected secret\n');
  const result = runTrialOperation(stateFile, { type: 'read', path: 'catalog.yaml' });
  assert.equal(result.status, 'refused');
  assert.doesNotMatch(JSON.stringify(result), /Unexpected secret|O-000003/);
});

test('metadata windows support onboarding without granting partial source or record credit', (t) => {
  const { stateFile } = fixture(t);
  assert.equal(runTrialOperation(stateFile, { type: 'read', path: 'protocol.md', startLine: 1, endLine: 1 }).status, 'completed');
  for (const path of ['source.md', 'records.yaml', 'catalog.yaml']) {
    assert.equal(runTrialOperation(stateFile, { type: 'read', path, startLine: 1, endLine: 1 }).status, 'refused');
  }
});

test('whole-file source inspection gets a passage identity even without Markdown headings', (t) => {
  const { stateFile } = fixture(t);
  runTrialOperation(stateFile, { type: 'read', path: 'source.md' });
  assert.deepEqual(JSON.parse(readFileSync(stateFile)).sourcePassages, ['specimen/source.md#whole-file']);
});

test('CLI delivery bytes and digest match the ledger, including operation exhaustion', (t) => {
  const { stateFile } = fixture(t, { operations: 1 });
  const host = new URL('../acceptance/retrieval/trial-host.js', import.meta.url).pathname;
  for (const expectedExit of [0, 2]) {
    const result = spawnSync(process.execPath, [host, stateFile, 'read', 'source.md'], { encoding: 'utf8' });
    assert.equal(result.status, expectedExit);
    assert.equal(result.stderr, '');
    const event = JSON.parse(readFileSync(stateFile)).events.at(-1);
    assert.equal(event.deliveredBytes, Buffer.byteLength(result.stdout));
    assert.equal(event.deliveredSha256, createHash('sha256').update(result.stdout).digest('hex'));
  }
});

test('full class reads charge every record and exhausted output budgets emit nothing', (t) => {
  const full = fixture(t);
  assert.equal(runTrialOperation(full.stateFile, { type: 'read', path: 'records.yaml' }).status, 'completed');
  assert.equal(JSON.parse(readFileSync(full.stateFile)).fullRecordIds.length, 2);
  const exhausted = fixture(t, { resultBytes: 0 });
  assert.equal(runTrialOperation(exhausted.stateFile, { type: 'read', path: 'source.md' }).silent, true);
  assert.equal(JSON.parse(readFileSync(exhausted.stateFile)).resultBytes, 0);
});

test('nested resolver metadata is charged and unknown returned records are refused', (t) => {
  const { root, stateFile } = fixture(t, { records: 2 });
  mkdirSync(join(root, 'unknown-knowledge', 'engine'), { recursive: true });
  const engine = join(root, 'unknown-knowledge', 'engine', 'resolve.js');
  writeFileSync(engine, `console.log(JSON.stringify({ results: [{ id: 'O-000001', knowledge: [{ id: 'K-999999', title: 'Unregistered specimen' }] }] }));`);
  const result = runTrialOperation(stateFile, { type: 'resolve', query: 'sample' });
  assert.equal(result.status, 'refused');
  assert.doesNotMatch(JSON.stringify(result), /Unregistered specimen|K-999999/);
});

test('confusable metadata consumes the inspection budget even without a ranked result', (t) => {
  const { root, stateFile } = fixture(t, { records: 1 });
  mkdirSync(join(root, 'unknown-knowledge', 'engine'), { recursive: true });
  writeFileSync(join(root, 'unknown-knowledge', 'engine', 'resolve.js'),
    `console.log(JSON.stringify({ results: [{ id: 'O-000001', 'confusable-with': [{ id: 'O-000002', term: 'Second' }] }] }));`);
  assert.equal(runTrialOperation(stateFile, { type: 'resolve', query: 'sample' }).status, 'refused');
});

test('actual resolver and selected preflight retain status and count returned metadata', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'retrieval-host-cli-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
  const { roots: [installation] } = materializeTask('engineering-01', join(scratch, 'fixture'), runtime);
  const stateFile = join(scratch, 'state.json');
  await prepareInstalledTrialHost(stateFile, { root: installation.root, namespace: installation.namespace,
    today: '2026-09-18', sourceFiles: [installation.source], metadataFiles: [] });
  const resolved = runTrialOperation(stateFile, { type: 'resolve', query: 'css export' });
  assert.equal(resolved.status, 'completed');
  assert.equal(resolved.exitCode, 0);
  assert.equal(JSON.parse(resolved.text).results[0].id, 'K-101');
  const checked = runTrialOperation(stateFile, { type: 'preflight', concepts: ['K-101'] });
  assert.equal(checked.status, 'completed');
  assert.equal(checked.exitCode, 0);
  assert.equal(JSON.parse(checked.text).verdicts[0].verdict, 'trusted');
  const state = JSON.parse(readFileSync(stateFile));
  assert.ok(state.recordIds.includes('engineering/ontology/K-101'));
  assert.deepEqual(state.fullRecordIds, []);
  const failed = runTrialOperation(stateFile, { type: 'preflight', concepts: ['K-999999'] });
  assert.equal(failed.status, 'completed');
  assert.equal(failed.exitCode, 2);
});
