import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, queryBudgets } from './helpers/subject-query-fixture.js';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { subjectReconsiderationConsumerFixture } from './helpers/subject-reconsideration-consumer-fixture.js';

export const interfaceLimits = () => ({ version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152,
  maxOutputBytes: 262144, validation: { maxCaptureBytes: 33554432, maxDocumentNodes: 2000000,
    maxDocumentTextUnits: 67108864, maxSubjects: 32768, maxHistoryRows: 131072, maxValidationSteps: 5000000 },
  corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
    maxHistoryEvents: 256, maxHistoryRows: 1024, maxAssignmentsPerRecord: 16, maxAssignments: 16000,
    maxBodyBytesPerRecord: 16384 } });
const request = (root, operation, input) => ({ interfaceVersion: 1, operation, inputVersion: 1, root, input });
const api = () => import('../payload/engine/api/index.js');
const queryInput = f => ({ query: subjectQuery(), collect: 'results', operationLimits: interfaceLimits(),
  evidence: { decisionCaptures: JSON.parse(readFileSync(f.capturesFile)), assessmentCaptures: [], materialCaptures: [] } });

test('interface discovery advertises real handlers and refuses invalid requests before root access', async () => {
  const { invoke } = await api();
  const base = request('/does-not-exist', 'engine.capabilities', {});
  const result = await invoke(base);
  assert.equal(result.status, 'completed');
  assert.ok(result.data.operations.some(row => row.operation === 'subject.query'));
  const changed = new Set(['subject.query', 'subject.route', 'subject.contexts', 'intent.validateQueries', 'intent.executeQueries']);
  for (const row of result.data.operations) {
    assert.equal(row.inputVersion, 1);
    assert.equal(row.outputVersion, changed.has(row.operation) ? 2 : 1, row.operation);
  }
  for (const malformed of [{ ...base, extra: true }, { ...base, interfaceVersion: 2 },
    { ...base, operation: 'not.registered' }, { ...base, root: '.' }, { ...base, input: { extra: true } }]) {
    const denied = await invoke(malformed);
    assert.equal(denied.status, 'refused');
    assert.equal(Object.hasOwn(denied, 'data'), false);
  }
  let reads = 0;
  const accessor = { ...base };
  Object.defineProperty(accessor, 'input', { get() { reads++; throw Error('not data'); } });
  assert.equal((await invoke(accessor)).status, 'refused');
  assert.equal(reads, 0);
});

test('lookup API preserves existing CLI output and distinguishes zero matches from absent authority', async t => {
  const { invoke } = await api();
  const f = subjectQueryDiskFixture(t, { nested: true });
  const input = { text: 'Shape' };
  const result = await invoke(request(f.root, 'subject.lookup', input));
  const old = spawnSync(process.execPath, ['payload/engine/subject.js', 'lookup', 'Shape', '--root', f.root, '--json'], { encoding: 'utf8' });
  assert.equal(old.status, 0, old.stderr);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.data, JSON.parse(old.stdout));
  const empty = await invoke(request(f.root, 'subject.lookup', { text: 'no-such-label' }));
  assert.equal(empty.status, 'completed');
  assert.deepEqual(empty.data.result.matches, []);
  rmSync(join(f.kitRoot, 'subjects'), { recursive: true });
  assert.equal((await invoke(request(f.root, 'subject.lookup', input))).status, 'refused');
});

