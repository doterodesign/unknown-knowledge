// Disposable original-runtime fixtures. No target-runtime identity adapter.
import { mkdirSync, symlinkSync, readFileSync, writeFileSync, rmSync, cpSync, readdirSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dump } from 'js-yaml';
import { createHash } from 'node:crypto';

export const BASELINE = '08066b5f527b9d7d9705a3367bc26dcf080271ad';
const repository = fileURLToPath(new URL('../..', import.meta.url));
const pilot = join(repository, 'acceptance/retrieval/pilot');
const corpus = JSON.parse(readFileSync(join(pilot, 'tasks.json'), 'utf8'));
const writeYaml = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, dump(value, { lineWidth: 100 }));
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const runtimePaths = ['cli', 'payload', 'package.json', 'package-lock.json', 'LICENSE', 'NOTICE'];

function verifyRuntime(runtime) {
  const tree = run('git', ['--no-replace-objects', 'ls-tree', '-r', '-z', BASELINE, '--', ...runtimePaths], { cwd: repository });
  const expected = new Set(tree.split('\0').filter(Boolean).map(entry => entry.split('\t')[1]));
  const directories = new Set();
  for (const file of expected) {
    for (let parent = dirname(file); parent !== '.'; parent = dirname(parent)) directories.add(parent);
  }
  function inspect(directory = '') {
    for (const name of readdirSync(join(runtime, directory))) {
      const file = join(directory, name);
      if (file === 'node_modules') continue; // Dependency link has a separately documented trust boundary.
      const stat = lstatSync(join(runtime, file));
      if (stat.isDirectory() && directories.has(file)) inspect(file);
      else if (!stat.isFile() || !expected.has(file)) throw new Error(`baseline runtime drift: unexpected ${file}`);
    }
  }
  inspect();
  for (const entry of tree.split('\0').filter(Boolean)) {
    const [metadata, file] = entry.split('\t');
    const [mode, type, oid] = metadata.split(' ');
    let bytes;
    try { bytes = readFileSync(join(runtime, file)); }
    catch { throw new Error(`baseline runtime drift: missing ${file}`); }
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (type !== 'blob' || !['100644', '100755'].includes(mode) || actual !== oid) {
      throw new Error(`baseline runtime drift: ${file}`);
    }
  }
}

function passage(source, heading) {
  const marker = `## ${heading}\n`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing source passage: ${heading}`);
  return source.slice(start + marker.length).split('\n## ')[0].trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.error}`);
  return result.stdout;
}

