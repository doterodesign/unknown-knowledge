import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparedReconsiderationFixture, reconsiderationReviewFixture } from './helpers/prepared-reconsideration-fixture.js';
import { inspectSubjectReconsiderationGateFromWire } from '../payload/engine/lib/subject-reconsideration-gate.js';
import { recordApprovedCandidateReview } from '../payload/engine/lib/candidate-review.js';

test('actual wire owner control precedes the fixed review adapter', async t => {
  const f = preparedReconsiderationFixture(t);
  const gate = await inspectSubjectReconsiderationGateFromWire({ repoRoot: f.repoRoot, gateInput: f.gateInput });
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  t.diagnostic('Actual wire owner passed before review-module availability assertion.');
  const adapter = await import('../payload/engine/lib/candidate-review-reconsideration.js');
  assert.equal(typeof adapter.verifySubjectReconsiderationReviewEvidence, 'function');
});

for (const options of [{ objectFormat: 'sha1', nested: false }, { objectFormat: 'sha256', nested: true, parent: true, related: true }]) {
  test(`actual retained review ${options.objectFormat}/${options.nested ? 'nested' : 'root'}`, async t => {
    const f = await reconsiderationReviewFixture(t, options);
    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    assert.equal(f.request.operationEvidence.assignmentEvent, null);
    assert.equal(f.request.operationEvidence.registryEvents.length, 1);
  });
}

import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { artifactCapture } from '../payload/engine/lib/prepared-evidence.js';
import { isPreparedSubjectReconsiderationReport } from '../payload/engine/lib/prepared-subject-reconsideration.js';
import { verifySubjectReconsiderationReviewEvidence as verify } from '../payload/engine/lib/candidate-review-reconsideration.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { load } from 'js-yaml';

// Deliberately resealed actual reports test the local proof, not a fabricated successful execution.
function edited(f, mutate) {
  const input = { ...f.adapterInput, request: structuredClone(f.request), validationInput: structuredClone(f.validationInput),
    artifacts: Object.fromEntries(Object.entries(f.adapterInput.artifacts).map(([name, row]) => [name, { ...row, bytes: Buffer.from(row.bytes) }])) };
  const wire = JSON.parse(input.artifacts.input.bytes), gate = JSON.parse(input.artifacts.report.bytes);
  mutate({ input, wire, gate });
  const { impact, ...coreWire } = wire;
  gate.core.inputDigest = canonicalSha256(coreWire); gate.inputDigest = canonicalSha256({ core: gate.core.inputDigest, impact });
  gate.resources.core = structuredClone(gate.core.resources);
  const proof = input.request.operationEvidence;
  proof.validation.inputDigest = gate.inputDigest; proof.validation.reportDigest = canonicalSha256(gate);
  for (const [name, bytes] of [['input', canonicalJsonBytes(wire)], ['report', Buffer.from(`${JSON.stringify(gate)}\n`)]]) {
    const row = input.artifacts[name], capture = artifactCapture(row.file, bytes);
    input.artifacts[name] = { ...capture, bytes }; proof.validation[`${name}Capture`] = capture;
  }
  for (const name of ['identity', 'registry']) {
    const row = input.artifacts[name], capture = artifactCapture(row.file, row.bytes);
    input.artifacts[name] = { ...capture, bytes: row.bytes }; proof[`${name}Capture`] = capture;
  }
  return { input, wire, gate };
}
const predicatePasses = attack => assert.equal(isPreparedSubjectReconsiderationReport(attack.gate,
  { source: attack.input.validationInput.expected.source, candidate: attack.input.request.candidate }, attack.wire), true,
'Adversary must pass the pure predicate to establish the later independent proof boundary.');
const code = expected => error => { assert.equal(error.code, expected, error.stack); return true; };