test('governed query returns actual records and preserves partial and unavailable reports', async t => {
  const { invoke } = await api();
  const f = subjectQueryDiskFixture(t);
  const input = queryInput(f);
  const result = await invoke(request(f.root, 'subject.query', input));
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(result.outputVersion, 2);
  assert.equal(result.data.outputVersion, 2);
  assert.equal(result.data.input.versions.evaluator, 2);
  assert.equal(result.data.status, 'complete', JSON.stringify(result.data));
  assert.deepEqual(result.data.groups.knowledge.strict.map(row => row.ref.id), ['K-000001', 'K-000002']);
  const partial = structuredClone(input);
  partial.query.budgets = { ...queryBudgets, maxRecords: 0 };
  const incomplete = await invoke(request(f.root, 'subject.query', partial));
  assert.equal(incomplete.status, 'completed');
  assert.equal(incomplete.data.status, 'incomplete');
  assert.ok(incomplete.data.counts.knowledge.unevaluated > 0);
  const absent = structuredClone(input); absent.evidence.decisionCaptures = [];
  const unavailable = await invoke(request(f.root, 'subject.query', absent));
  assert.equal(unavailable.status, 'completed');
  assert.equal(unavailable.data.status, 'refused');
  assert.ok(unavailable.data.diagnostics.some(row => row.code === 'governance-unavailable'));
});

test('query requires explicit capacities and canonical evidence, with no unbounded fallback', async t => {
  const { invoke } = await api();
  const f = subjectQueryDiskFixture(t);
  const missing = queryInput(f); delete missing.operationLimits;
  assert.equal((await invoke(request(f.root, 'subject.query', missing))).status, 'refused');
  const exhausted = queryInput(f); exhausted.operationLimits.maxSourceBytes = 0;
  const result = await invoke(request(f.root, 'subject.query', exhausted));
  assert.equal(result.status, 'refused');
  assert.ok(result.diagnostics.length);
  const malformed = queryInput(f); malformed.evidence.decisionCaptures[0].bytesBase64 = '!';
  assert.equal((await invoke(request(f.root, 'subject.query', malformed))).status, 'refused');
});

test('request-file CLI returns the same envelope and enforces exact framing capacities', async t => {
  const { invoke } = await api(); const f = subjectQueryDiskFixture(t);
  const req = request(f.root, 'subject.query', queryInput(f));
  const file = join(f.root, 'request.json'); const source = JSON.stringify(req);
  writeFileSync(file, source);
  const expected = await invoke(req); const output = `${JSON.stringify(expected)}\n`;
  const run = (inputBytes, outputBytes) => spawnSync(process.execPath, ['payload/engine/invoke.js', '--request', file,
    '--max-request-bytes', String(inputBytes), '--max-output-bytes', String(outputBytes)], { encoding: 'utf8' });
  const exact = run(Buffer.byteLength(source), Buffer.byteLength(output));
  assert.equal(exact.status, 0, exact.stderr); assert.deepEqual(JSON.parse(exact.stdout), expected);
  for (const result of [run(Buffer.byteLength(source) - 1, Buffer.byteLength(output)),
    run(Buffer.byteLength(source), Buffer.byteLength(output) - 1)]) {
    assert.equal(result.status, 2); assert.equal(result.stdout, '');
  }
  cpSync(new URL('../payload/engine', import.meta.url), join(f.kitRoot, 'engine'), { recursive: true });
  cpSync(new URL('../payload/schemas', import.meta.url), join(f.kitRoot, 'schemas'), { recursive: true });
  cpSync(new URL('../payload/package.json', import.meta.url), join(f.kitRoot, 'package.json'));
  mkdirSync(join(f.kitRoot, 'node_modules'));
  cpSync(new URL('../node_modules/js-yaml', import.meta.url), join(f.kitRoot, 'node_modules/js-yaml'), { recursive: true });
  const copied = spawnSync(process.execPath, [join(f.kitRoot, 'engine/invoke.js'), '--request', file,
    '--max-request-bytes', String(Buffer.byteLength(source)), '--max-output-bytes', String(Buffer.byteLength(output))],
  { cwd: f.root, encoding: 'utf8' });
  assert.equal(copied.status, 0, copied.stderr);
  assert.deepEqual(JSON.parse(copied.stdout), expected, 'seeded engine needs no MCP dependency');
});

