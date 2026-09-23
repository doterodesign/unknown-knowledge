import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { semanticFixture } from './helpers/migration-semantic-fixture.js';
import { capturePreparedRuntime } from '../payload/engine/lib/prepared-runtime.js';
import { runPreparedMigrationGate } from '../payload/engine/lib/prepared-migration-gate.js';
import { runPreparedMigrationSemantics } from '../payload/engine/lib/prepared-migration-semantics.js';
import { canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';

test('actual legacy/current engines preserve finite retrieval and regenerated views after actual mechanical proof', async (t) => {
  const f = semanticFixture(t, { history: true }); const mechanical = await runPreparedMigrationGate({ repoRoot: f.root, source: f.source, candidate: f.candidate,
    migrationInputs: f.migrationInputs, limits: f.limits });
  assert.equal(mechanical.mechanicalStatus, 'passed', JSON.stringify(mechanical));
  const work = join(f.base, 'work'); mkdirSync(work, { mode: 0o700 });
  const runtime = capturePreparedRuntime(work, f.runtimeLimits, 'identity-migration');
  const input = { repoRoot: f.root, source: f.source, candidate: f.candidate, migrationInputs: f.migrationInputs,
    limits: f.limits, runtime, runtimeLimits: f.runtimeLimits, semantic: f.semantic };
  const result = await runPreparedMigrationSemantics(input);
  assert.equal(result.status, 'complete', JSON.stringify({ diagnostics: result.diagnostics, lastCase: result.replays.at(-1)?.input,
    comparison: result.replays.at(-1)?.comparison, generated: result.generated?.comparison }));
  assert(result.replays.length > 10); assert.equal(result.generated.before.artifacts.length, 3);
  assert.equal(result.generated.candidate.artifacts.length, 3);
  assert(result.replays.every((row) => row.comparison.status === 'complete'));
  assert(!JSON.stringify(result).includes('PRIVATE'));
  assert(!JSON.stringify(result).includes('correspondence'));
  const historyShortfall = await runPreparedMigrationSemantics({ ...input, semantic: { ...f.semantic,
    limits: { ...f.semantic.limits, maxInventoryBytes: canonicalJsonBytes(result.recipe).length + 1 } } });
  assert.equal(historyShortfall.status, 'failed'); assert.equal(historyShortfall.replays.length, 0);
  const short = await runPreparedMigrationSemantics({ ...input, semantic: { ...f.semantic, limits: { ...f.semantic.limits, maxCases: 1 } } });
  assert.equal(short.status, 'failed'); assert.equal(short.replays.length, 0);
  const unsupported = await runPreparedMigrationSemantics({ ...input, semantic: { ...f.semantic, requiredAdapters: ['pdf@1'] } });
  assert.equal(unsupported.status, 'failed'); assert.equal(unsupported.replays.length, 0);
  const generatedShortfall = await runPreparedMigrationSemantics({ ...input,
    semantic: { ...f.semantic, limits: { ...f.semantic.limits, maxGeneratedBytes: 1 } } });
  assert.equal(generatedShortfall.status, 'failed');
  assert(generatedShortfall.diagnostics.some((row) => row.code === 'migration-generated-budget'));
});

test('invalid retained Phoenix history refuses at actual candidate validation before semantic replay', async (t) => {
  for (const [file, replace] of [
    ['knowledge/design-system/component-render-budget.md', (s) => s.replace('edition: 2', 'edition: 3')],
    ['knowledge/_phoenix/P-001.yaml', (s) => s + s.split('\n').find((line) => line.includes('carried forward')) + '\n'],
  ]) {
    const f = semanticFixture(t, { history: true, amendSource: (kit) => {
      const path = join(kit, file); writeFileSync(path, replace(readFileSync(path, 'utf8')));
    } });
    const work = join(f.base, 'work'); mkdirSync(work, { mode: 0o700 });
    const runtime = capturePreparedRuntime(work, f.runtimeLimits, 'identity-migration');
    const result = await runPreparedMigrationSemantics({ repoRoot: f.root, source: f.source, candidate: f.candidate,
      migrationInputs: f.migrationInputs, limits: f.limits, runtime, runtimeLimits: f.runtimeLimits, semantic: f.semantic });
    assert.equal(result.mechanical.mechanicalStatus, 'failed');
    assert.equal(result.status, 'failed'); assert.equal(result.replays.length, 0);
  }
});

test('nested kit uses repository-root CLI paths; actual operational validators refuse malformed historical logs', async (t) => {
  for (const options of [{ nested: true, history: true }, { logs: true }]) {
    const f = semanticFixture(t, options); const work = join(f.base, 'work'); mkdirSync(work, { mode: 0o700 });
    const runtime = capturePreparedRuntime(work, f.runtimeLimits, 'identity-migration');
    const result = await runPreparedMigrationSemantics({ repoRoot: f.root, source: f.source, candidate: f.candidate,
      migrationInputs: f.migrationInputs, limits: f.limits, runtime, runtimeLimits: f.runtimeLimits, semantic: f.semantic });
    assert.equal(result.mechanical.mechanicalStatus, 'passed', JSON.stringify(result.mechanical.checks));
    if (options.logs) {
      assert.equal(result.status, 'failed'); assert.equal(result.replays.length, 0);
      assert(result.diagnostics.some((row) => row.code === 'migration-semantic-evidence-unavailable'));
    } else {
      assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
      assert(result.recipe.cases.some((row) => row.kind === 'path' && row.value.startsWith('unknown-knowledge/knowledge/')));
      const history = result.operationalHistory;
      assert.equal(history.documents.length, 4);
      const finding = history.documents.find((row) => row.kind === 'finding');
      assert.deepEqual(finding.before.record['resolved-context'], ['add-component', 'K-102']);
      assert.deepEqual(finding.candidate.record['resolved-context'], ['add-component', 'O-000001']);
      assert.equal(finding.candidate.record.verified, '2026-08-19');
      const moved = history.editions.before.leaves.find((row) => row.id === 'L-000213');
      assert.equal(moved.edition, 2); assert.deepEqual(moved.events, ['P-001']);
      const carried = history.editions.before.leaves.find((row) => row.id === 'L-000117');
      assert.equal(carried.edition, 1); assert.deepEqual(carried.events, []);
      assert(!JSON.stringify(history).includes('PRIVATE'));
    }
  }
});

test('committed and rehashed operational changes cannot bypass complete candidate preservation', async (t) => {
  for (const [file, replace] of [
    ['logs/findings/history.yaml', (s) => s.replace('O-000001', 'O-000002')],
    ['logs/findings/history.yaml', (s) => s.replace('2026-08-19', '2026-08-20')],
    ['knowledge/_phoenix/P-001.yaml', (s) => s.replace('Component material moved', 'Different material moved')],
    ['knowledge/_phoenix/P-001.yaml', (s) => s.replace(/  - .*carried forward.*\n/, '')],
    ['knowledge/_phoenix/P-001.yaml', (s) => s + s.split('\n').find((line) => line.includes('carried forward')) + '\n'],
    ['knowledge/design-system/component-render-budget.md', (s) => s.replace('edition: 2', 'edition: 3')],
  ]) {
    const f = semanticFixture(t, { history: true, amendCandidate: (kit) => {
      const path = join(kit, file); const original = readFileSync(path, 'utf8'); const changed = replace(original);
      assert.notEqual(changed, original); writeFileSync(path, changed);
    } });
    const gate = await runPreparedMigrationGate({ repoRoot: f.root, source: f.source, candidate: f.candidate,
      migrationInputs: f.migrationInputs, limits: f.limits });
    assert.notEqual(gate.mechanicalStatus, 'passed', file);
  }
});
