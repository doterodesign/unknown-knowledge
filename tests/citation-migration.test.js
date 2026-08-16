// UCS-1147: the migration is COMPLETE — notation-form leaf citation is illegal.
//
// This file was written for the migrate batches (UCS-1145, UCS-1146), when a
// notation-form citation still resolved and stopping using it was a data
// convention the engine did not yet enforce. It pinned a repo in transit: a
// scope that had migrated, an allowlist of deliberate specimens that had not,
// and a note that UCS-1147 would eventually retire them together with the
// second spelling itself.
//
// That day is this one. `leaf-ref` is now the accession grammar alone, so a
// notation in a leaf-citation position is a schema defect the engine refuses at
// load — pinned as behavior in accession-ids.test.js. The specimens went with
// it: every fixture that existed to demonstrate the dual shape was migrated,
// and every exemption those fixtures held was removed. See the note on EXEMPT
// below for the one entry that survived and why it is not a dual-shape one.
//
// What still earns this file its place is that the engine's refusal and the
// repo's DATA are two different facts. The engine could only ever refuse what
// it loads; a notation-form citation can still be written into a fixture the
// engine never reads, into a store nothing validates in CI, or into a file
// deliberately excluded because it is testing something else. This is the
// assertion that the repo does not carry one anywhere — naming the file and the
// field, so a reintroduction fails here rather than surviving as a specimen
// nobody remembers is dead.
//
// The reference check reads the typed `relates.*` kinds in addition to the
// `cross-references` fields the batches rewrote, since all of them read the
// same `leaf-ref` grammar. `leafRefs` explains why that costs nothing and what
// it buys; `recordLeafRefs` does the same job for the record-YAML side.
//
// The exemptions are EXACT PATHS, never prefixes or globs. A fixture added
// later cannot join them by sitting in the right directory: it either migrates
// or it fails, and someone decides deliberately which.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { idPattern } from '../payload/engine/lib/id-grammars.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Stores in scope: the kit's test fixtures and both acceptance fixture stores.
 * Every leaf citation reachable under these roots must be accession-form,
 * unless the file appears in EXEMPT below.
 */
const SCOPE_ROOTS = [
  'tests/fixtures',
  'fixtures/ts-app/unknown-knowledge',
  'fixtures/swift-app/unknown-knowledge',
];

/**
 * Deliberate exceptions — keyed by exact repo-relative path, valued by the
 * reason the value in a leaf-citation position is not an accession.
 *
 * This list used to hold twelve dual-shape specimens: fixtures that cited a
 * leaf by notation because the dual-shape contract was the thing they existed
 * to pin. UCS-1147 migrated every one of them and removed every one of those
 * exemptions — the contract they demonstrated no longer exists, so a fixture
 * demonstrating it would be teaching a shape the engine refuses.
 *
 * What remains is one entry, and it is not a dual-shape exemption. It is here
 * because the verifier below tests a value for "is not an accession", and a
 * MALFORMED id answers that question the same way a notation does. Read the
 * reason: it plants an id of no legal shape at all.
 */
const EXEMPT = new Map([
  [
    'tests/fixtures/structural-validator/bad-accession/knowledge/_catalog.yaml',
    'Its row id is "L-42" — an id of NO legal shape under any contract this kit has '
    + 'ever had: too short for an accession, not dotted enough for a notation, a '
    + 'defect before UCS-1147 and a defect after it. The malformed value is the '
    + 'specimen, not a retired spelling: accession-ids.test.js pins it as the id-shape '
    + 'finding whose message carries the citation grammar hint an author acts on. It '
    + 'appears in this allowlist only because "not an accession" is how the check '
    + 'below recognises a notation, and a malformed id trips the same test.',
  ],
]);

// Read from the grammar module rather than restating it, so a change to the
// accession shape reaches this assertion instead of leaving it believing the
// old one.
const ACCESSION = new RegExp(idPattern('accessions'));

/** Every file under `dir` matching `test`, as repo-relative paths. */
const walk = (dir, test) => {
  let out = [];
  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(child, test));
    else if (test(entry.name)) out.push(child);
  }
  return out;
};

/** Frontmatter of a leaf file, or null when it carries none. */
const frontmatter = (path) => {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  return match ? load(match[1]) : null;
};

