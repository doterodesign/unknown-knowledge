import { test } from 'node:test';
import { fixture, namespace, file, p1, p2, nextPublication } from './helpers/record-promotion-fixture.js';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { planCapturedDecisionPromotion } from '../payload/engine/lib/record-promotion.js';
import { captureCommittedFile, describeCandidateBytes } from '../payload/engine/lib/captured-source.js';
import { prepareCandidate } from '../payload/engine/lib/prepare-candidate.js';
import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { validateIdentityTransition } from '../payload/engine/lib/identity-ledger.js';
import { runChecks } from '../payload/engine/commands/validate.js';
import { validateValues } from '../payload/engine/commands/validate-values.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { assignmentCandidateDigest, assignmentEventDigest, validateAssignmentEventMetadata } from '../payload/engine/lib/assignment-event.js';

for (const format of ['sha1', 'sha256']) test(`actual ${format} promotion preserves source and prepares exact canonical candidate`, async (t) => {
  const f = fixture(t, { format });
  writeFileSync(join(f.root, file), 'dirty user content');
  const index = readFileSync(join(f.root, '.git/index'));
  const planned = await planCapturedDecisionPromotion(f.input());
  assert.equal(planned.ok, true, JSON.stringify(planned));
  assert.equal(planned.publicationReady, false);
  assert.deepEqual(planned.createdRefs.map(({ id }) => id), ['D-000002', 'D-000003']);
  assert.deepEqual(planned.changes.map(({ file }) => file), ['_identity.yaml', 'decisions/_catalog.yaml', file]);
  const expected = f.files[file].replaceAll(p1, 'D-000002').replaceAll(p2, 'D-000003')
    .replaceAll('"status": "proposed"', '"status": "accepted"');
  assert.equal(planned.changes.find((row) => row.file === file).after.bytes.toString(), expected);
  assert.equal(planned.changes.find((row) => row.file === 'decisions/_catalog.yaml').after.bytes.toString(),
    f.files['decisions/_catalog.yaml'].replaceAll(p1, 'D-000002').replaceAll(p2, 'D-000003'));
  const ledgerBytes = planned.changes[0].after.bytes;
  assert.ok(ledgerBytes.toString().startsWith('# ledger comment\r\n'));
  assert.equal(validateIdentityTransition(f.identity, load(ledgerBytes.toString())).ok, true);
  const person = { name: 'Steward', email: 'steward@example.test', seconds: 1700000000, offset: '+0000' };
  // Byte executor only: subject-assignment is an existing mechanical selector,
  // not a claim that its current gate accepts ordinary promotion.
  const prepared = await prepareCandidate({ operation: 'subject-assignment', repoRoot: f.root,
    source: { ref: 'refs/heads/source', expectedCommit: f.commit, kitPath: '.' }, changes: planned.changes,
    commit: { author: person, committer: person, message: 'Candidate for review\n' },
    limits: { maxChanges: 10, maxFileBytes: 100000, maxTotalChangeBytes: 300000,
      maxTreeEntries: 100, maxTreeBytes: 1000000, maxGitOutputBytes: 1000000, maxCommitMessageBytes: 1000 } });
  await withTreeSnapshot(f.root, prepared.candidate.tree, ({ root }) => {
    const model = loadStores(root);
    assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
    assert.deepEqual([...model.proposals.decision.keys()], []);
    assert.deepEqual(model.decisions.get('D-000003').record['relates-to'].decisions, ['D-000002']);
    assert.deepEqual(model.decisions.get('D-000003').record.subjects, []);
    assert.equal(Object.hasOwn(model.decisions.get('D-000002').record, 'subjects'), false);
    assert.deepEqual(runChecks(model, root).filter(({ severity }) => severity === 'error'), []);
    const values = validateValues(model, null, root);
    assert.deepEqual(values.hardErrors, []);
    assert.deepEqual(values.findings, []);
    assert.equal(model.subjectRegistry, undefined);
  });
  assert.equal(f.git('rev-parse', 'HEAD').toString().trim(), f.commit);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  assert.equal(readFileSync(join(f.root, file), 'utf8'), 'dirty user content');
});

test('outside incoming references refuse with actual source locator and no changes', async (t) => {
  const f = fixture(t, { edit: ({ records }) => { records.entries[0]['relates-to'] = { decisions: [p1] }; } });
  const result = await planCapturedDecisionPromotion(f.input());
  assert.equal(result.code, 'promotion-reference-outside-scope');
  assert.deepEqual(result.diagnostics[0], { file, path: ['entries', 0, 'relates-to', 'decisions', 0] });
  assert.equal(Object.hasOwn(result, 'changes'), false);
});

test('untyped and escaped auxiliary proposal references cannot evade closure', async (t) => {
  const f = fixture(t, { edit: ({ extras }) => { extras['saved.json'] = JSON.stringify({ target: p1 }).replace('proposal', '\\u0070roposal'); } });
  const result = await planCapturedDecisionPromotion(f.input());
  assert.equal(result.code, 'promotion-reference-outside-scope');
  assert.deepEqual(result.diagnostics[0], { file: 'saved.json', path: ['target'] });
});

