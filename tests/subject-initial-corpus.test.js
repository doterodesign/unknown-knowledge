import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as operationApi from '../payload/engine/lib/subject-operation.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { evaluateSubjectGovernance } from '../payload/engine/lib/subject-governance.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { guardCapturedDocument, createDocumentBudget, getDocumentBudgetUsage } from '../payload/engine/lib/document-budget.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';

const { createSubjectOperation, getSubjectOperationUsage, getSubjectOperationResources,
  admitSubjectOperationCorpus } = operationApi;
const limits = () => ({ version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152, maxOutputBytes: 262144,
  validation: { maxCaptureBytes: 33554432, maxDocumentNodes: 2000000, maxDocumentTextUnits: 67108864,
    maxSubjects: 32768, maxHistoryRows: 131072, maxValidationSteps: 5000000 },
  corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
    maxHistoryEvents: 256, maxHistoryRows: 1024, maxAssignmentsPerRecord: 16, maxAssignments: 16000, maxBodyBytesPerRecord: 16384 } });
function context(f, policy = limits()) {
  const operation = createSubjectOperation(policy);
  const result = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures, operation });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return { operation, model: result.context.model, usage: getSubjectOperationUsage(operation) };
}

test('actual initial context charges Knowledge body once while retaining full body-byte admission', (t) => {
  const f = subjectQueryDiskFixture(t);
  const before = context(f).usage;
  const file = join(f.kitRoot, 'knowledge/K-000001.md');
  writeFileSync(file, `${readFileSync(file, 'utf8')}${'x'.repeat(4096)}`);
  const after = context(f).usage;
  assert.equal(after.validation.documentTextUnits - before.validation.documentTextUnits, 4096);
  assert.equal(after.corpus.bodyBytesPerRecord - before.corpus.bodyBytesPerRecord, 4096);
});

function entries(model) {
  return [model.leaves, model.concepts, model.decisions, ...Object.values(model.proposals)]
    .flatMap((map) => [...map.values()]);
}
function visits(value) {
  const budget = createDocumentBudget({
    maxDocumentNodes: 2000000, maxDocumentTextUnits: 67108864,
  });
  guardCapturedDocument(value, budget, { phase: 'reference', allowUndefined: true });
  return getDocumentBudgetUsage(budget);
}
function savings(model) {
  const result = { documentNodes: 0, documentTextUnits: 0 };
  for (const entry of entries(model)) {
    const metadata = Object.fromEntries(Object.entries(entry).map(([key, value]) =>
      [key, key === 'record' || key === 'body' ? null : value]));
    const full = visits(entry); const shell = visits(metadata);
    for (const key of Object.keys(result)) result[key] += full[key] - shell[key];
  }
  return result;
}
function initial(f, policy = limits(), api = operationApi) {
  const operation = api.createSubjectOperation(policy);
  const model = api.loadAndAdmitSubjectOperationModel(operation, f.kitRoot);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  return { operation, model, usage: api.getSubjectOperationUsage(operation) };
}

async function allKinds(f) {
  const yaml = await import('js-yaml');
  const identity = structuredClone(f.context.model.identity);
  const publication = identity.allocations.find((a) => a.id === 'D-000001').publication;
  identity.allocations.push(...[['ontology', 'O-000001'], ['decision', 'D-000002']]
    .map(([kind, id]) => ({ kind, id, state: 'allocated', publication })));
  f.put('_identity.yaml', identity);
  const subjects = ['S-000001'];
  const ontology = ['O-000001', 'proposal:ontology:22222222-2222-4222-8222-222222222222']
    .map((id) => ({ id, term: id, class: 'general', summary: 'Meaning', status: 'draft', subjects }));
  const decisions = ['D-000002', 'proposal:decision:33333333-3333-4333-8333-333333333333']
    .map((id) => ({ id, title: id, category: 'architecture', status: 'proposed', date: '2026-09-20',
      deciders: ['steward'], context: 'Observed', decision: 'Consider', subjects }));
  for (const [store, records] of [['ontology', ontology], ['decisions', decisions]]) {
    const file = store === 'ontology' ? 'classes/grouped.yaml' : 'entries/grouped.yaml';
    const bytes = yaml.dump({ 'schema-version': 2, entries: records });
    assert.match(bytes, /\*ref_0/);
    f.put(`${store}/${file}`, bytes);
    const prior = store === 'decisions' ? JSON.parse(readFileSync(join(f.kitRoot, 'decisions/_catalog.yaml'))).entries : [];
    f.put(`${store}/_catalog.yaml`, { 'schema-version': 2, store,
      entries: [...prior, ...records.map(({ id }) => ({ id, title: id, file }))] });
  }
}

