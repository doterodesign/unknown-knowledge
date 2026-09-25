// Retrieval accuracy gate: `ask` against the development-v2 gold judgments.
//
// The judgments were written by independent source reviewers for the agent
// evaluation (acceptance/retrieval/development-v2). This test reuses them to
// score the engine alone: for each of the 48 tasks, does a complete answer
// bundle (or, for unanswerable tasks, the evidence behind the abstention)
// appear in the returned records? The stores are the committed canonical
// fixture. The floors below are the measured values when `ask` shipped;
// lowering one needs a Decision, not an edit here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGold, bundleDepth } from '../acceptance/retrieval/benchmark.js';
import { askPayload, loadAskIndex } from '../payload/engine/lib/ask-service.js';

test('ask retrieves every gold bundle within its default eight records', () => {
  const rows = loadGold().map((task) => {
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
