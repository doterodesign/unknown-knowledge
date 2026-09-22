import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as transport from '../payload/engine/lib/subject-query-context.js';
import { evaluateSubjectGovernance, subjectEligibility } from '../payload/engine/lib/subject-governance.js';
import { querySubjects, querySubjectFiles } from '../payload/engine/lib/subject-query.js';
import { createSubjectOperation, getSubjectOperationUsage, getSubjectOperationResources,
  reserveSubjectOperationCapture } from '../payload/engine/lib/subject-operation.js';
import { subjectReconsiderationConsumerFixture, captureTransport } from './helpers/subject-reconsideration-consumer-fixture.js';

const command = fileURLToPath(new URL('../payload/engine/query-subjects.js', import.meta.url));
const ids = result => result.groups.knowledge.strict.map(row => row.ref.id);
const runCli = (f, extra = []) => spawnSync(process.execPath, [command, '--root', f.root, '--query', f.files.query,
  '--decision-captures', f.files.decisions, '--assessment-captures', f.files.assessments,
  '--material-captures', f.files.materials, '--json', ...extra], { encoding: 'utf8', timeout: 20000 });

test('actual consumer model and governance select literal K membership before transport exists', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const evaluated = evaluateSubjectGovernance({ registry: f.model.subjectRegistry, identity: f.model.identity,
    identityIndex: f.model.identityIndex, decisionCaptures: f.decisionCaptures,
    assessmentCaptures: f.assessmentCaptures, materialCaptures: f.materialCaptures });
  assert.equal(evaluated.ok, true, JSON.stringify(evaluated.diagnostics));
  assert.equal(subjectEligibility(evaluated.governance, f.subject, { purpose: 'query' }).eligible, true);
  const result = querySubjects({ model: f.model, subjectGovernance: evaluated.governance }, f.query);
  assert.equal(result.status, 'complete', JSON.stringify(result));
  assert.deepEqual(ids(result), f.expectedIds);
});

test('new material decoder and actual loader preserve the complete retained evidence', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  assert.equal(typeof transport.decodeMaterialCaptures, 'function');
  const materialCaptures = transport.decodeMaterialCaptures(f.materialCaptures.map(captureTransport));
  const loaded = transport.loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures,
    assessmentCaptures: f.assessmentCaptures, materialCaptures });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.deepEqual(ids(querySubjects(loaded.context, f.query)), f.expectedIds);
});

test('actual query CLI transports reconsideration material', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const result = runCli(f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(ids(JSON.parse(result.stdout)), f.expectedIds);
});

for (const options of [{}, { objectFormat: 'sha256', nested: true }]) {
  test(`actual query results and counts retain bounded/unbounded parity ${JSON.stringify(options)}`, t => {
    const f = subjectReconsiderationConsumerFixture(t, options);
    const paths = ['_identity.yaml', 'subjects/registry.yaml', 'decisions/entries/review.yaml', 'knowledge/K-000001.md'];
    const before = paths.map(path => readFileSync(join(f.kitRoot, path)));
    for (const extra of [[], ['--counts']]) {
      const ordinary = runCli(f, extra);
      const bounded = runCli(f, [...extra, '--operation-limits-json', JSON.stringify(f.operationLimits)]);
      assert.equal(ordinary.status, 0, ordinary.stderr || ordinary.stdout);
      assert.equal(bounded.status, 0, bounded.stderr || bounded.stdout);
      assert.equal(bounded.stdout, ordinary.stdout);
      const result = JSON.parse(ordinary.stdout);
      assert.equal(result.counts.knowledge.strict, 1);
      assert.equal(result.counts.knowledge.possible, 0);
      if (!extra.length) assert.deepEqual(ids(result), ['K-000001']);
      else assert.equal(result.groups, null);
    }
    paths.forEach((path, index) => assert.deepEqual(readFileSync(join(f.kitRoot, path)), before[index]));
  });
}

const decodedInput = (f, operation) => {
  const options = operation ? { operation } : {};
  return { root: f.root,
    decisionCaptures: transport.decodeDecisionCaptures(JSON.parse(readFileSync(f.files.decisions, 'utf8')), options),
    assessmentCaptures: transport.decodeAssessmentCaptures(JSON.parse(readFileSync(f.files.assessments, 'utf8')), options),
    materialCaptures: transport.decodeMaterialCaptures(JSON.parse(readFileSync(f.files.materials, 'utf8')), options),
    ...(operation ? { operation } : {}) };
};

