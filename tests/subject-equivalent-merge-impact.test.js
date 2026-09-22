import test from 'node:test';
import assert from 'node:assert/strict';
import { equivalentMergeFixture } from './helpers/equivalent-merge-fixture.js';
import { inspectEquivalentMergeAssignmentScope } from '../payload/engine/lib/subject-equivalent-merge-core.js';
import { assessEquivalentMergeImpacts } from '../payload/engine/lib/subject-equivalent-merge-impact.js';

async function assess(f, overrides = {}) {
  return f.withCoreInput(async (input) => {
    const core = await inspectEquivalentMergeAssignmentScope(input);
    assert.equal(core.ok, true, JSON.stringify(core.diagnostics));
    return assessEquivalentMergeImpacts({ core, limits: { ...f.input.limits, ...overrides },
      before: { context: input.before.context, capturedInputRef: input.before.descriptor.commit },
      after: { context: input.candidate.context, capturedInputRef: input.candidate.descriptor.commit } });
  });
}

test('mandatory complete tree/replay coexist with honestly incomplete reach for retained unknowns', async (t) => {
  const f = equivalentMergeFixture(t); const result = await assess(f);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.reach.status, 'incomplete');
  assert.equal(result.reach.unknownImpact.length, 2);
  assert.equal(result.subjectTree.status, 'complete');
  assert.equal(result.subjectTree.coverage.assessedViews, 1);
  assert.equal(result.representativeReplays.status, 'complete');
  const after = result.subjectTree.views[0].after;
  assert.deepEqual(after.artifacts.map(({ path }) => path), ['subjects/derived/tree.md', 'subjects/derived/metadata.json']);
  assert.match(after.artifacts[0].text, /S-000001.*retired/);
});

test('retained unknowns cannot excuse a reach traversal shortfall', async (t) => {
  const f = equivalentMergeFixture(t);
  const result = await assess(f, { reach: { ...f.input.limits.reach, maxHierarchyNodes: 0 } });
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-reach-incomplete');
});

test('a zero-view limit cannot waive the required whole-registry output pair', async (t) => {
  const f = equivalentMergeFixture(t);
  const result = await assess(f, { views: { version: 1, maxViews: 0 } });
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-tree-incomplete');
});
