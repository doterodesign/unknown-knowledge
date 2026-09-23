import assert from 'node:assert/strict';
import test from 'node:test';
import { finalSubjectSplitFixture } from './helpers/final-subject-split-fixture.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

for (const [objectFormat, nested] of [['sha1', false], ['sha256', true]]) for (const zero of [true, false]) {
  test(`actual prepared and fresh final split ${objectFormat}, zero=${zero}`, async t => {
    const f = await finalSubjectSplitFixture(t, { objectFormat, nested, zero });
    const { runFinalPreparedSubjectSplitGate } = await import('../payload/engine/lib/final-prepared-subject-split.js');
    const member = file => f.retained.artifacts.find(row => row.file === `checks/operation/${file}`);
    assert.equal(f.gate.ok, true, JSON.stringify(f.gate.diagnostics));
    assert.deepEqual(JSON.parse(member('input.json').bytes), f.operationInputs.gateInput);
    assert.deepEqual(JSON.parse(member('capture-limits.json').bytes), f.operationInputs.captureLimits);
    assert.equal(f.gate.inputDigest, canonicalSha256(f.operationInputs.gateInput));
    assert.equal(f.gate.sources.identityCapture.sha256, member('identity.yaml').sha256);
    assert.equal(f.gate.sources.registryCapture.sha256, member('registry.yaml').sha256);
    assert.equal(Boolean(member('event.yaml')), !zero);
    assert.equal(f.validation.report.checks.find(row => row.id === 'operation').invocation.injectedInputsDigest, canonicalSha256(f.operationInputs));
    assert.ok(f.validation.report.checks.every(row => row.status === 'passed'));
    const result = await runFinalPreparedSubjectSplitGate(f.input);
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.deepEqual(result.gate, f.gate);
    assert.equal(result.gate.publicationReady, false);
    assert.equal(result.gate.impacts.representativeReplays.comparison.status, 'incomplete');
    assert.equal(result.gate.impacts.routes.status, 'requires-final-capability');
    assert.equal(result.gate.sources.assignmentEvent === null, zero);
  });
}

/** Rebind byte-integrity layers only; the real final owner must still disagree. */
async function resealedGateVariant(f, mutate) {
  const { artifactCapture } = await import('../payload/engine/lib/prepared-evidence.js');
  const { canonicalJsonBytes } = await import('../payload/engine/lib/canonical-json.js');
  const { splitEvidenceVariant } = await import('./helpers/final-subject-split-fixture.js');
  const gate = structuredClone(f.gate); mutate(gate);
  const bytes = Buffer.from(`${JSON.stringify(gate)}\n`);
  const report = structuredClone(f.validation.report);
  const operation = report.checks.find(row => row.id === 'operation');
  for (const stream of ['stdout', 'result']) operation[stream] = artifactCapture(`checks/operation/${stream}`, bytes);
  const reportBytes = canonicalJsonBytes(report);
  const changed = { ...f, input: { ...f.input, expected: { ...f.input.expected, reportDigest: canonicalSha256(report) } } };
  return splitEvidenceVariant(changed, artifacts => {
    for (const row of artifacts) {
      if (['checks/operation/stdout', 'checks/operation/result'].includes(row.file)) row.bytes = bytes;
      if (row.file === 'report.json') row.bytes = reportBytes;
    }
  });
}

