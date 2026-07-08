// KK-13: findings & gap log schemas + append/transition helpers (PRD §3.4,
// D-010). Fragment-based logs — ONE FILE PER ENTRY — so concurrent agent
// sessions never merge-conflict; the helper is how agents append and
// transition entries without hand-editing YAML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { validateRecord } from '../payload/engine/lib/validate-record.js';
import {
  LOGS, LEGAL_TRANSITIONS, createEntry, transitionStatus,
} from '../payload/engine/lib/log-entry.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cliPath = join(repoRoot, 'payload', 'engine', 'log-entry.js');
const tmpRoot = () => mkdtempSync(join(tmpdir(), 'kk13-'));

const FINDING = { trigger: 'correction', summary: 'concept K-210 was stale per src/sports.ts' };
const MISS = { path: 'src/registry.generated.ts', shape: 'codegen output; values only in generator config' };
const GAP = { summary: 'no skill routes retention analytics; nearest concept K-310' };
const FIELDS = { findings: FINDING, misses: MISS, gaps: GAP };

// --- schema validation: good/bad entries per log kind ------------------------

test('good entries validate for every log kind', () => {
  for (const [log, kind] of Object.entries(LOGS)) {
    const entry = { 'schema-version': 1, date: '2026-07-08', status: 'open', ...FIELDS[log] };
    assert.deepEqual(validateRecord(kind, entry).errors, [], kind);
  }
});

test('bad miss entry: missing anchor path and bad status are typed errors', () => {
  const { errors } = validateRecord('miss', {
    'schema-version': 1, date: '2026-07-08', shape: 'x', status: 'triaged',
  });
  assert.deepEqual(errors.map((e) => [e.path, e.code]), [
    ['path', 'missing-required'],
    ['status', 'invalid-enum-value'],
  ]);
});

test('bad gap entry: unknown keys are typos, never silent extensions', () => {
  const { errors } = validateRecord('gap', {
    'schema-version': 1, date: '2026-07-08', status: 'open', ...GAP, transcript: 'verbatim text',
  });
  assert.deepEqual(errors.map((e) => [e.path, e.code]), [['transcript', 'unknown-property']]);
});

test('lifecycle grammar is deep-equal across all three schemas (no cross-schema drift)', () => {
  // The lifecycle is ONE contract; finding/miss/gap each carry a copy so each
  // schema stays self-contained. Deep-equality (not key-presence) keeps the
  // copies from drifting: status enum, lifecycle property definitions, and
  // the isoDate grammar they reference.
  const schemas = Object.fromEntries(Object.values(LOGS).map((kind) => [kind, JSON.parse(
    readFileSync(join(repoRoot, 'payload', 'schemas', `${kind}.schema.json`), 'utf8'))]));
  const canonical = schemas.finding;
  for (const [kind, schema] of Object.entries(schemas)) {
    assert.deepEqual(schema.properties.status.enum, canonical.properties.status.enum,
      `${kind}: status enum diverges from finding`);
    for (const field of ['verified', 'reason', 'occurrences']) {
      assert.deepEqual(schema.properties[field], canonical.properties[field],
        `${kind}: lifecycle field ${field} diverges from finding`);
    }
    assert.deepEqual(schema.$defs.isoDate, canonical.$defs.isoDate,
      `${kind}: isoDate $def diverges from finding`);
    assert.match(schema.description, /never verbatim user text or secrets/,
      `${kind}: capture content policy must be documented`);
  }
});

// --- lifecycle invariants at the validation layer -----------------------------
// The schema gate must match what transitionStatus enforces on its write path,
// so a hand-edited fragment can't sneak an inconsistent lifecycle past it.

test('validation: verified travels only with status resolved, both directions', () => {
  for (const [log, kind] of Object.entries(LOGS)) {
    const open = {
      'schema-version': 1, date: '2026-07-08', status: 'open', verified: '2026-07-08', ...FIELDS[log],
    };
    assert.deepEqual(validateRecord(kind, open).errors.map((e) => [e.path, e.code]),
      [['verified', 'lifecycle-field-mismatch']], `${kind}: open+verified must fail`);
    const bare = { 'schema-version': 1, date: '2026-07-08', status: 'resolved', ...FIELDS[log] };
    assert.deepEqual(validateRecord(kind, bare).errors.map((e) => [e.path, e.code]),
      [['verified', 'lifecycle-field-mismatch']], `${kind}: resolved without verified must fail`);
    assert.deepEqual(validateRecord(kind, { ...bare, verified: '2026-07-09' }).errors, [],
      `${kind}: resolved+verified is valid`);
  }
});