test('decoded objects are reused through load and query at independently summed exact byte capacity', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const allWire = [...JSON.parse(readFileSync(f.files.decisions)), ...JSON.parse(readFileSync(f.files.assessments))
    .flatMap(pair => [pair.registry, pair.identity]), ...JSON.parse(readFileSync(f.files.materials))];
  const bytes = allWire.reduce((sum, row) => sum + Buffer.from(row.bytesBase64, 'base64').length, 0);
  assert.equal(bytes, f.rawCaptureBytes);
  const operation = createSubjectOperation(f.operationLimits);
  const input = decodedInput(f, operation);
  const originalBuffer = input.materialCaptures[0].bytes;
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, bytes);
  const loaded = transport.loadSubjectQueryContext(input);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, bytes);
  assert.equal(input.materialCaptures[0].bytes, originalBuffer);
  assert.deepEqual(ids(querySubjects(loaded.context, f.query, { operation })), f.expectedIds);
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, bytes);
  const short = createSubjectOperation({ ...f.operationLimits,
    validation: { ...f.operationLimits.validation, maxCaptureBytes: bytes - 1 } });
  assert.throws(() => decodedInput(f, short), error => error.code === 'subject-validation-budget' && error.counter === 'captureBytes');
  assert.equal(getSubjectOperationUsage(short).failure.phase, 'transport-capture');
});

test('new material options authenticate even explicit undefined before document inspection', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  let calls = 0;
  const document = [];
  Object.defineProperty(document, '0', { enumerable: true, get() { calls++; throw new Error('row getter'); } });
  const exhausted = createSubjectOperation(f.operationLimits);
  assert.throws(() => reserveSubjectOperationCapture(exhausted, f.rawCaptureBytes + 1));
  for (const operation of [undefined, null, {}, exhausted]) {
    assert.throws(() => transport.decodeMaterialCaptures(document, { operation }), error =>
      ['invalid-subject-operation', 'subject-validation-budget'].includes(error.code));
  }
  assert.equal(calls, 0);
});

test('new material descriptor admission never invokes array, row or locator accessors', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const row = captureTransport(f.materialCaptures[0]);
  let calls = 0;
  const getter = () => { calls++; throw new Error('forbidden getter'); };
  const accessor = (object, key) => Object.defineProperty(object, key, { enumerable: true, configurable: true, get: getter });
  const customIterator = [row]; Object.defineProperty(customIterator, Symbol.iterator, { get: getter });
  const inherited = Object.assign(Object.create({ bytesBase64: row.bytesBase64 }), { capture: row.capture, objectFormat: row.objectFormat });
  const hidden = [row]; Object.defineProperty(hidden, '0', { enumerable: false });
  const extra = [row]; extra.extra = true;
  const nonplain = [row]; Object.setPrototypeOf(nonplain, Object.create(Array.prototype));
  const bad = [accessor([row], '0'), [accessor({ ...row }, 'capture')], [accessor({ ...row }, 'bytesBase64')],
    [{ ...row, capture: accessor({ ...row.capture }, 'file') }],
    [{ ...row, capture: { ...row.capture, source: accessor({ ...row.capture.source }, 'commit') } }],
    customIterator, [inherited], hidden, extra, nonplain, new Array(1), null, undefined];
  for (const document of bad) for (const bounded of [false, true]) {
    const options = bounded ? { operation: createSubjectOperation(f.operationLimits) } : {};
    assert.throws(() => transport.decodeMaterialCaptures(document, options), { code: 'invalid-material-captures' });
  }
  assert.equal(calls, 0);
});

test('bounded material document admission precedes substantive row work', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const operation = createSubjectOperation({ ...f.operationLimits,
    validation: { ...f.operationLimits.validation, maxDocumentNodes: 0 } });
  let calls = 0;
  const document = [];
  Object.defineProperty(document, '0', { enumerable: true, get() { calls++; throw new Error('getter'); } });
  assert.throws(() => transport.decodeMaterialCaptures(document, { operation }), error =>
    error.code === 'subject-validation-budget' && error.phase === 'material-transport');
  assert.equal(calls, 0);
});

