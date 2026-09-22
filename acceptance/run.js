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
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { loadManifest, expandManifest, DEFAULT_ROOT, SEEDED_MANIFEST } from '../cli/lib/copy-payload.js';
import { SENTINEL_BEGIN, SENTINEL_END } from '../cli/lib/generate-wrappers.js';
import { isOwnEngineImport } from './lib/engine-module-import.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const engine = (cli) => join(root, 'payload', 'engine', cli);
const fixture = (app) => join(root, 'fixtures', app);
const FIXTURES = ['swift-app', 'ts-app'];
// UCS-1159's isolated plant stores. Deliberately NOT in FIXTURES: those are
// whole app fixtures that must load clean and are cold-run by A1's init
// checks, whereas these are knowledge-only stores that each fail to LOAD by
// design — one planted defect apiece, asserted at exit 2. They are listed
// here so the D-007 leakage sweep covers their names too.
const PLANT_STORES = ['plant-duplicate-accession', 'plant-unresolved-relates'];

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
    // the engine-generated files (kit.manifest.yaml stamp, installation identity, create-dir
    // .gitkeeps) — every file identical to its payload source, nothing
    // else present.
    const manifest = loadManifest(root);
    const plan = expandManifest(manifest, stacks);
    const generated = [SEEDED_MANIFEST, '_identity.yaml', ...manifest.create.map((d) => `${d}/.gitkeep`)];
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
    // markers landed (FIXTURE.md, the fixture apps' names, and UCS-1159's
    // plant-store names — a client repo must never receive a store that is
    // planted to fail loading).
    const leakMarkers = new RegExp(`(swift|ts)-app|${PLANT_STORES.join('|')}`);
    for (const rel of walkSeed(seedRoot)) {
      assert.ok(!/(^|\/)FIXTURE\.md$/.test(rel) && !leakMarkers.test(rel),
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
  ['ts-app: all 10 clean anchors extract to their expected sets (every TS MVP kind; dir-modules plain O-000010 + pattern/strip O-000011; .tsx O-000007; plain .js O-000014)', () => {
    const out = runJson('validate-values.js', 0, '--root', fixture('ts-app'), '--json',
      '--concepts', 'O-000001,O-000003,O-000005,O-000006,O-000007,O-000009,O-000010,O-000011,O-000012,O-000014');
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out['hard-errors'], []);
    assert.equal(out.checked.filter((c) => !c.skipped).length, 10);
  }],
  ['swift-app: clean anchors extract to their expected sets (swift-enum raw-value facet O-000002, swift-const-array O-000003, yaml-keys O-000004)', () => {
    const out = runJson('validate-values.js', 0, '--root', fixture('swift-app'), '--json',
      '--concepts', 'O-000002,O-000003,O-000004');
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out['hard-errors'], []);
    assert.equal(out.checked.filter((c) => !c.skipped).length, 3);
  }],
  ['ts-app: out-of-envelope anchors HARD-ERROR (exit 2) — spread O-000013, computed key O-000015, re-export barrel O-000016 — never a partial value set', () => {
    const out = runJson('validate-values.js', 2, '--root', fixture('ts-app'), '--json',
      '--concepts', 'O-000013,O-000015,O-000016');
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out['hard-errors'].map((e) => [e.concept, e.code]),
      [['O-000013', 'out-of-envelope'], ['O-000015', 'out-of-envelope'], ['O-000016', 'out-of-envelope']]);
  }],
  ['swift-app: out-of-envelope anchor (#if in the enum span, O-000008) HARD-ERRORS (exit 2)', () => {
    const out = runJson('validate-values.js', 2, '--root', fixture('swift-app'), '--json',
      '--concepts', 'O-000008');
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out['hard-errors'].map((e) => [e.concept, e.code]), [['O-000008', 'out-of-envelope']]);
    assert.match(out['hard-errors'][0].message, /#if/);
  }],
]);

