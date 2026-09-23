import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { subjectUseAssignmentFixture } from './helpers/subject-use-assignment-fixture.js';
import { equivalentMergeInputWire } from '../payload/engine/lib/subject-equivalent-merge-input.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const limits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
test('actual equivalent merge runner retains exact owner input/result and independently bounded raw registry/event captures', async (t) => {
  const f = subjectUseAssignmentFixture(t); const evidenceDirectory = mkdtempSync(join(f.root, '..', 'merge-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: equivalentMergeInputWire(f.input), captureLimits: { maxRegistryBytes: 1000000, maxEventBytes: 1000000 } };
  const input = { repoRoot: f.root, source: f.input.before, candidate: f.input.candidate,
    operation: 'subject-equivalent-merge', operationInputs, limits, evidenceDirectory };
  const actual = await runPreparedCandidateChecks(input);
  assert.equal(actual.retention.status, 'retained');
  const expected = { source: input.source, candidate: input.candidate, operation: input.operation,
    runtimeDigest: actual.runtimeDigest, reportDigest: actual.reportDigest };
  const read = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: actual.retention.bundleDigest, expected, limits: evidenceLimits });
  assert.equal(read.status, 'verified');
  const member = (file) => read.artifacts.find((row) => row.file === file);
  assert.deepEqual(JSON.parse(member('checks/operation/input.json').bytes), operationInputs.gateInput);
  assert.deepEqual(JSON.parse(member('checks/operation/capture-limits.json').bytes), operationInputs.captureLimits);
  const gate = JSON.parse(member('checks/operation/result').bytes);
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics)); assert.equal(gate.publicationReady, false);
  assert.equal(gate.inputDigest, canonicalSha256(operationInputs.gateInput));
  assert.equal(gate.sources.registryCapture.sha256, member('checks/operation/registry.yaml').sha256);
  assert.equal(gate.sources.assignmentEvent.eventCapture.sha256, member('checks/operation/event.yaml').sha256);
  assert.equal(actual.report.checks[2].invocation.injectedInputsDigest, canonicalSha256(operationInputs));
  assert.equal(read.runtimeManifest.entrypoints[2].path, 'engine/lib/prepared-equivalent-merge-check.js');
  const denied = { ...input, operationInputs: { ...operationInputs, captureLimits: { ...operationInputs.captureLimits, maxRegistryBytes: 1 } } };
  await assert.rejects(runPreparedCandidateChecks(denied), /merge.*capture/i);
});