test('all canonical/proposal kinds and grouped aliases retain exact parse plus shell accounting', async (t) => {
  const f = subjectQueryDiskFixture(t); await allKinds(f);
  const referenceOperation = createSubjectOperation(limits());
  const referenceModel = loadStores(f.kitRoot, getSubjectOperationResources(referenceOperation));
  assert.equal(referenceModel.ok, true, JSON.stringify(referenceModel.diagnostics));
  admitSubjectOperationCorpus(referenceOperation, referenceModel);
  const reference = getSubjectOperationUsage(referenceOperation);
  const actual = initial(f); const removed = savings(referenceModel);
  for (const key of ['documentNodes', 'documentTextUnits']) {
    assert.equal(actual.usage.validation[key], reference.validation[key] - removed[key], key);
  }
  assert.equal(actual.usage.validation.validationSteps, reference.validation.validationSteps + entries(referenceModel).length);
  assert.deepEqual(actual.usage.corpus, reference.corpus);
  assert.deepEqual(entries(actual.model), entries(referenceModel));
  assert.equal(actual.model.proposals.ontology.size, 1);
  assert.equal(actual.model.proposals.decision.size, 1);
  assert.equal(actual.model.proposals.knowledge.size, 1);
  assert.equal(context(f).usage.corpus.complete, true);
});

test('actual context fits parse plus metadata allowance that refuses the former duplicate payload walk', (t) => {
  const f = subjectQueryDiskFixture(t);
  const full = context(f); const removed = savings(full.model);
  assert.ok(removed.documentTextUnits > 0);
  const policy = limits(); policy.validation.maxDocumentTextUnits = full.usage.validation.documentTextUnits;
  assert.equal(context(f, policy).usage.validation.documentTextUnits, policy.validation.maxDocumentTextUnits);
  const old = createSubjectOperation(policy);
  const model = loadStores(f.kitRoot, getSubjectOperationResources(old));
  admitSubjectOperationCorpus(old, model);
  assert.throws(() => evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
    identityIndex: model.identityIndex, decisionCaptures: f.decisionCaptures },
    { operationBudget: getSubjectOperationResources(old).subjectOperationBudget }),
  { code: 'subject-validation-budget', counter: 'documentTextUnits' });
});

test('initial metadata nodes/text and classification step enforce one-unit-short sticky boundaries', (t) => {
  const f = subjectQueryDiskFixture(t);
  const parseOperation = createSubjectOperation(limits());
  const parsed = loadStores(f.kitRoot, getSubjectOperationResources(parseOperation));
  const used = getSubjectOperationUsage(parseOperation).validation;
  const first = entries(parsed)[0];
  const shell = visits(Object.fromEntries(Object.entries(first).map(([key, value]) =>
    [key, key === 'record' || key === 'body' ? null : value])));
  for (const [counter, cap, phase, amount] of [
    ['validationSteps', 'maxValidationSteps', 'initial-corpus-wrapper', 1],
    ['documentNodes', 'maxDocumentNodes', 'initial-corpus-entry-metadata', shell.documentNodes],
    ['documentTextUnits', 'maxDocumentTextUnits', 'initial-corpus-entry-metadata', shell.documentTextUnits],
  ]) {
    const policy = limits(); policy.validation[cap] = used[counter] + amount - 1;
    const operation = createSubjectOperation(policy);
    assert.throws(() => operationApi.loadAndAdmitSubjectOperationModel(operation, f.kitRoot), { counter, phase });
    const failure = getSubjectOperationUsage(operation);
    assert.equal(failure.corpus, null);
    assert.throws(() => operationApi.loadAndAdmitSubjectOperationModel(operation, f.kitRoot), { counter, phase });
    assert.deepEqual(getSubjectOperationUsage(operation), failure);
  }
});

test('parse exhaustion precedes private admission and failed context attempts remain consumed', (t) => {
  const f = subjectQueryDiskFixture(t); const policy = limits(); policy.validation.maxDocumentTextUnits = 0;
  const operation = createSubjectOperation(policy);
  assert.throws(() => loadSubjectQueryContext({ root: f.root, operation }), { counter: 'documentTextUnits' });
  const failure = getSubjectOperationUsage(operation);
  assert.equal(failure.corpus, null);
  assert.notEqual(failure.failure.phase, 'initial-corpus-entry-metadata');
  assert.throws(() => loadSubjectQueryContext({ root: f.root, operation }), { counter: 'documentTextUnits' });
  assert.deepEqual(getSubjectOperationUsage(operation), failure);
});

