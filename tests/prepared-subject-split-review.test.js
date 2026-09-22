/** Independent stage-one checks over real owner results; no allocator or publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { subjectSplitAssignmentFixture } from './helpers/subject-split-assignment-fixture.js';
import { sealAssignmentEvent } from './helpers/assignment-event-fixture.js';
import { runPreparedSubjectSplitGate } from '../payload/engine/lib/subject-split-gate.js';
import { subjectSplitInputWire } from '../payload/engine/lib/subject-split-input.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';
import { assignmentEventDigest } from '../payload/engine/lib/assignment-event.js';
import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';
import { isPreparedSubjectSplitReport, capturePreparedSubjectSplit } from '../payload/engine/lib/prepared-subject-split.js';

const captureLimits = { maxRegistryBytes: 1000000, maxIdentityBytes: 1000000, maxEventBytes: 1000000 };
const pair = descriptor => ({ commit: descriptor.commit, tree: descriptor.tree });
async function actual(t, options = {}) {
  const f = subjectSplitAssignmentFixture(t, options);
  const gate = await runPreparedSubjectSplitGate(f.input);
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  const wire = subjectSplitInputWire(f.input);
  const expected = { source: f.input.before, candidate: f.input.candidate };
  assert.equal(isPreparedSubjectSplitReport(gate, expected, wire), true, 'real owner must admit before adversarial changes');
  return { f, gate, wire, expected, objectFormat: options.objectFormat ?? 'sha1' };
}
const request = (a, root, gate = a.gate, wire = a.wire) => ({ root, ...a.expected, gate, gateInput: wire, captureLimits });
const resealWire = (gate, wire) => { gate.inputDigest = canonicalSha256(wire); gate.operation = structuredClone(wire.operation); };
const locator = (a, file, bytes) => ({ ...describeCandidateBytes({ file, bytes, objectFormat: a.objectFormat }), source: pair(a.expected.candidate) });
function resealEvent(a, gate, wire, event) {
  const sealed = sealAssignmentEvent(event); const bytes = Buffer.from(`${JSON.stringify(sealed)}\n`);
  const digest = assignmentEventDigest(sealed); const file = gate.sources.assignmentEvent.eventCapture.file;
  wire.operation.assignmentEvent.changeDigest = digest;
  resealWire(gate, wire);
  gate.sources.assignmentEvent.eventDigest = digest;
  gate.sources.assignmentEvent.eventCapture = locator(a, file, bytes);
  gate.assignments.eventSource.eventDigest = digest;
  return { file, bytes };
}

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  test(`original before pair cannot be omitted, duplicated or borrowed from an identical tree (${objectFormat})`, async t => {
    const a = await actual(t, { objectFormat, nested });
    const alternateCommit = a.f.git('commit-tree', a.expected.source.tree, '-p', a.expected.source.commit, '-m', 'independent identical-tree commit');
    assert.notEqual(alternateCommit, a.expected.source.commit);
    for (const [name, change] of [
      ['missing designated pair', wire => { wire.evidence.assessmentCaptures = []; }],
      ['duplicate designated pair', wire => { wire.evidence.assessmentCaptures.push(structuredClone(wire.evidence.assessmentCaptures[0])); }],
      ['both captures from different actual commit with identical tree', wire => {
        for (const kind of ['registry', 'identity']) wire.evidence.assessmentCaptures[0][kind].capture.source.commit = alternateCommit;
      }],
      ['only identity borrowed', wire => { wire.evidence.assessmentCaptures[0].identity.capture.source.commit = alternateCommit; }],
      ['wrong original identity path', wire => { wire.evidence.assessmentCaptures[0].identity.capture.file = 'other/_identity.yaml'; }],
    ]) await t.test(name, () => {
      const wire = structuredClone(a.wire); const gate = structuredClone(a.gate);
      change(wire); resealWire(gate, wire);
      assert.equal(isPreparedSubjectSplitReport(gate, a.expected, wire), false,
        'resealed input digest cannot replace exact original pair presence/source');
    });
    assert.equal(isPreparedSubjectSplitReport(a.gate, a.expected, a.wire), true);
  });
}

test('candidate-only capture validates native identity and modes from a Git-free verified snapshot', async t => {
  const a = await actual(t, { objectFormat: 'sha256', nested: true, candidateChange(h) {
    h.put('_identity.yaml', `# Independently authored noncanonical YAML bytes\n${h.read('_identity.yaml')}\n`);
  } });
  await withTreeSnapshot(a.f.root, a.expected.candidate.tree, async ({ root }) => {
    assert.equal(existsSync(join(root, '.git')), false, 'capture root is not the source repository');
    const captured = capturePreparedSubjectSplit(request(a, root));
    assert.deepEqual(Object.keys(captured).sort(), ['event', 'identity', 'registry']);
    assert.ok(captured.identity.toString().startsWith('# Independently authored'));
    assert.ok(Buffer.isBuffer(captured.registry) && Buffer.isBuffer(captured.event));
    const path = join(root, a.gate.sources.identityCapture.file);
    await t.test('stale native blob despite matching SHA256', () => {
      const gate = structuredClone(a.gate);
      gate.sources.identityCapture.blob = '0'.repeat(64);
      gate.allocation.candidate.capture.blob = '0'.repeat(64);
      assert.throws(() => capturePreparedSubjectSplit(request(a, root, gate)), /prepared subject split/);
    });
    await t.test('whole raw identity bytes including comments', () => {
      writeFileSync(path, Buffer.concat([captured.identity, Buffer.from('# another physical edit\n')]));
      try { assert.throws(() => capturePreparedSubjectSplit(request(a, root)), /prepared subject split/); }
      finally { writeFileSync(path, captured.identity); }
    });
    await t.test('actual identity mode differs from reported regular mode', () => {
      const mode = parseInt(a.gate.allocation.candidate.mode.slice(-3), 8);
      chmodSync(path, mode === 0o644 ? 0o755 : 0o644);
      try { assert.throws(() => capturePreparedSubjectSplit(request(a, root)), /prepared subject split/); }
      finally { chmodSync(path, mode); }
    });
    assert.deepEqual(capturePreparedSubjectSplit(request(a, root)), captured);
  });
});

test('resealed assignment bytes still require original mapping reasons, row order and full review tuple', async t => {
  const a = await actual(t);
  await withTreeSnapshot(a.f.root, a.expected.candidate.tree, async ({ root }) => {
    const file = a.gate.sources.assignmentEvent.eventCapture.file;
    const path = join(root, file); const original = readFileSync(path);
    for (const [name, change] of [
      ['mapping reason', event => { event.rows[0].reason = 'A different unreviewed mapping'; }],
      ['row order', event => { event.rows.reverse(); }],
      ['next revision', event => { event.rows[0]['after-revision'] += 1; }],
      ['Decision ref', event => { event.decision.id = 'D-000001'; }],
      ['review reference', event => { event.review.reference = 'review:unrelated'; }],
      ['accepted status', event => { event.review['accepted-status'] = 'addressed'; }],
      ['Decision digest', event => { event.review['decision-digest'] = '0'.repeat(64); }],
      ['Decision capture source', event => { event.review['decision-capture'].source.tree = a.expected.candidate.tree; }],
    ]) await t.test(name, () => {
      const gate = structuredClone(a.gate); const wire = structuredClone(a.wire); const event = load(original.toString());
      change(event);
      const changed = resealEvent(a, gate, wire, event);
      assert.equal(isPreparedSubjectSplitReport(gate, a.expected, wire), true,
        'raw row reasons/revisions/tuple are deliberately absent from the parsed owner-report DTO');
      writeFileSync(path, changed.bytes);
      try { assert.throws(() => capturePreparedSubjectSplit(request(a, root, gate, wire)), /prepared subject split/); }
      finally { writeFileSync(path, original); }
    });
    assert.deepEqual(capturePreparedSubjectSplit(request(a, root)).event, original);
  });
});

test('both raw registry event tuples and exact activation-to-split suffix are checked after capture resealing', async t => {
  const a = await actual(t);
  await withTreeSnapshot(a.f.root, a.expected.candidate.tree, async ({ root }) => {
    const file = a.gate.sources.registryCapture.file; const path = join(root, file); const original = readFileSync(path);
    for (const [name, change] of [
      ['activation reference only', document => { document.history.at(-2).review.reference = 'review:other-activation'; }],
      ['split reference only', document => { document.history.at(-1).review.reference = 'review:other-split'; }],
      ['reversed selected suffix', document => { const activation = document.history.at(-2); const split = document.history.at(-1); document.history.splice(-2, 2, split, activation); }],
      ['duplicated selected event', document => { document.history.push(structuredClone(document.history.at(-1))); }],
    ]) await t.test(name, () => {
      const gate = structuredClone(a.gate); const document = load(original.toString()); change(document);
      const bytes = Buffer.from(`${JSON.stringify(document)}\n`); const capture = locator(a, file, bytes);
      gate.sources.registryCapture = capture; gate.inventory.inputs.candidate.registryCapture = structuredClone(capture);
      assert.equal(isPreparedSubjectSplitReport(gate, a.expected, a.wire), true, 'a locator digest is not a raw event tuple check');
      writeFileSync(path, bytes);
      try { assert.throws(() => capturePreparedSubjectSplit(request(a, root, gate)), /prepared subject split/); }
      finally { writeFileSync(path, original); }
    });
  });
});

test('owner report cannot reseal a different ordered source substitution as successful P8 eligibility', async t => {
  const a = await actual(t);
  for (const [name, change] of [
    ['wrong candidate order', gate => { gate.assignments.rows.at(-1).eligibility.candidate.ids.reverse(); }],
    ['unknown before state', gate => { gate.assignments.rows[0].eligibility.before = { state: 'unknown', reason: 'absent' }; }],
    ['empty row report', gate => { gate.assignments.rows = []; }],
    ['permuted actual row refs', gate => { gate.assignments.rows.reverse(); }],
    ['failed selected preservation', gate => { gate.assignments.rows[0].preservation.ok = false; }],
    ['failed fixed row eligibility', gate => { gate.assignments.rows[0].eligibility.ok = false; }],
  ]) await t.test(name, () => {
    const gate = structuredClone(a.gate); change(gate);
    assert.equal(isPreparedSubjectSplitReport(gate, a.expected, a.wire), false);
  });
});
