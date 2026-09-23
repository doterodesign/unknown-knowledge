import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectRetirementAssignmentFixture } from './helpers/subject-retirement-assignment-fixture.js';
import { runPreparedSubjectRetirementGate } from '../payload/engine/lib/subject-retirement-gate.js';
import { subjectRetirementInputWire } from '../payload/engine/lib/subject-retirement-input.js';
import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';
import { canonicalJsonBytes, canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePreparedSubjectRetirement, isPreparedSubjectRetirementReport,
  capturePreparedSubjectRetirement, validRetirementCaptureLimits } from '../payload/engine/lib/prepared-subject-retirement.js';

const captureLimits = { maxRegistryBytes: 1000000, maxEventBytes: 1000000 };
async function actual(t, options) {
  const f = subjectRetirementAssignmentFixture(t, options);
  const gate = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(gate.ok, true, JSON.stringify(gate));
  return { f, gate, gateInput: subjectRetirementInputWire(f.input),
    expected: { source: f.input.before, candidate: f.input.candidate } };
}

for (const zero of [false, true]) test(`actual retirement transport binds the original owner and raw captures, zero=${zero}`, async t => {
  const { f, gate, gateInput, expected } = await actual(t, { zero, kind: 'ontology', tracked: true });
  assert.equal(isPreparedSubjectRetirementReport(gate, expected, gateInput), true);
  const decoded = decodePreparedSubjectRetirement(f.root, gateInput);
  assert.deepEqual(subjectRetirementInputWire(decoded), gateInput);
  assert.equal(canonicalSha256(gateInput), gate.inputDigest);
  assert.equal(validRetirementCaptureLimits(captureLimits), true);
  if (!zero) {
    assert.equal(gate.assignments.checks.impactPolicy.status, 'not-performed');
    assert.equal(gate.assignments.checks.humanApproval.status, 'not-performed');
  }
  await withTreeSnapshot(f.root, f.input.candidate.tree, ({ root }) => {
    const captured = capturePreparedSubjectRetirement({ root, ...expected, gate, gateInput, captureLimits });
    assert.equal(captured.registry.toString(), f.read('subjects/registry.yaml'));
    assert.equal(captured.event === null, zero);
    if (!zero) assert.equal(captured.event.toString(), f.read(`subjects/_assignments/${gateInput.operation.assignmentEvent.id}.yaml`));
  });
});

for (const zero of [false, true]) test(`retirement success requires exact branch and original-wire consistency, zero=${zero}`, async t => {
  const { gate, gateInput, expected } = await actual(t, { zero });
  assert.equal(isPreparedSubjectRetirementReport(gate, expected), false, 'success needs original input');
  const foreignWire = structuredClone(gateInput); foreignWire.reviewNote.author = 'different actor';
  assert.equal(isPreparedSubjectRetirementReport(gate, expected, foreignWire), false);
  const common = [
    ['extra outer field', g => { g.approved = true; }],
    ['missing outer check', g => { delete g.checks.models; }],
    ['unexpected inapplicability', g => { g.checks.decision.status = 'not-applicable'; }],
    ['cleanup diagnostic', g => { g.diagnostics.push({ code: 'cleanup-failed' }); }],
    ['incomplete closure', g => { g.authoredReferenceClosure.status = 'incomplete'; }],
    ['missing governance counters', g => { g.resources.governance.used = null; }],
    ['excess governance bytes', g => { g.resources.governance.used.captureBytes = gateInput.limits.governance.maxCaptureBytes + 1; }],
    ['negative governance counter', g => { g.resources.governance.used.subjects = -1; }],
    ['governance failure', g => { g.resources.governance.failure = { code: 'budget' }; }],
    ['closure failure', g => { g.resources.closure.failure = { code: 'budget' }; }],
    ['excess closure rows', g => { g.resources.closure.used.rows = gateInput.limits.closure.maxRows + 1; }],
    ['excess closure bytes', g => { g.resources.closure.used.bytes = gateInput.limits.closure.maxBytes + 1; }],
    ['different capacities', g => { g.resources.limits.closure.maxRows++; }],
    ['different registry events', g => { g.sources.registryEvents = []; }],
    ['different Decision namespace', g => { g.decision.ref.namespace = '99999999-9999-4999-8999-999999999999'; }],
    ['wrong registry source', g => { g.sources.registryCapture.source.tree = expected.source.tree; }],
    ['wrong inventory source', g => { g.inventory.inputs.before.commit = expected.candidate.commit; }],
    ['incomplete tree', g => { g.impacts.subjectTree.status = 'incomplete'; }],
    ['incomplete retirement replay', g => { g.impacts.representativeReplays.status = 'incomplete'; }],
  ];
  const branch = zero ? [
    ['uncharged zero proof row', g => { g.resources.closure.used.rows = 0; }],
    ['uncharged zero proof bytes', g => { g.resources.closure.used.bytes = canonicalJsonBytes(g.preservation.proof).length - 1; }],
    ['assignment report supplied', g => { g.assignments = {}; }],
    ['event supplied', g => { g.sources.assignmentEvent = {}; }],
    ['nonempty affected refs', g => { g.authoredReferenceClosure.affectedRefs = [g.decision.ref]; }],
    ['nonempty assessed refs', g => { g.assignmentAssessment.effectiveDirectRefs = [g.decision.ref]; }],
    ['extra assessment field', g => { g.assignmentAssessment.extra = true; }],
    ['assessment inventory mismatch', g => { g.assignmentAssessment.inventoryDigest = '0'.repeat(64); }],
    ['assessment preservation mismatch', g => { g.assignmentAssessment.preservationDigest = '0'.repeat(64); }],
    ['failed preservation', g => { g.preservation.status = 'failed'; }],
    ['extra proof field', g => { g.preservation.proof.extra = true; }],
    ['wrong proof digest', g => { g.preservation.proofDigest = '0'.repeat(64); }],
    ['different proof source', g => { g.preservation.proof.inputs.before = expected.candidate; }],
    ['different proof operation', g => { g.preservation.proof.operationDigest = '0'.repeat(64); }],
    ['different proof inventory', g => { g.preservation.proof.inventoryDigest = '0'.repeat(64); }],
    ['resealed unrelated path', g => {
      g.preservation.proof.changedPaths.push('unrelated.txt');
      g.preservation.proofDigest = canonicalSha256(g.preservation.proof);
      g.assignmentAssessment.preservationDigest = g.preservation.proofDigest;
    }],
  ] : [
    ['zero-only assessment supplied', g => { g.assignmentAssessment = {}; }],
    ['zero-only proof supplied', g => { g.preservation = {}; }],
    ['unknown nested version', g => { g.assignments.version = 2; }],
    ['nested failure', g => { g.assignments.ok = false; }],
    ['empty affected set', g => { g.authoredReferenceClosure.affectedRefs = []; }],
    ['duplicate affected ref', g => { g.authoredReferenceClosure.affectedRefs.push(g.authoredReferenceClosure.affectedRefs[0]); }],
    ['mismatched nested scope', g => { g.assignments.scope.refs.pop(); }],
    ['wrong nested source', g => { g.assignments.inputs.before.commit = expected.candidate.commit; }],
    ['different event digest', g => { g.assignments.eventSource.eventDigest = '0'.repeat(64); }],
    ['different event candidate', g => { g.assignments.eventSource.candidate = expected.source; }],
    ...['source', 'history', 'captures', 'eligibility', 'authorizer', 'preservation', 'candidateCommitMembership'].map(name =>
      [`failed nested ${name}`, g => { g.assignments.checks[name].status = 'failed'; }]),
  ];
  for (const [name, change] of [...common, ...branch]) await t.test(name, () => {
    const changed = structuredClone(gate); change(changed);
    assert.equal(isPreparedSubjectRetirementReport(changed, expected, gateInput), false);
  });
  assert.equal(isPreparedSubjectRetirementReport(gate, expected, gateInput), true, 'original stays intact');
});

