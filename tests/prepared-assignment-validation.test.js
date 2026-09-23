import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { queryBudgets } from './helpers/subject-query-fixture.js';
import { assignmentGateFixture } from './helpers/assignment-gate-fixture.js';
import { readRetainedPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';

// Requires the reviewed P8 prepared adapter and its actual fixture, integrated in 3f31fa4.
for (const [replayOutputLimit, maxEventBytes, workerFailure = false] of [[null, 100000], [null, 1], [1_000_000, 100000], [8_000_000, 100000], [null, 100000, true], [null, 100000, 'provenance']]) test(`fixed runner retains assignment evidence (output=${replayOutputLimit}, event=${maxEventBytes}, workerFailure=${workerFailure})`, async (t) => {
  const withReplay = replayOutputLimit !== null;
  const f = assignmentGateFixture(t);
  const tree = f.git('write-tree');
  const commit = f.git('commit-tree', tree, '-p', f.commit, '-m', 'prepared assignment');
  const base = mkdtempSync(join(tmpdir(), 'assignment-validation-evidence-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const evidenceDirectory = join(base, 'evidence'); mkdirSync(evidenceDirectory, { mode: 0o700 });
  const source = { commit: f.commit, tree: f.tree, kitPath: '.' };
  const candidate = { commit, tree, kitPath: '.' };
  const { repoRoot, decisionCaptures, impact, ...inputs } = f.options;
  const requestedImpact = withReplay ? { representativeReplays: {
    limits: { version: 1, maxSubjects: 10, maxEligibilityRedirects: 10, maxCases: 200, maxInventoryBytes: 1000000 }, queryBudgets } } : {};
  const operationInputs = { ...inputs, maxEventBytes, impact: requestedImpact, decisionCaptures: decisionCaptures.map(({ bytes, ...capture }) => ({ ...capture, bytesBase64: bytes.toString('base64') })) };
  const input = { repoRoot, source, candidate, operation: 'subject-assignment', operationInputs, evidenceDirectory,
    limits: { maxRuntimeFiles: 1000, maxRuntimeBytes: 20_000_000, maxOutputBytesPerCheck: replayOutputLimit ?? 1_000_000, maxCheckMilliseconds: 20_000 } };
  const index = readFileSync(join(f.root, '.git/index'));
  const eventPath = join(f.root, `subjects/_assignments/${inputs.eventId}.yaml`);
  const expectedEventBytes = readFileSync(eventPath);
  writeFileSync(eventPath, 'dirty working event');
  if (workerFailure === 'provenance') input.candidate = { ...candidate, tree: '0'.repeat(40) };
  const originalSpawn = childProcess.spawn; let result;
  if (workerFailure === true) {
    childProcess.spawn = (executable, args, options) => originalSpawn(executable, ['-e', 'process.exit(7)'], options);
    syncBuiltinESMExports();
  }
  try { result = await runPreparedCandidateChecks(input); }
  finally { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); }
  assert.equal(result.retention.status, 'retained');
  const op = result.report.checks.find(({ id }) => id === 'operation');
  if (workerFailure) {
    assert.equal(result.report.execution.exitCode, workerFailure === true ? 7 : 0);
    assert.equal(result.report.eventSource, null);
    assert.ok(result.report.diagnostics.some(({ code }) => code === 'assignment-event-unavailable'));
    assert.equal(op.status, 'not-performed'); assert.equal(op.result, null);
    return;
  }
  assert.equal(op.status, 'failed');
  if (replayOutputLimit === 1_000_000) {
    assert.equal(op.reason, 'output-limit'); assert.equal(op.completion, 'interrupted');
    assert.equal(op.result, null); assert.equal(op.signal, 'SIGKILL');
    assert.equal(result.report.eventSource, null);
    assert.ok(op.stdout.size + op.stderr.size <= replayOutputLimit);
    assert.equal(result.report.validationComplete, false); assert.equal(result.report.publicationReady, false);
    return;
  }
  assert.equal(op.exitCode, 1, JSON.stringify(op)); assert.equal(op.completion, 'complete');
  const actual = JSON.parse(readFileSync(join(evidenceDirectory, 'blobs/sha256', op.result.sha256)));
  const expected = await runPreparedAssignmentGate({ ...f.options, before: source, candidate,
    impact: { ...requestedImpact, required: ['routes', 'regeneratedViews', 'representativeReplays'] } });
  assert.deepEqual(actual, expected);
  const reopened = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: result.retention.bundleDigest,
    expected: { source, candidate, operation: input.operation, runtimeDigest: result.runtimeDigest, reportDigest: result.reportDigest },
    limits: { maxManifestBytes: 1000000, maxArtifacts: 2000, maxArtifactBytes: 20000000, maxTotalArtifactBytes: 80000000 } });
  assert.equal(reopened.status, 'verified');
  if (maxEventBytes === 1) {
    assert.equal(result.report.eventSource, null);
    assert.ok(result.report.diagnostics.some(({ code }) => code === 'assignment-event-unavailable'));
    assert.equal(reopened.artifacts.some(({ file }) => file === 'checks/operation/event.yaml'), false);
  } else {
    assert.deepEqual(result.report.eventSource, { ...actual.eventSource, capture: result.report.eventSource.capture });
    const eventBytes = reopened.artifacts.find(({ file }) => file === result.report.eventSource.capture.file).bytes;
    assert.deepEqual(eventBytes, expectedEventBytes);
  }
  assert.equal(readFileSync(eventPath, 'utf8'), 'dirty working event');
  if (withReplay) {
    assert.equal(actual.optionalImpact.representativeReplays.status, 'complete');
    assert.ok(actual.optionalImpact.representativeReplays.comparison.cases.length > 0);
  }
  assert.equal(actual.checks.candidateCommitMembership.status, 'passed');
  assert.equal(actual.checks.impactPolicy.status, 'failed');
  assert.equal(actual.checks.humanApproval.status, 'not-performed');
  assert.equal(actual.publicationReady, false);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  await assert.rejects(runPreparedCandidateChecks({ ...input,
    operationInputs: { ...operationInputs, impact: { required: [] } } }), /closed migration or assignment inputs/);
});
