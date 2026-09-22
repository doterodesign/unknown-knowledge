import test from 'node:test';
import assert from 'node:assert/strict';
import { equivalentMergeFixture, registryWire } from './helpers/equivalent-merge-fixture.js';
import { inspectEquivalentMergeAssignmentScope } from '../payload/engine/lib/subject-equivalent-merge-core.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

test('actual merge scope preserves unknowns while deriving exact original Knowledge reassignments', async (t) => {
  const f = equivalentMergeFixture(t);
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.assignments.map(({ ref, after }) => [ref.id, after.ids]), [
    ['K-000001', ['S-000002']], ['K-000002', ['S-000002', 'S-000003']],
  ]);
  assert.equal(result.authoredReferenceClosure.status, 'complete');
  assert.equal(result.authoredReferenceClosure.semanticCompleteness, 'unknown');
  assert.equal(result.authoredReferenceClosure.retainedUnknowns.length, 2);
  assert.equal(result.inventory.status, 'incomplete');
  assert.equal(result.inventory.deltas.complete, false);
  assert.equal(result.registry.candidateCapture.source.tree, f.input.candidate.tree);
  assert.equal(result.registry.events[0].changeDigest, f.input.operation.registryEvents[0].changeDigest);
});

test('an omitted retain-unclassified disposition refuses the actual merge', async (t) => {
  const f = equivalentMergeFixture(t); f.input.operation.retainedUnknowns.pop();
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-retained-unknown-scope');
});

test('unchanged proposal source assignments remain unsupported observed uses', async (t) => {
  const f = equivalentMergeFixture(t, { beforeChange: ({ replaceSubjects }) => replaceSubjects('knowledge/draft.md', ['S-000001']) });
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-source-use-unsupported');
});

test('invalid assignment substitution cannot silently remove unrelated membership', async (t) => {
  const f = equivalentMergeFixture(t, { candidateChange: ({ replaceSubjects }) => replaceSubjects('knowledge/K-000002.md', ['S-000002']) });
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-assignment-substitution');
});

test('unexamined records cannot be relabeled retained-unclassified by caller reasons', async (t) => {
  const f = equivalentMergeFixture(t); f.input.limits.inventory.maxRecordVisits = 1;
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-inventory-incomplete');
  assert.equal(result.authoredReferenceClosure.status, 'not-performed');
});

test('a source-bound unclassified owner cannot change unrelated file bytes', async (t) => {
  const f = equivalentMergeFixture(t, { candidateChange: ({ put, read }) => put('knowledge/K-000005.md', `${read('knowledge/K-000005.md')}Changed body.\n`) });
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-retained-unknown-changed');
});

test('retained review absence cannot grant active or equivalent participant eligibility', async (t) => {
  const f = equivalentMergeFixture(t); f.input.evidence.decisionCaptures = [];
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-participant-evidence');
});

test('an actual source child blocks the no-graph-edit vertical', async (t) => {
  const f = equivalentMergeFixture(t, { beforeChange: ({ context, put }) => {
    const document = structuredClone(context.model.subjectRegistry.document);
    document.subjects[2].parent = 'S-000001'; document.history[0].rows[2].after.parent = 'S-000001';
    document.hierarchyRevision += 1;
    const { review, ...body } = document.history[0]; review.changeDigest = canonicalSha256(body);
    put('subjects/registry.yaml', registryWire(document));
  } });
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'merge-graph-use-unsupported');
});

test('the existing survivor position wins when both IDs were assigned', async (t) => {
  const f = equivalentMergeFixture(t, {
    beforeChange: ({ replaceSubjects }) => replaceSubjects('knowledge/K-000002.md', ['S-000003', 'S-000001', 'S-000002']),
    candidateChange: ({ replaceSubjects }) => replaceSubjects('knowledge/K-000002.md', ['S-000003', 'S-000002']),
  });
  const result = await f.withCoreInput(inspectEquivalentMergeAssignmentScope);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.assignments[1].after.ids, ['S-000003', 'S-000002']);
});
