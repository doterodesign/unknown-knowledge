// UCS-1157: the seeded git hooks — blocking validation before commit, and
// automatic reverse lookup over the staged diff.
//
// These source checks supplement tests/commit-gate.test.js, which exercises
// real commits with the installed pre-commit hook. They pin packaging,
// thin wrappers and the absence of a bypass switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hookDir = join(root, 'payload', 'hooks');
const manifest = readFileSync(join(root, 'cli', 'kit.manifest.yaml'), 'utf8');

/** The seeded hooks, and the single engine command each one wraps. */
const HOOKS = {
  'pre-commit': { cli: 'commit-check.js', purpose: 'blocking validation' },
  'reverse-lookup': { cli: 'resolve.js', purpose: 'automatic reverse lookup' },
};

/** A hook's executable lines — comments and blank lines are not logic. */
const code = (src) => src.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

for (const [name, { cli, purpose }] of Object.entries(HOOKS)) {
  const path = join(hookDir, name);
  const src = readFileSync(path, 'utf8');
  const lines = code(src);

  test(`${name}: ships as a POSIX-sh script at payload/hooks/`, () => {
    assert.ok(statSync(path).isFile());
    assert.match(src, /^#!\/bin\/sh\n/, 'POSIX sh, never bash — the hook runs wherever git does');
  });

  test(`${name}: ships through the D-007 manifest (an unseeded hook enforces nothing)`, () => {
    assert.match(manifest, new RegExp(`from: hooks/${name}, to: hooks/${name}`));
  });

  test(`${name}: invokes exactly one engine command — ${cli} (${purpose})`, () => {
    const invocations = [...src.matchAll(/node\s+"[^"]*\/engine\/([a-z-]+\.js)"/g)].map((m) => m[1]);
    assert.deepEqual(invocations, [cli],
      `a hook that invokes anything but ${cli} is no longer a wrapper around a tested command`);
  });

  test(`${name}: is THIN — sequencing belongs in the engine`, () => {
    // A generous ceiling that still refuses a hook that grew a brain. The
    // per-IDE wrapper pin uses the same shape (< 25 lines, "must stay a
    // THIN pointer"); this is its executable-line equivalent.
    //
    // The ceiling is 12 rather than 8 because refusing to pass silently
    // costs lines: checking a command's exit status and reporting the
    // failure is three lines that a hook swallowing the status would not
    // spend. Those lines are the opposite of a hook growing behavior —
    // they are what keeps its ONE decision (did the input read?) honest.
    assert.ok(lines.length <= 12,
      `${name} has ${lines.length} executable lines — a hook this size has behavior of its own, and sequencing belongs in the tested engine:\n${lines.join('\n')}`);
  });

  test(`${name}: never lets a failed command read as a clean one`, () => {
    // A supplemental source check
    // that every command whose output the hook DEPENDS ON has its status
    // read. A pipeline reports its LAST stage's status, so a `cmd | join`
    // that fails at `cmd` reports success, and the hook proceeds on empty
    // input — the exact silent pass the engine's exit-2 contract exists to
    // prevent. Assert the two never share a line.
    for (const line of lines) {
      if (!/^[A-Z_]+=\$\(git /.test(line)) continue;
      // Strip the `||` guard before looking for a pipe, so the guard that
      // makes the line safe is not mistaken for the hazard it prevents.
      assert.doesNotMatch(line.replace(/\|\|.*$/, ''), /\|/,
        `${name} pipes git's output in the same assignment that captures it — the shell would report the pipeline's LAST status, masking a git failure as an empty result:\n  ${line}`);
      assert.match(line, /\|\|/,
        `${name} captures git output without checking git's exit status — a failed read must exit 2 (the lookup never ran), never 0:\n  ${line}`);
    }
  });

  test(`${name}: propagates the engine's exit code UNCHANGED`, () => {
    assert.match(src, /^exit \$\?$/m,
      'the hook must exit with the engine command\'s code — the exit code IS the verdict (PRD §5)');
    // Nothing may stand between the command and its code. Checked against
    // the EXECUTABLE lines only: prose explaining what exit 1 means is
    // documentation, and documentation is not a code path.
    const body = lines.join('\n');
    assert.doesNotMatch(body, /\|\|\s*true/, 'a hook that ORs to true is a hook that cannot fail');
    assert.doesNotMatch(body, /\|\|\s*exit 0/, 'a hook that falls back to 0 swallows the finding');
    // The hook never authors a VERDICT — no self-made 0 or 1 standing in for
    // what the engine said. `exit 2` is the one code it may author, and only
    // for the one thing the engine cannot report: its own input never being
    // read. That is the same "a check that never ran" signal the engine
    // spells 2, kept honest rather than downgraded to an empty success.
    assert.doesNotMatch(body, /exit 1\b/, 'the hook never authors a finding verdict; it forwards one');
    assert.doesNotMatch(body, /^exit 0$/m, 'the hook never authors a clean verdict; it forwards one');
  });

  test(`${name}: has NO BYPASS — no switch makes it pass`, () => {
    // The classic escape hatches, checked against the executable lines: a
    // hook with an off switch enforces nothing, and the switch is always
    // reached for exactly when it matters. (The pre-commit hook's PROSE
    // says it has no bypass to read, which is the opposite of having one.)
    const body = lines.join('\n');
    for (const bypass of [/SKIP/i, /NO_VERIFY/i, /DISABLE/i, /FORCE/i, /BYPASS/i]) {
      assert.doesNotMatch(body, bypass,
        `${name} reads a bypass switch — protocol compliance stops being a property of the mechanism the moment it can be turned off`);
    }
    // The two variables it DOES read are location, never gate.
    assert.match(src, /KIT_DIR:-unknown-knowledge/);
    assert.match(src, /UK_ROOT:-\./);
  });


}

test('pre-commit runs the BLOCKING validator, unfiltered — the whole store or nothing', () => {
  const src = readFileSync(join(hookDir, 'pre-commit'), 'utf8');
  assert.match(src, /commit-check\.js" --root "\$UK_ROOT"/);
  // No --concepts filter: a pre-commit gate that checks a subset is a gate
  // that passes on the part nobody changed.
  assert.doesNotMatch(src, /--concepts/);
});

test('reverse-lookup asks the engine which leaves govern the staged paths', () => {
  const src = readFileSync(join(hookDir, 'reverse-lookup'), 'utf8');
  // `resolve.js --paths` is the surface that answers it (UCS-1151).
  assert.match(src, /resolve\.js" --paths "\$PATHS"/);
  // The paths come from git, not from the hook's own idea of what changed.
  assert.match(src, /git diff --cached --name-only/);
  // An empty diff is not a failure — and `--paths` with an empty list is a
  // usage error (exit 2), so the hook must not invoke the engine with one.
  assert.match(src, /\[ -z "\$STAGED" \] && exit 0/);
  // A git failure is a different thing from an empty diff, and exits 2.
  assert.match(src, /exit 2/);
});

test('the manifest seeds hooks WITHOUT installing them — init never writes .git/', () => {
  assert.match(manifest, /SEED but do not INSTALL/);
  assert.match(manifest, /init never writes \.git\//);
  // Seeded under the kit root, not at the client repo root: only the
  // platforms: registry and the root-files allowlist write outside it.
  assert.doesNotMatch(manifest, /to: \.git\//);
});
