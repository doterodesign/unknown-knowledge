#!/usr/bin/env node
/**
 * KK-16: acceptance harness (PRD §10) — ONE deterministic run that maps each
 * acceptance criterion to explicit assertions against BOTH acceptance
 * fixtures (fixtures/swift-app + fixtures/ts-app) and prints a per-criterion
 * report. Zero-dependency node (D-002); everything is exercised through the
 * engine's public seams — the CLI processes — exactly like the unit suites,
 * so a criterion here is proven the same way a client would observe it.
 *
 * The PRD §10 table is the source of truth; each criterion is quoted verbatim
 * at its section below. Status vocabulary:
 *   PASS / FAIL  — asserted by this run (A1, A2, A3, A4, A6). A1 asserts the
 *                  KK-17 copy engine (manifest byte-for-byte, D-007/D-009,
 *                  re-seed refusal), KK-18 wrapper generation (registry
 *                  paths, §6 sentinel-append on a pre-existing AGENTS.md),
 *                  and the KK-19 npx init layer (headless cold-run on both
 *                  fixture apps: stack auto-detection, D-009 warning in
 *                  output + seeded README, git check-ignore sweep incl. the
 *                  gitignored-logs variant, D-006 no CI files) — A1 is now
 *                  fully asserted, no remaining seam;
 *   MANUAL       — A5: skills are prompts, so their test is a checklist,
 *                  never CI (the PRD's honest seam). The harness reports
 *                  where the checklists live without executing them.
 *
 * Exit codes: 0 = every asserted criterion (A1–A4, A6) passed;
 *             1 = at least one asserted check failed.
 * Determinism: fixed fixture inputs, no wall-clock reads, temp copies are
 * created fresh and removed per run.
 *
 * Usage: node acceptance/run.js        (or: npm run acceptance)
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { loadManifest, expandManifest, DEFAULT_ROOT, SEEDED_MANIFEST } from '../cli/lib/copy-payload.js';
import { SENTINEL_BEGIN, SENTINEL_END } from '../cli/lib/generate-wrappers.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const engine = (cli) => join(root, 'payload', 'engine', cli);
const fixture = (app) => join(root, 'fixtures', app);
const FIXTURES = ['swift-app', 'ts-app'];

function run(cli, ...args) {
  const r = spawnSync(process.execPath, [engine(cli), ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
function runJson(cli, expectedStatus, ...args) {
  const r = run(cli, ...args);
  assert.equal(r.status, expectedStatus,
    `${cli} ${args.join(' ')}: expected exit ${expectedStatus}, got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** A disposable copy of a fixture app (for checks that must mutate state). */
function withFixtureCopy(app, fn, { git = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `kk16-${app}-`));
  const copy = join(dir, app);
  try {
    cpSync(fixture(app), copy, { recursive: true });
    if (git) {
      for (const args of [['init', '-q'], ['add', '-A']]) {
        const r = spawnSync('git', ['-C', copy, ...args], { encoding: 'utf8' });
        assert.equal(r.status, 0, `git ${args[0]} in fixture copy: ${r.stderr}`);
      }
    }
    return fn(copy);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------ report plumbing

const report = [];
function criterion(id, checks, { note } = {}) {
  const results = [];
  for (const [desc, fn] of checks) {
    try {
      fn();
      results.push({ desc, ok: true });
    } catch (err) {
      results.push({ desc, ok: false, err: err.message });
    }
  }
  report.push({ id, results, note });
  return results;
}

// ==================================================================== A1
// PRD §10 A1 — "Init completes cold: CI runs `init` against each fixture;
// asserts the scaffold matches the payload manifest byte-for-byte; asserts
// acceptance fixtures are absent and selected-stack extractor fixtures (and
// only those) are present."
//
// KK-17 lands the manifest + copy engine and OWNS this wiring assertion
// (moved from KK-16): per stack selection combination (none / ts / swift /
// both — the fixtures' stacks and their unions), in a fresh temp dir, the
// harness cold-runs the copy engine through its public seam
// (cli/init-copy.js), diffs the scaffold against the payload manifest
// expansion byte-for-byte, asserts fixtures/tests absence (D-007) and
// stack-conditional pack presence (D-009), and asserts a second run refuses.
// KK-19 completes A1: the npx init layer (cli/init.js) is cold-run
// headlessly (--yes) on scratch copies of BOTH fixture apps — completes with
// no hand-fixing, auto-detection picks each fixture's stack, the D-009
// warning is in the output and the seeded README, the gitignored-logs
// variant warns with the negation rule, and no CI file is written (D-006).
const initCopy = join(root, 'cli', 'init-copy.js');
const initJs = join(root, 'cli', 'init.js');
const A1_SELECTIONS = [[], ['ts'], ['swift'], ['ts', 'swift']];

function walkSeed(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSeed(abs, base));
    else out.push(relative(base, abs).split('\\').join('/'));
  }
  return out.sort();
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kk17-a1-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

