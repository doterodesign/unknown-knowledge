import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitAssignmentFixture } from './helpers/subject-split-assignment-fixture.js';
import { runPreparedSubjectSplitGate } from '../payload/engine/lib/subject-split-gate.js';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';

for (const [name, options] of [
  ['mixed K/O/D', { kinds: ['knowledge', 'ontology', 'decision'] }],
  ['nested SHA256 O/D without Knowledge', { kinds: ['ontology', 'decision'], knowledgePresent: false, nested: true, objectFormat: 'sha256' }],
  ['retained prior assignment history', { tracked: true }],
]) test(`complete positive split composes preservation and mandatory impacts: ${name}`, async t => {
  const f = subjectSplitAssignmentFixture(t, options);
  if (f.priorInput) {
    const prior = await runPreparedAssignmentGate(f.priorInput);
    assert.equal(prior.ok, true, JSON.stringify(prior.diagnostics));
  }
  const result = await runPreparedSubjectSplitGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.publicationReady, false);
  assert.ok(Object.values(result.checks).every(({ status }) => status === 'passed'));
  assert.equal(result.assignments.ok, true);
  assert.equal(result.assignments.checks.impactPolicy.status, 'not-performed');
  assert.equal(result.assignmentAssessment, null);
  assert.equal(result.preservation, null);
  assert.equal(result.sources.assignmentEvent.eventId, f.operation.assignmentEvent.id);
  assert.equal(result.sources.assignmentEvent.eventDigest, f.operation.assignmentEvent.changeDigest);
  assert.deepEqual(result.sources.assignmentEvent.eventCapture.source, {
    commit: f.input.candidate.commit, tree: f.input.candidate.tree,
  });
  assert.deepEqual(result.sources.identityCapture, result.allocation.candidate.capture);
  assert.equal(result.impacts.subjectTree.status, 'complete');
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  assert.equal(result.impacts.representativeReplays.comparison.status, 'incomplete');
  assert.equal(result.impacts.routes.status, 'requires-final-capability');
  assert.equal(result.resources.governance.failure, null);
});

test('all empty successor choices still require a real nonempty assignment event', async t => {
  const f = subjectSplitAssignmentFixture(t, { kinds: ['ontology'], knowledgePresent: false });
  for (const mapping of f.operation.mappings) mapping.successors = [];
  f.editEntries(f.owners[0].file, entries => {
    for (const entry of entries) entry.subjects = entry.subjects.filter(id => !f.operation.successors.includes(id));
  });
  for (const row of f.assignmentEvent.rows) row.after.ids = row.before.ids.filter(id => id !== f.operation.subject);
  f.save();
  const result = await runPreparedSubjectSplitGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.assignments.rows.length, 3);
  assert.equal(result.checks.assignments.status, 'passed');
  assert.equal(result.assignmentAssessment, null);
  assert.ok(result.sources.assignmentEvent);
});

test('outer split refuses actual event review mismatch before running impacts', async t => {
  const f = subjectSplitAssignmentFixture(t);
  f.assignmentEvent.rows[0].reason = 'A different unreviewed rationale';
  f.save();
  const result = await runPreparedSubjectSplitGate(f.input);
  assert.equal(result.ok, false);
  assert.equal(result.checks.assignments.status, 'failed', JSON.stringify(result));
  assert.equal(result.impacts.representativeReplays, null);
  assert.equal(result.sources.assignmentEvent, null);
});

for (const group of ['reach', 'views', 'replays']) test(`mandatory ${group} capacity cannot be waived after positive P8 success`, async t => {
  const f = subjectSplitAssignmentFixture(t);
  const key = { reach: 'maxRecords', views: 'maxViews', replays: 'maxCases' }[group];
  f.input.limits[group][key] = 0;
  const result = await runPreparedSubjectSplitGate(f.input);
  assert.equal(result.ok, false);
  assert.equal(result.assignments.ok, true);
  assert.equal(result.checks.impacts.status, 'failed', JSON.stringify(result));
  assert.equal(result.diagnostics[0].code, 'split-required-impact-incomplete');
  if (group === 'replays') assert.equal(result.impacts.representativeReplays.comparison?.resources.queries.calls ?? 0, 0);
  else assert.equal(result.impacts.representativeReplays, null);
});
