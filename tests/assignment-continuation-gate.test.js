import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAssignmentGate, runPreparedAssignmentGate, runPreparedAssignmentGateFromWire } from '../payload/engine/lib/assignment-gate.js';
import { assignmentContinuationFixture } from './helpers/assignment-continuation-fixture.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { admitSubjectAssignmentContinuation } from '../payload/engine/lib/subject-assignment-continuation.js';
import { typedAssignmentFixture } from './helpers/typed-assignment-fixture.js';

const raw = actual => ({ capture: actual.locator, bytes: actual.bytes, objectFormat: actual.objectFormat });
const sourceLess = actual => {
  const { source, ...capture } = actual.locator;
  return { capture, bytes: actual.bytes, objectFormat: actual.objectFormat };
};

for (const options of [{ objectFormat: 'sha1', nested: false }, { objectFormat: 'sha256', nested: true }]) {
  test(`actual first assignment after reconsideration ${JSON.stringify(options)}`, async t => {
    const f = assignmentContinuationFixture(t, options);
    const before = f.git('rev-parse', 'HEAD');
    const staged = await runAssignmentGate(f.options);
    assert.equal(staged.ok, true, JSON.stringify(staged.diagnostics));
    assert.equal(staged.version, 2);
    assert.equal(staged.checks.candidateCommitMembership.status, 'not-performed');
    assert.equal(f.git('rev-parse', 'HEAD'), before);
    const prepared = await runPreparedAssignmentGate(f.prepare());
    assert.equal(prepared.ok, true, JSON.stringify(prepared.diagnostics));
    assert.equal(prepared.version, 2);
    assert.equal(prepared.publicationReady, false);
    assert.equal(prepared.checks.candidateCommitMembership.status, 'passed');
    assert.ok(prepared.continuation.governance.used.captureBytes > 0);
    assert.equal(prepared.continuation.governance.failure, null);
    assert.equal(staged.continuation.inputDigest, prepared.continuation.inputDigest);
  });
}

test('actual omission still refuses missing reconsideration evidence on the old v1 path', async t => {
  const f = assignmentContinuationFixture(t);
  const { continuation, ...input } = f.options;
  const result = await runAssignmentGate(input);
  assert.equal(result.ok, false);
  assert.equal(result.version, 1);
  assert.equal(Object.hasOwn(result, 'continuation'), false);
  assert.equal(result.checks.eligibility.status, 'failed');
});

test('source-less current assessment pairs require the same actual side', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  const current = file => captureCommittedFile({ repoRoot: f.root, commit: f.source.commit, file: f.path(file) });
  const pair = { registry: sourceLess(current('subjects/registry.yaml')), identity: sourceLess(current('_identity.yaml')) };
  input.continuation = { ...input.continuation, assessmentCaptures: [...input.continuation.assessmentCaptures, pair] };
  const good = await runPreparedAssignmentGate(input);
  assert.equal(good.ok, true, JSON.stringify(good.diagnostics));
  const mixed = { registry: f.beforeCaptures.registry, identity: pair.identity };
  input.continuation.assessmentCaptures = [...f.evidence.assessmentCaptures, mixed];
  const bad = await runPreparedAssignmentGate(input);
  assert.equal(bad.ok, false);
  assert.equal(bad.diagnostics[0].code, 'assignment-continuation-assessment-side');
});

test('actual declared historical source cannot be repaired from identical current bytes', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  assert.equal((await runPreparedAssignmentGate(input)).ok, true);
  const material = input.continuation.materialCaptures[0];
  const commit = material.capture.source.commit;
  assert.notEqual(commit, input.before.commit);
  assert.notEqual(commit, input.candidate.commit);
  assert.equal(f.git('cat-file', '-t', commit), 'commit');
  unlinkSync(join(f.root, '.git', 'objects', commit.slice(0, 2), commit.slice(2)));
  const result = await runPreparedAssignmentGate(input);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'assignment-continuation-source-unavailable');
});

test('every supplied unused Decision capture also needs actual declared provenance', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  const extra = raw(captureCommittedFile({ repoRoot: f.root, commit: f.source.commit, file: f.path('decisions/entries/review.yaml') }));
  input.decisionCaptures = [...input.decisionCaptures, extra];
  assert.equal((await runPreparedAssignmentGate(input)).ok, true);
  extra.capture.source.tree = 'f'.repeat(extra.capture.source.tree.length);
  const result = await runPreparedAssignmentGate(input);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'assignment-continuation-evidence-source');
});

