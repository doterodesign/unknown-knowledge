import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { inventorySourceDocuments, rewriteIdentityCandidate } from '../payload/engine/lib/identity-migration.js';
import { captureCommittedFile } from '../payload/engine/lib/captured-source.js';
import { prepareCandidate } from '../payload/engine/lib/prepare-candidate.js';
import { runPreparedMigrationGate } from '../payload/engine/lib/prepared-migration-gate.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';

const namespace = '11111111-1111-4111-8111-111111111111';
const publication = { id: '22222222-2222-4222-8222-222222222222', review: 'exact fixture review' };
const versions = { 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2,
  catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2, miss: 1 };
const limits = { maxTreeEntries: 100, maxTreeBytes: 1000000, maxFileBytes: 100000,
  maxGitOutputBytes: 1000000, maxSourceDocuments: 20, maxRecords: 20, maxReferences: 50,
  maxAdjudications: 20, maxProseEdits: 20, maxInputBytes: 100000 };
const person = { name: 'Gate Fixture', email: 'gate@example.test', seconds: 1700000000, offset: '+0000' };

async function fixture(t, { format = 'sha1', nested = false, cycle = false, valueDrift = false, unclassified = false, emptyStores = false, extraSourceFiles = [], alter } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'prepared-migration-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  env.GIT_CONFIG_GLOBAL = '/dev/null'; env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (args, input) => {
    const r = spawnSync('git', ['-C', root, ...args], { env, input });
    assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
  };
  const text = (...args) => git(args).toString().trim();
  git(['init', '-q', '-b', 'source', `--object-format=${format}`]);
  git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  const prefix = nested ? 'unknown-knowledge/' : '';
  const put = (file, bytes) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), bytes); };
  const documents = [{ file: `${prefix}decisions/_catalog.yaml`, kind: 'catalog', bytes: Buffer.from(
    `schema-version: 1\nstore: decisions\nentries: [{id: D-9, title: Direction, file: ${cycle ? 'entries/one.yaml' : 'pending-import'}}]\n`) }];
  if (emptyStores) for (const store of ['ontology', 'knowledge']) documents.push({
    file: `${prefix}${store}/_catalog.yaml`, kind: 'catalog',
    bytes: Buffer.from(`schema-version: 1\nstore: ${store}\nentries: []\n`),
  });
  if (cycle) documents.push({ file: `${prefix}decisions/entries/one.yaml`, kind: 'decision-entry', bytes: Buffer.from(
    'schema-version: 1\nentries:\n  - id: D-9\n    title: Direction\n    category: architecture\n    status: accepted\n    date: "2026-09-19"\n    deciders: [steward]\n    context: Observed\n    decision: Chosen\n    supersedes: [D-9]\n') });
  if (valueDrift) {
    documents.push({ file: `${prefix}ontology/_catalog.yaml`, kind: 'catalog', bytes: Buffer.from(
      'schema-version: 1\nstore: ontology\nentries: [{id: K-7, title: Icon, file: classes/100-icons.yaml}]\n') });
    documents.push({ file: `${prefix}ontology/classes/100-icons.yaml`, kind: 'ontology-concept', bytes: Buffer.from(
      'schema-version: 1\nentries:\n  - id: K-7\n    term: Icon\n    class: 100-icons\n    summary: Shipped icon set\n    source-of-truth: [src/icons.txt]\n    status: active\n    enumerates: [{kind: test-lines, source: src/icons.txt, values: [grid]}]\n') });
    put(`${prefix}ontology/_rules.yaml`, 'schema-version: 1\nstore: ontology\nrules: []\n');
    put('src/icons.txt', 'grid\nlist\n');
  }
  for (const doc of documents) put(doc.file, doc.bytes);
  for (const [file, bytes] of extraSourceFiles) put(`${prefix}${file}`, bytes);
  put('retained.bin', Buffer.from([0, 255, 128, 13, 10]));
  if (nested) put('.unknown-knowledge.json', '{"kitRoot":"unknown-knowledge"}\n');
  if (unclassified) put(`${prefix}decisions/custom.json`, '{"extension":true}\n');
  git(['add', '.']); git(['commit', '-qm', 'legacy source']);
  const sourceCommit = text('rev-parse', 'HEAD'); const sourceTree = text('rev-parse', 'HEAD^{tree}');
  const migrationInputs = { namespace, publication: { ...publication }, proposals: [],
    declarations: inventorySourceDocuments(documents).records.filter((r) => r.availability === 'declared-only')
      .map((r) => ({ source: r.key, disposition: 'allocate' })), adjudications: [], proseDecisions: [] };
  const rewritten = rewriteIdentityCandidate(documents, { ...migrationInputs, targetVersions: versions });
  assert.equal(rewritten.ok, true, JSON.stringify(rewritten));
  const changes = rewritten.files.map((file) => {
    const capture = captureCommittedFile({ repoRoot: root, commit: sourceCommit, file: file.file });
    return { file: file.file, before: { mode: capture.mode, capture: capture.locator }, after: { mode: capture.mode, bytes: file.bytes } };
  });
  changes.push({ file: `${prefix}_identity.yaml`, before: null, after: { mode: '100644', bytes: Buffer.from(JSON.stringify(rewritten.identity)) } });
  if (alter) alter({ changes, root, sourceCommit, migrationInputs });
  const prepared = await prepareCandidate({ operation: 'identity-migration', repoRoot: root,
    source: { ref: 'refs/heads/source', expectedCommit: sourceCommit, kitPath: nested ? 'unknown-knowledge' : '.' },
    changes, commit: { author: person, committer: person, message: 'candidate\n' },
    limits: { maxChanges: 20, maxFileBytes: 100000, maxTotalChangeBytes: 200000, maxTreeEntries: 100,
      maxTreeBytes: 1000000, maxGitOutputBytes: 1000000, maxCommitMessageBytes: 1000 } });
  const input = () => ({ repoRoot: root, source: { commit: sourceCommit, tree: sourceTree, kitPath: prepared.source.kitPath },
    candidate: { ...prepared.candidate }, migrationInputs: structuredClone(migrationInputs), limits: { ...limits } });
  return { root, git, text, put, input, documents };
}

