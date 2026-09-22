import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectRetirementAssignmentFixture } from './helpers/subject-retirement-assignment-fixture.js';
import { runPreparedSubjectRetirementGate } from '../payload/engine/lib/subject-retirement-gate.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const recapture = f => {
  f.git('add', '.'); const tree = f.git('write-tree');
  f.input.candidate = { ...f.input.candidate, tree,
    commit: f.git('commit-tree', tree, '-p', f.input.before.commit, '-m', 'independent candidate mutation') };
};

for (const zero of [false,true]) test(`actual retirement ${zero ? 'without effective direct uses' : 'with withdrawals'} retains required impacts and exact authority`, async t => {
  const f = subjectRetirementAssignmentFixture(t, { zero, child: true, sameOwner: !zero, historical: zero });
  const result = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.publicationReady, false);
  assert.deepEqual(result.inputs, { before: f.input.before, candidate: f.input.candidate });
  assert.equal(result.impacts.subjectTree.status, 'complete');
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  assert.equal(result.impacts.representativeReplays.comparison.status, 'incomplete');
  assert.equal(result.impacts.reach.status, 'incomplete');
  assert.equal(result.authoredReferenceClosure.status, 'complete');
  assert.equal(result.checks.decision.status, 'passed');
  assert.equal(result.checks.candidateCommitMembership.status, 'passed');
  if (zero) {
    assert.equal(result.assignments, null); assert.equal(result.sources.assignmentEvent, null);
    assert.deepEqual(result.checks.assignments, { status: 'not-applicable' });
    assert.deepEqual(result.preservation.proof.changedPaths, [result.preservation.proof.registryFile]);
    assert.equal(result.assignmentAssessment.inventoryDigest, canonicalSha256(result.inventory));
    assert.equal(result.assignmentAssessment.preservationDigest, canonicalSha256(result.preservation.proof));
    assert.equal(result.preservation.proofDigest, result.assignmentAssessment.preservationDigest);
  } else {
    assert.equal(result.assignmentAssessment, null); assert.equal(result.preservation, null);
    assert.equal(result.assignments.ok, true);
    assert.ok(Object.values(result.checks).every(({status}) => status === 'passed'));
    assert.ok(result.authoredReferenceClosure.retainedInheritedUses.some(row => row.disposition === 'exposed-by-direct-withdrawal'));
  }
});

for (const kind of ['ontology', 'decision']) for (const zero of [false, true])
  test(`complete ${kind} retirement with Knowledge absent, zero=${zero}`, async t => {
    const f = subjectRetirementAssignmentFixture(t, { kind, zero, knowledgePresent: false, nested: kind === 'decision' });
    const result = await runPreparedSubjectRetirementGate(f.input);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.impacts.representativeReplays.status, 'complete');
    assert.equal(result.assignments === null, zero);
  });

for (const zero of [false, true]) test(`retirement preserves independently validated prior history, zero=${zero}`, async t => {
  const f = subjectRetirementAssignmentFixture(t, { kind: 'ontology', tracked: true, zero });
  const prior = await runPreparedAssignmentGate(f.priorInput);
  assert.equal(prior.ok, true, JSON.stringify(prior));
  const result = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  for (const file of ['subjects/_assignments/_baselines.yaml', `subjects/_assignments/${f.priorEvent.event}.yaml`]) {
    assert.equal(f.git('show', `${f.input.before.commit}:${file}`), f.git('show', `${f.input.candidate.commit}:${file}`));
  }
});

for (const kind of ['ontology', 'decision']) test(`one retirement preserves Knowledge and grouped ${kind} sources together`, async t => {
  const f = subjectRetirementAssignmentFixture(t, { kind, includeKnowledge: true,
    beforeChange: f => {
      f.replaceSubjects('knowledge/K-000001.md', ['S-000001']);
      f.replaceSubjects('knowledge/K-000002.md', ['S-000001', 'S-000002']);
    } });
  const result = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.authoredReferenceClosure.affectedRefs.length, 4);
  assert.deepEqual([...new Set(result.authoredReferenceClosure.affectedRefs.map(({kind}) => kind))].sort(), ['knowledge', kind].sort());
  assert.equal(result.assignments.ok, true);
});

