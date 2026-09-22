import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAssignmentHistory, ASSIGNMENT_HISTORY_DIAGNOSTIC_CODES } from '../payload/engine/lib/assignment-history-reader.js';
import { assignmentEventFixture, sealAssignmentEvent } from './helpers/assignment-event-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { assignmentCandidateDigest } from '../payload/engine/lib/assignment-event.js';

test('candidate digest uses the literal ratified after-capture key and qualified ordering', () => {
  const a = { ref: { namespace: 'a', kind: 'knowledge', id: 'K-000001' }, 'after-capture': { file: 'a', blob: 'b', sha256: 'c' } };
  const b = { ref: { namespace: 'a', kind: 'knowledge', id: 'K-000002' }, 'after-capture': { file: 'd', blob: 'e', sha256: 'f' } };
  assert.equal(assignmentCandidateDigest([b, a]), canonicalSha256([
    { ref: { namespace: 'a', kind: 'knowledge', id: 'K-000001' }, 'after-capture': { file: 'a', blob: 'b', sha256: 'c' } },
    { ref: { namespace: 'a', kind: 'knowledge', id: 'K-000002' }, 'after-capture': { file: 'd', blob: 'e', sha256: 'f' } },
  ]));
});

const namespace = '12345678-1234-4123-8123-123456789abc';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ref = (kind = 'knowledge', id = 'K-000001') => ({ namespace, kind, id });
const known = (ids = []) => ({ state: 'known', ids });
const unknown = { state: 'unknown', reason: 'absent' };
const capture = { file: 'knowledge/one.md', blob: 'a'.repeat(40), sha256: 'b'.repeat(64),
  source: { commit: 'c'.repeat(40), tree: 'd'.repeat(40) } };
const baseline = (recordRef = ref(), state = unknown) => ({ ref: recordRef, state, capture });
const document = (baselines = [baseline()]) => ({ 'schema-version': 1, namespace, baselines });
const event = (id = 1, before = unknown, after = known(), beforeRevision = 0, changed = true) => assignmentEventFixture({
  event: uuid(id), namespace,
  rows: [{ ref: ref(), before, after, 'before-revision': beforeRevision,
    'after-revision': beforeRevision + Number(changed), disposition: changed ? 'changed' : 'unchanged', reason: 'Reviewed assignment.' }],
});
const directory = 'subjects/_assignments';
const manifest = `${directory}/_baselines.yaml`;
function kit(t) {
  const kitDir = mkdtempSync(join(tmpdir(), 'assignment-history-reader-'));
  t.after(() => rmSync(kitDir, { recursive: true, force: true }));
  return { kitDir, identity: { 'schema-version': 1, 'identity-format': 1, namespace,
    allocations: [ref(), ref('ontology', 'O-000001'), ref('decision', 'D-000001')].map(({ kind, id }) => ({
      kind, id, state: 'allocated', publication: { id: uuid(40), review: 'fixture:review' },
    })) } };
}
function write(input, value, file = manifest) {
  mkdirSync(join(input.kitDir, directory), { recursive: true });
  writeFileSync(join(input.kitDir, file), typeof value === 'string' ? value : JSON.stringify(value));
}
const writeEvent = (input, value, filename = value.event) => write(input, sealAssignmentEvent(value), `${directory}/${filename}.yaml`);
function valid(result) {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.present, true);
  return result.assignmentHistory;
}
function rejects(input, code) {
  const result = readAssignmentHistory(input);
  assert.equal(result.ok, false);
  assert.equal(result.present, true);
  assert.equal(result.assignmentHistory, undefined);
  assert.ok(result.diagnostics.length > 0);
  if (code) assert.ok(result.diagnostics.some((d) => d.code === code), JSON.stringify(result.diagnostics));
  assert.ok(result.diagnostics.every((d) => d.severity === 'error' && typeof d.file === 'string'
    && typeof d.path === 'string' && ASSIGNMENT_HISTORY_DIAGNOSTIC_CODES.includes(d.code)));
  return result;
}

