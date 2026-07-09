// KK-23: /kb-build — the sole knowledge write path (PRD §3.2, D-019 naming).
// A light STRUCTURAL pin in the KK-20/KK-21 pattern, deliberately not
// prose-brittle: the skill ships at the §9.1 path AND through the D-007
// manifest, walks the five steps in order, carries the load-bearing rules
// verbatim (citations-required, sole-write-path, gap-log parking,
// notation-immutable, human gate), and every engine command it cites names
// a real engine file using flags that engine file actually implements
// (probe shared with the AGENTS.md pin — tests/lib/protocol-doc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRealEngineCommands } from './lib/protocol-doc.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillPath = join(root, 'payload', 'protocol', 'skills', 'kb-build.md');
const doc = readFileSync(skillPath, 'utf8');
const walkthrough = readFileSync(join(root, 'acceptance', 'A5-kb-build-walkthrough.md'), 'utf8');

const STEPS = ['CLASSIFY', 'CITE', 'DRAFT', 'INDEX', 'VALIDATE'];

test('the skill ships at the §9.1 path (protocol/skills/kb-build.md, D-019 keeps the name)', () => {
  assert.ok(statSync(skillPath).isFile());
});

test('the skill ships through the D-007 manifest (a file the manifest does not name is never copied)', () => {
  const manifest = readFileSync(join(root, 'cli', 'kit.manifest.yaml'), 'utf8');
  assert.match(manifest, /from: protocol\/skills\/kb-build\.md, to: protocol\/skills\/kb-build\.md/);
});

test('the five steps appear as sections, in order', () => {
  const headings = [...doc.matchAll(/^### (\d)\. ([A-Z]+)\b/gm)];
  assert.deepEqual(headings.map((m) => m[2]), STEPS);
  assert.deepEqual(headings.map((m) => Number(m[1])), [1, 2, 3, 4, 5]);
});

test('the load-bearing rules are present verbatim', () => {
  // The leading rule, and its remedy: parking, never promotion.
  assert.match(doc, /an unsourced claim is not\s+promotable/i);
  assert.match(doc, /sole write path/);
  assert.match(doc, /parks as a gap-log entry/);
  // DRAFT: notation immutability and the redirect discipline (§3.5).
  assert.match(doc, /never a rename in place/);
  assert.match(doc, /class-elsewhere/);
  // Standing room is never authoritative (§3.2 cross-reference semantics).
  assert.match(doc, /standing room/);
  // The human gate: knowledge writes are human-gated, drafts ride a PR.
  assert.match(doc, /agents draft; humans approve/);
  // Capture content policy rides the gap parking (§3.4).
  assert.match(doc, /never verbatim user text/);
});

test('the engine gate is exit-code honest: done only on a green run, exit 2 stops', () => {
  assert.match(doc, /\*\*Exit 0\*\*/);
  assert.match(doc, /\*\*Exit 2\*\* — \*\*stop/);
  assert.match(doc, /a check that never ran is a blocking\s+defect, never a silent pass/);
  // A verdict is per-run, never carried (D-011).
  assert.match(doc, /per-run, never carried/);
});

// Both the skill and its A5 walkthrough must cite runnable engine commands:
// resolve (classification probe), log-entry (gap parking), and validate
// (the re-run gate) — a stale flag would strand a kb-build session.
for (const [name, md, min] of [
  ['kb-build skill', doc, 3],
  ['A5 kb-build walkthrough', walkthrough, 3],
]) {
  test(`${name}: every engine command names a real engine file with implemented flags`, () => {
    assertRealEngineCommands(root, name, md, { minCommands: min });
  });
}

test('the A5 walkthrough is registered in the acceptance README index', () => {
  const readme = readFileSync(join(root, 'acceptance', 'README.md'), 'utf8');
  assert.ok(readme.includes('A5-kb-build-walkthrough.md'));
});

test('the A5 walkthrough exercises the leading rule: an uncited claim parks, never promotes', () => {
  assert.match(walkthrough, /unsourced claim is not promotable/);
  assert.match(walkthrough, /--log gaps/);
});
