// UCS-1580: the reader harness's pure parts, without starting a session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readerPrompt, traceFromEvents } from '../acceptance/retrieval/reader.js';
import { VERDICTS, CRITICAL } from '../acceptance/retrieval/grade.js';

test('a stream-json transcript folds into tool calls, output bytes and the answer', () => {
  const trace = traceFromEvents([
    { type: 'system', subtype: 'init', model: 'claude-sonnet-5', tools: ['Bash', 'Read'], mcp_servers: [] },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'node ask.js q' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'héllo' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: 'x' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'abc' }], is_error: true }] } },
    { type: 'result', subtype: 'success', result: 'answer', is_error: false, num_turns: 3, duration_ms: 10, total_cost_usd: 0.01 },
  ]);
  assert.deepEqual(trace.toolCalls.map((c) => [c.name, c.outputBytes, c.isError]), [['Bash', 6, false], ['Read', 3, true]]);
  assert.equal(trace.toolOutputBytes, 9);
  assert.equal(trace.answer, 'answer');
  assert.equal(trace.isError, false);
  assert.deepEqual(trace.tools, ['Bash', 'Read']);
});

test('a transcript with no result event is an error', () => {
  assert.equal(traceFromEvents([]).isError, true);
});

test('the reader prompt is the same for both runtimes and never merges installations', () => {
  const one = readerPrompt('Q?', [{ name: 'a', dir: '.' }]);
  assert.match(one, /Read AGENTS\.md first/);
  assert.match(one, /Question: Q\?/);
  const many = readerPrompt('Q?', [{ name: 'a', dir: 'a' }, { name: 'b', dir: 'b' }]);
  assert.match(many, /2 separate repositories/);
  assert.match(many, /not one combined store/);
});

test('the grader verdicts and critical flags are a closed set', () => {
  assert.deepEqual(VERDICTS, ['completed', 'correct-abstention', 'failed']);
  assert.deepEqual(CRITICAL, ['unsupported-claim', 'answered-unanswerable', 'scope-violation', 'fabricated-citation']);
});
