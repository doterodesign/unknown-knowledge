import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { typedPromotionGateFixture } from './helpers/typed-promotion-gate-fixture.js';
import { recordPromotionInputWire } from '../payload/engine/lib/record-promotion-input.js';
import { decodePreparedRecordPromotion, isPreparedRecordPromotionReport } from '../payload/engine/lib/prepared-record-promotion.js';
import { runPreparedCandidateChecks } from '../payload/engine/lib/prepared-validation.js';
import * as finalPromotion from '../payload/engine/lib/final-prepared-promotion.js';
import { readRetainedPreparedEvidence, artifactCapture, retainPreparedEvidence } from '../payload/engine/lib/prepared-evidence.js';
import { verifyRetainedRuntimeCapability } from '../payload/engine/lib/runtime-capability.js';
import { canonicalSha256, canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { load, dump } from 'js-yaml';
import { recordApprovedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { runtimeLimits, evidenceLimits } from './helpers/final-equivalent-merge-fixture.js';

const cases = ['ontology', 'knowledge', 'decision'].flatMap((kind) =>
  [['sha1', true], ['sha256', true], ['sha1', false]].map(([format, subjectAuthority]) => [kind, format, subjectAuthority, false]));
cases.push(['decision', 'sha1', true, true]);
for (const [kind, format, subjectAuthority, reversed] of cases) test(`actual ${format} ${subjectAuthority ? 'classified' : 'registry-absent'} ${kind} promotion ${reversed ? 'with reversed input ' : ''}retains original evidence and publishes through fresh review`, async (t) => {
  const f = typedPromotionGateFixture(t, { kind, format, subjectAuthority, history: subjectAuthority, nested: format === 'sha256' });
  if (reversed) f.input.promotion.rows = [...f.input.promotion.rows].reverse();
  const otherKind = kind === 'ontology' ? 'knowledge' : 'ontology';
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'promotion-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const source = f.input.before; const candidate = f.input.candidate;
  const operationInputs = { gateInput: recordPromotionInputWire(f.input), maxEventBytes: 1000000 };
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation: 'typed-record-promotion',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  assert.ok(validation.report.checks.every(check => check.status === 'passed'), JSON.stringify(validation.report.checks));
  const expected = { source, candidate, operation: 'typed-record-promotion', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const reportExpected = { ...expected, operationInputs };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  assert.equal(retained.status, 'verified');
  // Fixture-only synthetic external profile, not inferred production approval.
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'], files: retained.runtimeManifest.files };
  const approvedRuntimeProfile = { digest: canonicalSha256(profile), profile };
  const input = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: retained.bundleDigest, expected, approvedRuntimeProfile,
    limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  const final = await finalPromotion.runFinalPreparedRecordPromotionGate(input);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  assert.equal(final.gate.publicationReady, false);
  assert.equal(final.gate.assignment.checks.humanApproval.status, 'not-performed');
  assert.equal(final.policy.id, 'typed-record-promotion-publication-v3');
  assert.equal(final.policy.version, 3);
  assert.equal(final.policy.digest, '548d06641ec3ef5c0a4157595978f279f83a501181861316c8696f07eef8a60f');
  assert.equal(final.gate.version, 2);
  assert.equal(final.gate.recordKind, kind);
  if (kind === 'decision') {
    assert.deepEqual(final.gate.checks.preflight, { status: 'not-applicable' });
    assert.deepEqual(final.gate.preflight, { status: 'not-applicable', recordKind: 'decision',
      selectedIds: f.input.promotion.rows.map(({ canonicalRef }) => canonicalRef.id), today: null, result: null });
  } else {
    assert.equal(final.gate.preflight.status, 'passed');
    assert.equal(final.gate.preflight.recordKind, kind);
    assert.equal(final.gate.preflight.today, f.today);
    assert.deepEqual(final.gate.checks.preflight, { status: 'passed' });
  }
  assert.equal(isPreparedRecordPromotionReport(final.gate, reportExpected), true);
  assert.deepEqual(final.gate.preflight.selectedIds, f.input.promotion.rows.map(({ canonicalRef }) => canonicalRef.id));
  if (reversed) {
    assert.deepEqual(final.gate.promotion.createdRefs, f.rows.map(({ canonicalRef }) => canonicalRef));
    assert.notDeepEqual(final.gate.preflight.selectedIds, final.gate.promotion.createdRefs.map((ref) => ref.id));
  }
  assert.deepEqual(final.gate.impacts.policy, { id: 'typed-record-promotion-v3', version: 3,
    digest: 'a2bca79dff49f861b2632062eb0c977e647854d70348d1dfb9d021ad43ba6965' });
  assert.equal(final.gate.assignment.checks.impactPolicy.status, 'not-performed');
  if (subjectAuthority) {
    assert.deepEqual(final.gate.impacts.required, ['reach', 'subjectTree', 'representativeReplays']);
    assert.equal(final.gate.impacts.representativeReplays.status, 'complete');
    assert.equal(final.gate.impacts.reach.status, 'incomplete', 'raw unknown coverage is preserved');
  } else {
    assert.deepEqual(final.gate.impacts.applicability, { kind: 'subject-registry-absent-both' });
    assert.deepEqual(final.gate.impacts.required, []);
    for (const key of ['reach', 'subjectTree', 'representativeReplays', 'unknownOwners']) assert.equal(final.gate.impacts[key], null);
  }
  const member = (file) => retained.artifacts.find((row) => row.file === file);
  assert.equal(final.gate.inputDigest, canonicalSha256(operationInputs.gateInput));
  assert.equal(validation.report.checks[2].invocation.injectedInputsDigest, canonicalSha256(operationInputs));
  const capture = (file) => artifactCapture(file, member(file).bytes);
  if (format === 'sha1' && subjectAuthority) {
    assert.equal((await finalPromotion.runFinalPreparedPromotionGate(input)).status, 'failed', 'typed evidence cannot use the Decisions-only profile');
    for (const changedKind of ['ontology', 'knowledge', 'decision'].filter((value) => value !== kind)) {
      assert.throws(() => decodePreparedRecordPromotion(f.root, { ...operationInputs.gateInput, kind: changedKind }), /typed promotion/);
    }
    assert.throws(() => decodePreparedRecordPromotion(f.root, { ...operationInputs.gateInput, executor: 'caller-selected' }), /typed promotion/);
    for (const version of [1, 2]) {
      const oldWire = structuredClone(operationInputs.gateInput); oldWire.impact.policy = `typed-record-promotion-v${version}`;
      assert.throws(() => decodePreparedRecordPromotion(f.root, oldWire), /typed promotion/);
    }
    for (const mutate of [
      value => { value.version = 1; },
      value => { value.impacts.required = []; },
      value => { value.impacts.representativeReplays.status = 'not-assessed'; },
      value => { value.impacts.policy.id = 'caller-selected'; },
      value => { value.impacts.policy = { id: 'typed-record-promotion-v1', version: 1, digest: value.impacts.policy.digest }; },
      value => { value.impacts.policy = { id: 'typed-record-promotion-v2', version: 2,
        digest: 'f2f6581541a60cc8ef4085506118e98b5e2eda3e39256e1db6cdaa289affa638' }; },
      value => { value.capabilities.candidate.subjectRegistry = false; },
      value => { const store = kind === 'decision' ? 'decisions' : kind;
        value.capabilities.before[store] = false; value.capabilities.candidate[store] = false; },
      value => { value.preflight.recordKind = otherKind; },
      value => { value.recordKind = 'subject'; value.preflight.recordKind = 'subject'; },
      value => { value.checks.authorizer.status = 'not-applicable'; },
      value => { value.checks.preflight.status = 'not-performed'; },
      value => { value.preflight.status = kind === 'decision' ? 'passed' : 'not-applicable';
        value.checks.preflight.status = value.preflight.status; },
      ...(kind === 'decision' ? [
        value => { value.preflight.today = f.today; },
        value => { value.preflight.result = { payload: { ok: true }, exitCode: 0 }; },
        value => { value.preflight.selectedIds.reverse(); },
        value => { value.preflight.applicability = 'decision'; },
        value => { value.promotion.createdRefs = []; value.preflight.selectedIds = []; },
        value => { value.promotion.createdRefs[0].kind = 'knowledge'; },
      ] : []),
      value => { value.publicationReady = true; },
    ]) {
      const changed = structuredClone(final.gate); mutate(changed);
      assert.equal(isPreparedRecordPromotionReport(changed, reportExpected), false);
    }
    if (kind === 'decision') {
      assert.equal(isPreparedRecordPromotionReport(final.gate, expected), false, 'D proof requires the original input selection');
      const reorderedInputs = structuredClone(operationInputs); reorderedInputs.gateInput.promotion.rows.reverse();
      assert.equal(isPreparedRecordPromotionReport(final.gate, { ...expected, operationInputs: reorderedInputs }), false,
        'The original report cannot use a differently ordered input selection');
    }
    assert.equal((await finalPromotion.runFinalPreparedRecordPromotionGate({ ...input, approvedRuntimeProfile: null })).status, 'failed');
    const event = load(member('checks/operation/event.yaml').bytes.toString());
    event.review.reference = 'substituted review with unchanged semantic event digest';
    for (const [file, bytes, code] of [
      ['checks/operation/event.yaml', Buffer.from(dump(event)), 'promotion-fresh-proof-mismatch'],
      ['checks/operation/capture-limits.json', canonicalJsonBytes({ maxEventBytes: 1 }), 'promotion-validation-incomplete'],
      ['checks/operation/input.json', canonicalJsonBytes({ ...operationInputs.gateInput, today: '2026-09-21' }), 'promotion-owner-report-invalid'],
    ]) {
      const altered = retainPreparedEvidence({ evidenceDirectory, repoRoot: f.root, runtimeRoot: f.root, binding: expected,
        artifacts: retained.artifacts.map((row) => ({ file: row.file, bytes: row.file === file ? bytes : row.bytes })) });
      assert.equal(altered.status, 'retained');
      const denied = await finalPromotion.runFinalPreparedRecordPromotionGate({ ...input, validationBundleDigest: altered.bundleDigest });
      assert.equal(denied.status, 'failed'); assert.ok(denied.diagnostics.some((row) => row.code === code), JSON.stringify(denied));
    }
  }
  const capability = verifyRetainedRuntimeCapability({ evidenceDirectory, bundleDigest: retained.bundleDigest, expected, limits: evidenceLimits }, approvedRuntimeProfile);
  const request = { version: 1, operation: 'typed-record-promotion', namespace: f.event.namespace, objectFormat: format,
    source: { ref: 'refs/heads/source', expectedCommit: source.commit, tree: source.tree, kitPath: source.kitPath }, candidate,
    runtimeDigest: validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: retained.bundleDigest, reportDigest: validation.reportDigest },
    runtimeCapability: { profileDigest: approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'typed-record-promotion', publicationId: f.input.publication.id, createdRefs: final.gate.promotion.createdRefs,
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
    for (const version of [1, 2]) {
      const oldPolicy = structuredClone(request);
      const oldDescriptor = { id: `typed-record-promotion-publication-v${version}`, version,
        recordKinds: version === 1 ? ['ontology'] : ['ontology', 'knowledge'],
        promotionPolicy: `typed-record-promotion-v${version}`, finalEvidence: 'actual-result-and-digest',
        requiredImpactWithSubjectAuthority: ['reach', 'subjectTree', 'representativeReplays'], routeEvidence: 'runtime-capability' };
      oldPolicy.policy = { id: oldDescriptor.id, digest: canonicalSha256(oldDescriptor) };
      await assert.rejects(recordApprovedCandidateReview(writer(oldPolicy)), /review-policy-mismatch/);
    }
    const prefix = otherKind === 'knowledge' ? 'K' : 'O';
    for (const mutate of [
      value => { value.operationEvidence.createdRefs[0].kind = otherKind; },
      value => { value.operationEvidence.createdRefs[0].kind = otherKind;
        value.operationEvidence.createdRefs[0].id = `${prefix}-000099`; },
      ...['ontology', 'knowledge', 'decision'].filter((value) => value !== kind).map((changedKind) => value => {
        const changedPrefix = { ontology: 'O', knowledge: 'K', decision: 'D' }[changedKind];
        value.operationEvidence.createdRefs = value.operationEvidence.createdRefs.map((ref) => ({
          ...ref, kind: changedKind, id: `${changedPrefix}${ref.id.slice(1)}` }));
      }),
      value => { value.operationEvidence.createdRefs = value.operationEvidence.createdRefs.map((ref) => ({
        ...ref, kind: 'subject', id: `S${ref.id.slice(1)}` })); },
    ]) {
      const mismatched = structuredClone(request); mutate(mismatched);
      await assert.rejects(recordApprovedCandidateReview(writer(mismatched)), /promotion/);
    }
    const ordinary = structuredClone(request); ordinary.operation = 'ordinary-promotion';
    ordinary.operationEvidence.kind = 'ordinary-promotion';
    // D refs pass ordinary request shape, but typed evidence cannot change its retained operation.
    await assert.rejects(recordApprovedCandidateReview(writer(ordinary)),
      kind === 'decision' ? /prepared evidence: invalid or mismatched retained manifest/ : /invalid-review-promotion-evidence/);
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
