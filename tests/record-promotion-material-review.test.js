/** Independent actual typed genesis, retained material and publication boundaries. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { recordPromotionMaterialFixture, reviewRecordPromotionMaterialFixture,
  promotionMaterialEvidenceVariant, reviewLimits } from './helpers/record-promotion-material-fixture.js';
import { runPreparedRecordPromotionGate } from '../payload/engine/lib/assignment-gate.js';
import { recordPromotionInputWire } from '../payload/engine/lib/record-promotion-input.js';
import { isPreparedRecordPromotionReport } from '../payload/engine/lib/prepared-record-promotion.js';
import { runFinalPreparedRecordPromotionGate } from '../payload/engine/lib/final-prepared-promotion.js';
import { recordApprovedCandidateReview, readRetainedCandidateReview } from '../payload/engine/lib/candidate-review.js';
import { publishPreparedCandidate } from '../payload/engine/lib/publish-prepared-candidate.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { canonicalSha256, canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { EngineRefusal } from '../payload/engine/lib/engine-refusal.js';

const git = (f, ...args) => f.git(...args).toString().trim();
const kinds = ['knowledge', 'ontology', 'decision'];

function readReview(input) {
  return readRetainedCandidateReview({ evidenceDirectory: input.evidenceDirectory,
    validationBundleDigest: input.validationBundleDigest, reviewBundleDigest: input.reviewBundleDigest,
    expectedRequestDigest: input.expectedRequestDigest, limits: reviewLimits });
}

function replaceRecord(f, file, before, after) {
  if (f.kind === 'knowledge') {
    assert.deepEqual({ ...before, subjects: after.subjects }, after);
    const bytes = f.read(file), original = `subjects: ${JSON.stringify(before.subjects)}\n`;
    assert.equal(bytes.split(original).length, 2, 'Exactly one authored frontmatter field is replaced');
    f.put(file, bytes.replace(original, `subjects: ${JSON.stringify(after.subjects)}\n`));
    return;
  }
  const bytes = f.read(file), original = JSON.stringify(before);
  assert.equal(bytes.split(original).length, 2, 'Exactly one authored record is replaced');
  f.put(file, bytes.replace(original, JSON.stringify(after)));
}

/** Independently author matching proposal/canonical subjects; never use planner output as truth. */
function addSubjectsWithoutRegistry(f) {
  const originalBefore = f.input.before, originalCandidate = f.input.candidate;
  const selected = 2, ids = ['S-000099'];
  git(f, 'read-tree', '--reset', '-u', originalBefore.commit);
  replaceRecord(f, f.sources[selected].file, f.sources[selected].record,
    { ...f.sources[selected].record, subjects: ids });
  git(f, 'add', '.');
  const tree = git(f, 'write-tree');
  const before = { ...originalBefore, tree,
    commit: git(f, 'commit-tree', tree, '-p', originalBefore.commit, '-m', 'Literal proposal subjects without registry') };
  const capture = file => captureCommittedFile({ repoRoot: f.root, commit: before.commit, file: f.path(file) });
  f.input.before = before;
  f.input.promotion.rows.forEach((row, index) => { row.beforeCapture = capture(f.sources[index].file).locator; });
  const authorizer = capture(f.authorizerFile);
  f.input.evidence.decisionCaptures = [{ objectFormat: f.objectFormat, capture: authorizer.locator, bytes: authorizer.bytes }];
  git(f, 'read-tree', '--reset', '-u', originalCandidate.commit);
  replaceRecord(f, f.sources[selected].file, f.candidateRecords[selected],
    { ...f.candidateRecords[selected], subjects: ids });
  f.event['before-input'] = { commit: before.commit, tree: before.tree, 'kit-path': before.kitPath };
  f.event.review['decision-capture'] = authorizer.locator;
  f.event.rows[selected].after = { state: 'known', ids };
  f.save();
  f.input.candidate = { ...f.input.candidate,
    commit: git(f, 'commit-tree', f.input.candidate.tree, '-p', before.commit, '-m', 'Matching canonical subjects without registry') };
}

