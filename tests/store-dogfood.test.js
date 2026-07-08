// The kit eats its own cooking (PRD §9.2): its decisions store must validate
// against the very schemas it ships in payload/schemas/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = join(root, 'decisions', 'entries');

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
  const doc = load(readFileSync(join(root, 'decisions', '_catalog.yaml'), 'utf8'));
  const result = validateStoreFile('catalog', doc);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});
