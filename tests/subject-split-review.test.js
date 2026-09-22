import assert from 'node:assert/strict';
import test from 'node:test';
import { subjectSplitReviewFixture, reviewLimits } from './helpers/subject-split-review-fixture.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';

for (const objectFormat of ['sha1', 'sha256']) for (const zero of [true, false]) {
  test(`actual split review ${objectFormat} ${zero ? 'zero' : 'positive'} retains event-independent Decision`, async t => {
    const f = await subjectSplitReviewFixture(t, { objectFormat, nested: objectFormat === 'sha256', zero });
    const saved = await recordApprovedCandidateReview(f.writer());
    const read = readRetainedCandidateReview({ evidenceDirectory: f.input.evidenceDirectory,
      reviewBundleDigest: saved.reviewBundleDigest, validationBundleDigest: f.input.validationBundleDigest,
      expectedRequestDigest: saved.requestDigest, limits: reviewLimits });
    assert.equal(read.status, 'verified');
    assert.deepEqual(read.receipt.review.decision, f.final.gate.decision.ref);
    assert.deepEqual(read.receipt.review.decisionCapture, f.final.gate.decision.decisionCapture);
    assert.equal(read.receipt.review.decisionDigest, f.final.gate.decision.decisionDigest);
    assert.notEqual(read.receipt.review.reference, f.final.gate.decision.reference);
    assert.equal(read.request.operationEvidence.assignmentEvent === null, zero);
  });
}

// These attacks reseal copies of actual successful evidence, never manufacture a successful owner.
// Direct adapter tests prove its exact local refusal before the mandatory final re-execution.
async function adapter() { return (await import('../payload/engine/lib/candidate-review-split.js')).verifySubjectSplitReviewEvidence; }
function edited(f, edit) {
  const input = { ...f.adapterInput, request: structuredClone(f.request),
    validationInput: structuredClone(f.validationInput), artifacts: Object.fromEntries(Object.entries(f.adapterInput.artifacts)
      .map(([key, row]) => [key, row === null ? null : { ...row, bytes: Buffer.from(row.bytes) }])) };
  const wire = JSON.parse(input.artifacts.input.bytes); const gate = JSON.parse(input.artifacts.report.bytes);
  edit({ input, wire, gate });
  gate.inputDigest = canonicalSha256(wire); gate.operation = structuredClone(wire.operation);
  gate.resources.limits = structuredClone(wire.limits);
  if (gate.preservation) {
    gate.preservation.proof.inputs = structuredClone(gate.inputs);
    gate.preservation.proof.operationDigest = canonicalSha256(wire.operation);
    gate.preservation.proof.inventoryDigest = canonicalSha256(gate.inventory);
    gate.preservation.proofDigest = canonicalSha256(gate.preservation.proof);
    gate.assignmentAssessment.inventoryDigest = gate.preservation.proof.inventoryDigest;
    gate.assignmentAssessment.preservationDigest = gate.preservation.proofDigest;
  }
  const proof = input.request.operationEvidence;
  proof.validation.inputDigest = gate.inputDigest; proof.validation.reportDigest = canonicalSha256(gate);
  proof.registryEvents = structuredClone(wire.operation.registryEvents);
  proof.decision = structuredClone(gate.decision);
  const replace = (key, bytes, target, field) => {
    const row = input.artifacts[key]; const capture = artifactCapture(row.file, bytes);
    input.artifacts[key] = { file: capture.file, size: capture.size, sha256: capture.sha256, bytes };
    target[field] = capture;
  };
  replace('input', canonicalJsonBytes(wire), proof.validation, 'inputCapture');
  replace('report', Buffer.from(JSON.stringify(gate) + '\n'), proof.validation, 'reportCapture');
  for (const name of ['registry', 'identity']) replace(name, input.artifacts[name].bytes, proof, `${name}Capture`);
  if (input.artifacts.event) replace('event', input.artifacts.event.bytes, proof.assignmentEvent, 'eventCapture');
  return { input, wire, gate };
}
function predicatePasses(attack) {
  assert.equal(isPreparedSubjectSplitReport(attack.gate,
    { source: attack.input.validationInput.expected.source, candidate: attack.input.request.candidate }, attack.wire), true,
  'Resealed adversary passes the pure predicate; actual review must still refuse');
}
const expectCode = code => error => { assert.equal(error.code, code, error.stack); return true; };

