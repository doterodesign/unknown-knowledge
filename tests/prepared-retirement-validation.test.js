import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { preparedOperationEntrypoint } from '../payload/engine/lib/prepared-validation-policy.js';
import { subjectRetirementAssignmentFixture } from './helpers/subject-retirement-assignment-fixture.js';
import { subjectRetirementInputWire } from '../payload/engine/lib/subject-retirement-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const policy = { id: 'subject-retirement-publication-v1', version: 1, impactPolicy: 'plain-retirement-impact-v1',
  requiredImpact: ['reach', 'subjectTree', 'representativeReplays', 'routes'], routeEvidence: 'runtime-capability' };
const limits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };

test('retirement has its separate fixed publication policy and prepared entrypoint', () => {
  const actual = JSON.parse(readFileSync(new URL('../payload/engine/policies/candidate-publication.json', import.meta.url)));
  assert.deepEqual(actual.operations['subject-retirement'], policy);
  assert.deepEqual(preparedOperationEntrypoint('subject-retirement'), { id: 'operation', path: 'engine/lib/prepared-subject-retirement-check.js' });
  assert.equal(preparedOperationEntrypoint('retire'), null);
});

for (const zero of [true, false]) test(`actual retirement runner retains ${zero ? 'registry only' : 'registry and nonempty event'} with original input binding`, async t => {
  const f = subjectRetirementAssignmentFixture(t, { zero });
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'retirement-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: subjectRetirementInputWire(f.input), captureLimits: {
    maxRegistryBytes: Buffer.byteLength(f.read('subjects/registry.yaml')),
    maxEventBytes: zero ? 1 : Buffer.byteLength(f.read(`subjects/_assignments/${f.input.operation.assignmentEvent.id}.yaml`)),
  } };
  const input = { repoRoot: f.root, source: f.input.before, candidate: f.input.candidate,
    operation: 'subject-retirement', operationInputs, limits, evidenceDirectory };
  const { runPreparedCandidateChecks } = await import('../payload/engine/lib/prepared-validation.js');
  const { readRetainedPreparedEvidence } = await import('../payload/engine/lib/prepared-evidence.js');
  const result = await runPreparedCandidateChecks(input);
  assert.equal(result.retention.status, 'retained', JSON.stringify(result));
  const expected = { source: input.source, candidate: input.candidate, operation: input.operation,
    runtimeDigest: result.runtimeDigest, reportDigest: result.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: result.retention.bundleDigest, expected, limits: evidenceLimits });
  assert.equal(retained.status, 'verified', JSON.stringify(retained));
  const member = file => retained.artifacts.find(row => row.file === `checks/operation/${file}`);
  assert.deepEqual(JSON.parse(member('input.json').bytes), operationInputs.gateInput);
  assert.deepEqual(JSON.parse(member('capture-limits.json').bytes), operationInputs.captureLimits);
  const gate = JSON.parse(member('result').bytes);
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  assert.equal(gate.inputDigest, canonicalSha256(operationInputs.gateInput));
  assert.equal(gate.sources.registryCapture.sha256, member('registry.yaml').sha256);
  assert.equal(Boolean(member('event.yaml')), !zero);
  if (zero) assert.equal(gate.sources.assignmentEvent, null);
  else assert.equal(gate.sources.assignmentEvent.eventCapture.sha256, member('event.yaml').sha256);
  assert.equal(result.report.checks.find(row => row.id === 'operation').invocation.injectedInputsDigest, canonicalSha256(operationInputs));
  assert.ok(result.report.checks.every(row => row.status === 'passed'));
  assert.equal(retained.runtimeManifest.entrypoints[2].path, 'engine/lib/prepared-subject-retirement-check.js');
  for (const capacity of zero ? ['maxRegistryBytes'] : ['maxRegistryBytes', 'maxEventBytes']) {
    const short = { ...input, operationInputs: { ...operationInputs,
      captureLimits: { ...operationInputs.captureLimits, [capacity]: operationInputs.captureLimits[capacity] - 1 } } };
    await assert.rejects(runPreparedCandidateChecks(short), /retirement.*capture/);
  }
});
