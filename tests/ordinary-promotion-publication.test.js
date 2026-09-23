import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decisionPromotionGateFixture } from './helpers/decision-promotion-gate-fixture.js';
import { decisionPromotionInputWire } from '../payload/engine/lib/decision-promotion-input.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import { runFinalPreparedPromotionGate } from '../payload/engine/lib/final-prepared-promotion.js';
import { readRetainedPreparedEvidence, artifactCapture, retainPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from '../payload/engine/lib/runtime-capability.js';
import { canonicalSha256, canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { load, dump } from 'js-yaml';
import { recordApprovedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { runtimeLimits, evidenceLimits } from './helpers/final-equivalent-merge-fixture.js';

for (const format of ['sha1', 'sha256']) test(`actual ${format} Decisions-only promotion retains original evidence and publishes through fresh review`, async (t) => {
  const f = await decisionPromotionGateFixture(t, { format });
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'promotion-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const source = f.input.before; const candidate = f.input.candidate;
  const operationInputs = { gateInput: decisionPromotionInputWire(f.input), maxEventBytes: 1000000 };
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation: 'ordinary-promotion',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  const expected = { source, candidate, operation: 'ordinary-promotion', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  assert.equal(retained.status, 'verified');
  // Fixture-only synthetic external profile, not inferred production approval.
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'], files: retained.runtimeManifest.files };
  const approvedRuntimeProfile = { digest: canonicalSha256(profile), profile };
  const input = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: retained.bundleDigest, expected, approvedRuntimeProfile,
    limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  const final = await runFinalPreparedPromotionGate(input);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  assert.equal(final.gate.publicationReady, false);
  assert.equal(final.gate.assignment.checks.humanApproval.status, 'not-performed');
  assert.deepEqual(final.gate.assignment.checks.impactPolicy.required, []);
  assert.equal(final.gate.assignment.optionalImpact.representativeReplays.status, 'not-assessed');
  const member = (file) => retained.artifacts.find((row) => row.file === file);
  assert.equal(final.gate.inputDigest, canonicalSha256(operationInputs.gateInput));
  assert.equal(validation.report.checks[2].invocation.injectedInputsDigest, canonicalSha256(operationInputs));
  const capture = (file) => artifactCapture(file, member(file).bytes);
  if (format === 'sha1') {
    assert.equal((await runFinalPreparedPromotionGate({ ...input, approvedRuntimeProfile: null })).status, 'failed');
    const event = load(member('checks/operation/event.yaml').bytes.toString());
    event.review.reference = 'substituted review with unchanged semantic event digest';
    for (const [file, bytes, code] of [
      ['checks/operation/event.yaml', Buffer.from(dump(event)), 'promotion-fresh-proof-mismatch'],
      ['checks/operation/capture-limits.json', canonicalJsonBytes({ maxEventBytes: 1 }), 'promotion-validation-incomplete'],
    ]) {
      const altered = retainPreparedEvidence({ evidenceDirectory, repoRoot: f.root, runtimeRoot: f.root, binding: expected,
        artifacts: retained.artifacts.map((row) => ({ file: row.file, bytes: row.file === file ? bytes : row.bytes })) });
      assert.equal(altered.status, 'retained');
      const denied = await runFinalPreparedPromotionGate({ ...input, validationBundleDigest: altered.bundleDigest });
      assert.equal(denied.status, 'failed'); assert.ok(denied.diagnostics.some((row) => row.code === code), JSON.stringify(denied));
    }
  }
  const capability = verifyRetainedRuntimeCapability({ evidenceDirectory, bundleDigest: retained.bundleDigest, expected, limits: evidenceLimits }, approvedRuntimeProfile);
  const request = { version: 1, operation: 'ordinary-promotion', namespace: f.event.namespace, objectFormat: format,
    source: { ref: 'refs/heads/source', expectedCommit: source.commit, tree: source.tree, kitPath: source.kitPath }, candidate,
    runtimeDigest: validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: retained.bundleDigest, reportDigest: validation.reportDigest },
    runtimeCapability: { profileDigest: approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'ordinary-promotion', publicationId: f.input.publication.id, createdRefs: final.gate.promotion.createdRefs,
      promotion: { inputDigest: final.gate.inputDigest, inputCapture: capture('checks/operation/input.json'),
        reportDigest: canonicalSha256(final.gate), reportCapture: capture('checks/operation/result') },
      assignmentEvent: { eventId: f.event.event, eventDigest: final.gate.assignment.eventSource.eventDigest,
        eventCapture: capture('checks/operation/event.yaml') }, finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, source.commit);
  const reviewLimits = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };
  const writer = (value = request) => ({ repoRoot: f.root, evidenceDirectory, request: value, approvedRuntimeProfile,
    limits: reviewLimits, executionLimits: runtimeLimits, authorization: { outcome: 'approved', requestDigest: canonicalSha256(value),
      reference: 'synthetic test operator approval', bytes: Buffer.from('Fixture approval for this exact request only.') } });
  if (format === 'sha1') {
    const wrong = structuredClone(request); wrong.namespace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await assert.rejects(recordApprovedCandidateReview(writer(wrong)), /promotion/);
    const changed = structuredClone(request); changed.operationEvidence.createdRefs.reverse();
    await assert.rejects(recordApprovedCandidateReview(writer(changed)), /promotion/);
  }
  const saved = await recordApprovedCandidateReview(writer());
  const publication = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: retained.bundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile,
    limits: { review: reviewLimits, execution: runtimeLimits, transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } };
  if (format === 'sha1') {
    f.git('update-ref', request.source.ref, candidate.commit);
    assert.equal((await publishPreparedCandidate(publication)).code, 'source-ref-stale');
    f.git('update-ref', request.source.ref, source.commit);
  }
  const index = readFileSync(join(f.root, '.git/index'));
  const published = await publishPreparedCandidate(publication);
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', request.publish.outputRef).toString().trim(), candidate.commit);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
});
