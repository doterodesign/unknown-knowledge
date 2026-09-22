import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, cpSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';
import { createSubjectOperation, getSubjectOperationUsage, guardSubjectOperationDocument } from '../payload/engine/lib/subject-operation.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { validateIntentQueryPlan, executeIntentQueryPlan } from '../payload/engine/lib/intent-query-plan.js';

const cli = new URL('../payload/engine/intent-plan.js', import.meta.url).pathname;
const limits = () => ({ version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152, maxOutputBytes: 262144,
  validation: { maxCaptureBytes: 33554432, maxDocumentNodes: 2000000, maxDocumentTextUnits: 67108864,
    maxSubjects: 32768, maxHistoryRows: 131072, maxValidationSteps: 5000000 },
  corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
    maxHistoryEvents: 256, maxHistoryRows: 1024, maxAssignmentsPerRecord: 16, maxAssignments: 16000, maxBodyBytesPerRecord: 16384 } });
const policies = () => ({ admission: { version: 1, maxBranches: 4, maxReservedAstNodes: 128, maxReservedRedirects: 32 },
  executionAdmission: { version: 1, maxBranches: 4, maxReservedAstNodes: 128, maxAstDepth: 8, maxReservedRedirects: 32,
    maxReservedHierarchyNodes: 256, maxReservedHierarchyEdges: 256, maxReservedRecords: 400,
    maxReservedPredicateSteps: 4000, maxReservedExplanationNodes: 40000, maxReservedResultSlots: 120 } });
function plan(count = 1) {
  const branches = Array.from({ length: count }, (_, i) => ({ key: `branch-${i}`, kind: i ? 'alternative' : 'strict',
    unitKeys: ['meaning'], assumptions: i ? ['Separate interpretation.'] : [], relaxes: [], query: subjectQuery() }));
  return { version: 1, inputRef: 'request:meaning', inventoryStatus: 'declared-complete',
    units: [{ key: 'meaning', sourceRef: 'request:meaning', disposition: 'mapped' }], bindings: [], clarifications: [],
    requirements: [{ key: 'source', unitKeys: ['meaning'], description: 'Read original source support.' }], branches,
    constraints: branches.map(branch => ({ key: branch.key, origin: 'explicit', unitKeys: ['meaning'], bindingKeys: [],
      requirementKeys: ['source'], queryRefs: ['/where', '/stores', '/view'].map(path => ({ branch: branch.key, path })) })) };
}
function loadBound(f, operation) {
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures, operation });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics)); return loaded.context;
}
function files(f, input = plan()) {
  const planFile = join(f.root, 'plan.json'), admissionFile = join(f.root, 'admission.json'), executionFile = join(f.root, 'execution.json');
  writeFileSync(planFile, JSON.stringify(input)); writeFileSync(admissionFile, JSON.stringify(policies().admission));
  writeFileSync(executionFile, JSON.stringify(policies().executionAdmission));
  return { planFile, admissionFile, executionFile };
}
function args(f, paths, mode, policy) {
  return [paths.planFile, `--${mode}`, '--root', f.root, '--admission', paths.admissionFile,
    ...(mode === 'execute-queries' ? ['--execution-admission', paths.executionFile] : []),
    '--decision-captures', f.capturesFile, '--json', ...(policy ? ['--operation-limits-json', JSON.stringify(policy)] : [])];
}
const run = argv => spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8' });

test('actual plan validation and all execution branches reuse one captured operation without changing domain results', t => {
  const f = subjectQueryDiskFixture(t); const operation = createSubjectOperation(limits());
  const context = loadBound(f, operation), input = plan(3), policy = policies();
  const loaded = getSubjectOperationUsage(operation);
  const validation = validateIntentQueryPlan(input, context, { admission: policy.admission, operation });
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
  assert.deepEqual(validation, validateIntentQueryPlan(input, f.context, { admission: policy.admission }));
  const validated = getSubjectOperationUsage(operation);
  const executed = executeIntentQueryPlan(input, context, { ...policy, operation });
  assert.equal(executed.status, 'complete');
  assert.deepEqual(executed, executeIntentQueryPlan(input, f.context, policy));
  assert.equal(executed.work.queryExecutionCalls, 3);
  const used = getSubjectOperationUsage(operation);
  assert.ok(validated.validation.documentNodes > loaded.validation.documentNodes);
  assert.ok(used.validation.documentNodes > validated.validation.documentNodes);
  assert.ok(used.validation.subjects > validated.validation.subjects);
  assert.equal(used.sourceBytes, loaded.sourceBytes);
  assert.equal(used.validation.captureBytes, f.decisionCaptures[0].bytes.length);
});