test('actual final split rejects retained drift, missing artifacts, policy/profile/runtime mismatch and fresh report differences', async t => {
  const { splitEvidenceVariant } = await import('./helpers/final-subject-split-fixture.js');
  const { runFinalPreparedSubjectSplitGate } = await import('../payload/engine/lib/final-prepared-subject-split.js');
  const f = await finalSubjectSplitFixture(t, { objectFormat: 'sha256', nested: true });
  assert.equal((await runFinalPreparedSubjectSplitGate(f.input)).status, 'passed');
  for (const [name, edit] of [
    ...['identity', 'registry', 'event'].flatMap(kind => [
      [`missing ${kind}`, rows => { rows.splice(rows.findIndex(row => row.file === `checks/operation/${kind}.yaml`), 1); }],
      [`physical ${kind} drift`, rows => { const row = rows.find(row => row.file === `checks/operation/${kind}.yaml`); row.bytes = Buffer.concat([row.bytes, Buffer.from('\n')]); }],
    ]),
    ['missing prepared worker', rows => { rows.splice(rows.findIndex(row => row.file === 'runtime/files/engine/lib/prepared-subject-split-check.js'), 1); }],
    ['missing final worker', rows => { rows.splice(rows.findIndex(row => row.file === 'runtime/files/engine/lib/final-subject-split-check.js'), 1); }],
    ['policy bytes drift', rows => { rows.find(row => row.file === 'runtime/files/engine/policies/candidate-publication.json').bytes = Buffer.from('{}'); }],
    ['original input changed', rows => { const row = rows.find(row => row.file === 'checks/operation/input.json'); const wire = JSON.parse(row.bytes); wire.reviewNote.author += ' changed'; row.bytes = Buffer.from(JSON.stringify(wire)); }],
    ['zero identity cap', rows => { rows.find(row => row.file === 'checks/operation/capture-limits.json').bytes = Buffer.from('{"maxEventBytes":1,"maxIdentityBytes":0,"maxRegistryBytes":1}'); }],
  ]) await t.test(name, async () => {
    assert.equal((await runFinalPreparedSubjectSplitGate(splitEvidenceVariant(f, edit))).status, 'failed');
  });
  for (const [name, mutate] of [
    ['wrong operation', input => { input.expected.operation = 'subject-retirement'; }],
    ['stale runtime digest', input => { input.expected.runtimeDigest = '0'.repeat(64); }],
    ['missing approved profile', input => { input.approvedRuntimeProfile = null; }],
    ['changed approved profile', input => { input.approvedRuntimeProfile.profile.files.pop(); }],
  ]) await t.test(name, async () => {
    const input = structuredClone(f.input); mutate(input);
    assert.equal((await runFinalPreparedSubjectSplitGate(input)).status, 'failed');
  });
  for (const [name, mutate] of [
    ['resealed native identity blob', gate => { gate.sources.identityCapture.blob = '0'.repeat(64); gate.allocation.candidate.capture.blob = '0'.repeat(64); }],
    ['resealed plausible governance counter', gate => { gate.resources.governance.used.validationSteps++; }],
  ]) await t.test(name, async () => {
    const input = await resealedGateVariant(f, mutate);
    const result = await runFinalPreparedSubjectSplitGate(input);
    assert.equal(result.status, 'failed');
    assert.equal(result.gate?.ok, true, JSON.stringify(result));
    assert.equal(result.diagnostics.at(-1).code, 'split-fresh-proof-mismatch');
  });
});

test('zero split final rejects event artifacts and cleanup failure revokes a fresh successful gate', async t => {
  const fs = (await import('node:fs')).default; const { syncBuiltinESMExports } = await import('node:module');
  const { splitEvidenceVariant } = await import('./helpers/final-subject-split-fixture.js');
  const { runFinalPreparedSubjectSplitGate } = await import('../payload/engine/lib/final-prepared-subject-split.js');
  const f = await finalSubjectSplitFixture(t, { zero: true });
  const extra = splitEvidenceVariant(f, rows => rows.push({ file: 'checks/operation/event.yaml', bytes: Buffer.alloc(0) }));
  assert.equal((await runFinalPreparedSubjectSplitGate(extra)).status, 'failed');
  const original = fs.rmSync; let injected = false;
  fs.rmSync = (path, options) => {
    original(path, options);
    if (String(path).includes('/final-subject-split-')) { injected = true; throw Object.assign(new Error('cleanup'), { errno: -13, code: 'EACCES' }); }
  };
  syncBuiltinESMExports();
  let result;
  try { result = await runFinalPreparedSubjectSplitGate(f.input); }
  finally { fs.rmSync = original; syncBuiltinESMExports(); }
  assert.equal(injected, true); assert.equal(result.gate.ok, true);
  assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.at(-1).code, 'split-cleanup-failed');
});

