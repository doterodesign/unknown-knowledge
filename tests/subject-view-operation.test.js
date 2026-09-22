import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, cpSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { createSubjectOperation, getSubjectOperationUsage } from '../payload/engine/lib/subject-operation.js';
import { executeIntersectionRoute } from '../payload/engine/lib/subject-routes.js';
import { countSubjectContexts } from '../payload/engine/lib/subject-contexts.js';

const cli = new URL('../payload/engine/subject-view.js', import.meta.url).pathname;
// Test capacities only; these are not a qualified installation profile.
const limits = () => ({ version: 1, maxSourceBytes: 1048576, maxSingleCaptureBytes: 65536, maxOutputBytes: 262144,
  validation: { maxCaptureBytes: 1048576, maxDocumentNodes: 2000000, maxDocumentTextUnits: 8388608,
    maxSubjects: 32768, maxHistoryRows: 131072, maxValidationSteps: 5000000 },
  corpus: { maxCanonicalRecords: 30, maxAuthoredRecords: 40, maxSubjects: 10, maxHierarchyDepth: 8,
    maxHistoryEvents: 20, maxHistoryRows: 40, maxAssignmentsPerRecord: 8, maxAssignments: 100, maxBodyBytesPerRecord: 4096 } });
const budgets = { version: 1, maxRecords: 30, maxAssignments: 50, maxHierarchyNodes: 30,
  maxHierarchyEdges: 30, maxRedirects: 30, maxContexts: 10 };
const route = { version: 1, kind: 'intersection', subjects: ['S-000001'] };
function fixture(t) {
  const f = subjectQueryDiskFixture(t, { descendants: true });
  const entry = f.context.model.leaves.get('K-000005');
  f.put(entry.file, `---\n${JSON.stringify({ ...entry.record, subjects: [] })}\n---\n${entry.body}\n`);
  const query = subjectQuery(undefined, { view: 'all', expansion: 'self-and-descendants' });
  const { where, ...routeQuery } = query;
  const bind = (policy = limits()) => {
    const operation = createSubjectOperation(policy);
    const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures, operation });
    assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
    return { operation, context: loaded.context };
  };
  const run = (mode, policy, { collect = 'results', human = false, request, extra = [] } = {}) => {
    const input = request ?? (mode === 'route' ? { version: 1, route, query: routeQuery, collect }
      : { version: 1, query, contextBudgets: budgets });
    const path = join(f.root, 'request.json'); writeFileSync(path, JSON.stringify(input));
    return spawnSync(process.execPath, [cli, '--root', f.root, '--mode', mode,
      '--request', path, '--decision-captures', f.capturesFile, ...(human ? [] : ['--json']),
      ...(policy ? ['--operation-limits-json', JSON.stringify(policy)] : []), ...extra], { encoding: 'utf8', timeout: 20000 });
  };
  return { ...f, bind, run, query, routeQuery };
}

test('route early refusals still require the authentic operation and captured context', (t) => {
  const f = fixture(t); const { operation, context } = f.bind();
  for (const [candidate, op] of [[{ ...context }, operation], [context, createSubjectOperation(limits())], [context, undefined]]) {
    assert.throws(() => executeIntersectionRoute(candidate, {}, f.routeQuery, { operation: op }), { code: 'operation-context-mismatch' });
  }
  assert.equal(executeIntersectionRoute(context, {}, f.routeQuery, { operation }).status, 'refused');
});