import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { artifactCapture } from '../payload/engine/lib/prepared-evidence.js';
import { isPreparedSubjectSplitReport } from '../payload/engine/lib/prepared-subject-split.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { assignmentEventDigest } from '../payload/engine/lib/assignment-event.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { load } from 'js-yaml';

function candidateAttack(f, file, mutate, amend) {
  const original = f.read(file); const doc = load(original); mutate(doc);
  f.put(file, doc); const descriptor = f.commit('adversarial actual split candidate');
  f.put(file, original); f.git('reset', '--hard', f.candidate.commit);
  return edited(f, state => {
    const { input, wire, gate } = state;
    const old = wire.candidate; const replace = value => {
      if (Array.isArray(value)) return value.map(replace);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        key === 'commit' && item === old.commit ? descriptor.commit : key === 'tree' && item === old.tree ? descriptor.tree : replace(item)]));
    };
    Object.assign(gate, replace(gate)); wire.candidate = descriptor;
    input.request.candidate = descriptor; input.validationInput.expected.candidate = descriptor;
    for (const name of ['identity', 'registry']) {
      const path = `${descriptor.kitPath === '.' ? '' : descriptor.kitPath + '/'}${name === 'identity' ? '_identity.yaml' : 'subjects/registry.yaml'}`;
      const actual = captureCommittedFile({ repoRoot: f.root, commit: descriptor.commit, file: path });
      input.artifacts[name].bytes = actual.bytes;
      if (name === 'identity') { gate.allocation.candidate.capture = actual.locator; gate.sources.identityCapture = actual.locator; }
      else { gate.sources.registryCapture = actual.locator; gate.inventory.inputs.candidate.registryCapture = actual.locator; }
    }
    if (input.artifacts.event) {
      const actual = captureCommittedFile({ repoRoot: f.root, commit: descriptor.commit, file: gate.sources.assignmentEvent.eventCapture.file });
      input.artifacts.event.bytes = actual.bytes; gate.sources.assignmentEvent.eventCapture = actual.locator;
    }
    amend?.(state, doc);
  });
}

