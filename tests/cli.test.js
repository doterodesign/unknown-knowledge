// UCS-944: the CLI shell, once.
//
// Nine surfaces hand-roll the same flag grammar and the same catch block. The
// rule they restate is load-bearing: EXIT 1 MEANS FINDINGS, so a crash must
// never wear it — an agent riding the exit-code contract would quarantine and
// continue, past a check that never ran.
//
// These tests pin the harness directly. Nothing consumes it yet (this is the
// expand step); UCS-948/949/950 migrate the surfaces onto it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXIT_CODES } from '../payload/engine/lib/exit-codes.js';
import { parseArgs, runCli, UsageError } from '../payload/engine/lib/cli.js';

/** Collects what a command would have written to stderr. */
const capture = () => {
  const chunks = [];
  return { write: (s) => chunks.push(s), get text() { return chunks.join(''); } };
};

const SPEC = { boolean: ['json'], value: ['root', 'today'], repeatable: ['concepts'] };

// ------------------------------------------------------------ flag grammar

test('both flag spellings mean the same thing', () => {
  const a = parseArgs(['--root', 'x', '--json'], SPEC);
  const b = parseArgs(['--root=x', '--json'], SPEC);
  assert.deepEqual(a.options, b.options);
  assert.deepEqual(a.options, { root: 'x', json: true });
});

test('a repeatable flag accumulates; a value flag takes the last spelling', () => {
  const { options } = parseArgs(['--concepts', 'K-1', '--concepts=K-2', '--root', 'a', '--root=b'], SPEC);
  assert.deepEqual(options.concepts, ['K-1', 'K-2']);
  assert.equal(options.root, 'b');
});

test('an unknown flag is a usage error, never a guess', () => {
  assert.throws(() => parseArgs(['--bogus'], SPEC), UsageError);
  assert.throws(() => parseArgs(['--bogus'], SPEC), /unknown flag --bogus/);
});

test('a boolean flag takes no value; a value flag requires one', () => {
  assert.throws(() => parseArgs(['--json=yes'], SPEC), /--json takes no value/);
  assert.throws(() => parseArgs(['--root'], SPEC), /--root requires a value/);
  // A following flag is not a value.
  assert.throws(() => parseArgs(['--root', '--json'], SPEC), /--root requires a value/);
});

test('an empty value is as valueless as none — `--root=` never means the cwd', () => {
  assert.throws(() => parseArgs(['--root='], SPEC), /--root requires a value/);
  assert.throws(() => parseArgs(['--concepts='], SPEC), /--concepts requires a value/);
});

test('a stray positional is refused unless the command takes them', () => {
  assert.throws(() => parseArgs(['stray'], SPEC), /unexpected argument "stray"/);
  const { positionals, options } = parseArgs(['sport', 'type', '--json'], { ...SPEC, positionals: true });
  assert.deepEqual(positionals, ['sport', 'type']);
  assert.equal(options.json, true);
});

test('nothing at all is a legal command line', () => {
  assert.deepEqual(parseArgs([], SPEC), { options: {}, positionals: [] });
});

// ------------------------------------------------- the epilogue: never a 1
//
// The whole reason this module exists.

test('a main that throws exits 2, never 1 — a crash has no findings', async () => {
  const stderr = capture();
  const code = await runCli('demo', () => { throw new TypeError('simulated engine bug'); },
    { usage: 'usage: demo', argv: [], stderr });
  assert.equal(code, EXIT_CODES.FAILURE);
  assert.notEqual(code, EXIT_CODES.FINDINGS);
  assert.match(stderr.text, /demo: internal failure — the command did not complete/);
  assert.match(stderr.text, /simulated engine bug/, 'the operator needs the cause, not just the verdict');
});

test('an async main that rejects exits 2 as well', async () => {
  const stderr = capture();
  const code = await runCli('demo', async () => { throw new Error('async boom'); },
    { usage: 'usage: demo', argv: [], stderr });
  assert.equal(code, EXIT_CODES.FAILURE);
  assert.match(stderr.text, /async boom/);
});

test('a thrown non-Error still exits 2 rather than crashing the harness', async () => {
  const stderr = capture();
  // eslint-disable-next-line no-throw-literal
  const code = await runCli('demo', () => { throw 'a bare string'; }, { usage: 'usage: demo', argv: [], stderr });
  assert.equal(code, EXIT_CODES.FAILURE);
  assert.match(stderr.text, /a bare string/);
});

