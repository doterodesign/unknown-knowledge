import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { subjectReconsiderationCoreFixture } from './helpers/subject-reconsideration-core-fixture.js';
import { validateSubjectReconsiderationCreation } from '../payload/engine/lib/subject-governance.js';
import { wire, digestEvent, stateOf } from './helpers/subject-reconsideration-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

async function inspect(input) {
  const { inspectSubjectReconsiderationCore } = await import('../payload/engine/lib/subject-reconsideration-core.js');
  return inspectSubjectReconsiderationCore(input);
}

function modelControl(f) {
  const { id, proposal, subject, registryEvent } = f.operation;
  return validateSubjectReconsiderationCreation({ beforeModel: f.beforeModel, candidateModel: f.candidateModel,
    beforeCaptures: f.beforeCaptures, decisionCaptures: f.evidence.decisionCaptures,
    assessmentCaptures: f.evidence.assessmentCaptures.filter(pair => pair !== f.beforeCaptures),
    materialCaptures: f.evidence.materialCaptures, operation: { id, proposal, subject, registryEvent },
    allocationLimits: f.limits.allocation, budget: f.limits.governance });
}

function copyCapture(value) {
  return { capture: structuredClone(value.capture), bytes: Buffer.from(value.bytes), objectFormat: value.objectFormat };
}

function evidenceCopy(f) {
  return { decisionCaptures: f.evidence.decisionCaptures.map(copyCapture),
    assessmentCaptures: f.evidence.assessmentCaptures.map(pair => ({ registry: copyCapture(pair.registry), identity: copyCapture(pair.identity) })),
    materialCaptures: f.evidence.materialCaptures.map(copyCapture) };
}

function candidateChange(f, document, evidence = f.evidence) {
  const event = document.history.at(-1);
  event.review.changeDigest = digestEvent(event);
  f.put('subjects/registry.yaml', wire(document));
  const candidate = f.commit('independent candidate provenance variant');
  return f.input({ candidate, evidence, operation: { ...f.operation,
    registryEvent: { id: event.id, changeDigest: event.review.changeDigest } } });
}

async function passed(input) {
  const result = await inspect(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.publicationReady, false);
  assert.equal(result.assignments, null);
  return result;
}

function removeLooseCommit(f, commit) {
  assert.equal(f.git('cat-file', '-t', commit), 'commit');
  assert.notEqual(commit, f.before.commit);
  assert.notEqual(commit, f.candidate.commit);
  unlinkSync(join(f.repoRoot, '.git/objects', commit.slice(0, 2), commit.slice(2)));
}

test('independent provenance fixture has an actual valid two-model reconsideration control', t => {
  const f = subjectReconsiderationCoreFixture(t, { parent: true, related: true });
  const checked = modelControl(f);
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  assert.equal(checked.publicationReady, false);
});

for (const options of [{ objectFormat: 'sha1' }, { objectFormat: 'sha256', nested: true }]) {
  test(`actual Git core preserves unchanged material, parent and association (${options.objectFormat})`, async t => {
    const f = subjectReconsiderationCoreFixture(t, { ...options, parent: true, related: true });
    const checked = modelControl(f);
    assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
    const result = await inspect(f.input());
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.publicationReady, false);
    assert.equal(result.assignments, null);
    assert.equal(result.sourceMembership.status, 'passed');
    assert.equal(result.sourceMembership.scope, 'supplied-captures-and-selected-transition');
    assert.deepEqual(result.ownerPreservation.changedPaths, [f.files.identity, f.files.registry].sort());
  });
}

for (const family of ['historical Decision', 'material']) {
  test(`actual supplied ${family} source loss refuses despite intact current authorities`, async t => {
    const f = subjectReconsiderationCoreFixture(t, { archivedPrior: true });
    await passed(f.input());
    const historical = f.evidence.decisionCaptures[0];
    const current = f.evidence.decisionCaptures[1];
    const material = f.evidence.materialCaptures[0];
    assert.equal(new Set([historical, current, material].map(row => row.capture.source.commit)).size, 3);
    removeLooseCommit(f, (family === 'material' ? material : historical).capture.source.commit);
    assert.equal(f.git('cat-file', '-t', current.capture.source.commit), 'commit');
    const checked = modelControl(f);
    assert.equal(checked.ok, true, 'Retained bytes remain valid independently of actual historical source availability.');
    const result = await inspect(f.input());
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.ok(result.allocation, 'The failure must follow the actual model/native proof.');
    assert.notEqual(result.sourceMembership.status, 'passed');
  });
}