test('actual zero review independently rejects resealed allocation, source and budget claims', async t => {
  const f = await subjectSplitReviewFixture(t, { zero: true }); const verify = await adapter();
  const originalResources = structuredClone(f.gate.resources);
  await verify(f.adapterInput);
  assert.deepEqual(f.gate.resources, originalResources, 'Independent accounting never rewrites owner resources');
  await t.test('closed nine-field request and detached identity are mandatory', async () => {
    for (const mutate of [
      r => { delete r.operationEvidence.identityCapture; },
      r => { r.operationEvidence.extra = true; },
      r => { r.operationEvidence.identityCapture = r.operationEvidence.registryCapture; },
      r => { r.operationEvidence.registryEvents.reverse(); },
      r => { r.operationEvidence.registryEvents[1] = structuredClone(r.operationEvidence.registryEvents[0]); },
      r => { r.operationEvidence.decision.acceptedStatus = 'proposed'; },
      r => { r.operationEvidence.finalGate.result.gate.publicationReady = true;
        r.operationEvidence.finalGate.resultDigest = canonicalSha256(r.operationEvidence.finalGate.result); },
    ]) {
      const request = structuredClone(f.request); mutate(request);
      await assert.rejects(recordApprovedCandidateReview(f.writer(request)), /review-/);
    }
  });
  for (const [label, edit] of [
    ['missing pair', ({ wire }) => { wire.evidence.assessmentCaptures = []; }],
    ['duplicate pair', ({ wire }) => { wire.evidence.assessmentCaptures.push(structuredClone(wire.evidence.assessmentCaptures[0])); }],
    ['wrong original tree', ({ wire }) => { wire.evidence.assessmentCaptures[0].identity.capture.source.tree = 'f'.repeat(40); }],
  ]) await t.test(label, async () => {
    await assert.rejects(verify(edited(f, edit).input), /review-split-owner-binding/);
  });
  await t.test('native occupied count and resource rows cannot be resealed', async () => {
    for (const mutate of [gate => { gate.allocation.occupied++; gate.allocation.remaining--; },
      gate => { gate.resources.allocation.used.ledgerRows++; },
      gate => { gate.inventory.inputs.candidate.identityDigest = 'e'.repeat(64); }]) {
      const attack = edited(f, ({ gate }) => mutate(gate)); predicatePasses(attack);
      await assert.rejects(verify(attack.input), expectCode('review-split-allocation-proof'));
    }
  });
  await t.test('actual ledger K/O/D publication delta reaches native plan refusal', async () => {
    const attack = candidateAttack(f, '_identity.yaml', doc => { doc.allocations.find(row => row.kind === 'decision').publication.review += ':changed'; });
    predicatePasses(attack);
    await assert.rejects(verify(attack.input), error => {
      assert.equal(error.code, 'review-split-allocation'); assert.match(error.message, /split-allocation-mismatch/); return true;
    });
  });
  await t.test('actual registry prior history delta is not a suffix-only proof', async () => {
    const attack = candidateAttack(f, 'subjects/registry.yaml', doc => { doc.history[0].review.reference += ':changed'; });
    predicatePasses(attack); await assert.rejects(verify(attack.input), expectCode('review-split-registry-prefix'));
  });
  await t.test('actual raw selected tuple is checked independently of normalized report', async () => {
    for (const change of [
      row => { row.decision.id = 'D-000001'; },
      row => { row.review.reference += ':changed'; },
      row => { row.review['accepted-status'] = 'addressed'; },
      row => { row.review['decision-digest'] = 'f'.repeat(64); },
      row => { row.review['decision-capture'].source.tree = 'f'.repeat(40); },
    ]) for (const offset of [-2, -1]) {
      const attack = candidateAttack(f, 'subjects/registry.yaml', doc => change(doc.history.at(offset)));
      predicatePasses(attack); await assert.rejects(verify(attack.input), expectCode('review-split-registry-tuple'));
    }
  });
  await t.test('actual Git mode contradicts resealed allocation mode', async () => {
    const attack = edited(f, ({ gate }) => { gate.allocation.before.mode = '100755'; gate.allocation.candidate.mode = '100755'; });
    predicatePasses(attack); await assert.rejects(verify(attack.input), expectCode('review-split-identity-mode'));
  });
  await t.test('detached bytes cannot replace actual candidate bytes', async () => {
    const attack = edited(f, ({ input }) => { input.artifacts.identity.bytes = Buffer.concat([input.artifacts.identity.bytes, Buffer.from('\n# resealed\n')]); });
    predicatePasses(attack); await assert.rejects(verify(attack.input), expectCode('review-split-candidate-bytes'));
  });
  const localBytes = ['before', 'candidate'].reduce((sum, side) => sum + ['_identity.yaml', 'subjects/registry.yaml'].reduce((n, file) =>
    n + captureCommittedFile({ repoRoot: f.root, commit: f[side === 'before' ? 'source' : 'candidate'].commit, file }).bytes.length, 0), 0);
  const reduced = (change, marker = false) => edited(f, state => {
    const { wire, gate } = state; change(wire, gate);
    for (const key of Object.keys(gate.resources.governance.used)) gate.resources.governance.used[key] = 0;
    if (marker) { gate.allocation.occupied++; gate.allocation.remaining--; }
  });
  await t.test('exact four-capture cap passes admission, one-short fails actual capture debit', async () => {
    const exact = reduced(wire => { wire.limits.governance.maxCaptureBytes = localBytes; }, true);
    predicatePasses(exact); await assert.rejects(verify(exact.input), expectCode('review-split-allocation-proof'));
    const short = reduced(wire => { wire.limits.governance.maxCaptureBytes = localBytes - 1; });
    predicatePasses(short); await assert.rejects(verify(short.input), error => {
      assert.equal(error.code, 'review-split-subject-validation-budget'); assert.match(error.message, /maxCaptureBytes.*raw-captures/); return true;
    });
  });
  for (const [limit, phase] of [['maxValidationSteps', 'split-review-original-pair'], ['maxDocumentNodes', 'split-review-before-registry']]) {
    await t.test(`${limit} refuses at the actual named review debit`, async () => {
      const attack = reduced(wire => { wire.limits.governance[limit] = 0; }); predicatePasses(attack);
      await assert.rejects(verify(attack.input), error => {
        assert.equal(error.code, 'review-split-subject-validation-budget'); assert.match(error.message, new RegExp(phase)); return true;
      });
    });
  }
  await t.test('one-short ledger population is independently admitted by native helper', async () => {
    const attack = reduced((wire, gate) => {
      wire.limits.allocation.maxLedgerRows = gate.resources.allocation.used.ledgerRows - 1;
      gate.resources.allocation.limits = structuredClone(wire.limits.allocation);
      gate.resources.allocation.used.ledgerRows--;
    }); predicatePasses(attack);
    await assert.rejects(verify(attack.input), error => {
      assert.equal(error.code, 'review-split-allocation'); assert.match(error.message, /split-allocation-budget/); return true;
    });
  });
});