test('context base and extension counts reuse one operation and debit repeated work', (t) => {
  const f = fixture(t); const { operation, context } = f.bind();
  const loaded = getSubjectOperationUsage(operation);
  const first = countSubjectContexts(context, f.query, { budgets, operation });
  assert.equal(first.status, 'complete', JSON.stringify(first.diagnostics));
  assert.equal(first.resources.queries.calls, 3);
  const used = getSubjectOperationUsage(operation);
  assert.ok(used.validation.documentNodes > loaded.validation.documentNodes);
  assert.ok(used.validation.validationSteps > loaded.validation.validationSteps);
  assert.equal(used.sourceBytes, loaded.sourceBytes);
  assert.equal(used.validation.captureBytes, loaded.validation.captureBytes);
  assert.deepEqual(countSubjectContexts(context, f.query, { budgets, operation }), first);
  assert.ok(getSubjectOperationUsage(operation).validation.validationSteps > used.validation.validationSteps);
  for (const [candidate, op] of [[{ ...context }, operation], [context, createSubjectOperation(limits())], [context, undefined]]) {
    assert.throws(() => countSubjectContexts(candidate, f.query, { budgets, operation: op }), { code: 'operation-context-mismatch' });
  }
});

test('shared exhaustion during later context work throws instead of returning partial domain counts', (t) => {
  const f = fixture(t); const measured = f.bind();
  const firstOnly = countSubjectContexts(measured.context, f.query, { budgets: { ...budgets, maxContexts: 0 }, operation: measured.operation });
  assert.equal(firstOnly.status, 'incomplete');
  const policy = limits(); policy.validation.maxValidationSteps = getSubjectOperationUsage(measured.operation).validation.validationSteps;
  const { context, operation } = f.bind(policy);
  assert.throws(() => countSubjectContexts(context, f.query, { budgets, operation }), { code: 'subject-validation-budget' });
  const failure = getSubjectOperationUsage(operation).failure;
  assert.ok(failure);
  assert.throws(() => executeIntersectionRoute(context, {}, f.routeQuery, { operation }), { code: failure.code });
});

test('route document admission happens before route compilation', (t) => {
  const f = fixture(t); const measured = f.bind();
  const policy = limits(); policy.validation.maxDocumentNodes = getSubjectOperationUsage(measured.operation).validation.documentNodes;
  const { operation, context } = f.bind(policy);
  assert.throws(() => executeIntersectionRoute(context, { ...route, subjects: ['S-000001', 'S-000001'] }, f.routeQuery, { operation }),
    { code: 'subject-validation-budget' });
  assert.equal(getSubjectOperationUsage(operation).failure.phase, 'route-request');
});

test('actual route results, route counts and context CLI retain domain output under shared admission', (t) => {
  const f = fixture(t);
  for (const [mode, options] of [['route', {}], ['route', { collect: 'counts' }], ['contexts', {}], ['route', { human: true }]]) {
    const plain = f.run(mode, undefined, options); const bounded = f.run(mode, limits(), options);
    assert.equal(plain.status, 0, `${mode}: ${plain.stderr}${plain.stdout}`); assert.equal(bounded.status, 0, bounded.stderr);
    assert.equal(bounded.stdout, plain.stdout); assert.equal(bounded.stderr, '');
  }
});

test('CLI source, decoded capture and corpus refusals use bounded host receipts', (t) => {
  const f = fixture(t);
  for (const [policy, code] of [[{ ...limits(), maxSourceBytes: 0 }, 'source-budget-exhausted'],
    [{ ...limits(), maxSingleCaptureBytes: 0 }, 'single-capture-budget'],
    [{ ...limits(), corpus: { ...limits().corpus, maxAuthoredRecords: 0 } }, 'operation-corpus-budget']]) {
    const result = f.run('route', policy);
    assert.equal(result.status, 2); assert.equal(result.stderr, '');
    const output = JSON.parse(result.stdout); assert.equal(output.status, 'host-failed');
    assert.equal(output.failure.kind, 'admission-refused'); assert.equal(output.failure.code, code);
    assert.equal(Object.hasOwn(output, 'result'), false);
  }
});

test('whole CLI output includes its newline; a short allowance never emits a result prefix', (t) => {
  const f = fixture(t);
  const baseline = f.run('route', limits()); assert.equal(baseline.status, 0, baseline.stderr);
  const bytes = Buffer.byteLength(baseline.stdout);
  assert.equal(f.run('route', { ...limits(), maxOutputBytes: bytes }).stdout, baseline.stdout);
  const short = f.run('route', { ...limits(), maxOutputBytes: bytes - 1 });
  assert.equal(short.status, 2); assert.equal(short.stderr, '');
  assert.equal(JSON.parse(short.stdout).failure.code, 'operation-output-budget');
  const zero = f.run('contexts', { ...limits(), maxOutputBytes: 0 });
  assert.equal(zero.status, 2); assert.equal(zero.stdout, ''); assert.equal(zero.stderr, '');
});

