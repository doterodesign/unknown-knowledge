import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { subjectSplitAssignmentFixture } from './helpers/subject-split-assignment-fixture.js';
import { inspectSubjectSplitAssignmentScope } from '../payload/engine/lib/subject-split-core.js';
import { runPreparedSubjectSplitAssignmentGate as run } from '../payload/engine/lib/assignment-gate.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';

const counters = { captureBytes: 'maxCaptureBytes', documentNodes: 'maxDocumentNodes', documentTextUnits: 'maxDocumentTextUnits',
  subjects: 'maxSubjects', historyRows: 'maxHistoryRows', validationSteps: 'maxValidationSteps' };

test('split P8 continues one core allowance through before setup and every fixed row', async t => {
  const f = subjectSplitAssignmentFixture(t);
  const { core } = await f.withCoreInput(inspectSubjectSplitAssignmentScope);
  assert.equal(core.ok, true);
  const actual = await run(f.input);
  assert.equal(actual.assignment.ok, true, JSON.stringify(actual.assignment.diagnostics));
  assert.deepEqual(actual.core.resources.allocation, core.resources.allocation, 'no second allocation population pass');
  const used = actual.core.resources.governance.used;
  for (const counter of ['documentNodes', 'documentTextUnits', 'subjects', 'historyRows', 'validationSteps']) {
    assert.ok(used[counter] > core.resources.governance.used[counter], `${counter} includes actual additional work`);
  }
  const exact = Object.fromEntries(Object.entries(counters).map(([counter, limit]) => [limit, used[counter]]));
  const good = await run({ ...f.input, limits: { ...f.input.limits, governance: exact } });
  assert.equal(good.assignment.ok, true, JSON.stringify(good.assignment.diagnostics));
  assert.deepEqual(good.core.resources.governance.used, used);
  for (const [counter, limit] of Object.entries(counters)) await t.test(`one short ${limit}`, async () => {
    const failed = await run({ ...f.input, limits: { ...f.input.limits, governance: { ...exact, [limit]: exact[limit] - 1 } } });
    assert.equal(failed.assignment.ok, false);
    assert.equal(failed.core.resources.governance.failure.counter, counter);
    assert.ok(failed.core.resources.governance.used[counter] <= exact[limit] - 1);
    if (counter === 'validationSteps') {
      assert.equal(failed.core.ok, true, 'late continuation failure retains the actual successful core proof');
      assert.equal(failed.assignment.checks.eligibility.status, 'failed');
    }
  });
});

test('empty-target fixed rows still consume operation ownership steps', async t => {
  const f = subjectSplitAssignmentFixture(t, { beforeChange(h) { for (const owner of h.owners) owner.successors = []; } });
  const actual = await run(f.input); assert.equal(actual.assignment.ok, true, JSON.stringify(actual.assignment.diagnostics));
  const limit = actual.core.resources.governance.used.validationSteps - 1;
  const failed = await run({ ...f.input, limits: { ...f.input.limits, governance: { ...f.input.limits.governance, maxValidationSteps: limit } } });
  assert.equal(failed.core.ok, true);
  assert.equal(failed.assignment.ok, false);
  assert.equal(failed.core.resources.governance.failure.phase, 'governance-operation-binding');
  assert.equal(failed.assignment.checks.eligibility.status, 'failed');
});

test('assignment bytes independently include both authority Git captures and materialized rereads', async t => {
  const f = subjectSplitAssignmentFixture(t);
  const result = await run(f.input); assert.equal(result.assignment.ok, true, JSON.stringify(result.assignment.diagnostics));
  const read = (descriptor, file) => captureCommittedFile({ repoRoot: f.root, commit: descriptor.commit, file });
  let expected = 0;
  for (const file of ['subjects/registry.yaml', '_identity.yaml']) for (const side of ['before', 'candidate']) {
    expected += 2 * read(f.input[side], file).bytes.length;
  }
  for (const file of [...new Set(f.owners.map(row => row.file))]) {
    expected += read(f.input.before, file).bytes.length + 2 * read(f.input.candidate, file).bytes.length;
  }
  const locator = f.assignmentEvent.review['decision-capture'];
  const current = read(f.input.before, locator.file); expected += current.bytes.length;
  if (locator.source && JSON.stringify(current.locator.source) !== JSON.stringify(locator.source)) expected += read(locator.source, locator.file).bytes.length;
  assert.equal(result.assignment.used.captureBytes, expected, 'independent physical-read sum, not an echo of reported usage');
  const exact = { ...f.input.limits.assignments, maxCaptureBytes: expected, maxRecords: 3 };
  const good = await run({ ...f.input, limits: { ...f.input.limits, assignments: exact } });
  assert.equal(good.assignment.ok, true);
  for (const assignments of [{ ...exact, maxCaptureBytes: expected - 1 }, { ...exact, maxRecords: 2 }]) {
    const failed = await run({ ...f.input, limits: { ...f.input.limits, assignments } });
    assert.equal(failed.core.ok, true); assert.equal(failed.assignment.ok, false);
    assert.ok(failed.assignment.diagnostics.some(row => ['assignment-byte-budget', 'assignment-record-budget'].includes(row.code)));
  }
});

test('split P8 awaits cleanup, revokes success and preserves final cumulative counters', async t => {
  const f = subjectSplitAssignmentFixture(t);
  const good = await run(f.input); assert.equal(good.assignment.ok, true);
  const create = fs.mkdtempSync; const remove = fs.rmSync; const roots = []; let injected = false;
  fs.mkdtempSync = (...args) => { const root = create(...args); if (/unknown-knowledge-tree-/.test(String(args[0]))) roots.push(root); return root; };
  fs.rmSync = (path, options) => {
    remove(path, options);
    if (!injected && roots.length && path === roots[0]) { injected = true; throw new Error('one-shot split cleanup failure'); }
  };
  syncBuiltinESMExports(); let result;
  try { result = await run(f.input); }
  finally { fs.mkdtempSync = create; fs.rmSync = remove; syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.equal(result.assignment.checks.authorizer.status, 'passed');
  assert.equal(result.assignment.checks.impactPolicy.scope, 'split-impacts-owned-by-outer-gate');
  assert.equal(result.assignment.ok, false); assert.equal(result.assignment.publicationReady, false);
  assert.equal(result.assignment.checks.source.status, 'failed');
  assert.deepEqual(result.core.resources.governance, good.core.resources.governance);
  assert.ok(result.assignment.diagnostics.some(row => row.code === 'assignment-snapshot-unavailable'));
  for (const root of roots) assert.equal(fs.existsSync(root), false);
});