test('material loader defaults only omission and refuses raw getters before admission', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  let calls = 0;
  const getter = () => { calls++; throw new Error('raw getter'); };
  const base = { root: f.root, decisionCaptures: f.decisionCaptures, assessmentCaptures: f.assessmentCaptures };
  for (const bounded of [false, true]) {
    const host = bounded ? { operation: createSubjectOperation(f.operationLimits) } : {};
    const omitted = transport.loadSubjectQueryContext({ ...base, ...host });
    assert.equal(omitted.ok, true);
    assert.equal(querySubjects(omitted.context, f.query, host).diagnostics[0].code, 'governance-unavailable');
    const hidden = Object.defineProperty({ ...base }, 'materialCaptures', { value: f.materialCaptures });
    const inherited = Object.assign(Object.create({ materialCaptures: f.materialCaptures }), base);
    const inputs = [undefined, null].map(materialCaptures => ({ ...base, materialCaptures }));
    inputs.push(hidden, inherited, Object.defineProperty({ ...base }, 'materialCaptures', { enumerable: true, get: getter }),
      { ...base, materialCaptures: [Object.defineProperty({ ...f.materialCaptures[0] }, 'bytes', { enumerable: true, get: getter })] });
    for (const input of inputs) {
      if (bounded) input.operation = createSubjectOperation(f.operationLimits);
      const result = transport.loadSubjectQueryContext(input);
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics[0].code, 'invalid-material-captures');
      if (bounded) assert.equal(getSubjectOperationUsage(input.operation).validation.captureBytes, 0);
    }
  }
  assert.equal(calls, 0);
});

test('material transport retains canonical bytes without adjudicating duplicate content', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const row = captureTransport(f.materialCaptures[0]);
  for (const bytesBase64 of ['???', 'Zg', 'Zh==', 'Zm9v\n', 42]) {
    assert.throws(() => transport.decodeMaterialCaptures([{ ...row, bytesBase64 }]), { code: 'invalid-material-captures' });
  }
  const decoded = transport.decodeMaterialCaptures([row, row]);
  assert.equal(decoded.length, 2);
  assert.notEqual(decoded[0], decoded[1]); assert.notEqual(decoded[0].bytes, decoded[1].bytes);
  assert.deepEqual(decoded[0].bytes, f.materialCaptures[0].bytes);
});

test('real governance refuses corrupt, duplicate and unused material while omission stays unavailable', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const original = f.materialCaptures.map(captureTransport);
  const cases = [[], [{ ...original[0], bytesBase64: Buffer.from('corrupt').toString('base64') }],
    [original[0], original[0]], [...original, captureTransport(f.assessmentCaptures[0].identity)]];
  for (const document of cases) {
    f.writeJson('materials.json', document);
    for (const bounded of [false, true]) {
      // Duplicates have their own decoded allocation; give semantic negatives room to reach governance.
      const limits = structuredClone(f.operationLimits); limits.validation.maxCaptureBytes *= 4;
      const result = runCli(f, bounded ? ['--operation-limits-json', JSON.stringify(limits)] : []);
      assert.equal(result.status, 2, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.status, 'refused');
      assert.equal(payload.diagnostics[0].code, document.length ? 'invalid-evidence' : 'governance-unavailable');
    }
  }
});

test('material file option is closed primitive data and all path fields validate independently', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const files = { root: f.root, queryFile: f.files.query, decisionCapturesFile: f.files.decisions,
    assessmentCapturesFile: f.files.assessments, materialCapturesFile: f.files.materials };
  let calls = 0;
  for (const key of ['root', 'queryFile', 'decisionCapturesFile', 'assessmentCapturesFile', 'materialCapturesFile']) {
    for (const value of [null, undefined, '', 1, {}]) {
      assert.throws(() => querySubjectFiles(createSubjectOperation(f.operationLimits), { ...files, [key]: value }), { code: 'invalid-query-file-options' });
    }
  }
  const accessor = Object.defineProperty({ ...files }, 'materialCapturesFile', { enumerable: true, get() { calls++; throw new Error('file getter'); } });
  assert.throws(() => querySubjectFiles(createSubjectOperation(f.operationLimits), accessor), { code: 'invalid-query-file-options' });
  assert.equal(calls, 0);
  const complete = querySubjectFiles(createSubjectOperation(f.operationLimits), files);
  assert.deepEqual(ids(complete), f.expectedIds);
});