test('eventless retirement rejects unrelated added files and mode-only changes', async t => {
  for (const mode of [false, true]) {
    const f = subjectRetirementAssignmentFixture(t, { zero: true });
    if (mode) f.git('update-index', '--chmod=+x', 'knowledge/K-000003.md');
    else { f.put('unrelated.txt', 'unreviewed addition\n'); f.git('add', '.'); }
    const tree = f.git('write-tree');
    f.input.candidate = { ...f.input.candidate, tree,
      commit: f.git('commit-tree', tree, '-p', f.input.before.commit, '-m', 'unrelated path or mode change') };
    const result = await runPreparedSubjectRetirementGate(f.input);
    assert.equal(result.ok, false);
    assert.equal(result.checks.preservation.status, 'failed', JSON.stringify(result));
    assert.equal(result.diagnostics[0].code, 'retirement-zero-use-path-changed');
    assert.equal(result.preservation.status, 'failed');
    assert.equal(result.assignmentAssessment, null);
    assert.equal(result.impacts.representativeReplays, null);
  }
});

test('zero-use closure admits an exact-fit proof and does not retain a one-short proof', async t => {
  const f = subjectRetirementAssignmentFixture(t, { zero: true });
  const complete = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(complete.ok, true, JSON.stringify(complete));
  f.input.limits.closure = { maxRows: complete.resources.closure.used.rows, maxBytes: complete.resources.closure.used.bytes };
  const exact = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(exact.ok, true, JSON.stringify(exact));
  for (const limit of ['maxRows', 'maxBytes']) {
    const input = { ...f.input, limits: { ...f.input.limits, closure: { ...f.input.limits.closure,
      [limit]: f.input.limits.closure[limit] - 1 } } };
    const refused = await runPreparedSubjectRetirementGate(input);
    assert.equal(refused.ok, false);
    assert.equal(refused.resources.closure.failure.limit, limit);
    assert.equal(refused.checks.preservation.status, 'failed');
    assert.equal(refused.preservation, null, 'unadmitted proof is not retained');
    assert.equal(refused.assignmentAssessment, null);
    assert.equal(refused.impacts.representativeReplays, null);
  }
});

test('actual tree mismatches and unselected byte changes cannot pass retirement', async t => {
  const f = subjectRetirementAssignmentFixture(t);
  const wrongTree = await runPreparedSubjectRetirementGate({ ...f.input,
    candidate: { ...f.input.candidate, tree: f.input.before.tree } });
  assert.equal(wrongTree.ok, false);
  assert.equal(wrongTree.diagnostics[0].code, 'retirement-tree-mismatch');
  f.put('knowledge/K-000003.md', f.read('knowledge/K-000003.md') + '\nUnreviewed extra content.\n');
  recapture(f);
  const changed = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(changed.ok, false);
  assert.equal(changed.checks.assignments.status, 'failed', JSON.stringify(changed));
  assert.ok(changed.assignments.diagnostics.some(({code}) => code === 'assignment-unselected-path-changed'));
});

test('insufficient replay inventory retains incompleteness and executes no query', async t => {
  const f = subjectRetirementAssignmentFixture(t, { zero: true });
  f.input.limits.replays.maxCases = 0;
  const result = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(result.ok, false);
  assert.equal(result.checks.impacts.status, 'failed');
  assert.equal(result.impacts.representativeReplays.status, 'incomplete');
  assert.equal(result.impacts.representativeReplays.comparison, null);
});

test('cleanup failure after completed retirement impacts cannot retain a successful verdict', async t => {
  const f = subjectRetirementAssignmentFixture(t, { zero: true });
  const create = fs.mkdtempSync; const remove = fs.rmSync;
  const roots = []; let injected = false;
  fs.mkdtempSync = (...args) => {
    const root = create(...args);
    if (String(args[0]).includes('unknown-knowledge-tree-')) roots.push(root);
    return root;
  };
  fs.rmSync = (path, options) => {
    remove(path, options);
    if (!injected && roots.length >= 2 && path === roots[1]) {
      injected = true; throw new Error('one-shot cleanup fault after completed callback');
    }
  };
  syncBuiltinESMExports();
  let result;
  try { result = await runPreparedSubjectRetirementGate(f.input); }
  finally { fs.mkdtempSync = create; fs.rmSync = remove; syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  assert.equal(result.ok, false, 'cleanup failure must revoke the prior successful verdict');
  assert.equal(result.checks.models.status, 'failed');
  assert.ok(result.diagnostics.some(({detail}) => detail?.includes('snapshot cleanup failed')));
});
