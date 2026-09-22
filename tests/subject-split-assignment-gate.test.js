import test from 'node:test';
import assert from 'node:assert/strict';
import * as gates from '../payload/engine/lib/assignment-gate.js';
import { subjectSplitAssignmentFixture } from './helpers/subject-split-assignment-fixture.js';

const run = f => gates.runPreparedSubjectSplitAssignmentGate(f.input);

test('actual split positive P8 binds handwritten zero/one/several substitution rows', async t => {
  const f = subjectSplitAssignmentFixture(t);
  const result = await run(f);
  assert.equal(result.core.ok, true, JSON.stringify(result.core.diagnostics));
  assert.equal(result.assignment.ok, true, JSON.stringify(result.assignment.diagnostics));
  assert.deepEqual(result.assignment.rows.map(row => row.ref), f.operation.mappings.map(row => row.ref));
  assert.equal(result.assignment.publicationReady, false);
});

for (const [name, options] of [
  ['grouped O without K', { kinds: ['ontology'], knowledgePresent: false }],
  ['grouped D without K', { kinds: ['decision'], knowledgePresent: false }],
  ['all K/O/D stores', { kinds: ['knowledge', 'ontology', 'decision'] }],
  ['nested SHA256 grouped O+D without K', { kinds: ['ontology', 'decision'], knowledgePresent: false, objectFormat: 'sha256', nested: true }],
  ['retained history and original inactive/inherited owners', { tracked: true, historical: true, inherited: 'retained' }],
  ['introduced successor inheritance', { inherited: 'introduced' }],
  ['all mapped subsets empty', { beforeChange(h) { for (const owner of h.owners) owner.successors = []; } }],
]) test(`positive split P8: ${name}`, async t => {
  const f = subjectSplitAssignmentFixture(t, options);
  if (f.priorInput) {
    const prior = await gates.runPreparedAssignmentGate(f.priorInput);
    assert.equal(prior.ok, true, JSON.stringify(prior.diagnostics));
  }
  const result = await gates.runPreparedSubjectSplitAssignmentGate(f.input);
  assert.equal(result.core.ok, true, JSON.stringify(result.core.diagnostics));
  assert.equal(result.assignment.ok, true, JSON.stringify(result.assignment.diagnostics));
  assert.equal(result.assignment.scope.basis, 'actual-split-affected-uses');
  assert.equal(result.assignment.checks.impactPolicy.status, 'not-performed');
  assert.equal(result.assignment.checks.humanApproval.status, 'not-performed');
  assert.equal(result.assignment.checks.preservation.status, 'passed');
  assert.equal(result.assignment.checks.authorizer.status, 'passed');
  assert.equal(result.assignment.checks.candidateCommitMembership.status, 'passed');
  assert.equal(result.assignment.rows.length, f.operation.mappings.length);
  assert.deepEqual(result.assignment.eventSource.candidate, f.input.candidate);
  assert.equal(result.assignment.eventSource.eventDigest, f.operation.assignmentEvent.changeDigest);
  assert.deepEqual(f.input.evidence.assessmentCaptures[0].registry.capture.source,
    { commit: f.input.before.commit, tree: f.input.before.tree });
  assert.equal(result.core.resources.governance.failure, null);
});

test('zero and malformed full requests cannot enter the positive adapter', async t => {
  const f = subjectSplitAssignmentFixture(t, { zero: true });
  for (const input of [f.input, null, { ...f.input, extra: true }]) {
    const result = await gates.runPreparedSubjectSplitAssignmentGate(input);
    assert.equal(result.core, null); assert.equal(result.assignment.ok, false);
  }
});

for (const [name, change, code] of [
  ['ordered event rows', f => f.assignmentEvent.rows.reverse(), 'assignment-model-unavailable'],
  ['mapping reason', f => { f.assignmentEvent.rows[0].reason = 'Different reviewed reason'; }, 'assignment-split-binding-mismatch'],
  ['full review reference', f => { f.assignmentEvent.review.reference = 'review:other'; }, 'assignment-split-decision-mismatch'],
  ['successor scope order', f => f.assignmentEvent.scope.successors.reverse(), 'assignment-split-binding-mismatch'],
  ['registry event scope order', f => f.assignmentEvent.scope['registry-events'].reverse(), 'assignment-split-binding-mismatch'],
  ['actual before capture source', f => { f.assignmentEvent.rows[0]['before-capture'].source.commit = f.input.candidate.commit; }, 'assignment-model-unavailable'],
  ['selected evidence metadata', f => f.editKnowledge('knowledge/K-000001.md', record => { record.citations[0].source += '-edited'; }), 'assignment-preservation-failed'],
  ['Knowledge note content', f => f.editKnowledge('knowledge/K-000001.md', record => { record.notes.at(-1).text += ' edited'; }), 'assignment-preservation-failed'],
  ['unselected path', f => f.put('extra.txt', 'not an assignment edit\n'), 'assignment-unselected-path-changed'],
]) test(`split P8 refuses ${name}`, async t => {
  const f = subjectSplitAssignmentFixture(t);
  change(f); f.save({ refreshCaptures: true });
  const result = await gates.runPreparedSubjectSplitAssignmentGate(f.input);
  if (code === 'assignment-model-unavailable') assert.equal(result.core, null);
  else assert.equal(result.core.ok, true, JSON.stringify(result.core.diagnostics));
  assert.equal(result.assignment.ok, false);
  assert.ok(result.assignment.diagnostics.some(row => row.code === code), JSON.stringify(result.assignment.diagnostics));
  assert.equal(result.assignment.publicationReady, false);
});

