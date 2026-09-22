import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createSubjectOperation, parseSubjectOperationLimitsJson, getSubjectOperationUsage,
  writeSubjectOperationOutput, assertSubjectOperation, SUBJECT_OPERATION_BOOTSTRAP_BYTES } from '../payload/engine/lib/subject-operation.js';
import { readFileSync, writeFileSync, readdirSync, statSync, cpSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, queryBudgets } from './helpers/subject-query-fixture.js';
import { decodeDecisionCaptures, decodeAssessmentCaptures, loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { querySubjects, validateSubjectQuery } from '../payload/engine/lib/subject-query.js';
import { guardSubjectOperationDocument, getSubjectOperationResources } from '../payload/engine/lib/subject-operation.js';
import { readSubjectRegistry } from '../payload/engine/lib/subject-registry-reader.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';
import { createDocumentBudget, guardCapturedDocument } from '../payload/engine/lib/document-budget.js';
import { createSourceBudget, getSourceBudgetUsage } from '../payload/engine/lib/source-budget.js';
import { assignmentEventFixture } from './helpers/assignment-event-fixture.js';
import { subjectPromotionFixture } from './helpers/subject-promotion-fixture.js';

const cli = new URL('../payload/engine/query-subjects.js', import.meta.url).pathname;
test('opt-in bootstrap failure is exit two without an unbounded application epilogue', () => {
  const result = spawnSync(process.execPath, [cli, '--operation-limits-json', 'invalid-json'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});


const limits = () => ({ version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152, maxOutputBytes: 262144,
  validation: { maxCaptureBytes: 33554432, maxDocumentNodes: 2000000, maxDocumentTextUnits: 67108864,
    maxSubjects: 32768, maxHistoryRows: 131072, maxValidationSteps: 5000000 },
  corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
    maxHistoryEvents: 256, maxHistoryRows: 1024, maxAssignmentsPerRecord: 16, maxAssignments: 16000, maxBodyBytesPerRecord: 16384 } });

test('inline bootstrap counts UTF8 before parsing and has a fixed non-self-defined ceiling', () => {
  const exact = '{}'.padEnd(SUBJECT_OPERATION_BOOTSTRAP_BYTES, ' ');
  assert.deepEqual(parseSubjectOperationLimitsJson(exact), {});
  assert.throws(() => parseSubjectOperationLimitsJson(`${exact} `), { code: 'operation-bootstrap-budget' });
  assert.throws(() => parseSubjectOperationLimitsJson('😀'.repeat(4097)), { code: 'operation-bootstrap-budget' });
  assert.throws(() => parseSubjectOperationLimitsJson('invalid'), { code: 'invalid-operation-limits' });
});

test('operation capacities and handles are closed and copied snapshots cannot alter allowances', () => {
  const authored = limits(); const operation = createSubjectOperation(authored);
  authored.maxOutputBytes = 0;
  assert.equal(Object.isFrozen(operation), true);
  assert.equal(getSubjectOperationUsage(operation).limits.maxOutputBytes, 262144);
  const usage = getSubjectOperationUsage(operation); usage.limits.maxOutputBytes = 1;
  assert.equal(getSubjectOperationUsage(operation).limits.maxOutputBytes, 262144);
  assert.throws(() => getSubjectOperationUsage({ ...operation }), { code: 'invalid-subject-operation' });
  for (const invalid of [{ ...limits(), extra: 0 }, { ...limits(), maxSourceBytes: -1 },
    { ...limits(), validation: { ...limits().validation, maxSubjects: 1.5 } }]) {
    assert.throws(() => createSubjectOperation(invalid), { code: 'invalid-operation-limits' });
  }
});

test('output shortfall is a host latch with no admitted or written prefix; failure snapshots survive', () => {
  const operation = createSubjectOperation({ ...limits(), maxOutputBytes: 0 });
  assert.throws(() => writeSubjectOperationOutput(operation, 'x\n'), { code: 'operation-output-budget' });
  assert.throws(() => assertSubjectOperation(operation), { code: 'operation-output-budget' });
  const usage = getSubjectOperationUsage(operation);
  assert.equal(usage.outputBytesAdmitted, 0); assert.equal(usage.outputBytesWritten, 0);
  assert.equal(usage.failure.attempted, 2);
  writeSubjectOperationOutput(operation, '');
  assert.throws(() => writeSubjectOperationOutput(operation, Buffer.alloc(0)), TypeError);
  assert.throws(() => writeSubjectOperationOutput(operation, '', { fd: 3 }), TypeError);
});

const operationModule = new URL('../payload/engine/lib/subject-operation.js', import.meta.url).href;
function outputProbe({ text, capacity, close = false }) {
  const code = `import {closeSync} from 'node:fs';
    import {createSubjectOperation,writeSubjectOperationOutput,getSubjectOperationUsage} from ${JSON.stringify(operationModule)};
    const operation=createSubjectOperation(${JSON.stringify({ ...limits(), maxOutputBytes: capacity })});
    ${close ? 'closeSync(1);' : ''}
    let failure=null;try{writeSubjectOperationOutput(operation,${JSON.stringify(text)});}catch(error){failure=error.code;}
    process.stderr.write(JSON.stringify({failure,usage:getSubjectOperationUsage(operation)}));`;
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: code, encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return { ...result, report: JSON.parse(result.stderr) };
}

test('output admission includes exact UTF8/newline and covers the whole large envelope', () => {
  const exact = outputProbe({ text: 'µ\n', capacity: 3 });
  assert.equal(exact.stdout, 'µ\n'); assert.equal(exact.report.failure, null);
  assert.equal(exact.report.usage.outputBytesAdmitted, 3); assert.equal(exact.report.usage.outputBytesWritten, 3);
  const short = outputProbe({ text: 'µ\n', capacity: 2 });
  assert.equal(short.stdout, ''); assert.equal(short.report.failure, 'operation-output-budget');
  const large = outputProbe({ text: 'a'.repeat(131072), capacity: 131072 });
  assert.equal(large.stdout.length, 131072); assert.equal(large.report.usage.outputBytesWritten, 131072);
});

test('physical output failure retains admitted bytes and reports written-byte uncertainty', () => {
  const result = outputProbe({ text: 'abc', capacity: 3, close: true });
  assert.equal(result.report.failure, 'operation-output-write');
  assert.equal(result.report.usage.outputBytesAdmitted, 3);
  assert.equal(result.report.usage.outputBytesWritten, 0);
  assert.equal(result.report.usage.outputWriteUncertain, true);
});


function loadBound(f, operation, captures = f.decisionCaptures) {
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: captures, operation });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics)); return loaded.context;
}
function runBound(f, policy, query = subjectQuery()) {
  const path = join(f.root, 'query.json'); writeFileSync(path, JSON.stringify(query));
  return spawnSync(process.execPath, [cli, '--root', f.root, '--query', path, '--decision-captures', f.capturesFile,
    '--json', ...(policy ? ['--operation-limits-json', JSON.stringify(policy)] : [])], { encoding: 'utf8' });
}

