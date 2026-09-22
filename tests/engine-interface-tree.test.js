import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { invoke, interfaceResultSucceeded } from '../payload/engine/api/index.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { deriveSubjectTreeArtifacts } from '../payload/engine/lib/subject-views.js';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';

const input = () => ({ budget: { nodes: 40, edges: 40, rows: 20 }, maxBytes: 10000 });
const request = (root, value = input()) => ({ interfaceVersion: 1, inputVersion: 1,
  operation: 'subject.tree', root, input: value });

function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), 'interface-tree-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function snapshot(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const path = join(prefix, entry.name);
      return entry.isDirectory() ? [[path, 'directory'], ...snapshot(root, path)]
        : [[path, readFileSync(join(root, path)).toString('base64')]];
    });
}
function emptyFixture(t) {
  const root = temporary(t);
  const namespace = '11111111-1111-4111-8111-111111111111';
  writeFileSync(join(root, '_identity.yaml'), JSON.stringify({ 'schema-version': 1,
    'identity-format': 1, namespace, allocations: [] }));
  mkdirSync(join(root, 'subjects'));
  const file = join(root, 'subjects/registry.yaml');
  writeFileSync(file, JSON.stringify({ 'schema-version': 1, namespace, revision: 0,
    'hierarchy-revision': 0, subjects: [], history: [] }));
  return { root, file };
}
function cliRequest(t, req) {
  const file = join(temporary(t), 'request.json');
  const source = JSON.stringify(req);
  writeFileSync(file, source);
  return (maxOutputBytes = 1048576, maxRequestBytes = Buffer.byteLength(source), cli = 'payload/engine/invoke.js') =>
    spawnSync(process.execPath, [cli, '--request', file, '--max-request-bytes', String(maxRequestBytes),
      '--max-output-bytes', String(maxOutputBytes)], { encoding: 'utf8', timeout: 10000 });
}
async function mcp(t, root, maxResultBytes = 1048576) {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['cli/mcp.js', '--root', root,
    '--max-message-bytes', '1048576', '--max-result-bytes', String(maxResultBytes)], stderr: 'pipe' });
  const client = new Client({ name: 'subject-tree-parity', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  return client;
}

test('tree API returns the actual native derived preview from a nested installation', async t => {
  const f = subjectQueryDiskFixture(t, { nested: true, descendants: true });
  const model = loadStores(f.kitRoot);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const native = deriveSubjectTreeArtifacts(model.subjectRegistry, input());
  assert.equal(native.status, 'complete');
  assert.deepEqual(native.artifacts.map(row => row.path), ['subjects/derived/tree.md', 'subjects/derived/metadata.json']);
  assert.match(native.artifacts[0].text, /Declared lifecycle; approval not checked/);
  const before = snapshot(f.root);
  const result = await invoke(request(f.root));
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(result.outputVersion, 1);
  assert.deepEqual(result.data, native);
  assert.deepEqual(snapshot(f.root), before);
});

test('tree preview matches specialized CLI generation but does not check or replace stale files', async t => {
  const f = subjectQueryDiskFixture(t, { descendants: true });
  const file = join(f.kitRoot, 'subjects/registry.yaml');
  const registry = JSON.parse(readFileSync(file));
  const proposal = 'proposal:subject:22222222-2222-4222-8222-222222222222';
  registry.subjects.push({ id: proposal, label: 'Café 色', status: 'proposed', aliases: [], related: [], changes: [],
    definition: { text: 'Declared proposal', includes: [], excludes: [] } });
  f.put('subjects/registry.yaml', registry);
  const before = snapshot(f.root);
  const expected = await invoke(request(f.root));
  assert.equal(expected.status, 'completed');
  assert.match(expected.data.artifacts[0].text, /Café 色/);
  assert.ok(expected.data.artifacts[0].text.includes(`\`${proposal}\` [proposed]`));
  assert.deepEqual(snapshot(f.root), before);
  const specialized = verb => spawnSync(process.execPath, ['payload/engine/subject-view.js', '--root', f.root,
    verb, '--max-nodes', '40', '--max-edges', '40', '--max-rows', '20', '--max-bytes', '10000', '--json'],
  { encoding: 'utf8', timeout: 10000 });
  const wrote = specialized('--write');
  assert.equal(wrote.status, 0, wrote.stderr);
  assert.deepEqual(JSON.parse(wrote.stdout).metadata, expected.data.metadata);
  for (const artifact of expected.data.artifacts) assert.equal(readFileSync(join(f.kitRoot, artifact.path), 'utf8'), artifact.text);
  f.put('subjects/derived/tree.md', 'stale saved tree');
  f.put('subjects/derived/extra.txt', 'leave this alone');
  const stale = snapshot(f.root);
  assert.deepEqual(await invoke(request(f.root)), expected);
  assert.equal(specialized('--check').status, 1, 'a preview does not claim saved files are current');
  assert.deepEqual(snapshot(f.root), stale);
});

test('tree incomplete projection and rendering keep native reports and fail the shared CLI', async t => {
  const f = subjectQueryDiskFixture(t);
  for (const value of [input(), { ...input(), budget: { nodes: 0, edges: 40, rows: 20 } },
    { ...input(), budget: { nodes: 40, edges: 40, rows: 0 } }, { ...input(), maxBytes: 0 }]) {
    const native = deriveSubjectTreeArtifacts(loadStores(f.kitRoot).subjectRegistry, value);
    const result = await invoke(request(f.root, value));
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.data, native);
    const complete = native.status === 'complete';
    assert.equal(interfaceResultSucceeded(result), complete);
    if (!complete) assert.deepEqual(result.data.artifacts, []);
    const run = cliRequest(t, request(f.root, value));
    const before = snapshot(f.root);
    const cli = run();
    assert.equal(cli.status, complete ? 0 : 2, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), result);
    assert.deepEqual(snapshot(f.root), before);
  }
});