for (const format of ['sha1', 'sha256']) test(`actual ${format} migration gate corroborates immutable bytes and retains no temporary mapping`, async (t) => {
  const f = await fixture(t, { format });
  f.put('decisions/_catalog.yaml', 'staged'); f.git(['add', '.']); f.put('decisions/_catalog.yaml', 'unstaged'); f.put('private', 'untracked');
  const index = readFileSync(join(f.root, '.git/index')); const refs = f.git(['show-ref']);
  const result = await runPreparedMigrationGate(f.input());
  assert.equal(result.mechanicalStatus, 'passed', JSON.stringify(result));
  assert.equal(result.publicationReady, false); assert.equal(result.impact.status, 'not-performed');
  assert.equal(result.objectFormat, format); assert.equal(result.scope.declaredOnly, 1);
  assert.match(result.validationInputDigest, /^[0-9a-f]{64}$/);
  const { source, candidate, migrationInputs, limits: actualLimits } = f.input();
  assert.equal(result.validationInputDigest, canonicalSha256({ source, candidate, migrationInputs, limits: actualLimits,
    policy: { id: 'identity-migration-publication-v1', version: 1 } }));
  assert.ok(result.checks.some((r) => r.id === 'candidate-structural' && r.status === 'passed'));
  assert.ok(result.checks.some((r) => r.id === 'candidate-values' && r.status === 'passed'));
  assert.doesNotMatch(JSON.stringify(result), /D-9|exact fixture review|disposition|correspondence|proseDecisions/);
  assert.deepEqual(f.git(['show-ref']), refs); assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  assert.equal(readFileSync(join(f.root, 'decisions/_catalog.yaml'), 'utf8'), 'unstaged');
  assert.equal(readFileSync(join(f.root, 'private'), 'utf8'), 'untracked');
  assert.deepEqual(await runPreparedMigrationGate(f.input()), result);
});

test('the mechanical scope admits only closed empty rules and known preserved ordinary artifacts', async (t) => {
  const extraSourceFiles = [
    ['ontology/_rules.yaml', 'schema-version: 1\nstore: ontology\nrules: []\n'],
    ['knowledge/derived/index.json', '{"stale":true}\n'],
    ['knowledge/derived/tree.domain-form.md', 'stale generated bytes\n'],
    ['knowledge/derived/tree.form-domain.md', 'more stale generated bytes\n'],
  ];
  const f = await fixture(t, { extraSourceFiles, emptyStores: true });
  const result = await runPreparedMigrationGate(f.input());
  assert.equal(result.mechanicalStatus, 'passed', JSON.stringify(result));
  assert.deepEqual(result.scope.unclassifiedPaths, []);
  for (const [file] of extraSourceFiles) assert.ok(result.scope.sourceFiles.includes(file));
  assert.equal(result.impact.status, 'not-performed');
  assert.equal(result.checks.find((row) => row.id === 'source-inventory').counts.documents, 7);
});