criterion('A1', A1_SELECTIONS.map((stacks) => [
  `copy engine cold-run [stacks: ${stacks.join('+') || 'none'}]: scaffold == manifest expansion byte-for-byte; fixtures/tests absent (D-007); selected packs and only those (D-009); second run refuses`,
  () => withTempDir((target) => {
    // Cold run through the public seam (no interactive state — flags only).
    const args = [initCopy, '--target', target, '--json'];
    if (stacks.length) args.push('--stacks', stacks.join(','));
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(r.status, 0, `init-copy failed: ${r.stderr}`);

    // Byte-for-byte: the seeded tree is EXACTLY the manifest expansion plus
    // the engine-generated files (kit.manifest.yaml stamp, create-dir
    // .gitkeeps) — every file identical to its payload source, nothing
    // else present.
    const manifest = loadManifest(root);
    const plan = expandManifest(manifest, stacks);
    const generated = [SEEDED_MANIFEST, ...manifest.create.map((d) => `${d}/.gitkeep`)];
    const seedRoot = join(target, DEFAULT_ROOT);
    const expected = [...plan.map((p) => p.to), ...generated].sort();
    assert.deepEqual(walkSeed(seedRoot), expected, 'seeded file set != manifest expansion');
    for (const { from, to } of plan) {
      assert.deepEqual(readFileSync(join(seedRoot, to)), readFileSync(from),
        `seeded ${to} is not byte-identical to its payload source`);
    }

    // D-007: no manifest source may sit outside payload/ (LICENSE/NOTICE
    // root-files excepted) or under the kit's fixtures/ or tests/.
    for (const { from } of plan) {
      const rel = relative(root, from);
      assert.ok(rel.startsWith('payload/') || ['LICENSE', 'NOTICE'].includes(rel),
        `manifest source outside payload/: ${rel}`);
      assert.ok(!rel.startsWith('fixtures/') && !rel.startsWith('tests/'),
        `acceptance-fixture/kit-test leakage: ${rel}`);
    }
    // Belt-and-suspenders on the seeded tree itself: no acceptance-fixture
    // markers landed (FIXTURE.md, the fixture apps' names).
    for (const rel of walkSeed(seedRoot)) {
      assert.ok(!/(^|\/)FIXTURE\.md$/.test(rel) && !/(swift|ts)-app/.test(rel),
        `acceptance-fixture artifact in seed: ${rel}`);
    }

    // D-009: the selected stacks' packs — and ONLY those — are present.
    const packs = new Set(walkSeed(seedRoot)
      .filter((f) => f.startsWith('engine/tests/fixtures/') && f !== 'engine/tests/fixtures/README.md')
      .map((f) => f.split('/')[3]));
    assert.deepEqual([...packs].sort(), [...stacks].sort(), 'stack packs != selection');

    // §6: a second run on the seeded target refuses cleanly, changing nothing.
    const again = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(again.status, 2, 'second run must refuse (exit 2)');
    assert.match(again.stderr, /refused/);
    assert.deepEqual(walkSeed(seedRoot), expected, 'refused run must not touch the seed');
  }),
]).concat([[
  // KK-18: init's wrapper half. Every registry platform lands its thin
  // pointer at the conventional path, and the §6 acceptance fixture variant
  // — a PRE-EXISTING root AGENTS.md — is sentinel-appended, never clobbered.
  'wrapper generation cold-run: every registry platform at its conventional path; a pre-existing root AGENTS.md is sentinel-appended, not clobbered (KK-18, §6)',
  () => withTempDir((target) => {
    const existing = '# Existing project contract\n\nhouse rules stay intact\n';
    writeFileSync(join(target, 'AGENTS.md'), existing);
    const manifest = loadManifest(root);
    const platformIds = Object.keys(manifest.platforms).sort();
    const r = spawnSync(process.execPath,
      [initCopy, '--target', target, '--platforms', platformIds.join(','), '--json'],
      { encoding: 'utf8' });
    assert.equal(r.status, 0, `init-copy failed: ${r.stderr}`);
    const { wrappers } = JSON.parse(r.stdout);
    assert.deepEqual(
      wrappers.map((w) => [w.platform, w.action]),
      platformIds.map((id) => [id, id === 'codex' ? 'appended' : 'created']),
      'every platform generates; the colliding shared file appends');

    for (const id of platformIds) {
      const text = readFileSync(join(target, manifest.platforms[id].target), 'utf8');
      assert.ok(text.includes(`${DEFAULT_ROOT}/protocol/AGENTS.md`),
        `${id} wrapper must point at the protocol contract`);
    }
    const agents = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    assert.ok(agents.startsWith(existing), 'pre-existing AGENTS.md content must survive byte-for-byte');
    assert.equal(agents.split(SENTINEL_BEGIN).length - 1, 1,
      'exactly one sentinel block appended');
    assert.ok(agents.includes(SENTINEL_END), 'sentinel block closed');
  }),
]]).concat(FIXTURES.map((app) => {
  // KK-19: the npx init layer, cold-run headlessly (--yes) on a scratch
  // copy of each fixture app — a virgin client repo (the fixture's planted
  // store removed; a real pre-init repo has none).
  const expected = app === 'ts-app' ? 'ts' : 'swift';
  return [
    `npx init cold-run on ${app} (--yes, headless): completes with no hand-fixing; auto-detection picks ${expected}; D-009 warning in output + seeded README; clean sweep silent; no CI files written (D-006) (KK-19)`,
    () => withFixtureCopy(app, (copy) => {
      rmSync(join(copy, 'unknown-knowledge'), { recursive: true, force: true });
      const r = spawnSync(process.execPath, [initJs, 'init', '--yes', '--target', copy], { encoding: 'utf8' });
      assert.equal(r.status, 0, `init failed on ${app}: ${r.stderr}`);
      assert.match(r.stdout, new RegExp(`stack auto-detection: ${expected}\\n`),
        `auto-detection must pick ${expected} for ${app}`);
      assert.match(r.stdout, new RegExp(`seeded ${DEFAULT_ROOT}/ .*stacks: ${expected}`));
      // D-009 later-stacks warning: printed AND carried by the seeded README.
      assert.match(r.stdout, /adopt another stack later.*no update channel/s);
      assert.match(readFileSync(join(copy, DEFAULT_ROOT, 'README.md'), 'utf8'),
        /adopt another stack later, you author your own pack/);
      // Phase-2 handoff (D-019 name).
      assert.match(r.stdout, /now run \/knowledge-bootstrap in your agent/);
      // Detected pack — and only it — shipped (D-009).
      const packs = readdirSync(join(copy, DEFAULT_ROOT, 'engine/tests/fixtures'), { withFileTypes: true })
        .filter((e) => e.isDirectory()).map((e) => e.name);
      assert.deepEqual(packs, [expected]);
      // Clean repo: the git check-ignore sweep runs and stays silent. (The
      // dependency preflight may warn — a scratch copy resolves no js-yaml —
      // so this pins the sweep, not every possible warning.)
      assert.ok(!/WARN: .*gitignored/.test(r.stderr), `clean fixture repo must not warn: ${r.stderr}`);
      assert.ok(!/WARN: not a git repo/.test(r.stderr), `fixture copy must be a git repo: ${r.stderr}`);
      // D-006: no CI mutation, ever.
      assert.ok(!existsSync(join(copy, '.github')), 'init must not create .github/ (no platforms selected)');
    }, { git: true }),
  ];
})).concat([[
  'npx init gitignored-logs variant: a scratch .gitignore ignoring logs → WARN + the negation rule to add (a gitignored findings log kills the improvement loop silently) (KK-19, §6)',
  () => withFixtureCopy('ts-app', (copy) => {
    rmSync(join(copy, 'unknown-knowledge'), { recursive: true, force: true });
    writeFileSync(join(copy, '.gitignore'), 'logs\n');
    const r = spawnSync(process.execPath, [initJs, 'init', '--yes', '--target', copy], { encoding: 'utf8' });
    assert.equal(r.status, 0, `gitignore findings must warn, never fail the seed: ${r.stderr}`);
    assert.match(r.stderr, /WARN: .*gitignored/);
    assert.match(r.stderr, new RegExp(`${DEFAULT_ROOT}/logs/findings/\\.gitkeep`));
    assert.match(r.stderr, new RegExp(`!${DEFAULT_ROOT}/logs/\\*\\*`), 'the negation rule to add must be printed');
  }, { git: true }),
]]), { note: 'copy engine + platform wrappers + npx init cold-run — KK-17/KK-18/KK-19, fully asserted' });

