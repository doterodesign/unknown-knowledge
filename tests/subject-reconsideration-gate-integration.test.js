import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { subjectReconsiderationGateFixture } from './helpers/subject-reconsideration-gate-fixture.js';
import { inspectSubjectReconsiderationGate } from '../payload/engine/lib/subject-reconsideration-gate.js';

const passed = report => assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
const diagnostic = (report, code) => assert.ok(report.diagnostics.some(row => row.code === code), JSON.stringify(report.diagnostics));

test('nested SHA-256 actual gate preserves Git state, unknown records and eventless proof', async t => {
  const f = subjectReconsiderationGateFixture(t, { objectFormat: 'sha256', nested: true, parent: true, related: true });
  const head = f.git('rev-parse', 'HEAD'), status = f.git('status', '--porcelain=v1');
  const index = fs.readFileSync(join(f.repoRoot, '.git', 'index'));
  const report = await inspectSubjectReconsiderationGate(f.gateInput());
  passed(report);
  assert.equal(report.publicationReady, false);
  assert.equal(report.assignments, null);
  assert.equal(report.sources.assignmentEvent, null);
  assert.equal(report.sources.registryEvents.length, 1);
  assert.equal(report.core.ownerPreservation.changedPaths.length, 2);
  assert.ok(report.core.ownerPreservation.unknownAssignments.length > 0);
  assert.equal(report.impacts.replays.coverage.assessmentComplete, true);
  assert.equal(report.impacts.replays.coverage.membershipComplete, false);
  assert.deepEqual(report.impacts.replays.scope.stores, ['knowledge', 'ontology', 'decisions']);
  for (const side of ['before', 'after']) {
    assert.equal(report.resources.contexts[side].failure, null);
    assert.ok(report.resources.contexts[side].sourceBytes > 0);
    assert.equal(report.resources.contexts[side].outputBytesWritten, 0);
  }
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(f.git('status', '--porcelain=v1'), status);
  assert.ok(fs.readFileSync(join(f.repoRoot, '.git', 'index')).equals(index));
});

test('owned gate evidence and impact metadata survive caller mutation after invocation', async t => {
  const f = subjectReconsiderationGateFixture(t);
  const control = await inspectSubjectReconsiderationGate(f.gateInput());
  passed(control);
  const input = f.gateInput();
  const pending = inspectSubjectReconsiderationGate(input);
  input.evidence.materialCaptures[0].bytes.fill(0);
  input.impact.replays.maxCases = 0;
  const actual = await pending;
  passed(actual);
  assert.equal(actual.inputDigest, control.inputDigest);
  assert.equal(actual.core.inputDigest, control.core.inputDigest);
  assert.deepEqual(actual.impacts.replays.inventory, control.impacts.replays.inventory);
});

test('gate digest binds impact capacities while preserving the core input identity', async t => {
  const f = subjectReconsiderationGateFixture(t);
  const initial = await inspectSubjectReconsiderationGate(f.gateInput());
  passed(initial);
  const impact = structuredClone(f.impact);
  impact.replays.maxCases++;
  const changed = await inspectSubjectReconsiderationGate(f.gateInput({ impact }));
  passed(changed);
  assert.equal(changed.core.inputDigest, initial.core.inputDigest);
  assert.notEqual(changed.inputDigest, initial.inputDigest);
});

test('closed gate rejects accessors, omitted capacities and supplied proof before snapshots', async t => {
  const f = subjectReconsiderationGateFixture(t);
  let getterCalls = 0;
  const trapped = Object.defineProperty(f.gateInput(), 'impact', {
    enumerable: true, get() { getterCalls++; throw new Error('must not invoke'); },
  });
  const missing = structuredClone(f.impact);
  delete missing.replays.maxQualificationRedirects;
  for (const [input, code] of [
    [trapped, 'invalid-reconsideration-gate-input'],
    [f.gateInput({ impact: missing }), 'invalid-reconsideration-gate-limits'],
    [f.gateInput({ core: { ok: true } }), 'invalid-reconsideration-gate-input'],
  ]) {
    const report = await inspectSubjectReconsiderationGate(input);
    assert.equal(report.ok, false);
    assert.equal(report.core.ok, false);
    assert.equal(report.inputDigest, null);
    assert.deepEqual(report.resources.contexts, { before: null, after: null });
    diagnostic(report, code);
  }
  assert.equal(getterCalls, 0);
});