test('source-less declared material remains source-less through real consumer verification', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const registryFile = join(f.kitRoot, 'subjects/registry.yaml');
  const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
  const event = registry.history.at(-1);
  delete event.reconsideration.sources[0].capture.source;
  // The fixture's wire event must be parsed to its actual domain keys before resealing.
  const original = f.model.subjectRegistry.document.history.at(-1);
  const domain = structuredClone(original); delete domain.reconsideration.sources[0].capture.source;
  const { review, ...body } = domain;
  event.review['change-digest'] = canonicalSha256(body);
  f.writeJson(f.kitRoot === f.root ? 'subjects/registry.yaml' : 'unknown-knowledge/subjects/registry.yaml', registry);
  const material = captureTransport(f.materialCaptures[0]); delete material.capture.source;
  f.writeJson('materials.json', [material]);
  const loaded = transport.loadSubjectQueryContext(decodedInput(f));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.equal(Object.hasOwn(loaded.context.model.subjectRegistry.document.history.at(-1).reconsideration.sources[0].capture, 'source'), false);
  assert.deepEqual(ids(querySubjects(loaded.context, f.query)), f.expectedIds);
});

test('raw material failure consumes the context attempt before any retry inspection', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const operation = createSubjectOperation(f.operationLimits);
  const first = transport.loadSubjectQueryContext({ root: f.root, materialCaptures: null, operation });
  assert.equal(first.diagnostics[0].code, 'invalid-material-captures');
  let calls = 0;
  const retry = { root: f.root, operation };
  Object.defineProperty(retry, 'materialCaptures', { enumerable: true, get() { calls++; throw new Error('retry getter'); } });
  const priorBytes = getSubjectOperationUsage(operation).validation.captureBytes;
  assert.throws(() => transport.loadSubjectQueryContext(retry), { code: 'operation-context-already-loaded' });
  assert.equal(calls, 0);
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, priorBytes);
});

test('root refusal precedes raw material shape and successful context forbids another admission', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const operation = createSubjectOperation(f.operationLimits);
  const invalid = transport.loadSubjectQueryContext({ root: '', operation, materialCaptures: null });
  assert.equal(invalid.diagnostics[0].code, 'invalid-context-options');
  const active = createSubjectOperation(f.operationLimits);
  const input = decodedInput(f, active);
  assert.equal(transport.loadSubjectQueryContext(input).ok, true);
  const prior = getSubjectOperationUsage(active).validation.captureBytes;
  assert.throws(() => transport.loadSubjectQueryContext({ root: f.root, operation: active,
    materialCaptures: [{ ...f.materialCaptures[0], bytes: Buffer.from(f.materialCaptures[0].bytes) }] }),
  { code: 'operation-context-already-loaded' });
  assert.equal(getSubjectOperationUsage(active).validation.captureBytes, prior);
});

test('bounded zero-byte raw rows are admitted before metadata inspection', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const operation = createSubjectOperation({ ...f.operationLimits,
    validation: { ...f.operationLimits.validation, maxCaptureBytes: 0, maxValidationSteps: 0 } });
  let calls = 0;
  const capture = { ...f.materialCaptures[0], bytes: Buffer.alloc(0) };
  Object.defineProperty(capture.capture = { ...capture.capture }, 'file', { enumerable: true,
    get() { calls++; throw new Error('raw locator getter'); } });
  assert.throws(() => transport.loadSubjectQueryContext({ root: f.root, operation,
    materialCaptures: [capture, { ...capture }] }), error => error.code === 'subject-validation-budget'
      && error.phase === 'material-context-rows' && error.counter === 'validationSteps');
  assert.equal(calls, 0);
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, 0);
});

test('bounded raw metadata guard precedes locator semantics and excludes Buffer bytes', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const operation = createSubjectOperation({ ...f.operationLimits,
    validation: { ...f.operationLimits.validation, maxDocumentNodes: 0 } });
  assert.throws(() => transport.loadSubjectQueryContext({ root: f.root, operation,
    materialCaptures: [{ ...f.materialCaptures[0], capture: { ...f.materialCaptures[0].capture, file: '../invalid' } }] }),
  error => error.code === 'subject-validation-budget' && error.phase === 'material-context-metadata');
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, 0);
});
