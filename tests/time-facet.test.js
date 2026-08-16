// UCS-1150: the Time facet — `verified` + `volatility` producing pinned
// trusted/stale verdicts.
//
// Freshness made visible. Every leaf may carry a verified date and a volatility
// class, and the engine turns those two facts into a verdict every projection
// reads. Four things are pinned here, and each fails differently:
//
//   1. THE THRESHOLDS ARE EXACT. `static` never stales; `stable` flips at the
//      365/366-day boundary and `volatile` at 90/91. Both limits are pinned
//      from BOTH sides by golden fixtures, because "more than a year old" and
//      "a year or more old" differ by exactly one day and nothing in the phrase
//      says which. An off-by-one here silently re-dates the whole store.
//   2. A STALE LEAF IS DEMOTED EVERYWHERE, WITH ITS REASON, AND NEVER HIDDEN.
//      Resolver ranking and preflight leaf verdicts are the projections that
//      exist today; both read ONE verdict function, so neither can rank a leaf
//      stale while the other calls it trusted. A demotion, never a filter.
//   3. WITHOUT AN INJECTED TODAY THE CHECK SAYS IT WAS SKIPPED. The engine
//      never reads the wall clock (D-012), and a check that never ran is never
//      a silent pass (PRD §5) — so `skipped` is a verdict class the output
//      prints, not an absence a reader has to notice.
//   4. A NON-STATIC LEAF MISSING ITS DATE IS A FINDING; A STATIC ONE IS CLEAN.
//      And that finding is date-FREE, so the baseline finding set is identical
//      on every run forever.
//
// Tested through the public seams — the CLI process for validator, resolver and
// preflight (exit codes and JSON output ARE the contract, PRD §5), direct
// import for the pure verdict function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import {
  TIME_VERDICTS, VOLATILITY_CLASSES, VOLATILITY_LIMITS, leafVerified, leafVolatility,
  timeCheckStatus, timeVerdict,
} from '../payload/engine/lib/time-verdicts.js';
import { CHECKS } from '../payload/engine/commands/validate.js';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) => join(root, 'tests/fixtures/structural-validator', name);

const CLEAN = fixture('time-facet');
const FINDINGS = fixture('time-facet-findings');

// The injected date every golden in this file is measured against. Pinned as a
// constant because it is the ONLY thing that makes these verdicts reproducible
// — the engine never reads the wall clock, so this file's expectations hold in
// 2027 exactly as they hold today.
const TODAY = '2026-08-16';

function runCli(command, ...args) {
  return spawnSync(process.execPath, [join(root, 'payload/engine', command), ...args], { encoding: 'utf8' });
}

