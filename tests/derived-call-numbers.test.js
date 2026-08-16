// UCS-1158, acceptance criterion 2 — a call number is a DISPLAY string, and no
// citation-legal surface accepts one.
//
// The synthesized call number is the most dangerous artifact in the derived
// layer, and the danger is social rather than technical. It is compact,
// readable, and positional — everything the retired dotted notation was — so it
// is exactly the string somebody will paste into a `see-also`. If that paste
// ever resolved, the accession inversion (UCS-1147) would reverse itself one
// convenient citation at a time, and the store would be back to references that
// break when a leaf is reclassified.
//
// The defense already exists: `leaf-ref` is accession-only, so the grammar
// refuses a call number without any new check. This file is the EXPLICIT proof
// of that — the fixture the ticket asks for, pinning the property rather than
// leaving it as an inference from two other tickets' tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { idSpacesMatching, synthesizeCallNumber, CALL_NUMBER_SEPARATOR } from '../payload/engine/lib/call-numbers.js';
import { ID_GRAMMARS } from '../payload/engine/lib/id-grammars.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fixture = join(repoRoot, 'tests', 'fixtures', 'derived', 'call-number-citation');

test('a citation-shaped field carrying a call number is a FINDING', () => {
  // The planted case: L-000117's `relates.see-also` cites the call number
  // `SPO/ODD/CON·L-000133` instead of the accession `L-000133`.
  const model = loadStores(fixture);
  assert.equal(model.ok, false, 'the store must not load clean with a call number cited');

  const diagnostics = model.diagnostics
    .filter((d) => d.path === 'relates.see-also[0]')
    .map((d) => d.code)
    .sort();

  // TWO independent refusals, and both matter. The grammar refuses the SHAPE
  // (a call number is not an accession), and ref resolution refuses the TARGET
  // (nothing is indexed under that string). Either alone would be enough; the
  // pair means a future change would have to defeat both to make a call number
  // citable by accident.
  assert.deepEqual(diagnostics, ['pattern-mismatch', 'unresolved-ref']);

  const shape = model.diagnostics.find((d) => d.code === 'pattern-mismatch' && d.path === 'relates.see-also[0]');
  assert.match(shape.message, /expected the leaf's accession id \(L-NNNNNN\)/,
    'the finding names the remedy, not just the defect');
});

test('the validator reports it rather than passing — through the CLI seam', () => {
  const r = spawnSync(
    process.execPath,
    [join(repoRoot, 'payload', 'engine', 'validate.js'), '--root', fixture, '--json'],
    { encoding: 'utf8' },
  );
  // Exit 2, not 1, and that is the loader's contract rather than this ticket's
  // choice: a store that does not LOAD has not been structurally checked at
  // all, so the checks never ran. The defect is reported either way, which is
  // the property criterion 2 asks for — a call number in a citation field is
  // never a silent pass.
  assert.equal(r.status, 2);
  assert.match(r.stderr, /pattern-mismatch/);
  assert.match(r.stderr, /SPO\/ODD\/CON·L-000133/);
  assert.match(r.stderr, /structural checks never ran/);
});

test('every id space refuses every call number shape the engine can synthesize', () => {
  // Not a sample: the cross product of plausible facet paths against every
  // grammar in ID_GRAMMARS. `idSpacesMatching` enumerates the table itself, so
  // a NEW id space that accepted middle dots fails the day it is added rather
  // than the first time somebody cites a shelf label.
  const paths = [
    ['sportsbook', 'odds-feed', 'reference'],
    ['payments', 'fx'],
    ['unclassified'],
    [],
    ['123', '456'], // a numeric facet path — the shape closest to a dotted notation
  ];
  const accessions = ['L-000117', 'L-999999', null];

  for (const path of paths) {
    for (const accession of accessions) {
      const callNumber = synthesizeCallNumber(path, accession);
      assert.deepEqual(
        idSpacesMatching(callNumber), [],
        `${callNumber} is accepted by an id grammar — a display string became citable`,
      );
      // The separator is what makes this structural rather than lucky: no id
      // grammar in the engine admits it.
      assert.ok(callNumber.includes(CALL_NUMBER_SEPARATOR));
    }
  }

  // And the accession the call number CONTAINS still resolves as itself, so the
  // tempting thing to paste carries the correct thing to paste.
  assert.deepEqual(idSpacesMatching('L-000117').sort(), ['accessions', 'leaf-ref']);
  assert.ok(Object.keys(ID_GRAMMARS).length >= 5);
});
