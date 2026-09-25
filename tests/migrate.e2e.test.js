// UCS-1520: the one-shot 2.x -> 3.0 converter, run on real 2.x stores.
//
// The six pilot tasks (acceptance/retrieval/pilot) are materialized by the
// actual 08066b5 runtime, so their stores are 2.x as a client has them. Each is
// converted with engine/migrate.js, checked by the current validators, and then
// scored with `ask` against the pilot's independent gold judgments: a second
// gold set, separate from the development-v2 one in ask-gold.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBaselineRuntime, materializeTask } from '../acceptance/retrieval/materialize.js';
import { bundleDepth } from '../acceptance/retrieval/benchmark.js';
import { askPayload, loadAskIndex } from '../payload/engine/lib/ask-service.js';
import { loadStores, storeHealth } from '../payload/engine/lib/load-stores.js';
import { installation } from './helpers/canonical.js';

const repository = fileURLToPath(new URL('..', import.meta.url));
const engine = (surface) => join(repository, 'payload/engine', surface);
const pilot = join(repository, 'acceptance/retrieval/pilot');
const TASKS = JSON.parse(readFileSync(join(pilot, 'tasks.json'), 'utf8')).tasks;
const JUDGMENTS = new Map(JSON.parse(readFileSync(join(pilot, 'judgments.json'), 'utf8')).tasks.map((t) => [t.id, t]));
const STORE_KIND = { ontology: 'ontology', knowledge: 'knowledge', decisions: 'decision' };

const run = (surface, ...args) => spawnSync(process.execPath, [engine(surface), ...args], { encoding: 'utf8' });
const migrate = (root, ...args) => {
  const result = run('migrate.js', '--root', root, '--json', ...args);
  return { ...result, report: result.stdout ? JSON.parse(result.stdout) : null };
};
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return name === 'node_modules' || name === '.git' ? [] : statSync(path).isDirectory() ? walk(path) : [path];
});
const snapshot = (root) => new Map(walk(root).map((file) => [relative(root, file), readFileSync(file)]));

let scratch;
let materialized; // task id -> materializeTask() result, still 2.x
let converted; // task id -> { roots: [{ namespace, root, records, report }] }

before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'uk-migrate-'));
  const runtime = prepareBaselineRuntime(join(scratch, 'runtime'));
  mkdirSync(join(scratch, '2x'));
  materialized = new Map(TASKS.map((task) => [task.id, materializeTask(task.id, join(scratch, '2x', task.id), runtime)]));
  converted = new Map();
  for (const [id, task] of materialized) {
    cpSync(join(scratch, '2x', id), join(scratch, '3x', id), { recursive: true, verbatimSymlinks: true });
    converted.set(id, { ...task, roots: task.roots.map((root) => {
      const copy = join(scratch, '3x', relative(join(scratch, '2x'), root.root));
      const result = migrate(copy);
      assert.equal(result.status, 0, `${id}: ${result.stderr}${result.stdout}`);
      return { ...root, root: copy, report: result.report };
    }) });
  }
});
after(() => rmSync(scratch, { recursive: true, force: true }));

test('every pilot store converts with zero validator errors', () => {
  let roots = 0;
  for (const [id, task] of converted) {
    for (const { root, report } of task.roots) {
      roots += 1;
      const structural = run('validate.js', '--root', root, '--json');
      assert.equal(structural.status, 0, `${id}: ${structural.stdout}`);
      assert.equal(JSON.parse(structural.stdout).findings.length, 0);
      const values = run('validate-values.js', '--root', root);
      assert.equal(values.status, 0, `${id}: ${values.stdout}`);
      const health = storeHealth(loadStores(join(root, 'unknown-knowledge')));
      assert.deepEqual(health.errors, [], id);
      // Every canonical ID the mapping hands out is allocated in the new ledger.
      const allocated = new Set(loadStores(join(root, 'unknown-knowledge')).identity.allocations.map((row) => row.id));
      for (const row of report.mapping.filter((r) => !r.to.startsWith('proposal:'))) assert.ok(allocated.has(row.to), `${id}: ${row.to}`);
    }
  }
  assert.equal(roots, 8, 'six tasks, holding-company spans three installations');
});

