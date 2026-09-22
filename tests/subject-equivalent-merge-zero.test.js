import test from 'node:test';
import assert from 'node:assert/strict';
import { equivalentMergeZeroFixture } from './helpers/equivalent-merge-zero-fixture.js';
import { changedTreePaths } from '../payload/engine/lib/commit-snapshot.js';
import { runPreparedEquivalentMergeGate } from '../payload/engine/lib/subject-equivalent-merge-gate.js';
import { equivalentMergeInputWire } from '../payload/engine/lib/subject-equivalent-merge-input.js';
import { isPreparedEquivalentMergeReport } from '../payload/engine/lib/prepared-equivalent-merge.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { load as loadYaml } from 'js-yaml';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { registryWire } from './helpers/equivalent-merge-fixture.js';
import { lifecycleKnowledgeFile } from './helpers/subject-lifecycle-material-fixture.js';
import { subjectUseAssignmentFixture } from './helpers/subject-use-assignment-fixture.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const changeLeaf = (f, file, edit) => {
  const parts = f.read(file).split('---'), record = loadYaml(parts[1]);
  edit(record); f.put(file, lifecycleKnowledgeFile(record, parts.slice(2).join('---').replace(/^\n/, '')));
};

test('actual healthy registry-only merge preserves positive survivor assignments', async t => {
  const f = await equivalentMergeZeroFixture(t);
  assert.deepEqual(changedTreePaths(f.root, f.input.before.tree, f.input.candidate.tree), ['subjects/registry.yaml']);
  assert.ok(f.capture(f.input.before, 'knowledge/K-000001.md').bytes.equals(f.capture(f.input.candidate, 'knowledge/K-000001.md').bytes));
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.version, 3);
  assert.equal(result.assignments, null);
  assert.equal(result.sources.assignmentEvent, null);
  assert.equal(result.checks.assignments.status, 'not-applicable');
  assert.equal(result.preservation.status, 'passed');
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  const query = result.impacts.representativeReplays.comparison.cases.find(row => row.id === `knowledge/current/direct/assigned/${f.sourceId}`);
  assert.equal(query.before.groups.knowledge.strict.some(row => row.ref.id === f.survivorRef.id), false);
  assert.equal(query.after.groups.knowledge.strict.some(row => row.ref.id === f.survivorRef.id), true);
  assert.equal(result.impacts.reach.status, 'incomplete');
  assert.ok(result.authoredReferenceClosure.retainedUnknowns.length > 0);
});

test('material continuation uses the same zero proof for actual SHA256 nested sources', async t => {
  const f = await equivalentMergeZeroFixture(t, { objectFormat: 'sha256', nested: true, material: true });
  const good = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(good.ok, true, JSON.stringify(good.diagnostics));
  assert.equal(good.version, 3);
  assert.equal(good.resources.governance.failure, null);
  assert.deepEqual(good.preservation.proof.changedPaths, ['unknown-knowledge/subjects/registry.yaml']);
  const missing = await runPreparedEquivalentMergeGate({ ...f.input, evidence: { ...f.input.evidence, materialCaptures: [] } });
  assert.equal(missing.ok, false);
  assert.ok(JSON.stringify(missing.diagnostics).includes('merge-participant-evidence'), JSON.stringify(missing.diagnostics));
});

for (const disposition of ['effective','inactive','proposal']) test(`null event cannot conceal ${disposition} direct source assignments`, async t => {
  const f = await equivalentMergeZeroFixture(t, { beforeChange(h) {
    changeLeaf(h, disposition === 'proposal' ? 'knowledge/draft.md' : 'knowledge/K-000001.md', record => {
      record.subjects = [h.sourceId]; if (disposition === 'inactive') record.facets.stage = 'draft';
    });
  } });
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false);
  const expected = disposition === 'effective' ? 'merge-assignment-event-intent' : 'merge-source-use-unsupported';
  assert.ok(JSON.stringify(result.diagnostics).includes(expected), JSON.stringify(result.diagnostics));
  assert.equal(result.preservation, null);
});

test('inbound hierarchy and inherited use remain a native merge refusal', async t => {
  const f = await equivalentMergeZeroFixture(t, { beforeChange(h) {
    const document = structuredClone(loadStores(h.kitRoot).subjectRegistry.document);
    const child = document.subjects.find(row => row.id === 'S-000003'); child.parent = h.sourceId;
    const event = document.history[0]; event.rows.find(row => row.id === child.id).after.parent = h.sourceId;
    const { review, ...body } = event; event.review.changeDigest = canonicalSha256(body);
    h.put('subjects/registry.yaml', registryWire(document));
  } });
  const result = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(result.ok, false);
  assert.ok(JSON.stringify(result.diagnostics).includes('merge-graph-use-unsupported'), JSON.stringify(result.diagnostics));
});

test('closure admits exact rows and bytes; one-short refuses before proof retention', async t => {
  const f = await equivalentMergeZeroFixture(t);
  const good = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(good.ok, true, JSON.stringify(good.diagnostics));
  const limits = { maxRows: good.resources.closure.used.rows, maxBytes: good.resources.closure.used.bytes };
  f.input.limits.closure = limits;
  assert.equal((await runPreparedEquivalentMergeGate(f.input)).ok, true);
  for (const key of ['maxRows','maxBytes']) {
    const bad = await runPreparedEquivalentMergeGate({ ...f.input, limits: { ...f.input.limits, closure: { ...limits, [key]: limits[key] - 1 } } });
    assert.equal(bad.ok, false);
    assert.equal(bad.resources.closure.failure.limit, key);
    assert.equal(bad.diagnostics[0].code, 'merge-closure-budget');
    assert.equal(bad.preservation, null);
    assert.equal(bad.impacts.representativeReplays, null);
  }
});

