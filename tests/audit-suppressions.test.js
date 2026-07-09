// KK-27: audit suppressions — minimal exact-match core (D-013 §11.1). A
// client-zone suppressions.yaml in the kit zone filters findings by EXACT
// identity match: { term, sourcePath, reason, date }, no patterns, no expiry.
// Suppression is advisory-side and FAILS OPEN — the opposite of the scope
// file: malformed entries (or a malformed file) warn and suppress nothing,
// never exit 2. Tested through the public seam: the CLI process, against
// synthetic git repos planted per test (staged files are survey-visible).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../payload/engine/audit.js', import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function runJson(root, expectedStatus, ...args) {
  const r = run('--root', root, '--json', ...args);
  assert.equal(r.status, expectedStatus, `expected exit ${expectedStatus}, got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function plantRepo(name, files) {
  const repo = join(mkdtempSync(join(tmpdir(), `kk27-${name}-`)), 'repo');
  mkdirSync(repo, { recursive: true });
  const git = (...args) => {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args[0]}: ${result.stderr}`);
  };
  git('init', '-q');
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), content);
  }
  git('add', '-A');
  return repo;
}

const STORE_MIN = {
  'unknown-knowledge/ontology/_catalog.yaml':
    'schema-version: 1\nstore: ontology\nentries:\n  - id: K-100\n    title: Sport\n    file: classes/100-core.yaml\n',
  'unknown-knowledge/ontology/_rules.yaml': 'schema-version: 1\nstore: ontology\nrules: []\n',
  'unknown-knowledge/ontology/classes/100-core.yaml':
    'schema-version: 1\nentries:\n'
    + '  - id: K-100\n    term: Sport\n    class: 100-core\n'
    + '    summary: Bettable sports.\n    source-of-truth: [src/sports.ts]\n'
    + '    status: active\n    last-verified: "2026-01-10"\n',
};

// Two unpointed anchors so every scenario has both a suppressed and a
// surviving finding to assert against.
const ANCHORS = {
  'src/sports.ts': "export const SPORTS = ['nfl', 'nba'];\n",
  'src/markets.ts': "export const MARKETS = ['spread'];\n",
  'src/locales.ts': "export const LOCALES = ['en', 'de'];\n",
};

const SUPPRESS_MARKETS =
  '- term: markets\n'
  + '  sourcePath: src/markets.ts\n'
  + '  reason: vendored table, owned upstream\n'
  + '  date: "2026-07-01"\n';

// ------------------------------------------------- exact-match core (accept)

test('a planted suppression filters its finding: gone from findings, counted, listed in full under suppressions', () => {
  const repo = plantRepo('basic', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml': SUPPRESS_MARKETS,
  });
  const out = runJson(repo, 0);
  const paths = out.findings.map((f) => f.path);
  assert.ok(!paths.includes('src/markets.ts'), `suppressed finding leaked: ${paths}`);
  assert.ok(paths.includes('src/locales.ts'), `unsuppressed finding must survive: ${paths}`);
  assert.equal(out.counts.suppressed, 1);
  assert.equal(out.counts.findings, out.findings.length);
  // Full suppressed list in JSON output — the whole finding, draft included.
  assert.equal(out.suppressions.suppressed.length, 1);
  const sup = out.suppressions.suppressed[0];
  assert.equal(sup.code, 'unmatched-anchor');
  assert.equal(sup.path, 'src/markets.ts');
  assert.ok(sup.draft, 'suppressed findings keep their drafted proposal');
  assert.deepEqual(out.suppressions.warnings, []);
});

test('human output shows the suppressed count, not the suppressed drafts', () => {
  const repo = plantRepo('human', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml': SUPPRESS_MARKETS,
  });
  const r = run('--root', repo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 suppressed \(suppressions\.yaml\)/);
  assert.doesNotMatch(r.stdout, /src\/markets\.ts/);
});

test('exact match only: a near-miss sourcePath (or term) suppresses nothing — no patterns in v1', () => {
  const repo = plantRepo('nearmiss', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml':
      // Wrong path for the term, and a glob that must be treated literally.
      '- term: markets\n  sourcePath: src/market.ts\n  reason: typo\n  date: "2026-07-01"\n'
      + '- term: locales\n  sourcePath: src/*.ts\n  reason: glob attempt\n  date: "2026-07-01"\n',
  });
  const out = runJson(repo, 0);
  assert.equal(out.counts.suppressed, 0);
  const paths = out.findings.map((f) => f.path);
  assert.ok(paths.includes('src/markets.ts') && paths.includes('src/locales.ts'), paths);
});

test('unmatched-anchor identity is term AND path together — right path with wrong term does not match', () => {
  const repo = plantRepo('termcheck', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml':
      '- term: renamed-concept\n  sourcePath: src/markets.ts\n  reason: stale after rename\n  date: "2026-07-01"\n',
  });
  const out = runJson(repo, 0);
  assert.equal(out.counts.suppressed, 0, 'a suppression whose term no longer matches must stop suppressing');
});