test('actual decode, loader, proof, validation and execution share capture and visit ownership', (t) => {
  const f = subjectQueryDiskFixture(t);
  const policy = limits(); policy.validation.maxCaptureBytes = f.decisionCaptures[0].bytes.length;
  const operation = createSubjectOperation(policy);
  const captures = decodeDecisionCaptures(JSON.parse(readFileSync(f.capturesFile, 'utf8')), { operation });
  const context = loadBound(f, operation, captures);
  const loaded = getSubjectOperationUsage(operation);
  assert.equal(loaded.validation.captureBytes, policy.validation.maxCaptureBytes);
  assert.equal(validateSubjectQuery(subjectQuery(), context, { operation }).ok, true);
  const first = querySubjects(context, subjectQuery(), { operation });
  assert.equal(first.status, 'complete'); assert.equal(first.counts.knowledge.strict, 2);
  const used = getSubjectOperationUsage(operation);
  assert.ok(used.validation.documentNodes > loaded.validation.documentNodes);
  assert.ok(used.validation.validationSteps > loaded.validation.validationSteps);
  assert.equal(used.sourceBytes, loaded.sourceBytes);
  assert.equal(used.validation.captureBytes, loaded.validation.captureBytes);
  querySubjects(context, subjectQuery(), { operation });
  assert.ok(getSubjectOperationUsage(operation).validation.documentNodes > used.validation.documentNodes);
});

