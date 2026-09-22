import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { subjectPromotionFixture } from './helpers/subject-promotion-fixture.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';

const command = fileURLToPath(new URL('../payload/engine/intent-plan.js', import.meta.url));
const transport = ({ capture, bytes, objectFormat }) => ({ capture, bytesBase64: bytes.toString('base64'), objectFormat });

function fixture(t) {
  const f = subjectPromotionFixture(t);
  f.identity.allocations.push({ kind: 'knowledge', id: 'K-000001', state: 'allocated',
    publication: { ...f.identity.allocations.at(-1).publication } });
  f.put();
  const put = (name, content) => {
    const path = join(f.root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
    return path;
  };
  const record = { 'schema-version': 3, id: 'K-000001', heading: 'Recorded promoted meaning',
    domain: 'world', citations: [{ source: 'fixture source' }], subjects: ['S-000001'], facets: { stage: 'verified' } };
  put('knowledge/K-000001.md', `---\n${JSON.stringify(record)}\n---\nRetained fixture body.\n`);
  put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge',
    entries: [{ id: record.id, title: record.heading, file: 'K-000001.md' }] });
  put('knowledge/_registries/stage.yaml', { 'schema-version': 2, store: 'knowledge', registry: 'stage',
    values: [{ value: 'verified', gloss: 'Verified fixture lifecycle', warrant: 'Fixture lifecycle', decision: 'D-000002' }] });
  const plan = { version: 1, inputRef: 'request:color', inventoryStatus: 'declared-complete',
    units: [{ key: 'color', sourceRef: 'request:color', disposition: 'mapped' }], bindings: [], clarifications: [],
    constraints: [{ key: 'color', origin: 'explicit', unitKeys: ['color'], bindingKeys: [],
      queryRefs: ['/where', '/stores', '/view'].map(path => ({ branch: 'strict', path })), requirementKeys: ['source'] }],
    requirements: [{ key: 'source', unitKeys: ['color'], description: 'Read source support.' }],
    branches: [{ key: 'strict', kind: 'strict', unitKeys: ['color'], assumptions: [], relaxes: [], query: subjectQuery() }] };
  const planFile = put('plan.json', plan);
  const admissionFile = put('admission.json', { version: 1, maxBranches: 1, maxReservedAstNodes: 32, maxReservedRedirects: 8 });
  const executionFile = put('execution.json', { version: 1, maxBranches: 1, maxReservedAstNodes: 32, maxAstDepth: 8,
    maxReservedRedirects: 8, maxReservedHierarchyNodes: 64, maxReservedHierarchyEdges: 64, maxReservedRecords: 100,
    maxReservedPredicateSteps: 1000, maxReservedExplanationNodes: 10000, maxReservedResultSlots: 10 });
  const decisionFile = put('decisions.json', f.decisionCaptures.map(transport));
  const assessment = { registry: transport(f.beforeCaptures.registry), identity: transport(f.beforeCaptures.identity) };
  const assessmentFile = put('assessments.json', [assessment]);
  const run = (mode, { evidence = true, operationLimits } = {}) => spawnSync(process.execPath,
    [command, planFile, `--${mode}`, '--root', f.root, '--admission', admissionFile, '--decision-captures', decisionFile,
      ...(evidence ? ['--assessment-captures', assessmentFile] : []),
      ...(mode === 'execute-queries' ? ['--execution-admission', executionFile] : []), '--json',
      ...(operationLimits ? ['--operation-limits-json', JSON.stringify(operationLimits)] : [])], { encoding: 'utf8' });
  return { ...f, putFile: put, planFile, assessmentFile, assessment, run };
}

for (const mode of ['validate-queries', 'execute-queries']) test(`${mode} consumes authentic promotion captures without historical-file fallback`, t => {
  const f = fixture(t);
  const watched = ['subjects/registry.yaml', '_identity.yaml', 'knowledge/K-000001.md'].map(name => join(f.root, name));
  const before = watched.map(file => readFileSync(file));
  let r = f.run(mode, { evidence: false });
  assert.equal(r.status, 2, r.stderr);
  assert.ok(JSON.parse(r.stdout).result.diagnostics.some(d => d.code === 'governance-unavailable'));
  r = f.run(mode);
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout).result;
  if (mode === 'execute-queries') {
    assert.equal(result.status, 'complete');
    assert.deepEqual(result.branches[0].result.groups.knowledge.strict.map(row => row.ref.id), ['K-000001']);
    assert.equal(result.handoff, null);
  } else assert.equal(result.queryValidation, 'passed');
  watched.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i]));
});

test('operation-aware intent modes share authentic Decision and assessment capture admission', t => {
  const f = fixture(t);
  const rawBytes = [...f.decisionCaptures, f.beforeCaptures.registry, f.beforeCaptures.identity]
    .reduce((sum, capture) => sum + capture.bytes.length, 0);
  const operationLimits = { version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152, maxOutputBytes: 262144,
    validation: { maxCaptureBytes: rawBytes, maxDocumentNodes: 2000000, maxDocumentTextUnits: 67108864,
      maxSubjects: 32768, maxHistoryRows: 131072, maxValidationSteps: 5000000 },
    corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
      maxHistoryEvents: 256, maxHistoryRows: 1024, maxAssignmentsPerRecord: 16, maxAssignments: 16000, maxBodyBytesPerRecord: 16384 } };
  for (const mode of ['validate-queries', 'execute-queries']) {
    const baseline = f.run(mode), bounded = f.run(mode, { operationLimits });
    assert.equal(bounded.status, 0, bounded.stderr || bounded.stdout);
    assert.equal(bounded.stdout, baseline.stdout); assert.equal(bounded.stderr, '');
    const short = f.run(mode, { operationLimits: { ...operationLimits,
      validation: { ...operationLimits.validation, maxCaptureBytes: rawBytes - 1 } } });
    assert.equal(short.status, 2); assert.equal(short.stderr, '');
    assert.equal(JSON.parse(short.stdout).failure.counter, 'captureBytes');
  }
});

test('assessment transport preserves owner refusal codes and sanitized JSON errors in both modes', t => {
  const f = fixture(t);
  for (const [input, code] of [
    [[{ registry: f.assessment.registry }], 'invalid-assessment-captures'],
    [[{ ...f.assessment, identity: { ...f.assessment.identity, bytesBase64: '???' } }], 'invalid-assessment-captures'],
    [[{ ...f.assessment, registry: { ...f.assessment.registry, bytesBase64: Buffer.from('wrong bytes').toString('base64') } }], 'invalid-refusal-assessment'],
    [[f.assessment, f.assessment], 'invalid-refusal-assessment'],
  ]) for (const mode of ['validate-queries', 'execute-queries']) {
    f.putFile('assessments.json', input);
    const r = f.run(mode);
    assert.equal(r.status, 2, r.stderr);
    const output = JSON.parse(r.stdout);
    assert.equal(output.mode, mode);
    assert.equal(output.result, null);
    assert.ok(output.diagnostics.some(d => d.code === code), JSON.stringify(output));
  }
  f.putFile('assessments.json', '{"private-assessment": invalid}');
  const malformed = f.run('execute-queries');
  assert.equal(malformed.status, 2);
  assert.equal(malformed.stdout, '');
  assert.doesNotMatch(malformed.stderr, /private-assessment/);
  const structural = spawnSync(process.execPath, [command, f.planFile, '--assessment-captures', f.assessmentFile], { encoding: 'utf8' });
  assert.equal(structural.status, 2);
  assert.match(structural.stderr, /require.*--validate-queries.*--execute-queries/);
});