for (const [name, change] of [
  ['missing row', f => f.assignmentEvent.rows.pop()],
  ['extra row', f => f.assignmentEvent.rows.push(structuredClone(f.assignmentEvent.rows[0]))],
  ['wrong revision', f => { f.assignmentEvent.rows[0]['after-revision'] = 2; }],
  ['wrong raw before order', f => f.assignmentEvent.rows[2].before.ids.reverse()],
  ['wrong raw after order', f => f.assignmentEvent.rows[2].after.ids.reverse()],
]) test(`split P8 retains complete history refusals: ${name}`, async t => {
  const f = subjectSplitAssignmentFixture(t); change(f); f.save();
  const result = await gates.runPreparedSubjectSplitAssignmentGate(f.input);
  assert.equal(result.assignment.ok, false);
  assert.ok(result.assignment.diagnostics.length > 0);
});

test('grouped selected record changes outside subjects are refused', async t => {
  const f = subjectSplitAssignmentFixture(t, { kinds: ['ontology'], knowledgePresent: false });
  f.editEntries('ontology/classes/split-owners.yaml', rows => { rows[1].summary += ' edited'; }); f.save();
  const result = await gates.runPreparedSubjectSplitAssignmentGate(f.input);
  assert.equal(result.core.ok, true, JSON.stringify(result.core.diagnostics));
  assert.equal(result.assignment.ok, false);
  assert.ok(result.assignment.diagnostics.some(row => row.code === 'assignment-preservation-failed'));
});

test('early split core failure cannot claim structural model checks passed', async t => {
  const f = subjectSplitAssignmentFixture(t);
  f.input.limits.allocation.maxLedgerRows = 0;
  const result = await gates.runPreparedSubjectSplitAssignmentGate(f.input);
  assert.equal(result.core.ok, false);
  assert.equal(result.assignment.ok, false);
  assert.equal(result.assignment.checks.models.status, 'not-performed');
});

test('grouped unselected known-empty sibling stays literal', async t => {
  const f = subjectSplitAssignmentFixture(t, { kinds: ['ontology'], knowledgePresent: false, beforeChange(h) {
    h.editEntries('ontology/classes/split-owners.yaml', rows => rows.push({ ...structuredClone(rows[0]), id: 'O-000004', term: 'O-000004', subjects: [] }));
    h.ledger.allocations.push({ id: 'O-000004', kind: 'ontology', state: 'allocated', publication: { id: 'b2000000-0000-4000-8000-000000000001', review: 'review:existing-owners' } });
    h.put('_identity.yaml', h.ledger);
    const catalog = JSON.parse(h.read('ontology/_catalog.yaml'));
    catalog.entries.push({ id: 'O-000004', title: 'O-000004', file: 'classes/split-owners.yaml' }); h.put('ontology/_catalog.yaml', catalog);
  } });
  const good = await run(f); assert.equal(good.assignment.ok, true, JSON.stringify(good.assignment.diagnostics));
  f.editEntries('ontology/classes/split-owners.yaml', rows => { rows.find(row => row.id === 'O-000004').summary += ' edited'; }); f.save();
  const failed = await run(f);
  assert.equal(failed.core.ok, true, JSON.stringify(failed.core.diagnostics));
  assert.equal(failed.assignment.ok, false);
  assert.ok(failed.assignment.diagnostics.some(row => row.code === 'assignment-preservation-failed'));
});

for (const baseline of [false, true]) test(`retained ${baseline ? 'baseline' : 'event'} bytes cannot be rewritten`, async t => {
  const f = subjectSplitAssignmentFixture(t, { tracked: true });
  const file = baseline ? 'subjects/_assignments/_baselines.yaml' : `subjects/_assignments/${f.priorEvent.event}.yaml`;
  f.put(file, `# Unreviewed physical rewrite\n${f.read(file)}`);
  f.input.candidate = f.commit('same parsed history with different retained bytes');
  const result = await run(f);
  assert.equal(result.core.ok, true, JSON.stringify(result.core.diagnostics));
  assert.equal(result.assignment.ok, false);
  assert.ok(result.assignment.diagnostics.some(row => row.code === (baseline ? 'assignment-baseline-bytes-changed' : 'assignment-unselected-path-changed')),
    JSON.stringify(result.assignment.diagnostics));
});