test('bounded bootstrap and unsupported tree opt-in do not print an unbounded epilogue or mutate artifacts', (t) => {
  const f = fixture(t); f.put('subjects/derived/sentinel', 'preserve');
  for (const args of [['--operation-limits-json', 'bad'], ['--mode', 'tree', '--delete', '--operation-limits-json', JSON.stringify(limits())]]) {
    const result = spawnSync(process.execPath, [cli, '--root', f.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
  assert.equal(readFileSync(join(f.root, 'subjects/derived/sentinel'), 'utf8'), 'preserve');
});

test('domain enumeration and query limits remain partial results while host capacity remains available', (t) => {
  const f = fixture(t);
  for (const contextBudgets of [{ ...budgets, maxContexts: 0 }, { ...budgets, maxHierarchyNodes: 0 }]) {
    const result = f.run('contexts', limits(), { request: { version: 1, query: f.query, contextBudgets } });
    assert.equal(result.status, 2); assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.result.status, 'incomplete'); assert.equal(Object.hasOwn(payload, 'failure'), false);
  }
  const query = { ...f.routeQuery, budgets: { ...f.routeQuery.budgets, maxRecords: 1 } };
  const output = f.run('route', limits(), { request: { version: 1, route, query } });
  assert.equal(output.status, 2); assert.equal(JSON.parse(output.stdout).result.status, 'incomplete');
});

test('source failure receipt fits exactly or emits nothing, and malformed requests remain typed refusals', (t) => {
  const f = fixture(t);
  const expected = `${JSON.stringify({ version: 1, status: 'host-failed', failure: {
    kind: 'admission-refused', code: 'source-budget-exhausted', counter: 'sourceBytes', phase: 'source-read',
  } })}\n`;
  const bytes = Buffer.byteLength(expected);
  const exact = f.run('route', { ...limits(), maxSourceBytes: 0, maxOutputBytes: bytes });
  assert.equal(exact.stdout, expected); assert.equal(exact.stderr, ''); assert.equal(exact.status, 2);
  const short = f.run('route', { ...limits(), maxSourceBytes: 0, maxOutputBytes: bytes - 1 });
  assert.equal(short.stdout, ''); assert.equal(short.stderr, ''); assert.equal(short.status, 2);
  const invalid = f.run('route', limits(), { request: { version: 2 } });
  assert.equal(invalid.status, 2); assert.equal(JSON.parse(invalid.stdout).failure.kind, 'admission-refused');
  assert.equal(JSON.parse(invalid.stdout).failure.phase, 'cli-usage');
});


test('bounded CLI distinguishes programming bugs and API callers retain the original exception', (t) => {
  const f = fixture(t);
  const runtime = join(f.root, 'test-runtime'); mkdirSync(join(runtime, 'payload'), { recursive: true });
  cpSync(new URL('../payload/engine', import.meta.url), join(runtime, 'payload/engine'), { recursive: true });
  cpSync(new URL('../payload/schemas', import.meta.url), join(runtime, 'payload/schemas'), { recursive: true });
  writeFileSync(join(runtime, 'package.json'), JSON.stringify({ type: 'module' }));
  symlinkSync(new URL('../node_modules', import.meta.url).pathname, join(runtime, 'node_modules'));
  const modulePath = join(runtime, 'payload/engine/lib/subject-routes.js');
  const source = readFileSync(modulePath, 'utf8');
  const marker = 'export function executeIntersectionRoute(context, route, queryOptions, options = {}) {';
  assert.ok(source.includes(marker));
  const request = join(f.root, 'bug-request.json');
  writeFileSync(request, JSON.stringify({ version: 1, route, query: f.routeQuery }));
  const args = ['--mode', 'route', '--root', f.root, '--request', request, '--decision-captures', f.capturesFile,
    '--json', '--operation-limits-json', JSON.stringify(limits())];
  const entry = join(runtime, 'payload/engine/subject-view.js');
  for (const errorName of ['TypeError', 'Error']) {
    writeFileSync(modulePath, source.replace(marker, `${marker}\n  throw new ${errorName}('view-operation-test-bug');`));
    const result = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.failure.kind, 'internal-error'); assert.equal(report.failure.name, errorName);
    assert.equal(report.failure.message, 'view-operation-test-bug'); assert.match(report.failure.stack, /subject-routes/);
    const zero = spawnSync(process.execPath, [entry, ...args.slice(0, -1), JSON.stringify({ ...limits(), maxOutputBytes: 0 })], { encoding: 'utf8' });
    assert.equal(zero.status, 2); assert.equal(zero.stdout, ''); assert.equal(zero.stderr, '');
    const module = pathToFileURL(join(runtime, 'payload/engine/commands/subject-view.js')).href;
    const code = `import {main} from ${JSON.stringify(module)};try{await main(${JSON.stringify(args)});process.exitCode=1;}
      catch(error){if(error.name!==${JSON.stringify(errorName)}||error.message!=='view-operation-test-bug')throw error;}`;
    const api = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    assert.equal(api.status, 0, api.stderr); assert.equal(api.stdout, ''); assert.equal(api.stderr, '');
  }
  // Default structural tree loading must not acquire the Boolean query modules.
  for (const name of ['subject-query.js', 'subject-query-context.js', 'subject-operation.js', 'subject-operation-cli.js']) rmSync(join(runtime, 'payload/engine/lib', name));
  const tree = spawnSync(process.execPath, [entry, '--root', f.root, '--write', '--max-nodes', '20',
    '--max-edges', '20', '--max-rows', '20', '--max-bytes', '10000', '--json'], { encoding: 'utf8' });
  assert.equal(tree.status, 0, tree.stderr); assert.equal(JSON.parse(tree.stdout).status, 'complete');
});

test('request, Decision transport and actual loader reads consume one exact source allowance', (t) => {
  const f = fixture(t); const { operation } = f.bind();
  const request = { version: 1, route, query: f.routeQuery, collect: 'results' };
  const capacity = getSubjectOperationUsage(operation).sourceBytes
    + Buffer.byteLength(JSON.stringify(request)) + readFileSync(f.capturesFile).length;
  const exact = f.run('route', { ...limits(), maxSourceBytes: capacity }, { request });
  assert.equal(exact.status, 0, exact.stdout + exact.stderr);
  const short = f.run('route', { ...limits(), maxSourceBytes: capacity - 1 }, { request });
  assert.equal(short.status, 2); assert.equal(short.stderr, '');
  assert.equal(JSON.parse(short.stdout).failure.code, 'source-budget-exhausted');
});

test('a P3-caught assignment admission failure cannot become a domain refusal', (t) => {
  const f = fixture(t); const measured = f.bind();
  const stopped = countSubjectContexts(measured.context, f.query,
    { budgets: { ...budgets, maxRecords: 0, maxContexts: 0 }, operation: measured.operation });
  assert.equal(stopped.status, 'incomplete');
  const policy = limits(); policy.validation.maxValidationSteps = getSubjectOperationUsage(measured.operation).validation.validationSteps;
  const { operation, context } = f.bind(policy);
  assert.throws(() => countSubjectContexts(context, f.query, { budgets, operation }), { code: 'subject-validation-budget' });
  assert.equal(getSubjectOperationUsage(operation).failure.phase, 'subject-eligibility');
});


test('bounded missing request reads are explicit input refusals', (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [cli, '--root', f.root, '--mode', 'route',
    '--request', join(f.root, 'missing.json'), '--operation-limits-json', JSON.stringify(limits())], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout).failure, { kind: 'admission-refused', code: 'view-input-read-error', counter: null, phase: null });
});