test('single capture and aggregate raw admission refuse before decoding a disallowed item', (t) => {
  const f = subjectQueryDiskFixture(t); const transport = JSON.parse(readFileSync(f.capturesFile, 'utf8'));
  for (const kind of ['single', 'aggregate']) {
    const policy = limits();
    if (kind === 'single') policy.maxSingleCaptureBytes = f.decisionCaptures[0].bytes.length - 1;
    else policy.validation.maxCaptureBytes = f.decisionCaptures[0].bytes.length - 1;
    const operation = createSubjectOperation(policy);
    assert.throws(() => decodeDecisionCaptures(transport, { operation }),
      { code: kind === 'single' ? 'single-capture-budget' : 'subject-validation-budget' });
    assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, 0);
  }
});

test('preloaded capture changes cannot reuse an earlier decoder admission', (t) => {
  const f = subjectQueryDiskFixture(t); const policy = limits();
  policy.validation.maxCaptureBytes = f.decisionCaptures[0].bytes.length;
  const operation = createSubjectOperation(policy);
  const captures = decodeDecisionCaptures(JSON.parse(readFileSync(f.capturesFile, 'utf8')), { operation });
  captures[0].bytes[0] ^= 1;
  assert.throws(() => loadBound(f, operation, captures), { code: 'subject-validation-budget' });
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, policy.validation.maxCaptureBytes);
});

test('fresh authentic handles, copied contexts and omitted operations cannot reset loaded context work', (t) => {
  const f = subjectQueryDiskFixture(t); const operation = createSubjectOperation(limits());
  const context = loadBound(f, operation);
  assert.throws(() => loadBound(f, operation), { code: 'operation-context-already-loaded' });
  for (const invoke of [
    () => querySubjects(context, subjectQuery(), { operation: createSubjectOperation(limits()) }),
    () => querySubjects({ ...context }, subjectQuery(), { operation }),
    () => querySubjects(context, subjectQuery()),
    () => validateSubjectQuery(subjectQuery(), f.context, { operation: createSubjectOperation(limits()) }),
  ]) assert.throws(invoke, { code: 'operation-context-mismatch' });
});

test('document exhaustion between phases cannot become a domain incomplete result or reset', (t) => {
  const f = subjectQueryDiskFixture(t); const operation = createSubjectOperation(limits());
  const context = loadBound(f, operation);
  assert.throws(() => guardSubjectOperationDocument(operation, Array(65536).fill('x'.repeat(1024)), 'over-limit'),
    { code: 'subject-validation-budget' });
  const before = getSubjectOperationUsage(operation);
  assert.throws(() => querySubjects(context, subjectQuery(), { operation }), { code: 'subject-validation-budget' });
  assert.deepEqual(getSubjectOperationUsage(operation), before);
  assert.throws(() => getSubjectOperationResources(operation), { code: 'subject-validation-budget' });
});

