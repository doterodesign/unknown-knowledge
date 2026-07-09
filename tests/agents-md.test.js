// KK-20: AGENTS.md — the platform-agnostic navigation contract + runtime
// loop (PRD §7). A light STRUCTURAL pin, deliberately not prose-brittle:
// the doc exists in the payload, walks the five loop steps in order, never
// presents a gate as bypassable, and every engine command it cites names a
// real engine file using flags that engine file actually implements — a
// protocol doc citing a flag the engine dropped would send agents into
// exit-2 usage errors (a check that never ran, PRD §5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const agentsPath = join(root, 'payload', 'protocol', 'AGENTS.md');
const doc = readFileSync(agentsPath, 'utf8');
const walkthrough = readFileSync(join(root, 'acceptance', 'A5-agents-md-walkthrough.md'), 'utf8');

const LOOP = ['RESOLVE', 'PREFLIGHT', 'GATHER', 'ACT', 'RECORD'];

test('AGENTS.md ships in payload/protocol/ (PRD §9.1: protocol/AGENTS.md)', () => {
  assert.ok(statSync(agentsPath).isFile());
});

test('the five loop steps appear as sections, in loop order', () => {
  // The chain itself, verbatim, plus one numbered section heading per step.
  assert.ok(doc.includes('RESOLVE → PREFLIGHT → GATHER → ACT → RECORD'));
  const headings = [...doc.matchAll(/^### (\d)\. ([A-Z]+)\b/gm)];
  assert.deepEqual(headings.map((m) => m[2]), LOOP);
  assert.deepEqual(headings.map((m) => Number(m[1])), [1, 2, 3, 4, 5]);
});

test('the doc never tells the agent to bypass a gate', () => {
  // Every mention of bypassing/skipping a gate must be a prohibition — on
  // the same line, so a positive instruction cannot hide behind a distant
  // negation. Audit must stay advisory (the KK-27 governance invariant) and
  // verdict caching must stay forbidden (D-011).
  for (const line of doc.split('\n')) {
    if (/bypass|skip the/i.test(line)) {
      assert.match(line, /\b(never|not|do not|NOT)\b/i, `must be a prohibition: ${JSON.stringify(line)}`);
    }
  }
  assert.match(doc, /audit\.js[^.]*\badvisory\b/s, 'audit.js must be presented as advisory, never a gate');
  assert.match(doc, /never cache/i, 'verdict caching must be forbidden (D-011)');
});

test('conduct-on-verdict is marked client-editable with the D-011 default', () => {
  assert.match(doc, /CLIENT-EDITABLE/);
  assert.match(doc, /[Qq]uarantine-and-continue/);
  assert.match(doc, /D-011/);
});

test('the five capture triggers are cited with the schema vocabulary', () => {
  const triggers = ['correction', 'recurrence', 'retrieval-struggle', 'retrieval-miss', 'quarantine'];
  const schema = JSON.parse(readFileSync(join(root, 'payload', 'schemas', 'finding.schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.trigger.enum, triggers, 'trigger vocabulary moved — update AGENTS.md');
  for (const t of triggers) assert.ok(doc.includes(`\`${t}\``), `trigger ${t} missing from AGENTS.md`);
  assert.match(doc, /never verbatim user text/i, 'capture content policy missing');
});

// ---- every cited engine command is real: file exists, flags implemented ----

/** Fenced code blocks of a markdown doc. */
const codeBlocks = (md) => [...md.matchAll(/```(?:\w+)?\n([\s\S]*?)```/g)].map((m) => m[1]);

/** { file, flags[] } per `node …engine/<cli>.js …` command (continuations joined). */
function engineCommands(md) {
  const out = [];
  for (const block of codeBlocks(md)) {
    for (const cmd of block.replace(/\\\n/g, ' ').split('\n')) {
      const file = /node\s+"?\S*?engine\/([a-z-]+\.js)"?([^-\n][^\n]*?)?(?=--|$)/.exec(cmd);
      if (!file) continue;
      const flags = [...cmd.matchAll(/(--[a-z][a-z-]*)/g)].map((m) => m[1]);
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

for (const [name, md] of [['AGENTS.md', doc], ['A5 walkthrough', walkthrough]]) {
  test(`${name}: every engine command names a real engine file with implemented flags`, () => {
    const commands = engineCommands(md);
    assert.ok(commands.length >= 5, `${name} must cite engine commands in code blocks`);
    for (const { file, positionals, flags } of commands) {
      const enginePath = join(root, 'payload', 'engine', file);
      assert.ok(statSync(enginePath, { throwIfNoEntry: false })?.isFile(), `${file} is not a real engine CLI`);
      for (const flag of flags) {
        // Structural, through the public seam: hand the parser the flag and
        // let it judge. A dropped option answers "unknown flag"; a live one
        // answers anything else ("requires a value", a run, a store error).
        const r = spawnSync(process.execPath, [enginePath, ...positionals, flag], { encoding: 'utf8' });
        assert.ok(!/unknown flag|unexpected argument/.test(r.stderr), `${file} ${positionals.join(' ')} does not implement ${flag}:\n${r.stderr}`);
      }
    }
  });
}