test('absent capability differs from explicitly present empty tracked history', (t) => {
  const input = kit(t);
  const absent = readAssignmentHistory({ kitDir: input.kitDir });
  assert.equal(absent.ok, true);
  assert.equal(absent.present, false);
  assert.equal(absent.assignmentHistory, undefined);
  mkdirSync(join(input.kitDir, 'subjects/derived'), { recursive: true });
  writeFileSync(join(input.kitDir, 'subjects/derived/events.yaml'), 'invalid: [');
  assert.equal(readAssignmentHistory(input).present, false);
  write(input, document([]));
  const history = valid(readAssignmentHistory(input));
  assert.deepEqual(history.baselines, []);
  assert.deepEqual(history.events, []);
  assert.deepEqual(history.revisions, []);
});

test('actual disk reader replays revisions independently of filename order and preserves authored arrays', (t) => {
  const input = kit(t);
  const two = known(['S-000002', 'S-000001']);
  write(input, document());
  writeEvent(input, event(9));
  writeEvent(input, event(3, known(), two, 1));
  const review = event(1, two, known(['S-000001', 'S-000002']), 2, false);
  writeEvent(input, review);
  const raw = readFileSync(join(input.kitDir, `${directory}/${uuid(3)}.yaml`));
  const history = valid(readAssignmentHistory(input));
  assert.deepEqual(history.revisions, [{ ref: ref(), revision: 2, state: known(['S-000001', 'S-000002']) }]);
  assert.deepEqual(history.events.find((item) => item.event === uuid(3)).rows[0].after.ids, ['S-000002', 'S-000001']);
  assert.deepEqual(history.sources.events[0], { file: `${directory}/${uuid(1)}.yaml`, document: review });
  assert.deepEqual(readFileSync(join(input.kitDir, `${directory}/${uuid(3)}.yaml`)), raw);
});

test('successful parsing exposes each unperformed proof instead of approving history', (t) => {
  const input = kit(t); write(input, document());
  const history = valid(readAssignmentHistory(input));
  assert.equal(history.mode, 'history-source');
  assert.equal(history.chainCheck, 'passed');
  for (const field of ['currentStateCheck', 'captureVerification', 'eventScopeCheck', 'approvalCheck']) {
    assert.equal(history[field], 'not-performed');
  }
  assert.equal(history.publicationReady, false);
  assert.deepEqual(history.sources.baselines, { file: manifest, document: document() });
});

test('allocated, retired and cancelled occupancy remains explicit without requiring live payloads', (t) => {
  const input = kit(t);
  input.identity.allocations[1] = { ...input.identity.allocations[1], state: 'retired', reason: 'Retained historical identity.' };
  input.identity.allocations[2] = { ...input.identity.allocations[2], state: 'cancelled', reason: 'Cancelled publication.' };
  write(input, document([baseline(), baseline(ref('ontology', 'O-000001'), known()), baseline(ref('decision', 'D-000001'), known(['S-000002']))]));
  const history = valid(readAssignmentHistory(input));
  assert.deepEqual(history.occupancy.map((row) => [row.ref.kind, row.state]),
    [['decision', 'cancelled'], ['knowledge', 'allocated'], ['ontology', 'retired']]);
  assert.equal(history.revisions.length, 3);
});

test('present authority without baseline manifest or with unexpected filenames refuses', (t) => {
  const input = kit(t);
  mkdirSync(join(input.kitDir, directory), { recursive: true });
  rejects(input, 'assignment-history-missing-baselines');
  write(input, document());
  write(input, 'ignored: false', `${directory}/extra.yaml`);
  rejects(input, 'assignment-history-unexpected-entry');
});

test('malformed YAML, multiple documents, unknown fields and unsupported versions refuse', (t) => {
  const input = kit(t);
  for (const value of ['baselines: [', '---\nbaselines: []\n---\nbaselines: []',
    { ...document(), 'schema-version': 2 }, { ...document(), baselines: null },
    { ...document(), ignored: true }, { ...document(), namespace: 'bad' }]) {
    write(input, value); rejects(input);
  }
});