function json(command, expectStatus, ...args) {
  const r = runCli(command, ...args, '--json');
  assert.equal(r.status, expectStatus, `expected exit ${expectStatus}, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** The knowledge entry points of the one concept the fixture store carries. */
const resolved = (...args) =>
  json('resolve.js', 0, 'freshness boundary', '--root', CLEAN, ...args).results[0].knowledge;

/** Leaf verdicts for the whole fixture set, in id order. */
const verdicts = (expectStatus, ...args) =>
  json('preflight.js', expectStatus, '--leaves',
    'L-000301,L-000302,L-000303,L-000304,L-000305,L-000306,L-000307',
    '--root', CLEAN, ...args)['leaf-verdicts'];

// ---------------- AC1: the thresholds are pinned exactly, at both boundaries

test('the pinned thresholds are 365 stable / 90 volatile / static never', () => {
  // The numbers themselves, read off the module rather than restated — a table
  // that drifted from the ticket would still pass a test asserting only the
  // verdicts it produces. Compared as ENTRIES because the table is
  // null-prototype (see the inherited-name regression below), and deepEqual
  // against an object literal would fail on the prototype rather than on any
  // threshold being wrong.
  assert.deepEqual(Object.entries(VOLATILITY_LIMITS).sort(), [
    ['stable', 365], ['static', Infinity], ['volatile', 90],
  ]);
  assert.deepEqual(VOLATILITY_CLASSES, ['stable', 'static', 'volatile']);
  assert.ok(Object.isFrozen(VOLATILITY_LIMITS), 'a mutated threshold would silently re-date the store');
});

test('stable flips at the 365/366-day boundary, volatile at 90/91 (golden)', () => {
  // THE acceptance golden. Each limit is pinned from both sides by a fixture
  // leaf dated exactly at it and exactly one day past it, so an off-by-one in
  // either direction fails here rather than silently re-dating every store.
  const byId = Object.fromEntries(resolved('--today', TODAY).map((k) => [k.id, k.time]));

  assert.equal(byId['L-000301'].age, 365, 'fixture must sit exactly at the stable limit');
  assert.equal(byId['L-000301'].verdict, 'trusted', '365 days is the last fresh day for stable');
  assert.equal(byId['L-000302'].age, 366, 'fixture must sit exactly one day past it');
  assert.equal(byId['L-000302'].verdict, 'stale', '366 days is the first stale day for stable');

  assert.equal(byId['L-000303'].age, 90, 'fixture must sit exactly at the volatile limit');
  assert.equal(byId['L-000303'].verdict, 'trusted', '90 days is the last fresh day for volatile');
  assert.equal(byId['L-000304'].age, 91, 'fixture must sit exactly one day past it');
  assert.equal(byId['L-000304'].verdict, 'stale', '91 days is the first stale day for volatile');

  // The threshold is read from the CLASS, not from one global age: 91 days
  // stales a volatile leaf while leaving a stable one comfortably fresh.
  assert.equal(byId['L-000304'].limit, 90);
  assert.equal(byId['L-000302'].limit, 365);
});

test('static NEVER stales, at any age and with no date at all (golden)', () => {
  const byId = Object.fromEntries(resolved('--today', TODAY).map((k) => [k.id, k.time]));
  // Sixteen years old and still trusted. `Infinity` is never exceeded, so the
  // comparison needs no special case and cannot acquire one by accident.
  assert.ok(byId['L-000305'].age > 6000, 'the fixture must actually be ancient');
  assert.equal(byId['L-000305'].verdict, 'trusted');
  assert.equal(byId['L-000305'].stale, false);
  // And with no date whatsoever — there is no age at which static would stale,
  // so there is no date that would make it.
  assert.equal(byId['L-000306'].verified, null);
  assert.equal(byId['L-000306'].verdict, 'trusted');

  // The published limit is an explicit null for static, never `Infinity`:
  // JSON.stringify turns Infinity into null SILENTLY, and the two are the same
  // bytes. What distinguishes "never stales" from "no limit applies" on the
  // wire is `volatility`, which is present either way.
  assert.equal(byId['L-000305'].limit, null);
  assert.equal(byId['L-000305'].volatility, 'static');
});

test('the fixture dates are the boundary dates, read off the files themselves', () => {
  // A fixture that drifted from the boundary would still pass every assertion
  // above — the verdicts would simply be pinning the wrong days. So the dates
  // are checked against the arithmetic they are supposed to embody.
  const dayBefore = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000)
    .toISOString().slice(0, 10);
  const leafOf = (file) => load(readFileSync(join(CLEAN, 'knowledge/freshness', file), 'utf8').split('---')[1]);

  assert.equal(leafOf('301.1-stable-at-the-limit.md').verified, dayBefore(365));
  assert.equal(leafOf('302.1-stable-past-the-limit.md').verified, dayBefore(366));
  assert.equal(leafOf('303.1-volatile-at-the-limit.md').verified, dayBefore(90));
  assert.equal(leafOf('304.1-volatile-past-the-limit.md').verified, dayBefore(91));
});

test('verified and volatility are TOP-LEVEL fields, not facets', () => {
  // The record shape the spec's prototype shows. `facets` is the
  // registry-governed classification of what a leaf IS; time is a governance
  // fact about the record's own upkeep, and putting it under `facets` would
  // have made it look like a vocabulary a project mints.
  const leaf = load(readFileSync(
    join(CLEAN, 'knowledge/freshness/301.1-stable-at-the-limit.md'), 'utf8').split('---')[1]);
  assert.equal(leaf.verified, '2025-08-16');
  assert.equal(leaf.volatility, 'stable');
  assert.equal(leaf.facets.verified, undefined, 'not under facets');
  assert.equal(leaf.facets.volatility, undefined, 'not under facets');
});

test('volatility is a closed schema ENUM — an unminted fourth class is refused', () => {
  // The deliberate departure from form/anchor/stage, which ship as registries a
  // project mints into. Each volatility value is a KEY INTO A PINNED NUMERIC
  // TABLE, so a project minting `glacial` by registry edit would produce leaves
  // with no threshold at all — a governed field silently ungoverned, which is
  // the failure class this engine exists to prevent.
  const leaf = load(readFileSync(
    join(CLEAN, 'knowledge/freshness/301.1-stable-at-the-limit.md'), 'utf8').split('---')[1]);
  for (const value of VOLATILITY_CLASSES) {
    assert.deepEqual(validateStoreFile('knowledge-leaf', { ...leaf, volatility: value }).errors, [],
      `${value} is one of the three`);
  }
  const { errors } = validateStoreFile('knowledge-leaf', { ...leaf, volatility: 'glacial' });
  assert.deepEqual(errors.map((e) => e.path), ['volatility'],
    'a class with no threshold is refused by the schema, not minted by a registry');

  // Every enum value must have a threshold, and every threshold an enum value —
  // a value the schema accepts and the table cannot price would verdict as
  // `exempt` and look governed while governing nothing.
  const schema = JSON.parse(readFileSync(
    join(root, 'payload/schemas/knowledge-leaf.schema.json'), 'utf8'));
  assert.deepEqual([...schema.properties.volatility.enum].sort(), VOLATILITY_CLASSES);
});

// ------- AC2: a stale leaf is demoted with its reason, in every projection

test('a stale leaf is DEMOTED in resolver ranking, and never hidden (golden)', () => {
  // The ranking golden. Order IS the demotion: both stale leaves sort below
  // every fresh one, through the same comparator the draft downrank already
  // used — one ordering rule, not two competing ones.
  const entries = resolved('--today', TODAY);
  assert.deepEqual(entries.map((k) => [k.id, k.downranked]), [
    ['L-000301', false], // stable, exactly at the limit
    ['L-000303', false], // volatile, exactly at the limit
    ['L-000305', false], // static, ancient
    ['L-000306', false], // static, undated
    ['L-000307', false], // exempt
    ['L-000302', true], //  stable, one day past — demoted
    ['L-000304', true], //  volatile, one day past — demoted
  ]);
  // NEVER a filter. Both stale leaves are still present: stale knowledge is
  // still the best answer when it is the only answer, and hiding it would send
  // the reader off to invent one instead.
  assert.equal(entries.length, 7, 'every leaf still surfaces — demotion, not omission');
});

test('the demotion carries its REASON, in JSON and on the human surface (golden)', () => {
  const stale = resolved('--today', TODAY).find((k) => k.id === 'L-000302');
  assert.deepEqual(stale.demotions, [
    {
      reason: 'time',
      detail: 'verified 366 day(s) ago, past the 365-day limit for stable knowledge — re-verify against the cited sources, or treat the claim as unverified (UCS-1150)',
    },
  ]);
  // A bare flag would say a leaf was demoted without saying why, and a demotion
  // a reader cannot explain is one they cannot act on.
  assert.equal(stale.time.verdict, 'stale');
  assert.equal(stale.time.age, 366);
  assert.equal(stale.time.limit, 365);

  // And it reaches the surface a human actually reads, on the line the ordering
  // already put the leaf on.
  const human = runCli('resolve.js', 'freshness boundary', '--root', CLEAN, '--today', TODAY);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /\[stale — stable verified 366d ago > 365d\]/);
  assert.match(human.stdout, /\[stale — volatile verified 91d ago > 90d\]/);
});

test('a stale leaf is demoted in preflight leaf verdicts too — one shared function', () => {
  // The second projection. Both surfaces call timeVerdict(), so a leaf ranked
  // stale by the resolver cannot be verdicted trusted by preflight — the same
  // discipline isPrePromotionStatus enforces one rung up.
  const byLeaf = Object.fromEntries(verdicts(1, '--today', TODAY).map((v) => [v.leaf, v]));
  assert.equal(byLeaf['L-000302'].verdict, 'stale');
  assert.equal(byLeaf['L-000304'].verdict, 'stale');
  assert.equal(byLeaf['L-000301'].verdict, 'trusted');
  assert.equal(byLeaf['L-000303'].verdict, 'trusted');

  // `stale` is its OWN verdict class, not a mapping onto unknown or
  // quarantined: nothing about a stale leaf is broken, and its checks DID run
  // and returned a definite answer. Folding it into either would tell a steward
  // to repair evidence that is fine, or to pass a flag they already passed.
  assert.deepEqual(byLeaf['L-000302'].evidence, [], 'stale is not an evidence-bearing quarantine');
  assert.match(byLeaf['L-000302']['next-action'], /re-verify this leaf against its cited sources/);

  // The reason travels here too, and it is the SAME string the resolver
  // published — one verdict function, so one wording.
  assert.equal(byLeaf['L-000302'].reason, byLeaf['L-000302'].time.reason);
});

test('the resolver and preflight agree leaf-for-leaf on every verdict', () => {
  // The structural guarantee behind the two goldens above, asserted over the
  // whole fixture set rather than a sampled pair: whatever the resolver
  // published as a leaf's time verdict, preflight computed the identical one.
  const fromResolver = Object.fromEntries(resolved('--today', TODAY).map((k) => [k.id, k.time]));
  const fromPreflight = Object.fromEntries(verdicts(1, '--today', TODAY).map((v) => [v.leaf, v.time]));
  assert.deepEqual(fromPreflight, fromResolver, 'two surfaces, one verdict function');
});

test('a stale verdict gates preflight at exit 1, not 2 — the check DID run', () => {
  // The exit contract's own distinction: 2 means a check never ran, and the
  // time check ran. Rotted knowledge is a finding to fix, not a broken engine.
  const stale = runCli('preflight.js', '--leaves', 'L-000302', '--root', CLEAN, '--today', TODAY, '--json');
  assert.equal(stale.status, 1);
  const fresh = runCli('preflight.js', '--leaves', 'L-000301', '--root', CLEAN, '--today', TODAY, '--json');
  assert.equal(fresh.status, 0, 'only an all-trusted run reads as clean');
  // Counted in its own column, so a stale leaf is visible in the tally rather
  // than absorbed into a class that means something else.
  const payload = JSON.parse(stale.stdout);
  assert.equal(payload.counts.stale, 1);
  assert.equal(payload.ok, false);
});

test('time demotion COMPOSES with the draft-stage downrank — both reasons, not one', () => {
  // A leaf that is both draft and stale has two independent reasons to be
  // distrusted, and printing only the first would hide a stale verdict behind
  // a draft one. `downranked` is their union; `demotions` keeps them distinct.
  const dir = mkdtempSync(join(tmpdir(), 'uk-time-compose-'));
  try {
    cpSync(CLEAN, dir, { recursive: true });
    const leaf = join(dir, 'knowledge/freshness/302.1-stable-past-the-limit.md');
    const text = readFileSync(leaf, 'utf8');
    assert.ok(text.includes('stage: verified'), 'fixture shape changed');
    writeFileSync(leaf, text.replace('stage: verified', 'stage: draft'));

    const entry = json('resolve.js', 0, 'freshness boundary', '--root', dir, '--today', TODAY)
      .results[0].knowledge.find((k) => k.id === 'L-000302');
    assert.equal(entry.downranked, true);
    assert.deepEqual(entry.demotions.map((d) => d.reason), ['stage', 'time'],
      'both demotions are reported; neither absorbs the other');

    // Preflight resolves the collision the other way round on purpose: stage is
    // asked FIRST, because a leaf no moderator has promoted is unverified for a
    // reason that outranks its age — re-dating a draft would not make it
    // trusted. One verdict per leaf, and it names the more fundamental problem.
    const verdict = json('preflight.js', 2, '--leaves', 'L-000302', '--root', dir, '--today', TODAY)['leaf-verdicts'][0];
    assert.equal(verdict.verdict, 'unknown');
    assert.match(verdict.reason, /pre-promotion/);
    assert.equal(verdict.time.verdict, 'stale', 'the stale verdict is still computed and published');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --------- AC3: without an injected today, the check SAYS it was skipped

test('without --today, resolver time verdicts report themselves skipped (golden)', () => {
  const payload = json('resolve.js', 0, 'freshness boundary', '--root', CLEAN);
  assert.equal(payload['time-check'],
    'skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)');

  // Every time-governed leaf reads `skipped`, and NOT `trusted`: reporting a
  // leaf as fresh because nobody asked what day it is would be exactly the
  // silent pass this rule exists to prevent.
  const byId = Object.fromEntries(payload.results[0].knowledge.map((k) => [k.id, k.time.verdict]));
  assert.equal(byId['L-000301'], 'skipped');
  assert.equal(byId['L-000302'], 'skipped', 'a leaf that IS stale still reads skipped, never trusted');
  assert.equal(byId['L-000304'], 'skipped');

  // And nothing is demoted on a run that computed no verdicts — a demotion
  // nobody measured would be a verdict invented rather than derived.
  assert.deepEqual(payload.results[0].knowledge.filter((k) => k.downranked), []);
});

test('without --today, preflight time verdicts are unknown and the output says so (golden)', () => {
  // Unknown, not trusted: a check that never ran is a blocking defect. It gates
  // at 2, which the expected exit status asserts.
  const payload = json('preflight.js', 2, '--leaves', 'L-000301,L-000302', '--root', CLEAN);
  assert.equal(payload['time-check'],
    'skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)');
  assert.deepEqual(payload['leaf-verdicts'].map((v) => [v.leaf, v.verdict, v.time.verdict]), [
    ['L-000301', 'unknown', 'skipped'],
    ['L-000302', 'unknown', 'skipped'],
  ]);
  assert.match(payload['leaf-verdicts'][0]['next-action'], /pass --today/);
});

test('the skip notice reaches the HUMAN surface of both projections', () => {
  // A skipped check that said nothing would read exactly like a check that
  // passed. So it is printed unconditionally, on every run, in both surfaces.
  for (const args of [['resolve.js', 'freshness boundary'], ['resolve.js', '--paths', 'src/freshness.ts']]) {
    const r = runCli(...args, '--root', CLEAN);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^time check: skipped — pass --today/m, args.join(' '));
  }
  const pre = runCli('preflight.js', '--leaves', 'L-000301', '--root', CLEAN);
  assert.match(pre.stdout, /^time check: skipped — pass --today/m);

  // And when a date IS injected, the same line says what was checked against
  // what — the thresholds included, so the verdict is readable without the docs.
  const checked = runCli('resolve.js', 'freshness boundary', '--root', CLEAN, '--today', TODAY);
  assert.match(checked.stdout, /^time check: checked against --today 2026-08-16 \(stale after 365 days for stable, 90 for volatile; static never stales\)$/m);
});

test('--today must be a real calendar date on the resolver, like everywhere else', () => {
  // `Date.parse('2026-02-30')` rolls forward to March 2nd, so a leaf's age
  // would be measured from a day the caller never named — and here that age
  // decides a demotion (UCS-957).
  const r = runCli('resolve.js', 'freshness boundary', '--root', CLEAN, '--today', '2026-02-30');
  assert.equal(r.status, 2, 'a lookup measured from a nonexistent day must never run');
  assert.match(r.stderr, /--today must be a real calendar date/);
});

test('the skipped notice is the AUDIT\'s wording — one rule, stated once', () => {
  // The audit's `stale-last-verified` check established the injection rule, and
  // a reader who has seen its skip notice must recognize this one. A surface
  // that phrased its own would eventually phrase it as silence.
  assert.equal(timeCheckStatus(null),
    'skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)');
  const audit = readFileSync(join(root, 'payload/engine/commands/audit.js'), 'utf8');
  assert.ok(audit.includes('skipped — pass --today YYYY-MM-DD to enable; diffable output never reads the wall clock (D-012)'),
    'the audit must still carry the wording this mirrors');
});

// ---- AC4: a non-static leaf missing its date is a finding; static is clean

test('a non-static leaf missing its verified date is a finding (golden)', () => {
  const payload = json('validate.js', 1, '--root', FINDINGS);
  assert.deepEqual(payload.findings.map((f) => [f.code, f.id, f.path]), [
    ['missing-verified', 'L-000401', 'verified'],
    ['malformed-verified', 'L-000402', 'verified'],
  ]);
  const [missing, malformed] = payload.findings;
  assert.equal(missing.severity, 'error');
  // The message names the threshold the leaf will be judged by, so an author
  // knows what they are being asked to commit to.
  assert.match(missing.message, /stales after 90 days/);
  // A date matching the pattern but naming no real day is its own finding: the
  // schema checks the SHAPE, the calendar is checked here.
  assert.equal(malformed.severity, 'error');
  assert.match(malformed.message, /not a real calendar date/);

  for (const code of ['missing-verified', 'malformed-verified']) {
    assert.ok(CHECKS.includes(code), `${code} must be reported as a check class on every run`);
  }
});

test('a STATIC leaf with no verified date is clean (golden)', () => {
  // The asymmetry, and it is the point. Static knowledge never stales, so a
  // date on it would measure an age nothing consumes — demanding one would be
  // demanding a field with no reader, which is how a store fills up with ritual
  // metadata nobody maintains.
  const payload = json('validate.js', 0, '--root', CLEAN);
  assert.deepEqual(payload.findings, []);
  const leaf = load(readFileSync(
    join(CLEAN, 'knowledge/freshness/306.1-static-undated.md'), 'utf8').split('---')[1]);
  assert.equal(leaf.volatility, 'static');
  assert.equal(leaf.verified, undefined, 'the fixture must actually be undated');
});

test('a leaf declaring NO volatility is clean and exempt — the migration case', () => {
  // Absent volatility means exempt from time governance, not a default class.
  // The facet arrived in v2 and stores are mid-migration: defaulting would
  // stale every un-migrated leaf in the store at once, on the first run that
  // passed --today. This is what keeps the other 40 fixture leaves green.
  const leaf = load(readFileSync(
    join(CLEAN, 'knowledge/freshness/307.1-exempt-no-volatility.md'), 'utf8').split('---')[1]);
  assert.equal(leaf.volatility, undefined);
  assert.equal(leaf.verified, undefined);

  const entry = resolved('--today', TODAY).find((k) => k.id === 'L-000307');
  // `exempt`, deliberately NOT `trusted`: a leaf nothing governs has not passed
  // a check. Collapsing the two would report an ungoverned leaf as having sat
  // an exam it never took.
  assert.equal(entry.time.verdict, 'exempt');
  assert.equal(entry.downranked, false, 'and it is never demoted for a facet it does not carry');
});

test('a static leaf still has a malformed date caught — an author who wrote one meant it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uk-time-static-bad-'));
  try {
    cpSync(CLEAN, dir, { recursive: true });
    const leaf = join(dir, 'knowledge/freshness/305.1-static-ancient.md');
    writeFileSync(leaf, readFileSync(leaf, 'utf8').replace('verified: "2010-01-01"', 'verified: "2010-13-45"'));
    const payload = json('validate.js', 1, '--root', dir);
    assert.deepEqual(payload.findings.map((f) => [f.code, f.id]), [['malformed-verified', 'L-000305']]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the missing-date findings are DATE-FREE — the baseline set never moves (D-012)', () => {
  // The validator asks whether a leaf CAN be judged, never whether it is stale.
  // Staleness needs an injected today and belongs to the projection surfaces;
  // a wall-clock-dependent finding here would break baseline diffing outright.
  const first = json('validate.js', 1, '--root', FINDINGS);
  const second = json('validate.js', 1, '--root', FINDINGS);
  assert.deepEqual(first, second, 'two runs are byte-identical');
  // And the validator takes no --today at all, so there is no way to make it
  // depend on one.
  const withToday = runCli('validate.js', '--root', FINDINGS, '--today', TODAY, '--json');
  assert.equal(withToday.status, 2, 'the validator has no --today to accept');
});

// ------------------------------------------- the shared verdict function

test('timeVerdict is the ONE implementation every projection reads', () => {
  // The seam the ticket asked for, so UCS-1158's derived-layer trees and
  // UCS-1152's resolution pipeline inherit these verdicts rather than
  // recomputing them. Asserted structurally: neither surface spells the
  // thresholds or the field names itself.
  for (const file of ['commands/resolve.js', 'commands/preflight.js', 'commands/validate.js']) {
    const source = readFileSync(join(root, 'payload/engine', file), 'utf8');
    assert.match(source, /from '\.\.\/lib\/time-verdicts\.js'/, `${file} must read the shared module`);
    // Comments are stripped before the check: a docstring naming the
    // thresholds is documentation a reader needs, while a threshold in CODE is
    // a second copy that can drift from the table. Only the latter is the
    // defect this asserts against.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\b365\b|\b90\b/.test(code), `${file} must not spell a threshold in code`);
  }
});

test('the verdict function is pure and total — every input yields a stable shape', () => {
  const KEYS = ['volatility', 'verified', 'age', 'limit', 'stale', 'verdict', 'reason'];
  const cases = [
    [{}, null], [{}, TODAY],
    [{ volatility: 'stable' }, TODAY],
    [{ volatility: 'stable', verified: '2026-08-16' }, TODAY],
    [{ volatility: 'static' }, null],
    // Values the schema already refused — the resolver never gates on store
    // health, so it is the one surface that can be asked to publish them.
    [{ volatility: 'glacial', verified: '2020-01-01' }, TODAY],
    [{ volatility: 3, verified: 7 }, TODAY],
    [{ volatility: 'volatile', verified: '2026-02-30' }, TODAY],
  ];
  for (const [record, today] of cases) {
    const v = timeVerdict(record, today);
    assert.deepEqual(Object.keys(v).sort(), [...KEYS].sort(), JSON.stringify(record));
    assert.equal(typeof v.reason, 'string');
    assert.ok(Object.values(TIME_VERDICTS).includes(v.verdict), `${v.verdict} is a declared class`);
    // `stale` is true ONLY for the stale verdict, so a skipped or exempt leaf
    // is never demoted by a surface that reads the boolean alone.
    assert.equal(v.stale, v.verdict === 'stale', JSON.stringify(record));
  }

  // An unknown volatility class reads as exempt rather than being handed to the
  // threshold table: `undefined > n` is `false`, i.e. a silent trusted for a
  // leaf whose volatility nobody can interpret.
  assert.equal(leafVolatility({ volatility: 'glacial' }), null);
  assert.equal(leafVolatility({ volatility: 3 }), null);
  assert.equal(leafVolatility({}), null);
  assert.equal(leafVolatility({ volatility: 'volatile' }), 'volatile');

  // A malformed date reads as absent, so no age is ever measured from a day
  // that does not exist.
  assert.equal(leafVerified({ verified: '2026-02-30' }), null);
  assert.equal(leafVerified({ verified: 'yesterday' }), null);
  assert.equal(leafVerified({ verified: '2026-08-16' }), '2026-08-16');
});

test('an INHERITED property name is not a volatility class', () => {
  // Regression. `VOLATILITY_LIMITS` was an object literal and membership was
  // tested with `in`, so every name on Object.prototype answered TRUE:
  // `volatility: toString` read as a known class whose limit was a native
  // function. Three things went wrong at once, and the first is the worst —
  //
  //   1. `age > someFunction` is always false, so a leaf verified in 2020 came
  //      back `trusted` and UNDEMOTED. Rotted knowledge wearing a clean verdict
  //      is the exact failure this facet exists to prevent.
  //   2. `JSON.stringify` DROPS function values, so `limit` vanished from the
  //      published object — breaking the stable-key contract that says a
  //      consumer never needs a presence check.
  //   3. `[native code]` leaked into the reason string a human reads.
  //
  // The schema enum refuses such a leaf, so no validated store reaches this.
  // That is not enough: the resolver deliberately never gates on store health
  // (§4), so it is precisely the surface that can be asked to publish a verdict
  // on a leaf no check approved — which is asserted against the CLI below.
  for (const inherited of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf']) {
    assert.equal(leafVolatility({ volatility: inherited }), null, inherited);
    const v = timeVerdict({ volatility: inherited, verified: '2020-01-01' }, TODAY);
    assert.equal(v.verdict, TIME_VERDICTS.EXEMPT, `${inherited} must not read as a known class`);
    assert.equal(v.limit, null, `${inherited} must not publish a function as its limit`);
    assert.equal(v.stale, false);
    assert.doesNotMatch(v.reason, /native code/, 'no engine internals leak into a human-read reason');
    // The published shape survives the JSON round trip with every key intact —
    // a function value would have been silently dropped here.
    assert.deepEqual(JSON.parse(JSON.stringify(v)), v, `${inherited} must survive JSON intact`);
  }

  // The table itself is null-prototype, so the whole class of bug is gone at
  // the source rather than patched at each call site.
  assert.equal(Object.getPrototypeOf(VOLATILITY_LIMITS), null);
  assert.equal('toString' in VOLATILITY_LIMITS, false);
  // And the three real classes are unaffected by the hardening.
  for (const real of VOLATILITY_CLASSES) {
    assert.equal(leafVolatility({ volatility: real }), real);
  }
});

test('the resolver publishes an honest verdict for a leaf the schema would refuse', () => {
  // The end-to-end half of the regression above, through the surface that can
  // actually be asked to do it: the resolver runs on whatever loaded, so a
  // store carrying an invalid volatility still resolves. It must report the
  // leaf as `exempt` — not `trusted`, and never demoted-or-promoted on the
  // strength of a limit that is a native function.
  const dir = mkdtempSync(join(tmpdir(), 'uk-time-proto-'));
  try {
    cpSync(CLEAN, dir, { recursive: true });
    const leaf = join(dir, 'knowledge/freshness/302.1-stable-past-the-limit.md');
    const text = readFileSync(leaf, 'utf8');
    assert.ok(text.includes('volatility: stable'), 'fixture shape changed');
    writeFileSync(leaf, text.replace('volatility: stable', 'volatility: toString'));

    const entry = json('resolve.js', 0, 'freshness boundary', '--root', dir, '--today', TODAY)
      .results[0].knowledge.find((k) => k.id === 'L-000302');
    assert.equal(entry.time.verdict, 'exempt');
    assert.equal(entry.time.volatility, null, 'an uninterpretable class is not carried forward');
    // `limit` is PRESENT and null. Before the fix it was absent, because
    // JSON.stringify drops function values.
    assert.ok('limit' in entry.time, 'the stable-key contract holds even here');
    assert.equal(entry.time.limit, null);

    // The schema still refuses the leaf, so the defect is reported where it is
    // fixable rather than only tolerated where it is read.
    const bad = runCli('validate.js', '--root', dir, '--json');
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /invalid-enum-value/);
    assert.match(bad.stderr, /volatility/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the validator reads volatility through ONE reader, so `in` cannot creep back', () => {
  // The validator's presence check must not spell its own membership test. A
  // second spelling would answer TRUE for inherited names and then demand a
  // `verified` date from a class that has no threshold — a finding raised
  // against a leaf for failing a rule that does not apply to it.
  const source = readFileSync(join(root, 'payload/engine/commands/validate.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bin VOLATILITY_LIMITS\b/,
    'membership must go through leafVolatility, never a bare `in`');
  assert.match(code, /leafVolatility\(record\)/);
});

test('a leaf under time governance whose age cannot be computed is never trusted', () => {
  // `undated` — it declares a volatility and carries no usable date, so its
  // freshness is unknowable. Not stale (nothing measured it) and not trusted
  // (nothing vouches for it), and preflight verdicts it unknown so it gates.
  const v = timeVerdict({ volatility: 'volatile' }, TODAY);
  assert.equal(v.verdict, TIME_VERDICTS.UNDATED);
  assert.equal(v.stale, false);

  // Exit 1, not 2: quarantine is a finding to fix, and the checks all ran.
  const verdict = json('preflight.js', 1, '--leaves', 'L-000401', '--root', FINDINGS, '--today', TODAY);
  const [leaf] = verdict['leaf-verdicts'];
  // Quarantined outranks it here, because the validator raises missing-verified
  // as an error-severity finding attributable to this leaf — evidence of a
  // defect outranks a verdict about freshness, and the fix is the same field.
  assert.equal(leaf.verdict, 'quarantined');
  assert.equal(leaf.time.verdict, TIME_VERDICTS.UNDATED, 'the time verdict is still computed and published');
  assert.deepEqual(leaf.evidence.map((e) => e.code), ['missing-verified']);
});

test('--paths reverse lookup demotes stale leaves too — every projection, not just query', () => {
  // The second resolver mode. "Every generated projection" means the ones that
  // exist: query results and reverse path lookup, plus preflight's leaf
  // verdicts. A demotion that fired in one mode and not the other would let a
  // developer reading a diff act on knowledge the query surface had demoted.
  const dir = mkdtempSync(join(tmpdir(), 'uk-time-paths-'));
  try {
    cpSync(CLEAN, dir, { recursive: true });
    const leaf = join(dir, 'knowledge/freshness/302.1-stable-past-the-limit.md');
    const text = readFileSync(leaf, 'utf8');
    writeFileSync(leaf, text.replace('terms: [freshness boundary]', 'terms: [freshness boundary]\npaths: [src/freshness.ts]'));

    const payload = json('resolve.js', 0, '--paths', 'src/freshness.ts', '--root', dir, '--today', TODAY);
    const governing = payload.paths[0].knowledge.find((k) => k.id === 'L-000302');
    assert.equal(governing.time.verdict, 'stale');
    assert.equal(governing.downranked, true);
    assert.deepEqual(governing.demotions.map((d) => d.reason), ['time']);
    assert.equal(payload['time-check'].startsWith('checked against --today'), true);

    // Visible on the human surface of this mode too.
    const human = runCli('resolve.js', '--paths', 'src/freshness.ts', '--root', dir, '--today', TODAY);
    assert.match(human.stdout, /\[stale — stable verified 366d ago > 365d\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('output stays deterministic: two runs byte-identical, no wall-clock anywhere', () => {
  // D-012. With an injected date the verdicts are reproducible from inputs;
  // without one nothing time-dependent enters the output at all.
  for (const args of [['--today', TODAY], []]) {
    const a = runCli('resolve.js', 'freshness boundary', '--root', CLEAN, '--json', ...args);
    const b = runCli('resolve.js', 'freshness boundary', '--root', CLEAN, '--json', ...args);
    assert.equal(a.stdout, b.stdout, `resolve ${args.join(' ')}`);
  }
  const p1 = runCli('preflight.js', '--leaves', 'L-000302', '--root', CLEAN, '--today', TODAY, '--json');
  const p2 = runCli('preflight.js', '--leaves', 'L-000302', '--root', CLEAN, '--today', TODAY, '--json');
  assert.equal(p1.stdout, p2.stdout);
});
