import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { runPreparedSubjectSplitGate } from '../payload/engine/lib/subject-split-gate.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  test(`eventless actual split ${objectFormat} binds both changed authorities and completes mandatory impacts`, async t => {
    const f = subjectSplitCoreFixture(t, { objectFormat, nested, zero: true, recordFormat: 'block',
      kinds: ['knowledge', 'ontology', 'decision'] });
    const result = await runPreparedSubjectSplitGate(f.input);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.publicationReady, false);
    assert.equal(result.kind, 'subject-split-gate');
    assert.equal(result.mode, 'read-only-prepared-split');
    assert.deepEqual(result.inputs, { before: f.input.before, candidate: f.input.candidate });
    assert.deepEqual(result.allocation.allocatedIds, ['S-000004', 'S-000005']);
    assert.equal(result.assignments, null);
    assert.equal(result.sources.assignmentEvent, null);
    assert.deepEqual(result.checks.assignments, { status: 'not-applicable' });
    assert.deepEqual(result.authoredReferenceClosure.affectedRefs, []);
    const prefix = nested ? 'unknown-knowledge/' : '';
    assert.deepEqual(result.preservation.proof, {
      inputs: { before: f.input.before, candidate: f.input.candidate },
      operationDigest: canonicalSha256(f.input.operation),
      registryFile: `${prefix}subjects/registry.yaml`, identityFile: `${prefix}_identity.yaml`,
      changedPaths: [`${prefix}_identity.yaml`, `${prefix}subjects/registry.yaml`],
      inventoryDigest: canonicalSha256(result.inventory),
    });
    assert.equal(result.preservation.status, 'passed');
    assert.equal(result.assignmentAssessment.preservationDigest, canonicalSha256(result.preservation.proof));
    assert.deepEqual(result.sources.identityCapture, result.allocation.candidate.capture);
    assert.equal(result.impacts.subjectTree.status, 'complete');
    assert.equal(result.impacts.representativeReplays.status, 'complete');
    assert.equal(result.impacts.representativeReplays.comparison.status, 'incomplete');
    assert.equal(result.impacts.reach.status, 'incomplete', 'unknown classification stays unknown');
    for (const [name, check] of Object.entries(result.checks)) {
      assert.equal(check.status, name === 'assignments' ? 'not-applicable' : 'passed', name);
    }
  });
}

for (const kind of ['ontology', 'decision']) test(`eventless split supports ${kind} with Knowledge absent`, async t => {
  const f = subjectSplitCoreFixture(t, { zero: true, knowledgePresent: false, kinds: [kind], recordFormat: 'block' });
  const result = await runPreparedSubjectSplitGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.assignments, null);
  assert.equal(result.impacts.representativeReplays.status, 'complete');
});

for (const mutation of ['added-file', 'mode-only', 'deleted-file', 'renamed-file', 'added-history']) {
  test(`eventless split refuses unrelated ${mutation}`, async t => {
    const f = subjectSplitCoreFixture(t, { zero: true, recordFormat: 'block', beforeChange({ put }) {
      put('original.txt', 'Retain this original file.\n');
    } });
    if (mutation === 'added-file') f.put('unreviewed.txt', 'Unrelated addition.\n');
    if (mutation === 'mode-only') f.git('update-index', '--chmod=+x', 'original.txt');
    if (mutation === 'deleted-file') f.git('rm', 'original.txt');
    if (mutation === 'renamed-file') f.git('mv', 'original.txt', 'renamed.txt');
    if (mutation === 'added-history') f.put('subjects/_assignments/_baselines.yaml', {
      'schema-version': 1, namespace: f.document.namespace, baselines: [],
    });
    if (mutation !== 'mode-only') f.git('add', '.');
    const tree = f.git('write-tree');
    f.input.candidate = { ...f.input.candidate, tree,
      commit: f.git('commit-tree', tree, '-p', f.input.before.commit, '-m', 'independent unrelated mutation') };
    const result = await runPreparedSubjectSplitGate(f.input);
    assert.equal(result.ok, false);
    assert.equal(result.publicationReady, false);
    assert.equal(result.checks.preservation.status, 'failed', JSON.stringify(result));
    assert.equal(result.diagnostics[0].code, 'split-zero-use-path-changed');
    assert.equal(result.preservation.status, 'failed');
    assert.equal(result.assignmentAssessment, null);
    assert.equal(result.impacts.representativeReplays, null);
  });
}

test('eventless proof reserves exact closure capacity before retaining its proof', async t => {
  const f = subjectSplitCoreFixture(t, { zero: true, recordFormat: 'block' });
  const complete = await runPreparedSubjectSplitGate(f.input);
  assert.equal(complete.ok, true, JSON.stringify(complete));
  f.input.limits.closure = { maxRows: complete.resources.closure.used.rows, maxBytes: complete.resources.closure.used.bytes };
  const exact = await runPreparedSubjectSplitGate(f.input);
  assert.equal(exact.ok, true, JSON.stringify(exact));
  for (const key of ['maxRows', 'maxBytes']) {
    const limits = { ...f.input.limits, closure: { ...f.input.limits.closure, [key]: f.input.limits.closure[key] - 1 } };
    const refused = await runPreparedSubjectSplitGate({ ...f.input, limits });
    assert.equal(refused.ok, false);
    assert.equal(refused.checks.preservation.status, 'failed', JSON.stringify(refused));
    assert.equal(refused.resources.closure.failure.limit, key);
    assert.equal(refused.preservation, null, 'no oversized proof is retained');
    assert.equal(refused.assignmentAssessment, null);
    assert.equal(refused.impacts.representativeReplays, null);
  }
});

test('caller reports cannot substitute for the fixed actual split composition', async t => {
  const f = subjectSplitCoreFixture(t, { zero: true });
  for (const field of ['core', 'assignment', 'preservation', 'allocation', 'context', 'executor']) {
    const result = await runPreparedSubjectSplitGate({ ...f.input, [field]: { ok: true } });
    assert.equal(result.ok, false);
    assert.equal(result.checks.admission.status, 'failed');
    assert.equal(result.inventory, null);
  }
});

test('eventless split revokes success after final impact snapshot cleanup fails', async t => {
  const f = subjectSplitCoreFixture(t, { zero: true, recordFormat: 'block' });
  const create = fs.mkdtempSync; const remove = fs.rmSync;
  const roots = []; let injected = false;
  fs.mkdtempSync = (...args) => {
    const root = create(...args);
    if (/unknown-knowledge-tree-/.test(String(args[0]))) roots.push(root);
    return root;
  };
  fs.rmSync = (path, options) => {
    remove(path, options);
    if (!injected && roots.length >= 6 && path === roots.at(-1)) {
      injected = true;
      throw new Error('one-shot final split impact cleanup failure');
    }
  };
  syncBuiltinESMExports();
  let result;
  try { result = await runPreparedSubjectSplitGate(f.input); }
  finally { fs.mkdtempSync = create; fs.rmSync = remove; syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.equal(result.checks.impacts.status, 'passed', 'the actual impact callback finished');
  assert.equal(result.ok, false);
  assert.equal(result.publicationReady, false);
  assert.equal(result.checks.models.status, 'failed');
  assert.ok(result.diagnostics.some(row => row.detail?.includes('snapshot cleanup failed')));
  for (const root of roots) assert.equal(fs.existsSync(root), false);
});