test('official MCP client discovers and calls actual lookup/query owners over stdio', { timeout: 15000 }, async t => {
  const { invoke } = await api(); const f = subjectQueryDiskFixture(t);
  const transport = new StdioClientTransport({ command: process.execPath, args: ['cli/mcp.js', '--root', f.root,
    '--max-message-bytes', '1048576', '--max-result-bytes', '1048576'], stderr: 'pipe' });
  const client = new Client({ name: 'unknown-knowledge-interface-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['engine_capabilities', 'intent_executeQueries',
    'intent_inspectBindings', 'intent_validate', 'intent_validateQueries', 'record_preflight', 'subject_contexts', 'subject_lookup', 'subject_query', 'subject_route', 'subject_tree']);
  const input = queryInput(f);
  const found = await client.callTool({ name: 'subject_query', arguments: input });
  assert.equal(found.isError, false, JSON.stringify(found));
  assert.deepEqual(found.structuredContent, await invoke(request(f.root, 'subject.query', input)));
  const unexpectedField = structuredClone(input);
  Object.defineProperty(unexpectedField.query, '__proto__', { value: null, enumerable: true });
  const nativeRefusal = await invoke(request(f.root, 'subject.query', unexpectedField));
  assert.equal(nativeRefusal.data.status, 'refused');
  const transportedRefusal = await client.callTool({ name: 'subject_query', arguments: unexpectedField });
  assert.equal(transportedRefusal.isError, true, 'MCP must not strip unknown native query keys');
  assert.deepEqual(transportedRefusal.structuredContent, nativeRefusal);
  const otherRoot = await client.callTool({ name: 'subject_lookup', arguments: { text: 'Shape', root: '/another-repo' } });
  assert.equal(otherRoot.isError, true);
  input.query.budgets.maxRecords = 0;
  const partial = await client.callTool({ name: 'subject_query', arguments: input });
  assert.equal(partial.isError, true);
  assert.equal(partial.structuredContent.data.status, 'incomplete');
});

test('MCP admits both factored payload copies at the exact result byte boundary', { timeout: 15000 }, async t => {
  const { invoke } = await api(); const f = subjectQueryDiskFixture(t);
  const input = queryInput(f);
  const report = await invoke(request(f.root, 'subject.query', input));
  const expected = { content: [{ type: 'text', text: JSON.stringify(report) }], structuredContent: report, isError: false };
  const size = Buffer.byteLength(JSON.stringify(expected));
  assert.ok(size > Buffer.byteLength(JSON.stringify(report)) * 2, 'text escaping and both copies are counted');
  for (const capacity of [size, size - 1]) {
    const client = new Client({ name: 'factored-output-boundary', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: ['cli/mcp.js', '--root', f.root,
      '--max-message-bytes', '1048576', '--max-result-bytes', String(capacity)], stderr: 'pipe' });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: 'subject_query', arguments: input });
      if (capacity === size) assert.deepEqual(result, expected);
      else {
        assert.equal(result.isError, true);
        assert.equal(result.structuredContent, undefined);
        assert.match(result.content[0].text, /exceeds --max-result-bytes/);
      }
    } finally { await client.close(); }
  }
});

