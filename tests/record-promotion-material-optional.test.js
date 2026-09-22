import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewRecordPromotionMaterialFixture } from './helpers/record-promotion-material-fixture.js';
import { recordApprovedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';

for (const kind of ['knowledge', 'ontology', 'decision']) test(`continued ${kind} publishes native unknown/empty genesis without a registry`, async t => {
  const f = await reviewRecordPromotionMaterialFixture(t, { kind, subjectAuthority: false,
    ...(kind === 'decision' ? { companionStores: [] } : {}) });
  assert.equal(f.reconsideration, null);
  assert.equal(f.final.status, 'passed');
  assert.equal(f.final.gate.version, 3);
  assert.equal(f.final.gate.capabilities.before.subjectRegistry, false);
  assert.equal(f.final.gate.capabilities.candidate.subjectRegistry, false);
  if (kind === 'decision') {
    assert.equal(f.final.gate.capabilities.before.knowledge, false);
    assert.equal(f.final.gate.capabilities.before.ontology, false);
  }
  assert.deepEqual(f.final.gate.impacts.required, []);
  assert.deepEqual(f.final.gate.assignment.rows.map(row => row.eligibility.candidate), [
    { state: 'unknown', reason: 'absent' }, { state: 'known', ids: [] }, { state: 'known', ids: [] },
  ]);
  assert.equal(f.final.gate.resources.governance.failure, null);
  const saved = await recordApprovedCandidateReview(f.writer());
  assert.equal(saved.status, 'retained');
  const published = await publishPreparedCandidate(f.publisher(saved));
  assert.equal(published.status, 'published', JSON.stringify(published));
  assert.equal(f.git('rev-parse', f.request.publish.outputRef), f.candidate.commit);
});
