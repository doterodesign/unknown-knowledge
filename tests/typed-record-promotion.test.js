import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { typedPromotionFixture } from './helpers/typed-record-promotion-fixture.js';
import { planCapturedRecordPromotion } from '../payload/engine/lib/record-promotion.js';
import { prepareCandidate } from '../payload/engine/lib/prepare-candidate.js';
import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { locateKitRoot } from '../payload/engine/lib/kit-root.js';
import { validateIdentityTransition } from '../payload/engine/lib/identity-ledger.js';
import { runChecks } from '../payload/engine/commands/validate.js';
import { dump } from 'js-yaml';

for (const kind of ['ontology', 'knowledge']) for (const format of ['sha1', 'sha256']) {
  test(`actual ${format} ${kind} proposal promotion preserves bytes and prepares a healthy nested candidate`, async (t) => {
    const f = typedPromotionFixture(t, { kind, format, kitPath: format === 'sha256' ? 'unknown-knowledge' : '.' });
    const input = f.input(); const index = readFileSync(join(f.root, '.git/index'));
    writeFileSync(join(f.kitRoot, f.filenames[0]), 'dirty user edits');
    const planned = await planCapturedRecordPromotion(input);
    assert.equal(planned.ok, true, JSON.stringify(planned)); assert.equal(planned.publicationReady, false);
    assert.deepEqual(planned.createdRefs.map(({ id }) => id), f.ids);
    assert.equal(validateIdentityTransition(f.identity, planned.identity).ok, true);
    assert.deepEqual(planned.identity.allocations.slice(2), f.identity.allocations);
    const changed = new Set(['_identity.yaml', `${kind}/_catalog.yaml`, ...f.filenames].map(f.repoFile));
    assert.deepEqual(new Set(planned.changes.map(({ file }) => file)), changed);
    for (const file of new Set(f.filenames)) {
      const expected = f.files[file].replaceAll(f.proposals[0], f.ids[0]).replaceAll(f.proposals[1], f.ids[1])
        .replaceAll(kind === 'ontology' ? '"status": "draft"' : '"stage": "draft"', kind === 'ontology' ? '"status": "active"' : '"stage": "verified"')
        .replaceAll(kind === 'ontology' ? '"status": "proposed"' : '"stage": "proposed"', kind === 'ontology' ? '"status": "active"' : '"stage": "verified"');
      const row = planned.changes.find((row) => row.file === f.repoFile(file));
      assert.equal(row.after.bytes.toString(), expected); assert.equal(row.after.mode, row.before.mode);
    }
    assert.equal(planned.changes.find((row) => row.file === f.repoFile(f.filenames[0])).after.mode, '100755');
    const person = { name: 'Steward', email: 'steward@example.test', seconds: 1700000000, offset: '+0000' };
    // Existing byte executor selector only; no assignment or promotion gate is asserted.
    const prepared = await prepareCandidate({ operation: 'subject-assignment', repoRoot: f.root,
      source: { ref: 'refs/heads/source', expectedCommit: f.commit, kitPath: f.kitPath }, changes: planned.changes,
      commit: { author: person, committer: person, message: 'Byte-plan fixture only\n' },
      limits: { maxChanges: 10, maxFileBytes: 100000, maxTotalChangeBytes: 500000,
        maxTreeEntries: 100, maxTreeBytes: 1000000, maxGitOutputBytes: 1000000, maxCommitMessageBytes: 1000 } });
    await withTreeSnapshot(f.root, prepared.candidate.tree, ({ root }) => {
      const model = loadStores(locateKitRoot(root));
      assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
      assert.deepEqual([...model.proposals[kind]], []);
      const store = kind === 'ontology' ? model.concepts : model.leaves;
      assert.equal(Object.hasOwn(store.get(f.ids[0]).record, 'subjects'), false);
      assert.deepEqual(store.get(f.ids[1]).record.subjects, []);
      assert.deepEqual(runChecks(model, root).filter(({ severity }) => severity === 'error'), []);
    });
    assert.equal(f.git('rev-parse', 'HEAD').toString().trim(), f.commit);
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
    assert.equal(readFileSync(join(f.kitRoot, f.filenames[0]), 'utf8'), 'dirty user edits');
  });
}

test('typed promotion rejects mixed kinds, hidden array slots and caller extensions without invoking getters', async (t) => {
  const f = typedPromotionFixture(t);
  for (const mutate of [
    (input) => { input.kind = 'decision'; },
    (input) => { input.kind = { toString() { throw new Error('coercion'); } }; },
    (input) => { input.version = 2; },
    (input) => { input.selected[0].canonicalRef.kind = 'knowledge'; },
    (input) => { input.selected[0].targetLifecycle = 'verified'; },
    (input) => { input.selected[0].proposalRef.key = 'O-000001'; },
    (input) => Object.defineProperty(input, 'kind', { enumerable: true, get() { throw new Error('getter'); } }),
    (input) => Object.defineProperty(input.selected, '0', { enumerable: false, value: input.selected[0] }),
    (input) => Object.defineProperty(input.selected, '0', { enumerable: true, get() { throw new Error('getter'); } }),
    (input) => { input.skipValidation = true; },
  ]) {
    const input = f.input(); mutate(input);
    const result = await planCapturedRecordPromotion(input);
    assert.equal(result.code, 'invalid-promotion-input'); assert.equal(Object.hasOwn(result, 'changes'), false);
  }
});

