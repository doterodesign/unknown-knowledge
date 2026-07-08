// KK-02 done-criterion: empty catalog/rules templates ship in the payload so
// init (KK-14) can vendor them. Store set per PRD §9.1: ontology and knowledge
// each get _catalog.yaml + _rules.yaml; decisions gets _catalog.yaml only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';

const templatesDir = fileURLToPath(new URL('../payload/templates/', import.meta.url));

const TEMPLATES = [
  { path: 'ontology/_catalog.yaml', kind: 'catalog', store: 'ontology' },
  { path: 'ontology/_rules.yaml', kind: 'rules', store: 'ontology' },
  { path: 'knowledge/_catalog.yaml', kind: 'catalog', store: 'knowledge' },
  { path: 'knowledge/_rules.yaml', kind: 'rules', store: 'knowledge' },
  { path: 'decisions/_catalog.yaml', kind: 'catalog', store: 'decisions' },
];

test('every template exists, parses as YAML, and validates against its schema', () => {
  for (const { path, kind, store } of TEMPLATES) {
    const doc = load(readFileSync(join(templatesDir, path), 'utf8'));
    const result = validateStoreFile(kind, doc);
    assert.deepEqual(result.errors, [], path);
    assert.equal(doc.store, store, `${path}: wrong store`);
    assert.equal(doc['schema-version'], 1, `${path}: templates start at schema-version 1`);
  }
});

test('templates are empty seeds — bootstrap fills them, init only copies', () => {
  for (const { path, kind } of TEMPLATES) {
    const doc = load(readFileSync(join(templatesDir, path), 'utf8'));
    const body = kind === 'catalog' ? doc.entries : doc.rules;
    assert.deepEqual(body, [], `${path}: must ship empty`);
  }
});
