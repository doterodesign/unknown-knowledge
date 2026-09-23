import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { invoke } from '../payload/engine/api/index.js';
import { subjectReconsiderationConsumerFixture } from './helpers/subject-reconsideration-consumer-fixture.js';

function input(f, request) {
  return { request, operationLimits: f.operationLimits, evidence: {
    decisionCaptures: JSON.parse(readFileSync(f.files.decisions)),
    assessmentCaptures: JSON.parse(readFileSync(f.files.assessments)),
    materialCaptures: JSON.parse(readFileSync(f.files.materials)),
  } };
}
const envelope = (f, operation, input) => ({ interfaceVersion: 1, inputVersion: 1, operation, root: f.root, input });

test('API intersection routes preserve native results, order-independent matches and existing CLI output', async t => {
  const f = subjectReconsiderationConsumerFixture(t, { nested: true });
  const control = await invoke(envelope(f, 'subject.lookup', { text: 'Color' }));
  assert.equal(control.status, 'completed');
  const request = structuredClone(f.routeRequest);
  request.route.subjects = [f.subject, f.contextSubject];
  const queried = await invoke(envelope(f, 'subject.route', input(f, request)));
  assert.equal(queried.status, 'completed', JSON.stringify(queried));
  assert.equal(queried.data.result.status, 'complete');
  assert.deepEqual(queried.data.result.groups.knowledge.strict.map(row => row.ref.id), f.expectedIds);
  const reversed = structuredClone(request); reversed.route.subjects.reverse();
  const other = await invoke(envelope(f, 'subject.route', input(f, reversed)));
  assert.deepEqual(other.data.result.groups.knowledge.strict.map(row => row.ref.id), f.expectedIds);
  assert.deepEqual(other.data.result.route.subjects, reversed.route.subjects, 'preserve presentation order');
  const file = f.writeJson('interface-route.json', request);
  const cli = spawnSync(process.execPath, ['payload/engine/subject-view.js', '--mode', 'route', '--root', f.root,
    '--request', file, '--decision-captures', f.files.decisions, '--assessment-captures', f.files.assessments,
    '--material-captures', f.files.materials, '--operation-limits-json', JSON.stringify(f.operationLimits), '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(queried.data, JSON.parse(cli.stdout));
});

test('API context counts retain explicit coverage, original evidence and host capacities', async t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const base = input(f, f.contextsRequest);
  const counted = await invoke(envelope(f, 'subject.contexts', base));
  assert.equal(counted.status, 'completed', JSON.stringify(counted));
  assert.equal(counted.data.result.status, 'complete');
  assert.deepEqual(counted.data.result.contexts.map(row => row.subject), [f.contextSubject]);
  assert.equal(counted.data.result.contexts[0].counts.knowledge.strict, 1);
  const empty = structuredClone(base);
  empty.request.query.where = { op: 'and', args: [empty.request.query.where, { op: 'none' }] };
  const zero = await invoke(envelope(f, 'subject.contexts', empty));
  assert.equal(zero.data.result.status, 'complete');
  assert.equal(zero.data.result.contexts[0].counts.knowledge.strict, 0, 'keep observed zero counts');
  const partial = structuredClone(base); partial.request.contextBudgets.maxContexts = 0;
  const incomplete = await invoke(envelope(f, 'subject.contexts', partial));
  assert.equal(incomplete.status, 'completed'); assert.equal(incomplete.data.result.status, 'incomplete');
  assert.equal(incomplete.data.result.coverage.countsComplete, false);
  const missing = structuredClone(base); missing.evidence.materialCaptures = [];
  const unavailable = await invoke(envelope(f, 'subject.contexts', missing));
  assert.equal(unavailable.status, 'completed'); assert.equal(unavailable.data.result.status, 'refused');
  const oneShort = structuredClone(base); oneShort.operationLimits.validation.maxCaptureBytes--;
  assert.equal((await invoke(envelope(f, 'subject.contexts', oneShort))).status, 'refused');
  const duplicateWhere = input(f, structuredClone(f.routeRequest)); duplicateWhere.request.query.where = { op: 'none' };
  assert.equal((await invoke(envelope(f, 'subject.route', duplicateWhere))).status, 'refused');
  const mutation = { ...base, write: true };
  assert.equal((await invoke(envelope(f, 'subject.contexts', mutation))).status, 'refused');
  const recordFile = join(f.kitRoot, 'knowledge/K-000002.md');
  const lines = readFileSync(recordFile, 'utf8').split('\n'); const record = JSON.parse(lines[1]);
  delete record.subjects; lines[1] = JSON.stringify(record); writeFileSync(recordFile, lines.join('\n'));
  const unknown = await invoke(envelope(f, 'subject.contexts', base));
  assert.equal(unknown.status, 'completed'); assert.equal(unknown.data.result.status, 'incomplete');
  assert.equal(unknown.data.result.coverage.enumerationComplete, false, 'unclassified records leave the candidate universe open');
});

test('MCP route and context tools return API reports without dropping native request fields', { timeout: 15000 }, async t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const transport = new StdioClientTransport({ command: process.execPath, args: ['cli/mcp.js', '--root', f.root,
    '--max-message-bytes', '1048576', '--max-result-bytes', '1048576'], stderr: 'pipe' });
  const client = new Client({ name: 'interface-views-test', version: '1.0.0' });
  t.after(() => client.close()); await client.connect(transport);
  const resources = await client.listResources();
  assert.deepEqual(resources.resources.map(row => row.uri).sort(), [
    'unknown-knowledge://protocol/engine-interface', 'unknown-knowledge://protocol/intent-retrieval',
  ]);
  for (const name of ['engine-interface', 'intent-retrieval']) {
    const result = await client.readResource({ uri: `unknown-knowledge://protocol/${name}` });
    assert.equal(result.contents[0].mimeType, 'text/markdown');
    assert.equal(result.contents[0].text, readFileSync(new URL(`../payload/protocol/${name}.md`, import.meta.url), 'utf8'));
  }
  await assert.rejects(client.readResource({ uri: 'unknown-knowledge://protocol/../../package.json' }));
  for (const [operation, request] of [['subject.route', f.routeRequest], ['subject.contexts', f.contextsRequest]]) {
    const args = input(f, request);
    const result = await client.callTool({ name: operation.replace('.', '_'), arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.deepEqual(result.structuredContent, await invoke(envelope(f, operation, args)));
    const malformed = structuredClone(args);
    Object.defineProperty(malformed.request, '__proto__', { value: null, enumerable: true });
    const denied = await client.callTool({ name: operation.replace('.', '_'), arguments: malformed });
    assert.equal(denied.isError, true);
    assert.deepEqual(denied.structuredContent, await invoke(envelope(f, operation, malformed)));
  }
});

test('MCP documentation reads enforce exact complete-payload capacity', { timeout: 15000 }, async t => {
  const f = subjectReconsiderationConsumerFixture(t);
  const uri = 'unknown-knowledge://protocol/engine-interface';
  const expected = { contents: [{ uri, mimeType: 'text/markdown',
    text: readFileSync(new URL('../payload/protocol/engine-interface.md', import.meta.url), 'utf8') }] };
  const size = Buffer.byteLength(JSON.stringify(expected));
  for (const capacity of [size, size - 1]) {
    const transport = new StdioClientTransport({ command: process.execPath, args: ['cli/mcp.js', '--root', f.root,
      '--max-message-bytes', '1048576', '--max-result-bytes', String(capacity)], stderr: 'pipe' });
    const client = new Client({ name: 'interface-resource-capacity-test', version: '1.0.0' });
    t.after(() => client.close()); await client.connect(transport);
    if (capacity === size) assert.deepEqual(await client.readResource({ uri }), expected);
    else await assert.rejects(client.readResource({ uri }), /max-result-bytes/);
    await client.close();
  }
});
