// Retrieval accuracy gate: `ask` against the development-v2 gold judgments.
//
// The judgments were written by independent source reviewers for the agent
// evaluation (acceptance/retrieval/development-v2). This test reuses them to
// score the engine alone: for each of the 48 tasks, does a complete answer
// bundle (or, for unanswerable tasks, the evidence behind the abstention)
// appear in the returned records? The floors below are the measured values
// when `ask` shipped; lowering one needs a Decision, not an edit here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_RUNTIME, materializeDevelopment } from '../acceptance/retrieval/materialize-development.js';
import { loadGold, bundleDepth } from '../acceptance/retrieval/benchmark.js';
import { askPayload, loadAskIndex } from '../payload/engine/lib/ask-service.js';

const repository = fileURLToPath(new URL('..', import.meta.url));
const pinned = spawnSync('git', ['cat-file', '-e', `${DEVELOPMENT_RUNTIME}^{commit}`], { cwd: repository }).status === 0;

test('ask retrieves every gold bundle within its default eight records', { skip: !pinned && 'pinned development runtime is not in local history' }, async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'uk-ask-gold-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const runtime = join(scratch, 'runtime');
  mkdirSync(runtime);
  const archive = spawnSync('git', ['--no-replace-objects', 'archive', DEVELOPMENT_RUNTIME, 'cli', 'payload', 'package.json', 'package-lock.json'],
    { cwd: repository, maxBuffer: 64 << 20 });
  assert.equal(archive.status, 0, String(archive.stderr));
  assert.equal(spawnSync('tar', ['-xf', '-', '-C', runtime], { input: archive.stdout }).status, 0);
  symlinkSync(join(repository, 'node_modules'), join(runtime, 'node_modules'), 'dir');
  const stores = join(scratch, 'stores');
  await materializeDevelopment({ destination: stores, runtime });

  const rows = loadGold(stores).map((task) => {
    const payload = askPayload(loadAskIndex(task.installations.map((i) => i.root)), {
      mode: 'search', text: task.prompt, where: [], countBy: null, under: null, limit: 8, top: 10,
    });
    const multi = task.installations.length > 1;
    const ranking = payload.records.map((r) => `${multi ? r.installation : task.installations[0].name}/${r.kind}/${r.id}`);
    return {
      id: task.id,
      answerable: task.answerable,
      depth: bundleDepth(task.answerable ? task.bundles : task.explanationBundles, ranking),
      tier: payload.confidence.tier,
    };
  });
  const within = (k) => rows.filter((r) => r.depth !== null && r.depth <= k).length;

  assert.equal(rows.length, 48);
  assert.deepEqual(rows.filter((r) => r.depth === null).map((r) => r.id), [], 'every bundle within eight');
  assert.ok(within(3) >= 37, `bundle within three: ${within(3)}/48`);
  assert.ok(within(1) >= 28, `bundle at rank one: ${within(1)}/48`);
  // The tiers' safety properties: no unanswerable task is ever called covered,
  // and no task with relevant records is ever called none.
  assert.deepEqual(rows.filter((r) => !r.answerable && r.tier === 'covered').map((r) => r.id), []);
  assert.deepEqual(rows.filter((r) => r.tier === 'none').map((r) => r.id), []);
});
