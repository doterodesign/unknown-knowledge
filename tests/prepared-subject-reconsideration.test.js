import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparedReconsiderationFixture } from './helpers/prepared-reconsideration-fixture.js';
import { inspectSubjectReconsiderationGate } from '../payload/engine/lib/subject-reconsideration-gate.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { decodeSubjectReconsiderationInput } from '../payload/engine/lib/subject-reconsideration-input.js';
import { canonicalSha256, canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';
import { describeCandidateBytes } from '../payload/engine/lib/captured-source.js';
import { chmodSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const coreWire = ({ impact, ...wire }) => wire;
const captures = evidence => [...evidence.decisionCaptures,
  ...evidence.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]), ...evidence.materialCaptures];

test('actual healthy raw gate control precedes the fixed bounded wire owner', async t => {
  const f = preparedReconsiderationFixture(t);
  const raw = await inspectSubjectReconsiderationGate(f.rawInput);
  assert.equal(raw.ok, true, JSON.stringify(raw.diagnostics));
  assert.equal(raw.core.ownerPreservation.changedPaths.length, 2);
  assert.equal(raw.assignments, null);
  assert.equal(raw.core.allocation.proof.ids.length, 1);
  t.diagnostic('Actual raw gate, two changed paths and native one-Subject allocation control passed.');
  const { inspectSubjectReconsiderationGateFromWire } = await import('../payload/engine/lib/subject-reconsideration-gate.js');
  assert.equal(typeof inspectSubjectReconsiderationGateFromWire, 'function');
  const actual = await inspectSubjectReconsiderationGateFromWire({ repoRoot: f.repoRoot, gateInput: f.gateInput });
  assert.equal(actual.ok, true, JSON.stringify(actual.diagnostics));
  assert.equal(actual.inputDigest, raw.inputDigest);
  assert.deepEqual(actual.core.allocation, raw.core.allocation);
  assert.deepEqual(actual.impacts, raw.impacts);
});

test('wire admission reserves exactly once and reuses the admitted owned captures', t => {
  const f = preparedReconsiderationFixture(t);
  const total = captures(f.evidence).reduce((sum, row) => sum + row.bytes.length, 0);
  for (const short of [false, true]) {
    const wire = coreWire(structuredClone(f.gateInput));
    wire.limits.governance.maxCaptureBytes = total - Number(short);
    const budget = createSubjectValidationBudget(wire.limits.governance);
    const got = decodeSubjectReconsiderationInput(f.repoRoot, wire, { operationBudget: budget });
    assert.equal(got.ok, !short, JSON.stringify(got.diagnostics));
    if (short) {
      assert.equal(budget.failure.phase, 'reconsideration-input-wire-decode');
      assert.equal(got.diagnostics[0].code, 'subject-validation-budget');
    } else {
      assert.equal(budget.used.captureBytes, total);
      const first = got.input.evidence.decisionCaptures[0];
      assert.notEqual(first.bytes, f.evidence.decisionCaptures[0].bytes);
      assert.deepEqual(first.bytes, f.evidence.decisionCaptures[0].bytes);
      budget.admitCapture(first);
      assert.equal(budget.used.captureBytes, total);
      wire.evidence.decisionCaptures[0].capture.file = 'different';
      assert.notEqual(first.capture.file, 'different');
    }
  }
});

test('invalid or exhausted wire allowance refuses before input getters', t => {
  const f = preparedReconsiderationFixture(t);
  let reads = 0;
  const trap = Object.defineProperty({}, 'version', { enumerable: true, get() { reads++; throw Error('read'); } });
  const exhausted = createSubjectValidationBudget({ ...f.limits.governance, maxValidationSteps: 0 });
  assert.throws(() => exhausted.charge('validationSteps', 1, 'fixture-exhaustion'));
  for (const operationBudget of [undefined, {}, exhausted]) {
    const got = decodeSubjectReconsiderationInput(f.repoRoot, trap, { operationBudget });
    assert.equal(got.ok, false);
    assert.match(got.diagnostics[0].code, /subject-validation-budget/);
  }
  assert.equal(reads, 0);
});

