// UCS-957: "an ISO date" means one thing, and every surface agrees.
//
// The rule was stated four times and the copies disagreed. Three checked the
// SHAPE; only preflight asked the calendar. `Date.parse('2026-02-30')` does not
// fail — it rolls forward to March 2nd — so:
//
//   audit --today 2026-02-30      exited 0 and reported staleness measured
//                                 from a day two later than the caller named
//   log-entry --date 2026-13-01   wrote logs/findings/2026-13-01-….yaml,
//                                 stamping month thirteen into a permanent
//                                 audit trail
//   preflight --today 2026-02-30  refused it
//
// Injectable dates exist so the engine's answers are reproducible from their
// inputs (D-012, PRD §5). A date silently replaced by a different date is not
// the input anybody gave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daysBetween, isCalendarDate, ISO_DATE } from '../payload/engine/lib/iso-date.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fixture = join(repoRoot, 'fixtures', 'ts-app');

/** The one table. Every surface that takes a date must agree with it. */
const DATES = [
  ['2026-07-09', true, 'an ordinary day'],
  ['2024-02-29', true, 'a leap day in a leap year'],
  ['2000-02-29', true, '2000 is a leap year — divisible by 400'],
  ['2026-01-01', true, 'the first day of a year'],
  ['2026-12-31', true, 'the last day of a year'],

  ['2026-02-30', false, 'February has no 30th — Date.parse rolls it to March 2nd'],
  ['2025-02-29', false, '2025 is not a leap year'],
  ['1900-02-29', false, '1900 is not a leap year — divisible by 100, not by 400'],
  ['2026-04-31', false, 'April has 30 days'],
  ['2026-13-01', false, 'there is no thirteenth month'],
  ['2026-00-10', false, 'there is no zeroth month'],
  ['2026-01-00', false, 'there is no zeroth day'],
  ['2026-01-32', false, 'no month has 32 days'],

  ['2026-7-09', false, 'the month must be two digits'],
  ['26-07-09', false, 'the year must be four digits'],
  ['2026-07-09T00:00:00Z', false, 'a timestamp is not a date'],
  ['2026/07/09', false, 'slashes are not the format'],
  [' 2026-07-09', false, 'no leading space'],
  ['2026-07-09 ', false, 'no trailing space'],
  ['', false, 'the empty string names no day'],
  ['not-a-date', false, 'nor does that'],
];

// ------------------------------------------------------------- the authority

test('isCalendarDate accepts exactly the days that exist', () => {
  for (const [value, valid, why] of DATES) {
    assert.equal(isCalendarDate(value), valid, `${JSON.stringify(value)}: ${why}`);
  }
});

test('isCalendarDate refuses anything that is not a string', () => {
  for (const value of [null, undefined, 20260709, new Date('2026-07-09'), ['2026-07-09'], {}]) {
    assert.equal(isCalendarDate(value), false, `${String(value)} is not an ISO date string`);
  }
});

test('the shape test alone is not enough — which is why the round-trip exists', () => {
  // Pinning the reason the module exists. If someone ever "simplifies"
  // isCalendarDate down to ISO_DATE.test, this says what breaks.
  assert.equal(ISO_DATE.test('2026-02-30'), true, 'the shape is fine');
  assert.equal(Number.isNaN(Date.parse('2026-02-30T00:00:00Z')), false, 'and Date.parse accepts it');
  assert.equal(new Date('2026-02-30T00:00:00Z').toISOString().slice(0, 10), '2026-03-02', 'rolling it forward');
  assert.equal(isCalendarDate('2026-02-30'), false, 'only the round-trip catches it');
});

test('daysBetween counts whole UTC days, and is symmetric about its sign', () => {
  assert.equal(daysBetween('2026-07-01', '2026-07-09'), 8);
  assert.equal(daysBetween('2026-07-09', '2026-07-01'), -8);
  assert.equal(daysBetween('2026-07-09', '2026-07-09'), 0);
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2, 'through a leap day');
  assert.equal(daysBetween('2025-02-28', '2025-03-01'), 1, 'and through a February without one');
  assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1, 'across a year boundary');
});