/**
 * A value is notation-form when it is not an accession. The accession is the
 * ONLY legal spelling of a leaf citation (UCS-1147), so anything else in a
 * leaf-ref position is illegal — whether it is a well-formed dotted notation or
 * a malformed id, which is why the one surviving exemption reads as this.
 *
 * Numbers count: an unquoted `362.1` is the YAML float an author's un-quoted
 * notation really produces, and it is still not an accession.
 */
const isNotationForm = (value) => {
  if (typeof value === 'number') return true;
  if (typeof value !== 'string') return false;
  return !ACCESSION.test(value);
};

/**
 * Every leaf-to-leaf citation in one leaf's frontmatter, with its field path.
 *
 * DELIBERATELY WIDER THAN THE FIELDS ANY ONE BATCH REWROTE. UCS-1145 covered
 * `cross-references.class-elsewhere` and `see-also`. This reads the typed
 * `relates.*` kinds (UCS-1151) as well, because every one of them reads the same
 * `leaf-ref` grammar and so can carry the same defect.
 *
 * Reading them costs nothing and buys the thing this file is for: a `relates.*`
 * edge that regressed to notation form later would be invisible to an
 * assertion scoped to one batch's edit list, and visible here.
 *
 * What this file pins is therefore the FINISHED-STATE INVARIANT — no
 * notation-form leaf-to-leaf reference anywhere in scope. A field that starts
 * citing leaves should widen this helper rather than add a parallel assertion.
 *
 * `including` is standing room, not a leaf reference, and never appears.
 */
const leafRefs = (front) => {
  const refs = [];
  for (const field of ['class-elsewhere', 'see-also']) {
    const values = front?.['cross-references']?.[field];
    if (Array.isArray(values)) {
      values.forEach((value, i) => refs.push([`cross-references.${field}[${i}]`, value]));
    }
  }
  for (const [kind, values] of Object.entries(front?.relates ?? {})) {
    if (Array.isArray(values)) {
      values.forEach((value, i) => refs.push([`relates.${kind}[${i}]`, value]));
    }
  }
  return refs;
};

/**
 * Every leaf citation in one RECORD-YAML document, with its field path.
 *
 * The record-YAML half of the invariant. Two record kinds cite leaves outside a
 * leaf's own frontmatter, and both read the same `leaf-ref` grammar:
 *
 *   - a decision entry's `relates-to.leaves` (decisions/entries/*.yaml)
 *   - a log fragment's `consulted.leaves` (finding/gap/miss)
 *
 * Both are read from every YAML document in scope rather than from a path
 * pattern, for the reason `leafRefs` gives: the invariant is "no notation-form
 * leaf reference anywhere in scope", not "the files some batch happened to
 * edit". A log fragment committed under some new directory, or a decision
 * entry that moves, stays covered without anyone remembering to widen a glob.
 *
 * A document may hold one record or a list under `entries`, so both are read.
 */
const recordLeafRefs = (doc) => {
  const refs = [];
  const records = Array.isArray(doc?.entries)
    ? doc.entries.map((entry, i) => [`entries[${i}].`, entry])
    : [['', doc]];
  for (const [prefix, record] of records) {
    for (const [field, holder] of [['relates-to', 'relates-to'], ['consulted', 'consulted']]) {
      const values = record?.[holder]?.leaves;
      if (Array.isArray(values)) {
        values.forEach((value, i) => refs.push([`${prefix}${field}.leaves[${i}]`, value]));
      }
    }
  }
  return refs;
};

