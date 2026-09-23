import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentContinuationFixture, retainedAssignmentContinuationFixture, assignmentContinuationWireInput } from './helpers/assignment-continuation-fixture.js';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';
import { runFinalPreparedAssignmentGate } from '../payload/engine/lib/final-prepared-assignment.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { artifactCapture, retainPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';
import { runtimeLimits } from './helpers/final-assignment-fixture.js';
import { join } from 'node:path';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const api = () => import('../payload/engine/lib/prepared-assignment-continuation.js');
const wireCapture = ({ bytes, ...capture }) => ({ ...capture, bytesBase64: bytes.toString('base64') });
function wireInput(input) {
  return { eventId: input.eventId, reviewNote: input.reviewNote, limits: input.limits, impact: {}, maxEventBytes: 100000,
    decisionCaptures: input.decisionCaptures.map(wireCapture), continuation: { ...input.continuation,
      assessmentCaptures: input.continuation.assessmentCaptures.map(pair => ({ registry: wireCapture(pair.registry), identity: wireCapture(pair.identity) })),
      materialCaptures: input.continuation.materialCaptures.map(wireCapture) } };
}

test('v2 retained predicate binds actual original wire, sources, counters and nested version', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  const report = await runPreparedAssignmentGate(input);
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  const { isPreparedAssignmentContinuationReport } = await api();
  const expected = { source: input.before, candidate: input.candidate, operationInputs: wireInput(input) };
  assert.equal(isPreparedAssignmentContinuationReport(report, expected), true);
  // Bounds alone cannot authenticate the earlier measured work. The final
  // native owner must produce its own authoritative report from original input.
  const plausibleCounters = structuredClone(report);
  plausibleCounters.continuation.governance.used.documentNodes--;
  assert.equal(isPreparedAssignmentContinuationReport(plausibleCounters, expected), true);
  for (const attack of [
    gate => { gate.version = 1; },
    gate => { delete gate.continuation; },
    gate => { gate.continuation.version = 2; },
    gate => { gate.continuation.inputDigest = '0'.repeat(64); },
    gate => { gate.continuation.governance.used.captureBytes = 0; },
    gate => { gate.continuation.governance.used.extra = 0; },
    gate => { gate.continuation.governance.used.documentNodes = -1; },
    gate => { gate.continuation.governance.used.relevantRefusalRows = gate.continuation.governance.used.validationSteps + 1; },
    gate => { gate.continuation.governance.failure = { code: 'subject-validation-budget' }; },
    gate => { gate.checks.candidateCommitMembership.status = 'not-performed'; },
    gate => { gate.inputs.before.commit = input.candidate.commit; },
    gate => { gate.eventSource.eventId = 'a'.repeat(36); },
  ]) {
    const gate = structuredClone(report); attack(gate);
    // Resealing the caller's report does not restore its original binding.
    assert.equal(typeof canonicalSha256(gate), 'string');
    assert.equal(isPreparedAssignmentContinuationReport(gate, expected), false);
  }
  const changed = structuredClone(expected);
  changed.operationInputs.decisionCaptures[0].capture.source.commit = 'f'.repeat(40);
  assert.equal(isPreparedAssignmentContinuationReport(report, changed), false);
  const omitted = structuredClone(expected);
  delete omitted.operationInputs.continuation;
  assert.equal(isPreparedAssignmentContinuationReport(report, omitted), false);
});

test('failed-report wire grammar accepts large canonical material and refuses resealed invalid tails without decoding', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  input.continuation.limits.governance.maxSubjects = 0;
  const report = await runPreparedAssignmentGate(input);
  assert.equal(report.ok, false);
  const { isPreparedAssignmentContinuationReport } = await api();
  const expected = { source: input.before, candidate: input.candidate, operationInputs: wireInput(input) };
  assert.equal(isPreparedAssignmentContinuationReport(report, expected), true);
  const bytes = Buffer.alloc(4000000, 97);
  const capture = describeCandidateBytes({ file: 'large-material.txt', bytes, objectFormat: 'sha1' });
  const text = bytes.toString('base64');
  const original = Buffer.from;
  let decodes = 0;
  t.mock.method(Buffer, 'from', (value, ...args) => {
    if (args[0] === 'base64') decodes++;
    return original(value, ...args);
  });
  for (const [value, valid] of [[text, true], [`${text.slice(0, -4)}!Q==`, false],
    [`${text.slice(0, -4)}YR==`, false]]) {
    const wire = structuredClone(expected), diagnostic = structuredClone(report);
    wire.operationInputs.continuation.materialCaptures.push({ capture, objectFormat: 'sha1', bytesBase64: value });
    diagnostic.continuation.inputDigest = canonicalSha256({ version: 1,
      decisionCaptures: wire.operationInputs.decisionCaptures, continuation: wire.operationInputs.continuation });
    // This deliberately edits failed diagnostic transport, not an actual owner
    // success. Resealing cannot make a noncanonical wire value valid.
    assert.equal(isPreparedAssignmentContinuationReport(diagnostic, wire), valid);
    assert.equal(diagnostic.ok, false);
  }
  assert.equal(decodes, 0);
});