for (const kind of kinds) test(`continued ${kind} keeps native absent-registry unknown/empty limits`, async t => {
  const f = await recordPromotionMaterialFixture(t, { kind, subjectAuthority: false,
    ...(kind === 'decision' ? { companionStores: [] } : {}) });
  assert.equal(f.reconsideration, null);
  assert.deepEqual(f.input.evidence.materialCaptures, []);
  const beforeIndex = readFileSync(join(f.root, '.git/index'));
  const beforeStatus = git(f, 'status', '--porcelain');
  const control = await runPreparedRecordPromotionGate(f.input);
  assert.equal(control.ok, true, JSON.stringify(control));
  assert.equal(control.version, 3);
  assert.equal(control.capabilities.before.subjectRegistry, false);
  assert.equal(control.capabilities.candidate.subjectRegistry, false);
  assert.deepEqual(control.impacts.applicability, { kind: 'subject-registry-absent-both' });
  assert.deepEqual(control.impacts.required, []);
  assert.deepEqual(f.event.rows.map(row => row.before), [null, null, null]);
  assert.deepEqual(f.event.rows.map(row => row.after), [
    { state: 'unknown', reason: 'absent' }, { state: 'known', ids: [] }, { state: 'known', ids: [] },
  ]);
  const omitted = { ...f.input, evidence: { ...f.input.evidence } };
  delete omitted.evidence.materialCaptures;
  const legacy = await runPreparedRecordPromotionGate(omitted);
  assert.equal(legacy.ok, true, JSON.stringify(legacy));
  assert.equal(legacy.version, 2);
  assert.deepEqual(legacy.promotion.createdRefs, control.promotion.createdRefs);
  assert.notEqual(legacy.inputDigest, control.inputDigest);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), beforeIndex);
  assert.equal(git(f, 'status', '--porcelain'), beforeStatus);

  await t.test('supplied material cannot manufacture absent Subject authority', async () => {
    const capture = captureCommittedFile({ repoRoot: f.root, commit: f.input.before.commit, file: f.path(f.authorizerFile) });
    const result = await runPreparedRecordPromotionGate({ ...f.input, evidence: { ...f.input.evidence,
      materialCaptures: [{ objectFormat: f.objectFormat, capture: capture.locator, bytes: capture.bytes }] } });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some(row => row.code === 'promotion-governance-unavailable'
      && row.details?.diagnostics?.some(item => item.code === 'promotion-material-authority-absent')), JSON.stringify(result));
  });

  await t.test('matching nonempty source and candidate subjects still refuse', async () => {
    addSubjectsWithoutRegistry(f);
    const result = await runPreparedRecordPromotionGate(f.input);
    assert.equal(result.ok, false);
    assert.equal(result.checks.models.status, 'failed');
    assert.ok(result.diagnostics.some(row => row.code === 'assignment-model-unavailable'
      && row.details?.side === 'before'
      && row.details.diagnostics.some(item => item.code === 'subjects-unavailable'
        && item.file === f.sources[2].file && item.path.endsWith('subjects[0]'))), JSON.stringify(result));
  });
});

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  for (const kind of kinds) test(`continued ${kind} ${objectFormat} publication retains actual material authority`, async t => {
    const f = await reviewRecordPromotionMaterialFixture(t, { kind, objectFormat, nested });
    assert.equal(f.reconsideration.ok, true);
    assert.equal(f.final.status, 'passed');
    assert.equal(f.final.gate.version, 3);
    assert.equal(f.final.gate.recordKind, kind);
    assert.equal(f.final.policy.id, 'typed-record-promotion-publication-v3');
    assert.equal(f.final.policy.version, 3);
    assert.equal(f.source.kitPath, nested ? 'unknown-knowledge' : '.');
    assert.equal(git(f, 'rev-parse', '--show-object-format'), objectFormat);
    assert.ok(Object.hasOwn(f.operationInputs.gateInput.evidence, 'materialCaptures'));
    assert.deepEqual(f.operationInputs.gateInput, recordPromotionInputWire(f.input));
    assert.equal(f.final.gate.inputDigest, canonicalSha256(f.operationInputs.gateInput));
    const expectedIds = kind === 'decision' ? ['D-000004', 'D-000005', 'D-000006']
      : kind === 'knowledge' ? ['K-000003', 'K-000004', 'K-000005'] : ['O-000003', 'O-000004', 'O-000005'];
    assert.deepEqual(f.final.gate.promotion.createdRefs.map(ref => ref.id), expectedIds);
    assert.deepEqual(f.event.rows.map(row => row.before), [null, null, null]);
    assert.deepEqual(f.event.rows.map(row => row['before-capture']), [null, null, null]);
    assert.deepEqual(f.event.rows.map(row => row['before-revision']), [null, null, null]);
    assert.deepEqual(f.event.rows.map(row => row.after), [
      { state: 'unknown', reason: 'absent' }, { state: 'known', ids: [] }, { state: 'known', ids: ['S-000001'] },
    ]);
    if (kind === 'decision') {
      assert.deepEqual(f.final.gate.preflight, { status: 'not-applicable', recordKind: kind,
        selectedIds: expectedIds, today: null, result: null });
    } else {
      assert.equal(f.final.gate.preflight.status, 'passed');
      assert.equal(f.final.gate.preflight.recordKind, kind);
    }

    const expectedReport = { ...f.validationInput.expected, operationInputs: f.operationInputs };
    assert.equal(isPreparedRecordPromotionReport(f.final.gate, expectedReport), true);
    const oldVersion = { ...f.final.gate, version: 2 };
    assert.equal(isPreparedRecordPromotionReport(oldVersion, expectedReport), false);
    const noMaterial = structuredClone(f.operationInputs);
    delete noMaterial.gateInput.evidence.materialCaptures;
    const resealedSelector = { ...f.final.gate, inputDigest: canonicalSha256(noMaterial.gateInput) };
    assert.equal(isPreparedRecordPromotionReport(resealedSelector,
      { ...f.validationInput.expected, operationInputs: noMaterial }), false,
    'Rehashing a report cannot detach version3 from the original material selector');
    if (kind === 'knowledge' && objectFormat === 'sha1') {
      const variant = promotionMaterialEvidenceVariant(f, artifacts => {
        artifacts.find(row => row.file === 'checks/operation/result').bytes = canonicalJsonBytes(oldVersion);
      });
      const refused = await runFinalPreparedRecordPromotionGate(variant);
      assert.equal(refused.status, 'failed', JSON.stringify(refused));
    }

    const saved = await recordApprovedCandidateReview(f.writer());
    assert.equal(saved.status, 'retained', JSON.stringify(saved));
    const input = f.publisher(saved), receipt = readReview(input);
    assert.equal(receipt.status, 'verified');
    assert.deepEqual(receipt.receipt.review.decision, f.event.decision);
    assert.deepEqual(receipt.receipt.review.decisionCapture, f.event.review['decision-capture']);
    assert.equal(receipt.receipt.review.decisionDigest, f.event.review['decision-digest']);
    const index = readFileSync(join(f.root, '.git/index')), status = git(f, 'status', '--porcelain');
    const unchanged = () => {
      assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
      assert.equal(git(f, 'status', '--porcelain'), status);
      assert.equal(git(f, 'rev-parse', f.request.source.ref), f.source.commit);
    };
    const absent = () => assert.equal(git(f, 'for-each-ref', '--format=%(objectname)', f.request.publish.outputRef), '');
    const control = await publishPreparedCandidate(input);
    assert.equal(control.status, 'published', JSON.stringify(control));
    assert.equal(control.receiptDigest, saved.receiptDigest);
    assert.equal(git(f, 'rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged();
    git(f, 'update-ref', '-d', f.request.publish.outputRef, f.candidate.commit);

    for (const [family, row] of [
      ['Decision', f.input.evidence.decisionCaptures[0]],
      ['material', f.input.evidence.materialCaptures[0]],
    ]) await t.test(`fresh ${family} source loss refuses after an authentic receipt`, async () => {
      const source = row.capture.source;
      assert.ok(source);
      assert.notEqual(source.commit, f.source.commit);
      assert.notEqual(source.commit, f.candidate.commit);
      const file = resolve(f.root, git(f, 'rev-parse', '--git-dir'), 'objects', source.commit.slice(0, 2), source.commit.slice(2));
      const bytes = readFileSync(file), fileMode = statSync(file).mode & 0o777;
      unlinkSync(file);
      try {
        assert.equal(git(f, 'cat-file', '-t', f.source.commit), 'commit');
        assert.equal(git(f, 'cat-file', '-t', f.candidate.commit), 'commit');
        assert.equal(readReview(input).status, 'verified');
        await assert.rejects(recordApprovedCandidateReview(f.writer()), error =>
          error instanceof EngineRefusal && error.code === 'review-final-promotion-mismatch');
        const refused = await publishPreparedCandidate(input);
        assert.equal(refused.status, 'not-published', JSON.stringify(refused));
        assert.equal(refused.code, 'review-final-promotion-mismatch', JSON.stringify(refused));
        absent(); unchanged();
      } finally {
        writeFileSync(file, bytes, { flag: 'wx', mode: fileMode });
      }
    });

    const sameTree = git(f, 'commit-tree', f.source.tree, '-p', f.source.commit, '-m', 'same tree distinct promotion source');
    assert.notEqual(sameTree, f.source.commit);
    assert.equal(git(f, 'rev-parse', `${sameTree}^{tree}`), f.source.tree);
    git(f, 'update-ref', f.request.source.ref, sameTree, f.source.commit);
    try {
      const stale = await publishPreparedCandidate(input);
      assert.equal(stale.status, 'not-published');
      assert.equal(stale.code, 'source-ref-stale');
      absent();
    } finally {
      git(f, 'update-ref', f.request.source.ref, f.source.commit, sameTree);
    }
    const restored = await publishPreparedCandidate(input);
    assert.equal(restored.status, 'published', JSON.stringify(restored));
    assert.equal(git(f, 'rev-parse', f.request.publish.outputRef), f.candidate.commit);
    unchanged();
  });
}
