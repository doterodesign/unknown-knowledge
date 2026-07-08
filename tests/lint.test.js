// The lint harness: a zero-dependency `node --check` syntax sweep (D-002 —
// no eslint, no build tooling; dev machines and CI only need Node itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lintScript = join(root, 'scripts', 'lint.js');

function runLint(...args) {
  return spawnSync(process.execPath, [lintScript, ...args], { encoding: 'utf8' });
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'unknown-knowledge-lint-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('lint sweep passes on this repo', () => {
  const res = runLint();
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /checked \d+ files?/);
});

test('lint fails on a file with a syntax error', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'broken.js'), 'const = ;\n');
    const res = runLint(dir);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /broken\.js/);
  });
});

test('lint skips fixture trees and node_modules', () => {
  // Acceptance fixtures deliberately contain malformed shapes (PRD §9.2);
  // they must never fail the kit's own lint.
  withTempDir((dir) => {
    for (const skipped of ['fixtures', 'extractor-fixtures', 'node_modules']) {
      mkdirSync(join(dir, skipped), { recursive: true });
      writeFileSync(join(dir, skipped, 'broken.js'), 'const = ;\n');
    }
    writeFileSync(join(dir, 'ok.js'), 'export const ok = true;\n');
    const res = runLint(dir);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /checked 1 file\b/);
  });
});
