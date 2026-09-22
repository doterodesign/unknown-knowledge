import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { subjectPromotionFixture } from './helpers/subject-promotion-fixture.js';
import { subjectQuery } from './helpers/subject-query-fixture.js';
import { loadSubjectQueryContext } from '../payload/engine/lib/subject-query-context.js';
import { querySubjects } from '../payload/engine/lib/subject-query.js';

const command = fileURLToPath(new URL('../payload/engine/query-subjects.js', import.meta.url));
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
  const queryFile = put('query.json', subjectQuery());
  const decisionFile = put('decisions.json', f.decisionCaptures.map(transport));
  const assessment = { registry: transport(f.beforeCaptures.registry), identity: transport(f.beforeCaptures.identity) };
  const assessmentFile = put('assessments.json', [assessment]);
  const run = ({ evidence = true } = {}) => {
    const result = spawnSync(process.execPath, [command, '--root', f.root, '--query', queryFile,
      '--decision-captures', decisionFile, ...(evidence ? ['--assessment-captures', assessmentFile] : []), '--json'],
    { encoding: 'utf8' });
    return { ...result, output: result.stdout ? JSON.parse(result.stdout) : null };
  };
  return { ...f, putFile: put, assessment, assessmentFile, run };
}

test('actual promoted context needs retained assessment evidence and never falls back to current files', (t) => {
  const f = fixture(t);
  const missing = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures });
  assert.equal(missing.ok, true);
  const refused = querySubjects(missing.context, subjectQuery());
  assert.equal(refused.status, 'refused');
  assert.equal(refused.diagnostics[0].code, 'governance-unavailable');
  const valid = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures,
    assessmentCaptures: [f.beforeCaptures] });
  assert.equal(valid.ok, true, JSON.stringify(valid.diagnostics));
  assert.equal(querySubjects(valid.context, subjectQuery()).counts.knowledge.strict, 1);
});

test('the actual promoted query fixture passes matching structure and value gates', (t) => {
  const f = fixture(t);
  for (const name of ['validate', 'validate-values']) {
    const path = fileURLToPath(new URL(`../payload/engine/${name}.js`, import.meta.url));
    const result = spawnSync(process.execPath, [path, '--root', f.root, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  }
});

test('actual promoted CLI completes only with complete verified retained assessment pairs', (t) => {
  const f = fixture(t);
  const beforeRegistry = readFileSync(join(f.root, 'subjects/registry.yaml'));
  const missing = f.run({ evidence: false });
  assert.equal(missing.status, 2);
  assert.equal(missing.output.status, 'refused');
  assert.equal(missing.output.diagnostics[0].code, 'governance-unavailable');
  const valid = f.run();
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.output.status, 'complete');
  assert.deepEqual(valid.output.groups.knowledge.strict.map(({ ref }) => ref.id), ['K-000001']);
  assert.deepEqual(readFileSync(join(f.root, 'subjects/registry.yaml')), beforeRegistry);
});

test('promoted CLI rejects incomplete, malformed, corrupt and duplicate assessment inputs', (t) => {
  const f = fixture(t);
  const invalid = [
    [[{ registry: f.assessment.registry }], 'invalid-assessment-captures'],
    [[{ ...f.assessment, identity: { ...f.assessment.identity, bytesBase64: '???' } }], 'invalid-assessment-captures'],
    [[{ ...f.assessment, registry: { ...f.assessment.registry, bytesBase64: Buffer.from('wrong bytes').toString('base64') } }], 'invalid-refusal-assessment'],
    [[f.assessment, f.assessment], 'invalid-refusal-assessment'],
    ['{', 'invalid-assessment-captures-json'],
  ];
  for (const [input, code] of invalid) {
    f.putFile('assessments.json', input);
    const result = f.run();
    assert.equal(result.status, 2);
    assert.equal(result.output?.status, 'refused', result.stderr);
    assert.equal(result.output.diagnostics[0].code, code);
    assert.equal(result.output.groups, null);
    assert.equal(result.output.counts, null);
  }
});