// ------------------------------------------- every surface agrees, end to end

const run = (surface, ...args) =>
  spawnSync(process.execPath, [join(repoRoot, 'payload', 'engine', surface), ...args],
    { encoding: 'utf8', timeout: 20_000, cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });

/** A throwaway root the log-entry helper can write a fragment into. */
function logRoot(t) {
  const dir = mkdtempSync(join(tmpdir(), 'uk-date-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'logs', 'findings'), { recursive: true });
  return dir;
}

test('audit, preflight and log-entry agree on every date in the table', (t) => {
  for (const [value, valid, why] of DATES) {
    if (value === '') continue; // an empty flag value is a usage error before any date check

    const audit = run('audit.js', '--root', fixture, '--today', value);
    const preflight = run('preflight.js', '--root', fixture, '--today', value, '--log');
    const entry = run('log-entry.js', 'create', '--log', 'findings', '--date', value,
      '--entry', '{"trigger":"correction","summary":"x"}', '--root', logRoot(t));

    for (const [name, r] of [['audit', audit], ['preflight', preflight], ['log-entry', entry]]) {
      assert.notEqual(r.signal, 'SIGTERM', `${name} timed out on ${value}`);
      if (valid) {
        assert.notEqual(r.status, 2, `${name} refused ${JSON.stringify(value)}, but ${why}\n${r.stderr}`);
      } else {
        assert.equal(r.status, 2,
          `${name} ACCEPTED ${JSON.stringify(value)} — ${why}\n${r.stdout.slice(0, 200)}`);
      }
    }
  }
});

test('log-entry never stamps a day that does not exist into a fragment filename', (t) => {
  // The worst of the three: --date lands in the filename and the audit trail.
  const root = logRoot(t);
  const r = run('log-entry.js', 'create', '--log', 'findings', '--date', '2026-13-01',
    '--entry', '{"trigger":"correction","summary":"x"}', '--root', root);
  assert.equal(r.status, 2, 'month thirteen is not a month');
  assert.deepEqual(readdirSync(join(root, 'logs', 'findings')), [], 'and nothing was written');
});

test('a valid date still writes exactly the fragment it always did', (t) => {
  const root = logRoot(t);
  const r = run('log-entry.js', 'create', '--log', 'findings', '--date', '2024-02-29',
    '--suffix', 'deadbeef', '--entry', '{"trigger":"correction","summary":"x"}', '--root', root);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(join(root, 'logs', 'findings')), ['2024-02-29-deadbeef.yaml']);
  assert.match(readFileSync(join(root, 'logs', 'findings', '2024-02-29-deadbeef.yaml'), 'utf8'), /date: '?2024-02-29'?/);
});

test('audit measures staleness only from a day that exists', () => {
  // The reason this matters. `--stale-days` is counted from `--today`, so a
  // date rolled silently forward moves findings in and out of the report.
  const bad = run('audit.js', '--root', fixture, '--today', '2026-02-30', '--stale-days', '1');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--today must be a real calendar date/);
  assert.equal(bad.stdout, '', 'a refused date produces no report at all');
});

// ------------------------------------------------------ the rule lives once

test('ISO_DATE is defined exactly once in the engine', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const engineDir = join(repoRoot, 'payload', 'engine');
  const definers = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) { await walk(path); continue; }
      if (!e.name.endsWith('.js')) continue;
      const source = await readFile(path, 'utf8');
      if (/^(?:export )?const ISO_DATE\s*=/m.test(source)) definers.push(relative(repoRoot, path));
    }
  };
  await walk(engineDir);
  assert.deepEqual(definers, ['payload/engine/lib/iso-date.js'],
    `the date rule is stated in more than one place: ${definers.join(', ')}`);
});
