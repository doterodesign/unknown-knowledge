import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, symlinkSync, writeFileSync, readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepareInstalledTrialHost } from '../acceptance/retrieval/prepare-trial-host.js';
import { runTrialOperation, renderDelivery } from '../acceptance/retrieval/trial-host.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';
import { inspectIntentDelivery } from '../acceptance/retrieval/intent-host.js';

const repository = fileURLToPath(new URL('..', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const validation = { version: 1, maxBranches: 2, maxReservedAstNodes: 64, maxReservedRedirects: 16 };
const execution = { version: 1, maxBranches: 2, maxReservedAstNodes: 64, maxAstDepth: 8,
  maxReservedRedirects: 16, maxReservedHierarchyNodes: 128, maxReservedHierarchyEdges: 128,
  maxReservedRecords: 200, maxReservedPredicateSteps: 2000, maxReservedExplanationNodes: 20000,
  maxReservedResultSlots: 20 };
async function fixture(t, options = {}) {
  const f = subjectQueryDiskFixture(t, { nested: true });
  for (const name of ['engine', 'schemas', 'package.json']) cpSync(join(repository, 'payload', name), join(f.kitRoot, name), { recursive: true });
  symlinkSync(join(repository, 'node_modules'), join(f.kitRoot, 'node_modules'), 'dir');
  writeFileSync(join(f.root, 'validation.json'), JSON.stringify(validation));
  writeFileSync(join(f.root, 'execution.json'), JSON.stringify(execution));
  const stateDirectory = mkdtempSync(join(tmpdir(), 'intent-host-state-'));
  t.after(() => rmSync(stateDirectory, { recursive: true, force: true }));
  const stateFile = join(stateDirectory, 'state.json');
  if (options.stdout !== undefined) writeFileSync(join(f.kitRoot, 'engine/intent-plan.js'),
    `process.stdout.write(${JSON.stringify(options.stdout)}); process.exitCode = ${options.exitCode ?? 0};`);
  await prepareInstalledTrialHost(stateFile, { root: f.root, namespace: 'display-name', sourceFiles: [], metadataFiles: [],
    intentPolicies: { validation: 'validation.json', execution: 'execution.json' }, decisionCaptures: 'decision-captures.json',
    ...(options.limits ? { limits: options.limits } : {}) });
  const plan = { version: 1, inputRef: 'request:color', inventoryStatus: 'declared-complete',
    units: [{ key: 'color', sourceRef: 'request:color', disposition: 'mapped' }], bindings: [], clarifications: [],
    constraints: [{ key: 'color', origin: 'explicit', unitKeys: ['color'], bindingKeys: [],
      queryRefs: ['/where', '/stores', '/view'].map(path => ({ branch: 'strict', path })), requirementKeys: ['source'] }],
    requirements: [{ key: 'source', unitKeys: ['color'], description: 'Read source support.' }],
    branches: [{ key: 'strict', kind: 'strict', unitKeys: ['color'], assumptions: [], relaxes: [], query: subjectQuery() }] };
  return { ...f, stateFile, stateDirectory, plan, state: () => JSON.parse(readFileSync(stateFile, 'utf8')),
    run: operation => runTrialOperation(stateFile, operation) };
}
const request = (f, mode = 'structural') => ({ type: 'intent-plan', mode, plan: f.plan });

test('preparation includes loaded proposals and Decisions with the actual canonical namespace', async t => {
  const f = await fixture(t); const config = f.state().configuration;
  assert.equal(config.identityNamespace, f.context.model.identity.namespace);
  assert.equal(config.records.length, 8);
  assert.equal(config.records.filter(r => r.identityType === 'proposal').length, 1);
  assert.ok(config.records.some(r => r.kind === 'decisions'));
  for (const file of ['unknown-knowledge/engine/intent-plan.js', 'unknown-knowledge/subjects/registry.yaml',
    'unknown-knowledge/_identity.yaml', 'validation.json', 'execution.json', 'decision-captures.json']) assert.ok(config.fileHashes[file], file);
});

test('actual fixed lookup and binding inspection count subjects separately and full entries as records', async t => {
  const f = await fixture(t);
  const lookup = f.run({ type: 'subject-lookup', text: 'Color', options: {} });
  assert.equal(lookup.status, 'completed', renderDelivery(lookup)); assert.equal(lookup.exitCode, 0);
  const payload = JSON.parse(lookup.text);
  assert.equal(payload.operation, 'subject.lookup');
  assert.deepEqual(f.state().recordIds, []);
  assert.deepEqual(f.state().subjectIds, [`${f.context.model.identity.namespace}/subject/S-000001`]);
  f.plan.bindings = [{ key: 'decision', unitKeys: ['color'], sourceRef: 'request:color', basis: 'inference',
    label: 'Decision', target: { namespace: f.context.model.identity.namespace, kind: 'decision', id: 'D-000001' } }];
  const result = f.run(request(f, 'inspect-bindings'));
  assert.equal(result.status, 'completed', renderDelivery(result));
  assert.equal(JSON.parse(result.text).result.bindings[0].target.status, 'loaded');
  assert.deepEqual(f.state().fullRecordIds, ['display-name/decisions/D-000001']);
  assert.deepEqual(f.state().recordIds, f.state().fullRecordIds);
  assert.equal(f.state().sourceBytes, 0);
  assert.deepEqual(readdirSync(f.stateDirectory), ['state.json']);
});

test('actual structural and query validation use frozen files without exposing record bodies', async t => {
  const f = await fixture(t, { limits: { perResultBytes: 65536 } });
  for (const mode of ['structural', 'validate-queries']) {
    const result = f.run(request(f, mode));
    assert.equal(result.status, 'completed', renderDelivery(result)); assert.equal(result.exitCode, 0, result.text);
  }
  assert.deepEqual(f.state().recordIds, []);
  assert.deepEqual(f.state().subjectIds, [`${f.context.model.identity.namespace}/subject/S-000001`]);
  assert.deepEqual(readdirSync(f.stateDirectory), ['state.json']);
  const event = f.state().events.at(-1);
  assert.equal(event.command.exitCode, 0);
  assert.equal(event.requestBytes, Buffer.byteLength(JSON.stringify(request(f, 'validate-queries'))));
  assert.equal(event.command.stdoutSha256, digest(f.run(request(f, 'validate-queries')).text));
});

test('actual execution accounts canonical and proposal rows, repeated delivery bytes, and no source reads', async t => {
  // This unit test permits a complete envelope; the demonstration retains the default 16 KiB limit.
  const f = await fixture(t, { limits: { perResultBytes: 131072, resultBytes: 524288 } });
  f.plan.branches[0].query.view = 'all';
  const result = f.run(request(f, 'execute-queries'));
  assert.equal(result.status, 'completed', renderDelivery(result)); assert.equal(result.exitCode, 0, result.text);
  const rows = JSON.parse(result.text).result.branches[0].result.groups.knowledge.strict;
  assert.ok(rows.some(row => row.identityType === 'proposal'));
  assert.equal(f.state().recordIds.length, rows.length);
  assert.deepEqual(new Set(f.state().subjectIds), new Set(['S-000001', 'S-000002', 'S-000003']
    .map(id => `${f.context.model.identity.namespace}/subject/${id}`)));
  assert.deepEqual(f.state().fullRecordIds, []); assert.equal(f.state().sourceBytes, 0);
  const before = f.state().resultBytes;
  f.run(request(f, 'execute-queries'));
  assert.equal(f.state().recordIds.length, rows.length);
  assert.equal(f.state().resultBytes, before * 2);
});

test('oversize actual output is refused before exposure and retains the real command receipt', async t => {
  const f = await fixture(t, { limits: { perResultBytes: 150 } });
  const result = f.run({ type: 'subject-lookup', text: 'Color' });
  assert.equal(result.status, 'refused'); assert.match(result.reason, /result budget/);
  assert.deepEqual(f.state().subjectIds, []);
  assert.equal(f.state().events[0].command.exitCode, 0);
  assert.ok(f.state().events[0].command.stdoutBytes > 150);
  assert.equal(f.state().events[0].exitCode, 2);
});

test('unknown successful envelope and malformed JSON fail before delivery, with raw hashes retained', async t => {
  for (const stdout of ['{"unrecognized":{"body":"hidden"}}', '{"malformed":']) {
    const f = await fixture(t, { stdout });
    const result = f.run(request(f));
    assert.equal(result.status, 'refused'); assert.doesNotMatch(renderDelivery(result), /hidden|malformed/);
    assert.equal(f.state().events[0].command.stdoutSha256, digest(stdout));
    assert.equal(f.state().events[0].command.exitCode, 0);
    assert.deepEqual(f.state().recordIds, []);
  }
});

test('frozen runtime, registry, capture and policy drift refuse before any CLI invocation', async t => {
  for (const file of ['unknown-knowledge/engine/intent-plan.js', 'unknown-knowledge/subjects/registry.yaml',
    'decision-captures.json', 'validation.json']) {
    const f = await fixture(t);
    writeFileSync(join(f.root, file), 'changed');
    const result = f.run(request(f, 'execute-queries'));
    assert.equal(result.status, 'refused'); assert.match(result.reason, /changed/);
    assert.equal(f.state().events[0].command, null);
  }
});

test('reader cannot supply executable, roots, policy paths or lookup requests in another mode', async t => {
  const f = await fixture(t);
  for (const operation of [{ ...request(f), root: '/tmp' }, { ...request(f), admission: 'other.json' },
    { ...request(f), lookupRequests: {} }, { type: 'subject-lookup', text: 'Color', options: { executable: '/tmp' } }]) {
    assert.equal(f.run(operation).status, 'refused');
  }
  assert.equal(f.state().operations, 4);
  assert.ok(f.state().events.every(event => event.command === null));
  assert.deepEqual(readdirSync(f.stateDirectory), ['state.json']);
});

test('every strict/possible row is accounted even in a failed wrapper with prior results', async t => {
  const f = await fixture(t, { limits: { perResultBytes: 131072 } });
  f.plan.branches[0].query.view = 'all';
  const operation = request(f, 'execute-queries');
  const actual = f.run(operation);
  assert.equal(actual.status, 'completed', renderDelivery(actual));
  const payload = JSON.parse(actual.text);
  payload.result.status = 'refused'; payload.result.execution = 'refused';
  const group = payload.result.branches[0].result.groups.knowledge;
  group.possible.push(group.strict.pop());
  const expected = inspectIntentDelivery(payload, operation, f.state().configuration);
  assert.equal(expected.inspected.length, group.strict.length + group.possible.length);
  assert.equal(expected.subjects.length, 3);
  for (const mutate of [
    result => { result.validation.branches[0].validation.input.namespace = 'foreign'; },
    result => { result.validation.branches[0].validation.requirements.subjectResolutions[0].outcome.resolution.subject.id = 'S-999999'; },
    result => { result.branches[0].result.input.namespace = 'foreign'; },
    result => { const resolution = result.branches[0].result.assignmentEvidence.outcomes['S-000001'].resolution;
      resolution.id = 'S-999999'; resolution.subject.id = 'S-999999'; },
    result => { result.branches[0].result.groups.knowledge.possible[0].assignments = {}; },
    result => { result.branches[0].result.outputVersion = 3; },
    result => { result.branches[0].result.assignmentEvidence.namespace = 'foreign'; },
    result => { result.branches[0].result.assignmentEvidence.policy = 'equivalent'; },
    result => { result.branches[0].result.assignmentEvidence.outcomes['S-000001'].resolution.requestedId = 'S-000002'; },
    result => { result.branches[0].result.assignmentEvidence.outcomes['S-000001'].resolution.redirects = [{ from: 'S-000001', to: 'S-000002' }]; },
    result => { delete result.branches[0].result.assignmentEvidence.outcomes['S-000001']; },
    result => { const r = result.branches[0].result; for (const group of Object.values(r.groups)) {
      for (const row of [...group.strict, ...group.possible]) row.assignments = { state: 'known', ids: [] };
    } },
  ]) {
    const changed = structuredClone(payload); mutate(changed.result);
    assert.throws(() => inspectIntentDelivery(changed, operation, f.state().configuration), /namespace|inventory|shape/);
  }
  for (const mutate of [
    row => { (row.ref ?? row.proposalRef).namespace = 'foreign'; },
    row => { (row.ref ?? row.proposalRef).kind = 'ontology'; },
    row => { if (row.ref) row.ref.id = 'K-999999'; else row.proposalRef.key = 'proposal:knowledge:unknown'; },
    row => { row.identityType = row.identityType === 'record' ? 'proposal' : 'record'; },
    row => { row.file = 'knowledge/undeclared.md'; },
    row => { row.undeclaredBody = 'must not escape'; },
  ]) for (const category of ['strict', 'possible']) {
    const changed = structuredClone(payload); mutate(changed.result.branches[0].result.groups.knowledge[category][0]);
    assert.throws(() => inspectIntentDelivery(changed, operation, f.state().configuration), /inventory|shape/);
  }
  const delivered = await fixture(t, { stdout: JSON.stringify(payload), exitCode: 2, limits: { perResultBytes: 131072 } });
  const result = delivered.run(operation);
  assert.equal(result.status, 'completed', renderDelivery(result)); assert.equal(result.exitCode, 2);
  assert.deepEqual(delivered.state().recordIds, expected.inspected);
  assert.deepEqual(delivered.state().subjectIds, expected.subjects);
  const limited = await fixture(t, { stdout: JSON.stringify(payload), exitCode: 2, limits: { records: 0, perResultBytes: 131072 } });
  assert.equal(limited.run(operation).status, 'refused');
  assert.deepEqual(limited.state().recordIds, []); assert.deepEqual(limited.state().subjectIds, []);
  assert.equal(limited.state().events[0].command.exitCode, 2);
  const legacy = structuredClone(payload);
  for (const branch of legacy.result.branches) if (branch.result?.groups) {
    const r = branch.result;
    for (const group of Object.values(r.groups)) for (const row of [...group.strict, ...group.possible]) {
      row.assignmentSubjects = (row.assignments.ids ?? []).map((originalId, index) => ({ originalId, index,
        path: `subjects[${index}]`, outcome: r.assignmentEvidence.outcomes[originalId] }));
    }
    delete r.assignmentEvidence; delete r.outputVersion;
  }
  assert.deepEqual(inspectIntentDelivery(legacy, operation, f.state().configuration), expected,
    'historical unmarked v1 delivery keeps explicit exposure accounting');
});

test('retired binding entries consume full-record budget; declared-only locators do not', async t => {
  const f = await fixture(t);
  f.plan.bindings = [{ key: 'decision', unitKeys: ['color'], sourceRef: 'request:color', basis: 'inference',
    label: 'Decision', target: { namespace: f.context.model.identity.namespace, kind: 'decision', id: 'D-000001' } }];
  const operation = request(f, 'inspect-bindings');
  const actual = f.run(operation); assert.equal(actual.status, 'completed', renderDelivery(actual));
  const payload = JSON.parse(actual.text);
  payload.result.bindings[0].target.status = 'retired';
  const counted = inspectIntentDelivery(payload, operation, f.state().configuration);
  assert.deepEqual(counted.detailed, ['display-name/decisions/D-000001']);
  const limited = await fixture(t, { stdout: JSON.stringify(payload), limits: { fullRecords: 0 } });
  assert.match(limited.run(operation).reason, /full-record budget/);
  assert.deepEqual(limited.state().recordIds, []);
  payload.result.bindings[0].target = { status: 'declared-only', ref: f.plan.bindings[0].target,
    declarations: [{ target: 'decisions/entries/approval.yaml', locator: { file: 'decisions/_catalog.yaml', path: '/entries/0' } }] };
  assert.deepEqual(inspectIntentDelivery(payload, operation, f.state().configuration).detailed, []);
});

test('actual invalid plan keeps command failure; host refusals never reset limits and may be silent', async t => {
  const f = await fixture(t, { limits: { operations: 2 } });
  const result = f.run({ type: 'intent-plan', mode: 'structural', plan: {} });
  assert.equal(result.status, 'completed'); assert.equal(result.exitCode, 2);
  assert.equal(f.state().events[0].command.exitCode, 2);
  assert.equal(f.run({ type: 'intent-plan', mode: 'wrong', plan: {} }).status, 'refused');
  assert.match(f.run(request(f)).reason, /operation budget/);
  assert.equal(f.state().operations, 3);
  const silent = await fixture(t, { limits: { perResultBytes: 0, resultBytes: 0 } });
  const refused = silent.run(request(silent));
  assert.equal(renderDelivery(refused), ''); assert.equal(refused.exitCode, 2);
  assert.equal(silent.state().resultBytes, 0);
  assert.equal(silent.state().events[0].command.errorCode, 'ENOBUFS');
  assert.equal(silent.state().events[0].command.exitCode, null);
});

test('new installation files and unreadable reader-selected transport never reach the engine', async t => {
  const f = await fixture(t);
  writeFileSync(join(f.kitRoot, 'added.json'), '{}');
  assert.match(f.run(request(f)).reason, /changed/);
  assert.equal(f.state().events[0].command, null);
});

test('actual subject binding counts target and lookup candidate once, without warrant record credit', async t => {
  const f = await fixture(t);
  const lookup = f.run({ type: 'subject-lookup', text: 'Color', options: {} });
  const { context } = JSON.parse(lookup.text);
  f.plan.bindings = [{ key: 'color', unitKeys: ['color'], sourceRef: 'lookup:color', basis: 'label', label: 'Color',
    target: { namespace: context.namespace, kind: 'subject', id: 'S-000001' } }];
  const operation = { ...request(f, 'inspect-bindings'), lookupRequests: { 'lookup:color': { text: 'Color', options: {},
    expected: { namespace: context.namespace, revision: context.registryRevision, normalizerVersion: context.normalizer, documentSha256: context.registryDigest } } } };
  const result = f.run(operation);
  assert.equal(result.status, 'completed', renderDelivery(result));
  assert.equal(JSON.parse(result.text).result.bindings[0].basisCheck, 'supported');
  assert.equal(f.state().subjectIds.length, 1);
  assert.deepEqual(f.state().recordIds, []); assert.deepEqual(f.state().fullRecordIds, []);
  const changed = JSON.parse(result.text); changed.result.bindings[0].lookup.candidates[0].ref.namespace = 'foreign';
  assert.throws(() => inspectIntentDelivery(changed, operation, f.state().configuration), /namespace/);
});

test('host CLI accepts JSON requests and its delivered bytes exactly match its private receipt', async t => {
  const f = await fixture(t);
  const result = spawnSync(process.execPath, [join(repository, 'acceptance/retrieval/trial-host.js'), f.stateFile,
    'subject-lookup', JSON.stringify({ text: 'Color', options: {} })], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.state().events[0].deliveredBytes, Buffer.byteLength(result.stdout));
  assert.equal(f.state().events[0].deliveredSha256, digest(result.stdout));
  for (const path of ['validation.json', 'execution.json', 'decision-captures.json', 'unknown-knowledge/_identity.yaml']) {
    assert.match(f.run({ type: 'read', path }).reason, /outside declared inventory/);
  }
});

test('actual incomplete second branch retains and accounts the completed first branch', async t => {
  const f = await fixture(t, { limits: { perResultBytes: 131072 } });
  const second = { ...structuredClone(f.plan.branches[0]), key: 'alternative', kind: 'alternative',
    assumptions: ['An alternate interpretation is recorded separately.'] };
  second.query.budgets.maxRecords = 0;
  f.plan.branches.push(second);
  f.plan.constraints[0].queryRefs.push(...['/where', '/stores', '/view'].map(path => ({ branch: 'alternative', path })));
  const result = f.run(request(f, 'execute-queries'));
  assert.equal(result.status, 'completed', renderDelivery(result)); assert.equal(result.exitCode, 2);
  const output = JSON.parse(result.text).result;
  assert.equal(output.status, 'incomplete');
  assert.equal(output.branches[0].result.status, 'complete');
  assert.equal(output.branches[1].result.status, 'incomplete');
  assert.equal(f.state().recordIds.length, output.branches[0].result.groups.knowledge.strict.length);
  assert.ok(f.state().recordIds.length > 0);
});

test('actual predicate syntax refusals retain diagnostics in validation and execution modes', async t => {
  for (const mode of ['validate-queries', 'execute-queries']) {
    const f = await fixture(t);
    // A binding uses a typed ref; an assigned predicate requires an ID string.
    f.plan.branches[0].query.where.subject = {
      namespace: f.context.model.identity.namespace, kind: 'subject', id: 'S-000001',
    };
    const operation = request(f, mode);
    const result = f.run(operation);
    assert.equal(result.status, 'completed', renderDelivery(result));
    assert.equal(result.exitCode, 2);
    const payload = JSON.parse(result.text);
    const validation = mode === 'validate-queries' ? payload.result : payload.result.validation;
    const branch = validation.branches[0].validation;
    assert.equal(branch.ok, false);
    assert.equal(branch.validationScope, 'syntax-only');
    assert.equal(branch.diagnostics[0].code, 'invalid-subject');
    assert.equal(branch.diagnostics[0].path, '/where/subject');
    assert.equal(f.state().events[0].command.stdoutSha256, digest(result.text));
    assert.deepEqual(f.state().recordIds, []);
    assert.deepEqual(f.state().subjectIds, []);
    for (const mutate of [
      row => { row.validationScope = 'unknown-scope'; },
      row => { row.ok = true; },
      row => { row.recordBody = 'undeclared'; },
    ]) {
      const changed = structuredClone(payload);
      mutate((mode === 'validate-queries' ? changed.result : changed.result.validation).branches[0].validation);
      assert.throws(() => inspectIntentDelivery(changed, operation, f.state().configuration), /shape/);
    }
  }
});