// ==================================================================== A3
// PRD §10 A3 — "Drift is caught: planted drift in fixtures: registry value
// with no concept and the reverse; CI asserts the correct finding kind fires
// in each direction; wrong-pointer (all-values-missing) signature detected."
criterion('A3', [
  ['ts-app: exactly the three tabulated findings — value-not-in-source (O-000002 "luminosity"), source-value-missing (O-000004 "video"), wrong-pointer (O-000008) — exit 1', () => {
    const out = runJson('validate-values.js', 1, '--root', fixture('ts-app'), '--json',
      '--concepts', 'O-000002,O-000004,O-000008');
    assert.deepEqual(out['hard-errors'], []);
    assert.deepEqual(out.findings.map((f) => [f.concept, f.code, f.value ?? null]), [
      ['O-000002', 'value-not-in-source', 'luminosity'],
      ['O-000004', 'source-value-missing', 'video'],
      ['O-000008', 'wrong-pointer', null],
    ]);
  }],
  ['swift-app: exactly the four tabulated findings, both directions (O-000001 drifts both ways at once) — exit 1', () => {
    const out = runJson('validate-values.js', 1, '--root', fixture('swift-app'), '--json',
      '--concepts', 'O-000001,O-000005,O-000006');
    assert.deepEqual(out['hard-errors'], []);
    assert.deepEqual(out.findings.map((f) => [f.concept, f.code, f.value ?? null]), [
      ['O-000001', 'source-value-missing', 'comment'],
      ['O-000001', 'value-not-in-source', 'eyedropper'],
      ['O-000005', 'source-value-missing', '2027-preview'],
      ['O-000006', 'value-not-in-source', 'cta.publish'],
    ]);
  }],
  ['swift-app: wrong-pointer signature (O-000007: all claimed values missing from a real, parseable file) — one finding, no cascade', () => {
    const out = runJson('validate-values.js', 1, '--root', fixture('swift-app'), '--json',
      '--concepts', 'O-000007');
    assert.deepEqual(out['hard-errors'], []);
    assert.deepEqual(out.findings.map((f) => [f.concept, f.code]), [['O-000007', 'wrong-pointer']]);
  }],

  // ---------------------------------------------- UCS-1159: the five v2 plants
  // The frontmatter-v2 half of "drift is caught": five deliberate plants, each
  // asserted as its own golden, per the expected-finding table in
  // fixtures/ts-app/FIXTURE.md. One invocation per plant is not incidental —
  // it is what keeps a plant from masking another, and for the two
  // loader-level plants it is the ONLY way to observe them, since a store that
  // fails to load reports its diagnostic and nothing else.
  //
  // Both registry-membership plants share the code `unregistered-value`, so
  // the assertions pin `path` too: the code alone does not discriminate them.
  ['UCS-1159 plant 1/5 — stale volatile leaf: K-000002 is `volatile`, verified 2026-01-05, so at --today 2026-08-16 it is 223 days past the 90-day limit → preflight `stale` verdict, exit 1 (never the wall clock)', () => {
    const out = runJson('preflight.js', 1, '--root', fixture('ts-app'), '--json',
      '--leaves', 'K-000002', '--today', '2026-08-16');
    assert.equal(out.counts.stale, 1);
    assert.equal(out.counts.quarantined + out.counts.unknown, 0);
    const [leaf] = out['leaf-verdicts'];
    assert.equal(leaf.leaf, 'K-000002');
    assert.equal(leaf.verdict, 'stale');
    assert.equal(leaf.time.volatility, 'volatile');
    assert.equal(leaf.time.limit, 90);
    assert.equal(leaf.time.stale, true);
  }],
  ['UCS-1159 plant 1/5 control — the SAME run at a --today inside the window returns the leaf to `trusted`: the plant is the date arithmetic, not a broken record', () => {
    const out = runJson('preflight.js', 0, '--root', fixture('ts-app'), '--json',
      '--leaves', 'K-000002', '--today', '2026-02-01');
    assert.equal(out.counts.stale, 0);
    assert.equal(out['leaf-verdicts'][0].verdict, 'trusted');
  }],
  ['UCS-1159 plants 2/5 + 4/5 — jurisdiction mismatch (`applies.jurisdictions[0]` = eu-eaa, registry empty) and unregistered facet value (`facets.form` = walkthrough): exactly two `unregistered-value` findings, exit 1, store still LOADS clean', () => {
    const out = runJson('validate.js', 1, '--root', fixture('ts-app'), '--json');
    // The soft plants are value defects, not load defects: the store must stay
    // healthy or the fixture-store pin test (and these findings) would vanish.
    assert.deepEqual(out['store-health'], { ok: true, errors: 0, warnings: 0 });
    assert.deepEqual(out.findings.map((f) => [f.code, f.id, f.path]), [
      ['unregistered-value', 'K-000001', 'applies.jurisdictions[0]'],
      ['unregistered-value', 'K-000001', 'facets.form'],
    ]);
  }],
  ['UCS-1159 plant 5/5 — duplicate accession: two well-formed leaves mint K-000001, so the loader refuses the later mint → one `duplicate-id` plus ambiguous canonical identity, exit 2, in its OWN store', () => {
    const r = run('validate.js', '--root', fixture('plant-duplicate-accession'), '--json');
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
    const lines = r.stderr.trim().split('\n').filter((l) => /^\s+\S/.test(l));
    assert.equal(lines.length, 2, `duplicate and ambiguous identity diagnostics expected: ${r.stderr}`);
    assert.match(lines[0], /^\s+invalid-identity.*identity K-000001: ambiguous/);
    assert.match(lines[1], /^\s+duplicate-id\s+knowledge\/product\/100.2-registering-a-new-export-format\.md\s+id\s/);
    assert.match(lines[1], /id "K-000001" is already minted in knowledge\/product\/100.1-adding-a-new-export-format\.md/);
  }],
  ['UCS-1159 plant 3/5 — unresolvable relates ref: a well-formed `relates.see-also` cites K-000999, which nothing mints → exactly one `unresolved-ref`, exit 2, in its OWN store', () => {
    const r = run('validate.js', '--root', fixture('plant-unresolved-relates'), '--json');
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
    const lines = r.stderr.trim().split('\n').filter((l) => /^\s+\S/.test(l));
    assert.equal(lines.length, 1, `exactly one diagnostic expected: ${r.stderr}`);
    assert.match(lines[0], /^\s+unresolved-ref\s+knowledge\/product\/100.1-adding-a-new-export-format\.md\s+relates\.see-also\[0\]\s/);
    assert.match(lines[0], /relates\.see-also ref "K-000999" does not resolve/);
  }],
  ['UCS-1159 invariant — no plant masks another: each plant store carries exactly ONE defect, and the main store\'s three plants are all observable in the same pair of runs (the reason the two loader-fatal plants live in isolated roots)', () => {
    // Each isolated root reports its own plant and nothing else — proven by the
    // one-diagnostic assertions above. Here we pin the complement: the main
    // store's plants never degrade its load, so they can never hide each other.
    const out = runJson('validate.js', 1, '--root', fixture('ts-app'), '--json');
    assert.equal(out['store-health'].ok, true, 'a loader-fatal plant in the main store would mask the others');
    assert.equal(out.findings.length, 2, 'both registry plants observable in one run');
    const both = runJson('preflight.js', 1, '--root', fixture('ts-app'), '--json',
      '--leaves', 'K-000001,K-000002', '--today', '2026-08-16');
    // The stale plant sits on its own leaf, so it neither hides nor is hidden
    // by the registry plants: one run shows BOTH, and shows them as different
    // verdicts — K-000001 quarantined for its two registry findings, K-000002
    // stale for its age. Distinct leaves, distinct verdicts, one invocation.
    assert.deepEqual(both['leaf-verdicts'].map((v) => [v.leaf, v.verdict]),
      [['K-000001', 'quarantined'], ['K-000002', 'stale']]);
    assert.equal(both.counts.quarantined, 1);
    assert.equal(both.counts.stale, 1);
  }],
]);