test('public re-admission always visits unchanged and modified returned models, with no transferred proof', (t) => {
  const f = subjectQueryDiskFixture(t); const loaded = initial(f);
  const before = getSubjectOperationUsage(loaded.operation).validation;
  admitSubjectOperationCorpus(loaded.operation, loaded.model, { initialOwned: true });
  const after = getSubjectOperationUsage(loaded.operation).validation;
  admitSubjectOperationCorpus(loaded.operation, loaded.model, true);
  const repeated = getSubjectOperationUsage(loaded.operation).validation;
  for (const key of ['documentNodes', 'documentTextUnits', 'validationSteps']) {
    assert.equal(repeated[key] - after[key], after[key] - before[key]);
  }
  for (const mutation of [
    (model) => { model.leaves.get('K-000001').record.extra = 'x'.repeat(65536); },
    (model) => { model.leaves.get('K-000001').body = 'x'.repeat(65536); },
    (model) => { model.leaves.get('K-000001').extra = 'x'.repeat(65536); },
    (model) => { model.leaves = new Map([['K-000001', { ...model.leaves.get('K-000001'), record: { extra: 'x'.repeat(65536) } }]]); },
  ]) {
    const policy = limits(); policy.validation.maxDocumentTextUnits = 32768;
    const changed = initial(f, policy); mutation(changed.model);
    const fresh = createSubjectOperation(policy);
    assert.throws(() => admitSubjectOperationCorpus(fresh, changed.model, { initialOwned: true }),
      { counter: 'documentTextUnits', phase: 'corpus-entry' });
    assert.throws(() => admitSubjectOperationCorpus(changed.operation, changed.model),
      { counter: 'documentTextUnits', phase: 'corpus-entry' });
  }
});

test('unhealthy and absent-authority models retain context diagnostics without corpus completion', (t) => {
  for (const mode of ['absent', 'invalid', 'duplicate']) {
    const f = subjectQueryDiskFixture(t);
    if (mode === 'duplicate') f.put('decisions/entries/duplicate.yaml', readFileSync(join(f.kitRoot, 'decisions/entries/approval.yaml')));
    else {
      rmSync(join(f.kitRoot, 'knowledge'), { recursive: true });
      rmSync(join(f.kitRoot, 'subjects'), { recursive: true });
      if (mode === 'invalid') rmSync(join(f.kitRoot, '_identity.yaml'));
    }
    const operation = createSubjectOperation(limits());
    const actual = loadSubjectQueryContext({ root: f.root, operation });
    const reference = loadSubjectQueryContext({ root: f.root });
    assert.deepEqual(actual, reference);
    assert.equal(actual.ok, false);
    assert.equal(actual.diagnostics[0].code, mode === 'absent' ? 'unavailable-subjects' : 'invalid-model');
    assert.equal(getSubjectOperationUsage(operation).corpus, null);
  }
});

