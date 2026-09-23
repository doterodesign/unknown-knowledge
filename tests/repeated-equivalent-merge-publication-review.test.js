import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repeatedEquivalentMergeFixture } from './helpers/repeated-equivalent-merge-fixture.js';
import { reviewSubjectMergeMaterialFixture } from './helpers/subject-merge-material-fixture.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';
import { resolveSubject } from '../payload/engine/lib/subjects.js';

test('publish A→B then B→C on the same actual output ref without flattening history', async t => {
  const f = await repeatedEquivalentMergeFixture(t, { nested: true });
  assert.equal(f.zero, false);
  assert.deepEqual(f.input.before, f.firstInput.candidate);
  assert.deepEqual(f.firstInput.operation.absorbed, ['S-000001']);
  assert.equal(f.firstInput.operation.survivor, 'S-000002');
  assert.deepEqual(f.input.operation.absorbed, ['S-000002']);
  assert.equal(f.input.operation.survivor, 'S-000003');
  assert.equal(f.input.before.kitPath, 'unknown-knowledge');

  // The shared helper constructs both immutable candidates. These two actual
  // review/publication calls establish sequential publication, not just commits.
  const first = await reviewSubjectMergeMaterialFixture(t, {}, async () => ({ ...f, input: f.firstInput }));
  assert.equal(first.final.status, 'passed', JSON.stringify(first.final));
  const firstReview = await recordApprovedCandidateReview(first.writer());
  assert.equal(firstReview.status, 'retained', JSON.stringify(firstReview));
  const firstPublished = await publishPreparedCandidate(first.publisher(firstReview));
  assert.equal(firstPublished.status, 'published', JSON.stringify(firstPublished));
  const outputRef = first.request.publish.outputRef;
  assert.equal(f.git('rev-parse', outputRef), f.firstInput.candidate.commit);

  const second = await reviewSubjectMergeMaterialFixture(t, {}, async () => f);
  assert.equal(second.final.status, 'passed', JSON.stringify(second.final));
  assert.equal(second.request.publish.outputRef, outputRef);
  assert.equal(second.source.commit, first.candidate.commit);
  second.request.publish.expectedOldCommit = first.candidate.commit;
  const oldA = f.beforeDocument.subjects.find(row => row.id === 'S-000001');
  assert.equal(oldA.status, 'retired');
  assert.deepEqual(oldA.retirement, { kind: 'equivalent-merge', redirect: 'S-000002' });
  assert.deepEqual(f.document.subjects.find(row => row.id === oldA.id), oldA);
  assert.deepEqual(f.document.history.slice(0, -1), f.beforeDocument.history);
  assert.deepEqual(f.document.subjects.find(row => row.id === 'S-000002').retirement,
    { kind: 'equivalent-merge', redirect: 'S-000003' });
  assert.equal(f.document.subjects.find(row => row.id === 'S-000003').status, 'active');

  const firstEventFile = `subjects/_assignments/${f.firstInput.operation.assignmentEvent.id}.yaml`;
  assert.deepEqual(f.capture(f.firstInput.candidate, firstEventFile).bytes,
    f.capture(f.input.candidate, firstEventFile).bytes);
  assert.deepEqual(f.capture(f.firstInput.before, '_identity.yaml').bytes,
    f.capture(f.input.candidate, '_identity.yaml').bytes);
  assert.equal(second.final.gate.checks.assignments.status, 'passed');
  assert.equal(second.final.gate.impacts.representativeReplays.status, 'complete');

  const secondReview = await recordApprovedCandidateReview(second.writer());
  assert.equal(secondReview.status, 'retained', JSON.stringify(secondReview));
  const publication = second.publisher(secondReview);
  const receipt = readRetainedCandidateReview({ evidenceDirectory: second.evidenceDirectory,
    validationBundleDigest: publication.validationBundleDigest, reviewBundleDigest: publication.reviewBundleDigest,
    expectedRequestDigest: publication.expectedRequestDigest, limits: publication.limits.review });
  assert.equal(receipt.status, 'verified', JSON.stringify(receipt));
  assert.equal(receipt.request.publish.expectedOldCommit, first.candidate.commit);
  assert.deepEqual(receipt.receipt.review.decision, f.event.decision);
  assert.deepEqual(receipt.receipt.review.decisionCapture, f.event.review.decisionCapture);

  const index = readFileSync(join(f.root, '.git/index'));
  const worktree = f.git('status', '--porcelain');
  const secondPublished = await publishPreparedCandidate(publication);
  assert.equal(secondPublished.status, 'published', JSON.stringify(secondPublished));
  assert.equal(f.git('rev-parse', outputRef), f.input.candidate.commit);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  assert.equal(f.git('status', '--porcelain'), worktree);
  assert.equal(f.git('rev-parse', second.request.source.ref), f.firstInput.candidate.commit);

  const loaded = loadSubjectQueryContext({ root: f.root, ...f.input.evidence });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const registry = loaded.context.model.subjectRegistry;
  const equivalent = resolveSubject(registry, 'S-000001', { policy: 'equivalent', budget: { redirects: 2 } });
  assert.equal(equivalent.status, 'resolved');
  assert.equal(equivalent.id, 'S-000003');
  assert.deepEqual(equivalent.redirects, [
    { from: 'S-000001', to: 'S-000002' }, { from: 'S-000002', to: 'S-000003' },
  ]);
  assert.equal(resolveSubject(registry, 'S-000001', { policy: 'historical' }).id, 'S-000001');
  assert.equal(resolveSubject(registry, 'S-000001', { policy: 'current' }).code, 'subject-retired');
  const query = querySubjects(loaded.context, { version: 1, stores: ['knowledge'], view: 'current',
    expansion: 'direct', subjectPolicy: 'equivalent', ranking: { profile: 'id-v1' }, possibleMatches: true,
    where: { op: 'assigned', subject: 'S-000001' }, budgets: f.input.limits.query });
  assert.equal(query.status, 'complete', JSON.stringify(query));
  assert.equal(query.coverage.evaluationComplete, true);
  assert.ok(query.groups.knowledge.strict.some(row => row.ref.id === 'K-000001'),
    'the original A operand still reaches its actual owner after two published substitutions');
});
