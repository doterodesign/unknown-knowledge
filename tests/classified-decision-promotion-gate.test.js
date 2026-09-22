import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typedPromotionGateFixture } from './helpers/typed-promotion-gate-fixture.js';
import { runPreparedRecordPromotionGate } from '../payload/engine/lib/assignment-gate.js';
import { runPreparedAssignmentGate } from '../payload/engine/lib/assignment-gate.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { typedPromotionPreflightSatisfied } from '../payload/engine/lib/typed-promotion-policy.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { recordPromotionInputWire } from '../payload/engine/lib/record-promotion-input.js';
import { load } from 'js-yaml';

const details = result => JSON.stringify({ checks: result.checks, diagnostics: result.diagnostics,
  assignment: result.assignment?.diagnostics, impacts: result.impacts?.diagnostics });
const fixture = (t, options = {}) => typedPromotionGateFixture(t, { kind: 'decision', ...options });
const copy = value => {
  const cloned = structuredClone(value);
  for (const capture of [...cloned.evidence.decisionCaptures,
    ...cloned.evidence.assessmentCaptures.flatMap(({ registry, identity }) => [registry, identity])]) capture.bytes = Buffer.from(capture.bytes);
  return cloned;
};
const captured = (f, side, file) => captureCommittedFile({ repoRoot: f.root,
  commit: side === 'before' ? f.before.commit : f.input.candidate.commit, file: f.path(file) });
const commitCandidate = (f, message) => {
  f.git('add', '.'); const tree = f.git('write-tree');
  f.input.candidate = { ...f.candidate, tree, commit: f.git('commit-tree', tree, '-p', f.before.commit, '-m', message) };
};
const assertAccepted = (f, result) => {
  assert.equal(result.ok, true, details(result));
  assert.equal(result.version, 2);
  assert.equal(result.publicationReady, false);
  assert.deepEqual(result.checks.preflight, { status: 'not-applicable' });
  assert.deepEqual(result.preflight, { status: 'not-applicable', recordKind: 'decision',
    selectedIds: f.input.promotion.rows.map(row => row.canonicalRef.id), today: null, result: null });
  assert.equal(result.assignment.checks.authorizer.status, 'passed');
  assert.equal(result.assignment.checks.humanApproval.status, 'not-performed');
  assert.equal(result.inputDigest, canonicalSha256(recordPromotionInputWire(f.input)));
};

test('classified Decision promotion preserves history and reports selected preflight as inapplicable', async (t) => {
  const f = typedPromotionGateFixture(t, { kind: 'decision' });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.version, 2);
  assert.equal(result.publicationReady, false);
  assert.deepEqual(result.checks.preflight, { status: 'not-applicable' });
  assert.deepEqual(result.preflight, { status: 'not-applicable', recordKind: 'decision',
    selectedIds: f.rows.map(row => row.canonicalRef.id), today: null, result: null });
  assert.equal(result.assignment.checks.authorizer.status, 'passed');
  assert.equal(result.assignment.checks.humanApproval.status, 'not-performed');
  assert.equal(result.impacts.representativeReplays.status, 'complete');
  assert.equal(result.impacts.reach.status, 'incomplete');
});