test('actual wire success has a strict transport predicate and candidate-only captures', async t => {
  const f = preparedReconsiderationFixture(t, { objectFormat: 'sha256', nested: true });
  const { inspectSubjectReconsiderationGateFromWire } = await import('../payload/engine/lib/subject-reconsideration-gate.js');
  const gate = await inspectSubjectReconsiderationGateFromWire({ repoRoot: f.repoRoot, gateInput: f.gateInput });
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  const transport = await import('../payload/engine/lib/prepared-subject-reconsideration.js');
  const expected = { source: f.source, candidate: f.candidate };
  assert.equal(transport.isPreparedSubjectReconsiderationReport(gate, expected, f.gateInput), true);
  const capture = transport.capturePreparedSubjectReconsideration({ root: f.repoRoot, ...expected,
    gate, gateInput: f.gateInput, captureLimits: f.captureLimits });
  assert.deepEqual(Object.keys(capture), ['registry', 'identity']);
  assert.equal(capture.identity.length, f.captureLimits.maxIdentityBytes);
  assert.throws(() => transport.capturePreparedSubjectReconsideration({ root: f.repoRoot, ...expected,
    gate, gateInput: f.gateInput, captureLimits: { ...f.captureLimits, maxIdentityBytes: capture.identity.length - 1 } }),
  error => error.name === 'EngineRefusal');
  const identityPath = join(f.repoRoot, f.files.identity), originalMode = lstatSync(identityPath).mode & 0o777;
  try {
    chmodSync(identityPath, originalMode | 0o111);
    assert.throws(() => transport.capturePreparedSubjectReconsideration({ root: f.repoRoot, ...expected,
      gate, gateInput: f.gateInput, captureLimits: f.captureLimits }), error => error.code === 'reconsideration-capture-mode');
  } finally { chmodSync(identityPath, originalMode); }
  for (const mutate of [
    g => { g.resources.core.governance.used.captureBytes = 0; },
    g => { g.core.assignments = []; },
    g => { g.sources.identityCapture.mode = '100755'; },
    g => { g.core.allocation.proof.ids = ['S-000099']; },
    g => { g.impacts.replays.policy.id = 'split-replay-v1'; },
    g => { g.resources.closure.used.bytes = 0; },
    g => { g.resources.contexts.before.corpus = null; },
  ]) {
    const altered = structuredClone(gate); mutate(altered);
    assert.equal(transport.isPreparedSubjectReconsiderationReport(altered, expected, f.gateInput), false);
  }
  const badUsage = structuredClone(gate);
  badUsage.impacts.replays.resources.eligibility.attempted = -1;
  const { fingerprint, ...withoutFingerprint } = badUsage.impacts.replays;
  badUsage.impacts.replays.fingerprint = canonicalSha256(withoutFingerprint);
  assert.equal(transport.isPreparedSubjectReconsiderationReport(badUsage, expected, f.gateInput), false);
});

test('actual admission failure is retained but a substituted malformed partial core is not', async t => {
  const f = preparedReconsiderationFixture(t);
  f.gateInput.limits.governance.maxValidationSteps = 0;
  const { inspectSubjectReconsiderationGateFromWire } = await import('../payload/engine/lib/subject-reconsideration-gate.js');
  const { isPreparedSubjectReconsiderationReport: valid } = await import('../payload/engine/lib/prepared-subject-reconsideration.js');
  const gate = await inspectSubjectReconsiderationGateFromWire({ repoRoot: f.repoRoot, gateInput: f.gateInput });
  assert.equal(gate.ok, false);
  assert.equal(valid(gate, { source: f.source, candidate: f.candidate }, f.gateInput), true);
  const malformed = structuredClone(gate);
  malformed.core = { assignments: null, resources: malformed.resources.core };
  assert.equal(valid(malformed, { source: f.source, candidate: f.candidate }, f.gateInput), false);
});

