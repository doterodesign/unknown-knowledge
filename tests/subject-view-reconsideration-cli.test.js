import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subjectReconsiderationConsumerFixture } from './helpers/subject-reconsideration-consumer-fixture.js';
import { subjectPromotionFixture } from './helpers/subject-promotion-fixture.js';

const command = fileURLToPath(new URL('../payload/engine/subject-view.js', import.meta.url));
const modes = ['route', 'contexts'];

function run(f, mode, { materials = true, assessments = true, operationLimits } = {}) {
  return spawnSync(process.execPath, [command, '--mode', mode, '--root', f.root,
    '--request', f.files[mode], '--decision-captures', f.files.decisions,
    ...(assessments ? ['--assessment-captures', f.files.assessments] : []),
    ...(materials ? ['--material-captures', f.files.materials] : []), '--json',
    ...(operationLimits ? ['--operation-limits-json', JSON.stringify(operationLimits)] : [])],
  { encoding: 'utf8', timeout: 20000 });
}

function successful(result, mode) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, mode);
  assert.equal(output.result.status, 'complete');
  if (mode === 'route') {
    assert.deepEqual(output.result.groups.knowledge.strict.map(row => row.ref.id), ['K-000001']);
  } else {
    assert.deepEqual(output.result.contexts.map(row => [row.subject, row.counts.knowledge.strict]), [['S-000002', 1]]);
    assert.equal(output.result.coverage.countsComplete, true);
  }
  return output;
}

for (const options of [{ objectFormat: 'sha1' }, { objectFormat: 'sha256', nested: true }]) {
  test(`views continue actual reconsideration ${options.objectFormat}${options.nested ? ' nested' : ''}`, t => {
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

test('view modes independently admit exact decoded bytes and refuse one byte short', t => {
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

test('view omission of selected material or original scope cannot yield complete membership', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  for (const mode of modes) successful(run(f, mode), mode);
  for (const mode of modes) for (const omitted of [{ materials: false }, { assessments: false }]) {
    const result = run(f, mode, omitted);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.notEqual(output.result.status, 'complete');
    assert.ok(output.result.diagnostics.some(row => row.code === 'governance-unavailable'), result.stdout);
  }
});

test('view material integrity, duplicate and unused captures fail actual governance', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  for (const mode of modes) successful(run(f, mode), mode);
  const wire = JSON.parse(readFileSync(f.files.materials, 'utf8'));
  const unused = JSON.parse(readFileSync(f.files.decisions, 'utf8'))[0];
  for (const document of [
    [{ ...wire[0], bytesBase64: Buffer.from('wrong retained bytes').toString('base64') }],
    [wire[0], wire[0]], [...wire, unused],
  ]) {
    f.writeJson('materials.json', document);
    for (const mode of modes) for (const operationLimits of [undefined, { ...f.operationLimits,
      validation: { ...f.operationLimits.validation, maxCaptureBytes: f.rawCaptureBytes * 4 } }]) {
      const result = run(f, mode, { operationLimits });
      assert.equal(result.status, 2, result.stderr || result.stdout);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, 'refused');
      assert.equal(Object.hasOwn(output, 'result'), false);
      assert.ok(output.diagnostics.some(row => row.code === 'invalid-evidence'), result.stdout);
    }
  }
});

test('views distinguish unavailable authored assignments from unrelated unavailable history', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const request = structuredClone(f.routeRequest);
  request.route.subjects = [f.contextSubject];
  f.writeJson('route.json', request);
  const coassigned = run(f, 'route', { materials: false });
  assert.equal(coassigned.status, 2, coassigned.stderr || coassigned.stdout);
  assert.ok(JSON.parse(coassigned.stdout).result.diagnostics.some(row => row.code === 'governance-unavailable'
    && row.ref?.id === 'K-000001' && row.path === 'subjects[0]'), coassigned.stdout);
  const path = join(f.kitRoot, 'knowledge/K-000001.md');
  const original = readFileSync(path, 'utf8');
  const boundary = original.indexOf('\n---\n', 4);
  const record = JSON.parse(original.slice(4, boundary));
  record.subjects = ['S-000002'];
  writeFileSync(path, `---\n${JSON.stringify(record)}${original.slice(boundary)}`);
  const contexts = structuredClone(f.contextsRequest);
  contexts.query.where.subject = f.contextSubject;
  f.writeJson('contexts.json', contexts);
  for (const operationLimits of [undefined, f.operationLimits]) {
    successful(run(f, 'route', { materials: false, operationLimits }), 'route');
    const result = run(f, 'contexts', { materials: false, operationLimits });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.result.status, 'complete');
    assert.equal(output.result.base.counts.knowledge.strict, 1);
    assert.deepEqual(output.result.contexts, []);
  }
});