function candidateAttack(f, file, mutate) {
  const doc = load(f.read(file)); mutate(doc); f.put(file, doc);
  const candidate = f.commit('adversarial actual candidate'); f.git('reset', '--hard', f.candidate.commit);
  return edited(f, ({ input, wire, gate }) => {
    const prior = wire.candidate;
    const rebind = value => Array.isArray(value) ? value.map(rebind) : !value || typeof value !== 'object' ? value
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        key === 'commit' && item === prior.commit ? candidate.commit : key === 'tree' && item === prior.tree ? candidate.tree : rebind(item)]));
    Object.assign(gate, rebind(gate)); wire.candidate = candidate; input.request.candidate = candidate;
    input.validationInput.expected.candidate = candidate;
    for (const name of ['registry', 'identity']) {
      const file = `${candidate.kitPath === '.' ? '' : candidate.kitPath + '/'}${name === 'registry' ? 'subjects/registry.yaml' : '_identity.yaml'}`;
      const actual = captureCommittedFile({ repoRoot: f.repoRoot, commit: candidate.commit, file });
      input.artifacts[name].bytes = actual.bytes;
      const observation = { capture: actual.locator, mode: actual.mode };
      if (name === 'registry') gate.core.registry.candidate = observation;
      else gate.core.allocation.candidate = observation;
      gate.sources[`${name}Capture`] = observation; gate.impacts.bindings.after[name] = observation;
    }
  });
}

