import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, cpSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, assigned } from './helpers/subject-query-fixture.js';
import { validateIntentQueryPlan, executeIntentQueryPlan } from '../payload/engine/lib/intent-query-plan.js';

const repository = fileURLToPath(new URL('..', import.meta.url));
const cli = join(repository, 'payload/engine/intent-plan.js');
const policy = { version: 1, maxBranches: 2, maxReservedAstNodes: 64, maxReservedRedirects: 16 };
const executionPolicy = { version: 1, maxBranches: 2, maxReservedAstNodes: 64, maxAstDepth: 8,
  maxReservedRedirects: 16, maxReservedHierarchyNodes: 128, maxReservedHierarchyEdges: 128,
  maxReservedRecords: 200, maxReservedPredicateSteps: 2000, maxReservedExplanationNodes: 20000,
  maxReservedResultSlots: 20 };
function fixture(t, nested = false) {
  const data = subjectQueryDiskFixture(t, { nested });
  const query = subjectQuery(assigned('S-000001'));
  const plan = { version: 1, inputRef: 'request:color', inventoryStatus: 'declared-complete',
    units: [{ key: 'color', sourceRef: 'request:color', disposition: 'mapped' }],
    bindings: [], clarifications: [],
    constraints: [{ key: 'color', origin: 'explicit', unitKeys: ['color'], bindingKeys: [],
      queryRefs: ['/where', '/stores', '/view'].map(path => ({ branch: 'strict', path })), requirementKeys: ['source'] }],
    requirements: [{ key: 'source', unitKeys: ['color'], description: 'Read the source and retain its limits.' }],
    branches: [{ key: 'strict', kind: 'strict', unitKeys: ['color'], assumptions: [], relaxes: [], query }] };
  const planFile = join(data.root, 'plan.json');
  const admissionFile = join(data.root, 'admission.json');
  const savePlan = () => writeFileSync(planFile, JSON.stringify(plan));
  savePlan(); writeFileSync(admissionFile, JSON.stringify(policy));
  const args = [planFile, '--validate-queries', '--root', data.root, '--admission', admissionFile,
    '--decision-captures', data.capturesFile, '--json'];
  const run = (argv = args, executable = cli) => spawnSync(process.execPath, [executable, ...argv], { encoding: 'utf8' });
  return { ...data, plan, planFile, admissionFile, savePlan, args, run };
}

for (const nested of [false, true]) test(`real CLI query validation matches the domain in ${nested ? 'nested' : 'root'} layout`, t => {
  const f = fixture(t, nested);
  const watched = [f.planFile, f.admissionFile, f.capturesFile, join(f.kitRoot, 'subjects/registry.yaml'),
    join(f.kitRoot, '_identity.yaml'), join(f.kitRoot, 'decisions/entries/approval.yaml')];
  const before = watched.map(file => readFileSync(file));
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  const envelope = JSON.parse(r.stdout);
  assert.equal(envelope.mode, 'validate-queries');
  assert.deepEqual(envelope.result, validateIntentQueryPlan(f.plan, f.context, { admission: policy }));
  assert.deepEqual(envelope.contextDiagnostics, f.context.model.diagnostics);
  assert.equal(envelope.result.execution, 'not-run');
  assert.equal(envelope.result.bindingValidation, 'not-run');
  assert.equal(envelope.result.evidenceReview, 'not-run');
  assert.equal(r.stdout, f.run().stdout);
  watched.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i]));
  const human = f.run(f.args.filter(a => a !== '--json'));
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /query validation: passed/);
  assert.match(human.stdout, /admission: admitted/);
  assert.match(human.stdout, /execution: not-run/);
  assert.match(human.stdout, /Read the source and retain its limits/);
});

