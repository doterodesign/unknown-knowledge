// KK-19: `npx unknown-knowledge init` — prompts, stack auto-detection, the
// git check-ignore sweep, D-009 warning, D-006 no-CI-mutation, and the npx
// packaging (bin/files). Exercised through the public seam — the cli/init.js
// process — headlessly via flags/--yes and interactively by piping stdin.
// The copy/wrapper semantics themselves are KK-17/KK-18's suites
// (tests/init-copy.test.js, tests/init-wrappers.test.js) — not re-tested
// here; this suite covers only the UX layer init.js adds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const kitRoot = fileURLToPath(new URL('..', import.meta.url));
const initJs = join(kitRoot, 'cli', 'init.js');

const scratch = mkdtempSync(join(tmpdir(), 'kk19-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const freshDir = () => {
  const dir = join(scratch, `t${n += 1}`);
  mkdirSync(dir);
  return dir;
};

/**
 * Plant a resolvable js-yaml under <dir>/node_modules so init's runtime
 * dependency preflight stays silent — isolating a test to the warning it
 * actually means to assert.
 */
const withResolvableDep = (dir) => {
  const pkgDir = join(dir, 'node_modules', 'js-yaml');
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'package.json'), '{"name":"js-yaml","version":"5.2.1","main":"index.js"}\n');
  writeFileSync(join(pkgDir, 'index.js'), 'export const load = () => {};\n');
  return dir;
};