test('independent actual review distinguishes native allocation, raw tuples, original bytes and bounded work', async t => {
  const f = await reconsiderationReviewFixture(t);
  const resources = structuredClone(f.gate.resources);
  await verify(f.adapterInput);
  assert.deepEqual(f.gate.resources, resources, 'fresh local comparison must not modify owner observations');
  await t.test('closed nine-field evidence and eventless request', async () => {
    for (const mutate of [r => { delete r.operationEvidence.identityCapture; }, r => { r.operationEvidence.extra = true; },
      r => { r.operationEvidence.assignmentEvent = {}; }, r => { r.operationEvidence.registryEvents.push(r.operationEvidence.registryEvents[0]); },
      r => { r.operationEvidence.identityCapture = r.operationEvidence.registryCapture; }]) {
      const request = structuredClone(f.request); mutate(request);
      await assert.rejects(recordApprovedCandidateReview(f.writer(request)), /review-/);
    }
  });
  await t.test('original pair is mandatory exactly once and byte-exact', async () => {
    for (const mutate of [({ wire }) => { wire.evidence.assessmentCaptures = []; },
      ({ wire }) => { wire.evidence.assessmentCaptures.push(structuredClone(wire.evidence.assessmentCaptures[0])); }]) {
      await assert.rejects(verify(edited(f, mutate).input), code('review-reconsideration-owner-binding'));
    }
    const attack = edited(f, ({ wire }) => {
      const row = wire.evidence.assessmentCaptures[0].identity;
      const bytes = Buffer.from(row.bytesBase64, 'base64'); bytes[0] = 32;
      row.bytesBase64 = bytes.toString('base64');
    });
    predicatePasses(attack); await assert.rejects(verify(attack.input), code('review-reconsideration-original-before'));
  });
  await t.test('native proof count and whole-ledger publication are independently checked', async () => {
    const count = edited(f, ({ gate }) => { gate.core.allocation.proof.occupied++; gate.core.allocation.proof.remaining--; });
    predicatePasses(count); await assert.rejects(verify(count.input), code('review-reconsideration-allocation-proof'));
    const ledger = candidateAttack(f, '_identity.yaml', doc => { doc.allocations[0].publication.review += ':changed'; });
    predicatePasses(ledger); await assert.rejects(verify(ledger.input), error => {
      assert.equal(error.code, 'review-reconsideration-allocation'); assert.match(error.message, /subject-creation-allocation-mismatch/); return true;
    });
  });
  await t.test('full selected Decision tuple and original history prefix use raw files', async () => {
    for (const mutate of [event => { event.decision.id = 'D-000001'; }, event => { event.review.reference += ':changed'; },
      event => { event.review['accepted-status'] = 'addressed'; }, event => { event.review['decision-digest'] = 'e'.repeat(64); },
      event => { event.review['decision-capture'].source.tree = 'f'.repeat(40); }]) {
      const attack = candidateAttack(f, 'subjects/registry.yaml', doc => mutate(doc.history.at(-1)));
      predicatePasses(attack); await assert.rejects(verify(attack.input), code('review-reconsideration-registry-tuple'));
    }
    const prefix = candidateAttack(f, 'subjects/registry.yaml', doc => { doc.history[0].review.reference += ':changed'; });
    predicatePasses(prefix); await assert.rejects(verify(prefix.input), code('review-reconsideration-registry-prefix'));
  });
  await t.test('actual modes and detached candidate bytes are independently corroborated', async () => {
    const mode = edited(f, ({ gate }) => { gate.core.allocation.before.mode = '100755'; gate.impacts.bindings.before.identity.mode = '100755'; });
    predicatePasses(mode); await assert.rejects(verify(mode.input), code('review-reconsideration-source-binding'));
    const bytes = edited(f, ({ input }) => { input.artifacts.identity.bytes = Buffer.concat([input.artifacts.identity.bytes, Buffer.from('\n')]); });
    predicatePasses(bytes); await assert.rejects(verify(bytes.input), code('review-reconsideration-candidate-bytes'));
  });
  await t.test('four actual captures use exact capacity and one-short fails the named debit', async () => {
    const localBytes = ['before', 'candidate'].reduce((total, side) => total + ['registry', 'identity'].reduce((n, name) =>
      n + captureCommittedFile({ repoRoot: f.repoRoot, commit: f[side === 'before' ? 'source' : 'candidate'].commit,
        file: name === 'registry' ? 'subjects/registry.yaml' : '_identity.yaml' }).bytes.length, 0), 0);
    for (const short of [false, true]) {
      const attack = edited(f, ({ wire, gate }) => {
        wire.limits.governance.maxCaptureBytes = localBytes - Number(short);
        gate.core.resources.governance.used.captureBytes = wire.limits.governance.maxCaptureBytes;
        // A downstream sentinel proves the exact fit got through all four admissions.
        gate.core.allocation.proof.occupied++; gate.core.allocation.proof.remaining--;
      }); predicatePasses(attack);
      await assert.rejects(verify(attack.input), error => {
        assert.equal(error.code, short ? 'review-reconsideration-subject-validation-budget' : 'review-reconsideration-allocation-proof');
        if (short) assert.match(error.message, /maxCaptureBytes.*raw-captures/); return true;
      });
    }
  });
  await t.test('metadata and repeated history visits debit the independent allowance', async () => {
    for (const [limit, counter, phase] of [
      ['maxDocumentNodes', 'documentNodes', 'reconsideration-review-wire-metadata'],
      ['maxValidationSteps', 'validationSteps', 'reconsideration-review-history'],
    ]) {
      const attack = edited(f, ({ wire, gate }) => {
        wire.limits.governance[limit] = 1; gate.core.resources.governance.used[counter] = 1;
        gate.core.resources.governance.used.relevantRefusalRows = 0;
      }); predicatePasses(attack);
      await assert.rejects(verify(attack.input), error => {
        assert.equal(error.code, 'review-reconsideration-subject-validation-budget');
        assert.match(error.message, new RegExp(phase)); return true;
      });
    }
  });
  await t.test('ledger population cap is checked before the independent native planner', async () => {
    const attack = edited(f, ({ wire, gate }) => {
      wire.limits.allocation.maxLedgerRows = gate.core.resources.allocation.used.ledgerRows - 1;
      gate.core.resources.allocation.limits.maxLedgerRows = wire.limits.allocation.maxLedgerRows;
      gate.core.resources.allocation.used.ledgerRows--;
    }); predicatePasses(attack);
    await assert.rejects(verify(attack.input), error => {
      assert.equal(error.code, 'review-reconsideration-allocation'); assert.match(error.message, /subject-creation-allocation-budget/); return true;
    });
  });
});

test('actual review preserves unavailable unrelated history and unknown K/O/D assignments', async t => {
  const f = await reconsiderationReviewFixture(t, { unavailableOriginal: true, assignedUnavailable: true });
  assert.ok(f.gate.core.ownerPreservation.unknownAssignments.length > 0);
  assert.equal(f.gate.impacts.replays.coverage.membershipComplete, false);
  const saved = await recordApprovedCandidateReview(f.writer());
  assert.equal(saved.status, 'retained');
});