test('actual failed continuation report is diagnostics only, never v1 fallback or successful proof', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  input.continuation.limits.governance.maxCaptureBytes = 1;
  const report = await runPreparedAssignmentGate(input);
  assert.equal(report.ok, false);
  const { isPreparedAssignmentContinuationReport } = await api();
  const expected = { source: input.before, candidate: input.candidate, operationInputs: wireInput(input) };
  assert.equal(isPreparedAssignmentContinuationReport(report, expected), true);
  report.ok = true;
  assert.equal(isPreparedAssignmentContinuationReport(report, expected), false);
});

for (const options of [{ objectFormat: 'sha1', nested: false }, { objectFormat: 'sha256', nested: true }]) {
  test(`actual continued assignment prepared and final workers ${options.objectFormat} nested=${options.nested}`, async t => {
    const f = await retainedAssignmentContinuationFixture(t, options);
    assert.equal(f.retained.status, 'verified');
    const prior = JSON.parse(f.retained.artifacts.find(row => row.file === 'checks/operation/result').bytes);
    assert.equal(prior.version, 2);
    assert.equal(prior.ok, false); // Managed routes require the separate final capability check.
    assert.equal(prior.checks.eligibility.status, 'passed');
    assert.equal(prior.continuation.governance.failure, null);
    assert.equal(f.validation.report.checks.find(row => row.id === 'operation').exitCode, 1);
    const refs = f.git('show-ref'), index = f.git('write-tree');
    const final = await runFinalPreparedAssignmentGate(f.input);
    assert.equal(final.status, 'passed', JSON.stringify(final));
    assert.equal(final.gate.version, 2);
    assert.equal(final.gate.ok, true);
    assert.equal(final.gate.continuation.inputDigest, prior.continuation.inputDigest);
    assert.equal(final.gate.checks.candidateCommitMembership.status, 'passed');
    assert.equal(final.gate.checks.humanApproval.status, 'not-performed');
    assert.equal(f.git('show-ref'), refs);
    assert.equal(f.git('write-tree'), index);
  });
}

function reportVariant(f, edit) {
  const prior = JSON.parse(f.retained.artifacts.find(row => row.file === 'checks/operation/result').bytes);
  edit(prior);
  const bytes = Buffer.from(`${JSON.stringify(prior)}\n`), report = structuredClone(f.validation.report);
  const check = report.checks.find(row => row.id === 'operation');
  check.result = artifactCapture('checks/operation/result', bytes);
  check.stdout = artifactCapture('checks/operation/stdout', bytes);
  const artifacts = f.retained.artifacts.map(row => ({ file: row.file,
    bytes: ['checks/operation/result', 'checks/operation/stdout'].includes(row.file) ? bytes
      : row.file === 'report.json' ? canonicalJsonBytes(report) : row.bytes }));
  const expected = { ...f.input.expected, reportDigest: canonicalSha256(report) };
  const saved = retainPreparedEvidence({ evidenceDirectory: f.input.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: expected, artifacts });
  assert.equal(saved.status, 'retained');
  return { ...f.input, expected, validationBundleDigest: saved.bundleDigest };
}

test('retained v2 bounds reject malformed counters but fresh owner supplies actual measurements', async t => {
  const f = await retainedAssignmentContinuationFixture(t);
  const control = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(control.status, 'passed');
  for (const edit of [report => { report.version = 1; }, report => { delete report.continuation; },
    report => { report.continuation.governance.used.extra = 0; },
    report => { report.continuation.governance.used.documentNodes = -1; },
    report => { report.continuation.inputDigest = '0'.repeat(64); }]) {
    const result = await runFinalPreparedAssignmentGate(reportVariant(f, edit));
    assert.equal(result.status, 'failed');
    assert.equal(result.gate, null);
    assert.equal(result.diagnostics[0].code, 'final-assignment-continuation-report-invalid');
  }
  const plausible = await runFinalPreparedAssignmentGate(reportVariant(f, report => {
    report.continuation.governance.used.documentNodes--;
  }));
  assert.equal(plausible.status, 'passed');
  assert.deepEqual(plausible.gate.continuation.governance, control.gate.continuation.governance);
});

