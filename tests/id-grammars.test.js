// UCS-1142: the leaf notation grammar lives in ONE module.
//
// It used to be spelled five times — four copy-pasted `$defs/notation` blocks
// in the schema files plus a regex literal in the structural validator, whose
// human-facing hint travelled separately from the pattern it described. These
// tests pin the two properties that make that one place real: the shipped
// schema copies agree with the module (so the published documents stay
// honest), and adding an id space touches the module alone (so the next
// accession-id change is a one-line edit, not a cross-cutting rename).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ID_GRAMMARS, SCHEMA_DEFS, idPattern } from '../payload/engine/lib/id-grammars.js';
import { KINDS, validateRecord } from '../payload/engine/lib/validate-record.js';

const schemaDir = fileURLToPath(new URL('../payload/schemas/', import.meta.url));
const engineDir = fileURLToPath(new URL('../payload/engine/', import.meta.url));

const loadSchema = (name) => JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), 'utf8'));

test('every id space pairs a pattern with its human-facing hint', () => {
  // The hint is quoted back in id-shape findings. Travelling with the pattern
  // is the point: a grammar change cannot leave the prose describing the old
  // one, which is exactly how the two used to drift.
  for (const [space, grammar] of Object.entries(ID_GRAMMARS)) {
    assert.equal(typeof grammar.pattern, 'string', `${space}: pattern is a string (JSON Schema takes one)`);
    assert.ok(grammar.hint, `${space}: missing hint`);
    assert.match(grammar.pattern, /^\^/, `${space}: pattern must be anchored at the start`);
    assert.match(grammar.pattern, /\$$/, `${space}: pattern must be anchored at the end`);
    assert.doesNotThrow(() => new RegExp(grammar.pattern), `${space}: pattern must compile`);
  }
});

test('the leaf notation grammar is declared in exactly one module', () => {
  // Any OTHER engine module carrying the dotted-notation regex would be a
  // second source of truth — the defect this ticket removed.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.js') && entry.name !== 'id-grammars.js') {
        if (/\[0-9\]\+\(\\{1,2}\.\[0-9\]\+\)\*/.test(readFileSync(path, 'utf8'))) offenders.push(path);
      }
    }
  };
  walk(engineDir);
  assert.deepEqual(offenders, [], 'the notation grammar is spelled outside lib/id-grammars.js');
});

test('the shipped schema copies agree with the grammar module', () => {
  // The JSON files keep self-contained `$defs` for external consumers (a
  // cross-file $ref is outside the keyword subset the engine interprets). The
  // engine binds the module's pattern over them at load, so this test is what
  // keeps the PUBLISHED documents from quietly describing a different grammar.
  for (const [space, def] of Object.entries(SCHEMA_DEFS)) {
    const expected = ID_GRAMMARS[space].pattern;
    let found = 0;
    for (const kind of KINDS) {
      const node = loadSchema(kind).$defs?.[def];
      if (!node) continue;
      found += 1;
      assert.equal(node.pattern, expected, `${kind}: $defs/${def} disagrees with ID_GRAMMARS.${space}`);
    }
    assert.ok(found > 0, `no schema carries $defs/${def}`);
  }
});

