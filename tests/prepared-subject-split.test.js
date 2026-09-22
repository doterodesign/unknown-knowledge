import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitAssignmentFixture } from './helpers/subject-split-assignment-fixture.js';
import { runPreparedSubjectSplitGate } from '../payload/engine/lib/subject-split-gate.js';
import { subjectSplitInputWire } from '../payload/engine/lib/subject-split-input.js';
import { withTreeSnapshot } from '../payload/engine/lib/commit-snapshot.js';

const captureLimits = { maxRegistryBytes: 1000000, maxIdentityBytes: 1000000, maxEventBytes: 1000000 };
for (const zero of [false, true]) for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) {
  test(`actual split transport ${objectFormat}, zero=${zero}`, async t => {
    const f = subjectSplitAssignmentFixture(t, { zero, objectFormat, nested });
    const gate = await runPreparedSubjectSplitGate(f.input);
    assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
    const api = await import('../payload/engine/lib/prepared-subject-split.js');
    const gateInput = subjectSplitInputWire(f.input);
    const expected = { source: f.input.before, candidate: f.input.candidate };
    assert.equal(api.isPreparedSubjectSplitReport(gate, expected, gateInput), true);
    assert.deepEqual(subjectSplitInputWire(api.decodePreparedSubjectSplit(f.root, gateInput)), gateInput);
    await withTreeSnapshot(f.root, f.input.candidate.tree, ({ root }) => {
      const request = { root, ...expected, gate, gateInput, captureLimits };
      const captured = api.capturePreparedSubjectSplit(request);
      assert.equal(captured.registry.toString(), f.read('subjects/registry.yaml'));
      assert.equal(captured.identity.toString(), f.read('_identity.yaml'));
      assert.equal(captured.event === null, zero);
      if (!zero) assert.equal(captured.event.toString(), f.read(`subjects/_assignments/${gateInput.operation.assignmentEvent.id}.yaml`));
      const exact = { maxRegistryBytes: captured.registry.length, maxIdentityBytes: captured.identity.length,
        maxEventBytes: captured.event?.length ?? 1 };
      assert.deepEqual(api.capturePreparedSubjectSplit({ ...request, captureLimits: exact }), captured);
      for (const key of Object.keys(exact).filter(key => !zero || key !== 'maxEventBytes')) {
        assert.throws(() => api.capturePreparedSubjectSplit({ ...request, captureLimits: { ...exact, [key]: exact[key] - 1 } }), /prepared subject split/);
      }
    });
  });
}

test('closed positive capacities and fixed identity reader preserve legacy refusal', async t => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { validSplitCaptureLimits } = await import('../payload/engine/lib/prepared-subject-split.js');
  const { readPreparedSubjectBytes, readPreparedSplitIdentityBytes } = await import('../payload/engine/lib/prepared-assignment-event.js');
  const root = mkdtempSync(join(tmpdir(), 'split-identity-reader-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(validSplitCaptureLimits(captureLimits), true);
  for (const key of Object.keys(captureLimits)) for (const limit of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validSplitCaptureLimits({ ...captureLimits, [key]: limit }), false);
  }
  assert.equal(validSplitCaptureLimits({ ...captureLimits, extra: 1 }), false);
  const bad = { ...captureLimits }; delete bad.maxIdentityBytes; assert.equal(validSplitCaptureLimits(bad), false);
  for (const kitPath of ['.', 'unknown-knowledge']) {
    const directory = kitPath === '.' ? root : join(root, kitPath); mkdirSync(directory, { recursive: true });
    const file = join(directory, '_identity.yaml'); const bytes = Buffer.from('exact physical identity\n'); writeFileSync(file, bytes);
    const input = { root, candidate: { kitPath }, maxBytes: bytes.length };
    assert.deepEqual(readPreparedSplitIdentityBytes(input), bytes);
    assert.equal(readPreparedSplitIdentityBytes({ ...input, maxBytes: bytes.length - 1 }), null);
    assert.equal(readPreparedSubjectBytes({ root, file: kitPath === '.' ? '_identity.yaml' : `${kitPath}/_identity.yaml`, maxBytes: bytes.length }), null);
    rmSync(file); symlinkSync(join(root, 'missing'), file);
    assert.equal(readPreparedSplitIdentityBytes(input), null);
    rmSync(file); mkdirSync(file); assert.equal(readPreparedSplitIdentityBytes(input), null); rmSync(file, { recursive: true });
  }
  rmSync(join(root, 'unknown-knowledge'), { recursive: true }); symlinkSync(root, join(root, 'unknown-knowledge'));
  assert.equal(readPreparedSplitIdentityBytes({ root, candidate: { kitPath: 'unknown-knowledge' }, maxBytes: 100 }), null);
  for (const kitPath of ['../escape', 'other', '/absolute', 'unknown-knowledge\n']) {
    assert.equal(readPreparedSplitIdentityBytes({ root, candidate: { kitPath }, maxBytes: 100 }), null);
  }
});