// ==================================================================== A2
// PRD §10 A2 — "Extraction works: every MVP kind vs. fixture anchors →
// expected value sets; malformed descriptors hard-error; `dir-modules`
// options exercised."
//
// The fixture descriptors pin the FIXTURE.md expected value sets, so
// "exit 0, zero findings" IS "extracted set == expected set" (§3.5 set
// equality through the validator's own diff).
criterion('A2', [
  ['ts-app: all 10 clean anchors extract to their expected sets (every TS MVP kind; dir-modules plain K-110 + pattern/strip K-111; .tsx K-107; plain .js K-114)', () => {
    const out = runJson('validate-values.js', 0, '--root', fixture('ts-app'), '--json',
      '--concepts', 'K-101,K-103,K-105,K-106,K-107,K-109,K-110,K-111,K-112,K-114');
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out['hard-errors'], []);
    assert.equal(out.checked.filter((c) => !c.skipped).length, 10);
  }],
  ['swift-app: clean anchors extract to their expected sets (swift-enum raw-value facet K-120, swift-const-array K-130, yaml-keys K-140)', () => {
    const out = runJson('validate-values.js', 0, '--root', fixture('swift-app'), '--json',
      '--concepts', 'K-120,K-130,K-140');
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out['hard-errors'], []);
    assert.equal(out.checked.filter((c) => !c.skipped).length, 3);
  }],
  ['ts-app: out-of-envelope anchors HARD-ERROR (exit 2) — spread K-113, computed key K-115, re-export barrel K-116 — never a partial value set', () => {
    const out = runJson('validate-values.js', 2, '--root', fixture('ts-app'), '--json',
      '--concepts', 'K-113,K-115,K-116');
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out['hard-errors'].map((e) => [e.concept, e.code]),
      [['K-113', 'out-of-envelope'], ['K-115', 'out-of-envelope'], ['K-116', 'out-of-envelope']]);
  }],
  ['swift-app: out-of-envelope anchor (#if in the enum span, K-180) HARD-ERRORS (exit 2)', () => {
    const out = runJson('validate-values.js', 2, '--root', fixture('swift-app'), '--json',
      '--concepts', 'K-180');
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out['hard-errors'].map((e) => [e.concept, e.code]), [['K-180', 'out-of-envelope']]);
    assert.match(out['hard-errors'][0].message, /#if/);
  }],
]);

