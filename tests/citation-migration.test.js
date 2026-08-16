// UCS-1145 + UCS-1146: leaf citations across the migrated scope name accessions.
//
// The migrate batches of the identity inversion. UCS-1144's expand phase made
// BOTH citation forms legal; these batches stop using one of them, in the
// scope named below. UCS-1145 covered leaf cross-references and knowledge
// catalogs; UCS-1146 added the two record-YAML citation sites — a decision's
// `relates-to.leaves` and a log fragment's `consulted.leaves`. Nothing about
// the engine changed — a notation-form citation still resolves, and must,
// until UCS-1147 contracts it away.
//
// So this file pins a DATA property, not a behavior: within the migrated
// scope, no leaf-to-leaf reference and no knowledge-catalog row is spelled as
// a notation. It is the assertion that keeps the batch from silently
// un-migrating — a future fixture edit that reintroduces a notation-form
// citation in migrated territory fails here, naming the file and the field.
//
// The reference check reads the typed `relates.*` kinds in addition to the
// `cross-references` fields these batches rewrote — deliberately wider than
// UCS-1145's edit list, since both target the same leaf-ref union. `leafRefs`
// explains why that costs nothing and what it buys. `recordLeafRefs` does the
// same job for the record-YAML side that UCS-1146 migrated.
//
// The exemptions are EXACT PATHS, never prefixes or globs. A fixture added
// later cannot join them by sitting in the right directory: it either migrates
// or it fails, and someone decides deliberately which. Each exemption below
// says why the notation form is the POINT of that fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { idPattern } from '../payload/engine/lib/id-grammars.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Stores in this batch's scope: the kit's test fixtures and both acceptance
 * fixture stores. Everything reachable under these roots is migrated territory
 * unless it appears in EXEMPT below.
 */
const SCOPE_ROOTS = [
  'tests/fixtures',
  'fixtures/ts-app/unknown-knowledge',
  'fixtures/swift-app/unknown-knowledge',
];

/**
 * Deliberate exceptions — fixtures whose PURPOSE is a notation-form leaf
 * reference. These keep notation refs because the dual-shape contract is
 * exactly what they exist to pin; UCS-1147 (contract) retires them together
 * with the alternate spelling itself.
 *
 * Keyed by exact repo-relative path, valued by the reason it is exempt.
 */
