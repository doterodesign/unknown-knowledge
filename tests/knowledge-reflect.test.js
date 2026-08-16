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
  for (const category of ['concept-fix', 'alias-addition', 'ssot-repoint', 'scope-widen', 'knowledge-promotion', 'extractor-draft', 'mint-proposal']) {
    assert.ok(doc.includes(category), `missing change category ${category}`);
  }
});

// --- UCS-1160: the minting conduct and the moderator's interface -------------
// Reflect is where misses become tomorrow's deterministic edges. These are
// DOCS assertions on purpose: corroboration counting and warrant judgment are
// the human half of the loop, and building either into the engine would make
// the threshold un-auditable and the warrant automatic.

test('residue and document candidates are documented as fragment findings carrying their context', () => {
  // Residue arrives with what DID resolve alongside it — a bare unresolved
  // token is a finding nobody can act on.
  assert.match(doc, /`resolved-context`/);
  assert.match(doc, /decomposition\.residue/);
  // Document candidates carry a section locator, so clustering opens the
  // section just-in-time rather than re-reading the document.
  assert.match(doc, /`section` locator/);
  assert.match(doc, /candidates-ranked/);
  assert.match(doc, /just-in-time/);
  // Both flow through the EXISTING log-entry surface, not a parallel one.
  assert.match(doc, /through\s+`log-entry\.js` like every other fragment/);
  // Zero resolution is normal, not a miss — consistent with resolve's own conduct.
  assert.match(doc, /[Zz]ero\s+resolution is a normal outcome, not a miss/);
});

test('the corroboration rule is stated as human judgment the engine never counts', () => {
  assert.match(doc, /counted \*\*by hand, here\*\* — the engine never\s+counts it/);
  assert.match(doc, /no CLI reports a corroboration\s+score/);
});

test('minting conduct: literary warrant with evidence attached, one Decisions entry per mint', () => {
  // The four mintable vocabularies the loop produces.
  for (const vocabulary of ['terms', 'aliases', 'operations', 'domain classes']) {
    assert.ok(doc.includes(`**${vocabulary}**`), `minting conduct must name ${vocabulary}`);
  }
  // Warrant: corroboration alone never mints.
  assert.match(doc, /[Ll]iterary warrant, always/);
  assert.match(doc, /minted only when material\s+exists to fill it/);
  assert.match(doc, /speculative shelving\s+wearing evidence/);
  // Evidence attached, verbatim, like every other recommendation item.
  assert.match(doc, /\*\*Evidence attached\.\*\*/);
  assert.match(doc, /names the corroborating fragment\s+paths verbatim/);
  // One Decisions entry per minting — each segment, alias, operation.
  assert.match(doc, /\*\*One Decisions entry per minting\.\*\*/);
  assert.match(doc, /each domain\s+segment, each alias, each operation/);
  // Drafted from the template whose placeholders refuse an unedited paste.
  assert.ok(doc.includes('templates/decisions/reflect-mint-proposal.yaml'));
  assert.match(doc, /pasted unedited\s+fails validation/);
  // Suppression is durable, never a deletion.
  assert.match(doc, /`status: suppressed`/);
  // Proposal-first: minting is gated like any other item.
  assert.match(doc, /never edits a\s+registry ahead of its approval/);
  assert.match(doc, /never mints a child path segment whose\s+parent is unminted/);
});

test('the A5 walkthrough exercises the residue cluster through to an approved mint', () => {
  // The walkthrough is the honest seam for prose protocol: if reflect is where
  // misses become edges, the acceptance run has to actually walk one.
  assert.match(walkthrough, /residue `lacrosse`/);
  // Seeded as findings through the CLI, carrying their context and locator.
  assert.match(walkthrough, /"residue":\["lacrosse"\]/);
  assert.match(walkthrough, /"resolved-context":\["add-sport","K-110"\]/);
  assert.match(walkthrough, /"section":\{"document":"docs\/sports-expansion\.md","address":"Planned sports","line":24\}/);
  // A mint-proposal item reaches the gate on three distinct fragments, and the
  // warrant was checked by opening the source the locator addressed.
  assert.match(walkthrough, /category `mint-proposal`/);
  assert.match(walkthrough, /\*\*literary\s+warrant\*\*/);
  assert.match(walkthrough, /a\s+candidate is a claim about the map until someone reads the source/);
  // One Decisions entry per mint, from the placeholder-guarded template.
  assert.match(walkthrough, /templates\/decisions\/reflect-mint-proposal\.yaml/);
  assert.match(walkthrough, /entries\[0\]\.date` and `entries\[0\]\.id` `pattern-mismatch`/);
  // The outcome is recorded by category, so graduation can measure it.
  assert.match(walkthrough, /mint-proposal: \{ approved: 1/);
  // Corroboration is counted by hand — the engine never reports a score.
  assert.match(walkthrough, /Corroboration was counted \*\*by hand\*\*/);
});

test('the A5 walkthrough presents the reflect queue as the moderator interface', () => {
  assert.match(walkthrough, /presents the \*\*reflect queue\*\*, not a store browse/);
  for (const section of ['Mint proposals', 'Corroborated findings', 'Drafts awaiting promotion', 'Sampled spot-checks']) {
    assert.ok(walkthrough.includes(`**${section}**`), `the walkthrough queue must show ${section}`);
  }
  // The spot-check section shows what did NOT clear the threshold.
  assert.match(walkthrough, /as under-corroborated so the human can audit the threshold itself/);
});

test("the moderator's interface is the reflect queue's four sections, not store browsing", () => {
  assert.match(doc, /\*\*The moderator's interface is the reflect queue, not the store\.\*\*/);
  assert.match(doc, /do\s+not browse `knowledge\/` or `ontology\/`/);
  // The four sections, each present as a queue row.
  for (const section of ['Mint proposals', 'Corroborated findings', 'Drafts awaiting promotion', 'Sampled spot-checks']) {
    assert.ok(doc.includes(`**${section}**`), `the queue must have a ${section} section`);
  }
  // The spot-check sample audits the THRESHOLD, not just what cleared it.
  assert.match(doc, /a threshold nobody\s+audits is a threshold nobody can tune/);
  assert.match(doc, /approving one does not bypass the standard/);
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