test('nonempty, malformed and mismatched rules remain unsupported source scope', async (t) => {
  for (const bytes of [
    'schema-version: 1\nstore: ontology\nrules: [{decision: D-9}]\n',
    'schema-version: 1\nstore: knowledge\nrules: []\n',
    'schema-version: 1\nstore: ontology\nrules: []\nextension: true\n',
    'schema-version: 1\nstore: ontology\nrules: &empty []\n',
  ]) {
    const f = await fixture(t, { extraSourceFiles: [['ontology/_rules.yaml', bytes]] });
    const result = await runPreparedMigrationGate(f.input());
    assert.equal(result.mechanicalStatus, 'failed');
    assert.ok(result.scope.unclassifiedPaths.includes('ontology/_rules.yaml'));
  }
});

test('source Subject authorities and unknown derived artifacts cannot disappear from scope', async (t) => {
  const f = await fixture(t, { extraSourceFiles: [
    ['subjects/registry.yaml', 'unrecognized legacy subject authority\n'],
    ['knowledge/derived/private.json', '{}\n'],
  ] });
  const result = await runPreparedMigrationGate(f.input());
  assert.equal(result.mechanicalStatus, 'failed');
  assert.deepEqual(result.scope.unclassifiedPaths, ['knowledge/derived/private.json', 'subjects/registry.yaml']);
});

test('each prepared side independently corroborates its exact commit/tree and nested layout', async (t) => {
  const f = await fixture(t, { nested: true });
  assert.equal((await runPreparedMigrationGate(f.input())).mechanicalStatus, 'passed');
  for (const side of ['source', 'candidate']) {
    for (const mutate of [(p) => { p[side].commit = 'HEAD'; }, (p) => { p[side].tree = '1'.repeat(40); },
      (p) => { p[side].kitPath = '.'; }]) {
      const input = f.input(); mutate(input);
      assert.notEqual((await runPreparedMigrationGate(input)).mechanicalStatus, 'passed');
    }
  }
});

test('a candidate with unrelated parent cannot borrow a valid source/tree pair', async (t) => {
  const f = await fixture(t);
  const unrelated = f.git(['commit-tree', f.input().candidate.tree], Buffer.from('unrelated parent\n')).toString().trim();
  const input = f.input(); input.candidate.commit = unrelated;
  assert.equal((await runPreparedMigrationGate(input)).checks.find((r) => r.id === 'committed-pair').code,
    'migration-candidate-parent-mismatch');
  f.put('.git/info/grafts', `${unrelated} ${input.source.commit}\n`);
  assert.equal((await runPreparedMigrationGate(input)).checks.find((r) => r.id === 'committed-pair').code,
    'migration-candidate-parent-mismatch', 'repository grafts cannot supply a missing raw parent');
});

test('actual unexpected bytes and mode changes fail whole-tree preservation', async (t) => {
  const f = await fixture(t, { alter: ({ changes, root, sourceCommit }) => {
    const capture = captureCommittedFile({ repoRoot: root, commit: sourceCommit, file: 'retained.bin' });
    changes.push({ file: 'retained.bin', before: { mode: capture.mode, capture: capture.locator }, after: { mode: capture.mode, bytes: Buffer.from('tampered') } });
  } });
  assert.equal((await runPreparedMigrationGate(f.input())).mechanicalStatus, 'failed');
  const g = await fixture(t);
  g.git(['read-tree', g.input().candidate.tree]); g.git(['update-index', '--chmod=+x', 'retained.bin']);
  const tree = g.text('write-tree');
  const commit = g.git(['commit-tree', tree, '-p', g.input().source.commit], Buffer.from('mode change\n')).toString().trim();
  const input = g.input(); input.candidate = { ...input.candidate, tree, commit };
  assert.equal((await runPreparedMigrationGate(input)).mechanicalStatus, 'failed');
});

test('actual ledger namespace/publication must agree with the gate inputs and computed allocation', async (t) => {
  const f = await fixture(t);
  for (const mutate of [(p) => { p.migrationInputs.namespace = '33333333-3333-4333-8333-333333333333'; },
    (p) => { p.migrationInputs.publication.review = 'different review'; }, (p) => { p.migrationInputs.declarations = []; }]) {
    const input = f.input(); mutate(input); const result = await runPreparedMigrationGate(input);
    assert.equal(result.mechanicalStatus, 'failed');
    assert.doesNotMatch(JSON.stringify(result), /different review|D-9/);
  }
  const decorated = await fixture(t, { alter: ({ changes }) => {
    const ledger = changes.find((row) => row.file === '_identity.yaml');
    ledger.after.bytes = Buffer.concat([ledger.after.bytes, Buffer.from('\n# extra retained identity history\n')]);
  } });
  assert.equal((await runPreparedMigrationGate(decorated.input())).mechanicalStatus, 'failed');
});