for (const zero of [false, true]) test(`raw retirement capture admits exact fit and refuses one-short or changed bytes, zero=${zero}`, async t => {
  const { f, gate, gateInput, expected } = await actual(t, { zero, nested: true });
  await withTreeSnapshot(f.root, f.input.candidate.tree, ({ root }) => {
    const request = { root, ...expected, gate, gateInput, captureLimits };
    const captured = capturePreparedSubjectRetirement(request);
    const exact = { maxRegistryBytes: captured.registry.length, maxEventBytes: captured.event?.length ?? 1 };
    const again = capturePreparedSubjectRetirement({ ...request, captureLimits: exact });
    assert.deepEqual(again, captured);
    assert.throws(() => capturePreparedSubjectRetirement({ ...request,
      captureLimits: { ...exact, maxRegistryBytes: exact.maxRegistryBytes - 1 } }), /registry capture unavailable/);
    if (!zero) assert.throws(() => capturePreparedSubjectRetirement({ ...request,
      captureLimits: { ...exact, maxEventBytes: exact.maxEventBytes - 1 } }), /assignment capture unavailable/);
    writeFileSync(join(root, gate.sources.registryCapture.file), Buffer.concat([captured.registry, Buffer.from('\n')]));
    assert.throws(() => capturePreparedSubjectRetirement(request), /registry capture unavailable/);
  });
});

test('actual failed owner output can be retained as a failure but never captured as success', async t => {
  const f = subjectRetirementAssignmentFixture(t, { zero: true }); f.input.limits.replays.maxCases = 0;
  const gate = await runPreparedSubjectRetirementGate(f.input);
  assert.equal(gate.ok, false); const gateInput = subjectRetirementInputWire(f.input);
  const expected = { source: f.input.before, candidate: f.input.candidate };
  assert.equal(isPreparedSubjectRetirementReport(gate, expected, gateInput), true);
  await withTreeSnapshot(f.root, f.input.candidate.tree, ({ root }) => {
    assert.throws(() => capturePreparedSubjectRetirement({ root, ...expected, gate, gateInput, captureLimits }), /capture input unavailable/);
  });
});

test('malformed deep report refuses instead of overflowing the transport', async t => {
  const { gate, gateInput, expected } = await actual(t, { zero: true });
  gate.ok = false;
  gate.inventory = JSON.parse('['.repeat(12000) + 'null' + ']'.repeat(12000));
  assert.equal(isPreparedSubjectRetirementReport(gate, expected, gateInput), false);
});
