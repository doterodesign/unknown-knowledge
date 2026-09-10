import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = {
  'L-000102': 'knowledge/design-system/600.1-adding-a-new-token.md',
  'L-000140': 'knowledge/design-system/600.2-archived-theme-fallback-basis.md',
  'L-000190': 'knowledge/design-system/600.3-contrast-disclosure.md',
};
const TODAY = '2026-09-10';

function editLeaf(store, id, change) {
  const path = join(store, files[id]);
  const [, frontmatter, body] = readFileSync(path, 'utf8').split('---');
  const record = yaml.load(frontmatter);
  change(record);
  writeFileSync(path, `---\n${yaml.dump(record)}---${body}`);
}

function scenario(t) {
  const store = mkdtempSync(join(tmpdir(), 'uk-successors-'));
  t.after(() => rmSync(store, { recursive: true, force: true }));
  cpSync(join(root, 'tests/fixtures/resolver-v2'), store, { recursive: true });
  for (const [id, term] of [['L-000102', 'sunset policy'], ['L-000140', 'replacement guidance']]) {
    editLeaf(store, id, (leaf) => {
      leaf.terms = [term];
      leaf.concepts = [];
      leaf.operations = [];
      leaf.relates = id === 'L-000140' ? { supersedes: ['L-000102'] } : {};
    });
  }
  return store;
}

