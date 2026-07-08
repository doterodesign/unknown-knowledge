// KK-11: the new-kind drafting template's artifacts can't rot apart — the
// shipped parser skeleton, its fixture, and EXPECTED.yaml stay consistent.
// This pins the template only; exercising it against a live anchor is the
// documented MANUAL walkthrough in the template README (honest seam, PRD
// §5.2 / ORCHESTRATION "walkthrough-tested, never faked as CI").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { KIND, extractValues } from '../payload/templates/new-kind/parser.example.js';

const templateDir = fileURLToPath(new URL('../payload/templates/new-kind/', import.meta.url));

test('template ships all four DRAFT artifacts plus README', () => {
  for (const file of [
    'README.md',
    'parser.example.js',
    'descriptor.example.yaml',
    'fixture/sample.list',
    'fixture/EXPECTED.yaml',
    'fixture/demo-anchor.list',
  ]) {
    const stat = statSync(join(templateDir, file), { throwIfNoEntry: false });
    assert.ok(stat?.isFile(), `missing template artifact: ${file}`);
  }
});

test('parser extracts exactly what fixture/EXPECTED.yaml claims (D-009 pair)', () => {
  const expected = load(readFileSync(join(templateDir, 'fixture/EXPECTED.yaml'), 'utf8'));
  assert.equal(expected.kind, KIND);
  const text = readFileSync(join(templateDir, 'fixture', expected.file), 'utf8');
  const values = extractValues(text, expected.file);
  // §3.5: strings, byte-exact, compared as sets — order irrelevant.
  assert.ok(values.every((v) => typeof v === 'string'), 'values are strings');
  assert.deepEqual([...values].sort(), [...expected.values].sort());
});

test('out-of-envelope input hard-errors — never a partial value set (PRD §5)', () => {
  assert.throws(
    () => extractValues('- ok\nnot a value line\n', 'bad.list'),
    /bad\.list:2: .*envelope/,
  );
  // The wrong-pointer signature: a valueless anchor is an error, not [].
  assert.throws(() => extractValues('# only comments\n', 'empty.list'), /no line-list values/);
});

test('descriptor example matches the enumerates descriptor shape and the fixture kind', () => {
  const descriptors = load(readFileSync(join(templateDir, 'descriptor.example.yaml'), 'utf8'));
  assert.ok(Array.isArray(descriptors) && descriptors.length > 0);
  for (const d of descriptors) {
    assert.equal(d.kind, KIND);
    assert.ok(typeof d.source === 'string' && d.source !== '');
    assert.ok(Array.isArray(d.values) && d.values.every((v) => typeof v === 'string'));
  }
});