test('stale-last-verified findings suppress by concept id in BOTH fields (a concept has no file path)', () => {
  const repo = plantRepo('stale', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml':
      '- term: K-100\n  sourcePath: K-100\n  reason: verification scheduled for Q4\n  date: "2026-07-01"\n',
  });
  const out = runJson(repo, 0, '--today', '2026-10-09', '--stale-days', '30');
  assert.ok(!out.findings.some((f) => f.code === 'stale-last-verified'), JSON.stringify(out.findings));
  assert.ok(out.suppressions.suppressed.some((f) => f.code === 'stale-last-verified' && f.concept === 'K-100'));
});

test('--fail-on-findings honors suppression: a fully suppressed run exits 0', () => {
  const repo = plantRepo('failflag', {
    ...STORE_MIN,
    'src/markets.ts': ANCHORS['src/markets.ts'],
    'unknown-knowledge/suppressions.yaml': SUPPRESS_MARKETS,
  });
  const r = run('--root', repo, '--json', '--fail-on-findings');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(JSON.parse(r.stdout).counts.suppressed, 1);
});

// ------------------------------------------- malformed = warn-and-fail-OPEN

test('a malformed entry warns AND its finding resurfaces — never silently suppressed', () => {
  const repo = plantRepo('badentry', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml':
      // Missing `reason` — would otherwise exactly match src/markets.ts.
      '- term: markets\n  sourcePath: src/markets.ts\n  date: "2026-07-01"\n',
  });
  const out = runJson(repo, 0);
  assert.equal(out.suppressions.warnings.length, 1);
  assert.match(out.suppressions.warnings[0], /entry 1 ignored/);
  assert.ok(out.findings.some((f) => f.path === 'src/markets.ts'), 'the finding must resurface (fails open)');
  assert.equal(out.counts.suppressed, 0);
  // The warning also reaches human eyes.
  const human = run('--root', repo);
  assert.match(human.stdout, /warning: suppressions\.yaml: entry 1 ignored/);
});

test('v1 entries are strict: an unknown field (e.g. a pattern/expiry knob) is malformed, warn + resurface', () => {
  const repo = plantRepo('strict', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml':
      '- term: markets\n  sourcePath: src/markets.ts\n  reason: r\n  date: "2026-07-01"\n  expires: "2027-01-01"\n',
  });
  const out = runJson(repo, 0);
  assert.match(out.suppressions.warnings[0] ?? '', /unknown field.*expires/);
  assert.ok(out.findings.some((f) => f.path === 'src/markets.ts'));
});

test('one malformed entry never poisons the others: valid siblings still suppress', () => {
  const repo = plantRepo('mixed', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml':
      '- not a mapping\n' + SUPPRESS_MARKETS,
  });
  const out = runJson(repo, 0);
  assert.equal(out.suppressions.warnings.length, 1);
  assert.equal(out.counts.suppressed, 1);
  assert.ok(!out.findings.some((f) => f.path === 'src/markets.ts'));
});

test('a whole-file failure (unparseable YAML / wrong shape) warns and fails open — NEVER exit 2', () => {
  for (const [name, content] of [
    ['unparseable', 'term: [unclosed\n'],
    ['notalist', 'suppressions:\n  - term: markets\n'],
  ]) {
    const repo = plantRepo(name, {
      ...STORE_MIN, ...ANCHORS,
      'unknown-knowledge/suppressions.yaml': content,
    });
    const out = runJson(repo, 0); // advisory-side: never an engine failure
    assert.equal(out.suppressions.warnings.length, 1, name);
    assert.match(out.suppressions.warnings[0], /fails open/, name);
    assert.ok(out.findings.some((f) => f.path === 'src/markets.ts'), `${name}: findings must resurface`);
  }
});

test('missing suppressions.yaml is a plain no-op: no warnings, nothing suppressed', () => {
  const repo = plantRepo('absent', { ...STORE_MIN, ...ANCHORS });
  const out = runJson(repo, 0);
  assert.deepEqual(out.suppressions, { warnings: [], suppressed: [] });
  assert.equal(out.counts.suppressed, 0);
});

// -------------------------------------------------- location + determinism

test('stores-at-root layout: suppressions.yaml sits at the root beside survey-scope.yaml and is kit zone, never a finding', () => {
  const repo = plantRepo('atroot', {
    'ontology/_catalog.yaml': STORE_MIN['unknown-knowledge/ontology/_catalog.yaml'],
    'ontology/_rules.yaml': STORE_MIN['unknown-knowledge/ontology/_rules.yaml'],
    'ontology/classes/100-core.yaml': STORE_MIN['unknown-knowledge/ontology/classes/100-core.yaml'],
    ...ANCHORS,
    'suppressions.yaml': SUPPRESS_MARKETS,
  });
  const out = runJson(repo, 0);
  assert.equal(out.counts.suppressed, 1);
  assert.ok(!out.findings.some((f) => f.path === 'suppressions.yaml'), 'the suppression file itself is kit zone');
});

test('identical tree with suppressions → byte-identical JSON (D-012: stable sort, no wall clock)', () => {
  const repo = plantRepo('diffable', {
    ...STORE_MIN, ...ANCHORS,
    'unknown-knowledge/suppressions.yaml': SUPPRESS_MARKETS,
  });
  const first = run('--root', repo, '--json');
  const second = run('--root', repo, '--json');
  assert.equal(first.stdout, second.stdout);
});
