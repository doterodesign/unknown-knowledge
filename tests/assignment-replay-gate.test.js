import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assignmentGateFixture } from './helpers/assignment-gate-fixture.js';
import { queryBudgets } from './helpers/subject-query-fixture.js';
import { runAssignmentGate, runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';

const replay = () => ({ limits: { version: 1, maxSubjects: 3, maxEligibilityRedirects: 0,
  maxCases: 72, maxInventoryBytes: 100000 }, queryBudgets: { ...queryBudgets } });
const impact = () => ({ required: ['representativeReplays'], representativeReplays: replay() });

test('actual staged assignment gate runs the fixed recipe from its own contexts', async (t) => {
  const f = assignmentGateFixture(t, { afterIds: [] });
  const result = await runAssignmentGate({ ...f.options, impact: impact() });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.optionalImpact.representativeReplays.status, 'complete');
  assert.equal(result.optionalImpact.representativeReplays.inventory.cases.length, 72);
  const unrelated = result.optionalImpact.representativeReplays.comparison.cases.find(({ specification }) =>
    specification.query.where.op === 'assigned' && specification.query.where.subject === 'S-000003'
    && specification.query.view === 'current' && specification.query.expansion === 'direct');
  assert.deepEqual(unrelated.candidates.possible.removed.map(({ ref }) => ref.id), ['K-000001']);
  assert.equal(result.publicationReady, false);
  assert.equal(result.checks.humanApproval.status, 'not-performed');
});

test('actual required replay byte shortfall returns full unassessed inventory and fails impact policy', async (t) => {
  const f = assignmentGateFixture(t);
  const requested = impact(); requested.representativeReplays.limits.maxInventoryBytes = 1;
  const result = await runAssignmentGate({ ...f.options, impact: requested });
  assert.equal(result.ok, false);
  assert.equal(result.checks.impactPolicy.status, 'failed');
  const replay = result.optionalImpact.representativeReplays;
  assert.equal(replay.status, 'incomplete');
  assert.equal(replay.comparison.resources.queries.calls, 0);
  assert.equal(replay.comparison.coverage.unassessedCaseIds.length, 72);
  assert.ok(result.diagnostics.some(({ code }) => code === 'assignment-required-impact-incomplete'));
});

test('prepared replay uses committed candidate despite later HEAD, index and worktree drift', async (t) => {
  const f = assignmentGateFixture(t, { afterIds: [] });
  const tree = f.git('write-tree');
  const commit = f.git('commit-tree', tree, '-p', f.commit, '-m', 'Prepared replay candidate');
  const input = { ...f.options, impact: impact(), before: { commit: f.commit, tree: f.tree, kitPath: '.' },
    candidate: { commit, tree, kitPath: '.' } };
  const expected = await runPreparedAssignmentGate(input);
  assert.equal(expected.ok, true, JSON.stringify(expected.diagnostics));
  f.put('knowledge/K-000001.md', 'Later unrelated invalid content.');
  f.git('add', '.'); f.git('commit', '-qm', 'Later user work');
  f.put('knowledge/K-000001.md', 'Later staged content.'); f.git('add', '.');
  f.put('knowledge/K-000001.md', 'Later unstaged content.');
  const head = f.git('rev-parse', 'HEAD');
  const index = readFileSync(join(f.root, '.git/index'));
  const result = await runPreparedAssignmentGate(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.optionalImpact.representativeReplays, expected.optionalImpact.representativeReplays);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  assert.equal(f.read('knowledge/K-000001.md'), 'Later unstaged content.');
});