function cli(store, command, args, status = 0) {
  const result = spawnSync(process.execPath, [join(root, 'payload/engine', command), ...args,
    '--root', store, '--today', TODAY, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

const resolve = (store, ...args) => cli(store, 'resolve.js', args);

test('an old-only query exposes its direct successor without changing the matched result', (t) => {
  const store = scenario(t);
  const before = readFileSync(join(store, files['L-000102']), 'utf8');
  const result = resolve(store, 'sunset policy');
  assert.deepEqual(result.leaves.map((leaf) => [leaf.id, leaf.score]), [['L-000102', 1]]);
  const [successor] = result.leaves[0]['superseded-by'];
  assert.equal(successor.id, 'L-000140');
  assert.equal(successor.file, files['L-000140']);
  assert.equal(successor.heading, 'Archived-theme fallback basis');
  assert.equal(successor.stage, 'verified');
  assert.deepEqual(successor.applies, ['eu-eaa']);
  assert.equal(successor.time.stale, false);
  assert.equal('excerpt' in successor, false, 'navigation must not embed successor content');
  assert.equal('relates' in successor, false, 'one hop only');
  assert.equal('superseded-by' in successor, false, 'no recursive expansion');
  assert.equal(readFileSync(join(store, files['L-000102']), 'utf8'), before, 'no authored reciprocal edge');
});

test('query, concept, path, document gather and scope exclusions carry the same successor navigation', (t) => {
  const store = scenario(t);
  editLeaf(store, 'L-000102', (leaf) => {
    leaf.concepts = ['K-101'];
    leaf.applies = { jurisdictions: ['us-ca'] };
  });
  const expected = resolve(store, 'sunset policy').leaves[0]['superseded-by'];
  const concept = resolve(store, 'token').results.find((result) => result.id === 'K-101');
  assert.deepEqual(concept.knowledge.find((leaf) => leaf.id === 'L-000102')['superseded-by'], expected);
  const paths = resolve(store, '--paths', 'src/registry/tokens.ts');
  assert.deepEqual(paths.paths[0].knowledge.find((leaf) => leaf.id === 'L-000102')['superseded-by'], expected);
  const document = join(store, 'question.txt');
  writeFileSync(document, 'sunset policy');
  assert.deepEqual(resolve(store, '--doc', document).map.gather[0]['superseded-by'], expected);
  const scoped = resolve(store, 'sunset policy us ca');
  assert.deepEqual(scoped.leaves.map((leaf) => leaf.id), ['L-000102']);
  assert.deepEqual(scoped.leaves[0]['superseded-by'][0].applies, ['eu-eaa'], 'inapplicable successor is visible as scoped navigation, never a ranked answer');
  const excluded = resolve(store, 'sunset policy eu eaa');
  assert.equal(excluded.leaves.length, 0);
  assert.deepEqual(excluded.exclusions[0]['superseded-by'], expected);
  for (const args of [['sunset policy'], ['--paths', 'src/registry/tokens.ts'], ['--doc', document], ['sunset policy eu eaa']]) {
    const human = spawnSync(process.execPath, [join(root, 'payload/engine/resolve.js'), ...args,
      '--root', store, '--today', TODAY], { encoding: 'utf8' });
    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /superseded-by: L-000140/);
    assert.match(human.stdout, /eu-eaa/);
  }
});

test('a supersession cycle stays bounded in resolution and fails target preflight through ref-cycle', (t) => {
  const store = scenario(t);
  editLeaf(store, 'L-000102', (leaf) => { leaf.relates.supersedes = ['L-000140']; });
  assert.deepEqual(resolve(store, 'sunset policy').leaves[0]['superseded-by'].map((leaf) => leaf.id), ['L-000140']);
  const result = spawnSync(process.execPath, [join(root, 'payload/engine/preflight.js'),
    '--leaves', 'L-000102,L-000140', '--root', store, '--today', TODAY, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /ref-cycle/);
  assert.match(result.stdout, /relates\.supersedes/);
  assert.deepEqual(JSON.parse(result.stdout)['leaf-verdicts'].map((leaf) => leaf.verdict), ['quarantined', 'quarantined']);
});

test('chains are followed one hop at a time and multiple draft or stale successors remain explicit', (t) => {
  const store = scenario(t);
  editLeaf(store, 'L-000190', (leaf) => {
    leaf.terms = ['final instructions'];
    leaf.concepts = [];
    leaf.operations = [];
    leaf.relates = { supersedes: ['L-000140', 'L-000102', 'L-000102'] };
    leaf.facets.stage = 'draft';
  });
  editLeaf(store, 'L-000140', (leaf) => { leaf.verified = '2020-06-30'; });
  const result = resolve(store, 'sunset policy');
  const successors = result.leaves[0]['superseded-by'];
  assert.deepEqual(successors.map((leaf) => leaf.id), ['L-000140', 'L-000190']);
  assert.deepEqual(successors.map((leaf) => leaf.demotions.map((d) => d.reason)), [['time'], ['stage']]);
  assert.deepEqual(successors.map((leaf) => leaf.downranked), [true, true]);
  assert.deepEqual(resolve(store, 'replacement guidance').leaves[0]['superseded-by'].map((leaf) => leaf.id), ['L-000190']);
  assert.deepEqual(resolve(store, 'final instructions').leaves[0]['superseded-by'], []);
  assert.deepEqual(resolve(store, 'historical sunset policy').leaves.map((leaf) => leaf.id), ['L-000102']);
  assert.deepEqual(resolve(store, 'sunset policy'), result, 'identical inputs produce identical bytes and order');
  const preflight = cli(store, 'preflight.js', ['--leaves', 'L-000140,L-000190'], 2);
  assert.deepEqual(preflight['leaf-verdicts'].map((leaf) => leaf.verdict), ['stale', 'unknown']);
});

test('dangling supersession retains structural health failure and invents no navigable stub', (t) => {
  const store = scenario(t);
  editLeaf(store, 'L-000102', (leaf) => { leaf.relates.supersedes = ['L-999999']; });
  const result = resolve(store, 'sunset policy');
  assert.equal(result['store-health'].ok, false);
  assert.deepEqual(result.leaves[0].relates.supersedes, []);
  assert.deepEqual(result.leaves[0]['superseded-by'].map((leaf) => leaf.id), ['L-000140']);
  const preflight = cli(store, 'preflight.js', ['--leaves', 'L-000140'], 2);
  assert.equal(preflight['leaf-verdicts'][0].verdict, 'unknown');
});

test('disposable derived files neither supply nor retain supersession', (t) => {
  const store = scenario(t);
  const before = resolve(store, 'sunset policy');
  cli(store, 'derive.js', ['--write']);
  assert.deepEqual(resolve(store, 'sunset policy'), before);
  rmSync(join(store, 'knowledge/derived'), { recursive: true });
  assert.deepEqual(resolve(store, 'sunset policy'), before);
  editLeaf(store, 'L-000140', (leaf) => { leaf.relates = {}; });
  assert.deepEqual(resolve(store, 'sunset policy').leaves[0]['superseded-by'], []);
});
