// KK-09: the five Swift + config extractor kinds (PRD §5.1) — swift-enum,
// swift-const-array, yaml-keys, yaml-map-keys, strings-keys. The same three
// seams as the KK-08 TS suite:
//   1. the shipped D-009 fixture pairs (payload/extractor-fixtures/swift/)
//      are pinned against the registered kinds, so sample and expectation
//      can never rot apart — and every registered Swift/config kind must
//      ship a pair;
//   2. the value-validator CLI against fixtures/swift-app reproduces the
//      FIXTURE.md tables: clean A2 extractions, exact A3 drift (including
//      the wrong-pointer signature), and the §5.1 out-of-envelope anchor
//      (`#if` in the enum span) as a hard error (exit 2), never a partial
//      value set;
//   3. kind-level envelope/extract failure modes not plantable in the
//      fixture app (associated values, string interpolation, non-string
//      YAML keys, malformed .strings pairs, emit facet pinning, …), via
//      the registry the validator dispatches through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { KINDS, EnvelopeError, ExtractError } from '../payload/engine/lib/extractor-kinds.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const pairsRoot = join(root, 'payload', 'extractor-fixtures', 'swift');
const cli = join(root, 'payload', 'engine', 'validate-values.js');

const SWIFT_KINDS = ['swift-enum', 'swift-const-array', 'yaml-keys', 'yaml-map-keys', 'strings-keys'];

// ------------------------------------------- 1. shipped D-009 fixture pairs

test('every Swift/config kind ships a D-009 fixture pair, and every pair names a registered kind', () => {
  const dirs = readdirSync(pairsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual(dirs, [...SWIFT_KINDS].sort());
  for (const kind of SWIFT_KINDS) assert.ok(KINDS[kind], `kind ${kind} must be registered`);
});

test('each shipped pair round-trips: the kind extracts EXACTLY the expected set from its sample', () => {
  for (const kind of SWIFT_KINDS) {
    const dir = join(pairsRoot, kind);
    const expected = load(readFileSync(join(dir, 'EXPECTED.yaml'), 'utf8'));
    assert.equal(expected.kind, kind, `${kind}/EXPECTED.yaml must name its own kind`);
    const sample = readFileSync(join(dir, expected.file), 'utf8');
    // The kinds dispatch/scoping fields live on the descriptor — EXPECTED.yaml
    // carries the same fields (kind/file/symbol/emit); `source` is the file.
    const actual = KINDS[kind](sample, { ...expected, source: expected.file });
    // §3.5 set equality — but the fixture pairs are authored duplicate-free,
    // so exact multiset equality (sorted) is the honest pin.
    assert.deepEqual([...actual].sort(), [...expected.values.map(String)].sort(),
      `${kind}: sample and EXPECTED.yaml have rotted apart`);
  }
});

// ------------------------- 2. the CLI against fixtures/swift-app (FIXTURE.md)

function runSwiftApp(...args) {
  return spawnSync(process.execPath, [cli, '--root', join(root, 'fixtures', 'swift-app'), '--json', ...args], { encoding: 'utf8' });
}

test('A2 clean extractions: every clean anchor agrees — exit 0, zero findings', () => {
  // FIXTURE.md §6: concepts with no planted finding are K-120 (swift-enum
  // raw-value facet), K-130 (swift-const-array), K-140 (yaml-keys). K-160's
  // clean .strings descriptor rides the drift test — the concept as a whole
  // carries the planted .xcstrings finding.
  const r = runSwiftApp('--concepts', 'K-120,K-130,K-140');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out['hard-errors'], []);
  assert.equal(out.checked.filter((c) => !c.skipped).length, 3);
});

test('A3 planted drift: exactly the tabulated findings, both directions, nothing else', () => {
  const r = runSwiftApp('--concepts', 'K-110,K-150,K-160');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out['hard-errors'], []);
  assert.deepEqual(
    out.findings.map((f) => [f.concept, f.path, f.code, f.value ?? null]),
    [
      ['K-110', 'enumerates[0]', 'source-value-missing', 'tennis'],
      ['K-110', 'enumerates[0]', 'value-not-in-source', 'cricket'],
      ['K-150', 'enumerates[0]', 'source-value-missing', '2027-preview'],
      ['K-160', 'enumerates[1]', 'value-not-in-source', 'cta.transfer'],
    ],
  );
});

test('A3 wrong-pointer: all claimed values missing from a real, parseable file — one finding, no cascade', () => {
  const r = runSwiftApp('--concepts', 'K-170');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out['hard-errors'], []);
  assert.deepEqual(out.findings.map((f) => [f.concept, f.code]), [['K-170', 'wrong-pointer']]);
});