test('validation: rejected requires a non-empty reason; reason only on rejected', () => {
  for (const [log, kind] of Object.entries(LOGS)) {
    const rejected = { 'schema-version': 1, date: '2026-07-08', status: 'rejected', ...FIELDS[log] };
    assert.deepEqual(validateRecord(kind, rejected).errors.map((e) => [e.path, e.code]),
      [['reason', 'lifecycle-field-mismatch']], `${kind}: rejected without reason must fail`);
    assert.deepEqual(
      validateRecord(kind, { ...rejected, reason: '' }).errors.map((e) => [e.path, e.code]),
      [['reason', 'lifecycle-field-mismatch']], `${kind}: rejected with empty reason must fail`);
    assert.deepEqual(
      validateRecord(kind, { ...rejected, reason: 'out of scope' }).errors, [],
      `${kind}: rejected+reason is valid`);
    const stray = {
      'schema-version': 1, date: '2026-07-08', status: 'open', reason: 'stale', ...FIELDS[log],
    };
    assert.deepEqual(validateRecord(kind, stray).errors.map((e) => [e.path, e.code]),
      [['reason', 'lifecycle-field-mismatch']], `${kind}: reason on a non-rejected entry must fail`);
  }
});

// --- create-entry: mint filename, stamp schema-version, one file per entry ---

test('createEntry mints <date>-<hex8>.yaml, stamps schema-version and open status', () => {
  const root = tmpRoot();
  const { file, entry } = createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING });
  // hex8, not hex4: 2^32 ids per date per log keeps cross-branch same-day
  // collisions negligible at realistic scale (D-010's no-conflict claim).
  assert.match(file, /^logs\/findings\/2026-07-08-[0-9a-f]{8}\.yaml$/);
  const onDisk = load(readFileSync(join(root, file), 'utf8'));
  assert.deepEqual(onDisk, { 'schema-version': 1, date: '2026-07-08', status: 'open', ...FINDING });
  assert.deepEqual(onDisk, entry);
  assert.deepEqual(validateRecord('finding', onDisk).errors, []);
});

test('one file per entry (D-010): repeated appends mint distinct files', () => {
  const root = tmpRoot();
  const files = new Set();
  for (let i = 0; i < 5; i += 1) {
    files.add(createEntry({ root, log: 'misses', date: '2026-07-08', fields: MISS }).file);
  }
  assert.equal(files.size, 5);
  assert.equal(readdirSync(join(root, 'logs', 'misses')).length, 5);
});

test('dates are injectable, never wall-clock: a missing or malformed date throws', () => {
  const root = tmpRoot();
  assert.throws(() => createEntry({ root, log: 'gaps', fields: GAP }), /date/);
  assert.throws(() => createEntry({ root, log: 'gaps', date: 'today', fields: GAP }), /date/);
  assert.ok(!existsSync(join(root, 'logs')), 'nothing may be written on error');
});

test('createEntry hard-errors on invalid fields and helper-owned keys; writes nothing', () => {
  const root = tmpRoot();
  assert.throws(
    () => createEntry({ root, log: 'findings', date: '2026-07-08', fields: { ...FINDING, trigger: 'hunch' } }),
    /invalid-enum-value/,
  );
  assert.throws(
    () => createEntry({ root, log: 'findings', date: '2026-07-08', fields: { ...FINDING, status: 'resolved' } }),
    /helper-owned/,
  );
  assert.throws(
    () => createEntry({ root, log: 'findings', date: '2026-07-08', fields: { ...FINDING, reason: 'no' } }),
    /helper-owned/,
    'a born-open entry cannot carry a hand-supplied rejection reason',
  );
  assert.throws(() => createEntry({ root, log: 'nope', date: '2026-07-08', fields: {} }), /log/);
  assert.ok(!existsSync(join(root, 'logs')));
});

test('an injected suffix collision is a hard error, never an overwrite', () => {
  const root = tmpRoot();
  createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix: 'a3f2b9c4' });
  assert.throws(
    () => createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix: 'a3f2b9c4' }),
    /exists/,
  );
});

test('a malformed injected suffix is rejected by name, before anything is written', () => {
  const root = tmpRoot();
  for (const suffix of ['a3f2', 'A3F2B9C4', 'xyzt0000', 'a3f2b9c4d']) {
    assert.throws(
      () => createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix }),
      /suffix/,
      JSON.stringify(suffix),
    );
  }
  assert.ok(!existsSync(join(root, 'logs')));
});

// --- transition-status: legal lifecycle only ---------------------------------