test('the engine validates leaves against the module, not the schema file copy', () => {
  // Proven at the seam that matters: the pattern the validator enforces is the
  // module's. A leaf field the grammar rejects is a pattern-mismatch, and one it
  // accepts is not — whatever the JSON file happens to say.
  //
  // The leaf carries an `id` now, and that is the inversion UCS-1147 made here:
  // this test used to build a leaf from a notation ALONE, which validated clean
  // and so doubled as a pin on the notation being a leaf's identity. It is not.
  // The accession is required, so a leaf without one fails on `id` before its
  // notation is ever judged — which would have made this test about the wrong
  // field. The notation rides along as the optional legacy label it now is, and
  // is still checked when present, which is the property under test.
  const leaf = (notation) => ({
    'schema-version': 2,
    id: 'L-000362',
    notation,
    domain: 'test',
    heading: 'test leaf',
    citations: [{ source: 'test' }],
  });
  const accepted = validateRecord('knowledge-leaf', leaf('362.1'));
  assert.deepEqual(accepted.errors, [], 'a well-formed notation must validate');

  const rejected = validateRecord('knowledge-leaf', leaf('K-101'));
  assert.deepEqual(
    rejected.errors.map((e) => e.code),
    ['pattern-mismatch'],
    'an id from another space must not pass the leaf notation grammar',
  );
  // The message quotes the module's HINT rather than its pattern (UCS-1147):
  // an id-space pattern is bound together with the hint that describes it, and
  // the hint is what an author can act on. Asserting on the hint pins the same
  // property the pattern assertion did — the message comes from this module's
  // entry for this space, not from the schema file's copy — while checking the
  // half a human actually reads.
  assert.ok(rejected.errors[0].message.includes(ID_GRAMMARS.knowledge.hint),
    'the message quotes the hint the module owns, alongside the pattern it enforces');

  // The inverted half, pinned rather than merely noted: drop the accession and
  // the leaf fails on `id` — a notation is not an identity a leaf may hold.
  const { id, ...unminted } = leaf('362.1');
  assert.deepEqual(
    validateRecord('knowledge-leaf', unminted).errors.map((e) => [e.path, e.code]),
    [['id', 'missing-required']],
    'the accession is REQUIRED — a leaf carrying only a notation has no identity',
  );
});

test('the citation grammar and the minting grammar are separately declared', () => {
  // UCS-1147 narrowed `leaf-ref` from a union of accession-and-notation to the
  // accession alone, which made it pattern-identical to `accessions`. The two
  // stay separate entries, and this pins why: they answer different questions —
  // what a leaf MINTS versus what a record may CITE — and each carries its own
  // hint, because a minting finding names a shape while a citation finding names
  // the migration that took the other spelling away.
  assert.equal(ID_GRAMMARS['leaf-ref'].pattern, ID_GRAMMARS.accessions.pattern,
    'they coincide today, which is the fact — not an excuse to collapse them');
  assert.notEqual(ID_GRAMMARS['leaf-ref'].hint, ID_GRAMMARS.accessions.hint,
    'the hints differ because the two findings say different things');

  // The legacy notation keeps its own grammar and its own `$defs`, because the
  // field is still VALIDATED when present even though nothing resolves through
  // it — a malformed display label is a defect regardless.
  assert.notEqual(ID_GRAMMARS.knowledge.pattern, ID_GRAMMARS['leaf-ref'].pattern);
  assert.match(ID_GRAMMARS.knowledge.hint, /legacy/,
    'a finding quoting the notation hint must not read as an invitation to cite that way');
  assert.deepEqual(
    Object.keys(SCHEMA_DEFS).sort(), ['accessions', 'knowledge', 'leaf-ref'],
    'three leaf-side defs stay three, by what they SAY rather than what they match',
  );
});

test('adding an id space touches the grammar module and nothing else', () => {
  // The acceptance criterion, executed. A new space becomes usable — pattern
  // compiled, hint available, and (when it names a `$defs`) bound into the
  // schemas the engine validates against — without a schema edit or a second
  // copy anywhere. Nothing here writes to a schema file: that is the proof.
  const spaces = Object.keys(ID_GRAMMARS);
  assert.ok(spaces.length >= 3, 'expected the three store id spaces');

  // The module IS the registry: every consumer looks a space up by name, so a
  // new entry is reachable the moment it exists here.
  for (const space of spaces) {
    const pattern = idPattern(space);
    assert.ok(pattern instanceof RegExp, `${space}: idPattern must compile the grammar`);
    assert.equal(pattern.source, ID_GRAMMARS[space].pattern, `${space}: compiled from the declared pattern`);
  }

  // Consumers reach the grammar by lookup, never by a hardcoded branch — so an
  // unknown space is a loud TypeError, never a silently unchecked id. This
  // used to name "accessions", which UCS-1144 then added: the space landed by
  // editing this module alone, which is the property under test.
  assert.throws(() => idPattern('editions'), /unknown id space "editions"/);

  // A space added to the map needs no schema duplication to be enforced: the
  // binding is driven by SCHEMA_DEFS, a data lookup over the same keys.
  for (const space of Object.keys(SCHEMA_DEFS)) {
    assert.ok(ID_GRAMMARS[space], `SCHEMA_DEFS names "${space}", which no grammar declares`);
  }
});
