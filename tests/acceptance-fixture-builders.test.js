// Execute the operational builders against their actual canonical source fixture.
// These checks prove deterministic gates, not fresh-agent conduct or URL retrieval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { load } from 'js-yaml';

const repo = fileURLToPath(new URL('..', import.meta.url));
const today = '2026-09-10';
function prepare(t, name, variant = 'verified', extra = []) {
  const parent = mkdtempSync(join(tmpdir(), 'canonical-a5-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'client');
  const result = spawnSync(process.execPath, [join(repo, 'acceptance', name), root, variant, ...extra], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return root;
}
function command(root, name, args = []) {
  return spawnSync(process.execPath, [join(root, 'unknown-knowledge/engine', `${name}.js`), ...args,
    '--root', root], { encoding: 'utf8' });
}
const read = (root, name) => load(readFileSync(join(root, 'unknown-knowledge', name), 'utf8'));
function leaf(root, name) {
  return load(readFileSync(join(root, 'unknown-knowledge/knowledge/freshness', name), 'utf8').split('---')[1]);
}

test('runtime builder preserves canonical identity and exercises every actual preflight variant', async (t) => {
  for (const [variant, exit, verdict] of [
    ['verified', 0, 'trusted'], ['stale', 1, 'stale'], ['draft', 2, 'unknown'],
    ['proposed', 2, 'unknown'], ['missing-stage', 2, 'unknown'],
    ['missing-date', 1, 'quarantined'], ['malformed', 2, 'unknown'],
  ]) await t.test(variant, (t) => {
    const root = prepare(t, 'runtime-preflight-fixture.js', variant);
    const result = command(root, 'preflight', ['--concepts', 'O-000001', '--leaves', 'K-000001', '--today', today, '--json']);
    assert.equal(result.status, exit, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output['leaf-verdicts'].find(row => row.leaf === 'K-000001').verdict, verdict);
    assert.deepEqual(read(root, '_identity.yaml'), load(readFileSync(join(repo, 'tests/fixtures/structural-validator/time-facet/_identity.yaml'), 'utf8')));
    assert.deepEqual(leaf(root, '301.1-stable-at-the-limit.md').relates, { supersedes: ['K-000007'] });
    assert.deepEqual(leaf(root, '305.1-static-ancient.md')['cross-references'], { 'class-elsewhere': ['K-000006'] });
    assert.deepEqual(leaf(root, '306.1-static-undated.md').relates, { 'depends-on': ['K-000007'] });
  });
});

test('source-evidence builder publishes canonical Decision lifecycle and passes actual installed hooks', (t) => {
  const sourceUrl = 'https://example.invalid/source-evidence'; // Stored only; engine must never fetch it.
  const root = prepare(t, 'source-evidence-fixture.js', 'verified', [sourceUrl]);
  const identity = read(root, '_identity.yaml');
  assert.deepEqual(identity.allocations.filter(row => row.kind === 'decision').map(row => row.id), ['D-000001', 'D-000002', 'D-000003']);
  const previous = read(root, 'decisions/entries/D-000002.yaml').entries[0];
  const current = read(root, 'decisions/entries/D-000003.yaml').entries[0];
  assert.equal(previous.status, 'superseded');
  assert.deepEqual(previous['superseded-by'], ['D-000003']);
  assert.equal(current.status, 'accepted');
  assert.deepEqual(current.supersedes, ['D-000002']);
  assert.deepEqual(current['relates-to'].concepts, ['O-000001']);
  assert.deepEqual(current['relates-to'].leaves, ['K-000001']);
  assert.equal(leaf(root, '301.1-stable-at-the-limit.md').citations[0].source, sourceUrl);
  const validation = command(root, 'validate');
  assert.equal(validation.status, 0, validation.stdout + validation.stderr);
  function git(...args) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout + result.stderr;
  }
  git('init', '-q'); git('config', 'user.name', 'Fixture Steward'); git('config', 'user.email', 'fixture@example.invalid');
  for (const [source, event] of [['pre-commit', 'pre-commit'], ['reverse-lookup', 'prepare-commit-msg']]) {
    const installed = join(root, '.git/hooks', event);
    copyFileSync(join(root, 'unknown-knowledge/hooks', source), installed);
    chmodSync(installed, 0o755);
  }
  git('add', '.');
  assert.doesNotMatch(git('ls-files'), /^node_modules(?:\/|$)/m);
  const survey = command(root, 'survey-map', ['--json']);
  assert.equal(survey.status, 0, survey.stdout + survey.stderr);
  assert.equal(JSON.parse(survey.stdout).scope.source, 'survey-scope.yaml');
  const commit = git('commit', '-m', 'Canonical source-evidence fixture');
  assert.match(commit, /commit-check: validate: clean/);
  assert.match(commit, /commit-check: validate-values: clean/);
  assert.match(commit, /staged attribution: candidate [a-f0-9]+/);
});