test('filename UUID, wire spelling and exact row/ref properties are enforced', (t) => {
  const input = kit(t); write(input, document());
  writeEvent(input, event(), uuid(2));
  rejects(input, 'assignment-history-event-name');
  rmSync(join(input.kitDir, `${directory}/${uuid(2)}.yaml`));
  for (const mutate of [
    (e) => { e.beforeInputRef = 'obsolete'; },
    (e) => { e.rows[0].beforeRevision = 0; },
    (e) => { e.rows[0].ref.alias = 'K-000001'; },
    (e) => { e.rows[0].reason = ' '; },
    (e) => { e.rows = []; },
    (e) => { e.rows[0]['after-revision'] = Number.MAX_SAFE_INTEGER + 1; },
  ]) {
    const value = event(); mutate(value); writeEvent(input, value); rejects(input);
  }
});

test('invalid ledger, wrong namespace, proposal and unallocated owner refs refuse', (t) => {
  const input = kit(t); write(input, document());
  rejects({ ...input, identity: null }, 'assignment-history-identity');
  rejects({ ...input, identity: { ...input.identity, allocations: [] } }, 'assignment-history-unallocated');
  for (const recordRef of [ref('knowledge', `proposal:knowledge:${uuid(1)}`), ref('ontology', 'K-000001'),
    { ...ref(), namespace: uuid(99) }, { ...ref(), extra: true }]) {
    write(input, document([baseline(recordRef)])); rejects(input);
  }
  write(input, { ...document(), namespace: uuid(99) });
  rejects(input, 'assignment-history-namespace');
});

test('missing and duplicate baselines or rows cannot disappear during indexing', (t) => {
  const input = kit(t);
  write(input, document([])); writeEvent(input, event()); rejects(input, 'missing-baseline');
  write(input, document([baseline(), baseline()])); rejects(input, 'duplicate-baseline');
  write(input, document());
  const value = event(); value.rows.push(structuredClone(value.rows[0])); writeEvent(input, value);
  rejects(input, 'duplicate-row');
});

test('forked, stale and gapped chains fail with exact source file paths', (t) => {
  const input = kit(t); write(input, document()); writeEvent(input, event(1));
  writeEvent(input, event(2, unknown, known(['S-000001'])));
  const fork = rejects(input, 'history-fork');
  assert.equal(fork.diagnostics.find((d) => d.code === 'history-fork').file, `${directory}/${uuid(2)}.yaml`);
  assert.equal(fork.diagnostics.find((d) => d.code === 'history-fork').path, 'rows[0]');
  writeEvent(input, event(2, known(['S-000002']), known(['S-000001']), 1)); rejects(input, 'stale-before');
  writeEvent(input, event(2, known(), known(['S-000001']), 2)); rejects(input, 'history-gap');
});

test('state conditionals and capture relationships use actual domain checks', (t) => {
  const input = kit(t);
  for (const state of [{ state: 'unknown', ids: [] }, { state: 'unknown', reason: 'unavailable' },
    { state: 'known' }, known(['S-000001', 'S-000001']), known(['S-000000'])]) {
    write(input, document([baseline(ref(), state)])); rejects(input);
  }
  for (const value of [{ ...capture, file: '../escape' }, { ...capture, source: { commit: 'c'.repeat(64), tree: 'd'.repeat(64) } }]) {
    write(input, document([{ ...baseline(), capture: value }])); rejects(input, 'invalid-capture');
  }
});

test('symlinked authority directories or source files are errors rather than followed evidence', (t) => {
  const input = kit(t);
  mkdirSync(join(input.kitDir, 'actual'), { recursive: true });
  symlinkSync('actual', join(input.kitDir, 'subjects'));
  rejects(input, 'assignment-history-read-error');
  rmSync(join(input.kitDir, 'subjects'));
  mkdirSync(join(input.kitDir, 'subjects'));
  symlinkSync('../actual', join(input.kitDir, directory));
  rejects(input, 'assignment-history-read-error');
  rmSync(join(input.kitDir, directory));
  write(input, document());
  writeFileSync(join(input.kitDir, 'target.yaml'), JSON.stringify(document()));
  rmSync(join(input.kitDir, manifest));
  symlinkSync('../../target.yaml', join(input.kitDir, manifest));
  rejects(input, 'assignment-history-read-error');
});

