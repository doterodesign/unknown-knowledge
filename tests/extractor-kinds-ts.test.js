// KK-08: the five TS/JS extractor kinds (PRD §5.1) — ts-const-array,
// ts-union, ts-enum, ts-object-keys (+ .tsx/.jsx), json-keys/json-map-keys.
// Three seams:
//   1. the shipped D-009 fixture pairs (payload/extractor-fixtures/ts/) are
//      pinned against the registered kinds, so sample and expectation can
//      never rot apart — and every registered TS kind must ship a pair;
//   2. the value-validator CLI against fixtures/ts-app reproduces the
//      FIXTURE.md tables: clean A2 extractions, exact A3 drift, and the
//      §5.1 out-of-envelope anchors as hard errors (exit 2), never partial
//      value sets;
//   3. kind-level envelope/extract failure modes not plantable in the
//      fixture app (escape sequences, facet pinning, malformed JSON, …),
//      via the registry the validator dispatches through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { KINDS, EnvelopeError, ExtractError } from '../payload/engine/lib/extractor-kinds.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const pairsRoot = join(root, 'payload', 'extractor-fixtures', 'ts');
const cli = join(root, 'payload', 'engine', 'validate-values.js');

const TS_KINDS = ['ts-const-array', 'ts-union', 'ts-enum', 'ts-object-keys', 'json-keys', 'json-map-keys'];

// ------------------------------------------- 1. shipped D-009 fixture pairs

test('every TS kind ships a D-009 fixture pair, and every pair names a registered kind', () => {
  const dirs = readdirSync(pairsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual(dirs, [...TS_KINDS].sort());
  for (const kind of TS_KINDS) assert.ok(KINDS[kind], `kind ${kind} must be registered`);
});

test('each shipped pair round-trips: the kind extracts EXACTLY the expected set from its sample', () => {
  for (const kind of TS_KINDS) {
    const dir = join(pairsRoot, kind);
    const expected = load(readFileSync(join(dir, 'EXPECTED.yaml'), 'utf8'));
    assert.equal(expected.kind, kind, `${kind}/EXPECTED.yaml must name its own kind`);
    const sample = readFileSync(join(dir, expected.file), 'utf8');
    const actual = KINDS[kind](sample, expected);
    // §3.5 set equality — but the fixture pairs are authored duplicate-free,
    // so exact multiset equality (sorted) is the honest pin.
    assert.deepEqual([...actual].sort(), [...expected.values].sort(),
      `${kind}: sample and EXPECTED.yaml have rotted apart`);
  }
});

// --------------------------- 2. the CLI against fixtures/ts-app (FIXTURE.md)

function runTsApp(...args) {
  return spawnSync(process.execPath, [cli, '--root', join(root, 'fixtures', 'ts-app'), '--json', ...args], { encoding: 'utf8' });
}

test('A2 clean extractions: every planted clean anchor agrees — exit 0, zero findings', () => {
  const clean = 'K-101,K-103,K-105,K-106,K-107,K-109,K-112,K-114';
  const r = runTsApp('--concepts', clean);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out['hard-errors'], []);
  assert.equal(out.checked.filter((c) => !c.skipped).length, 8);
});

test('A3 planted drift: exactly the three tabulated findings, nothing else', () => {
  const r = runTsApp('--concepts', 'K-102,K-104,K-108');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out['hard-errors'], []);
  assert.deepEqual(
    out.findings.map((f) => [f.concept, f.code, f.value ?? null]),
    [
      ['K-102', 'value-not-in-source', 'futures'],
      ['K-104', 'source-value-missing', 'crypto'],
      ['K-108', 'wrong-pointer', null],
    ],
  );
});

test('§5.1 out-of-envelope anchors HARD-ERROR (exit 2) — never a partial value set', () => {
  const r = runTsApp('--concepts', 'K-113,K-115,K-116');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.findings, []); // no value set was ever claimed checked
  assert.deepEqual(out['hard-errors'].map((e) => [e.concept, e.code]), [
    ['K-113', 'out-of-envelope'],
    ['K-115', 'out-of-envelope'],
    ['K-116', 'out-of-envelope'],
  ]);
  const messages = out['hard-errors'].map((e) => e.message);
  assert.match(messages[0], /spread/i); // K-113: ...US_LEAGUES
  assert.match(messages[2], /re-export/i); // K-116: barrel file
});

test('the .tsx and plain-.js anchors extract clean — kinds describe shape, not file type', () => {
  const r = runTsApp('--concepts', 'K-107,K-114');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).findings, []);
});

// ----------------------------- 3. kind-level failure modes (the registry seam)

const d = (over = {}) => ({ kind: 'x', source: 's', values: [], ...over });