test('plan entry rejects forged, reset, copied and omitted operation bindings before inspecting a plan', t => {
  const f = subjectQueryDiskFixture(t), operation = createSubjectOperation(limits()), context = loadBound(f, operation);
  for (const invoke of [validateIntentQueryPlan, executeIntentQueryPlan]) {
    for (const [bound, supplied] of [[context, {}], [context, createSubjectOperation(limits())],
      [{ ...context }, operation], [f.context, operation], [context, undefined]]) {
      assert.throws(() => invoke({}, bound, { ...policies(), ...(supplied === undefined ? {} : { operation: supplied }) }),
        error => ['invalid-subject-operation', 'operation-context-mismatch'].includes(error.code));
    }
  }
});

test('early plan and policy guards reject accessors before structural traversal or cloning', t => {
  const f = subjectQueryDiskFixture(t);
  for (const invoke of [validateIntentQueryPlan, executeIntentQueryPlan]) for (const target of ['plan', 'admission', 'executionAdmission']) {
    if (target === 'executionAdmission' && invoke === validateIntentQueryPlan) continue;
    const operation = createSubjectOperation(limits()), context = loadBound(f, operation);
    const input = plan(), policy = policies(); let calls = 0;
    Object.defineProperty(target === 'plan' ? input : policy[target], 'trap', {
      enumerable: true, get() { calls += 1; throw new Error('accessor must not run'); },
    });
    assert.throws(() => invoke(input, context, { ...policy, operation }), error => error.message !== 'accessor must not run');
    assert.equal(calls, 0);
  }
});

test('shared document exhaustion after validation cannot reset during execution or become incomplete', t => {
  const f = subjectQueryDiskFixture(t), input = plan(), policy = policies();
  const measured = createSubjectOperation(limits()), measuredContext = loadBound(f, measured);
  assert.equal(validateIntentQueryPlan(input, measuredContext, { admission: policy.admission, operation: measured }).valid, true);
  const capacities = limits(); capacities.validation.maxDocumentNodes = getSubjectOperationUsage(measured).validation.documentNodes;
  const operation = createSubjectOperation(capacities), context = loadBound(f, operation);
  assert.equal(validateIntentQueryPlan(input, context, { admission: policy.admission, operation }).valid, true);
  assert.throws(() => executeIntentQueryPlan(input, context, { ...policy, operation }), { code: 'subject-validation-budget' });
  const failed = getSubjectOperationUsage(operation);
  assert.equal(failed.failure.counter, 'documentNodes');
  assert.throws(() => validateIntentQueryPlan(input, context, { admission: policy.admission, operation }), { code: 'subject-validation-budget' });
  assert.deepEqual(getSubjectOperationUsage(operation), failed);
});

test('both original reservations still refuse before any branch query work with an authentic operation', t => {
  const f = subjectQueryDiskFixture(t);
  for (const key of ['admission', 'executionAdmission']) {
    const operation = createSubjectOperation(limits()), context = loadBound(f, operation), policy = policies();
    policy[key].maxBranches = 0;
    const before = getSubjectOperationUsage(operation);
    const result = executeIntentQueryPlan(plan(2), context, { ...policy, operation });
    assert.equal(result.status, 'refused'); assert.equal(result.validation, null);
    assert.equal(result.work.queryExecutionCalls, 0);
    assert.equal(result.admission[key === 'admission' ? 'validation' : 'execution'].status, 'denied');
    assert.equal(getSubjectOperationUsage(operation).validation.subjects, before.validation.subjects);
    assert.equal(getSubjectOperationUsage(operation).validation.validationSteps, before.validation.validationSteps);
  }
});

