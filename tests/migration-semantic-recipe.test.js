import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { loadStores } from '../payload/engine/compatibility/identity-migration-08066b5/engine/lib/load-stores.js';
import { buildMigrationReplayRecipe } from '../payload/engine/lib/migration-semantic-recipe.js';

const model = () => loadStores(resolve('tests/fixtures/migration-08066b5'));
const limits = { maxCases: 500, maxInventoryBytes: 100000, maxGeneratedBytes: 1000000 };
test('recipe reserves the complete actual vocabulary/path inventory and fixed native document adapters', () => {
  const recipe = buildMigrationReplayRecipe(model(), '2026-09-01', limits);
  assert.equal(recipe.version, 1);
  assert.deepEqual(recipe.documents.map((row) => row.path), ['../migration-replays/probe.md', '../migration-replays/probe.txt']);
  for (const value of ['Component', 'add-component', 'latency']) assert(recipe.cases.some((row) => row.kind === 'query' && row.value === value));
  assert(recipe.cases.some((row) => row.kind === 'path' && row.value === 'src/feed/latency.ts'));
  assert.equal(recipe.documents[0].nativeSections, 3); assert.equal(recipe.documents[1].nativeSections, 1);
  assert.equal(new Set(recipe.cases.map((row) => JSON.stringify([row.kind, row.value]))).size, recipe.cases.length);
  const second = model(); second.leaves = new Map([...second.leaves].reverse());
  assert.deepEqual(buildMigrationReplayRecipe(second, '2026-09-01', limits), recipe);
});
test('case/byte shortfall, noncalendar date and unsupported empty inventory refuse before replay', () => {
  for (const change of [{ maxCases: 1 }, { maxInventoryBytes: 1 }, { maxGeneratedBytes: 0 }]) {
    assert.throws(() => buildMigrationReplayRecipe(model(), '2026-09-01', { ...limits, ...change }));
  }
  assert.throws(() => buildMigrationReplayRecipe(model(), '2026-02-30', limits));
  const empty = model(); empty.leaves.clear();
  assert.throws(() => buildMigrationReplayRecipe(empty, '2026-09-01', limits));
});