test('actual scope profile requires exact applicability provenance; unsupported all remains refused', t => {
  const f = fixture(t);
  f.plan.branches[0].query.applicability = { profile: 'legacy-jurisdictions-v1', mode: 'any', jurisdictions: ['eu-eaa'] };
  f.savePlan();
  let r = f.run();
  assert.equal(r.status, 2, r.stderr);
  assert.ok(JSON.parse(r.stdout).result.diagnostics.some(d => d.code === 'uncovered-query-constraint'
    && d.path === '/branches/0/query/applicability'));
  f.plan.constraints[0].queryRefs.push({ branch: 'strict', path: '/applicability' }); f.savePlan();
  r = f.run();
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout).result;
  assert.equal(result.branches[0].provenance.find(p => p.path === '/applicability').queryOrigin, 'explicit');
  assert.ok(result.branches[0].validation.input.inputs.jurisdictions);
  f.plan.branches[0].query.applicability.mode = 'all'; f.savePlan();
  r = f.run();
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).result.handoff, null);
  assert.ok(JSON.parse(r.stdout).result.diagnostics.some(d => d.code === 'unsupported-applicability'));
});

test('admission denial has no domain query calls and unresolved intent is not concealed', t => {
  const f = fixture(t);
  writeFileSync(f.admissionFile, JSON.stringify({ ...policy, maxBranches: 0 }));
  let r = f.run();
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).result.admission.status, 'denied');
  assert.equal(JSON.parse(r.stdout).result.work.queryValidationCalls, 0);
  assert.equal(JSON.parse(r.stdout).result.handoff, null);
  writeFileSync(f.admissionFile, JSON.stringify(policy));
  f.plan.inventoryStatus = 'open'; f.savePlan();
  r = f.run();
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).result.readiness, 'inventory-open');
});

test('missing retained bytes stay unavailable; malformed transport and corrupt proof give no context result', t => {
  const f = fixture(t);
  let r = f.run(f.args.filter((arg, i) => arg !== '--decision-captures' && f.args[i - 1] !== '--decision-captures'));
  assert.equal(r.status, 2, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.queryValidation, 'failed');
  assert.equal(JSON.parse(r.stdout).result.handoff, null);
  const original = JSON.parse(readFileSync(f.capturesFile, 'utf8'));
  for (const captures of [{ arbitrary: true }, [{ ...original[0], bytesBase64: '!!!' }],
    [{ ...original[0], bytesBase64: Buffer.from('different retained bytes').toString('base64') }]]) {
    writeFileSync(f.capturesFile, JSON.stringify(captures));
    r = f.run();
    assert.equal(r.status, 2, r.stderr);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.result, null);
    assert.ok(envelope.diagnostics.length);
  }
});

test('missing authority returns actual loader refusal without a fabricated query result', t => {
  const f = fixture(t);
  const args = f.args.map((arg, i) => f.args[i - 1] === '--root' ? join(f.root, 'absent') : arg);
  const r = f.run(args);
  assert.equal(r.status, 2, r.stderr);
  const envelope = JSON.parse(r.stdout);
  assert.equal(envelope.result, null);
  assert.ok(envelope.diagnostics.length);
});

test('mode flags, file errors and malformed JSON fail without echoing private input fragments', t => {
  const f = fixture(t);
  for (const args of [[f.planFile, '--root', f.root], [f.planFile, '--admission', f.admissionFile],
    [f.planFile, '--decision-captures', f.capturesFile], [f.planFile, '--validate-queries'],
    [f.planFile, '--validate-queries', '--root', f.root],
    [f.planFile, '--validate-queries', '--admission', f.admissionFile]]) {
    const r = f.run(args);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
  }
  for (const file of [f.planFile, f.admissionFile, f.capturesFile]) {
    const before = readFileSync(file);
    writeFileSync(file, '{ "private-input-fragment": invalid }');
    const r = f.run();
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.doesNotMatch(r.stderr, /private-input-fragment/);
    writeFileSync(file, before);
  }
  const r = f.run(f.args.map((arg, i) => f.args[i - 1] === '--admission' ? arg + '.absent' : arg));
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
});

test('copied runtime runs actual query validation while structural mode remains independent of query modules', t => {
  const f = fixture(t, true);
  cpSync(join(repository, 'payload/engine'), join(f.kitRoot, 'engine'), { recursive: true });
  cpSync(join(repository, 'payload/schemas'), join(f.kitRoot, 'schemas'), { recursive: true });
  symlinkSync(join(repository, 'node_modules'), join(f.kitRoot, 'node_modules'), 'dir');
  const installedCli = join(f.kitRoot, 'engine/intent-plan.js');
  let r = f.run(f.args, installedCli);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.queryValidation, 'passed');
  writeFileSync(join(f.kitRoot, 'engine/lib/subject-query-context.js'), "throw new Error('injected context failure');\n");
  r = f.run(f.args, installedCli);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /injected context failure/);
  r = f.run([f.planFile, '--json'], installedCli);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).queryValidation, 'not-run');
});