test('tree authority absence and corruption refuse while an empty registry is complete through API and CLI', async t => {
  const f = emptyFixture(t);
  const run = cliRequest(t, request(f.root));
  for (const state of ['empty', 'absent', 'invalid']) {
    if (state === 'absent') rmSync(f.file);
    if (state === 'invalid') writeFileSync(f.file, 'invalid: [');
    const before = snapshot(f.root);
    const result = await invoke(request(f.root));
    const cli = run();
    assert.deepEqual(JSON.parse(cli.stdout), result);
    if (state === 'empty') {
      assert.equal(result.data.status, 'complete');
      assert.equal(result.data.metadata.coverage.total, 0);
      assert.match(result.data.artifacts[0].text, /Renderable subjects: 0\/0/);
      assert.equal(cli.status, 0);
    } else {
      assert.equal(result.status, 'refused');
      assert.equal(Object.hasOwn(result, 'data'), false);
      assert.equal(cli.status, 2);
      if (state === 'absent') assert.equal(result.diagnostics[0].code, 'subject-registry-unavailable');
    }
    assert.deepEqual(snapshot(f.root), before);
  }
});

test('tree rejects mutation flags, incomplete budgets and budget accessors without invoking them', async t => {
  const f = emptyFixture(t);
  let reads = 0;
  const accessor = input();
  Object.defineProperty(accessor.budget, 'nodes', { enumerable: true, get() { reads++; throw Error('accessor'); } });
  const before = snapshot(f.root);
  for (const value of [{ ...input(), write: true }, { ...input(), delete: true }, { maxBytes: 100 },
    { ...input(), budget: { nodes: 1, edges: 1 } }, { ...input(), maxBytes: -1 },
    { ...input(), budget: { nodes: 1.5, edges: 1, rows: 1 } }, accessor]) {
    const result = await invoke(request(f.root, value));
    assert.equal(result.status, 'refused');
    assert.equal(Object.hasOwn(result, 'data'), false);
  }
  assert.equal(reads, 0);
  assert.deepEqual(snapshot(f.root), before);
});

test('native tree bytes and request CLI framing have separate exact output boundaries', async t => {
  const f = subjectQueryDiskFixture(t);
  const full = await invoke(request(f.root));
  const treeBytes = Buffer.byteLength(full.data.artifacts[0].text);
  assert.equal((await invoke(request(f.root, { ...input(), maxBytes: treeBytes }))).data.status, 'complete');
  const short = await invoke(request(f.root, { ...input(), maxBytes: treeBytes - 1 }));
  assert.equal(short.data.status, 'incomplete');
  assert.deepEqual(short.data.artifacts, []);
  const req = request(f.root);
  const run = cliRequest(t, req);
  const requestBytes = Buffer.byteLength(JSON.stringify(req));
  const outputBytes = Buffer.byteLength(`${JSON.stringify(full)}\n`);
  const before = snapshot(f.root);
  const exact = run(outputBytes, requestBytes);
  assert.equal(exact.status, 0, exact.stderr);
  assert.deepEqual(JSON.parse(exact.stdout), full);
  for (const denied of [run(outputBytes - 1, requestBytes), run(outputBytes, requestBytes - 1)]) {
    assert.equal(denied.status, 2);
    assert.equal(denied.stdout, '');
  }
  assert.deepEqual(snapshot(f.root), before);
});