test('staged evidence uses the index tree while checkout bytes remain irrelevant', async t => {
  const f = assignmentContinuationFixture(t);
  const index = readFileSync(join(f.root, '.git', 'index'));
  f.put('knowledge/K-000001.md', 'Unstaged invalid content.\n');
  const result = await runAssignmentGate(f.options);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.inputs.candidate.kind, 'tree');
  assert.equal(Object.hasOwn(result.inputs.candidate, 'commit'), false);
  assert.equal(result.checks.candidateCommitMembership.status, 'not-performed');
  assert.ok(readFileSync(join(f.root, '.git', 'index')).equals(index));
  assert.equal(f.read('knowledge/K-000001.md'), 'Unstaged invalid content.\n');
});

test('new governance limits cover cumulative work and remain sticky at exact-fit boundaries', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  const positive = await runPreparedAssignmentGate(input);
  assert.equal(positive.ok, true, JSON.stringify(positive.diagnostics));
  const counts = positive.continuation.governance.used;
  for (const [limit, counter] of [['maxCaptureBytes', 'captureBytes'], ['maxDocumentNodes', 'documentNodes'],
    ['maxDocumentTextUnits', 'documentTextUnits'], ['maxSubjects', 'subjects'],
    ['maxHistoryRows', 'historyRows'], ['maxValidationSteps', 'validationSteps']]) {
    assert.ok(counts[counter] > 0, counter);
    const exact = { ...input, continuation: { ...input.continuation,
      limits: { governance: { ...input.continuation.limits.governance, [limit]: counts[counter] } } } };
    assert.equal((await runPreparedAssignmentGate(exact)).ok, true, limit);
    exact.continuation.limits.governance[limit]--;
    const refused = await runPreparedAssignmentGate(exact);
    assert.equal(refused.ok, false, limit);
    assert.equal(refused.continuation.governance.failure.counter, counter);
  }
});

test('cleanup failure revokes continued success and retains cumulative accounting', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  assert.equal((await runPreparedAssignmentGate(input)).ok, true);
  const original = fs.rmSync;
  let failures = 0;
  fs.rmSync = (path, ...args) => {
    original(path, ...args);
    if (String(path).includes('unknown-knowledge-tree-')) { failures++; throw Object.assign(new Error('fixture cleanup'), { code: 'EACCES' }); }
  };
  syncBuiltinESMExports();
  let result;
  try { result = await runPreparedAssignmentGate(input); }
  finally { fs.rmSync = original; syncBuiltinESMExports(); }
  assert.ok(failures > 0);
  assert.equal(result.ok, false);
  assert.ok(result.continuation.governance.used.validationSteps > 0);
  assert.equal(result.diagnostics.at(-1).code, 'assignment-snapshot-unavailable');
});

test('early ordinary schema refusal retains metadata work without inventing budget failure', async t => {
  const f = assignmentContinuationFixture(t);
  const input = { ...f.options, eventId: 'invalid' };
  const admitted = admitSubjectAssignmentContinuation(input);
  assert.equal(admitted.ok, true);
  const operation = admitted.bundle.operationBudget, prior = operation.used;
  // Independent explicit ordinary metadata, rather than a gate-result-derived cap.
  operation.guard({ repoRoot: input.repoRoot, eventId: input.eventId, reviewNote: input.reviewNote,
    limits: input.limits, impact: input.impact }, 'expected-gate-metadata');
  assert.ok(operation.used.documentNodes > prior.documentNodes);
  assert.ok(operation.used.documentTextUnits > prior.documentTextUnits);
  const result = await runAssignmentGate(input);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'invalid-assignment-gate-input');
  assert.deepEqual(result.continuation.governance.used, operation.used);
  assert.equal(result.continuation.governance.failure, null);
  assert.equal(result.inputs, null);
});