for (const kind of ['ontology', 'knowledge']) test(`${kind} rejects unusable source lifecycles and preserves scope boundaries`, async (t) => {
  for (const status of [null, 'invented', kind === 'ontology' ? 'active' : 'verified', kind === 'ontology' ? 'deprecated' : 'suppressed']) {
    const f = typedPromotionFixture(t, { kind, edit: ({ records }) => {
      const row = records[kind === 'ontology' ? 1 : 0];
      const target = kind === 'ontology' ? row : row.facets; const key = kind === 'ontology' ? 'status' : 'stage';
      if (status === null) delete target[key]; else target[key] = status;
    } });
    const result = await planCapturedRecordPromotion(f.input());
    assert.equal(result.ok, false, status); assert.equal(Object.hasOwn(result, 'changes'), false);
  }
  for (const outside of ['escaped', 'body', 'unselected']) {
    const f = typedPromotionFixture(t, { kind, edit: ({ records, extras, proposals, authorizer }) => {
      if (outside === 'escaped') extras['retained.json'] = JSON.stringify({ target: proposals[0] }).replace('proposal', '\\u0070roposal');
      if (outside === 'body') extras['retained.txt'] = `Evidence ${proposals[0]}\n`;
      if (outside === 'unselected') authorizer['relates-to'] = { [kind === 'ontology' ? 'concepts' : 'leaves']: [proposals[0]] };
    } });
    assert.equal((await planCapturedRecordPromotion(f.input())).code, 'promotion-reference-outside-scope');
  }
});

test('Knowledge plain and single-quoted frontmatter edits retain exact body and evidence bytes', async (t) => {
  const f = typedPromotionFixture(t, { kind: 'knowledge', edit: ({ records, extras }) => {
    extras['knowledge/research/first.md'] = '\uFEFF---\r\n# preserve comment\r\n'
      + dump(records[0], { quotingType: "'" }).replace('stage: draft', "stage: 'draft'").replaceAll('\n', '\r\n')
      + '---\r\n\r\nUnchanged body: "draft", café, π.\r\n';
  } });
  const result = await planCapturedRecordPromotion(f.input());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.changes.find((row) => row.file === f.filenames[0]).after.bytes.toString(),
    f.files[f.filenames[0]].replace(f.proposals[0], f.ids[0]).replace("stage: 'draft'", "stage: 'verified'"));
});

test('typed capture, allocation, namespace, capacities and input detachment remain actual-source checks', async (t) => {
  const f = typedPromotionFixture(t, { kind: 'knowledge' });
  for (const [mutate, code] of [
    [(input) => { input.selected[0].beforeCapture.sha256 = '0'.repeat(64); }, 'promotion-capture-mismatch'],
    [(input) => { input.selected[0].canonicalRef.id = 'K-000001'; }, 'promotion-allocation-mismatch'],
    [(input) => { input.selected[0].canonicalRef.namespace = input.publication.id; }, 'promotion-namespace-mismatch'],
    [(input) => { input.source.tree = '0'.repeat(40); }, 'promotion-source-mismatch'],
  ]) {
    const input = f.input(); mutate(input); const result = await planCapturedRecordPromotion(input);
    assert.equal(result.code, code); assert.equal(Object.hasOwn(result, 'changes'), false);
  }
  for (const limit of ['maxFiles', 'maxFileBytes', 'maxSourceBytes', 'maxPromotions']) {
    const input = f.input(); input.limits[limit] = 1;
    const result = await planCapturedRecordPromotion(input);
    assert.equal(result.ok, false, limit); assert.equal(Object.hasOwn(result, 'changes'), false);
  }
  const input = f.input(); const pending = planCapturedRecordPromotion(input);
  input.selected[0].canonicalRef.id = 'K-999999'; input.kind = 'ontology'; input.publication.review = 'substituted';
  const result = await pending;
  assert.equal(result.ok, true, JSON.stringify(result)); assert.deepEqual(result.createdRefs.map(({ id }) => id), f.ids);
  assert.equal(result.identity.allocations[0].publication.review, 'review:promotion');
});

test('a consumed Knowledge proposal in its Markdown body or escaped lifecycle scalar refuses', async (t) => {
  for (const escape of [false, true]) {
    const f = typedPromotionFixture(t, { kind: 'knowledge', editFiles: (files) => {
      const file = 'knowledge/research/first.md';
      if (escape) files[file] = files[file].replace('"stage": "draft"', '"stage": "dra\\u0066t"');
      else files[file] += 'proposal:knowledge:33333333-3333-4333-8333-333333333333\r\n';
    } });
    const result = await planCapturedRecordPromotion(f.input());
    assert.equal(result.code, escape ? 'promotion-scalar-unsupported' : 'promotion-reference-outside-scope');
  }
});