test('native YAML scalars retain types and duplicate keys are refused', (t) => {
  const input = kit(t);
  write(input, `schema-version: 1\nnamespace: ${namespace}\nbaselines: []\n`);
  assert.deepEqual(valid(readAssignmentHistory(input)).revisions, []);
  write(input, `schema-version: 1\nnamespace: ${namespace}\nbaselines: []\nbaselines: []\n`);
  rejects(input, 'assignment-history-parse-error');
  write(input, `schema-version: '1'\nnamespace: ${namespace}\nbaselines: []\n`);
  rejects(input, 'invalid-schema-version');
});

test('nonregular named events and invalid UTF-8 never become readable history', (t) => {
  const input = kit(t); write(input, document());
  const file = `${directory}/${uuid(1)}.yaml`;
  mkdirSync(join(input.kitDir, file));
  rejects(input, 'assignment-history-read-error');
  rmSync(join(input.kitDir, file), { recursive: true });
  writeFileSync(join(input.kitDir, file), Buffer.from([0xff, 0xfe, 0x00]));
  rejects(input, 'assignment-history-read-error');
});

test('failed source diagnostics are stable and never expose a valid partial event set', (t) => {
  const input = kit(t); write(input, document());
  const later = event(9); later.rows[0].reason = null;
  const earlier = event(1); earlier.rows[0].ref.extra = true;
  writeEvent(input, later); writeEvent(input, earlier);
  const result = rejects(input);
  assert.deepEqual(result.diagnostics.map((item) => item.file),
    [`${directory}/${uuid(1)}.yaml`, `${directory}/${uuid(9)}.yaml`]);
  assert.deepEqual(readAssignmentHistory(input), result);
});

test('current record drift and unavailable baseline bytes stay explicitly unchecked', (t) => {
  const input = kit(t);
  write(input, document([baseline(ref(), known(['S-000001']))]));
  mkdirSync(join(input.kitDir, 'knowledge'));
  writeFileSync(join(input.kitDir, 'knowledge/one.md'), '---\nid: K-000001\nsubjects: [S-000002]\n---\nDifferent current payload.\n');
  const history = valid(readAssignmentHistory(input));
  assert.deepEqual(history.revisions[0].state, known(['S-000001']));
  assert.equal(history.currentStateCheck, 'not-performed');
  assert.equal(history.captureVerification, 'not-performed');
  assert.equal(history.publicationReady, false);
});

test('final event metadata binds its full body and exact after-capture manifest', (t) => {
  const input = kit(t); write(input, document());
  const value = event();
  value.rows[0].reason = 'An altered justification after review.';
  write(input, value, `${directory}/${value.event}.yaml`);
  rejects(input, 'assignment-event-change-digest');
  const changedCapture = event();
  changedCapture.rows[0]['after-capture'].sha256 = '0'.repeat(64);
  write(input, changedCapture, `${directory}/${changedCapture.event}.yaml`);
  rejects(input, 'assignment-event-candidate-digest');
});

test('tree-only or inconsistent source metadata cannot impersonate committed before evidence', (t) => {
  const input = kit(t); write(input, document());
  for (const mutate of [
    (e) => { delete e['before-input'].commit; },
    (e) => { e['before-input']['kit-path'] = '../outside'; },
    (e) => { e.rows[0]['before-capture'].source.commit = '0'.repeat(40); },
    (e) => { e.rows[0]['after-capture'].source = { commit: '0'.repeat(40), tree: '1'.repeat(40) }; },
    (e) => { e.review['decision-capture'].file = '/absolute'; },
    (e) => { e.decision.kind = 'knowledge'; e.decision.id = 'K-000001'; },
    (e) => { e.scope.values = ['design-system', 'design-system']; },
    (e) => { e.scope.values = ['design//system']; },
  ]) {
    const value = event(); mutate(value); writeEvent(input, value); rejects(input);
  }
});

test('old provisional opaque-reference wire is refused rather than silently approved', (t) => {
  const input = kit(t); write(input, document());
  const value = event();
  for (const field of ['before-input', 'candidate-records-digest', 'scope', 'decision', 'review']) delete value[field];
  value['before-input-ref'] = 'opaque:before';
  value['candidate-input-ref'] = 'opaque:after';
  write(input, value, `${directory}/${value.event}.yaml`);
  rejects(input);
});