for (const format of ['sha1', 'sha256']) for (const companionStores of [[], ['knowledge'], ['ontology'], ['knowledge', 'ontology']]) {
  test(`actual ${format} D with ${companionStores.join('+') || 'no companion'} stores preserves shared owners and existing history`, async (t) => {
    const f = fixture(t, { format, nested: format === 'sha256', companionStores, retainedDecisionOwners: true });
    const result = await runPreparedRecordPromotionGate(f.input);
    assertAccepted(f, result);
    for (const store of ['knowledge', 'ontology']) {
      assert.equal(result.capabilities.before[store], companionStores.includes(store));
      assert.equal(result.capabilities.candidate[store], companionStores.includes(store));
    }
    assert.equal(result.capabilities.before.assignmentHistory, true);
    assert.equal(result.impacts.representativeReplays.status, 'complete');
    assert.equal(result.impacts.representativeReplays.resources.inventory.requiredCases, 72 * (companionStores.length + 1));
    assert.equal(result.impacts.unknownOwners.status, 'complete');
    assert.equal(result.impacts.reach.status, 'incomplete');
    const unknown = result.impacts.unknownOwners;
    assert.deepEqual(unknown.retained.map(row => row.ref.id).sort(),
      ['D-000001', 'D-000003', ...(companionStores.includes('knowledge') ? ['K-000005'] : [])].sort());
    for (const id of ['D-000001', 'D-000003']) {
      const row = unknown.retained.find(row => row.ref.id === id);
      assert.notEqual(row.beforeCapture.sha256, row.afterCapture.sha256);
    }
    assert.equal(unknown.created.length, 1);
    assert.deepEqual(unknown.created[0].ref, f.rows[0].canonicalRef);
    assert.equal(unknown.created[0].eventId, f.event.event);
    assert.equal(unknown.created[0].afterCapture.sha256, captured(f, 'candidate', f.authorizerFile).locator.sha256);
    const before = captured(f, 'before', f.authorizerFile); const after = captured(f, 'candidate', f.authorizerFile);
    const afterRecords = load(after.bytes.toString()).entries;
    assert.deepEqual(afterRecords.find(row => row.id === 'D-000001'), f.authorizer);
    for (const retained of f.retainedDecisions) assert.deepEqual(afterRecords.find(row => row.id === retained.id), retained);
    assert.deepEqual(afterRecords.find(row => row.id === 'D-000002').subjects, []);
    assert.equal(Object.hasOwn(afterRecords.find(row => row.id === 'D-000003'), 'subjects'), false);
    assert.ok(before.bytes.includes(Buffer.from(JSON.stringify(f.authorizer))));
    assert.ok(after.bytes.includes(Buffer.from(JSON.stringify(f.authorizer))));
    assert.equal(before.mode, after.mode);
    for (const file of ['subjects/registry.yaml', `subjects/_assignments/${f.priorEvent.event}.yaml`]) {
      assert.deepEqual(captured(f, 'candidate', file).bytes, captured(f, 'before', file).bytes);
    }
    const baseline = captured(f, 'candidate', 'subjects/_assignments/_baselines.yaml').bytes;
    assert.deepEqual(baseline.subarray(0, Buffer.byteLength(f.baselineBefore)), Buffer.from(f.baselineBefore));
    for (const [index, row] of f.event.rows.entries()) {
      assert.equal(row.before, null); assert.equal(row['before-capture'], null); assert.equal(row['before-revision'], null);
      assert.equal(row['after-revision'], 0); assert.equal(row.disposition, 'created');
      const eligibility = result.assignment.rows.find(item => item.ref.id === row.ref.id).eligibility;
      assert.equal(eligibility.before, null);
      assert.deepEqual(eligibility.changes.newEffective, f.sources[index].record.subjects ?? []);
    }
    if (format === 'sha1' && companionStores.length === 0) {
      assert.equal(f.priorRef.kind, 'decision'); assert.notEqual(f.priorRef.id, f.authorizer.id);
      const prior = await runPreparedAssignmentGate({ repoRoot: f.root, before: f.seed, candidate: f.before,
        eventId: f.priorEvent.event, selection: f.priorEvent.scope,
        reviewNote: { date: f.today, author: 'steward', skill: 'typed-classification' },
        decisionCaptures: f.evidence.decisionCaptures, limits: f.input.limits.assignments, impact: { required: [] } });
      assert.equal(prior.ok, true, details(prior));
    }
  });
}

test('D-only absent authority retains unknown and empty births with explicit impact inapplicability', async (t) => {
  const f = fixture(t, { companionStores: [], subjectAuthority: false, history: false, retainedDecisionOwners: true });
  const result = await runPreparedRecordPromotionGate(f.input);
  assertAccepted(f, result);
  assert.deepEqual(result.impacts.applicability, { kind: 'subject-registry-absent-both' });
  assert.deepEqual(result.impacts.required, []);
  for (const field of ['reach', 'subjectTree', 'representativeReplays', 'unknownOwners']) assert.equal(result.impacts[field], null);
  assert.deepEqual(f.event.rows.map(row => row.after), [{ state: 'unknown', reason: 'absent' }, { state: 'known', ids: [] }, { state: 'known', ids: [] }]);
});