test('actual mixed K/O/D all-empty choices and source-less Decision remain positive review', async t => {
  const f = await subjectSplitReviewFixture(t, { kinds: ['knowledge', 'ontology', 'decision'],
    beforeChange(h) {
      for (const owner of h.owners) owner.successors = [];
      delete h.reviewCapture.capture.source;
      delete h.activation.review.decisionCapture.source;
      delete h.split.review.decisionCapture.source;
    } });
  assert.equal(f.request.operationEvidence.decision.decisionCapture.source, undefined);
  assert.equal(f.gate.assignments.rows.length, 9);
  assert.ok(f.operationInputs.gateInput.operation.mappings.every(row => row.successors.length === 0));
  assert.notEqual(f.request.operationEvidence.assignmentEvent, null);
  const saved = await recordApprovedCandidateReview(f.writer()); assert.equal(saved.status, 'retained');
  const published = await publishPreparedCandidate(f.publisher(saved));
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
  const verify = await adapter();
  await t.test('raw event reason agrees with original mapping', async () => {
    const attack = edited(f, ({ wire }) => { wire.operation.mappings[0].reason += ':changed'; }); predicatePasses(attack);
    await assert.rejects(verify(attack.input), expectCode('review-split-event-row'));
  });
  await t.test('actual raw event order and revisions cannot be resealed', async () => {
    for (const mutate of [doc => { doc.rows.reverse(); }, doc => { doc.rows[0]['after-revision']++; }]) {
      const attack = candidateAttack(f, `subjects/_assignments/${f.request.operationEvidence.assignmentEvent.eventId}.yaml`, mutate,
        ({ input, wire, gate }, doc) => {
          const digest = assignmentEventDigest(doc);
          wire.operation.assignmentEvent.changeDigest = digest;
          gate.sources.assignmentEvent.eventDigest = digest;
          gate.assignments.eventSource.eventDigest = digest;
          input.request.operationEvidence.assignmentEvent.eventDigest = digest;
        }); predicatePasses(attack);
      await assert.rejects(verify(attack.input), expectCode('review-split-event-row'));
    }
  });
  await t.test('positive exact five-capture admission reaches row proof and one-short refuses capture', async () => {
    const file = f.gate.sources.assignmentEvent.eventCapture.file;
    const localBytes = ['before', 'candidate'].reduce((sum, side) => sum + ['_identity.yaml', 'subjects/registry.yaml'].reduce((n, authority) =>
      n + captureCommittedFile({ repoRoot: f.root, commit: f[side === 'before' ? 'source' : 'candidate'].commit, file: authority }).bytes.length, 0), 0)
      + captureCommittedFile({ repoRoot: f.root, commit: f.candidate.commit, file }).bytes.length;
    for (const short of [false, true]) {
      const attack = edited(f, ({ wire, gate }) => {
        wire.limits.governance.maxCaptureBytes = localBytes - Number(short);
        wire.operation.mappings[0].reason += ':changed';
        for (const key of Object.keys(gate.resources.governance.used)) gate.resources.governance.used[key] = 0;
      }); predicatePasses(attack);
      await assert.rejects(verify(attack.input), error => {
        assert.equal(error.code, short ? 'review-split-subject-validation-budget' : 'review-split-event-row');
        if (short) assert.match(error.message, /maxCaptureBytes.*raw-captures/);
        return true;
      });
    }
  });
});