test('valid material bytes with a false declared tree refuse actual provenance', async t => {
  const f = subjectReconsiderationCoreFixture(t, { objectFormat: 'sha256', nested: true, archivedPrior: true });
  await passed(f.input());
  const document = structuredClone(f.candidateDocument), evidence = evidenceCopy(f);
  const material = evidence.materialCaptures[0];
  assert.notEqual(material.capture.source.tree, f.candidate.tree);
  material.capture.source.tree = f.candidate.tree;
  document.history.at(-1).reconsideration.sources[0].capture = structuredClone(material.capture);
  const result = await inspect(candidateChange(f, document, evidence));
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.allocation);
  assert.notEqual(result.sourceMembership.status, 'passed');
});

test('source-less material and selected Decision prove current correspondence without inventing historical source', async t => {
  const f = subjectReconsiderationCoreFixture(t, { archivedPrior: true, objectFormat: 'sha256', nested: true });
  await passed(f.input());
  const document = structuredClone(f.candidateDocument), evidence = evidenceCopy(f);
  delete evidence.materialCaptures[0].capture.source;
  document.history.at(-1).reconsideration.sources[0].capture = structuredClone(evidence.materialCaptures[0].capture);
  delete evidence.decisionCaptures[1].capture.source;
  document.history.at(-1).review.decisionCapture = structuredClone(evidence.decisionCaptures[1].capture);
  const result = await passed(candidateChange(f, document, evidence));
  for (const supplied of [evidence.materialCaptures[0], evidence.decisionCaptures[1]]) {
    const row = result.sourceMembership.rows.find(row => canonicalSha256(row.capture) === canonicalSha256(supplied.capture));
    assert.ok(row, JSON.stringify(result.sourceMembership));
    assert.equal(row.basis, 'current-correspondence');
    assert.equal(Object.hasOwn(row.capture, 'source'), false);
    assert.ok(row.matches.length > 0);
    assert.ok(row.matches.every(match => ['before', 'candidate'].includes(match.side)));
  }
});

test('source-less material cannot borrow identical bytes from a different current file', async t => {
  const f = subjectReconsiderationCoreFixture(t);
  await passed(f.input());
  const document = structuredClone(f.candidateDocument), evidence = evidenceCopy(f);
  const material = evidence.materialCaptures[0];
  delete material.capture.source;
  material.capture.file = 'missing-material.txt';
  document.history.at(-1).reconsideration.sources[0].capture = structuredClone(material.capture);
  const result = await inspect(candidateChange(f, document, evidence));
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.allocation);
  assert.notEqual(result.sourceMembership.status, 'passed');
});

test('source-less extra assessment pair must match both authorities in one actual side', async t => {
  const f = subjectReconsiderationCoreFixture(t);
  await passed(f.input());
  const evidence = evidenceCopy(f);
  const pair = { registry: copyCapture(f.beforeCaptures.registry), identity: copyCapture(f.beforeCaptures.identity) };
  delete pair.registry.capture.source;
  delete pair.identity.capture.source;
  evidence.assessmentCaptures.push(pair);
  await passed(f.input({ evidence }));
  const candidateIdentity = f.capture(f.candidate, '_identity.yaml');
  delete candidateIdentity.capture.source;
  evidence.assessmentCaptures[evidence.assessmentCaptures.length - 1] = { registry: pair.registry, identity: candidateIdentity };
  const result = await inspect(f.input({ evidence }));
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.allocation);
  assert.notEqual(result.sourceMembership.status, 'passed');
});

test('grouped Decision sibling changes cannot hide behind unchanged selected authorizer content', async t => {
  const f = subjectReconsiderationCoreFixture(t, { archivedPrior: true });
  await passed(f.input());
  const path = join(f.repoRoot, f.files.decision);
  const document = JSON.parse(readFileSync(path, 'utf8'));
  const selectedBefore = structuredClone(document.entries.find(row => row.id === 'D-000003'));
  document.entries.find(row => row.id === 'D-000001').context = 'Altered sibling reasoning';
  assert.deepEqual(document.entries.find(row => row.id === 'D-000003'), selectedBefore);
  writeFileSync(path, JSON.stringify(document));
  const candidate = f.commit('independent grouped sibling change');
  const result = await inspect(f.input({ candidate }));
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.allocation);
});

