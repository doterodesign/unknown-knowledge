// The shared engine API and its two transports (request-file CLI, stdio MCP),
// exercised on the canonical fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { invoke, interfaceResultSucceeded } from '../payload/engine/api/index.js';
import { installation, copy } from './helpers/canonical.js';

const request = (root, operation, input) => ({ interfaceVersion: 1, operation, inputVersion: 1, root, input });
const ENGINEERING = installation('engineering');
const QUESTION = { question: 'How must the CSS exporter serialize the semitransparent accent color?' };
const mcp = (root, resultBytes = 1048576) => new StdioClientTransport({ command: process.execPath,
  args: ['cli/mcp.js', '--root', root, '--max-message-bytes', '1048576', '--max-result-bytes', String(resultBytes)], stderr: 'pipe' });

test('interface discovery advertises real handlers and refuses invalid requests before root access', async () => {
  const base = request('/does-not-exist', 'engine.capabilities', {});
  const result = await invoke(base);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.data.operations.map((row) => row.operation).sort(),
    ['engine.capabilities', 'record.ask', 'record.preflight', 'subject.lookup']);
  for (const row of result.data.operations) {
    assert.equal(row.inputVersion, 1);
    assert.equal(row.outputVersion, 1, row.operation);
  }
  for (const malformed of [{ ...base, extra: true }, { ...base, interfaceVersion: 2 },
    { ...base, operation: 'not.registered' }, { ...base, root: '.' }, { ...base, input: { extra: true } }]) {
    const denied = await invoke(malformed);
    assert.equal(denied.status, 'refused');
    assert.equal(Object.hasOwn(denied, 'data'), false);
  }
  let reads = 0;
  const accessor = { ...base };
  Object.defineProperty(accessor, 'input', { get() { reads++; throw Error('not data'); } });
  assert.equal((await invoke(accessor)).status, 'refused');
  assert.equal(reads, 0);
});

