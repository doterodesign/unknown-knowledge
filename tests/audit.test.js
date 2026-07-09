// KK-12: reverse audit (PRD §4) — the code→store scan. Advisory by design:
// it proposes concepts (drafted YAML ready for human review), it never gates.
// Scoped by survey-scope.yaml (excluded areas are never rescanned); stale
// last-verified checked only against an injected --today (no wall-clock
// inside diffable output). Tested through the public seam: the CLI process —
// exit codes and output ARE the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const cli = fileURLToPath(new URL('../payload/engine/audit.js', import.meta.url));
const tsApp = fileURLToPath(new URL('../fixtures/ts-app', import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function runJson(root, expectedStatus, ...args) {
  const r = run('--root', root, '--json', ...args);
  assert.equal(r.status, expectedStatus, `expected exit ${expectedStatus}, got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// --------------------------------------------- synthetic repos (scope, health)

function plantRepo(name, files) {
  const repo = join(mkdtempSync(join(tmpdir(), `kk12-${name}-`)), 'repo');
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

const ANCHOR_TS = "export const SPORTS = ['nfl', 'nba'];\n";
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

// ------------------------------------------------- fixture scan (acceptance)

test('ts-app fixture: audit rediscovers the wrong-pointer true home as an unmatched anchor — advisory exit 0', () => {
  const out = runJson(tsApp, 0);
  const unmatched = out.findings.filter((f) => f.code === 'unmatched-anchor');
  assert.ok(
    unmatched.some((f) => f.path === 'src/registry/locales.ts'),
    `expected src/registry/locales.ts among: ${unmatched.map((f) => f.path).join(', ')}`,
  );
  // Findings are advisory: they exist AND the exit code stays 0.
  assert.ok(out.findings.length > 0);
});

test('ts-app fixture: pointed-at anchors are matched, never findings', () => {
  const out = runJson(tsApp, 0);
  const paths = out.findings.map((f) => f.path);
  // K-101 points at sports.ts; K-110's folder identity covers src/verticals/**.
  assert.ok(!paths.includes('src/registry/sports.ts'), `sports.ts is pointed at by K-101: ${paths}`);
  assert.ok(!paths.some((p) => p?.startsWith('src/verticals/')), `src/verticals is K-110 folder identity: ${paths}`);
});

test("ts-app fixture: the kit's own store files are never audit findings", () => {
  const out = runJson(tsApp, 0);
  assert.ok(
    !out.findings.some((f) => f.path?.startsWith('unknown-knowledge/')),
    'the knowledge map must never be told to map itself',
  );
});

test('the repo root itself is never proposed as a concept (a draft for "." is pure noise)', () => {
  const out = runJson(tsApp, 0);
  assert.ok(!out.findings.some((f) => f.path === '.'), 'the "." dir-modules candidate must be filtered engine-side');
});

test('every unmatched-anchor finding carries a drafted concept proposal ready for review', () => {
  const out = runJson(tsApp, 0);
  const finding = out.findings.find((f) => f.code === 'unmatched-anchor' && f.path === 'src/registry/locales.ts');
  const draft = load(finding.draft);
  // §3.1 required fields are all present; the id is a deliberate NON-minted
  // placeholder — pasting a draft unedited must fail validation, never
  // silently mint an id outside the owning class's range (§3.5).
  for (const field of ['id', 'term', 'class', 'summary', 'status']) {
    assert.ok(field in draft, `draft is missing "${field}": ${finding.draft}`);
  }
  assert.ok(!/^K-[0-9]+$/.test(draft.id), 'draft id must not be a mintable K-NNN');
  assert.equal(draft.status, 'draft');
  assert.deepEqual(draft['source-of-truth'], ['src/registry/locales.ts']);
});

test('--fail-on-findings flips the same advisory run to exit 1 (for humans, never CI defaults)', () => {
  const r = run('--root', tsApp, '--json', '--fail-on-findings');
  assert.equal(r.status, 1, r.stderr);
  assert.ok(JSON.parse(r.stdout).findings.length > 0);
});

test('identical tree → byte-identical JSON (D-012 diffability, no wall-clock)', () => {
  const first = run('--root', tsApp, '--json');
  const second = run('--root', tsApp, '--json');
  assert.equal(first.stdout, second.stdout);
});

// ----------------------------------------------------- stale last-verified

test('--today flags concepts whose last-verified exceeds --stale-days', () => {
  const out = runJson(tsApp, 0, '--today', '2026-10-09', '--stale-days', '30');
  const stale = out.findings.filter((f) => f.code === 'stale-last-verified');
  assert.ok(stale.some((f) => f.concept === 'K-101'), JSON.stringify(stale));
  const k101 = stale.find((f) => f.concept === 'K-101');
  assert.equal(k101['last-verified'], '2026-07-08');
});

test('without --today the stale check is SKIPPED and says so — never a silent wall-clock read', () => {
  const out = runJson(tsApp, 0);
  assert.ok(!out.findings.some((f) => f.code === 'stale-last-verified'));
  assert.match(out.checks['stale-last-verified'], /skipped/);
});

test('--today also dates the drafted proposals (injectable, never wall-clock)', () => {
  const out = runJson(tsApp, 0, '--today', '2026-10-09');
  const finding = out.findings.find((f) => f.code === 'unmatched-anchor' && f.path === 'src/registry/locales.ts');
  assert.equal(load(finding.draft)['last-verified'], '2026-10-09');
});

test('malformed --today is a usage error (exit 2)', () => {
  const r = run('--root', tsApp, '--today', 'yesterday');
  assert.equal(r.status, 2);
});

test('malformed --stale-days is a usage error (exit 2)', () => {
  for (const bad of ['abc', '-5', '1.5']) {
    assert.equal(run('--root', tsApp, '--today', '2026-10-09', '--stale-days', bad).status, 2, bad);
  }
});

test('unknown flags and positional arguments are usage errors (exit 2)', () => {
  assert.equal(run('--root', tsApp, '--verbose').status, 2);
  assert.equal(run(tsApp).status, 2);
});

// ------------------------------------------------------- scope honoring

test('survey-scope.yaml excluded areas produce zero findings — never rescanned', () => {
  const repo = plantRepo('scope', {
    ...STORE_MIN,
    'src/sports.ts': ANCHOR_TS,
    'src/markets.ts': "export const MARKETS = ['spread'];\n",
    'legacy/old-registry.ts': "export const SPORTS = ['xfl'];\n",
    'survey-scope.yaml': 'schema-version: 1\ninclude: [src, unknown-knowledge]\nexclude: [legacy]\n',
  });
  const out = runJson(repo, 0);
  const paths = out.findings.map((f) => f.path);
  assert.ok(paths.includes('src/markets.ts'), `unpointed in-scope anchor must surface: ${paths}`);
  assert.ok(!paths.some((p) => p?.startsWith('legacy/')), `excluded area leaked into findings: ${paths}`);
});

test('a malformed survey-scope.yaml is an engine failure (exit 2), never a silently ignored boundary', () => {
  const repo = plantRepo('badscope', {
    ...STORE_MIN,
    'src/sports.ts': ANCHOR_TS,
    'survey-scope.yaml': 'schema-version: 1\ninclude: "src"\n',
  });
  const r = run('--root', repo, '--json');
  assert.equal(r.status, 2, r.stdout);
});

// -------------------------------------------------- single health model

test('an unhealthy store is an engine failure (exit 2) — matching against broken stores would misreport', () => {
  const repo = plantRepo('sick', {
    ...STORE_MIN,
    'unknown-knowledge/ontology/classes/900-dupe.yaml':
      'schema-version: 1\nentries:\n'
      + '  - id: K-100\n    term: Duplicate\n    class: 900-dupe\n'
      + '    summary: Same id minted twice.\n    status: active\n',
    'src/sports.ts': ANCHOR_TS,
  });
  const r = run('--root', repo, '--json');
  assert.equal(r.status, 2, r.stdout);
});

test('a repo with no stores at all still audits — everything is a proposal', () => {
  const repo = plantRepo('bare', { 'src/sports.ts': ANCHOR_TS });
  const out = runJson(repo, 0);
  assert.ok(out.findings.some((f) => f.code === 'unmatched-anchor' && f.path === 'src/sports.ts'));
});

// UCS-934. This test used to assert that the root store wins and the nested
// dir is kit zone. That was one of TWO defensible answers — the audit picked
// the root, every other surface picked the nested dir, and the repo silently
// read two different Stores. Neither guess is right for every repo: a client
// with a product `ontology/` wants the nested kit; a client who migrated their
// stores to the root wants the root. The engine cannot tell them apart, so it
// refuses rather than choose — every surface fails the same way.
test('a seeded kit dir alongside root-level stores is ambiguous: the audit refuses, never guesses', () => {
  const repo = plantRepo('twokits', {
    // Stores at the scan root itself (engine-fixture layout)…
    'ontology/_catalog.yaml': STORE_MIN['unknown-knowledge/ontology/_catalog.yaml'],
    'ontology/_rules.yaml': STORE_MIN['unknown-knowledge/ontology/_rules.yaml'],
    'ontology/classes/100-core.yaml': STORE_MIN['unknown-knowledge/ontology/classes/100-core.yaml'],
    'src/sports.ts': ANCHOR_TS,
    // …plus a leftover nested kit dir. Which store is authoritative?
    'unknown-knowledge/ontology/classes/100-old.yaml': 'schema-version: 1\nentries: []\n',
  });
  const r = run('--root', repo);
  assert.equal(r.status, 2, `an ambiguous layout is an engine failure: ${r.stdout}`);
  assert.match(r.stderr, /two candidate kit roots/);
  // The human is told how to disambiguate, not merely that something is wrong.
  assert.match(r.stderr, /Point --root at the intended kit root, or remove the stale one/);
});

test('a seeded kit dir alone is the Kit; the audit never proposes concepts for it', () => {
  const repo = plantRepo('seeded-only', { ...STORE_MIN, 'src/sports.ts': ANCHOR_TS });
  const out = runJson(repo, 0);
  assert.ok(
    !out.findings.some((f) => f.path?.startsWith('unknown-knowledge')),
    `the kit zone is never product surface: ${JSON.stringify(out.findings)}`,
  );
});

test('fully mapped repo, nothing stale: exit 0 with zero findings', () => {
  const repo = plantRepo('clean', { ...STORE_MIN, 'src/sports.ts': ANCHOR_TS });
  const out = runJson(repo, 0, '--today', '2026-01-20');
  assert.deepEqual(out.findings, []);
});

// ----------------------------------------------------------- human output

test('human output names itself advisory and points at the drafts', () => {
  const r = run('--root', tsApp);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /advisory/i);
  assert.doesNotMatch(r.stdout, /blocking/i);
});