// ==================================================================== A3
// PRD §10 A3 — "Drift is caught: planted drift in fixtures: registry value
// with no concept and the reverse; CI asserts the correct finding kind fires
// in each direction; wrong-pointer (all-values-missing) signature detected."
criterion('A3', [
  ['ts-app: exactly the three tabulated findings — value-not-in-source (K-102 "futures"), source-value-missing (K-104 "crypto"), wrong-pointer (K-108) — exit 1', () => {
    const out = runJson('validate-values.js', 1, '--root', fixture('ts-app'), '--json',
      '--concepts', 'K-102,K-104,K-108');
    assert.deepEqual(out['hard-errors'], []);
    assert.deepEqual(out.findings.map((f) => [f.concept, f.code, f.value ?? null]), [
      ['K-102', 'value-not-in-source', 'futures'],
      ['K-104', 'source-value-missing', 'crypto'],
      ['K-108', 'wrong-pointer', null],
    ]);
  }],
  ['swift-app: exactly the four tabulated findings, both directions (K-110 drifts both ways at once) — exit 1', () => {
    const out = runJson('validate-values.js', 1, '--root', fixture('swift-app'), '--json',
      '--concepts', 'K-110,K-150,K-160');
    assert.deepEqual(out['hard-errors'], []);
    assert.deepEqual(out.findings.map((f) => [f.concept, f.code, f.value ?? null]), [
      ['K-110', 'source-value-missing', 'tennis'],
      ['K-110', 'value-not-in-source', 'cricket'],
      ['K-150', 'source-value-missing', '2027-preview'],
      ['K-160', 'value-not-in-source', 'cta.transfer'],
    ]);
  }],
  ['swift-app: wrong-pointer signature (K-170: all claimed values missing from a real, parseable file) — one finding, no cascade', () => {
    const out = runJson('validate-values.js', 1, '--root', fixture('swift-app'), '--json',
      '--concepts', 'K-170');
    assert.deepEqual(out['hard-errors'], []);
    assert.deepEqual(out.findings.map((f) => [f.concept, f.code]), [['K-170', 'wrong-pointer']]);
  }],
]);