for (const kind of ['knowledge', 'ontology', 'decision']) test(`actual opt-in typed ${kind} gate preserves existing selection and grouped files`, async t => {
  const f = typedAssignmentFixture(t, { kind, nested: kind === 'decision' });
  const original = await runPreparedAssignmentGate(f.prepared);
  assert.equal(original.ok, true, JSON.stringify(original.diagnostics));
  const input = { ...f.prepared, continuation: { version: 1, assessmentCaptures: [], materialCaptures: [],
    limits: { governance: { maxCaptureBytes: 10000000, maxDocumentNodes: 2000000, maxDocumentTextUnits: 20000000,
      maxSubjects: 100000, maxHistoryRows: 100000, maxValidationSteps: 1000000 } } } };
  const result = await runPreparedAssignmentGate(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.version, 2);
  assert.equal(result.scope.basis, 'reviewed-typed-existing-records');
  assert.deepEqual(result.scope, original.scope);
  assert.deepEqual(result.rows, original.rows);
  assert.equal(result.checks.preservation.status, 'passed');
  assert.equal(result.used.selectedRecords, original.used.selectedRecords);
  const replay = await runPreparedAssignmentGate({ ...input, impact: { ...input.impact,
    representativeReplays: { limits: {}, queryBudgets: {} } } });
  assert.equal(replay.ok, true);
  assert.equal(replay.checks.authorizer.status, 'passed');
  assert.equal(replay.optionalImpact.representativeReplays.status, 'refused');
  assert.equal(replay.optionalImpact.representativeReplays.cases, null);
  assert.equal(replay.optionalImpact.representativeReplays.diagnostics[0].code, 'invalid-assignment-replay-input');
});

test('actual raw and wire adapters preserve the same report proof with distinct admission costs', async t => {
  const f = assignmentContinuationFixture(t), input = f.prepare();
  const encode = ({ bytes, ...value }) => ({ ...value, bytesBase64: bytes.toString('base64') });
  const wire = { ...input, decisionCaptures: input.decisionCaptures.map(encode), continuation: { ...input.continuation,
    assessmentCaptures: input.continuation.assessmentCaptures.map(pair => ({ registry: encode(pair.registry), identity: encode(pair.identity) })),
    materialCaptures: input.continuation.materialCaptures.map(encode) } };
  const raw = await runPreparedAssignmentGate(input), encoded = await runPreparedAssignmentGateFromWire(wire);
  assert.equal(raw.ok, true, JSON.stringify(raw.diagnostics));
  assert.equal(encoded.ok, true, JSON.stringify(encoded.diagnostics));
  assert.equal(raw.continuation.inputDigest, encoded.continuation.inputDigest);
  assert.equal(raw.continuation.governance.used.captureBytes, encoded.continuation.governance.used.captureBytes);
  assert.notEqual(raw.continuation.governance.used.validationSteps, encoded.continuation.governance.used.validationSteps);
  const stripUsage = value => ({ ...value, continuation: { ...value.continuation, governance: null } });
  assert.deepEqual(stripUsage(raw), stripUsage(encoded));
});

for (const mode of ['staged', 'prepared', 'wire']) test(`own __proto__ metadata remains an invalid closed field: ${mode}`, async t => {
  const f = assignmentContinuationFixture(t);
  const input = mode === 'staged' ? { ...f.options } : f.prepare();
  const run = mode === 'staged' ? runAssignmentGate : mode === 'prepared' ? runPreparedAssignmentGate : runPreparedAssignmentGateFromWire;
  if (mode === 'wire') {
    const encode = ({ bytes, ...row }) => ({ ...row, bytesBase64: bytes.toString('base64') });
    input.decisionCaptures = input.decisionCaptures.map(encode);
    input.continuation = { ...input.continuation,
      assessmentCaptures: input.continuation.assessmentCaptures.map(pair => ({ registry: encode(pair.registry), identity: encode(pair.identity) })),
      materialCaptures: input.continuation.materialCaptures.map(encode) };
  }
  const control = await run(input);
  assert.equal(control.ok, true, JSON.stringify(control.diagnostics));
  for (const value of [null, 1]) {
    const invalid = { ...input };
    Object.defineProperty(invalid, '__proto__', { value, enumerable: true });
    const refused = await run(invalid);
    assert.equal(refused.ok, false);
    assert.equal(refused.diagnostics[0].code, 'invalid-assignment-gate-input');
    assert.equal(refused.inputs, null);
    assert.equal(refused.continuation.governance.failure, null);
    assert.equal(Object.hasOwn(invalid, '__proto__'), true);
  }
});