test('each mandatory impact capacity refuses without erasing the successful core', async t => {
  const f = subjectReconsiderationGateFixture(t);
  const cases = [
    ['reach', impact => { impact.reach.maxRecords = 0; }, 'reconsideration-reach-incomplete'],
    ['view inventory', impact => { impact.views.maxViews = 0; }, 'reconsideration-tree-incomplete'],
    ['tree traversal', impact => { impact.tree.budget.nodes = 0; }, 'reconsideration-tree-incomplete'],
    ['replay inventory', impact => { impact.replays.maxCases = 0; }, 'reconsideration-replays-incomplete'],
  ];
  for (const [name, edit, code] of cases) await t.test(name, async () => {
    const impact = structuredClone(f.impact); edit(impact);
    const report = await inspectSubjectReconsiderationGate(f.gateInput({ impact }));
    assert.equal(report.ok, false);
    assert.equal(report.core.ok, true, JSON.stringify(report.core.diagnostics));
    assert.equal(report.assignments, null);
    diagnostic(report, code);
    if (name === 'replay inventory') {
      assert.equal(report.impacts.replays.resources.eligibility.attempted, 0);
      assert.equal(report.impacts.replays.comparison, null);
    }
  });
});

test('fresh-context exhaustion is reported separately from core and before-context work', async t => {
  const f = subjectReconsiderationGateFixture(t);
  const impact = structuredClone(f.impact);
  impact.contexts.after.validation.maxCaptureBytes = 0;
  const report = await inspectSubjectReconsiderationGate(f.gateInput({ impact }));
  assert.equal(report.ok, false);
  assert.equal(report.core.ok, true);
  assert.equal(report.resources.core.governance.failure, null);
  assert.equal(report.resources.contexts.before.failure, null);
  assert.equal(report.resources.contexts.after.failure.counter, 'captureBytes');
  assert.equal(report.resources.contexts.after.validation.captureBytes, 0);
  assert.equal(report.impacts, null);
});

test('impact closure retains admitted sections and refuses the next report section', async t => {
  const f = subjectReconsiderationGateFixture(t);
  const impact = structuredClone(f.impact);
  impact.closure.maxRows = 4; // Two bindings, reach and tree; replay would be fifth.
  const report = await inspectSubjectReconsiderationGate(f.gateInput({ impact }));
  assert.equal(report.ok, false);
  assert.equal(report.core.ok, true);
  assert.equal(report.resources.closure.used.rows, 4);
  assert.equal(report.resources.closure.failure.counter, 'rows');
  assert.ok(report.impacts.reach);
  assert.ok(report.impacts.subjectTree);
  assert.equal(report.impacts.replays, null);
  diagnostic(report, 'reconsideration-impact-closure-budget');
});

test('fresh snapshot cleanup failure clears gate success after complete impact checks', async t => {
  const f = subjectReconsiderationGateFixture(t);
  const original = fs.rmSync;
  let snapshotCleanups = 0;
  fs.rmSync = (path, ...args) => {
    original(path, ...args);
    if (String(path).includes('unknown-knowledge-tree-') && ++snapshotCleanups === 3) {
      throw Object.assign(new Error('independent fresh snapshot cleanup refusal'), { code: 'EACCES', errno: -13 });
    }
  };
  syncBuiltinESMExports();
  let report;
  try { report = await inspectSubjectReconsiderationGate(f.gateInput()); }
  finally { fs.rmSync = original; syncBuiltinESMExports(); }
  assert.ok(snapshotCleanups >= 4);
  assert.equal(report.core.ok, true);
  assert.equal(report.impacts.replays.coverage.assessmentComplete, true);
  assert.ok(report.checks.every(check => check.passed));
  assert.equal(report.ok, false);
  assert.equal(report.publicationReady, false);
  diagnostic(report, 'reconsideration-impact-unavailable');
  assert.match(report.diagnostics.at(-1).message, /snapshot cleanup failed.*<candidate-impact-snapshot>/);
});
