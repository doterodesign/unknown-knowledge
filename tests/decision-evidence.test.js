import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyDecisionEvidence } from '../payload/engine/lib/decision-evidence.js';
import { fixture } from './helpers/subject-suppression-fixture.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';

test('shared evidence verifies actual captured Decision bytes and distinguishes missing from invalid evidence', (t) => {
  const f = fixture(t);
  const { decision, review } = f.candidate.history[0];
  const input = { decision, acceptedStatus: review.acceptedStatus, decisionDigest: review.decisionDigest,
    decisionCapture: review.decisionCapture, captures: f.decisionCaptures };
  assert.deepEqual(verifyDecisionEvidence(input), { status: 'verified', diagnostics: [] });
  assert.deepEqual(verifyDecisionEvidence({ ...input, captures: [] }), { status: 'unavailable', diagnostics: [] });
  for (const [code, fields] of [
    ['invalid-review', { acceptedStatus: 'proposed', captures: [] }],
    ['invalid-authorizer', { decision: { ...decision, kind: 'subject' } }],
    ['ambiguous-evidence', { captures: [...input.captures, ...input.captures] }],
    ['invalid-authorizer-evidence', { decisionDigest: '0'.repeat(64) }],
    ['evidence-digest-mismatch', { captures: [{ ...input.captures[0], bytes: Buffer.from('wrong') }] }],
  ]) {
    const result = verifyDecisionEvidence({ ...input, ...fields });
    assert.equal(result.status, 'invalid');
    assert.equal(result.diagnostics[0].code, code);
  }
});

test('verified raw bytes still require valid UTF-8/YAML and unexpected defects propagate', (t) => {
  const f = fixture(t);
  const { decision, review } = f.candidate.history[0];
  for (const bytes of [Buffer.from([0xff]), Buffer.from('entries: [')]) {
    const capture = describeCandidateBytes({ file: review.decisionCapture.file, bytes, objectFormat: 'sha1' });
    const result = verifyDecisionEvidence({ decision, acceptedStatus: review.acceptedStatus,
      decisionDigest: review.decisionDigest, decisionCapture: capture, captures: [{ capture, bytes, objectFormat: 'sha1' }] });
    assert.equal(result.status, 'invalid');
    assert.equal(result.diagnostics[0].code, 'invalid-evidence');
  }
  const bug = new TypeError('unexpected capture getter');
  assert.throws(() => verifyDecisionEvidence({ decision, acceptedStatus: review.acceptedStatus,
    decisionDigest: review.decisionDigest, decisionCapture: review.decisionCapture,
    captures: [{ get capture() { throw bug; } }] }), (error) => error === bug);
});
