import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { finalAssignmentFixture } from './helpers/final-assignment-fixture.js';
import { runFinalPreparedAssignmentGate } from '../payload/engine/lib/final-prepared-assignment.js';

const originalGate = (f) => JSON.parse(f.retained.artifacts.find((r) => r.file === 'checks/operation/result').bytes);
test('fresh captured final gate passes actual views/replays while retaining original failed report', async (t) => {
  const f = await finalAssignmentFixture(t); const initial = originalGate(f);
  assert.equal(initial.ok, false); assert.equal(initial.checks.impactPolicy.status, 'failed');
  const index = fs.readFileSync(join(f.root, '.git/index')); const refs = f.git('show-ref');
  const result = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
  assert.equal(result.gate.ok, true); assert.equal(result.gate.optionalImpact.regeneratedViews.status, 'complete');
  assert.equal(result.gate.optionalImpact.representativeReplays.status, 'complete');
  assert.deepEqual(result.routes, { scope: 'kit-managed-subject-route-persistence', managedPersistence: 'not-applicable', suppliedAssessment: 'not-supplied' });
  assert.equal(result.runtimeDigest, f.validation.runtimeDigest);
  assert.equal(result.gate.checks.humanApproval.status, 'not-performed');
  assert.equal(originalGate(f).ok, false);
  assert.equal(f.git('show-ref'), refs); assert.deepEqual(fs.readFileSync(join(f.root, '.git/index')), index);
});

test('unavailable capability and corrupted readback never infer route absence or source proof', async (t) => {
  const f = await finalAssignmentFixture(t);
  const missing = await runFinalPreparedAssignmentGate({ ...f.input, approvedRuntimeProfile: null });
  assert.equal(missing.status, 'failed'); assert.equal(missing.routes.managedPersistence, 'unavailable');
  assert.equal(missing.gate, null);
  const invalid = await runFinalPreparedAssignmentGate({ ...f.input, validationBundleDigest: '1'.repeat(64) });
  assert.equal(invalid.status, 'failed'); assert.equal(invalid.source, null); assert.equal(invalid.candidate, null);
  assert.equal(invalid.routes.suppliedAssessment, null); assert.equal(invalid.runtimeDigest, null);
});

test('a supplied incomplete route assessment blocks despite unsupported managed persistence', async (t) => {
  const f = await finalAssignmentFixture(t, (inputs) => {
    inputs.impact.routes = { inventory: { version: 1, coverage: 'partial', routes: [] }, limits: { version: 1, maxRoutes: 10 } };
  });
  const result = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(result.status, 'failed'); assert.equal(result.routes.suppliedAssessment, 'incomplete');
  assert.equal(result.gate.ok, false); assert.equal(result.gate.checks.impactPolicy.status, 'failed');
});

test('fresh replay shortfall stays incomplete and cannot be waived by route capability', async (t) => {
  const f = await finalAssignmentFixture(t, (inputs) => { inputs.impact.representativeReplays.limits.maxInventoryBytes = 1; });
  const result = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(result.status, 'failed'); assert.equal(result.gate.ok, false);
  assert.equal(result.gate.optionalImpact.representativeReplays.status, 'incomplete');
});

test('actual executing runtime drift refuses before spawning the final gate', async (t) => {
  const f = await finalAssignmentFixture(t); const original = fs.readFileSync;
  fs.readFileSync = (path, ...args) => {
    const value = original(path, ...args);
    if (String(path).endsWith('/engine/lib/final-assignment-check.js') && Buffer.isBuffer(value)) {
      const changed = Buffer.from(value); changed[0] = changed[0] === 47 ? 32 : 47; return changed;
    }
    return value;
  };
  syncBuiltinESMExports();
  let result;
  try { result = await runFinalPreparedAssignmentGate(f.input); }
  finally { fs.readFileSync = original; syncBuiltinESMExports(); }
  assert.equal(result.status, 'failed'); assert.equal(result.runtimeDigest, null); assert.equal(result.gate, null);
});