test('omitted unrelated historical witness stays unavailable while selected dependency omission refuses', async t => {
  const f = subjectReconsiderationCoreFixture(t, { archivedPrior: true, parent: true });
  await passed(f.input());
  const evidence = evidenceCopy(f);
  const declared = copyCapture(evidence.decisionCaptures[1]);
  declared.capture.source.commit = 'f'.repeat(f.before.commit.length);
  const authorizer = JSON.parse(declared.bytes.toString('utf8')).entries.find(row => row.id === 'D-000001');
  const beforeDocument = structuredClone(f.beforeDocument);
  const state = stateOf(beforeDocument.subjects.find(row => row.id === 'S-000002'));
  state.label = 'Independent retained meaning';
  const unrelated = { id: 'a2000000-0000-4000-8000-000000000041', action: 'activate',
    decision: { namespace: f.beforeIdentity.namespace, kind: 'decision', id: 'D-000001' },
    rows: [{ id: 'S-000003', before: null, after: state }] };
  unrelated.review = { reference: 'review:unavailable-unrelated', acceptedStatus: 'accepted',
    decisionCapture: declared.capture, decisionDigest: canonicalSha256(authorizer), changeDigest: digestEvent(unrelated) };
  beforeDocument.history.push(unrelated);
  beforeDocument.subjects.push({ id: 'S-000003', ...state, changes: [unrelated.id] });
  beforeDocument.revision += 1;
  const beforeIdentity = structuredClone(f.beforeIdentity);
  beforeIdentity.allocations.push({ kind: 'subject', id: 'S-000003', state: 'allocated',
    publication: { id: unrelated.id, review: unrelated.review.reference } });
  // All mutations below are in this disposable fixture repository. Build an
  // actual new original pair; never replace a descriptor without recapturing.
  f.git('read-tree', '--reset', '-u', f.before.commit);
  f.put('subjects/registry.yaml', wire(beforeDocument));
  f.put('_identity.yaml', beforeIdentity);
  const before = f.commit('independent before with unrelated unavailable witness');
  const beforeCaptures = { registry: f.capture(before, 'subjects/registry.yaml'), identity: f.capture(before, '_identity.yaml') };
  const selected = structuredClone(f.candidateDocument.history.at(-1));
  selected.reconsiderationAssessment.scope = { beforeRegistry: { capture: beforeCaptures.registry.capture,
    documentDigest: canonicalSha256(beforeDocument) }, identityDigest: canonicalSha256(beforeIdentity) };
  selected.review.changeDigest = digestEvent(selected);
  const document = { ...beforeDocument, revision: beforeDocument.revision + 1,
    hierarchyRevision: f.candidateDocument.hierarchyRevision,
    subjects: [...beforeDocument.subjects.filter(row => row.id !== f.operation.proposal),
      structuredClone(f.candidateDocument.subjects.find(row => row.id === f.operation.subject))],
    history: [...beforeDocument.history, selected] };
  const identity = { ...beforeIdentity, allocations: [...beforeIdentity.allocations,
    structuredClone(f.candidateIdentity.allocations.find(row => row.kind === 'subject' && row.id === f.operation.subject))] };
  f.put('subjects/registry.yaml', wire(document));
  f.put('_identity.yaml', identity);
  const candidate = f.commit('independent candidate retains unrelated unavailable witness');
  evidence.assessmentCaptures = [beforeCaptures];
  const input = f.input({ before, candidate, evidence, operation: { ...f.operation,
    registryEvent: { id: selected.id, changeDigest: selected.review.changeDigest } } });
  await passed(input);
  const missingSelected = await inspect({ ...input, evidence: { ...evidence,
    decisionCaptures: [evidence.decisionCaptures[0]] } });
  assert.equal(missingSelected.ok, false, JSON.stringify(missingSelected));
  assert.ok(missingSelected.diagnostics.length > 0);
  const suppliedFalseSource = await inspect({ ...input, evidence: { ...evidence,
    decisionCaptures: [...evidence.decisionCaptures, declared] } });
  assert.equal(suppliedFalseSource.ok, false, JSON.stringify(suppliedFalseSource));
  assert.ok(suppliedFalseSource.allocation);
  assert.notEqual(suppliedFalseSource.sourceMembership.status, 'passed');
});

test('material record binding remains a declaration, not a selected-record occurrence proof', async t => {
  const f = subjectReconsiderationCoreFixture(t, { sourceMaterial: false });
  await passed(f.input());
  const document = structuredClone(f.candidateDocument);
  const selected = document.history.at(-1);
  const declaration = selected.reconsideration.records[0];
  declaration.ref = { namespace: f.beforeIdentity.namespace, kind: 'knowledge', id: 'K-000001' };
  selected.rows[0].after.warrant.records = [structuredClone(declaration)];
  document.subjects.find(row => row.id === f.operation.subject).warrant = structuredClone(selected.rows[0].after.warrant);
  assert.equal(declaration.capture.file, f.files.decision);
  // The file really is the retained grouped Decision file. No assertion here
  // says K-000001 occurs in it or that those bytes justify the reviewed meaning.
  const result = await passed(candidateChange(f, document));
  assert.equal(result.sourceMembership.status, 'passed');
});