test('ts-const-array: spread, non-string member, and escape sequence are out-of-envelope sentinels', () => {
  const spread = `export const A = [...B, 'x'];`;
  assert.throws(() => KINDS['ts-const-array'](spread, d({ symbol: 'A' })), EnvelopeError);
  const nonString = `export const A = ['x', someVar];`;
  assert.throws(() => KINDS['ts-const-array'](nonString, d({ symbol: 'A' })), EnvelopeError);
  const escaped = `export const A = ['it\\'s'];`;
  assert.throws(() => KINDS['ts-const-array'](escaped, d({ symbol: 'A' })), /escape sequence/);
});

test('ts-const-array: missing symbol, non-array initializer, and absent symbol option all extract-fail', () => {
  assert.throws(() => KINDS['ts-const-array'](`export const B = ['x'];`, d({ symbol: 'A' })), ExtractError);
  assert.throws(() => KINDS['ts-const-array'](`export const A = { x: 1 };`, d({ symbol: 'A' })), ExtractError);
  assert.throws(() => KINDS['ts-const-array'](`export const A = ['x'];`, d()), /requires a "symbol:"/);
});

test('ts-const-array: duplicates are emitted as read — the caller diff makes the finding (§3.5)', () => {
  const twice = `export const A = ['x', 'y', 'x'];`;
  assert.deepEqual(KINDS['ts-const-array'](twice, d({ symbol: 'A' })), ['x', 'y', 'x']);
});

test('ts-union: a type-reference member is out of the envelope; a re-exported symbol is never followed', () => {
  const reference = `export type A = 'x' | Other;`;
  assert.throws(() => KINDS['ts-union'](reference, d({ symbol: 'A' })), EnvelopeError);
  const barrel = `export { type A } from './a';`;
  assert.throws(() => KINDS['ts-union'](barrel, d({ symbol: 'A' })), /re-export/);
  const star = `export * from './a';`;
  assert.throws(() => KINDS['ts-union'](star, d({ symbol: 'A' })), /re-export/);
});

test('ts-enum: emit pins the facet — names (default) vs values; anything else is a hard error', () => {
  const src = `export enum E { A = 'a', B = 'b' }`;
  assert.deepEqual(KINDS['ts-enum'](src, d({ symbol: 'E' })), ['A', 'B']);
  assert.deepEqual(KINDS['ts-enum'](src, d({ symbol: 'E', emit: 'names' })), ['A', 'B']);
  assert.deepEqual(KINDS['ts-enum'](src, d({ symbol: 'E', emit: 'values' })), ['a', 'b']);
  assert.throws(() => KINDS['ts-enum'](src, d({ symbol: 'E', emit: 'both' })), ExtractError);
});

test('ts-enum with emit: values hard-errors on a member without a string initializer', () => {
  const numeric = `export enum E { A, B }`;
  assert.deepEqual(KINDS['ts-enum'](numeric, d({ symbol: 'E' })), ['A', 'B']); // names: fine
  assert.throws(() => KINDS['ts-enum'](numeric, d({ symbol: 'E', emit: 'values' })), EnvelopeError);
  const computed = `export enum E { A = 1 << 2 }`;
  assert.throws(() => KINDS['ts-enum'](computed, d({ symbol: 'E' })), EnvelopeError);
});

test('ts-object-keys: shorthand properties are keys; template-interpolated keys are sentinels', () => {
  const shorthand = `export const O = { alpha, 'beta-x': 1, gamma: { nested: [2] } };`;
  assert.deepEqual(KINDS['ts-object-keys'](shorthand, d({ symbol: 'O' })), ['alpha', 'beta-x', 'gamma']);
  const computed = 'export const O = { [`${x}-y`]: 1 };';
  assert.throws(() => KINDS['ts-object-keys'](computed, d({ symbol: 'O' })), EnvelopeError);
  const spread = `export const O = { ...base, x: 1 };`;
  assert.throws(() => KINDS['ts-object-keys'](spread, d({ symbol: 'O' })), /spread/);
});

test('json kinds: malformed JSON, missing path, and non-object targets extract-fail loudly', () => {
  assert.throws(() => KINDS['json-keys']('{ not json', d()), /not valid JSON/);
  assert.throws(() => KINDS['json-keys']('["an", "array"]', d()), /needs an object/);
  const doc = JSON.stringify({ a: { b: { k1: 1, k2: 2 } }, arr: [1] });
  assert.deepEqual(KINDS['json-map-keys'](doc, d({ symbol: 'a.b' })), ['k1', 'k2']);
  assert.throws(() => KINDS['json-map-keys'](doc, d({ symbol: 'a.missing' })), /not found/);
  assert.throws(() => KINDS['json-map-keys'](doc, d({ symbol: 'arr' })), /needs an object/);
  assert.throws(() => KINDS['json-map-keys'](doc, d()), /requires a "symbol:"/);
});
