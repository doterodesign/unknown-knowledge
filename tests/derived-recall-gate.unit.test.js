// UCS-1158, acceptance criterion 5 — the gated position of embedding recall is
// DOCUMENTED and structurally present, with the implementation out of scope.
//
// This file is the docs-assertion half. The property it protects is unusual:
// what ships is a SLOT and a GATE, not a feature, and the thing most likely to
// go wrong is not a bug but scope drift — somebody later implements recall in a
// place the design forbids (frontmatter, the deterministic path, a persisted
// cache), and the prose that said otherwise quietly becomes false.
//
// So the doc is held to the code, the way CONTEXT.md is: every constraint the
// protocol document states is re-derived from RECALL_SLOT here, and the ban on
// an implementation is asserted against the source rather than trusted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DERIVED_DIR, RECALL_SLOT, gateProposal } from '../payload/engine/lib/derived.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const doc = readFileSync(join(repoRoot, 'payload', 'protocol', 'derived-layer.md'), 'utf8');

test('the protocol document states every constraint the slot declares', () => {
  // Re-derived from the code, never restated from memory: a change to
  // RECALL_SLOT that the document did not follow fails here.
  assert.match(doc, new RegExp(`\`location\`.*\`${RECALL_SLOT.location}\``));
  assert.match(doc, new RegExp(`\`consulted\`.*\`${RECALL_SLOT.consulted}\``));
  assert.match(doc, new RegExp(`\`output\`.*\`${RECALL_SLOT.output}\``));
  assert.match(doc, /`citable`.*`false`/);
  assert.match(doc, /`persistable`.*`false`/);

  // The three claims in prose, each the human half of one constraint.
  assert.match(doc, /deleting `derived\/` deletes every probabilistic artifact/);
  assert.match(doc, /recall runs only when the deterministic layer returns nothing/);
  assert.match(doc, /Nothing probabilistic persists or is cited without that gate/);
});

test('the document says the implementation is out of scope, and it is', () => {
  assert.match(doc, /The implementation is out of scope, deliberately/);
  assert.match(doc, /model selection and semantic search are not built here/);
  assert.equal(RECALL_SLOT.status, 'declared-unimplemented');
  assert.equal(RECALL_SLOT['out-of-scope-here'],
    'model selection and semantic-recall implementation (issue #49)');
});

test('the slot is frozen — a consumer cannot relax a constraint at runtime', () => {
  assert.ok(Object.isFrozen(RECALL_SLOT));
  // Silent in sloppy mode, throwing under the module's own strictness; either
  // way the value must not change. Asserted on the VALUE rather than on the
  // assignment, so both behaviours pass for the right reason.
  try { RECALL_SLOT.citable = true; } catch { /* frozen, as intended */ }
  assert.equal(RECALL_SLOT.citable, false, 'nothing may make a proposal citable');
});

test('the gate admits nothing — there is no argument that opens it', () => {
  // Exhaustive in the only sense available: the function ignores its input, so
  // any input is the general case. Shapes chosen to look like the tempting
  // ones — a perfect score, a store-resident id, an empty object.
  for (const proposal of [
    { id: 'L-000117', score: 1.0, source: 'embedding' },
    { id: 'L-000133', score: 0.0 },
    { admitted: true }, // a proposal that claims its own admission
    {},
    null,
  ]) {
    const verdict = gateProposal(proposal);
    assert.equal(verdict.admitted, false,
      'a proposal must never be admitted automatically, whatever it claims about itself');
    assert.match(verdict.reason, /nothing reaches the store without that gate/);
  }
});

test('the derived directory is where recall lives, and it is the disposable one', () => {
  // The strongest guarantee the design offers, stated as an equality: the
  // recall slot's location IS the directory the round-trip test deletes. If
  // these ever diverged, a probabilistic artifact could survive a regeneration.
  assert.equal(RECALL_SLOT.location, DERIVED_DIR);
  assert.match(doc, /Deleting it loses nothing/);
});

test('the derived layer ships no recall implementation', () => {
  // The scope boundary, asserted against source rather than trusted. Comments
  // are stripped first: the position of embedding recall is documented at
  // length in these files, and the ban is on code, not on the prose.
  for (const file of ['lib/derived.js', 'lib/call-numbers.js', 'commands/derive.js']) {
    const code = readFileSync(join(repoRoot, 'payload', 'engine', file), 'utf8')
      .replace(/\/\*[^]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const banned of [/cosine/i, /dotProduct/i, /\bvector\b/i, /similarity\s*\(/i, /fetch\s*\(/i]) {
      assert.doesNotMatch(code, banned,
        `${file} must not implement recall or reach the network (matched ${banned})`);
    }
  }
});