test('actual captures, deterministic requested IDs, namespaces and source tree are mandatory', async (t) => {
  const f = fixture(t);
  for (const [mutate, code] of [
    [(p) => { p.selected[0].beforeCapture.sha256 = '0'.repeat(64); }, 'promotion-capture-mismatch'],
    [(p) => { p.selected[0].canonicalRef.id = 'D-000004'; }, 'promotion-allocation-mismatch'],
    [(p) => { p.selected[0].proposalRef.namespace = nextPublication.id; }, 'promotion-namespace-mismatch'],
    [(p) => { p.source.tree = '0'.repeat(p.source.tree.length); }, 'promotion-source-mismatch'],
    [(p) => { p.selected.push(structuredClone(p.selected[0])); }, 'invalid-promotion-input'],
    [(p) => { p.selected[0].targetLifecycle = 'archived'; }, 'invalid-promotion-input'],
    [(p) => { p.selected[0].proposalRef.key = 'proposal:decision:66666666-6666-4666-8666-666666666666'; }, 'promotion-proposal-unavailable'],
  ]) {
    const input = f.input(); mutate(input);
    const result = await planCapturedDecisionPromotion(input);
    assert.equal(result.code, code);
    assert.equal(Object.hasOwn(result, 'changes'), false);
  }
});

test('terminal proposals and malformed unselected siblings cannot be promoted', async (t) => {
  for (const [edit, code] of [
    [({ records }) => { records.entries[1].status = 'rejected'; }, 'promotion-lifecycle-refused'],
    [({ records }) => { records.entries[0].unexpected = true; }, 'promotion-unhealthy-source'],
  ]) {
    const f = fixture(t, { edit }); const result = await planCapturedDecisionPromotion(f.input());
    assert.equal(result.code, code); assert.equal(Object.hasOwn(result, 'changes'), false);
  }
});

test('input is detached before asynchronous capture and returned bytes do not mutate the source', async (t) => {
  const f = fixture(t); const input = f.input();
  const pending = planCapturedDecisionPromotion(input);
  input.selected[0].canonicalRef.id = 'D-999999'; input.publication.review = 'mutated';
  const result = await pending;
  assert.equal(result.ok, true, JSON.stringify(result));
  result.changes[0].after.bytes.fill(0);
  assert.equal(captureCommittedFile({ repoRoot: f.root, commit: f.commit, file: '_identity.yaml' }).bytes.toString(), f.files['_identity.yaml']);
});

test('explicit capture limits refuse rather than returning partial edits', async (t) => {
  const f = fixture(t);
  for (const limit of ['maxFiles', 'maxFileBytes', 'maxSourceBytes', 'maxPromotions']) {
    const input = f.input(); input.limits[limit] = 1;
    const result = await planCapturedDecisionPromotion(input);
    assert.equal(result.ok, false, limit); assert.equal(Object.hasOwn(result, 'changes'), false);
  }
});

test('block ledger extension preserves every old byte, including comments and publication provenance', async (t) => {
  const f = fixture(t, { ledgerText: (identity) => `schema-version: 1\r\nidentity-format: 1\r\nnamespace: ${namespace}\r\nallocations:\r\n  - ${JSON.stringify(identity.allocations[0])} # retained row\r\n# end\r\n` });
  const result = await planCapturedDecisionPromotion(f.input());
  assert.equal(result.ok, true, JSON.stringify(result));
  const changed = result.changes[0].after.bytes.toString();
  const first = changed.indexOf('  - '); const old = changed.indexOf('  - ', changed.indexOf('  - ', first + 1) + 1);
  assert.equal(changed.slice(0, first) + changed.slice(old), f.files['_identity.yaml']);
  assert.deepEqual(load(changed).allocations.at(-1), f.identity.allocations[0]);
});

test('admission refuses accessor, symbolic, hidden and sparse input without invoking accessors', async (t) => {
  const f = fixture(t);
  for (const mutate of [
    (input) => Object.defineProperty(input.source, 'commit', { enumerable: true, get() { throw new Error('getter invoked'); } }),
    (input) => Object.defineProperty(input.selected, '0', { enumerable: true, get() { throw new Error('getter invoked'); } }),
    (input) => Object.defineProperty(input.selected, '0', { enumerable: false, value: input.selected[0] }),
    (input) => { input.selected[Symbol('hidden')] = true; },
    (input) => Object.defineProperty(input.selected[0].beforeCapture, 'hidden', { value: true }),
    (input) => { delete input.selected[0]; },
    (input) => { input.source.commit += '\n'; },
  ]) {
    const input = f.input(); mutate(input);
    assert.equal((await planCapturedDecisionPromotion(input)).code, 'invalid-promotion-input');
  }
});

