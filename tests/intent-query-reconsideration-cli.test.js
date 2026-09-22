import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subjectReconsiderationConsumerFixture } from './helpers/subject-reconsideration-consumer-fixture.js';
import { createSubjectOperation, getSubjectOperationUsage } from '../payload/engine/lib/subject-operation.js';
import { readSubjectQueryJson, decodeDecisionCaptures, decodeAssessmentCaptures,
  loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { validateIntentQueryPlan, executeIntentQueryPlan } from '../payload/engine/lib/intent-query-plan.js';

const command = fileURLToPath(new URL('../payload/engine/intent-plan.js', import.meta.url));
const modes = ['validate-queries', 'execute-queries'];

function run(f, mode, { materials = true, assessments = true, operationLimits } = {}) {
  return spawnSync(process.execPath, [command, f.files.plan, `--${mode}`, '--root', f.root,
    '--admission', f.files.admission, '--decision-captures', f.files.decisions,
    ...(assessments ? ['--assessment-captures', f.files.assessments] : []),
    ...(materials ? ['--material-captures', f.files.materials] : []),
    ...(mode === 'execute-queries' ? ['--execution-admission', f.files.executionAdmission] : []),
    '--json', ...(operationLimits ? ['--operation-limits-json', JSON.stringify(operationLimits)] : [])],
  { encoding: 'utf8', timeout: 20000 });
}

function successful(result, mode) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, mode);
  if (mode === 'execute-queries') {
    assert.equal(output.result.status, 'complete');
    assert.deepEqual(output.result.branches[0].result.groups.knowledge.strict.map(row => row.ref.id), ['K-000001']);
    assert.equal(output.result.handoff, null);
  } else assert.equal(output.result.queryValidation, 'passed');
  return output;
}

for (const options of [{ objectFormat: 'sha1' }, { objectFormat: 'sha256', nested: true }]) {
  test(`intent modes continue actual reconsideration ${options.objectFormat}${options.nested ? ' nested' : ''}`, t => {
    const f = subjectReconsiderationConsumerFixture(t, options);
    const watched = ['_identity.yaml', 'subjects/registry.yaml', 'knowledge/K-000001.md', 'knowledge/K-000002.md',
      'decisions/entries/review.yaml', 'material.txt'].map(path => join(f.kitRoot, path)).concat(Object.values(f.files));
    const original = watched.map(path => readFileSync(path));
    for (const mode of modes) {
      const baseline = run(f, mode);
      successful(baseline, mode);
      const bounded = run(f, mode, { operationLimits: f.operationLimits });
      successful(bounded, mode);
      assert.equal(bounded.stdout, baseline.stdout);
    }
    watched.forEach((path, i) => assert.deepEqual(readFileSync(path), original[i]));
  });
}

test('intent modes independently admit exact decoded bytes and refuse one byte short', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const rawBytes = [...f.decisionCaptures, ...f.assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]),
    ...f.materialCaptures].reduce((sum, capture) => sum + capture.bytes.length, 0);
  assert.equal(f.rawCaptureBytes, rawBytes);
  for (const mode of modes) {
    const limits = { ...f.operationLimits, validation: { ...f.operationLimits.validation, maxCaptureBytes: rawBytes } };
    successful(run(f, mode, { operationLimits: limits }), mode);
    const result = run(f, mode, { operationLimits: { ...limits,
      validation: { ...limits.validation, maxCaptureBytes: rawBytes - 1 } } });
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).failure.counter, 'captureBytes');
  }
});

test('intent omission of selected material or original scope remains unavailable, including NOT', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  for (const mode of modes) successful(run(f, mode), mode);
  for (const negated of [false, true]) {
    if (negated) {
      const plan = structuredClone(f.plan);
      plan.branches[0].query.where = { op: 'not', arg: plan.branches[0].query.where };
      f.writeJson('plan.json', plan);
    }
    for (const mode of modes) for (const omitted of [{ materials: false }, { assessments: false }]) {
      const result = run(f, mode, omitted);
      assert.equal(result.status, 2, result.stderr || result.stdout);
      const output = JSON.parse(result.stdout);
      assert.ok(output.result.diagnostics.some(row => row.code === 'governance-unavailable'), result.stdout);
      if (mode === 'execute-queries') assert.notEqual(output.result.status, 'complete');
    }
  }
});

test('intent material transport and actual integrity failures preserve owner diagnostics', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  for (const mode of modes) successful(run(f, mode), mode);
  const wire = JSON.parse(readFileSync(f.files.materials, 'utf8'));
  const unused = JSON.parse(readFileSync(f.files.decisions, 'utf8'))[0];
  for (const [document, code] of [
    [null, 'invalid-material-captures'],
    [[{ ...wire[0], bytesBase64: '???' }], 'invalid-material-captures'],
    [[{ ...wire[0], bytesBase64: Buffer.from('wrong retained bytes').toString('base64') }], 'invalid-evidence'],
    [[wire[0], wire[0]], 'invalid-evidence'],
    [[...wire, unused], 'invalid-evidence'],
  ]) {
    f.writeJson('materials.json', document);
    for (const mode of modes) for (const operationLimits of [undefined, { ...f.operationLimits,
      validation: { ...f.operationLimits.validation, maxCaptureBytes: f.rawCaptureBytes * 4 } }]) {
      const result = run(f, mode, { operationLimits });
      assert.equal(result.status, 2, result.stderr || result.stdout);
      const output = JSON.parse(result.stdout);
      assert.equal(output.result, null);
      assert.ok(output.diagnostics.some(row => row.code === code), result.stdout);
    }
  }
});