test('every unique corpus ceiling is enforced across all captured logical records and proposals', (t) => {
  const f = subjectQueryDiskFixture(t, { descendants: true }); const operation = createSubjectOperation(limits());
  loadBound(f, operation); const counts = getSubjectOperationUsage(operation).corpus;
  assert.equal(counts.canonicalRecords, 7); assert.equal(counts.authoredRecords, 8);
  for (const [counter, capacity] of Object.entries({ canonicalRecords: 'maxCanonicalRecords', authoredRecords: 'maxAuthoredRecords',
    subjects: 'maxSubjects', hierarchyDepth: 'maxHierarchyDepth', historyEvents: 'maxHistoryEvents', historyRows: 'maxHistoryRows',
    assignments: 'maxAssignments', assignmentsPerRecord: 'maxAssignmentsPerRecord', bodyBytesPerRecord: 'maxBodyBytesPerRecord' })) {
    assert.ok(counts[counter] > 0, counter);
    const policy = limits(); policy.corpus[capacity] = counts[counter] - 1;
    assert.throws(() => loadBound(f, createSubjectOperation(policy)),
      (error) => error.code === 'operation-corpus-budget' && error.counter === counter, counter);
  }
});

test('opt-in CLI preserves complete and incomplete domain JSON; exact output boundary is all or nothing', (t) => {
  const f = subjectQueryDiskFixture(t); const baseline = runBound(f);
  assert.equal(baseline.status, 0, baseline.stderr);
  const policy = limits(); policy.maxOutputBytes = Buffer.byteLength(baseline.stdout);
  const exact = runBound(f, policy); assert.equal(exact.status, 0, exact.stderr);
  assert.equal(exact.stdout, baseline.stdout); assert.equal(exact.stderr, '');
  const short = runBound(f, { ...policy, maxOutputBytes: policy.maxOutputBytes - 1 });
  assert.equal(short.status, 2); assert.equal(short.stderr, '');
  assert.deepEqual(JSON.parse(short.stdout), { version: 1, status: 'host-failed', failure: {
    kind: 'admission-refused', code: 'operation-output-budget', counter: 'outputBytes', phase: 'output-admission',
  } });
  const partial = runBound(f, limits(), subjectQuery(undefined, { budgets: { ...queryBudgets, maxRecords: 0 } }));
  assert.equal(partial.status, 2); assert.equal(JSON.parse(partial.stdout).status, 'incomplete');
});

test('opt-in CLI shares actual source bytes for query, proof transport and every loaded source', (t) => {
  const f = subjectQueryDiskFixture(t); runBound(f);
  const size = (root) => readdirSync(root).reduce((total, name) => {
    const path = join(root, name); const stat = statSync(path);
    return total + (stat.isDirectory() ? size(path) : stat.size);
  }, 0);
  const policy = limits(); policy.maxSourceBytes = size(f.root);
  const exact = runBound(f, policy); assert.equal(exact.status, 0, exact.stderr);
  const short = runBound(f, { ...policy, maxSourceBytes: policy.maxSourceBytes - 1 });
  assert.equal(short.status, 2); assert.equal(short.stderr, '');
  assert.deepEqual(JSON.parse(short.stdout), { version: 1, status: 'host-failed', failure: {
    kind: 'admission-refused', code: 'source-budget-exhausted', counter: 'sourceBytes', phase: 'source-read',
  } });
});

test('large canonical capture transport reaches the exact single-item boundary without recursive regex failure', (t) => {
  const f = subjectQueryDiskFixture(t); const transport = JSON.parse(readFileSync(f.capturesFile, 'utf8'));
  transport[0].bytesBase64 = Buffer.alloc(2097152).toString('base64');
  const operation = createSubjectOperation(limits());
  const decoded = decodeDecisionCaptures(transport, { operation });
  assert.equal(decoded[0].bytes.length, 2097152);
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, 2097152);
  transport[0].bytesBase64 = Buffer.alloc(2097153).toString('base64');
  const denied = createSubjectOperation(limits());
  assert.throws(() => decodeDecisionCaptures(transport, { operation: denied }), { code: 'single-capture-budget' });
  assert.equal(getSubjectOperationUsage(denied).validation.captureBytes, 0);
});


