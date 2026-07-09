// KK-23: /knowledge-audit — the on-demand health check (PRD §8, D-019
// naming). A light STRUCTURAL pin in the KK-20/KK-21 pattern, deliberately
// not prose-brittle: the skill ships at the §9.1 path AND through the D-007
// manifest, walks the seven steps in order, keeps the reverse audit advisory
// (never blocking — the KK-27 governance sweep covers payload/ line-level;
// this pin holds the framing itself), specifies the fixed report shape, and
// carries the §8 heartbeat with graceful degradation when no reflect has
// stamped last-reflect yet. Every engine command it cites names a real
// engine file using flags that engine file actually implements (probe
// shared with the AGENTS.md pin — tests/lib/protocol-doc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRealEngineCommands } from './lib/protocol-doc.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillPath = join(root, 'payload', 'protocol', 'skills', 'knowledge-audit.md');
const doc = readFileSync(skillPath, 'utf8');
const walkthrough = readFileSync(join(root, 'acceptance', 'A5-knowledge-audit-walkthrough.md'), 'utf8');

const STEPS = ['STRUCTURE', 'VALUES', 'REVERSE', 'KNOWLEDGE', 'DECISIONS', 'HEARTBEAT', 'REPORT'];

test('the skill ships at the §9.1 path (protocol/skills/knowledge-audit.md, D-019 naming)', () => {
  assert.ok(statSync(skillPath).isFile());
});

test('the skill ships through the D-007 manifest (a file the manifest does not name is never copied)', () => {
  const manifest = readFileSync(join(root, 'cli', 'kit.manifest.yaml'), 'utf8');
  assert.match(manifest, /from: protocol\/skills\/knowledge-audit\.md, to: protocol\/skills\/knowledge-audit\.md/);
});

test('the seven steps appear as sections, in order', () => {
  const headings = [...doc.matchAll(/^### (\d)\. ([A-Z]+)\b/gm)];
  assert.deepEqual(headings.map((m) => m[2]), STEPS);
  assert.deepEqual(headings.map((m) => Number(m[1])), [1, 2, 3, 4, 5, 6, 7]);
});

test('the load-bearing rules are present verbatim', () => {
  // The audit reports and routes; it never mutates stores.
  assert.match(doc, /\*\*read-only\*\*/);
  // Reverse audit framing: advisory (never blocking), proposal-first.
  assert.match(doc, /advisory \(never blocking\)/);
  assert.match(doc, /proposal-first/);
  // --fail-on-findings stays a human opt-in (KK-27 framing).
  assert.match(doc, /`--fail-on-findings` stays a human opt-in — never a CI\s+default/);
  // Exit-2 honesty: recorded as such, never presented as a pass.
  assert.match(doc, /CHECK NEVER RAN/);
  assert.match(doc, /a check that never ran is a blocking defect, never a silent pass/);
  // Dates are injected, never wall-clock.
  assert.match(doc, /injected, never wall-clock/);
});

test('the §8 heartbeat is specified with graceful degradation', () => {
  // All three §8 instruments.
  assert.match(doc, /[Dd]ays since last reflect/);
  assert.match(doc, /[Oo]pen fragments per log/i);
  assert.match(doc, /[Tt]op-N quarantined concepts/);
  // The last-reflect stamp is KK-22's; absent must degrade gracefully.
  assert.match(doc, /last-reflect/);
  assert.match(doc, /no reflect has run yet/);
  // A lapsed steward rotation is visible, never silent.
  assert.match(doc, /visible, never silent/);
});

test('the report shape is fixed: sections named, in order, none skippable', () => {
  const report = /## Verdicts[\s\S]*## Structural findings[\s\S]*## Value findings[\s\S]*## Reverse audit proposals[\s\S]*## Knowledge leaves[\s\S]*## Decisions lifecycle[\s\S]*## Heartbeat/;
  assert.match(doc, report, 'the skill must specify the report sections in order');
  assert.match(walkthrough, report, 'the walkthrough must show the filled report in the same order');
  assert.match(doc, /every section present even\s+when empty/);
});

test('the decisions lifecycle check covers aging and orphaned relates-to', () => {
  assert.match(doc, /aging `proposed`/);
  assert.match(doc, /aging `accepted`/);
  assert.match(doc, /[Oo]rphaned `relates-to`/);
});

// Both the skill and its A5 walkthrough must cite runnable engine commands:
// validate, validate-values, audit (with --today so the stale check runs) —
// a stale flag would strand an audit session.
for (const [name, md, min] of [
  ['knowledge-audit skill', doc, 3],
  ['A5 knowledge-audit walkthrough', walkthrough, 3],
]) {
  test(`${name}: every engine command names a real engine file with implemented flags`, () => {
    assertRealEngineCommands(root, name, md, { minCommands: min });
  });
}

test('the A5 walkthrough is registered in the acceptance README index', () => {
  const readme = readFileSync(join(root, 'acceptance', 'README.md'), 'utf8');
  assert.ok(readme.includes('A5-knowledge-audit-walkthrough.md'));
});

test('the A5 walkthrough shows the heartbeat with seeded state and the graceful absence line', () => {
  assert.match(walkthrough, /no reflect has run yet/);
  assert.match(walkthrough, /open fragments: findings 2, misses 1, gaps 0/);
  assert.match(walkthrough, /top quarantined concepts: K-108 \(1\)/);
});
