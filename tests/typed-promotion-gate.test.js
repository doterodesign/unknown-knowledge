import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typedPromotionGateFixture } from './helpers/typed-promotion-gate-fixture.js';
import { runPreparedRecordPromotionGate } from '../payload/engine/lib/assignment-gate.js';
import { admitRecordPromotionInput, recordPromotionInputWire } from '../payload/engine/lib/record-promotion-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const copy = (input) => {
  const result = structuredClone(input);
  for (const capture of [...result.evidence.decisionCaptures, ...result.evidence.assessmentCaptures.flatMap(({ registry, identity }) => [registry, identity])]) {
    capture.bytes = Buffer.from(capture.bytes);
  }
  return result;
};
const details = (result) => JSON.stringify({ checks: result.checks, diagnostics: result.diagnostics,
  assignment: result.assignment?.diagnostics, impacts: result.impacts?.diagnostics,
  replays: result.impacts?.representativeReplays?.diagnostics, preflight: result.preflight?.result });

for (const format of ['sha1', 'sha256']) test(`actual ${format} O promotion proves classified genesis, history and complete typed impacts`, async (t) => {
  const f = typedPromotionGateFixture(t, { format, nested: format === 'sha256' });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, true, details(result));
  assert.equal(result.publicationReady, false);
  assert.equal(result.assignment.ok, true);
  assert.equal(result.assignment.checks.humanApproval.status, 'not-performed');
  assert.equal(result.assignment.checks.impactPolicy.status, 'not-performed');
  assert.equal(result.preflight.status, 'passed');
  assert.equal(result.preflight.result.payload.counts.trusted, 3);
  assert.equal(result.impacts.status, 'passed');
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  assert.equal(result.impacts.representativeReplays.resources.inventory.requiredCases, 216);
  assert.equal(result.impacts.unknownOwners.status, 'complete');
  assert.equal(result.impacts.unknownOwners.created.length, 1);
  assert.equal(result.impacts.routes.status, 'requires-final-capability');
  assert.equal(result.sources.assignmentEvent.eventId, f.event.event);
  assert.equal(result.impacts.reach.status, 'incomplete');
  if (format === 'sha1') assert.deepEqual(await runPreparedRecordPromotionGate(f.input), result);
});

test('actual absent Subject authority proves inapplicability while still checking O preflight and genesis', async (t) => {
  const f = typedPromotionGateFixture(t, { history: false, subjectAuthority: false });
  for (const name of ['governance', 'reach', 'replays', 'views']) for (const key of Object.keys(f.input.limits[name])) {
    if (key !== 'version') f.input.limits[name][key] = 0;
  }
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, true, details(result));
  assert.deepEqual(result.impacts.applicability, { kind: 'subject-registry-absent-both' });
  assert.deepEqual(result.impacts.required, []);
  assert.equal(result.impacts.reach, null); assert.equal(result.impacts.subjectTree, null);
  assert.equal(result.impacts.representativeReplays, null); assert.equal(result.impacts.unknownOwners, null);
  assert.equal(result.resources.governance, null);
  assert.equal(result.preflight.result.payload.counts.trusted, 3);
});

test('unchanged unknown canonical sibling survives a selected shared-file promotion without fabricated complete reach', async (t) => {
  const f = typedPromotionGateFixture(t, { unknownSibling: true });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, true, details(result));
  const sibling = result.impacts.unknownOwners.retained.find(({ ref }) => ref.id === 'O-000001');
  assert.ok(sibling); assert.notEqual(sibling.beforeCapture.sha256, sibling.afterCapture.sha256);
  assert.equal(result.impacts.reach.status, 'incomplete');
});

test('typed admission detaches evidence and preserves the exact digest while refusing hidden fields and broader kinds', async (t) => {
  const f = typedPromotionGateFixture(t);
  const input = copy(f.input); const admitted = admitRecordPromotionInput(input);
  assert.equal(admitted.ok, true);
  assert.equal(admitted.inputDigest, canonicalSha256(recordPromotionInputWire(input)));
  input.evidence.decisionCaptures[0].bytes.fill(0); input.today = '2027-01-01'; input.promotion.rows.reverse();
  assert.equal(admitted.inputDigest, canonicalSha256(recordPromotionInputWire(admitted.input)));
  assert.notEqual(admitted.inputDigest, canonicalSha256(recordPromotionInputWire(input)));
  const host = copy(f.input); host.repoRoot = '/different-host';
  assert.equal(admitRecordPromotionInput(host).inputDigest, admitted.inputDigest);
  for (const mutate of [
    (v) => { v.kind = 'knowledge'; }, (v) => { v.kind = 'decision'; }, (v) => { v.version = 2; },
    (v) => { v.today = '2026-02-30'; }, (v) => { v.promotion.rows[0].targetLifecycle = 'verified'; },
    (v) => { v.impact.policy = 'equivalent-merge-impact-v1'; }, (v) => { v.report = { ok: true }; },
    (v) => Object.defineProperty(v.promotion.rows, '0', { enumerable: false, value: v.promotion.rows[0] }),
    (v) => Object.defineProperty(v, 'kind', { enumerable: true, get() { throw new Error('getter invoked'); } }),
    (v) => Object.defineProperty(v.evidence.decisionCaptures[0].capture, 'file', { enumerable: true, get() { throw new Error('capture getter invoked'); } }),
  ]) {
    const value = copy(f.input); value.repoRoot = '/must-not-read'; mutate(value);
    const result = await runPreparedRecordPromotionGate(value);
    assert.equal(result.ok, false); assert.equal(result.inputDigest, null); assert.equal(result.assignment, null);
    assert.equal(result.checks.admission.status, 'failed');
  }
});

