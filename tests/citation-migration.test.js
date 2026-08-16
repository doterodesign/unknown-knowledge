// UCS-1145: leaf cross-references and knowledge catalogs cite by accession.
//
// The first migrate batch of the identity inversion. UCS-1144's expand phase
// made BOTH citation forms legal; this batch stops using one of them, in the
// scope named below. Nothing about the engine changed — a notation-form
// citation still resolves, and must, until UCS-1147 contracts it away.
//
// So this file pins a DATA property, not a behavior: within the migrated
// scope, no leaf-to-leaf reference and no knowledge-catalog row is spelled as
// a notation. It is the assertion that keeps the batch from silently
// un-migrating — a future fixture edit that reintroduces a notation-form
// citation in migrated territory fails here, naming the file and the field.
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
 * `cross-references.class-elsewhere` and `see-also` are this batch's scope.
 * The typed `relates.*` kinds (UCS-1151) target the same leaf-ref union and so
 * are read too — not to migrate them here, but so the exemption verifier below
 * can SEE the notation-form citation an exempt typed-edges fixture plants.
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

test('no notation-form leaf-to-leaf reference survives in the migrated scope', () => {
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
    const notations = file.endsWith('_catalog.yaml')
      ? (load(text)?.entries ?? []).map((e) => e?.id).filter(isNotationForm)
      : leafRefs(frontmatter(file)).map(([, v]) => v).filter(isNotationForm);
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