// Scope note: this covers cross-references AND typed relates.* — wider than the
// fields any one batch rewrote. See `leafRefs` for why the invariant is pinned
// at the grammar rather than at an edit list.
test('no notation-form leaf-to-leaf reference survives anywhere in scope '
  + '(cross-references and typed relates alike)', () => {
  const offenders = [];
  for (const root of SCOPE_ROOTS) {
    for (const file of walk(root, (name) => name.endsWith('.md'))) {
      if (EXEMPT.has(file)) continue;
      let front;
      // A fixture may be deliberately unparseable (the malformed/coercion-trap
      // scenarios). Those carry no migratable citation by construction.
      try { front = frontmatter(file); } catch { continue; }
      for (const [path, value] of leafRefs(front)) {
        if (isNotationForm(value)) offenders.push(`${file} ${path}: ${JSON.stringify(value)}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'these cite a leaf by notation, which no longer resolves — rewrite to the target\'s '
    + 'accession. An EXEMPT entry is not the fix here: the dual-shape contract these '
    + 'exemptions once protected is gone, so a fixture citing by notation is teaching a '
    + 'spelling the engine refuses');
});

// The record-YAML roots reach beyond SCOPE_ROOTS on purpose. A decision entry
// and a log fragment cite leaves from OUTSIDE any knowledge store, so the kit's
// own `decisions/` and `logs/` trees are in scope too — they are real records,
// not fixtures, and nothing would otherwise stop a notation-form citation from
// being written there.
const RECORD_ROOTS = [...SCOPE_ROOTS, 'decisions', 'logs'];

test('no notation-form leaf reference survives in a decision entry '
  + 'or log fragment (relates-to.leaves and consulted.leaves alike)', () => {
  const offenders = [];
  for (const root of RECORD_ROOTS) {
    for (const file of walk(root, (name) => name.endsWith('.yaml'))) {
      if (EXEMPT.has(file)) continue;
      let doc;
      // Deliberately-unparseable fixtures carry no migratable citation.
      try { doc = load(readFileSync(join(repoRoot, file), 'utf8')); } catch { continue; }
      for (const [path, value] of recordLeafRefs(doc)) {
        if (isNotationForm(value)) offenders.push(`${file} ${path}: ${JSON.stringify(value)}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'these cite a leaf by notation from a decision entry or log fragment — rewrite to '
    + 'the target leaf\'s EXISTING accession (never mint a second id for a leaf that '
    + 'already has one, since an accession is never reused)');
});

test('no notation-form id row survives in a knowledge catalog', () => {
  const offenders = [];
  for (const root of SCOPE_ROOTS) {
    for (const file of walk(root, (name) => name === '_catalog.yaml')) {
      if (EXEMPT.has(file) || !file.includes('/knowledge/')) continue;
      let doc;
      try { doc = load(readFileSync(join(repoRoot, file), 'utf8')); } catch { continue; }
      for (const [i, entry] of (doc?.entries ?? []).entries()) {
        if (isNotationForm(entry?.id)) {
          offenders.push(`${file} entries[${i}].id: ${JSON.stringify(entry.id)}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    'these catalog rows name a leaf by notation — a catalog row is a POINTER, and the '
    + 'only spelling that points at anything is the accession');
});

test('every exemption names a file that exists and really carries a non-accession', () => {
  // An allowlist that outlives its fixture is how a migration silently
  // un-migrates: the entry stops protecting anything and starts hiding the
  // next file that lands on that path. Both halves are checked, so a rename
  // or a later migration of an exempt fixture fails here rather than rotting.
  //
  // This check is what SHRANK the list at UCS-1147. Twelve dual-shape specimens
  // were migrated by that ticket; each one's exemption then failed here — it
  // named a file carrying nothing but accessions — which is exactly how a
  // completed migration is supposed to collect its own allowlist entries.
  for (const [file, reason] of EXEMPT) {
    assert.ok(reason.length > 40, `${file}: an exemption must say WHY, not just that`);
    const full = join(repoRoot, file);
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      assert.fail(`exempt path no longer exists: ${file} — drop the entry or fix the path`);
    }
    // Three file shapes carry a citation, so the verifier reads whichever one
    // this exemption names: a catalog's id rows, a record's leaf-ref lists, or
    // a leaf's own frontmatter.
    let values;
    if (file.endsWith('_catalog.yaml')) {
      values = (load(text)?.entries ?? []).map((e) => e?.id);
    } else if (file.endsWith('.yaml')) {
      values = recordLeafRefs(load(text)).map(([, v]) => v);
    } else {
      values = leafRefs(frontmatter(file)).map(([, v]) => v);
    }
    const notations = values.filter(isNotationForm);
    assert.ok(notations.length > 0,
      `${file} is exempt but carries only accession-form citations — it migrated, so `
      + 'remove its exemption and let the assertion cover it');
  }
});

test('the exemptions are exact paths, so a new fixture cannot join them silently', () => {
  // The allowlist is a Map keyed by full repo-relative path. Nothing here is a
  // prefix, a glob, or a directory: adding tests/fixtures/structural-validator/
  // whatever.md does not inherit bad-accession's exemption.
  for (const file of EXEMPT.keys()) {
    assert.match(file, /\.(md|yaml)$/, `${file}: an exemption names one FILE`);
    assert.doesNotMatch(file, /[*?]/, `${file}: no globs — exact paths only`);
    assert.equal(relative(repoRoot, join(repoRoot, file)), file, `${file}: must be repo-relative`);
  }
});