test('original zero wire and closure proof cannot be resealed into another report branch', async t => {
  const f = await equivalentMergeZeroFixture(t), gate = await runPreparedEquivalentMergeGate(f.input);
  const wire = equivalentMergeInputWire(f.input), expected = { source: f.input.before, candidate: f.input.candidate };
  assert.equal(isPreparedEquivalentMergeReport(gate, expected, wire), true);
  for (const edit of [row => { row.version = 1; }, row => { row.assignments = {}; },
    row => { row.checks.assignments.status = 'passed'; }, row => { row.assignmentAssessment.effectiveDirectRefs = [f.survivorRef]; },
    row => { row.resources.closure.used.rows--; }, row => { row.resources.closure.used.bytes--; },
    row => { row.impacts.representativeReplays.policy.id = 'retirement-replay-v1'; },
    row => { row.preservation.proof.changedPaths = []; row.preservation.proofDigest = canonicalSha256(row.preservation.proof); row.assignmentAssessment.preservationDigest = row.preservation.proofDigest; }]) {
    const changed = structuredClone(gate); edit(changed);
    assert.equal(isPreparedEquivalentMergeReport(changed, expected, wire), false);
  }
  const wrongWire = structuredClone(wire); delete wrongWire.operation.assignmentEvent;
  assert.equal(isPreparedEquivalentMergeReport(gate, expected, wrongWire), false);
});

test('mandatory inventory and native impact capacities cannot be waived for zero assignments', async t => {
  const f = await equivalentMergeZeroFixture(t);
  for (const [group, key] of [['inventory','maxRecordVisits'], ['reach','maxRecords'], ['tree','maxBytes'], ['replays','maxCases']]) {
    const input = { ...f.input, limits: { ...f.input.limits, [group]: { ...f.input.limits[group], [key]: 0 } } };
    const result = await runPreparedEquivalentMergeGate(input);
    assert.equal(result.ok, false, group);
    assert.ok(result.diagnostics.length, group);
    assert.notEqual(result.checks.impacts.status, 'passed');
  }
});

test('snapshot cleanup failure clears a completed zero gate acknowledgement', async t => {
  const f = await equivalentMergeZeroFixture(t), original = fs.rmSync, create = fs.mkdtempSync;
  const roots = [];
  let injected = false;
  fs.mkdtempSync = (...args) => {
    const root = create(...args); if (String(args[0]).includes('unknown-knowledge-tree-')) roots.push(root);
    return root;
  };
  fs.rmSync = (path, options) => {
    original(path, options);
    if (!injected && roots.length >= 2 && path === roots[1]) {
      injected = true; const error = new Error('zero merge cleanup test'); error.code = 'EACCES'; error.errno = -13; throw error;
    }
  };
  syncBuiltinESMExports();
  let result;
  try { result = await runPreparedEquivalentMergeGate(f.input); }
  finally { fs.rmSync = original; fs.mkdtempSync = create; syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.equal(result.ok, false);
  assert.equal(result.checks.impacts.status, 'passed');
  assert.match(JSON.stringify(result.diagnostics), /cleanup/);
});

test('existing positive merge retains v1 P8 and refuses zero-only closure limits', async t => {
  const f = subjectUseAssignmentFixture(t);
  const good = await runPreparedEquivalentMergeGate(f.input);
  assert.equal(good.ok, true, JSON.stringify(good.diagnostics));
  assert.equal(good.version, 1);
  assert.equal(good.assignments.ok, true);
  assert.equal(Object.hasOwn(good, 'preservation'), false);
  const bad = await runPreparedEquivalentMergeGate({ ...f.input, limits: { ...f.input.limits, closure: { maxRows: 1, maxBytes: 1000 } } });
  assert.equal(bad.ok, false);
  assert.equal(bad.diagnostics[0].code, 'invalid-equivalent-merge-input');
});

test('zero does not waive actual unknown owner disposition or original tree/event binding', async t => {
  const f = await equivalentMergeZeroFixture(t);
  assert.ok(f.input.operation.retainedUnknowns.length > 0);
  const dropped = await runPreparedEquivalentMergeGate({ ...f.input,
    operation: { ...f.input.operation, retainedUnknowns: [] } });
  assert.equal(dropped.ok, false);
  assert.ok(JSON.stringify(dropped.diagnostics).includes('merge-retained-unknown-scope'));
  const wrongTree = await runPreparedEquivalentMergeGate({ ...f.input,
    candidate: { ...f.input.candidate, tree: f.input.before.tree } });
  assert.equal(wrongTree.ok, false);
  assert.equal(wrongTree.diagnostics[0].code, 'merge-tree-mismatch');
  const missing = { ...f.input.operation }; delete missing.assignmentEvent;
  assert.equal((await runPreparedEquivalentMergeGate({ ...f.input, operation: missing })).ok, false);
  const noOp = await runPreparedEquivalentMergeGate({ ...f.input, candidate: f.input.before });
  assert.equal(noOp.ok, false);
  assert.equal(noOp.preservation, null);
});