test('D selected preflight IDs retain authored promotion order independently of sorted allocation output', async (t) => {
  const f = fixture(t);
  f.input.promotion.rows = [...f.rows].reverse();
  const result = await runPreparedRecordPromotionGate(f.input);
  assertAccepted(f, result);
  assert.deepEqual(result.promotion.createdRefs, f.rows.map(row => row.canonicalRef));
});

test('D preflight exception rejects invented evidence, dates, owners and broad skipped-check claims', async (t) => {
  const f = fixture(t);
  const result = await runPreparedRecordPromotionGate(f.input);
  assertAccepted(f, result);
  const selectedRefs = f.input.promotion.rows.map(({ canonicalRef }) => canonicalRef);
  assert.equal(typedPromotionPreflightSatisfied(result, selectedRefs), true);
  assert.equal(typedPromotionPreflightSatisfied(result), false);
  for (const refs of [[], [...selectedRefs].reverse(), [...selectedRefs, selectedRefs[0]],
    selectedRefs.map(ref => ({ ...ref, namespace: '99999999-9999-4999-8999-999999999999' }))]) {
    assert.equal(typedPromotionPreflightSatisfied(result, refs), false);
  }
  for (const mutate of [
    value => { value.preflight.today = f.today; },
    value => { value.preflight.result = { payload: { verdict: 'trusted' }, exitCode: 0 }; },
    value => { value.preflight.status = 'not-performed'; },
    value => { value.checks.preflight.status = 'passed'; },
    value => { value.preflight.selectedIds.pop(); },
    value => { value.preflight.selectedIds[0] = 'D-999999'; },
    value => { value.promotion.createdRefs = []; value.preflight.selectedIds = []; },
    value => { value.promotion.createdRefs[0].kind = 'knowledge'; },
    value => { value.promotion.createdRefs.push(structuredClone(value.promotion.createdRefs[0])); },
    value => { value.promotion.createdRefs[0].namespace = '99999999-9999-4999-8999-999999999999'; },
    value => { value.preflight.selectedIds.reverse(); },
    value => { value.preflight.applicability = 'caller-supplied'; },
    value => { value.recordKind = 'knowledge'; value.preflight.recordKind = 'knowledge'; },
    value => { value.recordKind = 'ontology'; value.preflight.recordKind = 'ontology'; },
  ]) {
    const invalid = structuredClone(result); mutate(invalid);
    assert.equal(typedPromotionPreflightSatisfied(invalid, selectedRefs), false);
  }
});

test('D admission rejects earlier policy, wrong targets, mixed refs and malformed fresh identity', async (t) => {
  const f = fixture(t);
  for (const mutate of [
    input => { input.impact.policy = 'typed-record-promotion-v2'; },
    input => { input.promotion.rows[0].targetLifecycle = 'addressed'; },
    input => { input.promotion.rows[0].canonicalRef.kind = 'knowledge'; },
    input => { input.promotion.rows[0].canonicalRef.id = 'D-000000'; },
    input => { input.promotion.rows[0].canonicalRef.id = 'D-002'; },
    input => { input.version = 2; },
  ]) {
    const input = copy(f.input); input.repoRoot = '/must-not-read'; mutate(input);
    const result = await runPreparedRecordPromotionGate(input);
    assert.equal(result.ok, false); assert.equal(result.checks.admission.status, 'failed'); assert.equal(result.assignment, null);
  }
});

for (const status of ['draft', 'accepted', 'addressed', 'rejected']) test(`D source ${status} cannot replace proposed source eligibility`, async (t) => {
  const f = fixture(t, { editDecisionSource: ({ sources }) => { sources[0].record.status = status; } });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, false, details(result));
  assert.equal(result.preflight.status, 'not-performed');
  assert.equal(result.impacts.representativeReplays, null);
  if (['accepted', 'addressed'].includes(status)) {
    const source = result.assignment.diagnostics.find(row => row.code === 'assignment-model-unavailable');
    assert.equal(source.side, 'before');
    assert.ok(source.diagnostics.some(row => row.code === 'proposal-lifecycle' && row.path === 'entries[1].id'));
  } else if (status === 'rejected') {
    assert.ok(result.promotion.diagnostics.some(row => row.code === 'promotion-lifecycle-refused'), details(result));
  }
});

