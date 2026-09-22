import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as queryApi from '../payload/engine/lib/subject-query.js';
import { createSubjectOperation, getSubjectOperationResources, getSubjectOperationUsage,
  guardSubjectOperationDocument, admitSubjectOperationCorpus } from '../payload/engine/lib/subject-operation.js';
import { readSourceFileSync } from '../payload/engine/lib/source-budget.js';
import { decodeDecisionCaptures, loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';

const limits = () => ({ version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152, maxOutputBytes: 262144,
  validation: { maxCaptureBytes: 33554432, maxDocumentNodes: 2000000, maxDocumentTextUnits: 67108864,
    maxSubjects: 32768, maxHistoryRows: 131072, maxValidationSteps: 5000000 },
  corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
    maxHistoryEvents: 256, maxHistoryRows: 1024, maxAssignmentsPerRecord: 16, maxAssignments: 16000, maxBodyBytesPerRecord: 16384 } });
const cli = new URL('../payload/engine/query-subjects.js', import.meta.url).pathname;
function fixture(t, options) {
  const f = subjectQueryDiskFixture(t, options);
  f.queryFile = join(f.root, 'query.json'); writeFileSync(f.queryFile, JSON.stringify(subjectQuery()));
  f.files = { root: f.root, queryFile: f.queryFile, decisionCapturesFile: f.capturesFile, collect: 'counts' };
  return f;
}
function readJson(operation, file, label) {
  const value = JSON.parse(readSourceFileSync(file, { ...getSubjectOperationResources(operation), encoding: 'utf8' }));
  guardSubjectOperationDocument(operation, value, `parsed-${label}`); return value;
}
function exposed(f, policy = limits(), collect = 'counts') {
  const operation = createSubjectOperation(policy);
  const query = readJson(operation, f.queryFile, 'query');
  const captures = decodeDecisionCaptures(readJson(operation, f.capturesFile, 'decision-captures'), { operation });
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: captures, operation });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const result = queryApi.querySubjects(loaded.context, query, { operation, collect });
  assert.equal(result.status, 'complete');
  return { operation, result, context: loaded.context, diagnostics: loaded.diagnostics, usage: getSubjectOperationUsage(operation) };
}
function repeatedCorpus(model) {
  const operation = createSubjectOperation(limits()); admitSubjectOperationCorpus(operation, model);
  return getSubjectOperationUsage(operation).validation;
}
function runCli(f, policy, counts = true) {
  return spawnSync(process.execPath, [cli, '--root', f.root, '--query', f.queryFile,
    '--decision-captures', f.capturesFile, ...(counts ? ['--counts'] : []), '--json',
    ...(policy ? ['--operation-limits-json', JSON.stringify(policy)] : [])], { encoding: 'utf8' });
}

test('bounded CLI fits the actual file composition allowance without a second corpus pass', (t) => {
  const f = fixture(t); const file = join(f.kitRoot, 'knowledge/K-000001.md');
  writeFileSync(file, `${readFileSync(file, 'utf8')}${'x'.repeat(4096)}`);
  const old = exposed(f); const second = repeatedCorpus(old.context.model);
  const policy = limits(); policy.validation.maxDocumentTextUnits = old.usage.validation.documentTextUnits - second.documentTextUnits;
  const result = runCli(f, policy);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), JSON.parse(runCli(f).stdout));
});

test('factored private API and both CLIs agree with exact UTF-8 output admission', t => {
  const f = fixture(t);
  const recordFile = join(f.kitRoot, 'knowledge/K-000001.md');
  writeFileSync(recordFile, readFileSync(recordFile, 'utf8').replace('observed-source', 'Source café 🚦'));
  const expected = files(f, limits(), { collect: 'results' }).result;
  const text = `${JSON.stringify(expected, null, 2)}\n`;
  assert.ok(Buffer.byteLength(text) > text.length);
  const policy = limits(); policy.maxOutputBytes = Buffer.byteLength(text);
  const exact = runCli(f, policy, false);
  assert.equal(exact.status, 0, exact.stderr);
  assert.equal(exact.stdout, text);
  assert.deepEqual(JSON.parse(runCli(f, undefined, false).stdout), expected);
  policy.maxOutputBytes -= 1;
  const denied = runCli(f, policy, false);
  assert.equal(denied.status, 2);
  assert.notEqual(denied.stdout, text);
  assert.equal(JSON.parse(denied.stdout).failure.code, 'operation-output-budget');
});