test('CLI complete and refused domain output is unchanged, with exact UTF8 and newline output admission', t => {
  const f = subjectQueryDiskFixture(t), paths = files(f);
  for (const mode of ['validate-queries', 'execute-queries']) {
    const baseline = run(args(f, paths, mode)); assert.equal(baseline.status, 0, baseline.stderr);
    const policy = limits(); policy.maxOutputBytes = Buffer.byteLength(baseline.stdout);
    const exact = run(args(f, paths, mode, policy));
    assert.equal(exact.status, 0, exact.stderr); assert.equal(exact.stdout, baseline.stdout); assert.equal(exact.stderr, '');
    const short = run(args(f, paths, mode, { ...policy, maxOutputBytes: policy.maxOutputBytes - 1 }));
    assert.equal(short.status, 2); assert.equal(short.stderr, '');
    assert.equal(JSON.parse(short.stdout).failure.code, 'operation-output-budget');
    const zero = run(args(f, paths, mode, { ...policy, maxOutputBytes: 0 }));
    assert.equal(zero.status, 2); assert.equal(zero.stdout, ''); assert.equal(zero.stderr, '');
    const human = run(args(f, paths, mode).filter(value => value !== '--json'));
    const boundedHuman = run(args(f, paths, mode, limits()).filter(value => value !== '--json'));
    assert.equal(boundedHuman.status, 0); assert.equal(boundedHuman.stdout, human.stdout); assert.equal(boundedHuman.stderr, '');
  }
  const invalid = plan(); invalid.branches[0].query.where.subject = {};
  files(f, invalid);
  for (const mode of ['validate-queries', 'execute-queries']) {
    const baseline = run(args(f, paths, mode)), bounded = run(args(f, paths, mode, limits()));
    assert.equal(bounded.status, 2); assert.equal(bounded.stdout, baseline.stdout); assert.equal(bounded.stderr, '');
  }
  const incomplete = plan(); incomplete.branches[0].query.budgets.maxRecords = 0; files(f, incomplete);
  const baseline = run(args(f, paths, 'execute-queries'));
  const bounded = run(args(f, paths, 'execute-queries', limits()));
  assert.equal(bounded.status, 2); assert.equal(bounded.stdout, baseline.stdout); assert.equal(bounded.stderr, '');
  assert.equal(JSON.parse(bounded.stdout).result.status, 'incomplete');
});

test('host failure receipt uses the same exact output allowance with no smaller fallback', t => {
  const f = subjectQueryDiskFixture(t), paths = files(f);
  const expected = `${JSON.stringify({ version: 1, status: 'host-failed', failure: {
    kind: 'admission-refused', code: 'source-budget-exhausted', counter: 'sourceBytes', phase: 'source-read',
  } })}\n`;
  const policy = { ...limits(), maxSourceBytes: 0, maxOutputBytes: Buffer.byteLength(expected) };
  const exact = run(args(f, paths, 'execute-queries', policy));
  assert.equal(exact.status, 2); assert.equal(exact.stdout, expected); assert.equal(exact.stderr, '');
  const short = run(args(f, paths, 'execute-queries', { ...policy, maxOutputBytes: policy.maxOutputBytes - 1 }));
  assert.equal(short.status, 2); assert.equal(short.stdout, ''); assert.equal(short.stderr, '');
});

test('CLI charges plan, policy, capture transport and actual loader reads to one source allowance', t => {
  const f = subjectQueryDiskFixture(t), paths = files(f);
  const operation = createSubjectOperation(limits()); loadBound(f, operation);
  const sourceBytes = getSubjectOperationUsage(operation).sourceBytes;
  for (const mode of ['validate-queries', 'execute-queries']) {
    const policy = limits();
    policy.maxSourceBytes = sourceBytes + [paths.planFile, paths.admissionFile, f.capturesFile,
      ...(mode === 'execute-queries' ? [paths.executionFile] : [])].reduce((n, path) => n + readFileSync(path).length, 0);
    const exact = run(args(f, paths, mode, policy)); assert.equal(exact.status, 0, exact.stderr || exact.stdout);
    const short = run(args(f, paths, mode, { ...policy, maxSourceBytes: policy.maxSourceBytes - 1 }));
    assert.equal(short.status, 2); assert.equal(JSON.parse(short.stdout).failure.code, 'source-budget-exhausted');
  }
});

