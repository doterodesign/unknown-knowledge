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
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES } from '../payload/engine/lib/exit-codes.js';
import { EngineRefusal, parseArgs, rethrowIfBug, runCli, UsageError } from '../payload/engine/lib/cli.js';

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

test('an empty value is as valueless as none — in EITHER spelling', () => {
  // `--root=` and `--root ""` both arrive when a shell expands an unset
  // variable, and both would otherwise silently resolve to the cwd.
  assert.throws(() => parseArgs(['--root='], SPEC), /--root requires a value/);
  assert.throws(() => parseArgs(['--root', ''], SPEC), /--root requires a value/);
  assert.throws(() => parseArgs(['--concepts='], SPEC), /--concepts requires a value/);
  assert.throws(() => parseArgs(['--concepts', ''], SPEC), /--concepts requires a value/);
});

test('the `=` spelling is the escape hatch for a value that looks like a flag', () => {
  // In the space form a `--`-prefixed token is the next flag. With `=` the
  // value is unambiguous, so `--reason=--force` must survive as a value.
  const { options } = parseArgs(['--reason=--force'], { value: ['reason'] });
  assert.equal(options.reason, '--force');
  assert.throws(() => parseArgs(['--reason', '--force'], { value: ['reason'] }), /--reason requires a value/);
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

// -------------------------- the migrated surfaces (UCS-948, UCS-949)
//
// The harness's own tests above prove a throw exits 2. These prove the migrated
// surfaces actually route through it — a structural pin, because a CLI that
// re-grew its own catch block would pass every behavioural test right up until
// the day it crashed and reported findings.
//
// `survey-map` and `audit` are the ones that make this urgent: they are the two
// surfaces that legitimately RETURN exit 1 (blind spots; findings under the
// human opt-in). For them, a crash wearing the FINDINGS code is not a cosmetic
// bug — it is indistinguishable from a real answer.

/** Each migrated surface, and the argv prefix it needs before `--root`. */
const MIGRATED_SURFACES = Object.freeze([
  { name: 'validate.js', before: [] },
  { name: 'validate-values.js', before: [] },
  { name: 'preflight.js', before: [] },
  { name: 'resolve.js', before: ['some-term'] },
  { name: 'audit.js', before: [] },
  { name: 'survey-map.js', before: [] },
  { name: 'log-entry.js', before: ['create'] },
]);
const MIGRATED = MIGRATED_SURFACES.map((s) => s.name);

test('the migrated surfaces run through the harness and own no catch-to-exit mapping', async () => {
  for (const name of MIGRATED) {
    const source = await readFile(fileURLToPath(new URL(`../payload/engine/${name}`, import.meta.url)), 'utf8');
    assert.match(source, /runCli\(/, `${name} must route through the harness`);
    assert.ok(!/class UsageError extends Error/.test(source), `${name} must not redeclare UsageError`);
    // The tell-tale of a hand-rolled epilogue is not "a catch block" — a CLI may
    // still turn a specific engine throw into a specific, actionable message
    // (an unreadable --root). It is deciding what a USAGE ERROR or an
    // UNEXPECTED throw means. That judgement belongs to the harness alone.
    assert.ok(!/instanceof UsageError/.test(source),
      `${name} decides what a usage error means — that is the harness's job`);
    assert.ok(!/internal failure/.test(source),
      `${name} hand-rolls the crash epilogue — that is the harness's job`);
    assert.ok(!/function parseArgs\(argv\) \{[\s\S]{0,200}?for \(let i = 0/.test(source),
      `${name} still hand-rolls the flag loop`);
  }
});

test('a crash in a migrated surface exits 2, never 1 — the guard is the harness', async () => {
  // Forced through the same seam the CLIs use. Their `main` is not exported, so
  // this exercises the harness with a main that throws exactly as theirs would.
  for (const name of MIGRATED) {
    const stderr = capture();
    const code = await runCli(name.replace('.js', ''), () => { throw new TypeError('simulated engine bug'); },
      { usage: 'u', argv: ['--root', 'x'], stderr });
    assert.equal(code, EXIT_CODES.FAILURE, `${name}: a crash must exit 2`);
    assert.notEqual(code, EXIT_CODES.FINDINGS, `${name}: a crash must never wear the FINDINGS code`);
  }
});

test('every migrated surface refuses an empty --root rather than reading the cwd', () => {
  for (const { name, before } of MIGRATED_SURFACES) {
    const cli = fileURLToPath(new URL(`../payload/engine/${name}`, import.meta.url));
    // A bounded spawn: if a surface ever regressed into blocking (waiting on
    // stdin, say) before reaching the usage-error path, an unbounded spawn
    // would hang CI rather than fail it.
    const r = spawnSync(process.execPath, [cli, ...before, '--root', ''], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(r.signal, 'SIGTERM', `${name}: timed out instead of refusing an empty --root`);
    assert.equal(r.status, EXIT_CODES.FAILURE, `${name}: --root "" must not silently mean the cwd`);
    assert.match(r.stderr, /--root requires a value/);
  }
});

test('the two surfaces that can return exit 1 return it only when they ran', () => {
  // survey-map reports blind spots with exit 1; audit reports findings with
  // exit 1 under --fail-on-findings. Both must reach exit 2 — never 1 — when
  // the run itself could not complete.
  const cli = (n) => fileURLToPath(new URL(`../payload/engine/${n}`, import.meta.url));
  const scenarios = [
    ['a root that does not exist', fileURLToPath(new URL('fixtures/does-not-exist', import.meta.url))],
    ['a root that is a file, not a directory', fileURLToPath(new URL('cli.test.js', import.meta.url))],
  ];
  for (const [label, root] of scenarios) {
    for (const [name, ...rest] of [['survey-map.js'], ['audit.js', '--fail-on-findings']]) {
      const r = spawnSync(process.execPath, [cli(name), ...rest, '--root', root], { encoding: 'utf8', timeout: 10_000 });
      assert.notEqual(r.signal, 'SIGTERM', `${name}: timed out on ${label}`);
      assert.notEqual(r.status, EXIT_CODES.FINDINGS,
        `${name} exited 1 on ${label} — a run that never completed. An agent would read that as a real answer`);
      assert.equal(r.status, EXIT_CODES.FAILURE, `${name}: a run that could not complete exits 2 (${label})`);
    }
  }
});

// ------------------------------- refusal vs bug (UCS-949, CodeRabbit #38)
//
// A surface may report an ANTICIPATED refusal itself, without a stack. It must
// not report a BUG that way: a TypeError rendered as `audit: cannot read
// properties of undefined` reads exactly like a considered refusal, and nobody
// can debug it. Both exit 2 — this is diagnosability, not the exit contract.

test('rethrowIfBug lets an anticipated refusal through and rethrows everything else', () => {
  // A refusal: what every engine refusal already throws.
  assert.doesNotThrow(() => rethrowIfBug(new Error('no git in this root')));
  assert.doesNotThrow(() => rethrowIfBug(new EngineRefusal('two candidate kit roots')));

  // Bugs. Each must travel on to the harness.
  for (const bug of [new TypeError('x'), new ReferenceError('x'), new RangeError('x'), new SyntaxError('x')]) {
    assert.throws(() => rethrowIfBug(bug), bug.constructor, `${bug.name} is a bug, not a refusal`);
  }
  // A usage error raised deep in the engine belongs to the harness too — only
  // it knows to print the usage line.
  assert.throws(() => rethrowIfBug(new UsageError('bad flag')), UsageError);
  // A non-Error throw is never a considered refusal.
  assert.throws(() => rethrowIfBug('a string'));
});

test('a bug inside a surface reaches the harness, stack and all', async () => {
  // The surfaces' engine-failure catches sit between `main` and `runCli`. This
  // composes them exactly as the CLIs do: the catch calls rethrowIfBug, so the
  // TypeError travels on and runCli prints a stack.
  const stderr = capture();
  const surfaceMain = () => {
    try {
      throw new TypeError('simulated engine bug');
    } catch (error) {
      rethrowIfBug(error);
      stderr.write('surface: swallowed\n'); // unreachable: rethrowIfBug threw
      return EXIT_CODES.FAILURE;
    }
  };
  const code = await runCli('audit', surfaceMain, { usage: 'u', argv: [], stderr });
  assert.equal(code, EXIT_CODES.FAILURE);
  assert.doesNotMatch(stderr.text, /swallowed/, 'the surface must not speak for a bug');
  assert.match(stderr.text, /internal failure/);
  assert.match(stderr.text, /simulated engine bug/);
  assert.match(stderr.text, /at /, 'a bug reports its stack');
});

test('an anticipated refusal is still reported by the surface, without a stack', async () => {
  // The surface writes its own message and returns; the harness adds nothing.
  const stderr = capture();
  const surfaceMain = () => {
    try {
      throw new Error('no git in this root');
    } catch (error) {
      rethrowIfBug(error);
      stderr.write(`survey-map: ${error.message}\n`);
      return EXIT_CODES.FAILURE;
    }
  };
  const code = await runCli('survey-map', surfaceMain, { usage: 'u', argv: [], stderr });
  assert.equal(code, EXIT_CODES.FAILURE);
  assert.equal(stderr.text, 'survey-map: no git in this root\n', 'a refusal carries no stack and no usage line');
});

test('every surface that catches an engine failure rethrows bugs first', async () => {
  // Structural. A catch that reports `${error.message}` without first asking
  // rethrowIfBug is a catch that will one day report a TypeError as a refusal.
  for (const name of ['audit.js', 'survey-map.js', 'log-entry.js']) {
    const source = await readFile(fileURLToPath(new URL(`../payload/engine/${name}`, import.meta.url)), 'utf8');
    for (const block of source.match(/\} catch \(error\) \{[\s\S]*?\n  \}/g) ?? []) {
      // Only the catches that DECIDE THE COMMAND'S FATE. A catch that degrades
      // an unreadable suppressions file to a warning and carries on is not
      // speaking for the run, so it owes nothing to the harness.
      if (!/EXIT_CODES\.FAILURE/.test(block)) continue;
      assert.match(block, /rethrowIfBug\(error\)/,
        `${name} has a catch that reports an error message without first rethrowing bugs:\n${block}`);
    }
  }
});

test('survey-map refuses a root named twice rather than picking one', () => {
  const cli = fileURLToPath(new URL('../payload/engine/survey-map.js', import.meta.url));
  const a = fileURLToPath(new URL('../fixtures/ts-app', import.meta.url));
  const r = spawnSync(process.execPath, [cli, a, '--root', a], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.status, EXIT_CODES.FAILURE, 'two names for the root is an ambiguity, not a preference');
  assert.match(r.stderr, /named twice/);
});

test('audit refuses an empty --stale-days rather than reading it as zero', () => {
  // `Number('') === 0` made `--stale-days=` mean "everything is stale" and the
  // command exited 0 with a plausible report. The grammar closes it.
  const cli = fileURLToPath(new URL('../payload/engine/audit.js', import.meta.url));
  const root = fileURLToPath(new URL('../fixtures/ts-app', import.meta.url));
  const r = spawnSync(process.execPath, [cli, '--root', root, '--stale-days='], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.status, EXIT_CODES.FAILURE);
  assert.match(r.stderr, /--stale-days requires a value/);
});