function files(f, policy = limits(), extra = {}) {
  const operation = createSubjectOperation(policy);
  const result = queryApi.querySubjectFiles(operation, { ...f.files, ...extra });
  return { operation, result, usage: getSubjectOperationUsage(operation) };
}
const withDiagnostics = (reference) => reference.diagnostics.length
  ? { ...reference.result, contextDiagnostics: reference.diagnostics } : reference.result;

test('actual file composition removes exactly one complete corpus pass and preserves all other units', (t) => {
  for (const nested of [false, true]) for (const collect of ['counts', 'results']) {
    const f = fixture(t, { nested, descendants: true });
    const reference = exposed(f, limits(), collect); const second = repeatedCorpus(reference.context.model);
    const actual = files(f, limits(), { collect });
    assert.deepEqual(actual.result, withDiagnostics(reference));
    for (const [counter, value] of Object.entries(reference.usage.validation)) {
      assert.equal(actual.usage.validation[counter], value - second[counter], counter);
    }
    assert.equal(actual.usage.sourceBytes, reference.usage.sourceBytes);
    assert.deepEqual(actual.usage.corpus, reference.usage.corpus);
    assert.equal(actual.usage.outputBytesAdmitted, 0, 'API returns data; its caller owns output admission');
  }
});

test('file options are closed primitive data before loading and forged operations precede option inspection', (t) => {
  const f = fixture(t); let invoked = false;
  const accessor = { ...f.files }; Object.defineProperty(accessor, 'root', { enumerable: true, get() { invoked = true; return f.root; } });
  const hidden = { ...f.files }; Object.defineProperty(hidden, 'root', { enumerable: false });
  for (const invalid of [undefined, null, [], Object.create({ ...f.files }), accessor, hidden,
    { ...f.files, [Symbol('hidden')]: 1 }, { ...f.files, initialUnexposed: true },
    { ...f.files, model: f.context.model }, { ...f.files, loader() { invoked = true; } },
    { ...f.files, root: new String(f.root) }, { ...f.files, queryFile: '' },
    { ...f.files, decisionCapturesFile: undefined }, { ...f.files, assessmentCapturesFile: Buffer.alloc(0) },
    { ...f.files, collect: 'other' }]) {
    const operation = createSubjectOperation(limits());
    assert.throws(() => queryApi.querySubjectFiles(operation, invalid), { code: 'invalid-query-file-options' });
    assert.equal(getSubjectOperationUsage(operation).sourceBytes, 0);
    assert.equal(getSubjectOperationUsage(operation).corpus, null);
  }
  assert.equal(invoked, false);
  const trapped = new Proxy(f.files, { getPrototypeOf() { throw new Error('inspected forged input'); } });
  assert.throws(() => queryApi.querySubjectFiles({}, trapped), { code: 'invalid-subject-operation' });
  const nullOptions = Object.assign(Object.create(null), f.files); delete nullOptions.collect;
  assert.ok(queryApi.querySubjectFiles(createSubjectOperation(limits()), nullOptions).groups);
});

test('terminal returned subgraphs cannot affect later fresh operations or frozen governance Subjects', (t) => {
  const f = fixture(t);
  const identity = structuredClone(f.context.model.identity);
  identity.allocations.push({ kind: 'ontology', id: 'O-000001', state: 'allocated',
    publication: identity.allocations.find((row) => row.id === 'D-000001').publication });
  f.put('_identity.yaml', identity);
  f.put('sources/item.txt', 'Captured source\n');
  f.put('ontology/_catalog.yaml', { 'schema-version': 2, store: 'ontology',
    entries: [{ id: 'O-000001', title: 'Item', file: 'classes/item.yaml' }] });
  f.put('ontology/classes/item.yaml', { 'schema-version': 2, entries: [
    { id: 'O-000001', term: 'Item', class: 'general', summary: 'Captured', status: 'active',
      subjects: ['S-000001'], 'source-of-truth': ['sources/item.txt'] },
  ] });
  writeFileSync(f.queryFile, JSON.stringify(subjectQuery(undefined, { stores: ['knowledge', 'ontology'] })));
  const baseline = files(f, limits(), { collect: 'results' }).result;
  const original = structuredClone(baseline);
  const knowledge = baseline.groups.knowledge.strict[0]; const ontology = baseline.groups.ontology.strict[0];
  const subject = baseline.assignmentEvidence.outcomes[knowledge.assignments.ids[0]].resolution.subject;
  assert.equal(Object.isFrozen(subject), true);
  assert.throws(() => { subject.label = 'Changed'; }, TypeError);
  knowledge.sourcePointers.citations[0].source = 'caller-edit';
  ontology.sourcePointers.sourceOfTruth.push('caller-path');
  baseline.assignmentEvidence.outcomes[knowledge.assignments.ids[0]].resolution.redirects.push({ from: 'caller' });
  baseline.query.where.subject = 'S-999999'; baseline.diagnostics.push({ code: 'caller' });
  baseline.contextDiagnostics[0].message = 'caller diagnostic';
  assert.deepEqual(files(f, limits(), { collect: 'results' }).result, original);
  assert.equal(subject.label, original.assignmentEvidence.outcomes[knowledge.assignments.ids[0]].resolution.subject.label);
  for (const key of ['context', 'model', 'subjectGovernance', 'prepared', 'operation']) assert.equal(Object.hasOwn(baseline, key), false);
});