test('actual structural findings remain failed and unclassified source scope never becomes complete', async (t) => {
  const f = await fixture(t, { cycle: true }); const result = await runPreparedMigrationGate(f.input());
  assert.equal(result.mechanicalStatus, 'failed');
  assert.equal(result.checks.find((r) => r.id === 'candidate-structural').status, 'failed');
  const g = await fixture(t, { unclassified: true }); const incomplete = await runPreparedMigrationGate(g.input());
  assert.equal(incomplete.mechanicalStatus, 'failed');
  assert.deepEqual(incomplete.scope.unclassifiedPaths, ['decisions/custom.json']);
});

test('the actual value validator reads candidate source anchors and preserves blocking drift counts', async (t) => {
  const f = await fixture(t, { valueDrift: true }); const result = await runPreparedMigrationGate(f.input());
  const values = result.checks.find((row) => row.id === 'candidate-values');
  assert.equal(values.status, 'failed', JSON.stringify(result));
  assert.equal(values.counts.checked, 1); assert.equal(values.counts.errors, 1);
  assert.equal(result.mechanicalStatus, 'failed');
});

test('unsupported snapshot evidence yields a static failure without retaining path-bearing exceptions', async (t) => {
  const f = await fixture(t);
  f.git(['read-tree', f.input().candidate.tree]);
  const blob = f.git(['hash-object', '-w', '--stdin'], Buffer.from('/outside/private-target')).toString().trim();
  f.git(['update-index', '--add', '--cacheinfo', `120000,${blob},escape`]);
  const tree = f.text('write-tree');
  const commit = f.git(['commit-tree', tree, '-p', f.input().source.commit], Buffer.from('unsafe snapshot\n')).toString().trim();
  const input = f.input(); input.candidate = { ...input.candidate, tree, commit };
  const result = await runPreparedMigrationGate(input);
  assert.equal(result.mechanicalStatus, 'failed');
  assert.ok(result.checks.some((row) => row.code === 'migration-snapshot-evidence-unavailable'));
  assert.doesNotMatch(JSON.stringify(result), /private-target/);
});

test('unexpected bugs in commit and inventory helpers propagate instead of becoming retained refusals', async (t) => {
  const f = await fixture(t);
  for (const name of ['realpathSync', 'readdirSync']) {
    const original = fs[name];
    try {
      fs[name] = () => { throw new TypeError(`controlled ${name} bug`); };
      syncBuiltinESMExports();
      await assert.rejects(runPreparedMigrationGate(f.input()), { name: 'TypeError', message: `controlled ${name} bug` });
    } finally { fs[name] = original; syncBuiltinESMExports(); }
  }
});

test('closed wire, explicit bounds and caller mutation cannot supply a successful gate proof', async (t) => {
  const f = await fixture(t);
  for (const mutate of [(p) => { p.model = {}; }, (p) => { p.migrationInputs.targetVersions = versions; },
    (p) => { delete p.migrationInputs.adjudications; }, (p) => { p.limits.maxInputBytes = 1; },
    (p) => { p.limits.maxTreeBytes = 1; }, (p) => { p.limits.maxFileBytes = p.limits.maxGitOutputBytes + 1; },
    (p) => { p.migrationInputs.proposals = [() => true]; }]) {
    const input = f.input(); mutate(input); assert.notEqual((await runPreparedMigrationGate(input)).mechanicalStatus, 'passed');
  }
  const arbitraryLimits = f.input(); arbitraryLimits.limits = { privateMapping: 'do not retain' };
  const malformed = await runPreparedMigrationGate(arbitraryLimits);
  assert.equal(malformed.resources.limits, null); assert.equal(malformed.source, null);
  assert.doesNotMatch(JSON.stringify(malformed), /privateMapping|do not retain/);
  const input = f.input(); const pending = runPreparedMigrationGate(input);
  input.migrationInputs.publication.review = 'changed after invocation';
  assert.equal((await pending).mechanicalStatus, 'passed');
});

test('already-canonical committed source produces a static inventory refusal', async (t) => {
  const f = await fixture(t);
  const input = f.input();
  input.source = { ...input.candidate };
  input.candidate.commit = f.git(['commit-tree', input.source.tree, '-p', input.source.commit], 'already canonical\n').toString().trim();
  const refs = f.git(['show-ref']);
  const report = await runPreparedMigrationGate(input);
  assert.equal(report.mechanicalStatus, 'failed');
  assert.deepEqual(report.checks.find((row) => row.id === 'source-inventory'), {
    id: 'source-inventory', status: 'failed', code: 'migration-source-inventory-unavailable', counts: {},
  });
  assert.equal(report.scope, null);
  assert.equal(report.publicationReady, false);
  assert.doesNotMatch(JSON.stringify(report), /identity authority already present|D-9|exact fixture review/);
  assert.deepEqual(f.git(['show-ref']), refs);
});
