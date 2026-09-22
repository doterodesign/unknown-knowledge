import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { subjectQuery, queryBudgets } from './helpers/subject-query-fixture.js';

const command = fileURLToPath(new URL('../payload/engine/query-subjects.js', import.meta.url));
function run(fixture, query = subjectQuery(), options = {}) {
  const file = join(fixture.root, 'query.json');
  writeFileSync(file, JSON.stringify(query));
  const args = ['--root', fixture.root, '--query', file,
    ...(options.evidence === false ? [] : ['--decision-captures', fixture.capturesFile]),
    ...(options.human ? [] : ['--json']), ...(options.args ?? [])];
  const result = spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' });
  return { ...result, output: options.human || !result.stdout ? null : JSON.parse(result.stdout) };
}

test('actual CLI executes root and nested canonical stores with real retained approval bytes', (t) => {
  for (const nested of [false, true]) {
    const result = run(subjectQueryDiskFixture(t, { nested }));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output.status, 'complete');
    assert.deepEqual(result.output.groups.knowledge.strict.map(({ ref }) => ref.id), ['K-000001', 'K-000002']);
    assert.equal(result.output.input.consistency, 'captured-model');
  }
});

test('completed zero and metadata unknown are exit zero, distinct from incomplete execution', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  const zero = run(fixture, subjectQuery({ op: 'none' }));
  assert.equal(zero.status, 0);
  assert.equal(zero.output.counts.knowledge.strict, 0);
  const unknown = run(fixture, subjectQuery(undefined, { possibleMatches: true }));
  assert.equal(unknown.status, 0);
  assert.equal(unknown.output.counts.knowledge.possible, 1);
  const partial = run(fixture, subjectQuery(undefined, { budgets: { ...queryBudgets, maxRecords: 0 } }));
  assert.equal(partial.status, 2);
  assert.equal(partial.output.status, 'incomplete');
  assert.equal(partial.output.coverage.unvalidatedRecords, 6);
});

test('counts use the same actual scan and output truncation does not change completion exit', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  const query = subjectQuery(undefined, { budgets: { ...queryBudgets, maxResultsPerStore: 1 } });
  const rows = run(fixture, query);
  const counts = run(fixture, query, { args: ['--counts'] });
  assert.equal(rows.status, 0);
  assert.equal(counts.status, 0);
  assert.equal(rows.output.coverage.pageTruncated, true);
  assert.deepEqual(counts.output.counts, rows.output.counts);
  assert.equal(counts.output.groups, null);
  assert.equal(counts.output.input.fingerprint, rows.output.input.fingerprint);
});

test('absence or corruption of retained evidence refuses without reading current Decisions as proof', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  const missing = run(fixture, subjectQuery(), { evidence: false });
  assert.equal(missing.status, 2);
  assert.equal(missing.output.status, 'refused');
  assert.equal(missing.output.diagnostics[0].code, 'governance-unavailable');
  const transport = JSON.parse(readFileSync(fixture.capturesFile, 'utf8'));
  transport[0].bytesBase64 = 'not base64';
  writeFileSync(fixture.capturesFile, JSON.stringify(transport));
  const malformed = run(fixture);
  assert.equal(malformed.status, 2);
  assert.equal(malformed.output.diagnostics[0].code, 'invalid-decision-captures');
  transport[0].bytesBase64 = Buffer.from('corrupt retained bytes').toString('base64');
  writeFileSync(fixture.capturesFile, JSON.stringify(transport));
  const corrupt = run(fixture);
  assert.equal(corrupt.status, 2);
  assert.equal(corrupt.output.diagnostics[0].code, 'evidence-digest-mismatch');
});

test('all view retains separate proposal identities through the real CLI', (t) => {
  const result = run(subjectQueryDiskFixture(t), subjectQuery(undefined, { view: 'all' }));
  assert.equal(result.status, 0);
  const draft = result.output.groups.knowledge.strict.find(({ identityType }) => identityType === 'proposal');
  assert.ok(draft.proposalRef.key.startsWith('proposal:knowledge:'));
  assert.equal(Object.hasOwn(draft, 'ref'), false);
});

test('actual scoped CLI uses captured jurisdiction authority and exposes legacy default basis', (t) => {
  const result = run(subjectQueryDiskFixture(t), subjectQuery(undefined, { applicability: {
    profile: 'legacy-jurisdictions-v1', mode: 'any', jurisdictions: ['eu-eaa'],
  } }));
  assert.equal(result.status, 0);
  assert.match(result.output.input.inputs.jurisdictions, /^[a-f0-9]{64}$/);
  assert.equal(result.output.groups.knowledge.strict[0].applicability.scopeBasis, 'legacy-unrestricted-default');
});

test('invalid JSON and missing authority are explicit refused outputs with exit two', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  const bad = join(fixture.root, 'invalid-query.json');
  writeFileSync(bad, '{');
  const parsed = spawnSync(process.execPath, [command, '--query', bad, '--root', fixture.root, '--json'], { encoding: 'utf8' });
  assert.equal(parsed.status, 2);
  assert.equal(JSON.parse(parsed.stdout).diagnostics[0].code, 'invalid-query-json');
  rmSync(join(fixture.kitRoot, 'knowledge'), { recursive: true });
  rmSync(join(fixture.kitRoot, 'subjects'), { recursive: true });
  const missing = run(fixture);
  assert.equal(missing.status, 2);
  assert.equal(missing.output.diagnostics[0].code, 'unavailable-subjects');
});

test('human output states completion and per-store counts', (t) => {
  const result = run(subjectQueryDiskFixture(t), subjectQuery(), { human: true });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Subject query: complete/);
  assert.match(result.stdout, /knowledge: 2 strict \(exact\), 1 possible \(exact\), 3 excluded \(exact\)/);
});

test('interrupted human output labels possible counts provisional separately from lower bounds', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  const query = subjectQuery(undefined, { possibleMatches: true,
    budgets: { ...queryBudgets, maxRecords: 5 } });
  const json = run(fixture, query);
  assert.equal(json.status, 2);
  assert.equal(json.output.counts.knowledge.possible, 1);
  assert.equal(json.output.counts.knowledge.possibleBasis, 'provisional');
  const human = run(fixture, query, { human: true });
  assert.equal(human.status, 2);
  assert.match(human.stdout, /Subject query: incomplete/);
  assert.match(human.stdout, /2 strict \(lower-bound\), 1 possible \(provisional\), 2 excluded \(lower-bound\)/);
  assert.match(human.stdout, /5 evaluated, 1 unevaluated/);
});

test('module loading failures and usage errors cannot become findings exit one', (t) => {
  const fixture = subjectQueryDiskFixture(t);
  const copied = join(fixture.root, 'broken-engine');
  mkdirSync(copied);
  cpSync(fileURLToPath(new URL('../payload/engine', import.meta.url)), copied, { recursive: true });
  rmSync(join(copied, 'commands/query-subjects.js'));
  const broken = spawnSync(process.execPath, [join(copied, 'query-subjects.js')], { encoding: 'utf8' });
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /engine could not be loaded/);
  const usage = spawnSync(process.execPath, [command, '--unknown'], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /unknown/);
});