test('new wire metadata admits only exact own-data dense capture families', t => {
  const f = preparedReconsiderationFixture(t);
  const decode = wire => decodeSubjectReconsiderationInput(f.repoRoot, wire,
    { operationBudget: createSubjectValidationBudget(f.limits.governance) });
  assert.equal(decode(coreWire(structuredClone(f.gateInput))).ok, true);
  const mutations = [
    w => { w.evidence.materialCaptures = undefined; },
    w => { w.evidence.materialCaptures = null; },
    w => { delete w.evidence.materialCaptures[0]; },
    w => { w.evidence.materialCaptures.extra = 1; },
    w => { w.evidence.materialCaptures.push(structuredClone(w.evidence.materialCaptures[0])); },
    w => { w.evidence.decisionCaptures[0].bytesBase64 += '\n'; },
    w => { w.evidence.decisionCaptures[0].capture.source.extra = true; },
    w => { Object.defineProperty(w.evidence.materialCaptures, '0', { enumerable: false }); },
    w => { w.operation.assignmentEvent = {}; },
    w => { w.operation.extra = true; },
  ];
  for (const mutate of mutations) {
    const wire = coreWire(structuredClone(f.gateInput)); mutate(wire);
    assert.equal(decode(wire).ok, false);
  }
  let reads = 0;
  const wire = coreWire(structuredClone(f.gateInput));
  Object.defineProperty(wire.evidence.materialCaptures[0].capture, 'file', { enumerable: true,
    get() { reads++; throw Error('must not execute'); } });
  assert.equal(decode(wire).ok, false);
  assert.equal(reads, 0);
});

test('large canonical wire captures decode once after exact reservation', t => {
  const f = preparedReconsiderationFixture(t), bytes = Buffer.alloc(4 * 1024 * 1024, 65);
  const wire = coreWire(structuredClone(f.gateInput));
  wire.evidence = { decisionCaptures: [], assessmentCaptures: [], materialCaptures: [{
    capture: describeCandidateBytes({ file: 'material.txt', bytes, objectFormat: 'sha1' }),
    objectFormat: 'sha1', bytesBase64: bytes.toString('base64') }] };
  wire.limits.governance.maxCaptureBytes = bytes.length;
  const budget = createSubjectValidationBudget(wire.limits.governance), original = Buffer.from;
  const encoded = wire.evidence.materialCaptures[0].bytesBase64;
  let decodes = 0;
  Buffer.from = function(value, ...args) {
    if (value === encoded && args[0] === 'base64') { decodes++; assert.equal(budget.used.captureBytes, bytes.length); }
    return original.call(Buffer, value, ...args);
  };
  try {
    const result = decodeSubjectReconsiderationInput(f.repoRoot, wire, { operationBudget: budget });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(decodes, 1);
    assert.deepEqual(result.input.evidence.materialCaptures[0].bytes, bytes);
    assert.equal(budget.used.captureBytes, bytes.length);
  } finally { Buffer.from = original; }
});

test('wire row admission bounds zero-byte metadata before trapped row inspection', t => {
  const f = preparedReconsiderationFixture(t), wire = coreWire(structuredClone(f.gateInput));
  wire.evidence = { decisionCaptures: [], assessmentCaptures: [], materialCaptures: Array(100).fill(null) };
  let reads = 0;
  Object.defineProperty(wire.evidence.materialCaptures, '0', { enumerable: true, get() { reads++; throw Error('read'); } });
  const budget = createSubjectValidationBudget({ ...f.limits.governance, maxValidationSteps: 1 });
  const got = decodeSubjectReconsiderationInput(f.repoRoot, wire, { operationBudget: budget });
  assert.equal(got.ok, false);
  assert.equal(budget.failure.phase, 'reconsideration-input-capture-rows');
  assert.equal(reads, 0);
});

test('wire owner never repairs an omitted or duplicate original assessment pair', async t => {
  const f = preparedReconsiderationFixture(t);
  const { inspectSubjectReconsiderationGateFromWire: inspect } = await import('../payload/engine/lib/subject-reconsideration-gate.js');
  for (const duplicate of [false, true]) {
    const wire = structuredClone(f.gateInput);
    wire.evidence.assessmentCaptures = duplicate
      ? [wire.evidence.assessmentCaptures[0], structuredClone(wire.evidence.assessmentCaptures[0])] : [];
    const got = await inspect({ repoRoot: f.repoRoot, gateInput: wire });
    assert.equal(got.ok, false);
    assert.equal(got.core.allocation, null);
    assert.ok(got.diagnostics.some(row => row.code === (duplicate
      ? 'invalid-subject-reconsideration-input' : 'reconsideration-original-before-pair')), JSON.stringify(got.diagnostics));
  }
});