test('lookup API preserves existing CLI output and distinguishes zero matches from absent authority', async (t) => {
  const f = copy(t, 'engineering');
  const input = { text: 'Accessibility' };
  const result = await invoke(request(f.root, 'subject.lookup', input));
  const cli = spawnSync(process.execPath, ['payload/engine/subject.js', 'lookup', 'Accessibility', '--root', f.root, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.data, JSON.parse(cli.stdout));
  assert.ok(result.data.result.matches.length > 0);
  const empty = await invoke(request(f.root, 'subject.lookup', { text: 'no-such-label' }));
  assert.equal(empty.status, 'completed');
  assert.deepEqual(empty.data.result.matches, []);
  rmSync(join(f.kit, 'subjects'), { recursive: true });
  assert.equal((await invoke(request(f.root, 'subject.lookup', input))).status, 'refused');
});

test('record.ask refuses malformed input and reports, never grades, unhealthy stores', async (t) => {
  for (const input of [{}, { question: '   ' }, { mode: 'count' }, { mode: 'nope', question: 'x' },
    { question: 'x', limit: 0 }, { question: 'x', where: [{ field: 'kind' }] }, { question: 'x', extra: true }]) {
    assert.equal((await invoke(request(ENGINEERING, 'record.ask', input))).status, 'refused', JSON.stringify(input));
  }
  const broken = copy(t, 'engineering');
  writeFileSync(join(broken.kit, 'knowledge/K-copy.md'), readFileSync(join(broken.kit, 'knowledge/K-000001.md')));
  const result = await invoke(request(broken.root, 'record.ask', QUESTION));
  assert.equal(result.status, 'completed');
  assert.equal(result.data.confidence.tier, 'unavailable');
  assert.equal(interfaceResultSucceeded(result), false);
});

test('request-file CLI returns the same envelope and enforces exact framing capacities', async (t) => {
  const f = copy(t, 'engineering');
  const req = request(f.root, 'record.ask', QUESTION);
  const file = join(f.root, 'request.json'); const source = JSON.stringify(req);
  writeFileSync(file, source);
  const expected = await invoke(req); const output = `${JSON.stringify(expected)}\n`;
  const run = (inputBytes, outputBytes) => spawnSync(process.execPath, ['payload/engine/invoke.js', '--request', file,
    '--max-request-bytes', String(inputBytes), '--max-output-bytes', String(outputBytes)], { encoding: 'utf8' });
  const exact = run(Buffer.byteLength(source), Buffer.byteLength(output));
  assert.equal(exact.status, 0, exact.stderr); assert.deepEqual(JSON.parse(exact.stdout), expected);
  for (const result of [run(Buffer.byteLength(source) - 1, Buffer.byteLength(output)),
    run(Buffer.byteLength(source), Buffer.byteLength(output) - 1)]) {
    assert.equal(result.status, 2); assert.equal(result.stdout, '');
  }
  cpSync(new URL('../payload/engine', import.meta.url), join(f.kit, 'engine'), { recursive: true });
  cpSync(new URL('../payload/schemas', import.meta.url), join(f.kit, 'schemas'), { recursive: true });
  cpSync(new URL('../payload/package.json', import.meta.url), join(f.kit, 'package.json'));
  mkdirSync(join(f.kit, 'node_modules'));
  cpSync(new URL('../node_modules/js-yaml', import.meta.url), join(f.kit, 'node_modules/js-yaml'), { recursive: true });
  const copied = spawnSync(process.execPath, [join(f.kit, 'engine/invoke.js'), '--request', file,
    '--max-request-bytes', String(Buffer.byteLength(source)), '--max-output-bytes', String(Buffer.byteLength(output))],
  { cwd: f.root, encoding: 'utf8' });
  assert.equal(copied.status, 0, copied.stderr);
  assert.deepEqual(JSON.parse(copied.stdout), expected, 'seeded engine needs no MCP dependency');
});

test('official MCP client discovers and calls the engine operations over stdio', { timeout: 15000 }, async (t) => {
  const client = new Client({ name: 'unknown-knowledge-interface-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(mcp(ENGINEERING));
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), ['engine_capabilities', 'record_ask', 'record_preflight', 'subject_lookup']);
  const asked = await client.callTool({ name: 'record_ask', arguments: QUESTION });
  assert.equal(asked.isError, false, JSON.stringify(asked));
  assert.deepEqual(asked.structuredContent, await invoke(request(ENGINEERING, 'record.ask', QUESTION)));
  const counted = await client.callTool({ name: 'record_ask', arguments: { mode: 'count', countBy: 'kind' } });
  assert.equal(counted.isError, false, JSON.stringify(counted));
  assert.ok(counted.structuredContent.data.top.length > 0);
  const refused = await client.callTool({ name: 'record_ask', arguments: { mode: 'count', countBy: 'colour' } });
  assert.equal(refused.isError, true);
  assert.equal(refused.structuredContent.diagnostics[0].code, 'unknown-field');
  const otherRoot = await client.callTool({ name: 'subject_lookup', arguments: { text: 'Shape', root: '/another-repo' } });
  assert.equal(otherRoot.isError, true);
});

test('MCP admits both factored payload copies at the exact result byte boundary', { timeout: 15000 }, async () => {
  const report = await invoke(request(ENGINEERING, 'record.ask', QUESTION));
  const expected = { content: [{ type: 'text', text: JSON.stringify(report) }], structuredContent: report, isError: false };
  const size = Buffer.byteLength(JSON.stringify(expected));
  assert.ok(size > Buffer.byteLength(JSON.stringify(report)) * 2, 'text escaping and both copies are counted');
  for (const capacity of [size, size - 1]) {
    const client = new Client({ name: 'factored-output-boundary', version: '1.0.0' });
    try {
      await client.connect(mcp(ENGINEERING, capacity));
      const result = await client.callTool({ name: 'record_ask', arguments: QUESTION });
      if (capacity === size) assert.deepEqual(result, expected);
      else {
        assert.equal(result.isError, true);
        assert.equal(result.structuredContent, undefined);
        assert.match(result.content[0].text, /exceeds --max-result-bytes/);
      }
    } finally { await client.close(); }
  }
});

test('MCP documentation reads enforce exact complete-payload capacity', { timeout: 15000 }, async (t) => {
  for (const [name, file] of [['engine-interface', 'engine-interface.md'], ['agents', 'AGENTS.md']]) {
    const uri = `unknown-knowledge://protocol/${name}`;
    const expected = { contents: [{ uri, mimeType: 'text/markdown',
      text: readFileSync(new URL(`../payload/protocol/${file}`, import.meta.url), 'utf8') }] };
    const size = Buffer.byteLength(JSON.stringify(expected));
    for (const capacity of [size, size - 1]) {
      const client = new Client({ name: 'interface-resource-capacity-test', version: '1.0.0' });
      t.after(() => client.close()); await client.connect(mcp(ENGINEERING, capacity));
      if (capacity === size) assert.deepEqual(await client.readResource({ uri }), expected);
      else await assert.rejects(client.readResource({ uri }), /max-result-bytes/);
      await client.close();
    }
  }
});
