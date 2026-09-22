import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assignmentEventFixture, sealAssignmentEvent } from './helpers/assignment-event-fixture.js';
import { validateAssignmentEventMetadata, assignmentEventProjection } from '../payload/engine/lib/assignment-event.js';
import { validateAssignmentHistoryChain, validateBaselineTransition } from '../payload/engine/lib/subject-history.js';
import { readAssignmentHistory } from '../payload/engine/lib/assignment-history-reader.js';

const namespace = '12345678-1234-4123-8123-123456789abc';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ref = (kind, id) => ({ namespace, kind, id });
const known = (ids = []) => ({ state: 'known', ids });
const unknown = { state: 'unknown', reason: 'absent' };
function genesis() {
  const value = assignmentEventFixture({ namespace, event: uuid(1), rows: [
    { ref: ref('knowledge', 'K-000001'), before: known(), after: known(['S-000001']), 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Create reviewed Knowledge.' },
    { ref: ref('ontology', 'O-000001'), before: known(), after: unknown, 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Create with optional classification absent.' },
  ] });
  value['schema-version'] = 2; value.operation = 'canonical-creation';
  value.scope = { kind: 'typed-records', refs: value.rows.map(({ ref }) => ref) };
  for (const row of value.rows) Object.assign(row, { before: null, 'before-capture': null, 'before-revision': null,
    'after-revision': 0, disposition: 'created' });
  const event = sealAssignmentEvent(value);
  const baselines = event.rows.map((row) => ({ ref: row.ref, state: row.after, capture: row['after-capture'], origin: { kind: 'creation', event: event.event } }));
  return { event, baselines };
}
const check = (g, events = [g.event]) => validateAssignmentHistoryChain({ namespace, baselines: g.baselines,
  events: events.map(assignmentEventProjection) });

test('one creation event seeds distinct owners at revision zero with exact known/unknown after state', () => {
  const g = genesis();
  assert.equal(validateAssignmentEventMetadata(g.event).ok, true);
  const result = check(g);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.revisions, [
    { ref: ref('knowledge', 'K-000001'), revision: 0, state: known(['S-000001']) },
    { ref: ref('ontology', 'O-000001'), revision: 0, state: { state: 'unknown' } },
  ]);
  const projected = assignmentEventProjection(g.event);
  assert.equal(projected.operation, 'canonical-creation');
  assert.equal(projected.rows[0].before, null);
  assert.equal(projected.rows[0].beforeCapture, null);
  assert.deepEqual(projected.rows[0].afterCapture, g.baselines[0].capture);
});

test('later ordinary changes replay from immutable birth state without an invented prior revision', () => {
  const g = genesis();
  const next = assignmentEventFixture({ namespace, event: uuid(2), rows: [
    { ref: ref('ontology', 'O-000001'), before: unknown, after: known(), 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Explicitly record no assignment.' },
  ] });
  next['schema-version'] = 2; next.operation = 'existing-subjects'; next.scope = { kind: 'typed-records', refs: [next.rows[0].ref] };
  const result = check(g, [sealAssignmentEvent(next), g.event]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.revisions[1], { ref: next.rows[0].ref, revision: 1, state: known() });
});

test('own malformed/null/unrecognized origin never falls back to ordinary adoption', () => {
  for (const origin of [null, {}, { kind: 'adoption', event: uuid(1) }, { kind: 'creation', event: uuid(1), extra: true },
    { kind: 'creation', event: 'not-a-uuid' }]) {
    const g = genesis(); g.baselines[0].origin = origin;
    assert.equal(check(g).ok, false, JSON.stringify(origin));
  }
});

test('creation requires a unique exact origin event/ref/state/content capture binding', () => {
  for (const change of [
    (g) => { g.baselines[0].origin.event = uuid(99); },
    (g) => { delete g.baselines[0].origin; },
    (g) => { g.baselines[0].capture = { ...g.baselines[0].capture, sha256: '1'.repeat(64) }; },
    (g) => { g.baselines[0].capture = { ...g.baselines[0].capture, source: { commit: 'c'.repeat(40), tree: 'd'.repeat(40) } }; },
    (g) => { g.baselines[0].state = known(); },
    (g) => { g.event.rows[0].ref = ref('knowledge', 'K-000002'); },
    (g) => { g.event['schema-version'] = 1; },
    (g) => { g.event.operation = 'existing-subjects'; },
  ]) {
    const g = genesis(); change(g); assert.equal(check(g).ok, false);
  }
  const g = genesis();
  assert.equal(check(g, []).ok, false);
  assert.equal(check(g, [g.event, g.event]).ok, false);
});

test('created rows require the whole null-before tuple and revision zero, never unknown-before or unchanged', () => {
  for (const changes of [{ before: unknown }, { 'before-revision': 0 }, { 'after-revision': 1 }, { disposition: 'unchanged' },
    { 'before-capture': { file: 'fake', blob: 'a'.repeat(40), sha256: 'b'.repeat(64) } }]) {
    const g = genesis(); Object.assign(g.event.rows[0], changes);
    assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent(g.event)).ok, false);
    assert.equal(check(g).ok, false);
  }
});

