// Test-only: rebuild what a reader saw, for traces recorded before reader.js
// kept tool outputs. The engine is deterministic and readers could only read,
// so replaying their calls on a freshly built copy of the same installation
// gives the same outputs (checked by byte counts, on the policy-01 diagnosis).
// Only calls the reader was allowed to make are replayed; denied calls and
// Grep/Glob searches are marked, not rerun.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = /^(node|cat|ls|grep|head|tail|sed|find|wc)\b/;
const WORK = /\/uk-reader-[^/]+\/work(?=\/|$)/g;

/**
 * Fill `output` on every tool call of `trace` by replaying it under `root`,
 * the rebuilt task root. Returns the trace with `replayed: true`, and the share
 * of calls whose replayed byte count matches the recorded one.
 */
export function replayOutputs(trace, root) {
  let matched = 0;
  let compared = 0;
  const toolCalls = trace.toolCalls.map((call) => {
    if (call.isError) return { ...call, output: '(denied or failed in the session; not replayed)' };
    let output = null;
    if (call.name === 'Read' && typeof call.input?.file_path === 'string') {
      const path = call.input.file_path.replace(WORK, root);
      if (existsSync(path)) {
        const lines = readFileSync(path, 'utf8').split('\n');
        const start = Math.max(0, (call.input.offset ?? 1) - 1);
        output = lines.slice(start, call.input.limit ? start + call.input.limit : undefined).join('\n');
      }
    } else if (call.name === 'Bash' && typeof call.input?.command === 'string') {
      const command = call.input.command.replace(WORK, root);
      // One plain read command only: no chaining, pipes, redirects or substitutions
      // (quoted question text may contain '?' and '&', so only unquoted operators count).
      const unquoted = command.replace(/"[^"]*"|'[^']*'/g, '');
      if (ALLOWED.test(command.trim()) && !/[;&|<>`]|\$\(/.test(unquoted)) {
        const run = spawnSync('/bin/sh', ['-c', command], { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
        output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
        compared += 1;
        if (Math.abs(Buffer.byteLength(output) - (call.outputBytes ?? 0)) <= 2) matched += 1;
      }
    }
    return { ...call, output: output ?? '(not replayed)' };
  });
  return { ...trace, toolCalls, replayed: true, replayMatch: compared ? matched / compared : null };
}