// Test-only source instrumentation retains the actual disk loader and authentic
// resource handles. Production exposes no loader callback or admission mode.
async function instrumented(injection) {
  const url = new URL('../payload/engine/lib/subject-operation.js', import.meta.url);
  let source = readFileSync(url, 'utf8').replaceAll(/from '(\.\/[^']+)'/g,
    (_, path) => `from '${new URL(path, url).href}'`);
  const needle = 'const model = loadStores(root, resources);';
  assert.equal(source.split(needle).length, 2);
  source = source.replace(needle, `${needle}\n${injection}`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('unfamiliar wrappers take the full charged guard and never invoke accessors', async (t) => {
  const f = subjectQueryDiskFixture(t);
  for (const injection of [
    "Object.assign(model.leaves.values().next().value, { extra: 'x'.repeat(65536) });",
    "Object.defineProperty(model.leaves.values().next().value, 'extra', { enumerable: true, get() { throw new Error('getter invoked'); } });",
    "Object.defineProperty(model.leaves.values().next().value, 'notation', { enumerable: true, get() { throw new Error('getter invoked'); } });",
    "model.leaves.values().next().value[Symbol('extra')] = 1;",
    "Object.setPrototypeOf(model.leaves.values().next().value, { extra: 1 });",
  ]) {
    const api = await instrumented(injection);
    const policy = limits(); policy.validation.maxDocumentTextUnits = 32768;
    const operation = api.createSubjectOperation(policy);
    assert.throws(() => api.loadAndAdmitSubjectOperationModel(operation, f.kitRoot),
      (error) => ['invalid-document', 'document-budget-exhausted', 'subject-validation-budget'].includes(error.code)
        && (error.phase === 'corpus-entry' || (error.code === 'invalid-document' && error.phase === null)));
    assert.equal(api.getSubjectOperationUsage(operation).corpus, null);
  }
  const hidden = await instrumented("Object.defineProperty(model.leaves.values().next().value, 'notation', { enumerable: false });");
  const actual = initial(f, limits(), hidden); const normal = initial(f);
  assert.ok(actual.usage.validation.documentTextUnits > normal.usage.validation.documentTextUnits,
    'a hidden slot forces the existing full entry policy, including its actual payload');
});

test('fallback classification is prepaid and whole-operation latches precede even key inspection', async (t) => {
  const f = subjectQueryDiskFixture(t);
  const parse = createSubjectOperation(limits()); loadStores(f.kitRoot, getSubjectOperationResources(parse));
  const policy = limits(); policy.validation.maxValidationSteps = getSubjectOperationUsage(parse).validation.validationSteps;
  const api = await instrumented(`const [id, entry] = model.leaves.entries().next().value;
    model.leaves.set(id, new Proxy(entry, { ownKeys() { throw new Error('classified before debit'); } }));`);
  const operation = api.createSubjectOperation(policy);
  assert.throws(() => api.loadAndAdmitSubjectOperationModel(operation, f.kitRoot), { phase: 'initial-corpus-wrapper' });
  const latched = await instrumented(`try { resources.subjectOperationBudget.charge('validationSteps', 5000001, 'prior-failure'); } catch {}
    const [id, entry] = model.leaves.entries().next().value;
    model.leaves.set(id, new Proxy(entry, { ownKeys() { throw new Error('classified after latch'); } }));`);
  assert.throws(() => initial(f, limits(), latched), { phase: 'prior-failure' });
});

test('private loading requires authentic operation and primitive root; extra arguments cannot supply a model', (t) => {
  const f = subjectQueryDiskFixture(t);
  assert.throws(() => operationApi.loadAndAdmitSubjectOperationModel({}, f.kitRoot), { code: 'invalid-subject-operation' });
  let invoked = false;
  assert.throws(() => operationApi.loadAndAdmitSubjectOperationModel(createSubjectOperation(limits()),
    { toString() { invoked = true; return f.kitRoot; } }), TypeError);
  assert.equal(invoked, false);
  const operation = createSubjectOperation(limits());
  const model = operationApi.loadAndAdmitSubjectOperationModel(operation, f.kitRoot,
    { model: {}, loader() { throw new Error('caller loader'); }, initialOwned: true });
  assert.equal(model.ok, true);
  assert.equal(getSubjectOperationUsage(operation).corpus.complete, true);
});

test('normalized Unicode body retains exact actual UTF8 cap and original assignment/hierarchy caps', (t) => {
  const f = subjectQueryDiskFixture(t, { descendants: true });
  const file = join(f.kitRoot, 'knowledge/K-000001.md');
  writeFileSync(file, `\uFEFF${readFileSync(file, 'utf8').replaceAll('\n', '\r\n')}😀é\r\n`);
  const full = initial(f);
  const body = full.model.leaves.get('K-000001').body;
  assert.equal(body.includes('\r'), false);
  assert.ok(Buffer.byteLength(body) > body.length);
  for (const [count, cap] of [
    ['bodyBytesPerRecord', 'maxBodyBytesPerRecord'], ['assignments', 'maxAssignments'],
    ['assignmentsPerRecord', 'maxAssignmentsPerRecord'], ['hierarchyDepth', 'maxHierarchyDepth'],
    ['historyRows', 'maxHistoryRows'], ['historyEvents', 'maxHistoryEvents'],
  ]) {
    const exact = limits(); exact.corpus[cap] = full.usage.corpus[count];
    assert.equal(initial(f, exact).usage.corpus[count], exact.corpus[cap]);
    exact.corpus[cap] -= 1;
    assert.throws(() => initial(f, exact), { code: 'operation-corpus-budget', counter: count });
  }
});