test('birth origin and capture cannot be removed, changed or reset during baseline transition', () => {
  const g = genesis();
  assert.equal(validateBaselineTransition({ namespace, before: g.baselines, after: structuredClone(g.baselines) }).ok, true);
  for (const change of [(b) => { delete b.origin; }, (b) => { b.origin.event = uuid(9); }, (b) => { b.capture.sha256 = '1'.repeat(64); }]) {
    const next = structuredClone(g.baselines); change(next[0]);
    assert.equal(validateBaselineTransition({ namespace, before: g.baselines, after: next }).ok, false);
  }
});

test('actual history reader accepts additive genesis tuples but still reports capture and approval unperformed', (t) => {
  const g = genesis();
  const kitDir = mkdtempSync(join(tmpdir(), 'assignment-genesis-'));
  t.after(() => rmSync(kitDir, { recursive: true, force: true }));
  const directory = join(kitDir, 'subjects/_assignments'); mkdirSync(directory, { recursive: true });
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace, allocations: g.event.rows.map(({ ref }) => ({
    kind: ref.kind, id: ref.id, state: 'allocated', publication: { id: uuid(9), review: 'review:creation' },
  })) };
  const baselineFile = join(directory, '_baselines.yaml');
  const save = () => writeFileSync(baselineFile, JSON.stringify({ 'schema-version': 1, namespace, baselines: g.baselines }));
  save(); writeFileSync(join(directory, `${g.event.event}.yaml`), JSON.stringify(g.event));
  const result = readAssignmentHistory({ kitDir, identity });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.assignmentHistory.revisions.length, 2);
  assert.equal(result.assignmentHistory.captureVerification, 'not-performed');
  assert.equal(result.assignmentHistory.approvalCheck, 'not-performed');
  assert.equal(result.assignmentHistory.publicationReady, false);
  g.baselines[0].origin = null; save();
  assert.equal(readAssignmentHistory({ kitDir, identity }).ok, false);
});

test('merge scope is a separate closed v2 tag retaining ordinary assignment chain semantics', () => {
  const g = genesis();
  const event = assignmentEventFixture({ namespace, event: uuid(3), rows: [
    { ref: ref('knowledge', 'K-000001'), before: known(['S-000001']), after: known(['S-000002']), 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Reviewed equivalent merge reassignment.' },
  ] });
  event['schema-version'] = 2; event.operation = 'subject-use-transition';
  event.scope = { kind: 'subject-use-transition', operation: uuid(4), action: 'merge-equivalent', survivor: 'S-000002', absorbed: ['S-000001'], 'registry-events': [uuid(5)] };
  const sealed = sealAssignmentEvent(event);
  assert.equal(validateAssignmentEventMetadata(sealed).ok, true);
  assert.equal(check(g, [g.event, sealed]).ok, true);
  for (const scope of [{ ...event.scope, extra: true }, { ...event.scope, survivor: 'S-000001' },
    { ...event.scope, absorbed: ['S-000001', 'S-000001'] }, { ...event.scope, 'registry-events': [] },
    { ...event.scope, action: 'union' }, { ...event.scope, operation: 'bad' }]) {
    assert.equal(validateAssignmentEventMetadata(sealAssignmentEvent({ ...event, scope })).ok, false);
  }
});
