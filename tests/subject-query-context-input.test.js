import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDecisionCaptures, decodeAssessmentCaptures, SubjectQueryContextError } from '../payload/engine/lib/subject-query-context.js';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { indexSubjects } from '../payload/engine/lib/subjects.js';
import { evaluateSubjectGovernance, subjectEligibility } from '../payload/engine/lib/subject-governance.js';

function transport() {
  return subjectGovernanceFixture().decisionCaptures.map(({ capture, bytes, objectFormat }) => ({
    capture, bytesBase64: bytes.toString('base64'), objectFormat,
  }));
}

test('assessment transport preserves both retained documents using the same strict byte format', () => {
  const row = transport()[0];
  const source = [{ registry: row, identity: { ...row, capture: { ...row.capture, file: '_identity.yaml' } } }];
  const copied = structuredClone(source);
  const decoded = decodeAssessmentCaptures(source);
  assert.equal(decoded.length, 1);
  assert.deepEqual(source, copied);
  for (const part of ['registry', 'identity']) {
    assert.equal(Buffer.isBuffer(decoded[0][part].bytes), true);
    assert.equal(decoded[0][part].bytes.toString('base64'), row.bytesBase64);
    assert.deepEqual(decoded[0][part].capture, source[0][part].capture);
  }
  assert.deepEqual(decodeAssessmentCaptures([]), []);
});

test('assessment transport requires exact complete pairs and rejects malformed inner byte transport', () => {
  const row = transport()[0];
  const pair = { registry: row, identity: row };
  for (const document of [null, {}, [null], [{ registry: row }], [{ ...pair, extra: true }],
    [{ ...pair, registry: { ...row, bytesBase64: 'Zg' } }],
    [{ ...pair, identity: { ...row, bytesBase64: 'Zm9v\n' } }],
    [{ ...pair, identity: { ...row, objectFormat: 'sha512' } }],
    [{ ...pair, registry: { ...row, capture: { ...row.capture, file: '../registry.yaml' } } }],
    [{ ...pair, identity: { ...row, bytes: Buffer.alloc(0) } }]]) {
    assert.throws(() => decodeAssessmentCaptures(document), (error) => error instanceof SubjectQueryContextError
      && error.code === 'invalid-assessment-captures');
  }
});

test('assessment decoder preserves duplicate evidence for the actual verifier to adjudicate', () => {
  const row = transport()[0];
  const decoded = decodeAssessmentCaptures([{ registry: row, identity: row }, { registry: row, identity: row }]);
  assert.equal(decoded.length, 2);
  assert.notEqual(decoded[0].registry.bytes, decoded[1].registry.bytes);
});

test('strict capture transport preserves actual retained bytes for the real P2 verifier', () => {
  const source = transport();
  const copied = structuredClone(source);
  const captures = decodeDecisionCaptures(source);
  assert.deepEqual(source, copied);
  assert.equal(Buffer.isBuffer(captures[0].bytes), true);
  assert.deepEqual(captures[0].bytes, subjectGovernanceFixture().decisionCaptures[0].bytes);
  const fixture = subjectGovernanceFixture();
  const result = evaluateSubjectGovernance({ registry: indexSubjects(fixture.document).registry,
    identity: fixture.identityInput.identity, identityIndex: fixture.identityIndex, decisionCaptures: captures });
  assert.equal(result.ok, true);
  assert.equal(subjectEligibility(result.governance, 'S-000001', { purpose: 'query' }).eligible, true);
});

test('explicit empty evidence stays absent rather than inventing an approval capture', () => {
  assert.deepEqual(decodeDecisionCaptures([]), []);
});

test('transport refuses unknown fields, malformed rows and invalid capture locators', () => {
  const valid = transport()[0];
  for (const document of [null, {}, [null], [{ ...valid, extra: true }],
    [{ capture: valid.capture, bytesBase64: valid.bytesBase64 }],
    [{ ...valid, bytes: Buffer.alloc(0) }], [{ ...valid, objectFormat: 'SHA1' }],
    [{ ...valid, capture: { ...valid.capture, file: '../approval.yaml' } }],
    [{ ...valid, capture: { ...valid.capture, extra: true } }]]) {
    assert.throws(() => decodeDecisionCaptures(document), (error) => error instanceof SubjectQueryContextError
      && error.code === 'invalid-decision-captures');
  }
});

test('base64 must be canonical padded encoding, never silently decoded from junk', () => {
  const valid = transport()[0];
  for (const bytesBase64 of ['???', 'Z g==', 'Zg', 'Zg===', 'Zh==', 'Zm9=', 'Zm9v\n', 'Zm-v', 123]) {
    assert.throws(() => decodeDecisionCaptures([{ ...valid, bytesBase64 }]), { code: 'invalid-decision-captures' });
  }
  for (const bytesBase64 of ['', 'Zg==', 'Zm8=', 'Zm9v']) {
    assert.equal(decodeDecisionCaptures([{ ...valid, bytesBase64 }])[0].bytes.toString('base64'), bytesBase64);
  }
});

test('decoded source bytes still need actual governance integrity and semantic validation', () => {
  const fixture = subjectGovernanceFixture();
  const captures = decodeDecisionCaptures(transport());
  captures[0].bytes[0] ^= 1;
  const result = evaluateSubjectGovernance({ registry: indexSubjects(fixture.document).registry,
    identity: fixture.identityInput.identity, identityIndex: fixture.identityIndex, decisionCaptures: captures });
  assert.equal(result.ok, false);
  assert.equal(result.governance, null);
});