test('§5.1 out-of-envelope anchor (#if in the enum span) HARD-ERRORS (exit 2) — never a partial value set', () => {
  const r = runSwiftApp('--concepts', 'K-180');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.findings, []); // no value set was ever claimed checked
  assert.deepEqual(out['hard-errors'].map((e) => [e.concept, e.code]), [['K-180', 'out-of-envelope']]);
  assert.match(out['hard-errors'][0].message, /#if/);
});

test('the two swift-enum facets are independent value sets off the SAME anchor (§3.5 emit)', () => {
  // K-120 (raw-value) is clean while K-110 (case-name) drifts — the facets
  // cannot be conflated, or the raw-value check would inherit the drift.
  const r = runSwiftApp('--concepts', 'K-120');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).findings, []);
});

// ----------------------------- 3. kind-level failure modes (the registry seam)

const d = (over = {}) => ({ kind: 'x', source: 's', values: [], ...over });

test('swift-enum: #if inside the matched span is the declared out-of-envelope sentinel', () => {
  const src = 'enum E: String {\n  case a = "A"\n  #if DEBUG\n  case dbg = "D"\n  #endif\n}';
  assert.throws(() => KINDS['swift-enum'](src, d({ symbol: 'E' })), EnvelopeError);
  assert.throws(() => KINDS['swift-enum'](src, d({ symbol: 'E' })), /#if/);
});

test('swift-enum: associated values make the value set unknowable — sentinel', () => {
  const src = 'enum E {\n  case plain\n  case boxed(Int)\n}';
  assert.throws(() => KINDS['swift-enum'](src, d({ symbol: 'E' })), /associated values/);
});

test('swift-enum: emit pins the facet — case-name (default) vs raw-value; anything else is a hard error', () => {
  const src = 'enum E: String { case a = "A", b = "B" }';
  assert.deepEqual(KINDS['swift-enum'](src, d({ symbol: 'E' })), ['a', 'b']);
  assert.deepEqual(KINDS['swift-enum'](src, d({ symbol: 'E', emit: 'case-name' })), ['a', 'b']);
  assert.deepEqual(KINDS['swift-enum'](src, d({ symbol: 'E', emit: 'raw-value' })), ['A', 'B']);
  assert.throws(() => KINDS['swift-enum'](src, d({ symbol: 'E', emit: 'names' })), ExtractError);
  assert.throws(() => KINDS['swift-enum'](src, d({ symbol: 'E', emit: 'both' })), ExtractError);
});

test('swift-enum with emit: raw-value hard-errors on implicit raw values and non-string raw values', () => {
  const implicit = 'enum E: String { case a, b }';
  assert.deepEqual(KINDS['swift-enum'](implicit, d({ symbol: 'E' })), ['a', 'b']); // case-name: fine
  assert.throws(() => KINDS['swift-enum'](implicit, d({ symbol: 'E', emit: 'raw-value' })), EnvelopeError);
  const numeric = 'enum E: Int { case a = 1 }';
  assert.throws(() => KINDS['swift-enum'](numeric, d({ symbol: 'E' })), EnvelopeError);
});

test('swift-enum: interpolation in a raw value is a sentinel; switch arms and decoy enums never bleed in', () => {
  const interp = 'enum E: String { case a = "x\\(y)" }';
  assert.throws(() => KINDS['swift-enum'](interp, d({ symbol: 'E' })), /interpolation/);
  const scoped = 'enum E { case a\n  var t: String { switch self { case .a: return "A" } }\n}\nenum F { case decoy }';
  assert.deepEqual(KINDS['swift-enum'](scoped, d({ symbol: 'E' })), ['a']);
  assert.throws(() => KINDS['swift-enum'](scoped, d({ symbol: 'Missing' })), ExtractError);
  assert.throws(() => KINDS['swift-enum'](scoped, d()), /requires a "symbol:"/);
});

test('swift-const-array: #if, interpolation, concatenation, and non-string members are sentinels', () => {
  assert.throws(() => KINDS['swift-const-array']('let A = [\n#if DEBUG\n"x",\n#endif\n]', d({ symbol: 'A' })), /#if/);
  assert.throws(() => KINDS['swift-const-array']('let A = ["x\\(y)"]', d({ symbol: 'A' })), /interpolation/);
  assert.throws(() => KINDS['swift-const-array']('let A = ["x"] + more', d({ symbol: 'A' })), /concatenat/);
  assert.throws(() => KINDS['swift-const-array']('let A = ["x", someVar]', d({ symbol: 'A' })), EnvelopeError);
  assert.throws(() => KINDS['swift-const-array']('let A = ["it\\u{2019}s"]', d({ symbol: 'A' })), /escape sequence/);
});

test('swift-const-array: computed initializers, missing symbols, and absent symbol option extract-fail', () => {
  assert.throws(() => KINDS['swift-const-array']('static let all: [String] = core + regional', d({ symbol: 'all' })), ExtractError);
  assert.throws(() => KINDS['swift-const-array']('let labels = all.map { $0.capitalized }', d({ symbol: 'labels' })), ExtractError);
  assert.throws(() => KINDS['swift-const-array']('let B = ["x"]', d({ symbol: 'A' })), ExtractError);
  assert.throws(() => KINDS['swift-const-array']('let A = ["x"]', d()), /requires a "symbol:"/);
});

test('swift-const-array: duplicates are emitted as read — the caller diff makes the finding (§3.5)', () => {
  assert.deepEqual(KINDS['swift-const-array']('static let A = ["x", "y", "x"]', d({ symbol: 'A' })), ['x', 'y', 'x']);
});

test('yaml kinds: invalid YAML, missing path, and non-mapping targets extract-fail loudly', () => {
  assert.throws(() => KINDS['yaml-keys']('a: [unclosed', d()), /not valid YAML/);
  assert.throws(() => KINDS['yaml-keys']('- just\n- a\n- sequence', d()), /needs a mapping/);
  const doc = 'a:\n  b:\n    k1: 1\n    k2: 2\n  seq: [1]\n';
  assert.deepEqual(KINDS['yaml-map-keys'](doc, d({ symbol: 'a.b' })), ['k1', 'k2']);
  assert.throws(() => KINDS['yaml-map-keys'](doc, d({ symbol: 'a.missing' })), /not found/);
  assert.throws(() => KINDS['yaml-map-keys'](doc, d({ symbol: 'a.seq' })), /needs a mapping/);
  assert.throws(() => KINDS['yaml-map-keys'](doc, d()), /requires a "symbol:"/);
});

test('yaml kinds coerce-refuse non-string keys: byte-exact §3.5 equality cannot hold for a coerced key', () => {
  // Bare `true:` coerces; quoted `"true":` is indistinguishable after load —
  // both refuse. Numeric keys the same. `on` loads as the string "on" under
  // YAML 1.2 (js-yaml) and passes, as do quoted digit-leading keys.
  assert.throws(() => KINDS['yaml-keys']('true: 1\nother: 2', d()), EnvelopeError);
  assert.throws(() => KINDS['yaml-keys']('"true": 1', d()), EnvelopeError);
  assert.throws(() => KINDS['yaml-keys']('2027: 1', d()), /not provably a string/);
  assert.deepEqual(KINDS['yaml-keys']('on: 1\n"2027-preview": 2', d()), ['on', '2027-preview']);
  assert.throws(() => KINDS['yaml-map-keys']('m:\n  null: 1', d({ symbol: 'm' })), EnvelopeError);
});

test('strings-keys dispatches by file extension — .strings grammar vs .xcstrings JSON; neither extension refuses', () => {
  const dot = '"k.one" = "v";\n"k.two" = "a = b";';
  assert.deepEqual(KINDS['strings-keys'](dot, d({ source: 'en.lproj/Localizable.strings' })), ['k.one', 'k.two']);
  const xc = JSON.stringify({ sourceLanguage: 'en', strings: { 'cta.go': {}, 'cta.stop': {} }, version: '1.0' });
  assert.deepEqual(KINDS['strings-keys'](xc, d({ source: 'Localizable.xcstrings' })), ['cta.go', 'cta.stop']);
  assert.throws(() => KINDS['strings-keys'](dot, d({ source: 'Localizable.txt' })), /file extension/);
});

test('strings-keys (.strings): malformed pairs and out-of-grammar content are envelope sentinels', () => {
  const src = (body) => KINDS['strings-keys'](body, d({ source: 'L.strings' }));
  assert.throws(() => src('"key" = "value"'), EnvelopeError); // missing ;
  assert.throws(() => src('"key" "value";'), EnvelopeError); // missing =
  assert.throws(() => src('key = "value";'), EnvelopeError); // unquoted key
  assert.throws(() => src('"key\\n.esc" = "v";'), /escape sequence/); // escape in the KEY facet
  assert.deepEqual(src('/* c */ "k" = "say \\"hi\\"";'), ['k']); // escapes in VALUES are fine
  assert.throws(() => src('/* only comments */'), ExtractError); // nothing to extract
});

test('strings-keys (.xcstrings): invalid JSON and a missing/non-object "strings" block extract-fail', () => {
  const xc = (body) => KINDS['strings-keys'](body, d({ source: 'L.xcstrings' }));
  assert.throws(() => xc('{ not json'), /not valid JSON/);
  assert.throws(() => xc('{"version": "1.0"}'), /not found/);
  assert.throws(() => xc('{"strings": ["array"]}'), /needs an object/);
});