// ==================================================================== A4
// PRD §10 A4 — "Resolution works: fixture queries → expected ranked concepts;
// confusable-with surfaced; CLI exit codes correct."
const A4_QUERIES = {
  'swift-app': { query: 'sport', top: 'K-110', confusable: 'K-130' },
  'ts-app': { query: 'sport', top: 'K-101', confusable: 'K-113' },
};
criterion('A4', FIXTURES.flatMap((app) => {
  const { query, top, confusable } = A4_QUERIES[app];
  return [
    [`${app}: query "${query}" ranks ${top} first (exact-term, score 100) with confusable-with ${confusable} surfaced — exit 0`, () => {
      const out = runJson('resolve.js', 0, query, '--root', fixture(app), '--json');
      const first = out.results[0];
      assert.equal(first.id, top);
      assert.equal(first.score, 100);
      assert.equal(first.match, 'exact-term');
      assert.ok(first['confusable-with'].some((c) => c.id === confusable),
        `confusable-with must surface ${confusable}: ${JSON.stringify(first['confusable-with'])}`);
    }],
    [`${app}: zero-hit query is a normal outcome — exit 0, explicit empty result`, () => {
      const out = runJson('resolve.js', 0, 'zzz-no-such-term', '--root', fixture(app), '--json');
      assert.deepEqual(out.results, []);
    }],
    [`${app}: usage error (unknown flag) exits 2`, () => {
      const r = run('resolve.js', 'sport', '--root', fixture(app), '--no-such-flag');
      assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
    }],
  ];
}));

// ==================================================================== A5 (MANUAL)
// PRD §10 A5 — "Protocols are executable: scripted walkthrough per skill
// against a fixture: checklist of expected artifacts (…). Walkthroughs are
// wall-clock timed (…). Documented acceptance runs — the honest seam: skills
// are prompts, so their test is a checklist, not CI."
//
// Never executed here, by design. The harness only points at the checklists;
// acceptance/README.md indexes them (landed + still to come with KK-21/22/23).
const A5_CHECKLISTS = readdirSync(join(root, 'acceptance'))
  .filter((f) => /^A5-.*\.md$/.test(f)).sort()
  .map((f) => `acceptance/${f}`);
report.push({
  id: 'A5',
  manual: `checklist(s) at ${A5_CHECKLISTS.join(', ') || '(none yet)'} — walkthrough-tested, never CI; index in acceptance/README.md`,
});

// ==================================================================== A6
// PRD §10 A6 — "Engine additions are proven: kit CI: survey-map candidate
// list contains every planted anchor and discloses unsurveyed paths (KK-25);
// preflight exit-code contract incl. store-wide failure → all-unknown
// (KK-26); suppression filtering, fail-open malformed entries, governance
// grep (KK-27); no-code-execution grep (D-014)."
const PLANTED_ANCHORS = {
  // FIXTURE.md §1 (swift-app) / A2 table (ts-app): every planted anchor a
  // concept points at must appear in the survey-map candidate list.
  'swift-app': [
    ['swift-enum', 'Sources/Sportsbook/Sport.swift'],
    ['swift-const-array', 'Sources/Sportsbook/Markets.swift'],
    ['swift-const-array', 'Sources/Settings/Theme.swift'],
    ['yaml-keys', 'Config/app-config.yaml'],
    ['yaml-map-keys', 'Config/feature-flags.yaml'],
    ['strings-keys', 'Resources/en.lproj/Localizable.strings'],
    ['strings-keys', 'Resources/Localizable.xcstrings'],
  ],
  'ts-app': [
    ['ts-const-array', 'src/registry/sports.ts'],
    ['ts-union', 'src/types/bet-status.ts'],
    ['ts-enum', 'src/types/currency.ts'],
    ['ts-object-keys', 'src/registry/promotions.ts'],
    ['ts-object-keys', 'src/components/StatusBadge.tsx'],
    ['ts-const-array', 'src/registry/loyalty-tiers.js'],
    ['json-keys', 'config/features.json'],
    ['json-map-keys', 'package.json'],
    ['dir-modules', 'src/verticals'],
    ['dir-modules', 'src/routes'],
  ],
};
const A6_PREFLIGHT = {
  // clean concepts / a drifting concept per fixture (FIXTURE.md tables).
  'swift-app': { clean: 'K-120,K-130', drift: 'K-110' },
  'ts-app': { clean: 'K-101,K-103', drift: 'K-102' },
};

