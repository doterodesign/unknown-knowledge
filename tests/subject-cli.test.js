import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { lookupSubjects } from '../payload/engine/lib/subjects.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';

const cli = fileURLToPath(new URL('../payload/engine/subject.js', import.meta.url));
const namespace = '12345678-1234-4234-8234-123456789abc';
const proposal = `proposal:subject:${namespace}`;
function fixture(t, { nested = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'subject-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const kit = nested ? join(root, 'unknown-knowledge') : root;
  const document = { 'schema-version': 1, namespace, revision: 0, 'hierarchy-revision': 0,
    subjects: [{ id: proposal, label: 'Café', status: 'proposed',
      definition: { text: 'A place serving coffee', includes: [], excludes: [] },
      aliases: [{ label: 'Coffee house', locale: 'en', context: 'places' }], related: [], changes: [] }], history: [] };
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace, allocations: [] };
  function put(file, value) {
    mkdirSync(dirname(join(kit, file)), { recursive: true });
    writeFileSync(join(kit, file), typeof value === 'string' ? value : JSON.stringify(value));
  }
  put('_identity.yaml', identity);
  put('subjects/registry.yaml', document);
  return { root, kit, document, identity, put };
}
const run = (f, ...args) => spawnSync(process.execPath, [cli, ...args, '--root', f.root],
  { encoding: 'utf8', timeout: 20_000 });

test('lookup uses the actual captured loader and returns unchanged domain matches and registry-only context', (t) => {
  const f = fixture(t, { nested: true });
  const model = loadStores(f.kit);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const r = run(f, 'lookup', 'Coffee', 'house', '--locale', 'en', '--context=places', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.deepEqual(JSON.parse(r.stdout), {
    operation: 'subject.lookup', scope: 'declared-metadata',
    context: { consistency: 'captured-model', namespace, identityFormat: 1, subjectSchema: 1,
      normalizer: 1, registryRevision: 0, hierarchyRevision: 0,
      registryDigest: canonicalSha256(model.subjectRegistry.document) },
    input: { text: 'Coffee house', options: { locale: 'en', context: 'places' } },
    result: lookupSubjects(model.subjectRegistry, 'Coffee house', { locale: 'en', context: 'places' }),
  });
});

test('unhealthy installation and unavailable registry refuse with typed reasons and no result stdout', (t) => {
  const f = fixture(t);
  f.put('decisions/_catalog.yaml', { 'schema-version': 999, store: 'decisions', entries: [] });
  let r = run(f, 'lookup', 'Café', '--json');
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /invalid-model.*invalid-schema-version/s);
  assert.doesNotMatch(r.stderr, /internal failure/);
  rmSync(join(f.kit, 'decisions'), { recursive: true });
  rmSync(join(f.kit, 'subjects'), { recursive: true });
  r = run(f, 'lookup', 'Café', '--json');
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /subject-registry-unavailable/);
});

test('operation and label are required; malformed flags and blank scopes never produce matches', (t) => {
  const f = fixture(t);
  for (const args of [[], ['list', 'Café'], ['lookup'], ['lookup', '  '],
    ['lookup', 'Café', '--locale', '  '], ['lookup', 'Café', '--context='],
    ['lookup', 'Café', '--bogus']]) {
    const r = run(f, ...args, '--json');
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /Usage:/);
    assert.doesNotMatch(r.stderr, /internal failure/);
  }
});

test('a complete zero-match lookup succeeds and human output preserves identity, status and definition', (t) => {
  const f = fixture(t);
  const zero = run(f, 'lookup', 'unknown', '--json');
  assert.equal(zero.status, 0, zero.stderr);
  assert.deepEqual(JSON.parse(zero.stdout).result.matches, []);
  const human = run(f, 'lookup', 'CAFE\u0301');
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /declared-metadata/);
  assert.match(human.stdout, /proposed/);
  assert.ok(human.stdout.includes(proposal));
  assert.match(human.stdout, /A place serving coffee/);
  assert.throws(() => JSON.parse(human.stdout), SyntaxError);
});

test('all homonyms and declared statuses remain inspectable without historical approval bytes', (t) => {
  const f = fixture(t);
  const data = subjectGovernanceFixture();
  const names = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision',
    originDecision: 'origin-decision', acceptedStatus: 'accepted-status',
    decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest' };
  const authored = (value) => Array.isArray(value) ? value.map(authored)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [names[key] ?? key, authored(item)])) : value;
  const metadata = { ...f.document.subjects[0], label: 'Color' };
  data.document.subjects.push(metadata,
    { ...metadata, id: 'S-000002', status: 'retired' },
    { ...metadata, id: 'proposal:subject:23456789-1234-4234-8234-123456789abc', status: 'suppressed' });
  f.put('_identity.yaml', data.identityInput.identity);
  f.put('subjects/registry.yaml', authored(data.document));
  const model = loadStores(f.kit);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const r = run(f, 'lookup', 'COLOR', '--json');
  assert.equal(r.status, 0, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.deepEqual(output.result, lookupSubjects(model.subjectRegistry, 'COLOR'));
  assert.deepEqual(output.result.matches.map((match) => match.status).sort(), ['active', 'proposed', 'retired', 'suppressed']);
  assert.equal(output.context.registryDigest, canonicalSha256(model.subjectRegistry.document));
  data.document.history[0].review.reference = 'review:other-retained-reference';
  f.put('subjects/registry.yaml', authored(data.document));
  const changed = JSON.parse(run(f, 'lookup', 'COLOR', '--json').stdout);
  assert.deepEqual(changed.result, output.result);
  assert.notEqual(changed.context.registryDigest, output.context.registryDigest,
    'the registry digest includes history even when the lookup projection is unchanged');
});

test('scope filters are exact and authority defects and ambiguous roots refuse', (t) => {
  const f = fixture(t);
  const scoped = run(f, 'lookup', 'Coffee house', '--locale=en-US', '--json');
  assert.equal(scoped.status, 0, scoped.stderr);
  assert.deepEqual(JSON.parse(scoped.stdout).result.matches, []);
  for (const bad of ['subjects: [', { ...f.document, namespace: '23456789-1234-4234-8234-123456789abc' }]) {
    f.put('subjects/registry.yaml', bad);
    const r = run(f, 'lookup', 'Café', '--json');
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /invalid-model/);
  }
  f.put('subjects/registry.yaml', f.document);
  mkdirSync(join(f.root, 'unknown-knowledge'));
  const ambiguous = run(f, 'lookup', 'Café', '--json');
  assert.equal(ambiguous.status, 2);
  assert.equal(ambiguous.stdout, '');
  assert.match(ambiguous.stderr, /AmbiguousKitLayout/);
  assert.doesNotMatch(ambiguous.stderr, /internal failure/);
  writeFileSync(join(f.root, '.unknown-knowledge.json'), JSON.stringify({ kitRoot: '.' }));
  assert.equal(run(f, 'lookup', 'Café', '--json').status, 0);
});