function executionFixture(t, nested = false) {
  const f = fixture(t, nested);
  const executionFile = join(f.root, 'execution-admission.json');
  writeFileSync(executionFile, JSON.stringify(executionPolicy));
  return { ...f, executionFile,
    args: [...f.args.map(a => a === '--validate-queries' ? '--execute-queries' : a), '--execution-admission', executionFile] };
}

for (const nested of [false, true]) test(`real execution CLI preserves actual domain result in ${nested ? 'nested' : 'root'} layout`, t => {
  const f = executionFixture(t, nested);
  const r = f.run(f.args);
  assert.equal(r.status, 0, r.stderr);
  const envelope = JSON.parse(r.stdout);
  assert.equal(envelope.mode, 'execute-queries');
  assert.deepEqual(envelope.result, executeIntentQueryPlan(f.plan, f.context,
    { admission: policy, executionAdmission: executionPolicy }));
  assert.equal(envelope.result.status, 'complete');
  assert.equal(envelope.result.handoff, null);
  assert.equal(r.stdout, f.run(f.args).stdout);
  const human = f.run(f.args.filter(a => a !== '--json'));
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /execution: complete/);
  assert.match(human.stdout, /source review remain pending/);
  assert.match(human.stdout, /"groups"/);
});

test('execution CLI keeps discovery readiness and separates incomplete execution from admission refusal', t => {
  const f = executionFixture(t);
  f.plan.inventoryStatus = 'open'; f.savePlan();
  let r = f.run(f.args);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.readiness, 'inventory-open');
  f.plan.branches[0].query.budgets.maxRecords = 0; f.savePlan();
  r = f.run(f.args);
  assert.equal(r.status, 2, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.status, 'incomplete');
  writeFileSync(f.executionFile, JSON.stringify({ ...executionPolicy, maxBranches: 0 }));
  r = f.run(f.args);
  assert.equal(r.status, 2, r.stderr);
  const result = JSON.parse(r.stdout).result;
  assert.equal(result.status, 'refused');
  assert.equal(result.validation, null);
  assert.equal(result.work.queryExecutionCalls, 0);
});

test('execution flags and errors preserve usage and context refusal contracts', t => {
  const f = executionFixture(t);
  for (const args of [[...f.args, '--validate-queries'],
    f.args.filter((a, i) => a !== '--execution-admission' && f.args[i - 1] !== '--execution-admission'),
    [...f.args.map(a => a === '--execute-queries' ? '--validate-queries' : a)],
    [f.planFile, '--execution-admission', f.executionFile]]) {
    const r = f.run(args);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
  }
  writeFileSync(f.executionFile, '{"private-execution-policy": invalid}');
  let r = f.run(f.args);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr, /private-execution-policy/);
  writeFileSync(f.executionFile, JSON.stringify(executionPolicy));
  writeFileSync(f.capturesFile, '{}');
  r = f.run(f.args);
  assert.equal(r.status, 2);
  const envelope = JSON.parse(r.stdout);
  assert.equal(envelope.mode, 'execute-queries');
  assert.equal(envelope.result, null);
});

test('copied engine executes queries and structural mode survives a broken execution dependency', t => {
  const f = executionFixture(t, true);
  cpSync(join(repository, 'payload/engine'), join(f.kitRoot, 'engine'), { recursive: true });
  cpSync(join(repository, 'payload/schemas'), join(f.kitRoot, 'schemas'), { recursive: true });
  symlinkSync(join(repository, 'node_modules'), join(f.kitRoot, 'node_modules'), 'dir');
  const installedCli = join(f.kitRoot, 'engine/intent-plan.js');
  let r = f.run(f.args, installedCli);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).result.execution, 'complete');
  const admissionModule = join(f.kitRoot, 'engine/lib/intent-query-admission.js');
  writeFileSync(admissionModule, "throw new Error('injected admission failure');\n" + readFileSync(admissionModule, 'utf8'));
  r = f.run(f.args, installedCli);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /injected admission failure/);
  assert.equal(f.run([f.planFile, '--json'], installedCli).status, 0);
});
