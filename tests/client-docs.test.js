// KK-24 structural pin: the client-facing docs SHIP IN THE PAYLOAD. Files
// must exist under payload/docs/, be manifest-listed at their seeded targets
// (the D-007 coverage rule: nothing ships by omission, nothing rots
// unshipped), cite only real engine commands (shared probe with the
// AGENTS.md/skill pins — a doc citing a dropped flag sends readers into
// exit-2 usage errors, a check that never ran), and carry the two
// client-facing guarantees verbatim enough to grep: the D-008 honest
// boundary and the D-014 no-code-execution guarantee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, expandManifest } from '../cli/lib/copy-payload.js';
import { assertRealEngineCommands } from './lib/protocol-doc.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/** payload-relative source → seeded-root-relative target, per kit.manifest.yaml. */
const DOCS = {
  'docs/README.md': 'README.md',
  'docs/ci-wiring.md': 'docs/ci-wiring.md',
  'docs/steward-guide.md': 'docs/steward-guide.md',
  'docs/boundaries.md': 'docs/boundaries.md',
};

const read = (from) => readFileSync(join(root, 'payload', from), 'utf8');

test('client docs exist in payload/docs/ and the manifest ships each at its seeded target', () => {
  const manifest = loadManifest(root);
  // Docs are unconditional: they must ship for every stack selection,
  // including config-only (no stacks).
  const byFrom = new Map(expandManifest(manifest, [])
    .map(({ from, to }) => [relative(join(root, 'payload'), from), to]));
  for (const [from, to] of Object.entries(DOCS)) {
    assert.equal(byFrom.get(from), to, `${from} must be manifest-listed with target ${to} (D-007)`);
  }
});

test('every engine command the client docs cite is a real CLI with real flags', () => {
  // boundaries.md is deliberately command-free (AGENTS.md is the single
  // source of truth for conduct commands); the other three teach commands.
  const minCommands = { 'docs/boundaries.md': 0 };
  for (const from of Object.keys(DOCS)) {
    assertRealEngineCommands(root, from, read(from), { minCommands: minCommands[from] ?? 1 });
  }
});

test('the honest boundary (D-008) and the no-code-execution guarantee (D-014) ship', () => {
  const boundaries = read('docs/boundaries.md');
  assert.match(boundaries, /D-008/, 'boundaries doc must name D-008');
  assert.match(boundaries, /behavioral drift/i, 'boundaries doc must name the class it does not catch');
  assert.match(boundaries, /never.*catch|catch.*never/is, 'the boundary must say what the kit will never catch');
  assert.match(boundaries, /D-014/, 'boundaries doc must name D-014');
  assert.match(boundaries, /never (executes|imports)/i, 'the no-code-execution guarantee must be stated');
  assert.match(boundaries, /D-011/, 'the preflight policy note must name D-011');
  assert.match(read('docs/README.md'), /uninstall/i, 'the seeded README carries the uninstall paragraph');
});
