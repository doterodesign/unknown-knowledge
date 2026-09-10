// Public CLI characterization for A5's governed repair specimen. This proves
// deterministic retrieval/validation, NOT agent judgment or human approval;
// those require the fresh-agent walkthrough and its preserved gate transcript.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as yaml from 'js-yaml';
import { prepareReflectionFixture, TODAY } from '../acceptance/lib/reflection-fixture.js';

test('a reviewed alias and leaf relationship restore the original queries without a Locale match', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'reflection-retrieval-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  prepareReflectionFixture(root);
  const store = join(root, 'unknown-knowledge');
  function cli(name, args = [], status = 0) {
    const result = spawnSync(process.execPath, [join(store, 'engine', `${name}.js`), ...args,
      '--root', root], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stdout + result.stderr);
    return result.stdout;
  }
  const query = text => JSON.parse(cli('resolve', [text, '--json', '--today', TODAY]));
  const beforeLocale = query('locale');
  assert.deepEqual(query('canvas output').results, []);
  assert.deepEqual(query('delivery profile').results.map(r => [r.id, r.knowledge]), [['K-102', []]]);

  // Controlled fixture-steward-approved specimen: one exact observed alias,
  // its warrant decision, and one kb-build-authored concept edge. This test
  // does not stand in for either of those gates in the A5 trial.
  const classFile = join(store, 'ontology/classes/100-product.yaml');
  const ontology = yaml.load(readFileSync(classFile, 'utf8'));
  ontology.entries[0].aliases = ['canvas output'];
  ontology.entries[0].rationale = ['D-102'];
  writeFileSync(classFile, yaml.dump(ontology));
  const catalogFile = join(store, 'decisions/_catalog.yaml');
  const catalog = yaml.load(readFileSync(catalogFile, 'utf8'));
  catalog.entries.push({ id: 'D-102', title: 'Canvas output alias', file: 'entries/D-102.yaml' });
  writeFileSync(catalogFile, yaml.dump(catalog));
  writeFileSync(join(store, 'decisions/entries/D-102.yaml'), yaml.dump({ 'schema-version': 1, entries: [{
    id: 'D-102', title: 'Canvas output alias', category: 'governance', status: 'accepted', date: TODAY,
    deciders: ['fixture-steward'],
    context: 'docs/handbook.md#canvas-output supplies warrant; independent findings: '
      + 'logs/findings/2026-09-07-00000001.yaml, logs/findings/2026-09-08-00000003.yaml, '
      + 'logs/findings/2026-09-09-00000005.yaml (canvas-0, canvas-1, canvas-2).',
    decision: 'Add only canvas output to K-101 aliases; the handbook names existing material.',
    'relates-to': { concepts: ['K-101'], leaves: ['L-000100'] },
  }] }));
  const leafFile = join(store, 'knowledge/L-00/L-000200.md');
  const leafText = readFileSync(leafFile, 'utf8');
  const [, frontmatter, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(leafText);
  const leaf = yaml.load(frontmatter);
  leaf.concepts = ['K-102'];
  leaf.notes.push({ type: 'revision', date: TODAY, text: 'Reviewed concept relationship from docs/handbook.md#delivery.' });
  writeFileSync(leafFile, `---\n${yaml.dump(leaf)}---\n${body}`);

  cli('validate');
  cli('validate-values', ['--concepts', 'K-101,K-102']);
  const authored = [classFile, catalogFile, leafFile].map(file => readFileSync(file, 'utf8'));
  cli('derive', ['--today', TODAY, '--write']);
  cli('derive', ['--today', TODAY, '--check']);
  assert.deepEqual([classFile, catalogFile, leafFile].map(file => readFileSync(file, 'utf8')), authored);

  const canvas = query('canvas output');
  assert.deepEqual(canvas.results.map(r => [r.id, r.match, r.knowledge.map(l => l.id)]),
    [['K-101', 'exact-alias', ['L-000100']]]);
  assert.deepEqual(query('delivery profile').results.map(r => [r.id, r.knowledge.map(l => [l.id, l.via])]),
    [['K-102', [['L-000200', 'declared']]]]);
  assert.deepEqual(query('locale'), beforeLocale);
  cli('preflight', ['--concepts', 'K-101,K-102', '--leaves', 'L-000100,L-000200', '--today', TODAY]);
  const commit = spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr);
  const committed = spawnSync('git', ['commit', '-m', 'Controlled reviewed repair specimen'], { cwd: root, encoding: 'utf8' });
  assert.equal(committed.status, 0, committed.stdout + committed.stderr);
  assert.match(committed.stdout + committed.stderr, /structural validate -> 0 findings/);
});
