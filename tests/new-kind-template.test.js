// KK-11: the new-kind drafting template's artifacts can't rot apart — the
// shipped parser skeleton, its fixture, EXPECTED.yaml, the demo-run CLI, and
// the descriptor example stay consistent with each other, with the shipped
// ontology-concept schema, and with the walkthrough recorded in the template
// README. Exercising the template against a real live anchor remains the
// documented MANUAL walkthrough in that README (honest seam, PRD §5.2 /
// ORCHESTRATION "walkthrough-tested, never faked as CI").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { KIND, extractValues } from '../payload/templates/new-kind/parser.example.js';
import { validateRecord } from '../payload/engine/lib/validate-record.js';

const templateDir = fileURLToPath(new URL('../payload/templates/new-kind/', import.meta.url));
const parserPath = join(templateDir, 'parser.example.js');

/** Spawn the demo-run CLI exactly as the README walkthrough does. */
function runCli(args, cwd = templateDir) {
  return spawnSync(process.execPath, [parserPath, ...args], { cwd, encoding: 'utf8' });
}

test('template ships the five README-table artifacts plus the README (six files)', () => {
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

test('CRLF line endings are inside the envelope — the split normalizes them', () => {
  // An anchor authored on Windows is the same document; \r\n must not leak a
  // \r into the byte-exact value nor hard-error a fully in-envelope file.
  assert.deepEqual(
    extractValues('# comment\r\n- soccer\r\n- tennis\r\n', 'crlf.list'),
    ['soccer', 'tennis'],
  );
});

test('trailing whitespace on a value line is an out-of-envelope hard error', () => {
  // "- nfl " would capture "nfl " — a value that can never byte-match the
  // visually identical claim. Hard-error-never-guess: name the invisible
  // whitespace explicitly instead of parsing either way.
  assert.throws(
    () => extractValues('- nfl \n', 'trail.list'),
    (error) => {
      assert.match(error.message, /trail\.list:1: /);
      assert.match(error.message, /trailing whitespace/);
      // JSON.stringify of the raw line makes the invisible byte visible.
      assert.ok(error.message.includes('"- nfl "'), `message shows the raw line: ${error.message}`);
      return true;
    },
  );
  assert.throws(() => extractValues('- tab\t\n', 'trail.list'), /trailing whitespace/);
});

test('out-of-envelope input hard-errors — never a partial value set (PRD §5)', () => {
  assert.throws(
    () => extractValues('- ok\nnot a value line\n', 'bad.list'),
    /bad\.list:2: .*envelope/,
  );
  // The wrong-pointer signature: a valueless anchor is an error, not [].
  assert.throws(() => extractValues('# only comments\n', 'empty.list'), /no line-list values/);
});

test('demo-run CLI: fixture run exits 0 and prints the JSON the walkthrough records', () => {
  const result = runCli(['fixture/sample.list']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.kind, KIND);
  assert.equal(output.file, 'fixture/sample.list');
  assert.deepEqual([...output.values].sort(), ['mlb', 'nba', 'nfl']);
});

test('demo-anchor run reproduces the README walkthrough exactly (exit 0, soccer + tennis)', () => {
  const result = runCli(['fixture/demo-anchor.list']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  // Pinned to the recorded walkthrough in the template README — if either
  // side changes, the "recorded" transcript must be re-recorded.
  assert.deepEqual(output, {
    kind: KIND,
    file: 'fixture/demo-anchor.list',
    values: ['soccer', 'tennis'],
  });
});

test('demo-run CLI: no argument is a usage error, exit 2', () => {
  const result = runCli([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: node parser\.example\.js <anchor-path>/);
  assert.equal(result.stdout, '');
});

test('demo-run CLI: out-of-envelope anchor exits 2 with the envelope error on stderr', () => {
  const dir = mkdtempSync(join(tmpdir(), 'new-kind-template-'));
  const bad = join(dir, 'bad.list');
  writeFileSync(bad, '- rugby\nnot a value line\n'); // same shape the README walkthrough records
  const result = runCli([bad]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '', 'a check that never ran emits no value set');
  assert.match(result.stderr, /bad\.list:2: line is outside the line-list envelope/);
});

test('descriptor example passes the shipped ontology-concept schema machinery', () => {
  const descriptors = load(readFileSync(join(templateDir, 'descriptor.example.yaml'), 'utf8'));
  assert.ok(Array.isArray(descriptors) && descriptors.length > 0);
  for (const d of descriptors) assert.equal(d.kind, KIND);
  // The example is a fragment to paste into a concept's `enumerates:` list;
  // the schema validates whole records, so embed it in a minimal valid
  // concept and run it through the real gate (validate-record.js), exactly
  // as the loader will at RE-RUN time.
  const record = {
    id: 'K-1',
    term: 'supported sports',
    class: 'demo',
    summary: 'template demo concept carrying the example descriptor',
    status: 'draft',
    'source-of-truth': descriptors.map((d) => d.source),
    enumerates: descriptors,
  };
  const { ok, errors } = validateRecord('ontology-concept', record);
  assert.deepEqual(errors, [], 'descriptor fragment must validate clean');
  assert.ok(ok);
  // Negative control: the gate is real — a plausible-but-wrong field on the
  // same fragment must be rejected, not waved through.
  const typoed = validateRecord('ontology-concept', {
    ...record,
    enumerates: [{ ...descriptors[0], sources: 'typo-for-source' }],
  });
  assert.ok(
    typoed.errors.some((e) => e.code === 'unknown-property' && e.path.includes('sources')),
    `expected unknown-property for "sources", got: ${JSON.stringify(typoed.errors)}`,
  );
});
