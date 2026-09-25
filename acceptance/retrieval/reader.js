// Test-only agent evaluation harness (UCS-1580): one fresh reader, one task.
//
// A reader is a headless Claude Code session started in a private copy of the
// installation, with the task prompt and nothing else from this repository or
// its user: no user settings, memory, hooks, plugins or MCP servers, and no web
// or sub-agent tools. It follows the installation's own AGENTS.md. The harness
// records every tool call, the bytes each returned, tokens, cost, time and the
// final answer as one trace file.
//
// Usage:
//   node acceptance/retrieval/reader.js --root <installation dir> --prompt-file <file>
//        --model <model id> --out <trace.json> [--budget-usd 2] [--timeout-s 900]
//
// --root is one installation, or a directory whose subdirectories are the
// installations of a multi-installation task (the holding company).
// The claude CLI must be signed in (`claude auth status`).
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Engine commands and plain reads only. Readers never edit files: a finding
// goes through log-entry.js, which is a node command.
const ALLOWED = ['Read', 'Grep', 'Glob', 'Bash(node:*)', 'Bash(cat:*)', 'Bash(ls:*)', 'Bash(grep:*)',
  'Bash(head:*)', 'Bash(tail:*)', 'Bash(sed:*)', 'Bash(find:*)', 'Bash(wc:*)'];
const DENIED = ['Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent', 'Task', 'Skill'];
// The only tools that exist in a reader session; everything else is absent.
const TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The installations under a task root: the root itself, or its children. */
export function installationsOf(root) {
  if (existsSync(join(root, 'AGENTS.md'))) return [{ name: basename(root), dir: '.' }];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'AGENTS.md')))
    .map((e) => ({ name: e.name, dir: e.name }));
}

/** The exact text a reader receives. Same wording for every runtime. */
export function readerPrompt(question, installations) {
  const where = installations.length === 1
    ? 'This repository has a knowledge base. Read AGENTS.md first and follow its runtime loop.'
    : `This directory holds ${installations.length} separate repositories, each with its own knowledge base: `
      + `${installations.map((i) => i.dir).join(', ')}. They are not one combined store. `
      + 'Read the AGENTS.md in each one you use and follow its runtime loop.';
  return `${where}\n\nAnswer this question from the knowledge base and the sources it points to. `
    + 'Cite the record IDs and source passages you relied on. If the knowledge base does not establish the answer, '
    + `say what is missing instead of guessing.\n\nQuestion: ${question}\n`;
}

const textOf = (content) => typeof content === 'string' ? content
  : Array.isArray(content) ? content.map((c) => c.text ?? (typeof c === 'string' ? c : JSON.stringify(c))).join('') : JSON.stringify(content ?? '');

/** Fold a stream-json transcript into a trace. Unknown event shapes are kept as counts. */
export function traceFromEvents(events) {
  const calls = new Map();
  const toolCalls = [];
  let init = null;
  let result = null;
  for (const event of events) {
    if (event.type === 'system' && event.subtype === 'init') init = event;
    if (event.type === 'assistant') {
      for (const part of event.message?.content ?? []) {
        if (part.type !== 'tool_use') continue;
        const call = { name: part.name, input: part.input, outputBytes: null, isError: null };
        calls.set(part.id, call);
        toolCalls.push(call);
      }
    }
    if (event.type === 'user') {
      for (const part of event.message?.content ?? []) {
        if (part.type !== 'tool_result' || !calls.has(part.tool_use_id)) continue;
        const call = calls.get(part.tool_use_id);
        call.outputBytes = Buffer.byteLength(textOf(part.content));
        call.isError = part.is_error === true;
      }
    }
    if (event.type === 'result') result = event;
  }
  return {
    model: init?.model ?? null,
    tools: init?.tools ?? null,
    mcpServers: init?.mcp_servers ?? null,
    toolCalls,
    toolOutputBytes: toolCalls.reduce((sum, c) => sum + (c.outputBytes ?? 0), 0),
    answer: result?.result ?? null,
    isError: result ? result.is_error === true : true,
    stopReason: result?.subtype ?? null,
    turns: result?.num_turns ?? null,
    durationMs: result?.duration_ms ?? null,
    costUsd: result?.total_cost_usd ?? null,
    usage: result?.usage ?? null,
  };
}

/**
 * Run one reader session on a private copy of `root`. Resolves to the trace;
 * never retries. A session that fails is recorded as failed.
 */
export async function runReader({ root, question, model, budgetUsd = 2, timeoutS = 900 }) {
  const scratch = mkdtempSync(join(tmpdir(), 'uk-reader-'));
  const work = join(scratch, 'work');
  cpSync(root, work, { recursive: true, verbatimSymlinks: true });
  const mcp = join(scratch, 'no-mcp.json');
  writeFileSync(mcp, '{"mcpServers":{}}\n');
  const installations = installationsOf(work);
  const prompt = readerPrompt(question, installations);
  const args = ['-p', prompt, '--model', model, '--output-format', 'stream-json', '--verbose',
    '--tools', TOOLS.join(','),
    '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', mcp,
    '--allowedTools', ALLOWED.join(','), '--disallowedTools', DENIED.join(','),
    '--max-budget-usd', String(budgetUsd), '--no-session-persistence'];
  const started = Date.now();
  const events = [];
  let stderr = '';
  const exit = await new Promise((resolve) => {
    const child = spawn('claude', args, { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) { try { events.push(JSON.parse(line)); } catch { events.push({ type: 'unparsed', line }); } }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutS * 1000);
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  rmSync(scratch, { recursive: true, force: true });
  return {
    version: 'reader-trace-1',
    question: { sha256: sha256(question) },
    prompt: { sha256: sha256(prompt), installations: installations.map((i) => i.name) },
    context: { settingSources: 'project', mcpServers: 'none', tools: TOOLS, allowedTools: ALLOWED, deniedTools: DENIED },
    requestedModel: model,
    exit,
    wallMs: Date.now() - started,
    stderr: stderr.slice(-4000),
    ...traceFromEvents(events),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const [root, promptFile, model, out] = ['root', 'prompt-file', 'model', 'out'].map((n) => arg(n));
  if (!root || !promptFile || !model || !out) {
    process.stderr.write('usage: reader.js --root <dir> --prompt-file <file> --model <id> --out <trace.json> [--budget-usd 2] [--timeout-s 900]\n');
    process.exit(2);
  }
  const trace = await runReader({ root, question: readFileSync(promptFile, 'utf8').trim(), model,
    budgetUsd: Number(arg('budget-usd', 2)), timeoutS: Number(arg('timeout-s', 900)) });
  writeFileSync(out, `${JSON.stringify(trace, null, 2)}\n`);
  process.stdout.write(`${out}: ${trace.isError ? 'FAILED' : 'answered'}; ${trace.toolCalls.length} tool calls, `
    + `${trace.toolOutputBytes} output bytes, ${trace.durationMs ?? trace.wallMs} ms, $${trace.costUsd ?? '?'}\n`);
}
