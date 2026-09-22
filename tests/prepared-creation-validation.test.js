import test from 'node:test';
import assert from 'node:assert/strict';
import { preparedCreationFixture, evidenceLimits } from './helpers/prepared-creation-fixture.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';

test('fixed ordinary creation worker retains actual eventless proof and two authority artifacts', async t => {
  const f = preparedCreationFixture(t);
  const result = await runPreparedCandidateChecks(f.runnerInput);
  assert.equal(result.retention?.status, 'retained', JSON.stringify(result));
  const retained = readRetainedPreparedEvidence({ evidenceDirectory: f.evidenceDirectory, bundleDigest: result.retention.bundleDigest,
    expected: { source: f.before, candidate: f.candidate, operation: 'subject-creation', runtimeDigest: result.runtimeDigest,
      reportDigest: result.reportDigest }, limits: evidenceLimits });
  assert.equal(retained.status, 'verified', JSON.stringify(retained.diagnostics));
  assert.equal(retained.report.checks.find(row => row.id === 'operation').status, 'passed');
  for (const file of ['registry.yaml', 'identity.yaml']) assert.ok(retained.artifacts.some(row => row.file === `checks/operation/${file}`));
  assert.equal(retained.artifacts.some(row => row.file === 'checks/operation/event.yaml'), false);
});