test('intent distinguishes unavailable authored assignments from unrelated unavailable history', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const plan = structuredClone(f.plan);
  plan.branches[0].query.where.subject = f.contextSubject;
  f.writeJson('plan.json', plan);
  successful(run(f, 'validate-queries', { materials: false }), 'validate-queries');
  const coassigned = run(f, 'execute-queries', { materials: false });
  assert.equal(coassigned.status, 2, coassigned.stderr || coassigned.stdout);
  assert.ok(JSON.parse(coassigned.stdout).result.branches[0].result.diagnostics.some(row => row.code === 'governance-unavailable'
    && row.ref?.id === 'K-000001' && row.path === 'subjects[0]'), coassigned.stdout);
  const path = join(f.kitRoot, 'knowledge/K-000001.md');
  const original = readFileSync(path, 'utf8');
  const boundary = original.indexOf('\n---\n', 4);
  const record = JSON.parse(original.slice(4, boundary));
  record.subjects = ['S-000002'];
  writeFileSync(path, `---\n${JSON.stringify(record)}${original.slice(boundary)}`);
  for (const mode of modes) for (const operationLimits of [undefined, f.operationLimits]) {
    successful(run(f, mode, { materials: false, operationLimits }), mode);
  }
});

test('intent nonquery modes reject material context flags before reading their files', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  for (const extra of [[], ['--inspect-bindings', '--root', f.root]]) {
    const result = spawnSync(process.execPath, [command, f.files.plan, ...extra,
      '--material-captures', join(f.root, 'missing-material.json')], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /require.*--validate-queries.*--execute-queries/);
    assert.doesNotMatch(result.stderr, /cannot read/);
  }
});

test('omitted material flag adds no transport guard; an explicit empty file owns both guards', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const parentPlan = structuredClone(f.plan);
  parentPlan.branches[0].query.where.subject = f.contextSubject;
  f.writeJson('plan.json', parentPlan);
  f.writeJson('materials.json', []);
  const path = join(f.kitRoot, 'knowledge/K-000001.md');
  const original = readFileSync(path, 'utf8');
  const boundary = original.indexOf('\n---\n', 4);
  const record = JSON.parse(original.slice(4, boundary));
  record.subjects = ['S-000002'];
  writeFileSync(path, `---\n${JSON.stringify(record)}${original.slice(boundary)}`);
  for (const mode of modes) {
    const operation = createSubjectOperation(f.operationLimits);
    const plan = readSubjectQueryJson(f.files.plan, 'plan', operation);
    const admission = readSubjectQueryJson(f.files.admission, 'admission', operation);
    const executionAdmission = mode === 'execute-queries'
      ? readSubjectQueryJson(f.files.executionAdmission, 'execution-admission', operation) : null;
    const decisions = readSubjectQueryJson(f.files.decisions, 'Decision-captures', operation);
    const assessments = readSubjectQueryJson(f.files.assessments, 'assessment-captures', operation);
    const decisionCaptures = decodeDecisionCaptures(decisions, { operation });
    const assessmentCaptures = decodeAssessmentCaptures(assessments, { operation });
    const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures, assessmentCaptures, materialCaptures: [], operation });
    assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
    const checked = mode === 'execute-queries'
      ? executeIntentQueryPlan(plan, loaded.context, { admission, executionAdmission, operation })
      : validateIntentQueryPlan(plan, loaded.context, { admission, operation });
    if (mode === 'execute-queries') assert.equal(checked.status, 'complete');
    else assert.equal(checked.queryValidation, 'passed');
    const nodes = getSubjectOperationUsage(operation).validation.documentNodes;
    const limited = maxDocumentNodes => ({ ...f.operationLimits,
      validation: { ...f.operationLimits.validation, maxDocumentNodes } });
    successful(run(f, mode, { materials: false, operationLimits: limited(nodes) }), mode);
    const short = run(f, mode, { materials: false, operationLimits: limited(nodes - 1) });
    assert.equal(short.status, 2, short.stderr || short.stdout);
    assert.equal(JSON.parse(short.stdout).failure.counter, 'documentNodes');
    // An empty JSON array is one parsed document node and one transport node.
    successful(run(f, mode, { operationLimits: limited(nodes + 2) }), mode);
    const explicitShort = run(f, mode, { operationLimits: limited(nodes + 1) });
    assert.equal(explicitShort.status, 2, explicitShort.stderr || explicitShort.stdout);
    assert.equal(JSON.parse(explicitShort.stdout).failure.counter, 'documentNodes');
  }
});