criterion('A6', [
  ...FIXTURES.map((app) => [
    `${app}: survey-map candidate list contains every planted anchor; unsurveyed disclosure present (KK-25)`, () => {
      const out = runJson('survey-map.js', 0, '--root', fixture(app), '--json');
      const have = new Set(out.candidates.map((c) => `${c.kind} ${c.path}`));
      for (const [kind, path] of PLANTED_ANCHORS[app]) {
        assert.ok(have.has(`${kind} ${path}`), `missing planted anchor: ${kind} ${path}`);
      }
      assert.ok(Array.isArray(out.unsurveyed), 'unsurveyed: disclosure must always be present');
    },
  ]),
  ...FIXTURES.map((app) => [
    `${app}: preflight exit-code contract — clean concepts trusted (exit 0), planted drift quarantined (exit 1) (KK-26)`, () => {
      const clean = runJson('preflight.js', 0, '--root', fixture(app), '--json', '--concepts', A6_PREFLIGHT[app].clean);
      assert.equal(clean['store-verdict'], 'trusted');
      assert.equal(clean.counts.quarantined + clean.counts.unknown, 0);
      const drift = runJson('preflight.js', 1, '--root', fixture(app), '--json', '--concepts', A6_PREFLIGHT[app].drift);
      assert.equal(drift.counts.quarantined, 1);
    },
  ]),
  ...FIXTURES.map((app) => [
    `${app}: preflight store-wide failure degrades ALL requested verdicts to unknown — exit 2 (KK-26)`, () => {
      withFixtureCopy(app, (copy) => {
        // Corrupt the ontology catalog: a loader-level error, not a concept-level one.
        appendFileSync(join(copy, 'unknown-knowledge', 'ontology', '_catalog.yaml'), '\nentries: [\n');
        const requested = `${A6_PREFLIGHT[app].clean},${A6_PREFLIGHT[app].drift}`;
        const out = runJson('preflight.js', 2, '--root', copy, '--json', '--concepts', requested);
        assert.equal(out['store-verdict'], 'unknown');
        assert.equal(out.counts.unknown, requested.split(',').length);
        assert.equal(out.counts.trusted + out.counts.quarantined, 0);
      });
    },
  ]),
  ...FIXTURES.map((app) => [
    `${app}: audit suppression filtering — exact-match entry filters its finding, others survive; malformed file fails open (KK-27)`, () => {
      withFixtureCopy(app, (copy) => {
        const suppressions = join(copy, 'unknown-knowledge', 'suppressions.yaml');
        // Baseline: the fixture plants unmatched anchors; audit is advisory (exit 0).
        const base = runJson('audit.js', 0, '--root', copy, '--json');
        assert.ok(base.findings.length >= 1, 'fixture must yield at least one advisory finding');
        const target = base.findings[0];
        const term = /(?:^|\n)term: (.+)/.exec(target.draft)[1];
        // Exact-match suppression (D-013): that finding gone, counted, rest survive.
        writeFileSync(suppressions,
          `- term: ${term}\n  sourcePath: ${target.path}\n  reason: acceptance-harness planted suppression\n  date: "2026-07-08"\n`);
        const after = runJson('audit.js', 0, '--root', copy, '--json');
        assert.equal(after.counts.suppressed, 1);
        assert.equal(after.findings.length, base.findings.length - 1);
        assert.ok(!after.findings.some((f) => f.path === target.path), 'suppressed finding leaked');
        // Fail-open: a malformed suppressions file warns and suppresses NOTHING (never exit 2).
        writeFileSync(suppressions, '{ not: [ yaml\n');
        const open = runJson('audit.js', 0, '--root', copy, '--json');
        assert.equal(open.counts.suppressed, 0);
        assert.equal(open.findings.length, base.findings.length);
      }, { git: true });
    },
  ]),
  ...FIXTURES.map((app) => [
    `${app}: audit stays advisory with findings present — exit 0, proposal-first, never a gate (KK-27 governance behavior)`, () => {
      const out = runJson('audit.js', 0, '--root', fixture(app), '--json');
      assert.ok(out.findings.length >= 1);
      assert.ok(out.findings.every((f) => f.severity === 'advisory'));
    },
  ]),
  ['payload/: governance grep — every shipped mention of --fail-on-findings carries the "never a CI default" framing (KK-27)', () => {
    let mentioned = 0;
    for (const file of payloadFiles()) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('--fail-on-findings')) continue;
      mentioned += 1;
      assert.match(text, /\bnever\b/i,
        `${relative(root, file)} mentions --fail-on-findings without the "never" framing`);
    }
    assert.ok(mentioned >= 1, 'grep exercised nothing — did the flag move?');
  }],
  ['payload/: no-code-execution grep — no eval/new Function/dynamic import of repo content; child_process only in survey-map.js, spawning the fixed git binary (D-014)', () => {
    for (const file of payloadFiles()) {
      if (!/\.(js|mjs|cjs)$/.test(file)) continue;
      const rel = relative(root, file);
      const text = readFileSync(file, 'utf8');
      assert.ok(!/\beval\s*\(|new Function\s*\(/.test(text), `${rel}: eval/new Function is forbidden (D-014)`);
      assert.ok(!/\bimport\s*\(/.test(text), `${rel}: dynamic import() is forbidden (D-014)`);
      if (/node:child_process/.test(text)) {
        assert.equal(rel, join('payload', 'engine', 'survey-map.js'),
          `${rel}: child_process outside the allowlisted git ls-files call (D-014)`);
        assert.match(text, /spawnSync\('git',/, 'survey-map may only spawn the fixed git binary');
      }
    }
  }],
]);

function payloadFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) out.push(path);
    }
  };
  walk(join(root, 'payload'));
  return out.sort();
}