test('CLI guards parsed plan and policy before context work and admits capture bytes before decode', t => {
  const f = subjectQueryDiskFixture(t), input = plan(), paths = files(f, input);
  const policy = limits(); policy.validation.maxDocumentNodes = 0;
  let result = run(args(f, paths, 'execute-queries', policy));
  assert.equal(JSON.parse(result.stdout).failure.phase, 'parsed-plan');
  const probe = createSubjectOperation(limits()); guardSubjectOperationDocument(probe, input, 'measure-plan');
  policy.validation.maxDocumentNodes = getSubjectOperationUsage(probe).validation.documentNodes;
  result = run(args(f, paths, 'execute-queries', policy));
  assert.equal(JSON.parse(result.stdout).failure.phase, 'parsed-admission');
  const capture = limits(); capture.maxSingleCaptureBytes = f.decisionCaptures[0].bytes.length - 1;
  result = run(args(f, paths, 'execute-queries', capture));
  assert.equal(JSON.parse(result.stdout).failure.code, 'single-capture-budget');
});

test('bootstrap failures are silent; authentic operation rejects uninstrumented modes with bounded receipts', t => {
  const f = subjectQueryDiskFixture(t), paths = files(f);
  for (const argv of [[paths.planFile, '--operation-limits-json'],
    [paths.planFile, '--operation-limits-json', 'invalid'], [paths.planFile, '--operation-limits-json', '{}'.padEnd(16385, ' ')]]) {
    const result = run(argv); assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
  for (const mode of [[], ['--inspect-bindings', '--root', f.root]]) {
    const result = run([paths.planFile, ...mode, '--operation-limits-json', JSON.stringify(limits())]);
    assert.equal(result.status, 2); assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).failure.kind, 'admission-refused');
  }
});

test('unexpected bounded CLI bugs use the same allowance while programmatic main preserves the exception', async t => {
  const f = subjectQueryDiskFixture(t), paths = files(f), runtime = join(f.root, 'runtime');
  mkdirSync(join(runtime, 'payload'), { recursive: true });
  for (const name of ['engine', 'schemas']) cpSync(new URL(`../payload/${name}`, import.meta.url), join(runtime, 'payload', name), { recursive: true });
  writeFileSync(join(runtime, 'package.json'), '{"type":"module"}');
  symlinkSync(new URL('../node_modules', import.meta.url).pathname, join(runtime, 'node_modules'));
  const domain = join(runtime, 'payload/engine/lib/intent-query-plan.js');
  const source = readFileSync(domain, 'utf8'), marker = 'export function executeIntentQueryPlan(plan, context, options) {';
  assert.ok(source.includes(marker));
  writeFileSync(domain, source.replace(marker, `${marker}\n throw new TypeError('intent-operation-test-bug');`));
  const argv = args(f, paths, 'execute-queries', limits());
  const entry = join(runtime, 'payload/engine/intent-plan.js');
  const result = spawnSync(process.execPath, [entry, ...argv], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.equal(result.stderr, '');
  const failure = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(failure).sort(), ['failure', 'status', 'version']);
  assert.equal(failure.failure.kind, 'internal-error'); assert.equal(failure.failure.name, 'TypeError');
  assert.equal(failure.failure.message, 'intent-operation-test-bug');
  assert.match(failure.failure.stack, /intent-operation-test-bug/);
  const zero = spawnSync(process.execPath, [entry, ...args(f, paths, 'execute-queries', { ...limits(), maxOutputBytes: 0 })], { encoding: 'utf8' });
  assert.equal(zero.status, 2); assert.equal(zero.stdout, ''); assert.equal(zero.stderr, '');
  const { main } = await import(pathToFileURL(join(runtime, 'payload/engine/commands/intent-plan.js')).href);
  await assert.rejects(main(argv), { name: 'TypeError', message: 'intent-operation-test-bug' });
});
