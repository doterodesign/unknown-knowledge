// KK-22: /knowledge-reflect — the §8 consolidation skill (D-019 naming). A
// light STRUCTURAL pin in the KK-20/KK-21 pattern, deliberately not
// prose-brittle: the skill ships at the §9.1 path, walks the six steps in
// order, carries the load-bearing rules verbatim (evidence standard,
// re-open-not-duplicate, dispute-never-corroborates, the last-reflect stamp,
// archived-with-a-rollup-note), encodes resume semantics per step, ships
// through the manifest (D-007), and every engine command it cites names a
// real engine file using flags that engine file actually implements (probe
// shared with the AGENTS.md pin — tests/lib/protocol-doc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRealEngineCommands } from './lib/protocol-doc.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillPath = join(root, 'payload', 'protocol', 'skills', 'knowledge-reflect.md');
const doc = readFileSync(skillPath, 'utf8');
const walkthrough = readFileSync(join(root, 'acceptance', 'A5-knowledge-reflect-walkthrough.md'), 'utf8');

const STEPS = ['SWEEP', 'CLUSTER', 'RECOMMEND', 'GATE', 'APPLY', 'STAMP'];

test('the skill ships at the §9.1 path (protocol/skills/knowledge-reflect.md, D-019 naming)', () => {
  assert.ok(statSync(skillPath).isFile());
});

test('the skill ships through the manifest — a payload file the manifest does not name never reaches a client (D-007)', () => {
  const manifest = readFileSync(join(root, 'cli', 'kit.manifest.yaml'), 'utf8');
  assert.ok(manifest.includes('protocol/skills/knowledge-reflect.md'));
});

test('the six §8 steps appear as sections, in order', () => {
  const headings = [...doc.matchAll(/^### (\d)\. ([A-Z]+)\b/gm)];
  assert.deepEqual(headings.map((m) => m[2]), STEPS);
  assert.deepEqual(headings.map((m) => Number(m[1])), [1, 2, 3, 4, 5, 6]);
});

test('the evidence standard is carried verbatim', () => {
  assert.match(doc, /one\s+correction is a data point, three are a pattern/);
  assert.match(doc, /[Ss]ingle-occurrence noise never reaches the\s+review queue/);
  // Disputes cancel, never add.
  assert.match(doc, /[Aa] dispute never counts as corroboration/);
});

test('the lifecycle is the real log-entry.js contract: re-open-not-duplicate, reasoned rejection, green-before-resolved', () => {
  assert.match(doc, /re-open, not duplicate/);
  assert.match(doc, /never mint a sibling/);
  // Rejections record the reason (§8) — the helper refuses otherwise.
  assert.match(doc, /--to rejected/);
  assert.match(doc, /refuses a reasonless rejection/);
  // Resolution follows the green filtered re-run, never precedes it.
  assert.match(doc, /green first,\s+then the transition/);
  // Approval is per item, never bulk (§8).
  assert.match(doc, /approve \/ approve-with-modification \/\s*reject — never as a bulk yes/);
});

test('the close-the-loop is exit-code honest: a check that never ran is a blocking defect', () => {
  assert.match(doc, /a check that never ran is a blocking defect/i);
  assert.match(doc, /\*\*Exit 2\*\* — \*\*stop\.\*\*/);
});

test('the §8 hygiene rules: archived-with-a-rollup-note after N cycles; disputed resolved by reading the SSOT', () => {
  // Archival: N default documented and tunable; deletion + rollup, never a status.
  assert.match(doc, /default \*\*N = 3\*\*/);
  assert.match(doc, /`archived` is \*\*not a status\*\*/);
  assert.match(doc, /rollup/);
  // Disputed: a cluster flag, resolved at the source (the map is never the fact).
  assert.match(doc, /never a fragment status/);
  assert.match(doc, /[Rr]esolve by reading the SSOT/);
  assert.match(doc, /the map is never the fact/);
});

test('the last-reflect stamp: engine-readable, per-item approval outcome by category', () => {
  assert.ok(doc.includes('logs/last-reflect.yaml'));
  assert.match(doc, /outcomes:\s+# per-item approval outcome BY CATEGORY/);
  assert.match(doc, /days-since-last-reflect/);
  // The closed change-category vocabulary the graduation trigger measures.
  for (const category of ['concept-fix', 'alias-addition', 'ssot-repoint', 'scope-widen', 'knowledge-promotion', 'extractor-draft']) {
    assert.ok(doc.includes(category), `missing change category ${category}`);
  }
});

test('resume semantics are explicit: entry detection plus per-step rules', () => {
  assert.match(doc, /[Rr]esumable by construction/);
  const sections = doc.split(/^### \d\. /m).slice(1);
  // The last numbered section runs to EOF past the prose appendices; the
  // step count is what the heading pin above asserts — here, every step
  // carries its own on-resume rule.
  assert.equal(sections.length, STEPS.length);
  for (const [i, section] of sections.entries()) {
    assert.match(section, /\*\*On resume/, `step ${STEPS[i]} is missing an "On resume" rule`);
  }
});

// Both the skill and its A5 walkthrough must cite runnable engine commands:
// resolve (cluster attribution), log-entry (transitions), validate and
// validate-values (the close-the-loop re-run) — a stale flag would strand a
// reflect session mid-apply.
for (const [name, md, min] of [
  ['knowledge-reflect skill', doc, 5],
  ['A5 reflect walkthrough', walkthrough, 5],
]) {
  test(`${name}: every engine command names a real engine file with implemented flags`, () => {
    assertRealEngineCommands(root, name, md, { minCommands: min });
  });
}

test('the A5 walkthrough is registered in the acceptance README index', () => {
  const readme = readFileSync(join(root, 'acceptance', 'README.md'), 'utf8');
  assert.ok(readme.includes('A5-knowledge-reflect-walkthrough.md'));
});
