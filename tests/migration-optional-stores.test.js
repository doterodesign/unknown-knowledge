import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { semanticFixture } from './helpers/migration-semantic-fixture.js';
import { capturePreparedRuntime } from '../payload/engine/lib/prepared-runtime.js';
import { runPreparedMigrationSemantics } from '../payload/engine/lib/prepared-migration-semantics.js';
import { canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { optionalStoreSource } from './helpers/migration-optional-store-fixture.js';

function inputFor(f) {
  const work = join(f.base, 'work'); mkdirSync(work, { mode: 0o700 });
  const runtime = capturePreparedRuntime(work, f.runtimeLimits, 'identity-migration');
  return { repoRoot: f.root, source: f.source, candidate: f.candidate, migrationInputs: f.migrationInputs,
    limits: f.limits, runtime, runtimeLimits: f.runtimeLimits, semantic: f.semantic };
}

test('actual Decisions-only source preserves optional-store absence and executes real empty retrieval/views', async (t) => {
  const f = semanticFixture(t, { amendSource: optionalStoreSource() });
  const input = inputFor(f); const index = readFileSync(join(f.root, '.git/index'));
  const result = await runPreparedMigrationSemantics(input);
  assert.equal(result.mechanical.mechanicalStatus, 'passed', JSON.stringify(result.mechanical));
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.sourceProfile.before, {
    knowledge: { present: false, records: 0 }, ontology: { present: false, records: 0 }, decisions: { present: true, records: 1 },
  });
  assert.deepEqual(result.sourceProfile.candidate, result.sourceProfile.before);
  assert.equal(result.recipe.cases.length, 4);
  assert.equal(result.validation.length, 4);
  assert(result.replays.every((row) => row.comparison.status === 'complete'));
  assert.equal(result.generated.before.index.counts.leaves, 0);
  assert.equal(result.generated.candidate.index.counts.leaves, 0);
  assert.equal(result.generated.before.artifacts.length, 3);
  assert.equal(result.operationalHistory.status, 'complete');
  assert.equal(result.recipe.coverage.decisionRetrieval, 'not-supported-by-ordinary-resolver');
  assert.deepEqual(result.recipe.documents.map((row) => row.nativeSections), [1, 1]);
  assert(!existsSync(join(f.root, 'knowledge')));
  assert(!existsSync(join(f.root, 'ontology')));
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  const exact = { ...f.semantic.limits, maxCases: 4,
    maxInventoryBytes: canonicalJsonBytes(result.recipe).length + canonicalJsonBytes(result.sourceProfile).length
      + canonicalJsonBytes(result.operationalHistory).length,
    maxGeneratedBytes: ['before', 'candidate'].reduce((sum, side) => sum
      + result.generated[side].artifacts.reduce((n, row) => n + Buffer.byteLength(row.text), 0)
      + canonicalJsonBytes({ index: result.generated[side].index, trees: result.generated[side].trees }).length, 0) };
  const boundary = await runPreparedMigrationSemantics({ ...input, semantic: { ...f.semantic, limits: exact } });
  assert.equal(boundary.status, 'complete', JSON.stringify(boundary.diagnostics));
  for (const key of ['maxCases', 'maxInventoryBytes', 'maxGeneratedBytes']) {
    const shortfall = await runPreparedMigrationSemantics({ ...input, semantic: { ...f.semantic, limits: { ...exact, [key]: exact[key] - 1 } } });
    assert.equal(shortfall.status, 'failed', key);
  }
});

test('actual O-without-K, K-without-O and empty-present stores preserve exact profiles', async (t) => {
  for (const profile of [{ ontology: 'full' }, { knowledge: 'full' }, { knowledge: 'empty', ontology: 'empty' }]) {
    const f = semanticFixture(t, { nested: true, amendSource: optionalStoreSource(profile) });
    const result = await runPreparedMigrationSemantics(inputFor(f));
    assert.equal(result.status, 'complete', JSON.stringify({ profile, diagnostics: result.diagnostics }));
    assert.deepEqual(result.sourceProfile.before, result.sourceProfile.candidate);
    for (const store of ['knowledge', 'ontology']) {
      assert.equal(result.sourceProfile.before[store].present, profile[store] !== undefined);
      assert.equal(result.sourceProfile.before[store].records > 0, profile[store] === 'full');
    }
    assert.equal(result.generated.comparison.status, 'complete');
  }
});

test('all-empty, non-directory, malformed-present and changed-presence actual snapshots refuse', async (t) => {
  const scenarios = [
    { amendSource: optionalStoreSource({ decisions: 'empty' }) },
    { amendSource: optionalStoreSource({ knowledge: 'file' }) },
    { amendSource: (kit) => { optionalStoreSource()(kit); rmSync(join(kit, 'decisions/_catalog.yaml')); } },
    { amendSource: optionalStoreSource(), amendCandidate: (kit) => {
      mkdirSync(join(kit, 'knowledge'));
      writeFileSync(join(kit, 'knowledge/_catalog.yaml'), 'schema-version: 2\nstore: knowledge\nentries: []\n');
    } },
  ];
  for (const options of scenarios) {
    const f = semanticFixture(t, options); const result = await runPreparedMigrationSemantics(inputFor(f));
    assert.equal(result.status, 'failed'); assert.equal(result.replays.length, 0);
  }
});
