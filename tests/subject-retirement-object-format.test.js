import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectRetirementCoreFixture } from './helpers/subject-retirement-core-fixture.js';
import { subjectRetirementAssignmentFixture } from './helpers/subject-retirement-assignment-fixture.js';
import { inspectSubjectRetirementAssignmentScope } from '../payload/engine/lib/subject-retirement-core.js';
import { runPreparedSubjectRetirementGate } from '../payload/engine/lib/subject-retirement-gate.js';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { captureCommittedFile, verifyCapturedBytes } from '../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const detached = ({ source, ...locator }) => locator;
function assertActualCaptures(f, objectFormat) {
  assert.equal(f.git('rev-parse', '--show-object-format'), objectFormat);
  assert.equal(f.objectFormat, objectFormat);
  const oidLength = objectFormat === 'sha256' ? 64 : 40;
  for (const side of ['before', 'candidate']) {
    const descriptor = f.input[side];
    assert.equal(descriptor.commit.length, oidLength);
    assert.equal(descriptor.tree.length, oidLength);
    assert.equal(f.git('rev-parse', `${descriptor.commit}^{tree}`), descriptor.tree);
  }
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    if (value.file && value.blob && value.sha256) {
      const actual = captureCommittedFile({ repoRoot: f.root,
        commit: value.source?.commit ?? f.input.before.commit, file: value.file });
      assert.equal(actual.objectFormat, objectFormat);
      assert.equal(value.blob.length, oidLength);
      assert.deepEqual(detached(value), detached(actual.locator));
      if (value.source) assert.deepEqual(value.source, actual.locator.source);
      return;
    }
    for (const child of Object.values(value)) inspect(child);
  };
  inspect(f.document);
  for (const row of f.input.evidence.decisionCaptures) {
    assert.equal(row.objectFormat, objectFormat);
    assert.equal(verifyCapturedBytes({ locator: row.capture, bytes: row.bytes, objectFormat }).ok, true);
    inspect(row.capture);
  }
  const serialized = JSON.parse(readFileSync(f.capturesFile, 'utf8'));
  assert.deepEqual(serialized, f.decisionCaptures.map(({ capture, bytes, objectFormat }) =>
    ({ capture, bytesBase64: bytes.toString('base64'), objectFormat })));
  for (const event of f.document.history) {
    const { review, ...body } = event;
    assert.equal(review.changeDigest, canonicalSha256(body));
  }
}

for (const nested of [false, true]) for (const zero of [false, true]) {
  test(`actual SHA-256 core ${nested ? 'nested' : 'root'} ${zero ? 'zero' : 'positive'} retirement uses real consistent objects`, async t => {
    const f = subjectRetirementCoreFixture(t, { objectFormat: 'sha256', nested, zero,
      child: true, sameOwner: !zero, historical: zero });
    assertActualCaptures(f, 'sha256');
    const result = await f.withCoreInput(inspectSubjectRetirementAssignmentScope);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.assignments.length, zero ? 0 : 2);
    assert.equal(result.registry.candidateCapture.source.tree, f.input.candidate.tree);
  });
}

for (const zero of [false, true]) test(`SHA-256 ${zero ? 'zero' : 'positive'} full gate retains actual prior assignment history`, async t => {
  const f = subjectRetirementAssignmentFixture(t, { objectFormat: 'sha256', nested: true, zero, tracked: true });
  assertActualCaptures(f, 'sha256');
  const prior = await runPreparedAssignmentGate(f.priorInput);
  assert.equal(prior.ok, true, JSON.stringify(prior.diagnostics));
  const result = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.assignments === null, zero);
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  const file = `unknown-knowledge/subjects/_assignments/${f.priorEvent.event}.yaml`;
  const captures = ['before', 'candidate'].map(side => captureCommittedFile({ repoRoot: f.root,
    commit: f.input[side].commit, file }));
  assert.deepEqual(captures[0].bytes, captures[1].bytes);
  assert.equal(captures[0].mode, captures[1].mode);
  if (!zero) for (const row of f.assignmentEvent.rows) {
    assert.equal(row['before-capture'].source.commit.length, 64);
    assert.equal(row['before-capture'].blob.length, 64);
    const actual = captureCommittedFile({ repoRoot: f.root, commit: f.input.candidate.commit,
      file: row['after-capture'].file });
    assert.deepEqual(row['after-capture'], detached(actual.locator));
  }
});

test('SHA-256 historical Decision source is recaptured without converting its object IDs', async t => {
  let historical;
  const f = subjectRetirementCoreFixture(t, { objectFormat: 'sha256', zero: true,
    candidateChange: ({ root, git, event, decisionCaptures, objectFormat }) => {
      assert.equal(objectFormat, 'sha256');
      historical = captureCommittedFile({ repoRoot: root, commit: git('rev-parse', 'HEAD'),
        file: event.review.decisionCapture.file });
      event.review.decisionCapture = historical.locator;
      decisionCaptures.push({ capture: historical.locator, bytes: historical.bytes, objectFormat: historical.objectFormat });
    } });
  assert.equal(historical.objectFormat, 'sha256');
  assert.equal(historical.locator.source.commit.length, 64);
  const result = await f.withCoreInput(inspectSubjectRetirementAssignmentScope);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.decision.decisionCapture, historical.locator);
});

test('omitted objectFormat preserves SHA-1 disk evidence and actual retirement defaults', async t => {
  const disk = subjectQueryDiskFixture(t);
  const explicit = subjectQueryDiskFixture(t, { objectFormat: 'sha1' });
  assert.deepEqual(disk.decisionCaptures, explicit.decisionCaptures);
  assert.deepEqual(readFileSync(disk.capturesFile), readFileSync(explicit.capturesFile));
  const f = subjectRetirementCoreFixture(t);
  assertActualCaptures(f, 'sha1');
  assert.equal((await f.withCoreInput(inspectSubjectRetirementAssignmentScope)).ok, true);
});

test('both fixture interfaces reject unsupported object formats', t => {
  for (const fixture of [subjectQueryDiskFixture, subjectRetirementCoreFixture]) {
    for (const objectFormat of ['sha512', '', null, 256]) {
      assert.throws(() => fixture(t, { objectFormat }), /objectFormat/);
    }
  }
});
