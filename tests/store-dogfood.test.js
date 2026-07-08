// The kit eats its own cooking (PRD §9.2): its decisions store must validate
// against the very schemas it ships in payload/schemas/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = join(root, 'decisions', 'entries');

const loadCatalog = () =>
  load(readFileSync(join(root, 'decisions', '_catalog.yaml'), 'utf8'));
const entryFiles = () =>
  readdirSync(entriesDir).filter((f) => f.endsWith('.yaml')).sort();

test("the kit's own decision entry files validate against decision-entry", () => {
  const files = readdirSync(entriesDir).filter((f) => f.endsWith('.yaml')).sort();
  assert.ok(files.length > 0, 'the decisions store must not be empty');
  for (const file of files) {
    const doc = load(readFileSync(join(entriesDir, file), 'utf8'));
    const result = validateStoreFile('decision-entry', doc);
    assert.deepEqual(result.errors, [], file);
    assert.equal(result.ok, true, file);
  }
});

test("the kit's own decisions/_catalog.yaml validates against catalog", () => {
  const result = validateStoreFile('catalog', loadCatalog());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

// KK-03: the seed decision set (PRD §13, D-001..D-016) is imported alongside
// the KK-28 pre-work entries (D-017/D-018). Subset assertions only, so later
// entries (D-019, ...) merge in without touching this test.
test('the catalog lists D-001..D-018, each resolving to an entry file on disk', () => {
  const byId = new Map(loadCatalog().entries.map((e) => [e.id, e]));
  for (let n = 1; n <= 18; n += 1) {
    const id = `D-${String(n).padStart(3, '0')}`;
    const entry = byId.get(id);
    assert.ok(entry, `${id} must be cataloged individually (no range placeholders)`);
    assert.ok(
      existsSync(join(root, 'decisions', entry.file)),
      `${id}: catalog file ${entry.file} must exist`,
    );
  }
});

test('every entry file on disk is cataloged exactly once', () => {
  const listed = loadCatalog().entries.map((e) => e.file);
  for (const file of entryFiles()) {
    const refs = listed.filter((f) => f === `entries/${file}`).length;
    assert.equal(refs, 1, `entries/${file} must appear in the catalog exactly once`);
  }
});

test('each entry file declares exactly the D-NNN id its filename carries', () => {
  for (const file of entryFiles()) {
    const id = file.match(/^(D-[0-9]+)-/)?.[1];
    assert.ok(id, `${file} must be named D-NNN-<slug>.yaml`);
    const doc = load(readFileSync(join(entriesDir, file), 'utf8'));
    assert.deepEqual(
      doc.entries.map((e) => e.id),
      [id],
      `${file} must hold the single entry ${id} (one entry per file, D-010)`,
    );
  }
});
