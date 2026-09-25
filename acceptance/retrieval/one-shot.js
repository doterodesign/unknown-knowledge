// Test-only: the single-call answer path, for cost comparison (System One).
//
// Instead of an agent session that reads the protocol and explores, code runs
// `ask`, gathers the returned records (at most eight) and the source passages
// they point to, and makes ONE model call with no tools and a minimal system
// prompt: answer from these records, cite IDs, or say what is missing. The
// trace has the same shape as reader.js, so grade.js can score it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

const SYSTEM = 'You answer questions only from the knowledge-base records given. Cite the record IDs you rely on. '
  + 'If the records do not establish the answer, say what is missing instead of guessing. Answer in at most 150 words.';

/** A `## heading` section of a Markdown source, or null. */
function section(text, heading) {
  const marker = `## ${heading}\n`;
  const start = text.indexOf(marker);
  return start < 0 ? null : text.slice(start + marker.length).split('\n## ')[0].trim();
}

/** The record's own entry plus the source passages it points at, as plain text. */
function recordText(root, record) {
  const kit = join(root, 'unknown-knowledge');
  const file = join(kit, record.file);
  let entry;
  if (record.file.endsWith('.md')) entry = readFileSync(file, 'utf8');
  else {
    const doc = load(readFileSync(file, 'utf8'));
    entry = JSON.stringify((doc.entries ?? []).find((e) => e.id === record.id) ?? doc, null, 1);
  }
  const passages = [];
  for (const [, path, heading] of entry.matchAll(/(sources\/[\w./-]+\.md)#([\w-]+)/g)) {
    const source = join(root, path);
    if (existsSync(source)) {
      const text = section(readFileSync(source, 'utf8'), heading);
      if (text) passages.push(`${path}#${heading}:\n${text}`);
    }
  }
  return `### ${record.id} (${record.kind}, ${record.status ?? 'no status'})\n${entry.trim()}\n${[...new Set(passages)].join('\n\n')}`;
}

/**
 * Answer one question over one or more installations with one model call.
 * @returns a reader.js-shaped trace plus `askMs`, `promptBytes`
 */
export function answerOnce({ roots, question, model }) {
  const started = Date.now();
  const blocks = [];
  let askMs = 0;
  for (const root of roots) {
    const t = Date.now();
    const ask = spawnSync(process.execPath, [join(root, 'unknown-knowledge/engine/ask.js'), '--root', root, '--json', question], { encoding: 'utf8' });
    askMs += Date.now() - t;
    const payload = JSON.parse(ask.stdout);
    const label = roots.length > 1 ? `Repository ${root.split('/').at(-1)} (separate; not combined with the others)` : 'Knowledge base';
    blocks.push(`## ${label}\nRetrieval tier: ${payload.confidence.tier}\n\n${payload.records.map((r) => recordText(root, r)).join('\n\n')}`);
  }
  const prompt = `${blocks.join('\n\n')}\n\nQuestion: ${question}\n`;
  const call = spawnSync('claude', ['-p', prompt, '--model', model, '--system-prompt', SYSTEM, '--tools', '',
    '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence',
    '--output-format', 'json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 300_000 });
  let result = null;
  try { result = JSON.parse(call.stdout); } catch { result = null; }
  return {
    version: 'one-shot-trace-1', requestedModel: model, toolCalls: [], toolOutputBytes: 0,
    promptBytes: Buffer.byteLength(prompt) + Buffer.byteLength(SYSTEM), askMs, evidence: blocks.join('\n\n'),
    answer: result?.result ?? null, isError: !result || result.is_error === true,
    durationMs: result?.duration_ms ?? null, wallMs: Date.now() - started,
    costUsd: result?.total_cost_usd ?? null, usage: result?.usage ?? null,
  };
}