test('successful and unhealthy context attempts cannot be reused through the file API', (t) => {
  for (const unhealthy of [false, true]) {
    const f = fixture(t);
    if (unhealthy) rmSync(join(f.kitRoot, '_identity.yaml'));
    const first = files(f); assert.equal(first.result.status, unhealthy ? 'refused' : 'complete');
    assert.throws(() => queryApi.querySubjectFiles(first.operation, f.files), { code: 'operation-context-already-loaded' });
    assert.throws(() => loadSubjectQueryContext({ root: f.root, operation: first.operation }), { code: 'operation-context-already-loaded' });
  }
});

test('source, capture, document, Subject and step exact boundaries retain terminal sticky failures', (t) => {
  const f = fixture(t); const baseline = files(f);
  for (const [section, capacity, counter, used] of [
    [null, 'maxSourceBytes', 'sourceBytes', baseline.usage.sourceBytes],
    ['validation', 'maxCaptureBytes', 'captureBytes', baseline.usage.validation.captureBytes],
    ['validation', 'maxDocumentNodes', 'documentNodes', baseline.usage.validation.documentNodes],
    ['validation', 'maxDocumentTextUnits', 'documentTextUnits', baseline.usage.validation.documentTextUnits],
    ['validation', 'maxSubjects', 'subjects', baseline.usage.validation.subjects],
    ['validation', 'maxValidationSteps', 'validationSteps', baseline.usage.validation.validationSteps],
  ]) {
    const policy = limits(); (section ? policy[section] : policy)[capacity] = used;
    assert.equal(files(f, policy).result.status, 'complete', capacity);
    (section ? policy[section] : policy)[capacity] -= 1;
    const operation = createSubjectOperation(policy);
    assert.throws(() => queryApi.querySubjectFiles(operation, f.files), (error) => error.counter === counter, capacity);
    const first = getSubjectOperationUsage(operation);
    assert.throws(() => queryApi.querySubjectFiles(operation, f.files), (error) => error.counter === counter, capacity);
    assert.deepEqual(getSubjectOperationUsage(operation), first);
  }
});

test('initial unique corpus ceilings remain enforced in the private file sequence', (t) => {
  const f = fixture(t, { descendants: true }); const baseline = files(f).usage.corpus;
  for (const [counter, capacity] of Object.entries({ canonicalRecords: 'maxCanonicalRecords', authoredRecords: 'maxAuthoredRecords',
    subjects: 'maxSubjects', hierarchyDepth: 'maxHierarchyDepth', historyEvents: 'maxHistoryEvents', historyRows: 'maxHistoryRows',
    assignments: 'maxAssignments', assignmentsPerRecord: 'maxAssignmentsPerRecord', bodyBytesPerRecord: 'maxBodyBytesPerRecord' })) {
    const policy = limits(); policy.corpus[capacity] = baseline[counter] - 1;
    assert.throws(() => files(f, policy), { code: 'operation-corpus-budget', counter });
  }
});