test('a usage error reports itself with the usage line, and exits 2', async () => {
  const stderr = capture();
  const code = await runCli('demo', () => { throw new UsageError('unknown flag --nope'); },
    { usage: 'usage: demo [--json]', argv: [], stderr });
  assert.equal(code, EXIT_CODES.FAILURE);
  assert.match(stderr.text, /demo: unknown flag --nope/);
  assert.match(stderr.text, /usage: demo \[--json\]/);
});

test('exit 1 is reachable only by a main that ran and returned it', async () => {
  const stderr = capture();
  const findings = await runCli('demo', () => EXIT_CODES.FINDINGS, { usage: 'u', argv: [], stderr });
  assert.equal(findings, EXIT_CODES.FINDINGS, 'a command that RAN may report findings');
  assert.equal(stderr.text, '', 'a successful run says nothing on stderr');

  const clean = await runCli('demo', () => EXIT_CODES.CLEAN, { usage: 'u', argv: [], stderr });
  assert.equal(clean, EXIT_CODES.CLEAN);
});

test('the harness hands argv to main and returns its code untouched', async () => {
  let seen;
  const code = await runCli('demo', (argv) => { seen = argv; return 7; },
    { usage: 'u', argv: ['--root', 'x'], stderr: capture() });
  assert.deepEqual(seen, ['--root', 'x']);
  assert.equal(code, 7, 'the harness never rewrites a code main chose deliberately');
});

// ------------------------------------------------- grammar meets epilogue

test('a parse failure inside main becomes a usage exit, not a stack trace', async () => {
  const stderr = capture();
  const main = (argv) => { parseArgs(argv, SPEC); return EXIT_CODES.CLEAN; };
  const code = await runCli('demo', main, { usage: 'usage: demo', argv: ['--bogus'], stderr });
  assert.equal(code, EXIT_CODES.FAILURE);
  assert.match(stderr.text, /demo: unknown flag --bogus/);
  assert.ok(!/at Object\.|internal failure/.test(stderr.text), 'a usage error is not an engine failure');
});

// ------------------------------- the grammar can express the real surfaces
//
// The nine shells are not identical: some take a subcommand, one takes query
// terms, one takes a JSON blob as a flag value. Pinning those shapes here means
// UCS-948/949/950 migrate onto a checked grammar rather than discovering a gap
// mid-refactor.

test('a subcommand positional followed by flags — the log-entry and init shape', () => {
  const spec = { boolean: [], value: ['log', 'date', 'entry', 'root'], positionals: true };
  const { positionals, options } = parseArgs(
    ['create', '--log', 'findings', '--date', '2026-07-09', '--root', 'unknown-knowledge'], spec);
  assert.deepEqual(positionals, ['create']);
  assert.equal(options.log, 'findings');
  assert.equal(options.date, '2026-07-09');
});

test('a JSON blob survives as a flag value — the log-entry --entry shape', () => {
  const entry = '{"trigger":"correction","summary":"K-101 src/a.ts"}';
  const { options } = parseArgs(['create', '--entry', entry], { value: ['entry'], positionals: true });
  assert.equal(options.entry, entry, 'the grammar must not touch the value it carries');
  assert.deepEqual(JSON.parse(options.entry).trigger, 'correction');
});

test('multi-word query terms as positionals — the resolve shape', () => {
  const { positionals, options } = parseArgs(['escrow', 'refund', 'window', '--root', '.'],
    { value: ['root'], positionals: true });
  assert.deepEqual(positionals, ['escrow', 'refund', 'window']);
  assert.equal(options.root, '.');
});

test('a numeric flag arrives as a string — parsing its meaning is the command\'s job', () => {
  // audit's --stale-days. The grammar carries text; the command decides whether
  // "-1" or "1.5" is a usage error, because only it knows the contract.
  const { options } = parseArgs(['--stale-days', '90'], { value: ['stale-days'] });
  assert.equal(options['stale-days'], '90');
});

test('a value that looks like a negative number is still a value, not a flag', () => {
  const { options } = parseArgs(['--stale-days', '-1'], { value: ['stale-days'] });
  assert.equal(options['stale-days'], '-1', 'only `--` prefixes are flags');
});
