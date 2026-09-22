import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { invoke, interfaceResultSucceeded } from '../payload/engine/api/index.js';

const fixture = name => fileURLToPath(new URL(`fixtures/${name}/`, import.meta.url));
const request = (root, input) => ({ interfaceVersion: 1, inputVersion: 1, operation: 'record.preflight', root, input });
const base = { concepts: ['O-000001'], leaves: [], today: null };
function native(root, input) {
  return spawnSync(process.execPath, ['payload/engine/preflight.js', '--root', root, '--json',
    '--concepts', input.concepts.join(','), '--leaves', input.leaves.join(','),
    ...(input.today === null ? [] : ['--today', input.today])], { encoding: 'utf8' });
}

for (const [name, store, input, exit] of [
  ['trusted normalized selection', 'preflight/clean', { ...base, concepts: [' O-000002 ', 'O-000001', 'O-000001', ''] }, 0],
  ['quarantine', 'preflight/drift', base, 1],
  ['unverified proposal', 'preflight/clean', { ...base, concepts: ['proposal:ontology:13013013-0130-4130-8130-130130130130'] }, 2],
  ['degraded store', 'preflight/malformed', { ...base, leaves: ['K-999999'] }, 2],
  ['store health only', 'preflight/clean', { ...base, concepts: [] }, 0],
  ['stale leaf', 'structural-validator/time-facet', { concepts: [], leaves: ['K-000002'], today: '2026-08-16' }, 1],
  ['skipped freshness', 'structural-validator/time-facet', { concepts: [], leaves: ['K-000002'], today: null }, 2],
]) {
  test(`shared preflight preserves native ${name} payload and conduct`, async () => {
    const root = fixture(store); const expected = native(root, input);
    assert.equal(expected.status, exit, expected.stderr);
    const result = await invoke(request(root, input));
    assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.deepEqual(result.data, JSON.parse(expected.stdout));
    assert.equal(interfaceResultSucceeded(result), exit === 0);
    assert.equal(Object.hasOwn(result.data, 'logged'), false);
  });
}

test('preflight input refuses malformed selections, accessors, dates and logging before root access', async () => {
  let reads = 0;
  const accessor = ['O-000001'];
  Object.defineProperty(accessor, '0', { enumerable: true, get() { reads++; throw Error('not data'); } });
  const extra = ['O-000001']; extra.other = true;
  const inherited = Object.create(base);
  for (const input of [{ ...base, log: true }, { ...base, today: '2026-02-30' },
    { ...base, concepts: 'O-000001' }, { ...base, concepts: [null] },
    { ...base, concepts: new Array(1) }, { ...base, concepts: accessor },
    { ...base, concepts: extra }, { ...base, today: undefined }, inherited]) {
    const result = await invoke(request('/does-not-exist', input));
    assert.equal(result.status, 'refused', JSON.stringify(result));
    assert.equal(result.diagnostics[0].code, 'invalid-interface-input');
  }
  assert.equal(reads, 0);
});

test('an absent selected ID preserves native refusal instead of inventing an unknown verdict', async () => {
  const root = fixture('preflight/clean'); const input = { ...base, concepts: ['O-999999'] };
  const expected = native(root, input);
  assert.equal(expected.status, 2); assert.equal(expected.stdout, '');
  assert.match(expected.stderr, /not in the ontology/);
  const result = await invoke(request(root, input));
  assert.equal(result.status, 'refused'); assert.equal(Object.hasOwn(result, 'data'), false);
  assert.match(result.diagnostics[0].message, /not in the ontology/);
});

test('preflight request CLI preserves findings while copied engine needs no MCP SDK and writes no logs', async t => {
  const root = mkdtempSync(join(tmpdir(), 'uk-preflight-interface-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixture('preflight/drift'), root, { recursive: true });
  const req = request(root, base); const source = JSON.stringify(req); const file = join(root, 'request.json');
  writeFileSync(file, source);
  const expected = await invoke(req);
  assert.equal(expected.status, 'completed'); assert.equal(expected.data.ok, false);
  const output = JSON.stringify(expected) + '\n';
  const args = ['--request', file, '--max-request-bytes', String(Buffer.byteLength(source)),
    '--max-output-bytes', String(Buffer.byteLength(output))];
  const direct = spawnSync(process.execPath, ['payload/engine/invoke.js', ...args], { encoding: 'utf8' });
  assert.equal(direct.status, 2, direct.stderr); assert.deepEqual(JSON.parse(direct.stdout), expected);
  cpSync(new URL('../payload/engine', import.meta.url), join(root, 'engine'), { recursive: true });
  cpSync(new URL('../payload/schemas', import.meta.url), join(root, 'schemas'), { recursive: true });
  cpSync(new URL('../payload/package.json', import.meta.url), join(root, 'package.json'));
  mkdirSync(join(root, 'node_modules'));
  cpSync(new URL('../node_modules/js-yaml', import.meta.url), join(root, 'node_modules/js-yaml'), { recursive: true });
  const copied = spawnSync(process.execPath, [join(root, 'engine/invoke.js'), ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(copied.status, 2, copied.stderr); assert.deepEqual(JSON.parse(copied.stdout), expected);
  assert.equal(existsSync(join(root, 'logs')), false);
});

test('official MCP client receives native preflight findings and rejects attempts to enable logging', { timeout: 15000 }, async t => {
  const root = fixture('preflight/drift');
  const transport = new StdioClientTransport({ command: process.execPath, args: ['cli/mcp.js', '--root', root,
    '--max-message-bytes', '1048576', '--max-result-bytes', '1048576'], stderr: 'pipe' });
  const client = new Client({ name: 'preflight-interface-test', version: '1.0.0' });
  t.after(() => client.close()); await client.connect(transport);
  const listed = await client.listTools();
  assert.ok(listed.tools.some(row => row.name === 'record_preflight'));
  const actual = await client.callTool({ name: 'record_preflight', arguments: base });
  assert.equal(actual.isError, true);
  assert.deepEqual(actual.structuredContent, await invoke(request(root, base)));
  assert.equal(actual.structuredContent.data.verdicts[0]['next-action'], 'repair-evidence');
  const denied = await client.callTool({ name: 'record_preflight', arguments: { ...base, log: true } });
  assert.equal(denied.isError, true);
});