test('D selected references rewrite together while an unselected Decision reference refuses', async (t) => {
  const selected = fixture(t, { editDecisionSource: ({ sources }) => {
    sources[0].record['relates-to'] = { ...sources[0].record['relates-to'], decisions: [sources[1].record.id] };
  } });
  const positive = await runPreparedRecordPromotionGate(selected.input);
  assertAccepted(selected, positive);
  const records = load(captured(selected, 'candidate', selected.authorizerFile).bytes.toString()).entries;
  assert.deepEqual(records.find(row => row.id === selected.rows[0].canonicalRef.id)['relates-to'].decisions, [selected.rows[1].canonicalRef.id]);
  const outside = fixture(t, { retainedDecisionOwners: true, editDecisionSource: ({ retainedDecisions, sources }) => {
    retainedDecisions[0]['relates-to'] = { ...retainedDecisions[0]['relates-to'], decisions: [sources[1].record.id] };
  } });
  // Repair the candidate's dangling reference explicitly, outside selected owners.
  // Both models can then load, leaving P1 to refuse the unselected source ref.
  const unselected = outside.retainedDecisions[0];
  outside.put(outside.authorizerFile, outside.read(outside.authorizerFile).replace(JSON.stringify(unselected),
    JSON.stringify({ ...unselected, 'relates-to': { ...unselected['relates-to'], decisions: [outside.rows[1].canonicalRef.id] } })));
  outside.save();
  const refused = await runPreparedRecordPromotionGate(outside.input);
  assert.equal(refused.ok, false, details(refused));
  assert.ok(refused.promotion.diagnostics.some(row => row.code === 'promotion-reference-outside-scope'), details(refused));
});

test('D birth cannot retain a retired equivalent SID merely because the proposal carried it', async (t) => {
  const f = fixture(t, { retiredSubject: true });
  const result = await runPreparedRecordPromotionGate(f.input);
  assert.equal(result.ok, false, details(result));
  assert.equal(result.assignment.checks.eligibility.status, 'failed');
  const row = result.assignment.rows.find(row => row.ref.id === f.rows[2].canonicalRef.id);
  assert.deepEqual(row.eligibility.changes.newEffective, ['S-000001', 'S-000002']);
  assert.equal(row.eligibility.before, null);
  assert.equal(result.impacts.representativeReplays, null);
});

test('D identity and captured approval evidence remain actual source obligations', async (t) => {
  const f = fixture(t);
  for (const mutate of [
    input => { input.promotion.rows[0].canonicalRef.id = 'D-000001'; },
    input => { input.promotion.rows[0].canonicalRef.namespace = '99999999-9999-4999-8999-999999999999'; },
    input => { input.promotion.rows[0].beforeCapture.sha256 = '0'.repeat(64); },
    input => { input.before.tree = '0'.repeat(input.before.tree.length); },
    input => { input.evidence.decisionCaptures = []; },
    input => { input.evidence.decisionCaptures[0].bytes[0] ^= 1; },
  ]) {
    const input = copy(f.input); mutate(input);
    const result = await runPreparedRecordPromotionGate(input);
    assert.equal(result.ok, false, details(result));
    assert.equal(result.publicationReady, false);
    assert.equal(result.impacts.representativeReplays, null);
  }
});

