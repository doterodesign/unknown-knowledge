/** Final reviewed publication boundary: actual evidence/gates first, one bounded ref CAS last. */
import { isDeepStrictEqual } from 'node:util';
import { EngineRefusal } from './engine-refusal.js';
import { readRetainedCandidateReview, verifyCandidateReviewEvidence } from './candidate-review.js';
import { compareAndSwapCandidateRef } from './candidate-ref-transaction.js';

const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const hash = (v) => typeof v === 'string' && /^[0-9a-f]{64}(?![\s\S])/.test(v);

export async function publishPreparedCandidate(input) {
  if (!closed(input, ['repoRoot', 'evidenceDirectory', 'validationBundleDigest', 'reviewBundleDigest',
    'expectedRequestDigest', 'approvedRuntimeProfile', 'limits', ...(Object.hasOwn(input ?? {}, 'migration') ? ['migration'] : []),
    ...(Object.hasOwn(input ?? {}, 'approvedInstallationReview') ? ['approvedInstallationReview'] : [])])
    || !['repoRoot', 'evidenceDirectory'].every((key) => typeof input[key] === 'string' && input[key].length > 0 && !input[key].includes('\0'))
    || ![input.validationBundleDigest, input.reviewBundleDigest, input.expectedRequestDigest].every(hash)
    || !closed(input.limits, ['review', 'execution', 'transaction'])) return { status: 'not-published', code: 'invalid-publication-input' };
  const plan = structuredClone(input);
  let tuple = { validationBundleDigest: plan.validationBundleDigest, reviewBundleDigest: plan.reviewBundleDigest,
    requestDigest: plan.expectedRequestDigest };
  const refused = (code) => ({ status: 'not-published', code, ...tuple });
  try {
    const review = readRetainedCandidateReview({ evidenceDirectory: plan.evidenceDirectory,
      reviewBundleDigest: plan.reviewBundleDigest, validationBundleDigest: plan.validationBundleDigest,
      expectedRequestDigest: plan.expectedRequestDigest, limits: plan.limits.review });
    if (review.status !== 'verified') return refused('publication-review-retention-unavailable');
    const { request, receipt } = review;
    tuple = { ...tuple, receiptDigest: review.manifest.receiptDigest,
      source: { ref: request.source.ref, expectedCommit: request.source.expectedCommit },
      output: { ref: request.publish.outputRef, expectedCommit: request.publish.expectedOldCommit },
      candidateCommit: request.candidate.commit };
    const evidence = await verifyCandidateReviewEvidence({ repoRoot: plan.repoRoot, evidenceDirectory: plan.evidenceDirectory,
      request, approvedRuntimeProfile: plan.approvedRuntimeProfile, limits: plan.limits.review, executionLimits: plan.limits.execution,
      migration: plan.migration ?? null, approvedInstallationReview: plan.approvedInstallationReview ?? null });
    if (request.operation === 'identity-migration') {
      if (!Object.hasOwn(request.operationEvidence, 'finalGate')) return refused(evidence.operationReport.mechanicalStatus === 'passed'
        ? 'migration-impact-unavailable' : 'migration-mechanical-incomplete');
      const final = evidence.operationReport;
      if (final.status !== 'passed' || final.gate?.status !== 'complete' || final.gate.namespace !== request.namespace
        || final.gate.mechanical?.mechanicalStatus !== 'passed') return refused('publication-final-migration-incomplete');
    } else if (request.operation === 'subject-split') {
      const final = evidence.operationReport; const decision = evidence.decision;
      if (!isDeepStrictEqual(decision, request.operationEvidence.decision)
        || !isDeepStrictEqual(receipt.review.decision, decision?.ref)
        || !isDeepStrictEqual(receipt.review.decisionCapture, decision?.decisionCapture)
        || receipt.review.decisionDigest !== decision?.decisionDigest) return refused('publication-authorizer-binding-mismatch');
      if (final.status !== 'passed' || final.gate?.ok !== true || final.gate.publicationReady !== false
        || final.gate.checks.decision.status !== 'passed' || final.gate.checks.preservation.status !== 'passed'
        || final.gate.checks.candidateCommitMembership.status !== 'passed'
        || final.gate.checks.allocation.status !== 'passed') return refused('publication-final-split-incomplete');
    } else if (['subject-metadata','subject-proposal-suppression'].includes(request.operation)) {
      const final = evidence.operationReport, decision = evidence.decision;
      if (!isDeepStrictEqual(receipt.review.decision,decision?.ref)
        || !isDeepStrictEqual(receipt.review.decisionCapture,decision?.decisionCapture)
        || receipt.review.decisionDigest !== decision?.decisionDigest) return refused('publication-authorizer-binding-mismatch');
      if (final.status !== 'passed' || final.gate?.ok !== true || final.gate.publicationReady !== false
        || final.gate.assignments !== null || final.gate.sources.assignmentEvent !== null
        || final.gate.preservation?.status !== 'passed' || final.gate.assignmentAssessment?.reason !== 'registry-only-transition'
        || Object.values(final.gate.checks).some(row => row.status !== 'passed')) return refused('publication-final-metadata-incomplete');
    } else if (['subject-reconsideration', 'subject-creation'].includes(request.operation)) {
      const final = evidence.operationReport, decision = evidence.decision;
      if (!isDeepStrictEqual(decision, request.operationEvidence.decision)
        || !isDeepStrictEqual(receipt.review.decision, decision?.ref)
        || !isDeepStrictEqual(receipt.review.decisionCapture, decision?.decisionCapture)
        || receipt.review.decisionDigest !== decision?.decisionDigest) return refused('publication-authorizer-binding-mismatch');
      if (final.status !== 'passed' || final.gate?.ok !== true || final.gate.publicationReady !== false
        || final.gate.assignments !== null || final.gate.core?.ok !== true || final.gate.core.assignments !== null
        || final.gate.core.ownerPreservation.status !== 'passed'
        || !isDeepStrictEqual(final.gate.checks, ['core', 'binding', 'reach', 'subjectTree', 'replays'].map(id => ({ id, passed: true })))) {
        return refused('publication-final-reconsideration-incomplete');
      }
    } else if (request.operation === 'subject-equivalent-merge' && evidence.event === null) {
      const final = evidence.operationReport, decision = evidence.decision;
      if (!isDeepStrictEqual(receipt.review.decision, decision?.ref)
        || !isDeepStrictEqual(receipt.review.decisionCapture, decision?.decisionCapture)
        || receipt.review.decisionDigest !== decision?.decisionDigest) return refused('publication-authorizer-binding-mismatch');
      if (final.status !== 'passed' || final.gate?.ok !== true || final.gate.publicationReady !== false
        || final.gate.version !== 3 || final.gate.assignments !== null || final.gate.sources.assignmentEvent !== null
        || final.gate.checks.assignments.status !== 'not-applicable' || final.gate.checks.decision.status !== 'passed'
        || final.gate.checks.preservation.status !== 'passed' || final.gate.preservation?.status !== 'passed') {
        return refused('publication-final-merge-incomplete');
      }
    } else if (request.operation === 'subject-retirement') {
      const final = evidence.operationReport; const decision = evidence.decision;
      if (!isDeepStrictEqual(decision, request.operationEvidence.decision)
        || !isDeepStrictEqual(receipt.review.decision, decision?.ref)
        || !isDeepStrictEqual(receipt.review.decisionCapture, decision?.decisionCapture)
        || receipt.review.decisionDigest !== decision?.decisionDigest) return refused('publication-authorizer-binding-mismatch');
      // Review verification reran the fixed wire-bound predicate and exact actual owner.
      if (final.status !== 'passed' || final.gate?.ok !== true || final.gate.publicationReady !== false
        || final.gate.checks.decision.status !== 'passed' || final.gate.checks.preservation.status !== 'passed'
        || final.gate.checks.candidateCommitMembership.status !== 'passed') return refused('publication-final-retirement-incomplete');
    } else {
    const event = evidence.event;
    if (!isDeepStrictEqual(receipt.review.decision, event.decision)
      || !isDeepStrictEqual(receipt.review.decisionCapture, event.review['decision-capture'])
      || receipt.review.decisionDigest !== event.review['decision-digest']) return refused('publication-authorizer-binding-mismatch');
    // This is the fresh actual gate, including its actual source/historical Decision recapture.
    // Its current model, raw candidate event and exact reviewed namespace were independently checked.
    const final = evidence.operationReport;
    const assignment = request.operation === 'subject-equivalent-merge' ? final.gate?.assignments
      : ['ordinary-promotion', 'typed-record-promotion'].includes(request.operation) ? final.gate?.assignment : final.gate;
    if (final.status !== 'passed' || final.gate?.ok !== true || assignment?.checks.authorizer.status !== 'passed'
      || assignment.checks.candidateCommitMembership.status !== 'passed') return refused('publication-final-gate-incomplete');
    }
    const transaction = await compareAndSwapCandidateRef({ repoRoot: plan.repoRoot,
      source: tuple.source, output: tuple.output, candidateCommit: tuple.candidateCommit, limits: plan.limits.transaction });
    return { status: transaction.outcome === 'committed' ? 'published'
      : transaction.outcome === 'unknown' ? 'publication-unknown' : 'not-published', code: transaction.code, ...tuple };
  } catch (error) {
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
    return refused(error.code ?? 'publication-evidence-unavailable');
  }
}
