// KK-13: findings & gap log schemas + append/transition helpers (PRD §3.4,
// D-010). Fragment-based logs — ONE FILE PER ENTRY — so concurrent agent
// sessions never merge-conflict; the helper is how agents append and
// transition entries without hand-editing YAML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
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

test('lifecycle fields (verified, reason, occurrences) exist on all three schemas', () => {
  for (const kind of Object.values(LOGS)) {
    const schema = JSON.parse(readFileSync(
      join(repoRoot, 'payload', 'schemas', `${kind}.schema.json`), 'utf8'));
    for (const field of ['verified', 'reason', 'occurrences']) {
      assert.ok(schema.properties[field], `${kind}: missing lifecycle field ${field}`);
    }
    assert.match(schema.description, /never verbatim user text or secrets/,
      `${kind}: capture content policy must be documented`);
  }
});

// --- create-entry: mint filename, stamp schema-version, one file per entry ---

test('createEntry mints <date>-<hex4>.yaml, stamps schema-version and open status', () => {
  const root = tmpRoot();
  const { file, entry } = createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING });
  assert.match(file, /^logs\/findings\/2026-07-08-[0-9a-f]{4}\.yaml$/);
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
  assert.throws(() => createEntry({ root, log: 'nope', date: '2026-07-08', fields: {} }), /log/);
  assert.ok(!existsSync(join(root, 'logs')));
});

test('an injected suffix collision is a hard error, never an overwrite', () => {
  const root = tmpRoot();
  createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix: 'a3f2' });
  assert.throws(
    () => createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix: 'a3f2' }),
    /exists/,
  );
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
  assert.match(file, /^logs\/findings\/2026-07-08-[0-9a-f]{4}\.yaml$/);

  const moved = runCli(['transition', '--file', file, '--to', 'proposed', '--date', '2026-07-09'], root);
  assert.equal(moved.status, 0, moved.stderr);
  assert.equal(JSON.parse(moved.stdout).status, 'proposed');

  const illegal = runCli(['transition', '--file', file, '--to', 'open', '--date', '2026-07-09'], root);
  assert.equal(illegal.status, 2);
  assert.match(illegal.stderr, /illegal transition/);
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
  createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix: 'aaaa' });
  git('add', '.');
  git('commit', '-m', 'session a appends');

  git('checkout', 'main');
  git('checkout', '-b', 'session-b');
  createEntry({ root, log: 'findings', date: '2026-07-08', fields: FINDING, suffix: 'bbbb' });
  git('add', '.');
  git('commit', '-m', 'session b appends');

  git('merge', 'session-a'); // one file per entry: textually disjoint, no conflict
  const files = readdirSync(join(root, 'logs', 'findings')).sort();
  assert.deepEqual(files, ['2026-07-08-aaaa.yaml', '2026-07-08-bbbb.yaml']);
});

// --- dogfood: the kit's own logs/ fragments stay green ------------------------

test("the kit's own logs/ directories exist and every fragment validates", () => {
  let fragments = 0;
  for (const [log, kind] of Object.entries(LOGS)) {
    const dir = join(repoRoot, 'logs', log);
    assert.ok(statSync(dir, { throwIfNoEntry: false })?.isDirectory(), `missing logs/${log}/`);
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      assert.match(name, /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{4}\.yaml$/, `logs/${log}/${name}`);
      const doc = load(readFileSync(join(dir, name), 'utf8'));
      assert.deepEqual(validateRecord(kind, doc).errors, [], `logs/${log}/${name}`);
      fragments += 1;
    }
  }
  assert.ok(fragments >= 1, 'the kit dogfoods its own log helper (at least one real entry)');
});