test('intent operations preserve source-review obligations through actual branch execution', async t => {
  const { invoke } = await api(); const f = subjectQueryDiskFixture(t);
  const plan = { version: 1, inputRef: 'request:meaning', inventoryStatus: 'declared-complete',
    units: [{ key: 'meaning', sourceRef: 'request:meaning', disposition: 'mapped' }], bindings: [],
    requirements: [{ key: 'source', unitKeys: ['meaning'], description: 'Read original source support.' }],
    constraints: ['/where', '/stores', '/view'].map((path, i) => ({ key: `constraint-${i}`, unitKeys: ['meaning'],
      origin: 'explicit', bindingKeys: [], queryRefs: [{ branch: 'strict', path }], requirementKeys: ['source'] })),
    branches: [{ key: 'strict', unitKeys: ['meaning'], kind: 'strict', query: subjectQuery(), assumptions: [], relaxes: [] }],
    clarifications: [] };
  const structural = await invoke(request(f.root, 'intent.validate', { plan }));
  assert.equal(structural.status, 'completed'); assert.equal(structural.data.valid, true);
  assert.equal(structural.data.queryValidation, 'not-run');
  const inspected = await invoke(request(f.root, 'intent.inspectBindings', { plan }));
  assert.equal(inspected.status, 'completed'); assert.equal(inspected.data.result.planValidation.valid, true);
  assert.equal(inspected.data.result.governanceValidation, 'not-run');
  const { evidence, operationLimits } = queryInput(f);
  const input = { plan, evidence, operationLimits,
    admission: { version: 1, maxBranches: 1, maxReservedAstNodes: 32, maxReservedRedirects: 8 } };
  const validated = await invoke(request(f.root, 'intent.validateQueries', input));
  assert.equal(validated.outputVersion, 2);
  assert.equal(validated.status, 'completed'); assert.equal(validated.data.result.valid, true);
  assert.equal(validated.data.result.execution, 'not-run');
  input.executionAdmission = { version: 1, maxBranches: 1, maxReservedAstNodes: 32, maxAstDepth: 8,
    maxReservedRedirects: 8, maxReservedHierarchyNodes: 64, maxReservedHierarchyEdges: 64,
    maxReservedRecords: 100, maxReservedPredicateSteps: 1000, maxReservedExplanationNodes: 10000, maxReservedResultSlots: 10 };
  const executed = await invoke(request(f.root, 'intent.executeQueries', input));
  assert.equal(executed.outputVersion, 2);
  assert.equal(executed.status, 'completed'); assert.equal(executed.data.result.status, 'complete', JSON.stringify(executed));
  assert.equal(executed.data.result.evidenceReview, 'not-run');
  assert.equal(executed.data.result.validation.work.queryValidationCalls, 1);
  assert.equal(executed.data.result.work.queryExecutionCalls, 1);
  assert.deepEqual(executed.data.result.branches[0].result.groups.knowledge.strict.map(row => row.ref.id), ['K-000001', 'K-000002']);
  assert.equal((await invoke(request(f.root, 'intent.validate', { plan, evidence }))).status, 'refused');
});

test('reconsidered subject query transports all evidence families with exact raw-byte admission', async t => {
  const { invoke } = await api(); const f = subjectReconsiderationConsumerFixture(t, { nested: true });
  const input = { query: f.query, collect: 'results', operationLimits: f.operationLimits,
    evidence: { decisionCaptures: JSON.parse(readFileSync(f.files.decisions)),
      assessmentCaptures: JSON.parse(readFileSync(f.files.assessments)), materialCaptures: JSON.parse(readFileSync(f.files.materials)) } };
  const result = await invoke(request(f.root, 'subject.query', input));
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(result.data.status, 'complete');
  assert.deepEqual(result.data.groups.knowledge.strict.map(row => row.ref.id), f.expectedIds);
  const counts = await invoke(request(f.root, 'subject.query', { ...input, collect: 'counts' }));
  assert.deepEqual(counts.data.counts, result.data.counts);
  assert.equal(counts.data.groups, null);
  const short = structuredClone(input); short.operationLimits.validation.maxCaptureBytes--;
  const denied = await invoke(request(f.root, 'subject.query', short));
  assert.equal(denied.status, 'refused');
  assert.ok(denied.diagnostics.some(row => row.code.includes('budget')));
  const missing = structuredClone(input); missing.evidence.materialCaptures = [];
  const unavailable = await invoke(request(f.root, 'subject.query', missing));
  assert.equal(unavailable.status, 'completed'); assert.equal(unavailable.data.status, 'refused');
  const corrupt = structuredClone(input);
  corrupt.evidence.materialCaptures[0].bytesBase64 = Buffer.from('different retained bytes').toString('base64');
  const invalid = await invoke(request(f.root, 'subject.query', corrupt));
  assert.notEqual(invalid.data?.status, 'complete');
});
