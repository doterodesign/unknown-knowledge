import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';

import { assignmentReviewFixture } from './helpers/assignment-review-fixture.js';

test('assignment review retains actual event and original typed Decision locator after independently rerunning final gate', async (t) => {
  const f = await assignmentReviewFixture(t); const input = f.writer();
  const saved = await recordApprovedCandidateReview(input);
  assert.equal(saved.status, 'retained');
  const read = readRetainedCandidateReview({ evidenceDirectory: f.input.evidenceDirectory, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, validationBundleDigest: f.input.validationBundleDigest, limits: f.reviewLimits });
  assert.equal(read.status, 'verified');
  assert.deepEqual(read.receipt.review.decision, f.event.decision);
  assert.deepEqual(read.receipt.review.decisionCapture, f.event.review['decision-capture']);
  assert.equal(read.receipt.review.decisionDigest, f.event.review['decision-digest']);
  assert.equal(Object.hasOwn(read.receipt.review.decisionCapture, 'kind'), false);
  assert.equal(read.request.operationEvidence.finalGate.result.status, 'passed');
  assert.equal(read.manifest.artifacts.length, 3);
  const changed = f.writer(); changed.request.operationEvidence.finalGate.result.gate.used.captureBytes += 1;
  changed.request.operationEvidence.finalGate.resultDigest = canonicalSha256(changed.request.operationEvidence.finalGate.result);
  changed.authorization.requestDigest = canonicalSha256(changed.request);
  await assert.rejects(recordApprovedCandidateReview(changed), { code: 'review-final-gate-mismatch' });
  const wrongNamespace = f.writer(); wrongNamespace.request.namespace = '99999999-9999-4999-8999-999999999999';
  wrongNamespace.authorization.requestDigest = canonicalSha256(wrongNamespace.request);
  await assert.rejects(recordApprovedCandidateReview(wrongNamespace), { code: 'review-assignment-event-invalid' });
});