test('parent retains its verified operation buffers without a second unbounded file read', async t => {
  const original = fs.readFileSync;
  let secondReads = 0, f;
  fs.readFileSync = (file, ...args) => {
    if (/prepared-validation-[^/]+\/operation\.(stdout|stderr|result|event)$/.test(String(file))) secondReads++;
    return original(file, ...args);
  };
  syncBuiltinESMExports();
  try { f = await retainedAssignmentContinuationFixture(t); }
  finally { fs.readFileSync = original; syncBuiltinESMExports(); }
  assert.equal(f.retained.status, 'verified');
  assert.equal(secondReads, 0);
  assert.equal((await runFinalPreparedAssignmentGate(f.input)).status, 'passed');
});

test('retained typed selection requires its closed nonempty descriptor before evidence access', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  const { validTypedAssignmentSelection } = await api();
  const valid = { kind: 'typed-records', refs: [f.ref] };
  assert.equal(validTypedAssignmentSelection(valid), true);
  for (const selection of [{ ...valid, purpose: 'current' }, { ...valid, refs: [] },
    { ...valid, refs: [f.ref, f.ref] }]) {
    assert.equal(validTypedAssignmentSelection(selection), false);
    const operationInputs = { ...assignmentContinuationWireInput(input), selection };
    await assert.rejects(runPreparedCandidateChecks({ repoRoot: f.root, source: input.before, candidate: input.candidate,
      operation: 'subject-assignment', operationInputs, limits: runtimeLimits, evidenceDirectory: join(f.root, 'unused-evidence') }),
    /typed assignment requires an own-data closed selection/);
  }
});

test('fresh final refuses lost declared historical material source despite retained bytes', async t => {
  const f = await retainedAssignmentContinuationFixture(t);
  assert.equal((await runFinalPreparedAssignmentGate(f.input)).status, 'passed');
  const capture = f.options.continuation.materialCaptures.find(row => row.capture.source);
  assert.ok(capture);
  const commit = capture.capture.source.commit;
  assert.notEqual(commit, f.source.commit);
  fs.unlinkSync(join(f.root, '.git/objects', commit.slice(0, 2), commit.slice(2)));
  const failed = await runFinalPreparedAssignmentGate(f.input);
  assert.equal(failed.status, 'failed');
  assert.notEqual(failed.gate, null);
  assert.equal(failed.gate.ok, false);
  assert.ok(failed.gate.diagnostics.some(row => row.code === 'assignment-continuation-source-unavailable'), JSON.stringify(failed.gate.diagnostics));
});

test('final cleanup failure revokes the continued final status after a successful fresh owner', async t => {
  const f = await retainedAssignmentContinuationFixture(t);
  assert.equal((await runFinalPreparedAssignmentGate(f.input)).status, 'passed');
  const original = fs.rmSync;
  let failures = 0, result;
  fs.rmSync = (path, ...args) => {
    original(path, ...args);
    if (/\/final-assignment-[^/]+$/.test(String(path))) {
      failures++;
      throw Object.assign(new Error('fixture final cleanup'), { code: 'EACCES', errno: -13 });
    }
  };
  syncBuiltinESMExports();
  try { result = await runFinalPreparedAssignmentGate(f.input); }
  finally { fs.rmSync = original; syncBuiltinESMExports(); }
  assert.equal(failures, 1);
  assert.equal(result.gate.ok, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.at(-1).code, 'final-assignment-cleanup-failed');
});

test('resealed event bytes cannot replace the actual continued candidate event', async t => {
  const f = await retainedAssignmentContinuationFixture(t);
  assert.equal((await runFinalPreparedAssignmentGate(f.input)).status, 'passed');
  const original = f.retained.artifacts.find(row => row.file === 'checks/operation/event.yaml');
  const bytes = Buffer.concat([original.bytes, Buffer.from('\n# independently substituted retained bytes\n')]);
  const report = structuredClone(f.validation.report);
  report.eventSource.capture = artifactCapture(original.file, bytes);
  const expected = { ...f.input.expected, reportDigest: canonicalSha256(report) };
  const artifacts = f.retained.artifacts.map(row => ({ file: row.file, bytes: row.file === original.file ? bytes
    : row.file === 'report.json' ? canonicalJsonBytes(report) : row.bytes }));
  const saved = retainPreparedEvidence({ evidenceDirectory: f.input.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: expected, artifacts });
  assert.equal(saved.status, 'retained');
  const result = await runFinalPreparedAssignmentGate({ ...f.input, expected, validationBundleDigest: saved.bundleDigest });
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics.at(-1).code, 'final-assignment-event-mismatch');
});
