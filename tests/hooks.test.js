// UCS-1157: the seeded git hooks — blocking validation before commit, and
// automatic reverse lookup over the staged diff.
//
// These hooks are EXPLICITLY NOT A TEST SEAM. The tested surface is the
// engine command each one wraps (tests/validate.test.js,
// tests/resolve.test.js), and the wiring is reviewed the way the per-IDE
// wrappers are (tests/init-wrappers.test.js). So this file does not test
// hook behavior — there is no behavior to test. It pins the properties
// that make "test the command, not the hook" a true statement:
//
//   1. the hook is THIN — it invokes one engine command and does nothing
//      else, so nothing can be true of the hook that is not true of the
//      command;
//   2. it propagates the command's exit code UNCHANGED — no remapping, no
//      swallowing, no `|| true`;
//   3. it has NO BYPASS — no env var, no flag, no branch that makes it
//      pass. A hook with an off switch enforces nothing;
//   4. it SHIPS through the D-007 manifest, because a hook the manifest
//      does not name is never seeded, and an unseeded hook enforces
//      nothing either.
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
  'pre-commit': { cli: 'validate.js', purpose: 'blocking validation' },
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

  test(`${name}: is THIN — the wrapped command is the tested surface`, () => {
    // A generous ceiling that still refuses a hook that grew a brain. The
    // per-IDE wrapper pin uses the same shape (< 25 lines, "must stay a
    // THIN pointer"); this is its executable-line equivalent.
    assert.ok(lines.length <= 8,
      `${name} has ${lines.length} executable lines — a hook this size has behavior of its own, and behavior of its own is untested behavior:\n${lines.join('\n')}`);
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
    assert.doesNotMatch(body, /exit [12]\b/, 'the hook never authors an exit code; it forwards one');
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

  test(`${name}: declares that it is not a test seam`, () => {
    assert.match(src, /[Nn]ot a test seam/);
    assert.match(src, /per-IDE wrappers/);
  });
}

test('pre-commit runs the BLOCKING validator, unfiltered — the whole store or nothing', () => {
  const src = readFileSync(join(hookDir, 'pre-commit'), 'utf8');
  assert.match(src, /validate\.js" --root "\$UK_ROOT"/);
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
  assert.match(src, /\[ -z "\$PATHS" \] && exit 0/);
});

test('the manifest seeds hooks WITHOUT installing them — init never writes .git/', () => {
  assert.match(manifest, /SEED but do not INSTALL/);
  assert.match(manifest, /init never writes \.git\//);
  // Seeded under the kit root, not at the client repo root: only the
  // platforms: registry and the root-files allowlist write outside it.
  assert.doesNotMatch(manifest, /to: \.git\//);
});