test('resealed null native replay rows refuse without throwing', async t => {
  const f = preparedReconsiderationFixture(t);
  const { inspectSubjectReconsiderationGateFromWire: inspect } = await import('../payload/engine/lib/subject-reconsideration-gate.js');
  const { isPreparedSubjectReconsiderationReport: valid } = await import('../payload/engine/lib/prepared-subject-reconsideration.js');
  const gate = await inspect({ repoRoot: f.repoRoot, gateInput: f.gateInput });
  const expected = { source: f.source, candidate: f.candidate };
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  assert.equal(valid(gate, expected, f.gateInput), true);
  for (const target of ['comparison', 'inventory']) await t.test(target, () => {
    const altered = structuredClone(gate), replay = altered.impacts.replays;
    replay[target].cases[0] = null;
    if (target === 'inventory') {
      replay.inventoryDigest = canonicalSha256(replay.inventory);
      replay.resources.inventory.bytes = canonicalJsonBytes(replay.inventory).length;
    }
    const { fingerprint, ...value } = replay;
    replay.fingerprint = canonicalSha256(value);
    assert.equal(valid(altered, expected, f.gateInput), false);
  });
});

import { wire as registryWire, digestEvent } from './helpers/subject-reconsideration-fixture.js';
import { subjectReconsiderationInputWire } from '../payload/engine/lib/subject-reconsideration-input.js';

test('candidate cap excludes a larger actual original identity and source-less Decision correspondence remains valid', async t => {
  const f = preparedReconsiderationFixture(t);
  const beforeDocument = structuredClone(f.beforeDocument);
  for (const event of beforeDocument.history) delete event.review.decisionCapture.source;
  f.put('subjects/registry.yaml', registryWire(beforeDocument));
  f.put('_identity.yaml', `${JSON.stringify(f.beforeIdentity)}\n# ${'original formatting '.repeat(2048)}\n`);
  const before = f.commit('actual source-less original history and large identity comment');
  const pair = { registry: f.capture(before, 'subjects/registry.yaml'), identity: f.capture(before, '_identity.yaml') };
  const candidateDocument = structuredClone(f.candidateDocument), event = candidateDocument.history.at(-1);
  candidateDocument.history = [...beforeDocument.history, event];
  delete event.review.decisionCapture.source;
  event.reconsiderationAssessment.scope = { beforeRegistry: { capture: pair.registry.capture,
    documentDigest: canonicalSha256(beforeDocument) }, identityDigest: canonicalSha256(f.beforeIdentity) };
  event.review.changeDigest = digestEvent(event);
  f.put('subjects/registry.yaml', registryWire(candidateDocument)); f.put('_identity.yaml', f.candidateIdentity);
  const candidate = f.commit('actual eventless candidate with smaller identity');
  const decisionCaptures = f.evidence.decisionCaptures.map(row => {
    const capture = structuredClone(row.capture); delete capture.source; return { ...row, capture };
  });
  const operation = { ...f.operation, registryEvent: { id: event.id, changeDigest: event.review.changeDigest } };
  const raw = { ...f.rawInput, before, candidate, operation,
    evidence: { ...f.evidence, decisionCaptures, assessmentCaptures: [pair] } };
  const gateInput = { ...subjectReconsiderationInputWire(raw), impact: raw.impact };
  const { inspectSubjectReconsiderationGateFromWire } = await import('../payload/engine/lib/subject-reconsideration-gate.js');
  const { capturePreparedSubjectReconsideration } = await import('../payload/engine/lib/prepared-subject-reconsideration.js');
  const gate = await inspectSubjectReconsiderationGateFromWire({ repoRoot: f.repoRoot, gateInput });
  assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  assert.equal(Object.hasOwn(gate.core.decision.review.decisionCapture, 'source'), false);
  const captureLimits = { maxRegistryBytes: Buffer.byteLength(f.read('subjects/registry.yaml')),
    maxIdentityBytes: Buffer.byteLength(f.read('_identity.yaml')) };
  assert.ok(pair.identity.bytes.length > captureLimits.maxIdentityBytes + 32768);
  const input = { root: f.repoRoot, source: before, candidate, gate, gateInput, captureLimits };
  const captured = capturePreparedSubjectReconsideration(input);
  assert.equal(captured.identity.length, captureLimits.maxIdentityBytes);
  assert.throws(() => capturePreparedSubjectReconsideration({ ...input,
    captureLimits: { ...captureLimits, maxIdentityBytes: captureLimits.maxIdentityBytes - 1 } }), /reconsideration-capture-bytes/);
});