test('official SDK discovers the tree and preserves complete, incomplete and malformed native budgets', { timeout: 15000 }, async t => {
  const f = subjectQueryDiskFixture(t, { nested: true });
  const client = await mcp(t, f.root);
  const listed = await client.listTools();
  const tool = listed.tools.find(row => row.name === 'subject_tree');
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, true);
  const capabilities = await invoke({ ...request(f.root), operation: 'engine.capabilities', input: {} });
  assert.deepEqual(capabilities.data.operations.find(row => row.operation === 'subject.tree'),
    { operation: 'subject.tree', inputVersion: 1, outputVersion: 1, scope: 'declared-metadata' });
  const malformed = input();
  Object.defineProperty(malformed.budget, '__proto__', { value: null, enumerable: true });
  const before = snapshot(f.root);
  for (const value of [input(), { ...input(), budget: { nodes: 0, edges: 40, rows: 20 } },
    { ...input(), maxBytes: 0 }, malformed]) {
    const expected = await invoke(request(f.root, value));
    const result = await client.callTool({ name: 'subject_tree', arguments: value });
    assert.deepEqual(result.structuredContent, expected);
    assert.deepEqual(JSON.parse(result.content[0].text), expected);
    assert.equal(result.isError, !interfaceResultSucceeded(expected));
  }
  const mutation = await client.callTool({ name: 'subject_tree', arguments: { ...input(), write: true } });
  assert.equal(mutation.isError, true);
  assert.deepEqual(snapshot(f.root), before);
});

test('official SDK distinguishes empty, absent and malformed subject authority without writing', { timeout: 15000 }, async t => {
  const f = emptyFixture(t);
  const client = await mcp(t, f.root);
  for (const state of ['empty', 'absent', 'invalid']) {
    if (state === 'absent') rmSync(f.file);
    if (state === 'invalid') writeFileSync(f.file, 'invalid: [');
    const before = snapshot(f.root);
    const result = await client.callTool({ name: 'subject_tree', arguments: input() });
    assert.deepEqual(result.structuredContent, await invoke(request(f.root)));
    assert.equal(result.isError, state !== 'empty');
    assert.deepEqual(snapshot(f.root), before);
  }
});

test('MCP tree result capacity includes both text and structured native reports', { timeout: 15000 }, async t => {
  const f = emptyFixture(t);
  const expected = await invoke(request(f.root));
  const payload = { content: [{ type: 'text', text: JSON.stringify(expected) }], structuredContent: expected, isError: false };
  const size = Buffer.byteLength(JSON.stringify(payload));
  const before = snapshot(f.root);
  for (const capacity of [size, size - 1]) {
    const client = await mcp(t, f.root, capacity);
    const result = await client.callTool({ name: 'subject_tree', arguments: input() });
    if (capacity === size) assert.deepEqual(result, payload);
    else {
      assert.equal(result.isError, true);
      assert.equal(Object.hasOwn(result, 'structuredContent'), false);
      assert.match(result.content[0].text, /max-result-bytes/);
    }
    await client.close();
  }
  assert.deepEqual(snapshot(f.root), before);
});

test('copied engine previews trees with only its native YAML dependency', async t => {
  const f = emptyFixture(t);
  cpSync(new URL('../payload/engine', import.meta.url), join(f.root, 'engine'), { recursive: true });
  cpSync(new URL('../payload/schemas', import.meta.url), join(f.root, 'schemas'), { recursive: true });
  cpSync(new URL('../payload/package.json', import.meta.url), join(f.root, 'package.json'));
  mkdirSync(join(f.root, 'node_modules'));
  cpSync(new URL('../node_modules/js-yaml', import.meta.url), join(f.root, 'node_modules/js-yaml'), { recursive: true });
  const run = cliRequest(t, request(f.root));
  const before = snapshot(f.root);
  const result = run(1048576, 1048576, join(f.root, 'engine/invoke.js'));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), await invoke(request(f.root)));
  assert.deepEqual(snapshot(f.root), before);
});
