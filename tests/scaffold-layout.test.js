// KK-01 done-criterion 2: the kit repo layout matches PRD §9.2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// PRD §9.2 — "Kit repo (this product)".
const REQUIRED_DIRS = [
  'cli', //                          init: prompts, payload copy, wrapper generation
  'payload/engine', //               EXACTLY what init vendors (allowlist root, D-007)
  'payload/protocol',
  'payload/schemas',
  'payload/wrappers',
  'payload/extractor-fixtures', //   shipped conditionally by stack selection (D-009)
  'fixtures/swift-app', //           acceptance fixtures — NEVER in payload (D-007)
  'fixtures/ts-app',
  'tests', //                        engine unit/integration vs fixtures; init e2e
  'acceptance', //                   scripted walkthrough checklists for the skills
  'docs', //                         client-facing README, CI wiring guide
  'decisions', //                    the kit eats its own cooking
];

test('layout matches PRD §9.2', () => {
  for (const dir of REQUIRED_DIRS) {
    const stat = statSync(join(root, dir), { throwIfNoEntry: false });
    assert.ok(stat?.isDirectory(), `missing §9.2 directory: ${dir}`);
  }
});

test('kit eats its own cooking: root documents present', () => {
  for (const file of ['PRD.html', 'CONTEXT.md', 'README.md']) {
    const stat = statSync(join(root, file), { throwIfNoEntry: false });
    assert.ok(stat?.isFile(), `missing root file: ${file}`);
  }
});

test('package.json follows D-002 / D-016 conventions', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'unknown-knowledge', 'D-016/D-018: bare name is canonical');
  assert.equal(pkg.type, 'module', 'D-002: plain ES modules, zero build step');
  assert.equal(pkg.private, true, 'publishing is KK-28');
  assert.equal(pkg.version, '0.0.0', 'version policy lands with KK-28');
  assert.ok(pkg.scripts?.test, 'missing test script');
  assert.ok(pkg.scripts?.lint, 'missing lint script');
  assert.equal(pkg.dependencies, undefined, 'scaffold ships zero runtime deps (D-002)');
});
