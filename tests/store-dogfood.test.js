// The kit eats its own cooking (PRD §9.2): its decisions store must validate
// against the very schemas it ships in payload/schemas/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = join(root, 'decisions', 'entries');

// Static fixtures — read once, shared by every test below.
const catalog = load(readFileSync(join(root, 'decisions', '_catalog.yaml'), 'utf8'));
const entryFiles = readdirSync(entriesDir).filter((f) => f.endsWith('.yaml')).sort();
const entryDocs = new Map(
  entryFiles.map((f) => [f, load(readFileSync(join(entriesDir, f), 'utf8'))]),
);

test("the kit's own decision entry files validate against decision-entry", () => {
  assert.ok(entryFiles.length > 0, 'the decisions store must not be empty');
  for (const [file, doc] of entryDocs) {
    const result = validateStoreFile('decision-entry', doc);
    assert.deepEqual(result.errors, [], file);
    assert.equal(result.ok, true, file);
  }
});

test("the kit's own decisions/_catalog.yaml validates against catalog", () => {
  const result = validateStoreFile('catalog', catalog);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

// KK-03: the seed decision set (PRD §13, D-001..D-016) is imported alongside
// the KK-28 pre-work entries (D-017/D-018). The seed subset is pinned; every
// other check derives from the catalog and the directory so D-019+ merge in
// with full coverage automatically.
test('the catalog lists the full seed set D-001..D-018 individually', () => {
  const ids = new Set(catalog.entries.map((e) => e.id));
  for (let n = 1; n <= 18; n += 1) {
    const id = `D-${String(n).padStart(3, '0')}`;
    assert.ok(ids.has(id), `${id} must be cataloged individually (no range placeholders)`);
  }
});

test('catalog ids are unique and every row resolves to its own entry file', () => {
  const seen = new Set();
  for (const row of catalog.entries) {
    assert.ok(!seen.has(row.id), `${row.id} must be cataloged exactly once`);
    seen.add(row.id);
    assert.ok(
      existsSync(join(root, 'decisions', row.file)),
      `${row.id}: catalog file ${row.file} must exist`,
    );
    // The map is never the fact — but it must point at the fact it names.
    const doc = entryDocs.get(row.file.replace(/^entries\//, ''));
    assert.ok(doc, `${row.id}: ${row.file} must live in decisions/entries/`);
    assert.deepEqual(
      doc.entries.map((e) => e.id),
      [row.id],
      `${row.file} must hold the single entry ${row.id} the catalog claims (one entry per file, D-010)`,
    );
    assert.equal(
      doc.entries[0].title,
      row.title,
      `${row.id}: catalog title must carry the entry title verbatim (two copies drift)`,
    );
  }
});

test('every entry file on disk is cataloged exactly once', () => {
  const listed = catalog.entries.map((e) => e.file);
  assert.equal(new Set(listed).size, listed.length, 'catalog file paths must be unique');
  for (const file of entryFiles) {
    assert.ok(
      listed.includes(`entries/${file}`),
      `entries/${file} must appear in the catalog`,
    );
  }
});

test('each entry file declares exactly the D-NNN id its filename carries', () => {
  for (const file of entryFiles) {
    const id = file.match(/^(D-[0-9]{3})-/)?.[1];
    assert.ok(id, `${file} must be named D-NNN-<slug>.yaml (three-digit id grammar)`);
    assert.deepEqual(
      entryDocs.get(file).entries.map((e) => e.id),
      [id],
      `${file} must hold the single entry ${id} (one entry per file, D-010)`,
    );
  }
});

// KK-04: the loader must load the kit repo itself with ZERO errors — the
// ontology and knowledge stores don't exist here yet, which is exactly the
// well-defined missing-store warning case.
const model = loadStores(root);

test('the kit repo loads through the store loader with zero errors', () => {
  assert.deepEqual(model.diagnostics.filter((d) => d.severity === 'error'), []);
  assert.equal(model.ok, true);
  assert.deepEqual(
    model.diagnostics.map(({ severity, code, file }) => ({ severity, code, file })),
    [
      { severity: 'warning', code: 'missing-store', file: 'knowledge' },
      { severity: 'warning', code: 'missing-store', file: 'ontology' },
    ],
  );
});

test("the kit's own decision entries are indexed and their refs resolve", () => {
  const ids = [...model.decisions.keys()];
  assert.ok(ids.includes('D-017'), JSON.stringify(ids));
  assert.ok(ids.includes('D-018'), JSON.stringify(ids));
  assert.ok(model.refs.length > 0);
  assert.ok(model.refs.every((r) => r.resolved), 'catalog-declared pending ids resolve');
});