test('actual history-absent source becomes exact Decision genesis without introducing Subject authority', async (t) => {
  const f = fixture(t); const input = f.input();
  await withTreeSnapshot(f.root, input.source.tree, ({ root }) => {
    const before = loadStores(root);
    assert.equal(before.ok, true);
    assert.equal(before.assignmentHistory, undefined);
    assert.equal(before.subjectRegistry, undefined);
  });
  const planned = await planCapturedDecisionPromotion(input);
  assert.equal(planned.ok, true, JSON.stringify(planned));
  const changedRecordFile = planned.changes.find((row) => row.file === file);
  const afterCapture = describeCandidateBytes({ file, bytes: changedRecordFile.after.bytes, objectFormat: 'sha1' });
  const event = {
    'schema-version': 2, event: '77777777-7777-4777-8777-777777777777', namespace,
    operation: 'canonical-creation', scope: { kind: 'typed-records', refs: planned.createdRefs },
    'before-input': { commit: input.source.commit, tree: input.source.tree, 'kit-path': '.' },
    'candidate-records-digest': '', decision: { namespace, kind: 'decision', id: 'D-000001' },
    review: { reference: input.publication.review, 'accepted-status': 'accepted',
      'decision-capture': changedRecordFile.before.capture, 'decision-digest': canonicalSha256(f.records.entries[0]),
      'change-digest': '' },
    rows: planned.createdRefs.map((ref) => ({ ref, before: null,
      after: ref.id === 'D-000002' ? { state: 'unknown', reason: 'absent' } : { state: 'known', ids: [] },
      'before-revision': null, 'after-revision': 0, disposition: 'created', reason: 'Reviewed creation fixture.',
      'before-capture': null, 'after-capture': afterCapture })),
  };
  event['candidate-records-digest'] = assignmentCandidateDigest(event.rows);
  event.review['change-digest'] = assignmentEventDigest(event);
  assert.equal(validateAssignmentEventMetadata(event).ok, true);
  const baseline = { 'schema-version': 1, namespace, baselines: event.rows.map((row) => ({
    ref: row.ref, state: row.after, capture: row['after-capture'], origin: { kind: 'creation', event: event.event },
  })) };
  const eventFile = `subjects/_assignments/${event.event}.yaml`;
  const baselineFile = 'subjects/_assignments/_baselines.yaml';
  const person = { name: 'Steward', email: 'steward@example.test', seconds: 1700000000, offset: '+0000' };
  async function prepare(historyBaseline) {
    return prepareCandidate({ operation: 'subject-assignment', repoRoot: f.root,
      source: { ref: 'refs/heads/source', expectedCommit: f.commit, kitPath: '.' },
      changes: [...planned.changes, ...[[eventFile, event], [baselineFile, historyBaseline]].map(([file, document]) => ({
        file, before: null, after: { mode: '100644', bytes: Buffer.from(JSON.stringify(document) + '\n') },
      }))], commit: { author: person, committer: person, message: 'Actual genesis candidate fixture\n' },
      limits: { maxChanges: 10, maxFileBytes: 100000, maxTotalChangeBytes: 500000,
        maxTreeEntries: 100, maxTreeBytes: 1000000, maxGitOutputBytes: 1000000, maxCommitMessageBytes: 1000 } });
  }
  const candidate = await prepare(baseline);
  const actualRecord = captureCommittedFile({ repoRoot: f.root, commit: candidate.candidate.commit, file });
  assert.equal(actualRecord.locator.blob, afterCapture.blob);
  assert.equal(actualRecord.locator.sha256, afterCapture.sha256);
  assert.notEqual(actualRecord.locator.blob, event.review['decision-capture'].blob);
  await withTreeSnapshot(f.root, candidate.candidate.tree, ({ root }) => {
    const model = loadStores(root);
    assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
    assert.equal(model.subjectRegistry, undefined);
    assert.deepEqual(model.decisions.get('D-000001').record, f.records.entries[0]);
    assert.deepEqual(model.assignmentHistory.revisions, [
      { ref: planned.createdRefs[0], revision: 0, state: { state: 'unknown' } },
      { ref: planned.createdRefs[1], revision: 0, state: { state: 'known', ids: [] } },
    ]);
    assert.equal(model.assignmentHistoryCurrent.status, 'passed');
    assert.equal(model.assignmentHistory.captureVerification, 'not-performed');
    assert.equal(model.assignmentHistory.approvalCheck, 'not-performed');
    assert.equal(model.assignmentHistory.publicationReady, false);
    assert.deepEqual(runChecks(model, root).filter(({ severity }) => severity === 'error'), []);
    assert.deepEqual(validateValues(model, null, root).hardErrors, []);
  });
  for (const mutate of [
    (value) => { value.baselines[0].origin = null; },
    (value) => { value.baselines[0].state = { state: 'known', ids: [] }; },
  ]) {
    const invalid = structuredClone(baseline); mutate(invalid);
    const malformed = await prepare(invalid);
    await withTreeSnapshot(f.root, malformed.candidate.tree, ({ root }) => {
      const model = loadStores(root);
      assert.equal(model.ok, false, 'malformed history must not become absent capability');
      assert.equal(model.subjectRegistry, undefined);
      assert.ok(model.diagnostics.some(({ severity }) => severity === 'error'));
    });
  }
  assert.equal(f.git('rev-parse', 'HEAD').toString().trim(), f.commit);
});