test('no old ID survives as a citation after conversion', () => {
  for (const [id, task] of converted) {
    for (const { root, report } of task.roots) {
      const renamed = report.mapping.filter((row) => row.from !== row.to);
      for (const [file, bytes] of snapshot(join(root, 'unknown-knowledge'))) {
        if (!/^(ontology|knowledge|decisions|logs)\//.test(file)) continue;
        const text = bytes.toString('utf8');
        for (const { from } of renamed) {
          // A file name such as knowledge/L-000001.md keeps its name; anything
          // else spelling the old ID as a word is a leftover citation.
          const word = new RegExp(`(?<![A-Za-z0-9_:/-])${from}(?![A-Za-z0-9_:-]|\\.[A-Za-z0-9])`);
          assert.doesNotMatch(text, word, `${id}: ${file} still names ${from}`);
        }
      }
    }
  }
});

test('the dry run prints the old-to-new mapping and writes nothing', () => {
  const root = join(scratch, 'dry-run');
  cpSync(join(scratch, '2x', 'policy-01'), root, { recursive: true, verbatimSymlinks: true });
  const before = snapshot(root);
  const result = migrate(root, '--dry-run');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(root), before);
  assert.equal(existsSync(join(root, 'unknown-knowledge/_identity.yaml')), false);
  const { mapping } = result.report;
  assert.deepEqual(mapping.map((row) => row.from).sort(), ['D-000001', 'D-000002', 'D-000003', 'D-000004', 'D-000005']);
  // The proposed council note stays a proposal; the rest get permanent IDs.
  assert.match(mapping.find((row) => row.from === 'D-000005').to, /^proposal:decision:[0-9a-f-]{36}$/);
  assert.ok(mapping.filter((row) => row.from !== 'D-000005').every((row) => /^D-\d{6}$/.test(row.to)));

  const human = run('migrate.js', '--root', root, '--dry-run');
  assert.equal(human.status, 0);
  assert.match(human.stdout, /dry run, nothing written/);
  assert.match(human.stdout, /decision {2}D-000005 -> proposal:decision:/);
});

test('a converted installation is refused a second time', () => {
  const [{ root }] = converted.get('engineering-01').roots;
  const result = run('migrate.js', '--root', root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /already in 3\.0 format/);
  assert.equal(run('migrate.js', '--root', installation('policy')).status, 2, 'the canonical 3.0 fixture too');
});

test('a 2.x store with a dangling citation is refused and left untouched', () => {
  const root = join(scratch, 'dangling');
  cpSync(join(scratch, '2x', 'cultural-research-01'), root, { recursive: true, verbatimSymlinks: true });
  const entry = join(root, 'unknown-knowledge/decisions/entries/D-999999.yaml');
  writeFileSync(entry, readFileSync(entry, 'utf8').replace(/(leaves:\n)/, '$1        - L-999999\n'));
  const before = snapshot(root);
  const result = migrate(root);
  assert.equal(result.status, 1);
  assert.equal(result.report.code, 'invalid-source-inventory');
  assert.ok(result.report.diagnostics.some((row) => row.code === 'missing-source-reference'), result.stdout);
  assert.deepEqual(snapshot(root), before);
});

test('ask finds every pilot gold bundle on the converted stores', () => {
  const rows = [...converted].map(([id, task]) => {
    // A gold passage names one materialized record; follow it through the
    // converter's mapping to the record's 3.0 ID.
    const handles = new Map();
    for (const { namespace, records, report } of task.roots) {
      const to = new Map(report.mapping.map((row) => [`${row.kind}:${row.from}`, row.to]));
      for (const record of records.filter((r) => r.passage)) {
        const kind = STORE_KIND[record.kind];
        handles.set(`${namespace}/${record.kind}#${record.passage}`, `${namespace}/${kind}/${to.get(`${kind}:${record.id}`)}`);
      }
    }
    const judgment = JUDGMENTS.get(id);
    const bundles = (judgment.answerable ? judgment.bundles : judgment.explanationBundles).map((bundle) => bundle.map((ref) => {
      const [namespace, store] = ref.id.split('/');
      return [handles.get(`${namespace}/${store}#${ref.passage.split('#')[1]}`)].filter(Boolean);
    }));
    const payload = askPayload(loadAskIndex(task.roots.map((r) => r.root)), {
      mode: 'search', text: task.prompt, where: [], countBy: null, under: null, limit: 8, top: 10,
    });
    const multi = task.roots.length > 1;
    const ranking = payload.records.map((r) => `${multi ? r.installation : task.roots[0].namespace}/${r.kind}/${r.id}`);
    return { id, answerable: judgment.answerable, depth: bundleDepth(bundles, ranking), tier: payload.confidence.tier };
  });
  const within = (k) => rows.filter((r) => r.depth !== null && r.depth <= k).length;
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.filter((r) => r.depth === null).map((r) => r.id), [], 'every bundle within eight');
  // Measured when the converter shipped: depths 1, 1, 3, 2, 1, 1.
  assert.ok(within(3) >= 6, `bundle within three: ${within(3)}/6`);
  assert.ok(within(1) >= 4, `bundle at rank one: ${within(1)}/6`);
  assert.deepEqual(rows.filter((r) => !r.answerable && r.tier === 'covered').map((r) => r.id), []);
  // Pilot records are pointers ("See sources/x.md#passage") with a short
  // term, so most question words are unknown to the store. engineering-01 is
  // therefore `none` with its answer at rank one: the store's own text does not
  // cover the question, and the agent must follow the returned pointer.
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.tier])), {
    'engineering-01': 'none',
    'cultural-research-01': 'partial',
    'policy-01': 'partial',
    'manufacturing-01': 'partial',
    'professional-services-01': 'partial',
    'holding-company-01': 'partial',
  });
});