// ==================================================================== A4
// PRD §10 A4 — "Resolution works: fixture queries → expected ranked concepts;
// confusable-with surfaced; CLI exit codes correct."
const A4_QUERIES = {
  'swift-app': { query: 'canvas tool', top: 'O-000001', confusable: 'O-000003' },
  'ts-app': { query: 'export format', top: 'O-000001', confusable: 'O-000013' },
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
      const r = run('resolve.js', 'export', '--root', fixture(app), '--no-such-flag');
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
    ['swift-enum', 'Sources/Canvas/CanvasTool.swift'],
    ['swift-const-array', 'Sources/Canvas/Actions.swift'],
    ['swift-const-array', 'Sources/Settings/Theme.swift'],
    ['yaml-keys', 'Config/app-config.yaml'],
    ['yaml-map-keys', 'Config/feature-flags.yaml'],
    ['strings-keys', 'Resources/en.lproj/Localizable.strings'],
    ['strings-keys', 'Resources/Localizable.xcstrings'],
  ],
  'ts-app': [
    ['ts-const-array', 'src/registry/export-formats.ts'],
    ['ts-union', 'src/types/release-status.ts'],
    ['ts-enum', 'src/types/color-space.ts'],
    ['ts-object-keys', 'src/registry/panels.ts'],
    ['ts-object-keys', 'src/components/StatusBadge.tsx'],
    ['ts-const-array', 'src/registry/plan-tiers.js'],
    ['json-keys', 'config/features.json'],
    ['json-map-keys', 'package.json'],
    ['dir-modules', 'src/verticals'],
    ['dir-modules', 'src/routes'],
  ],
};
const A6_PREFLIGHT = {
  // clean concepts / a drifting concept per fixture (FIXTURE.md tables).
  'swift-app': { clean: 'O-000002,O-000003', drift: 'O-000001' },
  'ts-app': { clean: 'O-000001,O-000003', drift: 'O-000002' },
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
  ['payload/: no-client-code-execution grep — fixed Git plumbing and captured trusted-engine checks only (D-014)', () => {
    // The fixed historical distribution is still inspected by every code guard.
    // Its complete file inventory additionally binds unchanged reviewed bytes.
    const historicalRoot = 'payload/engine/compatibility/identity-migration-08066b5/';
    const historicalProfile = JSON.parse(readFileSync(join(root, 'payload/engine/policies/identity-migration-08066b5.json'), 'utf8'));
    const historicalFiles = payloadFiles().filter((file) => relative(root, file).startsWith(historicalRoot));
    assert.deepEqual(historicalFiles.map((file) => relative(root, file)),
      historicalProfile.files.map((row) => `payload/${row.path}`));
    for (const row of historicalProfile.files) {
      const bytes = readFileSync(join(root, 'payload', row.path));
      assert.equal(bytes.length, row.size, `${row.path}: reviewed historical size`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, `${row.path}: reviewed historical bytes`);
    }
    // These fixed launch points run installed engine code, never candidate code.
    // The real candidate-engine nonexecution regression lives in prepared-validation.test.js.
    const preparedLaunches = new Map([
      ['prepared-runtime.js', { method: 'spawnSync', call: /spawnSync\(path, args, \{ env, cwd: work,/,
        boundaries: [/node: realpathSync\(process\.execPath\), git: realpathSync\('\/usr\/bin\/git'\)/,
          /version: probe\(path, \['--version'\]\)/, /probe\(paths\.git, \['--exec-path'\]\)/] }],
      ['prepared-worker-process.js', { method: 'spawn', call: /spawn\(runtime\.manifest\.executables\.node\.path,/,
        boundaries: [/join\(runtime\.root, entrypoint\), jobFile/,
          /if \(!\['validation', 'final-assignment', 'final-migration', 'final-equivalent-merge', 'final-subject-retirement', 'final-subject-split', 'final-subject-reconsideration', 'final-subject-metadata', 'final-subject-proposal-suppression', 'final-subject-creation', 'final-promotion', 'final-record-promotion'\]\.includes\(kind\)\)/,
          /kind === 'validation'\s*\? 'engine\/lib\/prepared-validation-worker\.js' : kind === 'final-assignment'\s*\? 'engine\/lib\/final-assignment-check\.js' : kind === 'final-migration'\s*\? 'engine\/lib\/final-migration-check\.js' : kind === 'final-equivalent-merge'\s*\? 'engine\/lib\/final-equivalent-merge-check\.js' : kind === 'final-subject-retirement'\s*\? 'engine\/lib\/final-subject-retirement-check\.js' : kind === 'final-subject-split'\s*\? 'engine\/lib\/final-subject-split-check\.js' : kind === 'final-subject-reconsideration'\s*\? 'engine\/lib\/final-subject-reconsideration-check\.js' : kind === 'final-subject-metadata'\s*\? 'engine\/lib\/final-subject-metadata-check\.js' : kind === 'final-subject-proposal-suppression'\s*\? 'engine\/lib\/final-subject-proposal-suppression-check\.js' : kind === 'final-subject-creation'\s*\? 'engine\/lib\/final-subject-creation-check\.js' : kind === 'final-record-promotion'\s*\? 'engine\/lib\/final-record-promotion-check\.js' : 'engine\/lib\/final-promotion-check\.js'/,
          /cwd: runtime\.root, env: runtime\.env, detached: true/] }],
      ['prepared-engine-process.js', { method: 'spawn', call: /spawn\(manifest\.executables\.node\.path, \[join\(runtime, entrypoint\), \.\.\.args\]/,
        boundaries: [/Object\.hasOwn\(entries, check\.kind\)/,
          /const args = invocation\(check\); const entrypoint = entries\[check\.kind\]/,
          /cwd: runtime, env: process\.env, stdio:/,
          /const entries = Object\.freeze\(\{\s*structural: 'engine\/validate\.js',\s*values: 'engine\/validate-values\.js',\s*assignment: 'engine\/lib\/prepared-assignment-check\.js',\s*migration: 'engine\/lib\/prepared-migration-check\.js',\s*promotion: 'engine\/lib\/prepared-promotion-check\.js',\s*'record-promotion': 'engine\/lib\/prepared-record-promotion-check\.js',\s*'equivalent-merge': 'engine\/lib\/prepared-equivalent-merge-check\.js',\s*'subject-split': 'engine\/lib\/prepared-subject-split-check\.js',\s*'subject-metadata': 'engine\/lib\/prepared-subject-metadata-check\.js',\s*'subject-proposal-suppression': 'engine\/lib\/prepared-subject-proposal-suppression-check\.js',\s*'subject-reconsideration': 'engine\/lib\/prepared-subject-reconsideration-check\.js',\s*'subject-creation': 'engine\/lib\/prepared-subject-creation-check\.js',\s*'subject-retirement': 'engine\/lib\/prepared-subject-retirement-check\.js',\s*'historical-structural': 'engine\/compatibility\/identity-migration-08066b5\/engine\/validate\.js',\s*'historical-values': 'engine\/compatibility\/identity-migration-08066b5\/engine\/validate-values\.js',\s*'ordinary-historical': 'engine\/compatibility\/identity-migration-08066b5\/engine\/resolve\.js',\s*'ordinary-current': 'engine\/resolve\.js',\s*'historical-audit': 'engine\/compatibility\/identity-migration-08066b5\/engine\/audit\.js',\s*'current-audit': 'engine\/audit\.js',\s*\}\)/] }],
    ].map(([name, checks]) => [join('payload', 'engine', 'lib', name), checks]));
    const validationWorker = readFileSync(join(root, 'payload/engine/lib/prepared-validation-worker.js'), 'utf8');
    assert.match(validationWorker, /const runtime = fileURLToPath\(new URL\('\.\.\/\.\.\/', import\.meta\.url\)\)/);
    assert.match(validationWorker, /for \(const entry of VALIDATION_ENTRYPOINTS\) await runCheck\(entry, candidate\.root\)/);
    assert.match(validationWorker, /await runCheck\(ASSIGNMENT_ENTRYPOINT, candidate\.root\)/);
    assert.match(validationWorker, /await runCheck\(MIGRATION_ENTRYPOINT, candidate\.root\)/);
    assert.match(validationWorker, /executePreparedEngineCheck\(runtime, job\.manifest, job\.limits, selected\)/);
    for (const file of payloadFiles()) {
      if (!/\.(js|mjs|cjs)$/.test(file)) continue;
      const rel = relative(root, file);
      // Comments are prose, not code: a doc comment that NAMES `import()` to
      // explain why the shim uses one must not read as a violation of D-014.
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      assert.ok(!/\beval\s*\(|new Function\s*\(/.test(text), `${rel}: eval/new Function is forbidden (D-014)`);
      // D-014 forbids importing REPO CONTENT — the client's code. The entry
      // shims (UCS-956) must reach the engine through `import()` so a module
      // load failure is catchable and exits 2 rather than 1 (FINDINGS). What
      // makes that safe is that every specifier is a STRING LITERAL naming the
      // engine's own files: there is no variable a client path could reach.
      // A computed specifier — `import(path)`, or a template — is refused.
      for (const [, spec] of text.matchAll(/\bimport\s*\(([^)]*)\)/g)) {
        // Commands may reach sibling engine libraries. Check the actual file
        // boundary, including symlinks, rather than assuming a shim's depth.
        assert.ok(isOwnEngineImport(spec, file, join(root, 'payload', 'engine')),
          `${rel}: import(${spec.trim()}) — only a string-literal import of the engine's own modules is allowed (D-014)`);
      }
      if (/['"](?:node:)?child_process['"]/.test(text)) {
        assert.doesNotMatch(text, /shell\s*:\s*true|['"](?:checkout|checkout-index|archive)['"]/);
        if (rel === join('payload', 'engine', 'lib', 'candidate-ref-transaction.js')) {
          assert.match(text, /import\s*\{\s*spawn\s*\}\s*from\s*'node:child_process'/);
          assert.equal([...text.matchAll(/['"](?:node:)?child_process['"]/g)].length, 1);
          assert.equal([...text.matchAll(/\bspawn\s*\(/g)].length, 2);
          assert.equal([...text.matchAll(/spawn\('\/usr\/bin\/git',/g)].length, 2);
          assert.match(text, /'update-ref', '--no-deref', '--stdin', '-z'/);
          assert.match(text, /core\.hooksPath=\/dev\/null/);
          assert.doesNotMatch(text, /shell\s*:|['"](?:fetch|pull|reset|stash|add)['"]/);
          continue;
        }
        const prepared = preparedLaunches.get(rel);
        if (prepared) {
          assert.equal([...text.matchAll(/['"](?:node:)?child_process['"]/g)].length, 1,
            `${rel}: exactly one approved child_process import, without additional methods or module aliases`);
          assert.match(text, new RegExp(`import\\s*\\{\\s*${prepared.method}\\s*\\}\\s*from\\s*'node:child_process'`));
          assert.equal([...text.matchAll(/\b(?:spawnSync|spawn)\s*\(/g)].length, 1,
            `${rel}: exactly one fixed trusted launch point`);
          assert.match(text, prepared.call, `${rel}: fixed executable and arguments`);
          for (const boundary of prepared.boundaries) assert.match(text, boundary, `${rel}: trusted runtime boundary`);
          assert.doesNotMatch(text, /shell\s*:/, `${rel}: trusted checks must not invoke a shell`);
          continue;
        }
        if (rel === join('payload', 'engine', 'lib', 'migration-activation.js')) {
          assert.equal([...text.matchAll(/\bspawnSync\s*\(/g)].length, 1);
          assert.match(text, /spawnSync\('\/usr\/bin\/git', \['-c', 'core.fsmonitor=false', '-C', root, \.\.\.args\]/);
          assert.match(text, /git\(\['config', '--null', '--get-all', 'core.hooksPath'\]\)/);
          assert.match(text, /git\(\['ls-files', '--stage', '-z'\]\)/);
          assert.match(text, /git\(\['rev-parse', '--verify', request.publish.outputRef\]\)/);
          assert.doesNotMatch(text, /shell\s*:|['"](?:fetch|pull|reset|checkout|update-ref|add|commit)['"]/);
          continue;
        }
        if (rel === join('payload', 'engine', 'lib', 'migration-consumer-proof.js')) {
          assert.equal([...text.matchAll(/\bspawnSync\s*\(/g)].length, 1);
          assert.match(text, /spawnSync\('git',/);
          assert.match(text, /git\(\['init', '--quiet', '--template='\]\)/);
          assert.match(text, /git\(\['add', '--all', '--force', '--', '\.'\]\)/);
          assert.match(text, /core\.hooksPath=\/dev\/null/);
          assert.match(text, /GIT_CONFIG_GLOBAL: '\/dev\/null'/);
          assert.doesNotMatch(text, /shell\s*:|['"](?:fetch|pull|reset|checkout|update-ref)['"]/);
          continue;
        }
        const capturedReaders = [
          join('payload', 'engine', 'lib', 'captured-source.js'),
          join('payload', 'engine', 'lib', 'identity-migration-source.js'),
          join('payload', 'engine', 'lib', 'prepared-migration-gate.js'),
        ];
        const historicalGit = [
          join('payload', 'engine', 'compatibility', 'identity-migration-08066b5', 'engine', 'commands', 'survey-map.js'),
          join('payload', 'engine', 'compatibility', 'identity-migration-08066b5', 'engine', 'lib', 'commit-snapshot.js'),
        ];
        if (historicalGit.includes(rel)) {
          assert.match(text, /import\s*\{\s*spawnSync\s*\}\s*from\s*'node:child_process'/);
          assert.equal([...text.matchAll(/['"](?:node:)?child_process['"]/g)].length, 1);
          assert.equal([...text.matchAll(/\b(?:spawnSync|spawn)\s*\(/g)].length, 1);
          assert.match(text, /spawnSync\('git',/);
          assert.doesNotMatch(text, /shell\s*:/);
        }
        assert.ok([join('payload', 'engine', 'commands', 'survey-map.js'),
          join('payload', 'engine', 'lib', 'commit-snapshot.js'),
          join('payload', 'engine', 'lib', 'prepare-candidate.js'), ...capturedReaders, ...historicalGit].includes(rel),
        `${rel}: child_process outside Git navigation/snapshot orchestration (D-014)`);
        assert.match(text, /spawnSync\('git',/, 'only the fixed git binary may be spawned');
        if (capturedReaders.includes(rel)) {
          assert.match(text, /import\s*\{\s*spawnSync\s*\}\s*from\s*'node:child_process'/,
            `${rel}: captured readers import only synchronous Git spawning`);
          assert.equal([...text.matchAll(/\bspawnSync\s*\(/g)].length, 1,
            `${rel}: every subprocess uses the single fixed Git runner`);
          assert.doesNotMatch(text, /['"](?:write-tree|update-ref|hash-object|fetch|pull)['"]|shell\s*:/,
            `${rel}: captured readers must not write Git state, fetch objects, or invoke a shell`);
        }
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