function runInit(args, { input } = {}) {
  const r = spawnSync(process.execPath, [initJs, ...args],
    { encoding: 'utf8', input: input ?? '' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function gitInit(dir) {
  for (const args of [['init', '-q'], ['add', '-A']]) {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args[0]}: ${r.stderr}`);
  }
}

// ------------------------------------------------ headless cold run (--yes)

test('--yes cold run: detection pre-selects, seed lands, D-009 warning + /knowledge-bootstrap handoff printed (exit 0)', () => {
  const target = freshDir();
  writeFileSync(join(target, 'tsconfig.json'), '{}');
  const r = runInit(['init', '--yes', '--target', target]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /stack auto-detection: ts/);
  assert.match(r.stdout, /seeded unknown-knowledge\/ .*stacks: ts/);
  // D-009 later-stacks warning printed at the end AND carried by the seeded README (KK-24).
  assert.match(r.stdout, /adopt another stack later.*no update channel/s);
  const readme = readFileSync(join(target, 'unknown-knowledge', 'README.md'), 'utf8');
  assert.match(readme, /adopt another stack later, you author your own pack/);
  // Phase-2 handoff, D-019 skill name.
  assert.match(r.stdout, /now run \/knowledge-bootstrap in your agent/);
  // Only the detected stack's pack shipped.
  assert.ok(existsSync(join(target, 'unknown-knowledge', 'engine/tests/fixtures/ts')));
  assert.ok(!existsSync(join(target, 'unknown-knowledge', 'engine/tests/fixtures/swift')));
  // .gitkeep in empty log dirs is the manifest's job — verify it landed.
  for (const dir of ['logs/findings', 'logs/misses', 'logs/gaps', 'decisions/entries']) {
    assert.ok(existsSync(join(target, 'unknown-knowledge', dir, '.gitkeep')), `${dir}/.gitkeep missing`);
  }
});

test('flags drive every prompt: --root/--stacks/--platforms with --yes need no stdin', () => {
  const target = freshDir();
  const r = runInit(['init', '--yes', '--target', target,
    '--root', 'kb', '--stacks', 'swift', '--platforms', 'claude-code,cursor']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(target, 'kb', 'kit.manifest.yaml')));
  assert.ok(existsSync(join(target, 'kb', 'engine/tests/fixtures/swift')));
  assert.ok(!existsSync(join(target, 'kb', 'engine/tests/fixtures/ts')));
  assert.match(readFileSync(join(target, 'CLAUDE.md'), 'utf8'), /kb\/protocol\/AGENTS\.md/);
  assert.ok(existsSync(join(target, '.cursor/rules/unknown-knowledge.mdc')));
});

// ------------------------------------------------------ stack auto-detection

test('auto-detection heuristics: Package.swift / *.swift → swift; package.json / tsconfig.json / *.ts → ts; empty → config-only', () => {
  const detect = (seed) => {
    const target = freshDir();
    seed(target);
    const r = runInit(['init', '--yes', '--target', target]);
    assert.equal(r.status, 0, r.stderr);
    return /stack auto-detection: (.+)\n/.exec(r.stdout)[1];
  };
  assert.equal(detect((t) => writeFileSync(join(t, 'Package.swift'), '// swift-tools-version:6.0')), 'swift');
  assert.equal(detect((t) => {
    mkdirSync(join(t, 'Sources'));
    writeFileSync(join(t, 'Sources', 'App.swift'), 'enum A {}');
  }), 'swift');
  assert.equal(detect((t) => writeFileSync(join(t, 'package.json'), '{}')), 'ts');
  assert.equal(detect((t) => {
    mkdirSync(join(t, 'src'));
    writeFileSync(join(t, 'src', 'a.ts'), 'export {};');
  }), 'ts');
  assert.equal(detect((t) => {
    writeFileSync(join(t, 'package.json'), '{}');
    writeFileSync(join(t, 'Package.swift'), '');
  }), 'swift, ts');
  assert.equal(detect(() => {}), 'none (config-only)');
});

test('detection is the --yes default: config-only repo seeds no packs; --stacks overrides detection', () => {
  const target = freshDir();
  const r = runInit(['init', '--yes', '--target', target]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(target, 'unknown-knowledge', 'engine/tests/fixtures/ts')));
  assert.ok(!existsSync(join(target, 'unknown-knowledge', 'engine/tests/fixtures/swift')));

  const override = freshDir();
  writeFileSync(join(override, 'package.json'), '{}'); // detects ts…
  const r2 = runInit(['init', '--yes', '--target', override, '--stacks', 'swift']); // …but the flag wins
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(existsSync(join(override, 'unknown-knowledge', 'engine/tests/fixtures/swift')));
  assert.ok(!existsSync(join(override, 'unknown-knowledge', 'engine/tests/fixtures/ts')));
});

// -------------------------------------------------- interactive prompt paths

test('interactive: piped answers drive root, platform multi-select (manifest-listed), and stacks', () => {
  const target = freshDir();
  writeFileSync(join(target, 'Package.swift'), '');
  const r = runInit(['init', '--target', target], { input: 'kb\nclaude-code, copilot\nts swift\n' });
  assert.equal(r.status, 0, r.stderr);
  // The platform multi-select lists the manifest registry, ids + names.
  for (const line of [/claude-code\s+Claude Code/, /codex\s+Codex/, /copilot\s+GitHub Copilot/,
    /cursor\s+Cursor/, /gemini\s+Gemini CLI/]) {
    assert.match(r.stdout, line);
  }
  // Detection shown as the stacks default; answers override it.
  assert.match(r.stdout, /stacks \(pre-selected by auto-detection\) \[swift\]/);
  assert.match(r.stdout, /seeded kb\/ .*stacks: swift, ts/);
  assert.ok(existsSync(join(target, 'CLAUDE.md')));
  assert.ok(existsSync(join(target, '.github/copilot-instructions.md')));
  assert.ok(existsSync(join(target, 'kb', 'engine/tests/fixtures/ts')));
  assert.ok(existsSync(join(target, 'kb', 'engine/tests/fixtures/swift')));
});

test('interactive: empty answers (or exhausted stdin) accept every default — root, no platforms, detected stacks', () => {
  const target = freshDir();
  writeFileSync(join(target, 'tsconfig.json'), '{}');
  const r = runInit(['init', '--target', target], { input: '\n\n\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /root dir name \(always visible, never dotted\) \[unknown-knowledge\]/);
  assert.match(r.stdout, /seeded unknown-knowledge\/ .*stacks: ts/);
  assert.ok(!existsSync(join(target, 'CLAUDE.md')), 'no platform selected → no wrappers');
});

test('interactive: invalid platform id re-asks with the available list; "none" deselects detected stacks', () => {
  const target = freshDir();
  writeFileSync(join(target, 'package.json'), '{}');
  const r = runInit(['init', '--target', target], { input: '\nbogus\ngemini\nnone\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /unknown platform "bogus"/);
  assert.match(r.stdout, /available: claude-code, codex, copilot, cursor, gemini/);
  assert.match(r.stdout, /seeded unknown-knowledge\/ .*stacks: none/);
  assert.match(r.stdout, /wrapper gemini: created GEMINI\.md/);
});

test('interactive: dotted root answer re-asks (the engine validates, the prompt presents)', () => {
  const target = freshDir();
  const r = runInit(['init', '--target', target], { input: '.kb\nkb\n\n\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /never dotted \(PRD §6\)/);
  assert.ok(existsSync(join(target, 'kb', 'kit.manifest.yaml')));
});

// --------------------------------------------------- git check-ignore sweep

test('gitignored seeded paths WARN with the negation rule to add (a gitignored findings log kills the loop silently)', () => {
  const target = freshDir();
  writeFileSync(join(target, '.gitignore'), 'logs\n');
  gitInit(target);
  const r = runInit(['init', '--yes', '--target', target]);
  assert.equal(r.status, 0, 'gitignore findings warn, never fail the seed');
  assert.match(r.stderr, /WARN: .*gitignored/);
  assert.match(r.stderr, /unknown-knowledge\/logs\/findings\/\.gitkeep/);
  assert.match(r.stderr, /!unknown-knowledge\/logs\/\*\*/);
});

test('clean git repo: sweep runs silently; non-git target: sweep skipped with one WARN saying so', () => {
  const clean = withResolvableDep(freshDir());
  gitInit(clean);
  const r = runInit(['init', '--yes', '--target', clean]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!/WARN/.test(r.stderr), `clean repo must not warn: ${r.stderr}`);

  const noGit = withResolvableDep(freshDir());
  const r2 = runInit(['init', '--yes', '--target', noGit]);
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stderr, /WARN: not a git repo — skipping the git check-ignore sweep/);
  assert.equal(r2.stderr.match(/WARN/g).length, 1, 'warn once');
});

// ------------------------------------------- refusals + usage errors (exit 2)

// Every other test pre-creates its target, so the nonexistent-target path
// needs its own pin: auto-detection walks the target long before the copy
// engine's guard fires, and an ENOENT stack trace exits 1 — the FINDINGS
// code — making a crashed init read as "seeded, with findings".
test('a target that does not exist refuses cleanly (exit 2), never an ENOENT stack trace', () => {
  const missing = join(scratch, 'no-such-dir-here');
  const r = runInit(['init', '--yes', '--target', missing]);
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
  assert.match(r.stderr, /is not an existing directory/);
  assert.ok(!/ENOENT|readdirSync|at Object\./.test(r.stderr), `no stack trace: ${r.stderr}`);
});

test('a target that is a file, not a directory, refuses cleanly (exit 2)', () => {
  const filePath = join(freshDir(), 'a-file');
  writeFileSync(filePath, 'not a dir\n');
  const r = runInit(['init', '--yes', '--target', filePath]);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /is not an existing directory/);
});


test('engine refusals pass through: an existing root refuses (exit 2); unknown platform/stack flags refuse BEFORE seeding', () => {
  const target = freshDir();
  assert.equal(runInit(['init', '--yes', '--target', target]).status, 0);
  const again = runInit(['init', '--yes', '--target', target]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /refused: .*already exists/);

  for (const flags of [['--platforms', 'vscode'], ['--stacks', 'kotlin']]) {
    const fresh = freshDir();
    const r = runInit(['init', '--yes', '--target', fresh, ...flags]);
    assert.equal(r.status, 2, `${flags.join(' ')} must refuse`);
    assert.ok(!existsSync(join(fresh, 'unknown-knowledge')),
      'a failed selection must not leave a half-initialized target');
  }
});

test('usage errors exit 2: unknown command, unknown flag, flag without value; --help exits 0 with usage', () => {
  for (const args of [['frobnicate'], ['init', '--no-such-flag'], ['init', '--root']]) {
    const r = runInit(args);
    assert.equal(r.status, 2, `args [${args}] must exit 2`);
    assert.match(r.stderr, /usage:/);
  }
  const help = runInit(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: npx unknown-knowledge init/);
});

// ------------------------------------------------- D-006: no CI mutation, ever

test('D-006: init never writes CI config — no .github/workflows anywhere, and the code header states it', () => {
  const target = freshDir();
  gitInit(target);
  // Even with EVERY platform selected, the only .github/ artifact is the
  // copilot wrapper — never a workflow file.
  const r = runInit(['init', '--yes', '--target', target,
    '--platforms', 'claude-code,codex,copilot,cursor,gemini']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(target, '.github/copilot-instructions.md')));
  assert.ok(!existsSync(join(target, '.github/workflows')), 'init must never create workflow files (D-006)');
  assert.ok(!existsSync(join(target, 'unknown-knowledge', '.github')), 'no .github/ inside the seeded root');
  const header = readFileSync(initJs, 'utf8');
  assert.match(header, /NO CI MUTATION, EVER \(D-006\)/);
});

// ------------------------------------------------------ npx packaging (bin)

test('package.json: bin maps unknown-knowledge → cli/init.js; files allowlist ships cli/ + payload/ + license artifacts; private guard stays on', () => {
  const pkg = JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.bin, { 'unknown-knowledge': 'cli/init.js' });
  assert.deepEqual(pkg.files, ['cli/', 'payload/', 'LICENSE', 'NOTICE', 'README.md'],
    'publish allowlist: the kit\'s fixtures/, tests/, acceptance/ never ship (D-007 posture)');
  assert.equal(pkg.private, true,
    'private stays true until the first release — flipping it is a release decision (docs/publishing.md)');
});

// --------------------------------------------- runtime-dependency preflight

// The handoff line sends the human to phase 2, and every engine command it
// reaches for imports js-yaml. Resolution is checked from the seeded engine
// file, so these pin the real question rather than an approximation: the
// unresolved case must warn loudly (an unresolved import exits 1, which the
// exit-code contract reads as "findings", not "engine failure"), and a
// resolvable dependency must stay silent.
test('dependency preflight: unresolvable js-yaml WARNs with the install command and the exit-code trap', () => {
  const target = freshDir();
  const r = runInit(['init', '--yes', '--target', target, '--stacks', 'none', '--platforms', 'none']);
  assert.equal(r.status, 0, 'an unresolved dependency warns; it never refuses a correct seed');
  assert.match(r.stderr, /WARN: the seeded engine's one runtime dependency, js-yaml, does not resolve/);
  assert.match(r.stderr, /npm install --save-dev js-yaml/);
  assert.match(r.stderr, /exits 1, which the exit-code contract reads as "findings present"/);
});

test('dependency preflight: a resolvable js-yaml stays silent', () => {
  const target = withResolvableDep(freshDir());
  const r = runInit(['init', '--yes', '--target', target, '--stacks', 'none', '--platforms', 'none']);
  assert.equal(r.status, 0);
  assert.ok(!/does not resolve/.test(r.stderr), `resolvable dependency must not warn: ${r.stderr}`);
});