test('retired equivalent Subject IDs remain forbidden new assignments even when proposal text is unchanged', async (t) => {
  const f = typedPromotionGateFixture(t, { retiredSubject: true });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, false, details(result));
  assert.equal(result.assignment.checks.eligibility.status, 'failed', details(result));
  assert.equal(result.impacts.representativeReplays, null);
});

test('candidate history, registry and full changed-path preservation cannot be replaced by matching semantic rows', async (t) => {
  for (const [name, mutate] of [
    ['baseline bytes', (f) => f.put('subjects/_assignments/_baselines.yaml', JSON.stringify(f.baseline))],
    ['old event bytes', (f) => f.put(`subjects/_assignments/${f.priorEvent.event}.yaml`, f.read(`subjects/_assignments/${f.priorEvent.event}.yaml`) + '\n# changed old event\n')],
    ['registry bytes', (f) => f.put('subjects/registry.yaml', f.read('subjects/registry.yaml') + '\n# changed registry\n')],
    ['unselected file', (f) => f.put('unreviewed.txt', 'not in the planner transformation\n')],
    ['birth revision', (f) => { f.event.rows[0]['after-revision'] = 1; }],
    ['old baseline state', (f) => f.put('subjects/_assignments/_baselines.yaml', f.read('subjects/_assignments/_baselines.yaml').replace('"ids":["S-000001"]', '"ids":[]'))],
  ]) {
    const f = typedPromotionGateFixture(t);
    if (name === 'birth revision') { mutate(f); f.save(); }
    else {
      mutate(f); f.git('add', '.'); const tree = f.git('write-tree');
      f.input.candidate = { ...f.candidate, tree, commit: f.git('commit-tree', tree, '-p', f.before.commit, '-m', name) };
    }
    const result = await runPreparedRecordPromotionGate(f.input);
    assert.equal(result.ok, false, `${name}: ${details(result)}`);
  }
});

test('actual source and governance evidence failures refuse without replacing the owner reports', async (t) => {
  const f = typedPromotionGateFixture(t);
  for (const mutate of [
    (v) => { v.before.tree = '0'.repeat(v.before.tree.length); },
    (v) => { v.promotion.rows[0].beforeCapture.sha256 = '0'.repeat(64); },
    (v) => { v.evidence.decisionCaptures = []; },
    (v) => { v.evidence.decisionCaptures[0].bytes[0] ^= 1; },
  ]) {
    const input = copy(f.input); mutate(input);
    const result = await runPreparedRecordPromotionGate(input);
    assert.equal(result.ok, false); assert.ok(result.assignment); assert.equal(result.publicationReady, false);
  }
});

test('domain limits refuse incomplete work and reserve the entire finite replay before queries', async (t) => {
  const f = typedPromotionGateFixture(t);
  const baseline = await runPreparedRecordPromotionGate(f.input);
  assert.equal(baseline.ok, true, details(baseline));
  const fit = copy(f.input);
  fit.limits.assignments.maxCaptureBytes = baseline.assignment.used.captureBytes;
  fit.limits.assignments.maxRecords = 3;
  fit.limits.replays.maxCases = baseline.impacts.representativeReplays.resources.inventory.requiredCases;
  fit.limits.replays.maxInventoryBytes = baseline.impacts.representativeReplays.resources.inventory.bytes;
  for (const [limit, counter] of Object.entries({ maxCaptureBytes: 'captureBytes', maxDocumentNodes: 'documentNodes',
    maxDocumentTextUnits: 'documentTextUnits', maxSubjects: 'subjects', maxHistoryRows: 'historyRows', maxValidationSteps: 'validationSteps' })) {
    fit.limits.governance[limit] = baseline.resources.governance.used[counter];
  }
  assert.equal((await runPreparedRecordPromotionGate(fit)).ok, true);
  const cases = [
    ['promotion', 'maxFiles', 1], ['promotion', 'maxFileBytes', 1], ['promotion', 'maxSourceBytes', 1], ['promotion', 'maxPromotions', 1],
    ['assignments', 'maxRecords', 2], ['assignments', 'maxCaptureBytes', fit.limits.assignments.maxCaptureBytes - 1],
    ['reach', 'maxRecords', 1], ['reach', 'maxHierarchyNodes', 0], ['reach', 'maxHierarchyEdges', 0],
    ['views', 'maxViews', 0], ['tree', 'maxBytes', 1],
    ['replays', 'maxSubjects', 2], ['replays', 'maxCases', fit.limits.replays.maxCases - 1], ['replays', 'maxInventoryBytes', fit.limits.replays.maxInventoryBytes - 1],
    ['query', 'maxResultsPerStore', 0], ['query', 'maxExplanationNodes', 0], ['query', 'maxRecords', 0],
    ...Object.entries(fit.limits.governance).filter(([, value]) => value > 0).map(([key, value]) => ['governance', key, value - 1]),
  ];
  for (const [group, key, value] of cases) {
    const input = copy(f.input); input.limits[group][key] = value;
    const result = await runPreparedRecordPromotionGate(input);
    assert.equal(result.ok, false, `${group}.${key}: ${details(result)}`);
    if (group === 'replays' && key === 'maxInventoryBytes') {
      assert.equal(result.impacts.representativeReplays.comparison.resources.queries.calls, 0);
      assert.equal(result.impacts.representativeReplays.comparison.coverage.reservationComplete, false);
    }
    if (group === 'replays' && key === 'maxCases') assert.equal(result.impacts.representativeReplays.comparison, null);
    if (group === 'governance') assert.ok(result.resources.governance.failure);
  }
});