test('lifecycle: open → proposed → resolved stamps verified date', () => {
  const root = tmpRoot();
  const { file } = createEntry({ root, log: 'findings', date: '2026-07-01', fields: FINDING });
  const step1 = transitionStatus({ root, file, to: 'proposed', date: '2026-07-02' });
  assert.equal(step1.entry.status, 'proposed');
  const step2 = transitionStatus({ root, file, to: 'resolved', date: '2026-07-03' });
  assert.equal(step2.entry.status, 'resolved');
  assert.equal(step2.entry.verified, '2026-07-03');
  const onDisk = load(readFileSync(join(root, file), 'utf8'));
  assert.deepEqual(onDisk, step2.entry);
  assert.deepEqual(validateRecord('finding', onDisk).errors, []);
});

test('lifecycle: rejection requires a recorded reason', () => {
  const root = tmpRoot();
  const { file } = createEntry({ root, log: 'gaps', date: '2026-07-01', fields: GAP });
  transitionStatus({ root, file, to: 'proposed', date: '2026-07-02' });
  assert.throws(() => transitionStatus({ root, file, to: 'rejected', date: '2026-07-03' }), /reason/);
  const { entry } = transitionStatus({
    root, file, to: 'rejected', date: '2026-07-03', reason: 'out of survey scope',
  });
  assert.equal(entry.status, 'rejected');
  assert.equal(entry.reason, 'out of survey scope');
});

test('re-open, not duplicate: recurrence re-opens the same entry with an occurrence date', () => {
  const root = tmpRoot();
  const { file } = createEntry({ root, log: 'findings', date: '2026-07-01', fields: FINDING });
  transitionStatus({ root, file, to: 'proposed', date: '2026-07-02' });
  transitionStatus({ root, file, to: 'resolved', date: '2026-07-03' });
  const reopened = transitionStatus({ root, file, to: 'open', date: '2026-07-05' });
  assert.equal(reopened.entry.status, 'open');
  assert.deepEqual(reopened.entry.occurrences, ['2026-07-05']);
  assert.ok(!('verified' in reopened.entry), 'a re-opened entry is no longer verified');
  assert.deepEqual(validateRecord('finding', reopened.entry).errors, []);
});

test('re-opening a rejected entry drops the stale rejection reason', () => {
  const root = tmpRoot();
  const { file } = createEntry({ root, log: 'gaps', date: '2026-07-01', fields: GAP });
  transitionStatus({ root, file, to: 'proposed', date: '2026-07-02' });
  transitionStatus({ root, file, to: 'rejected', date: '2026-07-03', reason: 'out of scope' });
  const reopened = transitionStatus({ root, file, to: 'open', date: '2026-07-05' });
  assert.ok(!('reason' in reopened.entry),
    'a re-opened entry no longer carries the old rejection reason');
  // ...and a later resolution must not resurrect it either.
  transitionStatus({ root, file, to: 'proposed', date: '2026-07-06' });
  const resolved = transitionStatus({ root, file, to: 'resolved', date: '2026-07-07' });
  assert.equal(resolved.entry.verified, '2026-07-07');
  assert.ok(!('reason' in resolved.entry));
});

test('transitionStatus rejects fragment paths that escape the root (no sibling-tree writes)', () => {
  const root = join(tmpRoot(), 'kit');
  const { file } = createEntry({ root, log: 'findings', date: '2026-07-01', fields: FINDING });
  // A sibling tree outside root that the traversal forms would reach.
  const outside = join(root, '..', 'logs', 'findings');
  mkdirSync(outside, { recursive: true });
  const escapees = [
    '../logs/findings/2026-07-01-aaaaaaaa.yaml',
    `foo/../../logs/findings/2026-07-01-aaaaaaaa.yaml`,
    join(root, '..', 'logs', 'findings', '2026-07-01-aaaaaaaa.yaml'), // absolute
  ];
  for (const escapee of escapees) {
    assert.throws(
      () => transitionStatus({ root, file: escapee, to: 'proposed', date: '2026-07-02' }),
      /fragment path|escapes/,
      JSON.stringify(escapee),
    );
  }
  assert.deepEqual(readdirSync(outside), [], 'nothing may be read or written outside root');
  // The legitimate root-relative path still works.
  assert.equal(transitionStatus({ root, file, to: 'proposed', date: '2026-07-02' }).entry.status, 'proposed');
});

test('illegal transitions hard-error and leave the file untouched', () => {
  const root = tmpRoot();
  const { file } = createEntry({ root, log: 'misses', date: '2026-07-01', fields: MISS });
  const before = readFileSync(join(root, file), 'utf8');
  for (const to of ['resolved', 'rejected', 'open']) {
    assert.throws(
      () => transitionStatus({ root, file, to, date: '2026-07-02', reason: 'r' }),
      /illegal transition/,
    );
  }
  assert.throws(() => transitionStatus({ root, file, to: 'archived', date: '2026-07-02' }), /status/);
  assert.throws(() => transitionStatus({ root, file, to: 'proposed' }), /date/);
  assert.equal(readFileSync(join(root, file), 'utf8'), before);
});

