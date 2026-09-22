import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { withCommitSnapshot } from '../payload/engine/lib/commit-snapshot.js';
const command = fileURLToPath(new URL('../payload/engine/commit-check.js', import.meta.url));
const namespace = '11111111-1111-4111-8111-111111111111';
const publication = { id: '22222222-2222-4222-8222-222222222222', review: 'review:allocation' };
const ledger = () => ({ 'schema-version': 1, 'identity-format': 1, namespace, allocations: [
  { kind: 'ontology', id: 'O-000001', state: 'allocated', publication },
] });
function fixture(t, before = ledger()) {
  const root = mkdtempSync(join(tmpdir(), 'identity-commit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_') && !['GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL'].includes(key)) delete env[key];
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const put = (file, data) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), typeof data === 'string' ? data : JSON.stringify(data));
  };
  git('init', '-q'); git('config', 'user.name', 'Identity gate'); git('config', 'user.email', 'gate@example.test');
  put('decisions/_catalog.yaml', { 'schema-version': 2, store: 'decisions', entries: [] });
  if (before !== undefined && before !== null) put('_identity.yaml', before);
  git('add', '.');
  if (before !== null) git('commit', '-qm', 'captured before');
  const check = () => spawnSync(process.execPath, [command, '--root', root], { env, encoding: 'utf8' });
  return { root, put, git, check };
}

test('actual staged gate refuses immutable ledger regressions after candidate validators pass', (t) => {
  for (const [name, before, mutate, code] of [
    ['remove', ledger(), (x) => { x.allocations = []; }, 'allocation-removed'],
    ['namespace', ledger(), (x) => { x.namespace = publication.id; }, 'namespace-changed'],
    ['provenance', ledger(), (x) => { x.allocations[0].publication.review = 'review:rewritten'; }, 'allocation-changed'],
    ['terminal', { ...ledger(), allocations: [{ ...ledger().allocations[0], state: 'cancelled', reason: 'Abandoned' }] },
      (x) => { x.allocations[0].state = 'allocated'; delete x.allocations[0].reason; }, 'invalid-state-transition'],
    ['bundle', ledger(), (x) => { x.allocations.push({ ...x.allocations[0], id: 'O-000002' }); }, 'publication-reused'],
  ]) {
    const f = fixture(t, before);
    const candidate = structuredClone(before); mutate(candidate);
    f.put('_identity.yaml', candidate); f.git('add', '_identity.yaml');
    f.put('_identity.yaml', before); // unstaged repair cannot rewrite captured candidate
    const index = readFileSync(join(f.root, '.git/index'));
    const result = f.check();
    assert.equal(result.status, 2, name + result.stdout + result.stderr);
    assert.match(result.stderr, new RegExp(code));
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  }
});

test('initial allocation and one-way old-format cutover still require full candidate validation', (t) => {
  for (const old of [false, true]) {
    const f = fixture(t, null);
    if (old) {
      f.put('decisions/_catalog.yaml', { 'schema-version': 1, store: 'decisions', entries: [] });
      f.git('add', '.'); f.git('commit', '-qm', 'old format without identity');
      f.put('decisions/_catalog.yaml', { 'schema-version': 2, store: 'decisions', entries: [] });
    }
    f.put('_identity.yaml', ledger()); f.git('add', '.');
    const result = f.check();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    f.put('decisions/_catalog.yaml', { 'schema-version': 1, store: 'decisions', entries: [] }); f.git('add', '.');
    assert.equal(f.check().status, 2, 'a missing before ledger cannot waive candidate validation');
  }
});

test('existing malformed or linked before authority cannot masquerade as an initial cutover', (t) => {
  for (const value of ['allocations: [', '', 'null', '{}', 'linked']) {
    const f = fixture(t, null);
    if (value === 'linked') symlinkSync('missing.yaml', join(f.root, '_identity.yaml'));
    else f.put('_identity.yaml', value);
    f.git('add', '.'); f.git('commit', '-qm', 'unreadable previous authority');
    rmSync(join(f.root, '_identity.yaml'));
    f.put('_identity.yaml', ledger()); f.git('add', '.');
    const result = f.check();
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /identity.*before|before.*identity/);
    if (value === 'allocations: [') {
      assert.match(result.stderr, /before _identity.yaml could not be read as regular YAML authority \(YAMLException\)/);
      assert.doesNotMatch(result.stderr, /internal failure/);
    }
  }
});

test('retirement and a fresh publication pass; missing candidate authority fails', (t) => {
  const f = fixture(t);
  const candidate = ledger();
  candidate.allocations[0] = { ...candidate.allocations[0], state: 'retired', reason: 'Retained occupancy' };
  candidate.allocations.push({ kind: 'ontology', id: 'O-000002', state: 'allocated', publication: {
    id: '33333333-3333-4333-8333-333333333333', review: 'review:new' } });
  f.put('_identity.yaml', candidate); f.git('add', '.');
  let result = f.check();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  rmSync(join(f.root, '_identity.yaml')); f.git('add', '.');
  result = f.check();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing-identity/);
});

test('moving the selected kit root retains the before installation identity boundary', (t) => {
  for (const changeNamespace of [false, true]) {
    const f = fixture(t);
    f.put('.unknown-knowledge.json', { kitRoot: '.' });
    f.git('add', '.'); f.git('commit', '-qm', 'explicit before layout');
    const candidate = ledger();
    if (changeNamespace) candidate.namespace = publication.id;
    rmSync(join(f.root, '_identity.yaml'));
    rmSync(join(f.root, 'decisions'), { recursive: true });
    f.put('.unknown-knowledge.json', { kitRoot: 'unknown-knowledge' });
    f.put('unknown-knowledge/_identity.yaml', candidate);
    f.put('unknown-knowledge/decisions/_catalog.yaml', { 'schema-version': 2, store: 'decisions', entries: [] });
    f.git('add', '.');
    const result = f.check();
    assert.equal(result.status, changeNamespace ? 2 : 0, result.stdout + result.stderr);
    if (changeNamespace) assert.match(result.stderr, /namespace-changed/);
  }
});

test('snapshot pins the before commit and tree even when HEAD moves before lazy materialization', async (t) => {
  const f = fixture(t);
  const commit = f.git('rev-parse', 'HEAD').trim();
  const tree = f.git('rev-parse', `${commit}^{tree}`).trim();
  await withCommitSnapshot(f.root, async ({ before, candidate }) => {
    assert.equal(before.commit, commit);
    assert.equal(before.tree, tree);
    assert.equal(Object.hasOwn(candidate, 'commit'), false);
    f.put('_identity.yaml', { ...ledger(), namespace: publication.id });
    f.git('add', '.'); f.git('commit', '-qm', 'move HEAD after capture');
    assert.notEqual(f.git('rev-parse', 'HEAD').trim(), before.commit);
    assert.deepEqual(JSON.parse(readFileSync(join(before.materialize().root, '_identity.yaml'), 'utf8')), ledger());
    assert.equal(before.materialize().tree, tree);
    return 0;
  });
  const unborn = fixture(t, null);
  await withCommitSnapshot(unborn.root, async ({ before }) => {
    assert.equal(before, null);
    return 0;
  });
});