test('child failure and bounded output overflow retain no partial final report', async (t) => {
  const f = await finalAssignmentFixture(t); const original = childProcess.spawn;
  childProcess.spawn = (executable, args, options) => original(executable, ['-e', 'throw new TypeError("fixture unexpected final gate bug")'], options);
  syncBuiltinESMExports();
  try { await assert.rejects(runFinalPreparedAssignmentGate(f.input), (error) => {
    assert.equal(error.name, 'FinalAssignmentExecutionError');
    assert.match(error.execution.stderr.toString(), /TypeError: fixture unexpected final gate bug/);
    return true;
  }); }
  finally { childProcess.spawn = original; syncBuiltinESMExports(); }
  const overflow = await runFinalPreparedAssignmentGate({ ...f.input,
    limits: { ...f.input.limits, runtime: { ...f.input.limits.runtime, maxOutputBytesPerCheck: 1000 } } });
  assert.equal(overflow.status, 'failed'); assert.equal(overflow.gate, null);
});

test('a rehashed retained review-only event substitution cannot borrow the real candidate event', async (t) => {
  const f = await finalAssignmentFixture(t);
  const { load, dump } = await import('js-yaml');
  const { artifactCapture, retainPreparedEvidence } = await import('../payload/engine/lib/prepared-evidence.js');
  const { canonicalJsonBytes, canonicalSha256 } = await import('../payload/engine/lib/canonical-json.js');
  const original = f.retained.artifacts.find((row) => row.file === 'checks/operation/event.yaml');
  const event = load(original.bytes.toString()); event.review.reference = 'fixture substituted review only';
  const bytes = Buffer.from(dump(event));
  const report = structuredClone(f.validation.report);
  report.eventSource.capture = artifactCapture(original.file, bytes);
  const reportDigest = canonicalSha256(report);
  const binding = { ...f.input.expected, reportDigest };
  const artifacts = f.retained.artifacts.map((row) => ({ file: row.file,
    bytes: row.file === original.file ? bytes : row.file === 'report.json' ? canonicalJsonBytes(report) : row.bytes }));
  const retained = retainPreparedEvidence({ evidenceDirectory: f.input.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding, artifacts });
  assert.equal(retained.status, 'retained');
  const result = await runFinalPreparedAssignmentGate({ ...f.input, validationBundleDigest: retained.bundleDigest, expected: binding });
  assert.equal(result.status, 'failed');
  assert.ok(result.diagnostics.some(({ code }) => code === 'final-assignment-event-mismatch'), JSON.stringify(result.diagnostics));
});

test('own null routes never become an absent assessment when initial validation cannot retain the event', async (t) => {
  const f = await finalAssignmentFixture(t, (inputs) => { inputs.impact.routes = null; });
  const result = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(result.status, 'failed'); assert.equal(result.gate, null);
  assert.equal(result.routes.suppliedAssessment, 'incomplete');
  assert.equal(result.routes.managedPersistence, 'unavailable');
});

test('an empty supplied view inventory cannot waive actual required Subject-tree generation', async (t) => {
  const f = await finalAssignmentFixture(t, (inputs) => { inputs.impact.regeneratedViews.inventory.views = []; });
  const result = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(result.status, 'failed');
  assert.notEqual(result.gate, null, JSON.stringify(result.diagnostics));
  assert.equal(result.gate.optionalImpact.regeneratedViews.resources.derivations.calls, 0);
});

test('an unrelated supplied view kind cannot satisfy the fixed Subject-tree requirement', async (t) => {
  const f = await finalAssignmentFixture(t, (inputs) => { inputs.impact.regeneratedViews.inventory.views[0].kind = 'unrelated'; });
  const result = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(result.status, 'failed');
  assert.notEqual(result.gate, null, JSON.stringify(result.diagnostics));
  assert.equal(result.gate.optionalImpact.regeneratedViews.status, 'refused');
});

test('expected missing candidate objects preserve the complete fresh failed gate report', async (t) => {
  const f = await finalAssignmentFixture(t);
  const blob = f.git('rev-parse', `${f.candidate.commit}:subjects/_assignments/${f.options.eventId}.yaml`);
  fs.rmSync(join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  const result = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(result.status, 'failed');
  assert.notEqual(result.gate, null, JSON.stringify(result.diagnostics));
  assert.equal(result.gate.ok, false); assert.equal(result.gate.checks.source.status, 'failed');
});