test('legal-transition table matches the §3.4 lifecycle exactly', () => {
  assert.deepEqual(LEGAL_TRANSITIONS, {
    open: ['proposed'],
    proposed: ['rejected', 'resolved'],
    rejected: ['open'],
    resolved: ['open'],
  });
});

// --- CLI: callable without hand-editing YAML ---------------------------------

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

test('CLI: create then transition an entry; illegal transition exits 2', () => {
  const root = tmpRoot();
  const created = runCli([
    'create', '--log', 'findings', '--date', '2026-07-08',
    '--entry', JSON.stringify(FINDING),
  ], root);
  assert.equal(created.status, 0, created.stderr);
  const { file } = JSON.parse(created.stdout);
  assert.match(file, /^logs\/findings\/2026-07-08-[0-9a-f]{8}\.yaml$/);

  const moved = runCli(['transition', '--file', file, '--to', 'proposed', '--date', '2026-07-09'], root);
  assert.equal(moved.status, 0, moved.stderr);
  assert.equal(JSON.parse(moved.stdout).status, 'proposed');

  const illegal = runCli(['transition', '--file', file, '--to', 'open', '--date', '2026-07-09'], root);
  assert.equal(illegal.status, 2);
  assert.match(illegal.stderr, /illegal transition/);
});

test('CLI: accepts --flag=value spelling and hard-errors on unknown flags', () => {
  const root = tmpRoot();
  const created = runCli([
    'create', '--log=findings', '--date=2026-07-08', `--entry=${JSON.stringify(FINDING)}`,
  ], root);
  assert.equal(created.status, 0, created.stderr);
  assert.match(JSON.parse(created.stdout).file, /^logs\/findings\/2026-07-08-[0-9a-f]{8}\.yaml$/);

  const typo = runCli([
    'create', '--log', 'findings', '--date', '2026-07-08',
    '--entry', JSON.stringify(FINDING), '--sufix', 'aaaaaaaa',
  ], root);
  assert.equal(typo.status, 2, 'a typoed flag is an error, never silently swallowed');
  assert.match(typo.stderr, /--sufix/);
});

test('CLI: --entry must be a JSON object — null/string/array get the usage error', () => {
  const root = tmpRoot();
  for (const bad of ['null', '"abc"', '[1]', '3']) {
    const result = runCli(['create', '--log', 'findings', '--date', '2026-07-08', '--entry', bad], root);
    assert.equal(result.status, 2, bad);
    assert.match(result.stderr, /--entry must be a JSON object/, bad);
  }
});

// --- D-010 done-criterion: two branches appending concurrently merge clean ---

test('two simulated branches appending concurrently merge without conflict', () => {
  const root = tmpRoot();
  const git = (...args) => {
    const result = spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'kk13', GIT_AUTHOR_EMAIL: 'kk13@test',
        GIT_COMMITTER_NAME: 'kk13', GIT_COMMITTER_EMAIL: 'kk13@test',
      },
    });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  };
  git('init', '-b', 'main');
  git('commit', '--allow-empty', '-m', 'base');

  git('checkout', '-b', 'session-a');
  createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix: 'aaaaaaaa' });
  git('add', '.');
  git('commit', '-m', 'session a appends');

  git('checkout', 'main');
  git('checkout', '-b', 'session-b');
  createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix: 'bbbbbbbb' });
  git('add', '.');
  git('commit', '-m', 'session b appends');

  git('merge', 'session-a'); // one file per entry: textually disjoint, no conflict
  const files = readdirSync(join(root, 'logs', 'findings')).sort();
  assert.deepEqual(files, ['2026-07-08-aaaaaaaa.yaml', '2026-07-08-bbbbbbbb.yaml']);
});

// --- dogfood: the kit's own logs/ fragments stay green ------------------------

test("the kit's own logs/ directories exist and every fragment validates", () => {
  let fragments = 0;
  for (const [log, kind] of Object.entries(LOGS)) {
    const dir = join(repoRoot, 'logs', log);
    assert.ok(statSync(dir, { throwIfNoEntry: false })?.isDirectory(), `missing logs/${log}/`);
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      assert.match(name, /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{8}\.yaml$/, `logs/${log}/${name}`);
      const doc = load(readFileSync(join(dir, name), 'utf8'));
      assert.deepEqual(validateRecord(kind, doc).errors, [], `logs/${log}/${name}`);
      fragments += 1;
    }
  }
  assert.ok(fragments >= 1, 'the kit dogfoods its own log helper (at least one real entry)');
});