test('view malformed material follows existing bounded typed refusal transport', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const wire = JSON.parse(readFileSync(f.files.materials, 'utf8'));
  for (const document of [null, [{ ...wire[0], bytesBase64: '???' }]]) {
    f.writeJson('materials.json', document);
    for (const mode of modes) {
      const result = run(f, mode, { operationLimits: f.operationLimits });
      assert.equal(result.status, 2, result.stderr || result.stdout);
      assert.equal(result.stderr, '');
      assert.equal(JSON.parse(result.stdout).failure.code, 'invalid-material-captures');
    }
  }
});

test('tree mode rejects assessment and material flags before reading evidence', t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const limits = ['--max-nodes', '20', '--max-edges', '20', '--max-rows', '20', '--max-bytes', '20000'];
  const tree = spawnSync(process.execPath, [command, '--mode', 'tree', '--root', f.root, '--check', '--json', ...limits],
    { encoding: 'utf8' });
  assert.equal(tree.status, 1, tree.stderr || tree.stdout);
  assert.equal(tree.stderr, '');
  for (const flag of ['--assessment-captures', '--material-captures']) {
    const result = spawnSync(process.execPath, [command, '--mode', 'tree', '--root', f.root, ...limits,
      flag, join(f.root, 'missing-evidence.json')], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Tree mode does not accept/);
    assert.doesNotMatch(result.stderr, /ENOENT|Cannot read/);
  }
});

test('ordinary promoted Subject views receive their original assessment without material', t => {
  const requests = subjectReconsiderationConsumerFixture(t);
  const f = subjectPromotionFixture(t, { parentStatus: 'active' });
  f.identity.allocations.push({ kind: 'knowledge', id: 'K-000001', state: 'allocated',
    publication: { ...f.identity.allocations.at(-1).publication } });
  f.put();
  mkdirSync(join(f.root, 'knowledge/_registries'), { recursive: true });
  const record = { 'schema-version': 3, id: 'K-000001', heading: 'Recorded promoted meaning', domain: 'world',
    citations: [{ source: 'fixture source' }], subjects: ['S-000001', 'S-000002'], facets: { stage: 'verified' } };
  writeFileSync(join(f.root, 'knowledge/K-000001.md'), `---\n${JSON.stringify(record)}\n---\nRetained fixture body.\n`);
  writeFileSync(join(f.root, 'knowledge/_catalog.yaml'), JSON.stringify({ 'schema-version': 2, store: 'knowledge',
    entries: [{ id: record.id, title: record.heading, file: 'K-000001.md' }] }));
  writeFileSync(join(f.root, 'knowledge/_registries/stage.yaml'), JSON.stringify({ 'schema-version': 2, store: 'knowledge', registry: 'stage',
    values: [{ value: 'verified', gloss: 'Verified fixture lifecycle', warrant: 'Fixture lifecycle', decision: 'D-000002' }] }));
  const transport = ({ capture, bytes, objectFormat }) => ({ capture, bytesBase64: bytes.toString('base64'), objectFormat });
  requests.writeJson('decisions.json', f.decisionCaptures.map(transport));
  requests.writeJson('assessments.json', [{ registry: transport(f.beforeCaptures.registry), identity: transport(f.beforeCaptures.identity) }]);
  const consumer = { ...requests, root: f.root };
  for (const mode of modes) {
    successful(run(consumer, mode, { materials: false }), mode);
    const missing = run(consumer, mode, { materials: false, assessments: false });
    assert.equal(missing.status, 2, missing.stderr || missing.stdout);
    assert.ok(JSON.parse(missing.stdout).result.diagnostics.some(row => row.code === 'governance-unavailable'));
  }
});
