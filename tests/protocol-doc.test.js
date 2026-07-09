// The shared protocol-doc probe helpers (tests/lib/protocol-doc.js) carry
// the command-extraction logic every protocol-prose pin rides on — parsing
// bugs there would silently weaken the AGENTS.md and skill pins, so the
// parser gets direct coverage: fenced blocks, backslash continuations,
// quoted paths and positionals, multiple flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeBlocks, engineCommands } from './lib/protocol-doc.js';

test('codeBlocks: fenced blocks with and without a language tag, prose ignored', () => {
  const md = 'prose\n```sh\na\nb\n```\nmore prose\n```\nc\n```\n';
  assert.deepEqual(codeBlocks(md), ['a\nb\n', 'c\n']);
});

test('engineCommands: plain command with flags and no positionals', () => {
  const md = '```sh\nnode unknown-knowledge/engine/validate.js --concepts K-100,K-110 --root .\n```\n';
  const [cmd] = engineCommands(md);
  assert.deepEqual(cmd, { file: 'validate.js', positionals: [], flags: ['--concepts', '--root'] });
});

test('engineCommands: backslash continuations join into one command', () => {
  const md = '```sh\nnode "$KIT/engine/log-entry.js" create --log findings \\\n  --root unknown-knowledge \\\n  --entry \'{"trigger":"correction"}\'\n```\n';
  const [cmd] = engineCommands(md);
  assert.equal(cmd.file, 'log-entry.js');
  assert.deepEqual(cmd.positionals, ['create']);
  assert.deepEqual(cmd.flags, ['--log', '--root', '--entry']);
});

test('engineCommands: quoted engine path and multi-word positional query survive intact', () => {
  const md = '```sh\nnode "$KIT/engine/resolve.js" escrow refund window --root .\n```\n';
  const [cmd] = engineCommands(md);
  assert.equal(cmd.file, 'resolve.js');
  assert.deepEqual(cmd.positionals, ['escrow', 'refund', 'window']);
  assert.deepEqual(cmd.flags, ['--root']);
});

test('engineCommands: quoted positional tokens are unwrapped, non-command lines skipped', () => {
  const md = '```sh\n# a comment, not a command\nnode $KIT/engine/resolve.js "sport type" --json\necho not-an-engine-command\n```\n';
  const commands = engineCommands(md);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].positionals, ['sport', 'type']);
  assert.deepEqual(commands[0].flags, ['--json']);
});

test('engineCommands: one command per line, multiple commands per block', () => {
  const md = '```\nnode unknown-knowledge/engine/validate.js --root .\nnode unknown-knowledge/engine/validate-values.js --root .\n```\n';
  assert.deepEqual(engineCommands(md).map((c) => c.file), ['validate.js', 'validate-values.js']);
});