for (const zero of [false, true]) test(`strict report/resource mutation and decoder bounds, zero=${zero}`, async t => {
  const f = subjectSplitAssignmentFixture(t, { zero, kinds: ['ontology'], knowledgePresent: false });
  const gate = await runPreparedSubjectSplitGate(f.input); assert.equal(gate.ok, true, JSON.stringify(gate.diagnostics));
  const wire = subjectSplitInputWire(f.input); const expected = { source: f.input.before, candidate: f.input.candidate };
  const { isPreparedSubjectSplitReport, decodePreparedSubjectSplit } = await import('../payload/engine/lib/prepared-subject-split.js');
  const { decodePreparedSubjectLifecycleInput, decodePreparedSubjectSplitInput } = await import('../payload/engine/lib/prepared-subject-lifecycle-input.js');
  assert.equal(isPreparedSubjectSplitReport(gate, expected, wire), true);
  assert.equal(isPreparedSubjectSplitReport(gate, expected), false);
  assert.throws(() => decodePreparedSubjectLifecycleInput(f.root, wire, 'split'), /unsupported action/);
  for (const action of ['retire', 'merge-equivalent']) assert.throws(() => decodePreparedSubjectLifecycleInput(f.root, wire, action), /owner input admission/);
  assert.deepEqual(subjectSplitInputWire(decodePreparedSubjectSplitInput(f.root, wire)), wire);
  const bytes = [...wire.evidence.decisionCaptures, ...wire.evidence.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity])]
    .reduce((total, row) => total + Buffer.from(row.bytesBase64, 'base64').length, 0);
  const exact = structuredClone(wire); exact.limits.governance.maxCaptureBytes = bytes;
  assert.deepEqual(subjectSplitInputWire(decodePreparedSubjectSplit(f.root, exact)), exact);
  exact.limits.governance.maxCaptureBytes--; assert.throws(() => decodePreparedSubjectSplit(f.root, exact), /capture decode capacity/);
  if (zero) await t.test('resealed zero input still forbids mappings', async () => {
    const { canonicalSha256 } = await import('../payload/engine/lib/canonical-json.js');
    const changedWire = structuredClone(wire); const changed = structuredClone(gate);
    changedWire.operation.mappings = [{ ref: gate.decision.ref, successors: [], reason: 'extra mapping' }];
    changed.operation = structuredClone(changedWire.operation); changed.inputDigest = canonicalSha256(changedWire);
    changed.preservation.proof.operationDigest = canonicalSha256(changed.operation);
    changed.preservation.proofDigest = canonicalSha256(changed.preservation.proof);
    changed.assignmentAssessment.preservationDigest = changed.preservation.proofDigest;
    assert.equal(isPreparedSubjectSplitReport(changed, expected, changedWire), false);
  });
  const mutations = [
    ['extra outer key', g => { g.authority = true; }],
    ['allocation absent', g => { g.allocation = null; }],
    ['allocation stale source', g => { g.allocation.before.capture.source.commit = expected.candidate.commit; }],
    ['allocation wrong publication', g => { g.allocation.publication.review = 'another'; }],
    ['allocation wrong successor order', g => { g.allocation.allocatedIds.reverse(); }],
    ['allocation impossible native counts', g => { g.allocation.remaining++; }],
    ['allocation bad mode', g => { g.allocation.candidate.mode = '120000'; }],
    ['allocation missing resources', g => { g.resources.allocation = null; }],
    ['allocation excess rows', g => { g.resources.allocation.used.ledgerRows = wire.limits.allocation.maxLedgerRows + 1; }],
    ['allocation wrong successor counter', g => { g.resources.allocation.used.successors--; }],
    ['allocation failed', g => { g.resources.allocation.failure = {}; }],
    ['allocation measured claim', g => { g.resources.allocation.accountingBasis = 'measured-slots'; }],
    ['assessment wrong verification', g => { g.assessment.verification = 'unavailable'; }],
    ['assessment unknown key', g => { g.assessment.approved = true; }],
    ['assessment bad digest', g => { g.assessment.refusalSetDigest += '\n'; }],
    ['governance excess counter', g => { g.resources.governance.used.captureBytes = wire.limits.governance.maxCaptureBytes + 1; }],
    ['governance failure', g => { g.resources.governance.failure = {}; }],
    ['closure failure', g => { g.resources.closure.failure = {}; }],
    ['closure negative work', g => { g.resources.closure.used.rows = -1; }],
    ['wrong replay kind', g => { g.impacts.representativeReplays.kind = 'subject-retirement-replay'; }],
    ['wrong replay policy', g => { g.impacts.representativeReplays.policy.id = 'retirement-replay-v1'; }],
    ['wrong replay version', g => { g.impacts.representativeReplays.policy.version = 2; }],
    ['wrong replay digest shape', g => { g.impacts.representativeReplays.policy.digest = 'x'; }],
    ['missing outer check', g => { delete g.checks.allocation; }],
    ['cleanup failure', g => { g.diagnostics.push({ code: 'cleanup-failed' }); }],
    ['incomplete closure', g => { g.authoredReferenceClosure.status = 'incomplete'; }],
    ['changed original descriptor', g => { g.inventory.inputs.before.commit = expected.candidate.commit; }],
    ['unexpected assignment inapplicability', g => { g.checks.decision.status = 'not-applicable'; }],
  ];
  if (zero) mutations.push(
    ['nonempty zero mapping', g => { g.operation.mappings = [{ ref: g.decision.ref }]; }],
    ['one-path zero proof', g => { g.preservation.proof.changedPaths.pop(); }],
    ['unadmitted zero proof', g => { g.resources.closure.used.bytes = 0; }],
    ['zero event supplied', g => { g.sources.assignmentEvent = {}; }],
  );
  else mutations.push(
    ['positive null assignments', g => { g.assignments = null; }],
    ['positive excess row counter', g => { g.assignments.used.selectedRecords++; }],
    ['wrong row authority claim', g => { g.assignments.rows[0].eligibility.publicationReady = true; }],
    ['null nested impact check', g => { g.assignments.checks.impactPolicy = null; }],
    ['changed impact owner', g => { g.assignments.checks.impactPolicy.scope = 'other'; }],
    ['failed P8', g => { g.assignments.checks.preservation.status = 'failed'; }],
  );
  for (const [name, mutate] of mutations) await t.test(name, () => {
    const changed = structuredClone(gate); mutate(changed);
    assert.equal(isPreparedSubjectSplitReport(changed, expected, wire), false);
  });
  const deep = structuredClone(gate); deep.ok = false;
  deep.inventory = JSON.parse('['.repeat(12000) + 'null' + ']'.repeat(12000));
  assert.equal(isPreparedSubjectSplitReport(deep, expected, wire), false);
  const deepWire = structuredClone(wire); deepWire.operation.retainedUnknowns = JSON.parse('['.repeat(12000) + 'null' + ']'.repeat(12000));
  assert.throws(() => decodePreparedSubjectSplit(f.root, deepWire));
  assert.equal(isPreparedSubjectSplitReport(gate, expected, wire), true);
});

test('an actual failed owner report remains diagnostic and cannot produce captures', async t => {
  const f = subjectSplitAssignmentFixture(t, { zero: true }); f.input.limits.replays.maxCases = 0;
  const gate = await runPreparedSubjectSplitGate(f.input); assert.equal(gate.ok, false);
  const { isPreparedSubjectSplitReport, capturePreparedSubjectSplit } = await import('../payload/engine/lib/prepared-subject-split.js');
  const gateInput = subjectSplitInputWire(f.input); const expected = { source: f.input.before, candidate: f.input.candidate };
  assert.equal(isPreparedSubjectSplitReport(gate, expected, gateInput), true);
  assert.throws(() => capturePreparedSubjectSplit({ root: f.root, ...expected, gate, gateInput, captureLimits }), /capture input unavailable/);
});