const EXEMPT = new Map([
  [
    'tests/fixtures/loader/unresolved-ref/knowledge/regulation/362.1-ach-settlement-windows.md',
    'Plants a see-also at notation "999.9", which no leaf carries. The dangling '
    + 'NOTATION is the specimen: load-stores.test.js pins the literal "999.9" in the '
    + 'unresolved-ref message and in the dangling-edge list, proving a notation-form '
    + 'target refuses as loudly as an accession-form one.',
  ],
  [
    'tests/fixtures/loader/unresolved-leaf-ref/knowledge/widgets/700.1-widget-registry.md',
    'Cites one dangling accession (L-000999) and one dangling notation ("700.9") from '
    + 'a single leaf. accession-ids.test.js asserts BOTH shapes dangle — dropping the '
    + 'notation half would leave the union half-tested.',
  ],
  [
    'tests/fixtures/structural-validator/typed-edges/knowledge/library/501.2-score-computation.md',
    'Its relates.depends-on deliberately cites 501.3 by NOTATION while 501.3 carries '
    + 'an accession. This is the typed-edges fixture that pins the leaf-ref union '
    + '(UCS-1151): a neighborhood entry must resolve either spelling to the same leaf.',
  ],
  [
    'tests/fixtures/loader/unresolved-ref/knowledge/_catalog.yaml',
    'Catalog of the dangling-notation store above. Its single row is the notation the '
    + 'leaf file also carries; migrating the row alone would make the store internally '
    + 'inconsistent and change what the unresolved-ref goldens are measuring.',
  ],
  [
    'tests/fixtures/structural-validator/bad-accession/knowledge/_catalog.yaml',
    'Its row id is "L-42" — an id of NO legal shape, neither accession nor notation. '
    + 'The malformed value is the specimen: accession-ids.test.js pins it as the '
    + 'id-shape finding that quotes the grammar hint. It reads as notation-form here '
    + 'only because it is not an accession, which is precisely the defect it plants.',
  ],
  [
    'tests/fixtures/loader/healthy/knowledge/regulation/362.1-ach-settlement-windows.md',
    'The notation-only specimen. accession-ids.test.js loads this store to prove an '
    + 'UNMINTED leaf still indexes by its notation exactly as it did pre-UCS-1144 — '
    + 'the property that lets migrate batches proceed a leaf at a time with no flag '
    + 'day. Migrating it would delete the only store that demonstrates it.',
  ],
  [
    'tests/fixtures/loader/healthy/knowledge/_catalog.yaml',
    'The catalog of the notation-only specimen above; its rows must stay notation-form '
    + 'so the store keeps demonstrating the unmigrated shape end to end.',
  ],
  [
    'tests/fixtures/resolver/store/knowledge/_catalog.yaml',
    'Catalog of the notation-only resolver store. accession-ids.test.js runs the '
    + '"resolves identically apart from the added field" golden against this root and '
    + 'asserts every published entry.id is null — which requires unminted leaves.',
  ],
  [
    'tests/fixtures/structural-validator/accessioned/knowledge/widgets/700.1-widget-registry.md',
    'Cites its sibling by NOTATION while carrying an accession itself. The mixed store: '
    + 'accession-ids.test.js reads this edge to prove neither citation form is '
    + 'second-class.',
  ],
  [
    'tests/fixtures/structural-validator/accessioned/knowledge/_catalog.yaml',
    'One row names an accession, the other a notation. The catalog half of the same '
    + 'dual-shape proof — pinned as a golden id list in accession-ids.test.js.',
  ],
  // --- UCS-1146: the record-YAML half of the same dual-shape proof ---------
  [
    'tests/fixtures/structural-validator/accessioned/decisions/entries/D-301-accession-ids.yaml',
    'Its relates-to.leaves cites one leaf by accession (L-000101) and its sibling by '
    + 'NOTATION ("700.2") from a single edge list. accession-ids.test.js asserts the '
    + 'resulting edges are [["700.2", true], ["L-000101", true]] — migrating the '
    + 'notation half would delete the proof that a decision reaches a leaf by either '
    + 'spelling.',
  ],
  [
    'tests/fixtures/loader/unresolved-leaf-ref/decisions/entries/D-301-dangling.yaml',
    'Cites one dangling accession (L-000998) and one dangling notation ("700.8") from a '
    + 'decision rather than a leaf. accession-ids.test.js pins all four dangling refs '
    + 'together to prove both shapes refuse "from leaf cross-references and decision '
    + 'relates-to alike"; migrating this would leave the decision-side union half-tested.',
  ],
  [
    'tests/fixtures/loader/healthy/decisions/entries/D-004-three-stores.yaml',
    'The decision half of the notation-only specimen store. Its relates-to.leaves cites '
    + '"362.1", a leaf deliberately left UNMINTED so accession-ids.test.js can prove an '
    + 'unaccessioned leaf still indexes by notation. Rewriting this ref to an accession '
    + 'would require minting one on that leaf, which is exactly what the specimen '
    + 'forbids — and load-stores.test.js pins this edge resolving to "362.1".',
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
 * A value is notation-form when it is not an accession. Accessions are the
 * migrated spelling; anything else in a leaf-ref position is what this batch
 * removed. Numbers count: an unquoted `362.1` is the YAML float an author's
 * un-quoted notation really produces, and it is still not an accession.
 */
const isNotationForm = (value) => {
  if (typeof value === 'number') return true;
  if (typeof value !== 'string') return false;
  return !ACCESSION.test(value);
};

/**
 * Every leaf-to-leaf citation in one leaf's frontmatter, with its field path.
 *
 * DELIBERATELY WIDER THAN UCS-1145's BATCH. The batch that rewrote data covered
 * `cross-references.class-elsewhere` and `see-also`. This reads the typed
 * `relates.*` kinds (UCS-1151) as well, because they target the same leaf-ref
 * union and so can carry the same defect.
 *
 * Reading them costs nothing and buys two things. Every `relates.*` edge in the
 * repo is ALREADY accession-form except the one deliberately-exempt
 * typed-edges fixture, so the wider read starts green — and it keeps those
 * edges from regressing to notation form later, which a batch-scoped assertion
 * would not notice. It is also what lets the exemption verifier below SEE the
 * notation-form citation the exempt typed-edges fixture plants; scoped
 * narrowly, that exemption would look stale and fail its own check.
 *
 * What this file pins is therefore the MIGRATED-STATE INVARIANT — no
 * notation-form leaf-to-leaf reference anywhere in scope — not the narrower
 * "what UCS-1145 rewrote". A future batch that migrates more fields should
 * widen this helper rather than add a parallel assertion.
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
 * The UCS-1146 half of the invariant. Two record kinds cite leaves outside a
 * leaf's own frontmatter, and both read the same leafRef union:
 *
 *   - a decision entry's `relates-to.leaves` (decisions/entries/*.yaml)
 *   - a log fragment's `consulted.leaves` (finding/gap/miss)
 *
 * Both are read from every YAML document in scope rather than from a path
 * pattern, for the reason `leafRefs` gives: the invariant is "no notation-form
 * leaf reference in migrated territory", not "the files this batch happened to
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
// fields UCS-1145 rewrote. See `leafRefs` for why the invariant is pinned at the
// union rather than at this batch's edit list.
test('no notation-form leaf-to-leaf reference survives in the migrated scope '
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
    'these cite a leaf by notation in migrated territory — rewrite to the target\'s '
    + 'accession, or add an exact-path entry to EXEMPT saying why the notation is the point');
});

// The record-YAML roots reach beyond SCOPE_ROOTS on purpose. A decision entry
// and a log fragment cite leaves from OUTSIDE any knowledge store, so the kit's
// own `decisions/` and `logs/` trees are migrated territory too — they are real
// records, not fixtures, and nothing would otherwise stop a notation-form
// citation from being written there.
const RECORD_ROOTS = [...SCOPE_ROOTS, 'decisions', 'logs'];

test('no notation-form leaf reference survives in a migrated decision entry '
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
    'these cite a leaf by notation from a decision entry or log fragment in migrated '
    + 'territory — rewrite to the target leaf\'s EXISTING accession (never mint a second '
    + 'id for an already-accessioned leaf), or add an exact-path entry to EXEMPT saying '
    + 'why the notation is the point');
});

test('no notation-form id row survives in a migrated knowledge catalog', () => {
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
    'these catalog rows name a leaf by notation in migrated territory — rewrite to the '
    + 'accession, or add an exact-path entry to EXEMPT');
});

test('every exemption names a file that exists and really cites by notation', () => {
  // An allowlist that outlives its fixture is how a migration silently
  // un-migrates: the entry stops protecting anything and starts hiding the
  // next file that lands on that path. Both halves are checked, so a rename
  // or a later migration of an exempt fixture fails here rather than rotting.
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
      `${file} is exempt but carries no notation-form citation — it migrated, so remove `
      + 'its exemption and let the assertion cover it');
  }
});

test('the exemptions are exact paths, so a new fixture cannot join them silently', () => {
  // The allowlist is a Map keyed by full repo-relative path. Nothing here is a
  // prefix, a glob, or a directory: adding tests/fixtures/loader/whatever.md
  // does not inherit loader/healthy's exemption.
  for (const file of EXEMPT.keys()) {
    assert.match(file, /\.(md|yaml)$/, `${file}: an exemption names one FILE`);
    assert.doesNotMatch(file, /[*?]/, `${file}: no globs — exact paths only`);
    assert.equal(relative(repoRoot, join(repoRoot, file)), file, `${file}: must be repo-relative`);
  }
});
