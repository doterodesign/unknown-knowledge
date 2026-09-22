import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparedReconsiderationFixture } from './helpers/prepared-reconsideration-fixture.js';
import { inspectSubjectReconsiderationGateFromWire } from '../payload/engine/lib/subject-reconsideration-gate.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';
import { evidenceLimits } from './helpers/prepared-reconsideration-fixture.js';

test('actual healthy wire owner precedes retained reconsideration worker dispatch', async t => {
  const f = preparedReconsiderationFixture(t);
  const control = await inspectSubjectReconsiderationGateFromWire({ repoRoot: f.repoRoot, gateInput: f.gateInput });
  assert.equal(control.ok, true, JSON.stringify(control.diagnostics));
  t.diagnostic('Actual bounded wire gate passed before prepared dispatch.');
  const validation = await runPreparedCandidateChecks(f.runnerInput);
  assert.equal(validation.retention.status, 'retained');
  assert.equal(validation.report.operation, 'subject-reconsideration');
  assert.equal(validation.report.eventSource, null);
  assert.deepEqual(validation.report.checks.map(row => [row.id, row.status, row.exitCode]),
    [['structural', 'passed', 0], ['values', 'passed', 0], ['operation', 'passed', 0]]);
  const retained = readRetainedPreparedEvidence({ evidenceDirectory: f.evidenceDirectory,
    bundleDigest: validation.retention.bundleDigest,
    expected: { source: f.source, candidate: f.candidate, operation: 'subject-reconsideration',
      runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest }, limits: evidenceLimits });
  assert.equal(retained.status, 'verified');
  const member = file => retained.artifacts.find(row => row.file === `checks/operation/${file}`);
  assert.ok(member('registry.yaml')); assert.ok(member('identity.yaml'));
  assert.equal(member('event.yaml'), undefined);
  assert.deepEqual(member('stdout').bytes, member('result').bytes);
  assert.equal(retained.artifacts.length, retained.runtimeManifest.files.length + 18);
});