test('ordinary value failure can retain authentic split owner success but cannot pass final validation', async t => {
  const { runFinalPreparedSubjectSplitGate } = await import('../payload/engine/lib/final-prepared-subject-split.js');
  const f = await finalSubjectSplitFixture(t, { zero: true, kinds: ['ontology'], beforeChange(h) {
    h.editEntries('ontology/classes/split-owners.yaml', rows => {
      rows[0].enumerates = [{ kind: 'test-lines', source: 'src/owned.js', values: ['different-claimed-value'] }];
    });
  } });
  assert.equal(f.gate.ok, true, JSON.stringify(f.gate.diagnostics));
  assert.equal(f.validation.report.checks.find(row => row.id === 'operation').status, 'passed');
  assert.equal(f.validation.report.checks.find(row => row.id === 'values').status, 'failed');
  for (const kind of ['registry', 'identity']) assert.ok(f.retained.artifacts.some(row => row.file === `checks/operation/${kind}.yaml`));
  const result = await runFinalPreparedSubjectSplitGate(f.input);
  assert.equal(result.status, 'failed'); assert.equal(result.diagnostics.at(-1).code, 'split-validation-incomplete');
});

test('positive split with all-empty replacement subsets still requires an assignment event', async t => {
  const { load } = await import('js-yaml');
  const { runFinalPreparedSubjectSplitGate } = await import('../payload/engine/lib/final-prepared-subject-split.js');
  const f = await finalSubjectSplitFixture(t, { zero: false, beforeChange({ owners }) {
    // This existing hook runs before mappings, candidate rows and event bytes are authored.
    // There is no fixture `subsets` option: customize each owner's actual selection here.
    for (const owner of owners) owner.successors = [];
  } });
  const operation = f.operationInputs.gateInput.operation;
  assert.ok(operation.mappings.length > 0);
  assert.ok(operation.mappings.every(mapping => mapping.successors.length === 0));
  assert.notEqual(operation.assignmentEvent, null);
  assert.equal(f.gate.ok, true, JSON.stringify(f.gate.diagnostics));
  assert.equal(f.gate.checks.assignments.status, 'passed');
  assert.equal(f.gate.assignmentAssessment, null);
  assert.ok(f.gate.authoredReferenceClosure.affectedRefs.length > 0);
  assert.equal(f.gate.assignments.rows.length, operation.mappings.length);
  assert.ok(f.gate.assignments.rows.every(row => row.eligibility.lifecycle.before.state === 'effective'
    && row.eligibility.before.state === 'known' && row.eligibility.before.ids.includes(operation.subject)));
  const artifact = f.retained.artifacts.find(row => row.file === 'checks/operation/event.yaml');
  assert.ok(artifact && artifact.bytes.length > 0);
  assert.equal(f.gate.sources.assignmentEvent.eventCapture.sha256, artifact.sha256);
  const event = load(artifact.bytes.toString('utf8'));
  assert.equal(event.event, operation.assignmentEvent.id);
  assert.ok(event.rows.length > 0);
  assert.deepEqual(event.rows.map(row => row.ref), operation.mappings.map(mapping => mapping.ref));
  for (const row of event.rows) {
    assert.equal(row.before.state, 'known');
    assert.ok(row.before.ids.includes(operation.subject));
    assert.deepEqual(row.after, { state: 'known', ids: row.before.ids.filter(id => id !== operation.subject) });
  }
  const result = await runFinalPreparedSubjectSplitGate(f.input);
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.gate, f.gate);
  assert.notEqual(result.gate.sources.assignmentEvent, null);
  assert.equal(result.gate.publicationReady, false);
});