export function prepareBaselineRuntime(destination) {
  mkdirSync(destination);
  const archive = spawnSync('git', ['--no-replace-objects', 'archive', BASELINE, ...runtimePaths],
    { cwd: repository, maxBuffer: 16 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error(String(archive.stderr));
  run('tar', ['-xf', '-', '-C', destination], { input: archive.stdout });
  symlinkSync(join(repository, 'node_modules'), join(destination, 'node_modules'), 'dir');
  return destination;
}

export function materializeTask(taskId, destination, runtime) {
  verifyRuntime(runtime);
  const task = corpus.tasks.find(row => row.id === taskId);
  if (!task) throw new Error(`unknown pilot task: ${taskId}`);
  const namespaces = task.installations ?? [task.organization];
  if (namespaces.length > 1) mkdirSync(destination);
  const roots = namespaces.map(namespace => materializeInstallation(task,
    task.records.filter(row => row.id.startsWith(`${namespace}/`)), namespace,
    namespaces.length > 1 ? join(destination, namespace) : destination, runtime));
  return { taskId, baseline: BASELINE, version: 'pilot-1-original-runtime',
    prompt: taskId === 'holding-company-01' ? task.prompt.replaceAll('O-000001', 'K-101') : task.prompt, roots };
}

function materializeInstallation(task, records, namespace, destination, runtime) {
  mkdirSync(destination);
  run(process.execPath, [join(runtime, 'cli/init-copy.js'), '--target', destination, '--platforms', 'codex']);
  symlinkSync(join(repository, 'node_modules'), join(destination, 'node_modules'), 'dir');
  const kit = join(destination, 'unknown-knowledge');
  const kinds = new Set(records.map(row => row.id.split('/')[1]));
  if (kinds.has('knowledge')) kinds.add('decisions'); // Warranted fixture vocabulary only.
  for (const store of ['ontology', 'knowledge', 'decisions']) {
    if (!kinds.has(store)) rmSync(join(kit, store), { recursive: true });
  }
  mkdirSync(join(destination, 'sources'));
  cpSync(join(pilot, task.source), join(destination, task.source));
  if (task.excludedSources) {
    mkdirSync(join(destination, 'sources/private'));
    for (const file of task.excludedSources) cpSync(join(pilot, file), join(destination, file));
  }
  let source = readFileSync(join(destination, task.source), 'utf8');
  if (task.id === 'holding-company-01') {
    source = source.replaceAll('O-000001', 'K-101'); // Declared source identity spans only.
    writeFileSync(join(destination, task.source), source);
  }
  writeYaml(join(destination, 'survey-scope.yaml'), { 'schema-version': 1, include: ['sources'], exclude: ['sources/private'] });
  writeFileSync(join(destination, '.gitignore'), '/node_modules\n');
  const inventory = [];
  const addRecord = (kind, id, file, row) => inventory.push({ kind, id, file, source: task.source, passage: row.passage });
  const catalog = (kind, entries) => writeYaml(join(kit, kind, '_catalog.yaml'), { 'schema-version': 1, store: kind, entries });
  const concepts = records.filter(row => row.id.includes('/ontology/'));
  if (concepts.length) {
    const entries = concepts.map((row, i) => {
      const id = `K-${101 + i}`;
      addRecord('ontology', id, 'ontology/classes/100-fixture.yaml', row);
      return { id, term: row.passage.replaceAll('-', ' '), class: '100-fixture',
        summary: `See ${task.source}#${row.passage}.`, 'source-of-truth': [task.source],
        status: row.lifecycle === 'retired' ? 'deprecated' : row.lifecycle,
        'last-verified': corpus.evaluationDate };
    });
    writeYaml(join(kit, 'ontology/classes/100-fixture.yaml'), { 'schema-version': 1, entries });
    catalog('ontology', entries.map(entry => ({ id: entry.id, title: entry.term, file: 'classes/100-fixture.yaml' })));
  }
  const leaves = records.filter(row => row.id.includes('/knowledge/'));
  if (leaves.length) {
    const stages = new Set();
    const jurisdictions = new Set();
    const rows = leaves.map(row => {
      const id = row.id.split('/').at(-1).replace(/^K-/, 'L-');
      const stage = row.lifecycle === 'proposed' ? 'proposed' : 'verified';
      stages.add(stage);
      for (const value of row.scope ?? []) jurisdictions.add(value);
      const fields = { 'schema-version': 2, id, domain: task.organization,
        heading: row.passage.replaceAll('-', ' '), edition: 1,
        facets: { domain: task.organization, form: 'reference', anchor: 'world', stage },
        verified: corpus.evaluationDate, volatility: 'static', operations: [], concepts: [],
        ...(row.scope === null ? {} : { applies: { jurisdictions: row.scope } }),
        terms: row.passage.split('-'),
        citations: [{ source: task.source, accessed: corpus.evaluationDate, authority: 'fixture-source' }],
        provenance: { author: 'synthetic-fixture-steward', 'skill-version': 'pilot-1-source-review' },
        notes: [{ type: 'scope', text: `Synthetic ${row.lifecycle} source snapshot; ${task.source}#${row.passage}. Baseline stage is not target lifecycle or approval authentication.` }],
      };
      const file = `knowledge/${id}.md`;
      writeFileSync(join(kit, file), `---\n${dump(fields, { lineWidth: 100 })}---\n\n${passage(source, row.passage)}\n`);
      addRecord('knowledge', id, file, row);
      return { id, title: fields.heading, file: `${id}.md` };
    });
    catalog('knowledge', rows);
    for (const [name, values] of Object.entries({ domains: [task.organization], form: ['reference'], anchor: ['world'], stage: [...stages], jurisdictions: [...jurisdictions], 'authority-tiers': ['fixture-source'] })) {
      writeYaml(join(kit, 'knowledge/_registries', `${name}.yaml`), { 'schema-version': 1, store: 'knowledge', registry: name,
        ...(name === 'domains' ? { hierarchical: true } : {}),
        values: values.map(value => ({ value, warrant: `Synthetic reviewed source snapshot: ${task.source}`, decision: 'D-999999', minted: corpus.evaluationDate })) });
    }
  }
  const decisions = records.filter(row => row.id.includes('/decisions/'));
  const entries = decisions.map(row => {
    const id = row.id.split('/').at(-1);
    addRecord('decisions', id, `decisions/entries/${id}.yaml`, row);
    return { id, title: row.passage.replaceAll('-', ' '), category: 'governance', status: row.lifecycle,
      date: task.id === 'policy-01' && id === 'D-000002' ? '2026-09-10'
        : task.id === 'policy-01' && id === 'D-000003' ? '2026-09-12' : corpus.evaluationDate,
      deciders: ['synthetic-fixture-steward'], context: `Synthetic source snapshot: ${task.source}#${row.passage}`,
      decision: passage(source, row.passage),
      supersedes: (row.supersedes ?? []).map(ref => ref.split('/').at(-1)),
      'superseded-by': decisions.filter(other => other.supersedes?.includes(row.id)).map(other => other.id.split('/').at(-1)),
    };
  });
  if (leaves.length) {
    entries.push({ id: 'D-999999', title: 'Synthetic fixture vocabulary', category: 'governance', status: 'accepted', date: corpus.evaluationDate,
      deciders: ['synthetic-fixture-steward'], context: `Source review: ${task.source}.`,
      decision: 'Authorize only the vocabulary and reviewed historical-source snapshots in this disposable fixture. This is support metadata, not task-answer authority or human approval of live data.',
      'relates-to': { leaves: inventory.filter(row => row.kind === 'knowledge').map(row => row.id) } });
    inventory.push({ kind: 'decisions', id: 'D-999999', file: 'decisions/entries/D-999999.yaml', support: true });
  }
  for (const entry of entries) writeYaml(join(kit, 'decisions/entries', `${entry.id}.yaml`), { 'schema-version': 1, entries: [entry] });
  if (kinds.has('decisions')) catalog('decisions', entries.map(entry => ({ id: entry.id, title: entry.title, file: `entries/${entry.id}.yaml` })));
  run('git', ['init', '-q', destination]);
  run('git', ['-C', destination, 'add', '.']);
  return { namespace, root: destination, source: task.source, sourceSha256: hash(source), records: inventory };
}
