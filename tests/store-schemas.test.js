// KK-02: PRD §3.1–3.4 formalized as JSON Schema in payload/schemas/.
// These documents are the formal contract external tools consume; the
// engine's own validator (validate-record.js) interprets them directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, SUPPORTED_KEYWORDS } from '../payload/engine/lib/validate-record.js';

const schemaDir = fileURLToPath(new URL('../payload/schemas/', import.meta.url));

// The shared navigational grammar files (_catalog.yaml → _rules.yaml, PRD §3);
// everything else the validator knows is a §3.1–3.4 record shape. Deriving both
// from KINDS keeps these sweeps covering every schema the engine loads.
const NAV_SCHEMAS = ['catalog', 'rules'];
const RECORD_SCHEMAS = KINDS.filter((kind) => !NAV_SCHEMAS.includes(kind));

function loadSchema(name) {
  return JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), 'utf8'));
}

test('all schemas exist, parse as JSON, and declare draft 2020-12', () => {
  for (const name of [...RECORD_SCHEMAS, ...NAV_SCHEMAS]) {
    const schema = loadSchema(name);
    assert.equal(
      schema.$schema,
      'https://json-schema.org/draft/2020-12/schema',
      `${name}: wrong $schema`,
    );
    assert.ok(schema.$id, `${name}: missing $id`);
    assert.ok(schema.title, `${name}: missing title`);
    assert.equal(schema.type, 'object', `${name}: root must be an object shape`);
  }
});

test('record schemas are strict: unknown keys are typos, not extensions', () => {
  // Additive-only evolution (§3.5/D-013) happens by editing the schema, never
  // by letting unrecognized keys pass silently.
  for (const name of RECORD_SCHEMAS) {
    assert.equal(loadSchema(name).additionalProperties, false, name);
  }
});

test('§3.5: every store file shape requires schema-version', () => {
  // knowledge-leaf and finding are one-record-per-file shapes: the record IS
  // the store file, so schema-version is required at the record root.
  for (const name of ['knowledge-leaf', 'finding', 'catalog', 'rules']) {
    assert.ok(
      loadSchema(name).required.includes('schema-version'),
      `${name}: schema-version must be required`,
    );
  }
  // ontology concepts and decision entries live in multi-entry files: the
  // envelope ($defs/storeFile) carries schema-version.
  for (const name of ['ontology-concept', 'decision-entry']) {
    const envelope = loadSchema(name).$defs?.storeFile;
    assert.ok(envelope, `${name}: missing $defs/storeFile envelope`);
    assert.ok(envelope.required.includes('schema-version'), name);
    assert.ok(envelope.required.includes('entries'), name);
  }
});

test('§3.5: enumerates values are strings, byte-exact, case-sensitive', () => {
  const schema = loadSchema('ontology-concept');
  const descriptor = schema.$defs?.enumeratesDescriptor;
  assert.ok(descriptor, 'missing $defs/enumeratesDescriptor');
  assert.deepEqual(descriptor.properties.values.items, { type: 'string' });
  assert.ok(descriptor.required.includes('kind'));
  assert.ok(descriptor.required.includes('source'));
  assert.ok(descriptor.required.includes('values'));
});

test('§3.5: multi-entry source-of-truth documents first-entry-primary', () => {
  const sot = loadSchema('ontology-concept').properties['source-of-truth'];
  assert.equal(sot.type, 'array');
  assert.equal(sot.minItems, 1);
  assert.match(sot.description, /first entry .*primary/i);
});

test('§3.3: decision lifecycle and category enums are exact', () => {
  const props = loadSchema('decision-entry').properties;
  assert.deepEqual(props.status.enum, [
    'proposed', 'accepted', 'addressed', 'archived', 'rejected', 'superseded',
  ]);
  assert.deepEqual(props.category.enum, [
    'architecture', 'governance', 'scope', 'process', 'trust',
  ]);
});

test('§3.4: finding triggers and status enums are exact', () => {
  const props = loadSchema('finding').properties;
  assert.deepEqual(props.trigger.enum, [
    'correction', 'recurrence', 'retrieval-struggle', 'retrieval-miss', 'quarantine',
  ]);
  assert.deepEqual(props.status.enum, ['open', 'proposed', 'resolved', 'rejected']);
});

test('§3.2: an unsourced claim is not promotable — citations required', () => {
  const schema = loadSchema('knowledge-leaf');
  assert.ok(schema.required.includes('citations'));
  assert.equal(schema.properties.citations.minItems, 1);
});

test('schemas stay inside the keyword subset the engine interprets', () => {
  // The engine interprets these documents directly; a keyword it silently
  // ignores is contract drift between the published schema and runtime.
  const walk = (node, where, name) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${where}[${i}]`, name));
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      assert.ok(
        SUPPORTED_KEYWORDS.includes(key),
        `${name}: ${where}.${key} is not interpreted by validate-record.js`,
      );
      // enum/required values and pattern strings aren't schema nodes.
      if (key === 'enum' || key === 'required' || typeof value !== 'object') continue;
      if (key === 'properties' || key === '$defs') {
        for (const [child, childSchema] of Object.entries(value)) {
          walk(childSchema, `${where}.${key}.${child}`, name);
        }
      } else {
        walk(value, `${where}.${key}`, name);
      }
    }
  };
  for (const name of KINDS) {
    walk(loadSchema(name), '$', name);
  }
});

test('shared $defs are byte-identical across schema files (no ref-grammar drift)', () => {
  // conceptRef/decisionRef/isoDate/notation are copy-pasted so each schema
  // stays self-contained for external consumers; this keeps the copies equal.
  // Descriptions are per-store prose, not grammar — compare everything else.
  const normative = (node) =>
    JSON.stringify(node, (key, value) => (key === 'description' ? undefined : value));
  const canonical = new Map();
  for (const name of KINDS) {
    for (const [def, node] of Object.entries(loadSchema(name).$defs ?? {})) {
      const found = normative(node);
      if (!canonical.has(def)) {
        canonical.set(def, { name, found });
      } else {
        const first = canonical.get(def);
        assert.equal(
          found,
          first.found,
          `$defs/${def} in ${name} diverges from the copy in ${first.name}`,
        );
      }
    }
  }
});