test('merged registry reader requires one neutral document handle and never guards the wire twice', (t) => {
  const f = subjectQueryDiskFixture(t);
  const operationBudget = createSubjectValidationBudget(limits().validation);
  const sourceBudget = createSourceBudget({ maxSourceBytes: 33554432 });
  assert.throws(() => readSubjectRegistry({ kitDir: f.kitRoot, identity: f.context.model.identity,
    sourceBudget, operationBudget, documentBudget: createDocumentBudget({ maxDocumentNodes: 1, maxDocumentTextUnits: 1 }) }),
  { code: 'ambiguous-document-budget' });
  assert.equal(getSourceBudgetUsage(sourceBudget).sourceBytes, 0);
  assert.equal(readSubjectRegistry({ kitDir: f.kitRoot, identity: f.context.model.identity,
    sourceBudget, operationBudget, documentBudget: operationBudget.documentBudget }).ok, true);
  const standalone = createSubjectValidationBudget(limits().validation);
  assert.equal(readSubjectRegistry({ kitDir: f.kitRoot, identity: f.context.model.identity, operationBudget: standalone }).ok, true);
  assert.deepEqual(operationBudget.used, standalone.used);
});


function addAssignmentHistory(f) {
  const namespace = f.context.model.identity.namespace;
  const ref = (id) => ({ namespace, kind: 'knowledge', id });
  const state = (ids) => ({ state: 'known', ids });
  const capture = { file: 'knowledge/one.md', blob: 'a'.repeat(40), sha256: 'b'.repeat(64),
    source: { commit: 'c'.repeat(40), tree: 'd'.repeat(40) } };
  // Actual structural history inputs, not publication or capture-integrity proof.
  f.put('subjects/_assignments/_baselines.yaml', { 'schema-version': 1, namespace, baselines: [
    { ref: ref('K-000001'), state: state(['S-000001']), capture },
    { ref: ref('K-000002'), state: state(['S-000001', 'S-000002', 'S-000003']), capture },
  ] });
  for (const suffix of ['1', '2']) {
    const event = `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
    f.put(`subjects/_assignments/${event}.yaml`, assignmentEventFixture({ namespace, event, rows: [
      { ref: ref('K-000001'), before: state(['S-000001']), after: state(['S-000001']),
        'before-revision': 0, 'after-revision': 0, disposition: 'unchanged', reason: 'Retain reviewed classification.' },
    ] }));
  }
}

test('combined history admission counts unchanged event rows and baseline declarations without deduplicating refs', (t) => {
  const f = subjectQueryDiskFixture(t); addAssignmentHistory(f);
  const admitted = createSubjectOperation(limits()); loadBound(f, admitted);
  const counts = getSubjectOperationUsage(admitted).corpus;
  assert.deepEqual({ events: counts.historyEvents, rows: counts.historyRows,
    subjectEvents: counts.subjectHistoryEvents, subjectRows: counts.subjectHistoryRows,
    assignmentEvents: counts.assignmentEvents, assignmentRows: counts.assignmentRows, baselines: counts.assignmentBaselines },
  { events: 3, rows: 7, subjectEvents: 1, subjectRows: 3, assignmentEvents: 2, assignmentRows: 2, baselines: 2 });
  const eventLimit = limits(); eventLimit.corpus.maxHistoryEvents = 2;
  assert.throws(() => loadBound(f, createSubjectOperation(eventLimit)),
    (error) => error.code === 'operation-corpus-budget' && error.counter === 'historyEvents');
  const policy = limits(); policy.corpus.maxHistoryRows = 6; // 3 registry + 2 unchanged rows + 2 baselines = 7
  assert.throws(() => loadBound(f, createSubjectOperation(policy)),
    (error) => error.code === 'operation-corpus-budget' && error.counter === 'historyRows');
});

test('a failed context request consumes the one capture attempt without granting a context', (t) => {
  const f = subjectQueryDiskFixture(t); const operation = createSubjectOperation(limits());
  assert.equal(loadSubjectQueryContext({ root: '', operation }).ok, false);
  assert.throws(() => loadBound(f, operation), { code: 'operation-context-already-loaded' });
});


test('actual retained assessment pairs share predecode admission and prove the promoted query subject', (t) => {
  const f = subjectPromotionFixture(t);
  const operation = createSubjectOperation(limits());
  const wire = ({ capture, bytes, objectFormat }) => ({ capture, bytesBase64: bytes.toString('base64'), objectFormat });
  const decisions = decodeDecisionCaptures(f.decisionCaptures.map(wire), { operation });
  const assessments = decodeAssessmentCaptures([{ registry: wire(f.beforeCaptures.registry), identity: wire(f.beforeCaptures.identity) }], { operation });
  const expected = f.decisionCaptures.reduce((sum, capture) => sum + capture.bytes.length, 0)
    + f.beforeCaptures.registry.bytes.length + f.beforeCaptures.identity.bytes.length;
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: decisions, assessmentCaptures: assessments, operation });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const result = querySubjects(loaded.context, subjectQuery(undefined, { stores: ['decisions'], view: 'all' }), { operation });
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.equal(getSubjectOperationUsage(operation).validation.captureBytes, expected);
});


test('failure output cannot replace an earlier direct neutral admission failure', () => {
  const policy = limits(); policy.maxOutputBytes = 0; policy.validation.maxDocumentNodes = 0;
  const operation = createSubjectOperation(policy);
  const resources = getSubjectOperationResources(operation);
  assert.throws(() => guardCapturedDocument({}, resources.documentBudget, { phase: 'external-parser' }),
    { code: 'document-budget-exhausted' });
  assert.throws(() => writeSubjectOperationOutput(operation, 'failure'), { code: 'subject-validation-budget' });
  assert.equal(getSubjectOperationUsage(operation).failure.phase, 'external-parser');
  assert.equal(getSubjectOperationUsage(operation).outputBytesAdmitted, 0);
});


test('actual bounded entry identifies an unexpected query bug and respects zero output while API keeps the exception', (t) => {
  const f = subjectQueryDiskFixture(t);
  const runtime = join(f.root, 'test-runtime'); mkdirSync(join(runtime, 'payload'), { recursive: true });
  cpSync(new URL('../payload/engine', import.meta.url), join(runtime, 'payload/engine'), { recursive: true });
  cpSync(new URL('../payload/schemas', import.meta.url), join(runtime, 'payload/schemas'), { recursive: true });
  writeFileSync(join(runtime, 'package.json'), JSON.stringify({ type: 'module' }));
  symlinkSync(new URL('../node_modules', import.meta.url).pathname, join(runtime, 'node_modules'));
  const queryModule = join(runtime, 'payload/engine/lib/subject-query.js');
  const original = readFileSync(queryModule, 'utf8');
  // Inject in the shared executor reached by both the file and exposed-context APIs.
  const marker = 'function runSubjectQuery(context, authored, options, initialUnexposed = false) {';
  assert.ok(original.includes(marker));
  writeFileSync(queryModule, original.replace(marker, `${marker}\n  throw new TypeError('operation-test-programming-error');`));
  const queryFile = join(f.root, 'bug-query.json'); writeFileSync(queryFile, JSON.stringify(subjectQuery()));
  const args = ['--root', f.root, '--query', queryFile, '--decision-captures', f.capturesFile, '--json',
    '--operation-limits-json', JSON.stringify(limits())];
  const entry = join(runtime, 'payload/engine/query-subjects.js');
  const result = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(report).sort(), ['failure', 'status', 'version']);
  assert.equal(report.version, 1); assert.equal(report.status, 'host-failed');
  assert.equal(report.failure.kind, 'internal-error'); assert.equal(report.failure.name, 'TypeError');
  assert.equal(report.failure.message, 'operation-test-programming-error');
  assert.match(report.failure.stack, /TypeError: operation-test-programming-error/);
  assert.ok(Buffer.byteLength(result.stdout) <= limits().maxOutputBytes);
  const zeroArgs = [...args.slice(0, -1), JSON.stringify({ ...limits(), maxOutputBytes: 0 })];
  const zero = spawnSync(process.execPath, [entry, ...zeroArgs], { encoding: 'utf8' });
  assert.equal(zero.status, 2); assert.equal(zero.stdout, ''); assert.equal(zero.stderr, '');
  const module = pathToFileURL(join(runtime, 'payload/engine/commands/query-subjects.js')).href;
  const code = `import {main} from ${JSON.stringify(module)};try{main(${JSON.stringify(args)});process.exitCode=1;}
    catch(error){if(!(error instanceof TypeError)||error.message!=='operation-test-programming-error')throw error;}`;
  const api = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(api.status, 0, api.stderr); assert.equal(api.stdout, ''); assert.equal(api.stderr, '');
});

test('expected post-admission failure has a stable typed receipt only when its whole bytes fit', (t) => {
  const f = subjectQueryDiskFixture(t);
  const expected = `${JSON.stringify({ version: 1, status: 'host-failed', failure: {
    kind: 'admission-refused', code: 'source-budget-exhausted', counter: 'sourceBytes', phase: 'source-read',
  } })}\n`;
  const policy = limits(); policy.maxSourceBytes = 0; policy.maxOutputBytes = Buffer.byteLength(expected);
  const exact = runBound(f, policy);
  assert.equal(exact.status, 2); assert.equal(exact.stdout, expected); assert.equal(exact.stderr, '');
  const short = runBound(f, { ...policy, maxOutputBytes: policy.maxOutputBytes - 1 });
  assert.equal(short.status, 2); assert.equal(short.stdout, ''); assert.equal(short.stderr, '');
});

test('shared bounded harness opts in explicitly and maps escaped bootstrap failures to exit two', async () => {
  const { boot } = await import('../payload/engine/lib/boot.js');
  const command = { USAGE: 'test usage', main(argv, options) {
    assert.deepEqual(argv, process.argv.slice(2));
    assert.deepEqual(options, { reportErrors: true });
    return 0;
  } };
  assert.equal(await boot('test-operation', command, { bounded: true }), 0);
  command.main = async () => { throw new TypeError('before an operation exists'); };
  assert.equal(await boot('test-operation', command, { bounded: true }), 2);
});

test('shared receipt policy distinguishes typed input refusals from plain programming errors', () => {
  const operationUrl = new URL('../payload/engine/lib/subject-operation.js', import.meta.url).href;
  const reportUrl = new URL('../payload/engine/lib/subject-operation-cli.js', import.meta.url).href;
  const refusalUrl = new URL('../payload/engine/lib/engine-refusal.js', import.meta.url).href;
  for (const [expression, kind, code] of [
    ["Object.assign(new EngineRefusal('cannot read input'), {code:'view-input-read-error'})", 'admission-refused', 'view-input-read-error'],
    ["new Error('unexpected plain error')", 'internal-error', undefined],
  ]) {
    const script = `import {createSubjectOperation} from ${JSON.stringify(operationUrl)};
      import {reportSubjectOperationFailure} from ${JSON.stringify(reportUrl)};
      import {EngineRefusal} from ${JSON.stringify(refusalUrl)};
      process.exitCode=reportSubjectOperationFailure(createSubjectOperation(${JSON.stringify(limits())}),${expression});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.failure.kind, kind); assert.equal(report.failure.code, code);
    if (kind === 'internal-error') {
      assert.equal(report.failure.name, 'Error'); assert.equal(report.failure.message, 'unexpected plain error');
      assert.match(report.failure.stack, /unexpected plain error/);
    }
  }
});