test('read, parse and evidence transport order remains before model and query validation', (t) => {
  const f = fixture(t); const assessment = join(f.root, 'assessment.json'); writeFileSync(assessment, 'invalid');
  const absent = join(f.root, 'absent.json'); const operation = () => createSubjectOperation(limits());
  writeFileSync(f.queryFile, 'invalid');
  assert.throws(() => queryApi.querySubjectFiles(operation(), { ...f.files, decisionCapturesFile: absent }), { code: 'invalid-query-json' });
  writeFileSync(f.queryFile, JSON.stringify({ unsupported: true }));
  assert.throws(() => queryApi.querySubjectFiles(operation(), { ...f.files, decisionCapturesFile: absent }), { code: 'query-input-read-error' });
  writeFileSync(f.capturesFile, 'invalid');
  assert.throws(() => queryApi.querySubjectFiles(operation(), { ...f.files, assessmentCapturesFile: assessment }), { code: 'invalid-decision-captures-json' });
  writeFileSync(f.capturesFile, JSON.stringify([{ capture: {}, bytesBase64: 'invalid', objectFormat: 'sha1' }]));
  assert.throws(() => queryApi.querySubjectFiles(operation(), { ...f.files, assessmentCapturesFile: assessment }), { code: 'invalid-decision-captures' });
  writeFileSync(f.capturesFile, '[]');
  assert.throws(() => queryApi.querySubjectFiles(operation(), { ...f.files, assessmentCapturesFile: assessment }), { code: 'invalid-assessment-captures-json' });
  writeFileSync(assessment, '[]'); rmSync(join(f.kitRoot, '_identity.yaml'));
  const result = queryApi.querySubjectFiles(operation(), { ...f.files, assessmentCapturesFile: assessment });
  assert.equal(result.status, 'refused'); assert.equal(result.diagnostics[0].code, 'invalid-model');
});

test('missing authority and bad historical evidence keep real diagnostics with no exposed context', (t) => {
  for (const mode of ['missing', 'corrupt', 'unavailable']) {
    const f = fixture(t);
    if (mode === 'missing') {
      rmSync(join(f.kitRoot, 'knowledge'), { recursive: true }); rmSync(join(f.kitRoot, 'subjects'), { recursive: true });
    } else if (mode === 'corrupt') {
      const captures = JSON.parse(readFileSync(f.capturesFile));
      captures[0].bytesBase64 = Buffer.from('corrupt bytes').toString('base64'); writeFileSync(f.capturesFile, JSON.stringify(captures));
    } else writeFileSync(f.capturesFile, '[]');
    const result = files(f).result;
    assert.equal(result.status, 'refused'); assert.equal(result.groups, null); assert.equal(result.counts, null);
    assert.equal(result.diagnostics[0].code, { missing: 'unavailable-subjects', corrupt: 'evidence-digest-mismatch', unavailable: 'governance-unavailable' }[mode]);
    const original = structuredClone(result); result.diagnostics[0].message = 'caller changed';
    assert.deepEqual(files(f).result, original);
    assert.equal(Object.hasOwn(result, 'context'), false);
  }
});

test('public exposed-context query and validation cannot select private mode or bypass changed payload guards', (t) => {
  const f = fixture(t); const reference = exposed(f);
  const denied = queryApi.querySubjects(reference.context, subjectQuery(), { operation: reference.operation, initialUnexposed: true });
  assert.equal(denied.status, 'refused'); assert.equal(denied.diagnostics[0].code, 'invalid-query-options');
  for (const validate of [false, true]) {
    const policy = limits(); policy.validation.maxDocumentTextUnits = reference.usage.validation.documentTextUnits + 1000;
    const exposedAgain = exposed(f, policy);
    exposedAgain.context.model.leaves.get('K-000001').record.extra = 'x'.repeat(65536);
    const invoke = validate ? () => queryApi.validateSubjectQuery(subjectQuery(), exposedAgain.context,
      { operation: exposedAgain.operation, initialUnexposed: true })
      : () => queryApi.querySubjects(exposedAgain.context, subjectQuery(), { operation: exposedAgain.operation }, true);
    assert.throws(invoke, { counter: 'documentTextUnits', phase: 'corpus-entry' });
  }
});

// Source instrumentation stays test-only. It does not add any production hook.
async function instrument(injection) {
  const url = new URL('../payload/engine/lib/subject-query.js', import.meta.url);
  let source = readFileSync(url, 'utf8').replaceAll(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`);
  const needle = 'const result = runSubjectQuery(loaded.context, query, { collect: files.collect, operation }, true);';
  assert.equal(source.split(needle).length, 2);
  source = source.replace(needle, `${injection}\n${needle}`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('private sequence still binds actual authorizer/index and preserves unexpected errors', async (t) => {
  const f = fixture(t);
  const altered = await instrument("loaded.context.model.decisions.get('D-000001').record.title = 'changed after capture';");
  const mismatch = altered.querySubjectFiles(createSubjectOperation(limits()), f.files);
  assert.equal(mismatch.status, 'refused'); assert.equal(mismatch.diagnostics[0].code, 'input-mismatch');
  const broken = await instrument("throw new TypeError('file-composition-programming-error');");
  assert.throws(() => broken.querySubjectFiles(createSubjectOperation(limits()), f.files),
    { name: 'TypeError', message: 'file-composition-programming-error' });
});