test('D candidate evidence, authorizer, history and birth tampering refuse after actual recapture', async (t) => {
  for (const [name, mutate, save] of [
    ['selected reasoning', f => {
      const row = f.candidateRecords[0]; f.put(f.authorizerFile, f.read(f.authorizerFile).replace(JSON.stringify(row), JSON.stringify({ ...row, context: 'Unreviewed changed context' })));
    }, true],
    ['authorizer', f => f.put(f.authorizerFile, f.read(f.authorizerFile).replace(JSON.stringify(f.authorizer), JSON.stringify({ ...f.authorizer, decision: 'Unreviewed replacement approval' }))), true],
    ['retained empty becomes unknown', f => {
      const { subjects, ...unknown } = f.retainedDecisions[0];
      f.put(f.authorizerFile, f.read(f.authorizerFile).replace(JSON.stringify(f.retainedDecisions[0]), JSON.stringify(unknown)));
    }, true],
    ['retained unknown becomes empty', f => f.put(f.authorizerFile,
      f.read(f.authorizerFile).replace(JSON.stringify(f.retainedDecisions[1]), JSON.stringify({ ...f.retainedDecisions[1], subjects: [] }))), true],
    ['old event bytes', f => f.put(`subjects/_assignments/${f.priorEvent.event}.yaml`, f.read(`subjects/_assignments/${f.priorEvent.event}.yaml`) + '\n# altered retained event\n'), false],
    ['baseline prefix', f => f.put('subjects/_assignments/_baselines.yaml', JSON.stringify(f.baseline)), false],
    ['registry bytes', f => f.put('subjects/registry.yaml', f.read('subjects/registry.yaml') + '\n# altered authority\n'), false],
    ['extra path', f => f.put('outside.txt', 'Not part of reviewed creation\n'), false],
    ['invented prior birth state', f => { f.event.rows[0].before = { state: 'unknown', reason: 'absent' }; }, true],
    ['birth revision', f => { f.event.rows[0]['after-revision'] = 1; }, true],
    ['extra birth row', f => { f.event.rows.push(structuredClone(f.event.rows[0])); }, false],
  ]) {
    const f = fixture(t, { companionStores: [], retainedDecisionOwners: true });
    mutate(f);
    if (save) f.save();
    else {
      if (name === 'extra birth row') {
        // Leave the existing event seal inconsistent: it cannot authorize extra scope.
        f.put(`subjects/_assignments/${f.event.event}.yaml`, f.event);
      }
      commitCandidate(f, name);
    }
    const result = await runPreparedRecordPromotionGate(f.input);
    assert.equal(result.ok, false, `${name}: ${details(result)}`);
    assert.equal(result.impacts.representativeReplays, null);
  }
});

test('D shared-file capture and complete replay reservation respect exact and one-short capacities', async (t) => {
  const f = fixture(t, { companionStores: [], retainedDecisionOwners: true });
  const baseline = await runPreparedRecordPromotionGate(f.input);
  assertAccepted(f, baseline);
  const fit = copy(f.input);
  fit.limits.assignments.maxRecords = f.rows.length;
  fit.limits.assignments.maxCaptureBytes = baseline.assignment.used.captureBytes;
  fit.limits.replays.maxCases = baseline.impacts.representativeReplays.resources.inventory.requiredCases;
  fit.limits.replays.maxInventoryBytes = baseline.impacts.representativeReplays.resources.inventory.bytes;
  assert.equal((await runPreparedRecordPromotionGate(fit)).ok, true);
  for (const [group, field, value] of [
    ['assignments', 'maxRecords', 2], ['assignments', 'maxCaptureBytes', fit.limits.assignments.maxCaptureBytes - 1],
    ['replays', 'maxCases', fit.limits.replays.maxCases - 1], ['replays', 'maxInventoryBytes', fit.limits.replays.maxInventoryBytes - 1],
    ['governance', 'maxCaptureBytes', 0], ['reach', 'maxRecords', 0], ['tree', 'maxBytes', 0],
  ]) {
    const input = copy(f.input); input.limits[group][field] = value;
    const result = await runPreparedRecordPromotionGate(input);
    assert.equal(result.ok, false, `${group}.${field}: ${details(result)}`);
    if (field === 'maxCases') assert.equal(result.impacts.representativeReplays.comparison, null);
    if (field === 'maxInventoryBytes') {
      assert.equal(result.impacts.representativeReplays.comparison.resources.queries.calls, 0);
      assert.equal(result.impacts.representativeReplays.comparison.coverage.reservationComplete, false);
    }
  }
});
