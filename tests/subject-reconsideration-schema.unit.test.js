/** Schema admission only; governance, source integrity and approval are separate checks. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, authored, stateOf, digestEvent, ref } from './helpers/subject-suppression-fixture.js';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';
import { createHash } from 'node:crypto';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { parseSubjectRegistry, SUBJECT_REGISTRY_DIAGNOSTIC_CODES } from '../payload/engine/lib/subject-registry-reader.js';

/** A sha1 capture locator: the Git blob ID and the sha256 of the exact bytes. */
const capture = (file, bytes) => ({ file,
  blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
  sha256: createHash('sha256').update(bytes).digest('hex') });

function example(t) {
  const f = fixture(t);
  const before = structuredClone(f.candidate);
  const proposal = before.subjects[0];
  const { refusal, ...meaning } = stateOf(proposal);
  const material = { ref: ref('D-000001'), capture: f.decisionCaptures[0].capture };
  const beforeBytes = Buffer.from(JSON.stringify(authored(before)));
  const event = {
    id: '34567890-1234-4234-8234-123456789abc', action: 'activate', decision: ref('D-000001'),
    rows: [{ id: 'S-000001', before: null, after: { ...meaning, status: 'active', originDecision: ref('D-000001') } }],
    promotes: { key: proposal.id, before: structuredClone(proposal) }, priorRefusal: proposal.changes.at(-1),
    reconsideration: { reason: 'Existing captured material was reconsidered under the reviewed scope.', records: [material], sources: [] },
  };
  event.reconsiderationAssessment = { version: 1,
    scope: { beforeRegistry: { capture: capture('subjects/registry.yaml', beforeBytes),
      documentDigest: canonicalSha256(before) }, identityDigest: f.model.identityIndex.identityDigest },
    coverage: 'complete-registry', attestation: 'all-current-suppressed-meanings-assessed',
    relevantRefusals: [{ subject: proposal.id, refusal: event.priorRefusal,
      disposition: 'same-meaning-reconsidered', reason: event.reconsideration.reason }] };
  event.review = { reference: 'review:reconsideration-schema-example', acceptedStatus: 'accepted',
    decisionCapture: material.capture, decisionDigest: canonicalSha256(f.model.decisions.get('D-000001').record),
    changeDigest: digestEvent(event) };
  const wire = authored({ ...before, revision: 2,
    subjects: [{ id: 'S-000001', ...event.rows[0].after, changes: [event.id] }], history: [...before.history, event] });
  const selected = wire.history.at(-1);
  selected['reconsideration-assessment'] = selected.reconsiderationAssessment;
  delete selected.reconsiderationAssessment;
  selected['prior-refusal'] = selected.priorRefusal;
  delete selected.priorRefusal;
  return wire;
}
const validate = document => validateStoreFile('subject-registry', document);

test('reconsideration schema admits captured record and archived-source declarations', t => {
  const wire = example(t);
  assert.equal(validate(wire).ok, true, JSON.stringify(validate(wire)));
  const event = wire.history.at(-1);
  event.reconsideration.sources.push({ locator: 'urn:reviewed-source', revision: 'snapshot-1',
    capture: event.reconsideration.records[0].capture });
  assert.equal(validate(wire).ok, true, 'source capture is explicit alongside declared locator and revision');
});

test('reconsideration schema keeps evidence and assessment objects closed', async t => {
  const baseline = example(t);
  assert.equal(validate(baseline).ok, true, 'valid control must pass before negative shape checks');
  for (const [label, change] of [
    ['missing material reason', e => { delete e.reconsideration.reason; }],
    ['blank material reason', e => { e.reconsideration.reason = ' '; }],
    ['missing record list', e => { delete e.reconsideration.records; }],
    ['null source list', e => { e.reconsideration.sources = null; }],
    ['unknown material field', e => { e.reconsideration.automatic = true; }],
    ['missing record capture', e => { delete e.reconsideration.records[0].capture; }],
    ['unknown record field', e => { e.reconsideration.records[0].confidence = 1; }],
    ['source without archive', e => { e.reconsideration.sources = [{ locator: 'urn:source', revision: '1' }]; }],
    ['source without revision', e => { e.reconsideration.sources = [{ locator: 'urn:source', capture: e.review['decision-capture'] }]; }],
    ['unknown source field', e => { e.reconsideration.sources = [{ locator: 'urn:source', revision: '1', capture: e.review['decision-capture'], trusted: true }]; }],
    ['wrong assessment version', e => { e['reconsideration-assessment'].version = 2; }],
    ['missing assessment scope', e => { delete e['reconsideration-assessment'].scope; }],
    ['unknown scope field', e => { e['reconsideration-assessment'].scope.current = true; }],
    ['unknown disposition', e => { e['reconsideration-assessment']['relevant-refusals'][0].disposition = 'automatic-reversal'; }],
    ['unknown assessment field', e => { e['reconsideration-assessment'].approved = true; }],
  ]) await t.test(label, () => {
    const candidate = structuredClone(baseline); change(candidate.history.at(-1));
    assert.equal(validate(candidate).ok, false);
  });
});

test('ordinary refusal-assessment v1 does not acquire the reconsideration disposition', t => {
  const wire = example(t); const event = wire.history.at(-1);
  event['refusal-assessment'] = event['reconsideration-assessment'];
  delete event['reconsideration-assessment']; delete event.reconsideration;
  const row = event['refusal-assessment']['relevant-refusals'][0];
  row.disposition = 'distinct-meaning';
  assert.equal(validate(wire).ok, true, 'ordinary assessment syntax remains supported');
  row.disposition = 'same-meaning-reconsidered';
  assert.equal(validate(wire).ok, false, 'new evidence semantics require their separate field');
});