// ------------------------------------------------------------------ report

const TITLES = {
  A1: 'Init completes cold',
  A2: 'Extraction works',
  A3: 'Drift is caught',
  A4: 'Resolution works',
  A5: 'Protocols are executable',
  A6: 'Engine additions are proven',
};

let failed = false;
process.stdout.write(
  'unknown-knowledge acceptance harness (KK-16) — PRD §10 criteria vs fixtures/swift-app + fixtures/ts-app\n\n');
for (const entry of report.sort((a, b) => a.id.localeCompare(b.id))) {
  const { id } = entry;
  if (entry.deferred) {
    process.stdout.write(`${id}: DEFERRED — ${TITLES[id]}: ${entry.deferred}\n`);
    continue;
  }
  if (entry.manual) {
    process.stdout.write(`${id}: MANUAL — ${TITLES[id]}: ${entry.manual}\n`);
    continue;
  }
  const bad = entry.results.filter((r) => !r.ok);
  const status = bad.length === 0 ? 'PASS' : 'FAIL';
  if (bad.length > 0) failed = true;
  const note = entry.note ? ` (${entry.note})` : '';
  process.stdout.write(`${id}: ${status}${note} — ${TITLES[id]}: ${entry.results.length - bad.length}/${entry.results.length} checks\n`);
  for (const r of entry.results) {
    process.stdout.write(`    ${r.ok ? 'ok  ' : 'FAIL'}  ${r.desc}\n`);
    if (!r.ok) process.stdout.write(`          ${r.err.split('\n').join('\n          ')}\n`);
  }
}
process.stdout.write(failed
  ? '\nresult: FAIL — at least one asserted criterion (A1-A4, A6) has failing checks\n'
  : '\nresult: OK — all asserted criteria (A1-A4, A6) pass; A5 manual by design\n');
process.exitCode = failed ? 1 : 0;
