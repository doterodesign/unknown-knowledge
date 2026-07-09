// Shared structural-pin helpers for protocol prose (KK-20/KK-21): protocol
// docs and skills are markdown, but the engine commands they cite must stay
// real — a doc citing a flag the engine dropped would send agents into
// exit-2 usage errors (a check that never ran, PRD §5). Both the AGENTS.md
// pin and the skill pins import this one probe so the checks cannot drift
// apart.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

/** Fenced code blocks of a markdown doc. */
export const codeBlocks = (md) => [...md.matchAll(/```(?:\w+)?\n([\s\S]*?)```/g)].map((m) => m[1]);

/** { file, positionals[], flags[] } per `node …engine/<cli>.js …` command (continuations joined). */
export function engineCommands(md) {
  const out = [];
  for (const block of codeBlocks(md)) {
    for (const cmd of block.replace(/\\\n/g, ' ').split('\n')) {
      const file = /node\s+"?\S*?engine\/([a-z-]+\.js)"?([^-\n][^\n]*?)?(?=--|$)/.exec(cmd);
      if (!file) continue;
      // Flags OUTSIDE quotes only. A `--reason 'validate-values --concepts K-120
      // ran green'` cites a flag of another command inside its own argument;
      // scraping it would probe log-entry for a flag nobody claimed it has.
      const unquoted = cmd.replace(/'[^']*'|"[^"]*"/g, ' ');
      const flags = [...unquoted.matchAll(/(--[a-z][a-z-]*)/g)].map((m) => m[1]);
      // The full positional tail (subcommands, query terms) rides along so
      // the probe replays the cited command shape, not a truncation of it —
      // log-entry.js needs its subcommand; resolve.js its query terms.
      const positionals = (file[2] ?? '').trim().split(/\s+/).filter(Boolean)
        .map((tok) => tok.replace(/^["']|["']$/g, ''));
      out.push({ file: file[1], positionals, flags });
    }
  }
  return out;
}

/**
 * Assert every engine command a doc cites names a real payload/engine CLI
 * and only flags that CLI implements. Structural, through the public seam:
 * hand the parser the flag and let it judge. A dropped option answers
 * "unknown flag"; a live one answers anything else ("requires a value", a
 * run, a store error).
 */
export function assertRealEngineCommands(root, name, md, { minCommands = 1 } = {}) {
  const commands = engineCommands(md);
  assert.ok(commands.length >= minCommands, `${name} must cite at least ${minCommands} engine command(s) in code blocks`);
  for (const { file, positionals, flags } of commands) {
    const enginePath = join(root, 'payload', 'engine', file);
    assert.ok(statSync(enginePath, { throwIfNoEntry: false })?.isFile(), `${file} is not a real engine CLI`);
    for (const flag of flags) {
      const r = spawnSync(process.execPath, [enginePath, ...positionals, flag], { encoding: 'utf8' });
      assert.ok(!/unknown flag|unknown argument|unexpected argument/.test(r.stderr),
        `${file} ${positionals.join(' ')} does not implement ${flag}:\n${r.stderr}`);
    }
  }
}
