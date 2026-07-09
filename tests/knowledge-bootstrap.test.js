// KK-21: /knowledge-bootstrap — the phase-2 store-population skill (PRD §6,
// D-019 naming). A light STRUCTURAL pin in the KK-20 pattern, deliberately
// not prose-brittle: the skill ships at the §9.1 path, walks the six steps
// in order, carries the load-bearing rules verbatim (not-exhaustive,
// folder-vs-file, no-raw-traversal, D-005), encodes resume semantics per
// step, and every engine command it cites names a real engine file using
// flags that engine file actually implements (probe shared with the
// AGENTS.md pin — tests/lib/protocol-doc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRealEngineCommands } from './lib/protocol-doc.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillPath = join(root, 'payload', 'protocol', 'skills', 'knowledge-bootstrap.md');
const doc = readFileSync(skillPath, 'utf8');
const walkthrough = readFileSync(join(root, 'acceptance', 'A5-knowledge-bootstrap-walkthrough.md'), 'utf8');

const STEPS = ['SURVEY', 'GATE', 'EMIT', 'MISS', 'INTERVIEW', 'FINISH'];

test('the skill ships at the §9.1 path (protocol/skills/knowledge-bootstrap.md, D-019 naming)', () => {
  assert.ok(statSync(skillPath).isFile());
});

test('the six §6 steps appear as sections, in order', () => {
  const headings = [...doc.matchAll(/^### (\d)\. ([A-Z]+)\b/gm)];
  assert.deepEqual(headings.map((m) => m[2]), STEPS);
  assert.deepEqual(headings.map((m) => Number(m[1])), [1, 2, 3, 4, 5, 6]);
});

test('the load-bearing rules are present verbatim', () => {
  // SURVEY: the map is the traversal surface.
  assert.match(doc, /[Rr]aw repo traversal is a protocol violation/);
  // EMIT: the pointer rule and the not-exhaustive discipline.
  assert.match(doc, /point at a folder for identity, at a file for facts/);
  assert.match(doc, /an ontology born complete is born wrong/i);
  // MISS: bootstrap never wires a session-authored parser (D-005).
  assert.match(doc, /never wired into the validator in the same\s+session/);
  assert.match(doc, /D-005/);
  // INTERVIEW: kb-build is the sole knowledge write path; leaves need citations.
  assert.match(doc, /kb-build\s+skill \(the sole write path\)/);
  assert.match(doc, /every leaf requires citations/);
});

test('the gate is ONE combined scope+taxonomy review that writes survey-scope.yaml', () => {
  assert.match(doc, /ONE human gate/);
  assert.ok(doc.includes('`survey-scope.yaml`'));
  assert.match(doc, /honor-it contract/);
  // Widening is findings-driven, never a second gate.
  assert.match(doc, /`retrieval-miss` findings/);
});

test('resume semantics are explicit: entry detection plus per-step rules', () => {
  assert.match(doc, /[Rr]esumable by construction/);
  assert.match(doc, /never re-litigated on resume/);
  assert.match(doc, /idempotent by anchor identity/);
  assert.match(doc, /never mint a sibling/);
  // Every numbered step carries its own on-resume instruction.
  const sections = doc.split(/^### \d\. /m).slice(1);
  assert.equal(sections.length, STEPS.length);
  for (const [i, section] of sections.entries()) {
    assert.match(section, /\*\*On resume/, `step ${STEPS[i]} is missing an "On resume" rule`);
  }
});

test('the engine gate is exit-code honest: green finish, exit 2 stops', () => {
  // Done is declared only on clean validators, and a check that never ran
  // (exit 2) is a stop, never a silent pass.
  assert.match(doc, /only.*when both\s+validators run clean/s);
  assert.match(doc, /[Ee]xit 2 = \*\*stop/);
});

// Both the skill and its A5 walkthrough must cite runnable engine commands:
// survey-map, validate, validate-values, resolve (idempotency probe), and
// log-entry (miss-log) — a stale flag would strand a bootstrap session.
for (const [name, md, min] of [
  ['knowledge-bootstrap skill', doc, 5],
  ['A5 bootstrap walkthrough', walkthrough, 5],
]) {
  test(`${name}: every engine command names a real engine file with implemented flags`, () => {
    assertRealEngineCommands(root, name, md, { minCommands: min });
  });
}

test('the A5 walkthrough is registered in the acceptance README index', () => {
  const readme = readFileSync(join(root, 'acceptance', 'README.md'), 'utf8');
  assert.ok(readme.includes('A5-knowledge-bootstrap-walkthrough.md'));
});
