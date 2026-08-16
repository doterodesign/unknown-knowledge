// KK-23 / UCS-1157: /kb-build — the sole knowledge write path (PRD §3.2,
// D-019 naming), rewritten as THIN ORCHESTRATION over engine commands.
//
// A structural pin in the KK-20/KK-21 pattern, deliberately not
// prose-brittle. What it protects, beyond the original ship-path and
// step-order checks: every mechanical step names the engine command that
// performs it, the judgment fills are declared and are the only free-form
// work, and the notation-lifecycle vocabulary the accession inversion
// retired is GONE — asserted by its ABSENCE, because a dead instruction
// that survives a migration is worse than one never written: agents obey it.
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

const STEPS = ['CLASSIFY', 'CITE', 'FACET', 'DRAFT', 'VALIDATE'];

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
  // Standing room is never authoritative (§3.2 cross-reference semantics).
  assert.match(doc, /standing room/);
  // The human gate: knowledge writes are human-gated, drafts ride a PR.
  assert.match(doc, /agents draft; humans approve/);
  // Capture content policy rides the gap parking (§3.4).
  assert.match(doc, /never verbatim user text/);
});

// ---------------------------------------------------------------- UCS-1157
// AC1: thin orchestration. Every mechanical step names the command that
// performs it; the judgment fills are the only free-form steps.

test('the skill declares itself thin orchestration over the engine', () => {
  assert.match(doc, /##\s+This skill is thin orchestration/);
  // The commands compute; the skill sequences them and rides exit codes.
  assert.match(doc, /The commands compute; this skill sequences them and stops\s+on their exit\s*\n?\s*codes\./);
  // The mechanism, not obedience — the ticket's whole thesis.
  assert.match(doc, /\*\*Protocol compliance is a property of the mechanism, not\s+of\s*\n?\s*agent obedience\*\*/);
});

test('the three judgment fills are named, and named as the ONLY free-form work', () => {
  assert.match(doc, /judgment fills?\*{0,2}, and they are the\s+only free-form work/);
  for (const fill of [/\*\*Prose bodies\*\*/, /\*\*Candidate confirmation\*\*/, /\*\*Mint proposals with warrant evidence\*\*/]) {
    assert.match(doc, fill);
  }
  // And what is explicitly NOT discretionary — the engine's half.
  assert.match(doc, /Everything else[^.]*is\s+the engine's/);
});

test('every mechanical step names the engine command that performs it', () => {
  // One section per step, sliced at the ### headings, each pinned to the
  // surface it delegates to. A step that stopped naming its command would
  // be a step an agent performs by hand again.
  const sections = Object.fromEntries(
    [...doc.matchAll(/^### \d\. ([A-Z]+)[\s\S]*?(?=^### \d\.|^## |$(?![\s\S]))/gm)].map((m) => [m[1], m[0]]),
  );
  assert.deepEqual(Object.keys(sections), STEPS);
  assert.match(sections.CLASSIFY, /engine\/resolve\.js/);
  assert.match(sections.CITE, /engine\/log-entry\.js/);
  assert.match(sections.FACET, /_registries\//);
  assert.match(sections.DRAFT, /validate\.js/);
  assert.match(sections.VALIDATE, /engine\/validate\.js/);
});

test('FACET fills the governed facets from the registries, and never invents a value', () => {
  assert.match(doc, /every value must already be\s*\n?\s*\*{0,2}minted in its registry/);
  // The four facets, each pointed at its registry file.
  for (const registry of ['domains.yaml', 'form.yaml', 'anchor.yaml', 'stage.yaml']) {
    assert.match(doc, new RegExp(`_registries/${registry.replace('.', '\\.')}`));
  }
  // The refusal is the mechanism's, not the agent's restraint.
  assert.match(doc, /unregistered-value/);
  assert.match(doc, /If no minted value fits, that is the signal to propose a minting, not to\s*\n?\s*invent a spelling/);
  // A mint carries literary warrant — evidence, never intention.
  assert.match(doc, /\*\*literary\s*\n?\s*warrant\*\*/);
  assert.match(doc, /speculative shelving/);
});

test('entries enter at DRAFT stage — where the moderation pipeline picks them up', () => {
  assert.match(doc, /start at \*\*`draft`\*\*/);
  assert.match(doc, /Every agent-authored entry enters at\s+draft stage/);
  // And promotion is never the author's act.
  assert.match(doc, /never the author's/);
});

test('the accession is minted as identity — opaque, sequence-drawn, non-positional', () => {
  assert.match(doc, /\*\*required on every leaf\*\*, opaque,\s*\n?\s*never reused, never positional/);
  assert.match(doc, /Mint the next value in the sequence/);
  // The inversion's payoff, stated: refiling breaks no citation.
  assert.match(doc, /refiling the leaf later leaves\s*\n?\s*it untouched and breaks no citation/);
});

// AC1 (the negative half): the notation-lifecycle prose is GONE. These are
// absence assertions on purpose — the migration is only complete when the
// dead instructions cannot be read out of the file and followed.
test('the retired notation-lifecycle instructions are ABSENT from the skill', () => {
  const dead = [
    [/next free notation/i, 'mint-the-next-free-notation'],
    [/new leaf plus a? ?`?class-elsewhere`? redirect/i, 'move-is-a-new-leaf-plus-redirect'],
    [/never a rename in place/i, 'the rename-in-place prohibition (a notation-lifecycle rule)'],
    [/bump `?edition`?/i, 'per-revision edition bumps'],
    [/`notation`\*{0,2}\s+—\s+OPTIONAL/i, 'the notation field walkthrough'],
    [/division/i, 'the domain/division spine (divisions were a positional slot)'],
  ];
  for (const [pattern, what] of dead) {
    assert.doesNotMatch(doc, pattern,
      `the rewritten skill still carries ${what} — notation-lifecycle prose an agent would obey`);
  }
});

test('the engine gate is exit-code honest: done only on a green run, exit 2 stops', () => {
  assert.match(doc, /\*\*Exit 0\*\*/);
  assert.match(doc, /\*\*Exit 2\*\* — \*\*stop/);
  assert.match(doc, /a check that never ran is a blocking\s+defect, never a silent pass/);
  // A verdict is per-run, never carried (D-011).
  assert.match(doc, /per-run, never carried/);
});

test('the skill points at the hooks that run its gates mechanically', () => {
  assert.match(doc, /hooks\/pre-commit/);
  assert.match(doc, /hooks\/reverse-lookup/);
  // And says what the hooks do with the engine's verdict.
  assert.match(doc, /propagate\s*\n?\s*the engine's exit codes unchanged/);
});

// Both the skill and its A5 walkthrough must cite runnable engine commands:
// resolve (classification probe + reverse lookup), log-entry (gap parking),
// and validate (the re-run gate) — a stale flag would strand a kb-build
// session.
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

// AC3: the walkthrough mirrors the skill step-for-step. A walkthrough that
// drifted from the skill's shape stops being a test OF the skill.
test('the A5 walkthrough mirrors the rewritten skill step-for-step', () => {
  const headings = [...walkthrough.matchAll(/^## (\d)\. ([A-Z]+)\b/gm)];
  assert.deepEqual(headings.map((m) => m[2]), STEPS,
    'the walkthrough must walk the same five steps, in the same order, as the skill');
  assert.deepEqual(headings.map((m) => Number(m[1])), [1, 2, 3, 4, 5]);
});

test('the A5 walkthrough carries the draft-stage entry and the registry fill', () => {
  assert.match(walkthrough, /stage: draft/);
  assert.match(walkthrough, /_registries\//);
});
