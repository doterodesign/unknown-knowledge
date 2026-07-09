// KK-18: platform wrapper generation (PRD §6/§9.2). Exercised through the
// public seam — the cli/init-copy.js process with --platforms — plus the
// generate-wrappers library directly where the seam can't reach (re-runs
// against an already-seeded target, adversarial registries). Covers: the
// per-platform generation matrix against the shipped registry, wrapper
// well-formedness (thin pointer at the conventional path, .mdc frontmatter),
// the §6 collision matrix (fresh / existing shared file → sentinel-append /
// existing sentinel block → replace-within-sentinels / malformed sentinels
// and existing dedicated files → skip-and-report), idempotency, determinism,
// and the D-007 registry guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadManifest, DEFAULT_ROOT } from '../cli/lib/copy-payload.js';
import {
  assertKnownPlatforms, generateWrappers, SENTINEL_BEGIN, SENTINEL_END,
} from '../cli/lib/generate-wrappers.js';

const kitRoot = fileURLToPath(new URL('..', import.meta.url));
const initCopyJs = join(kitRoot, 'cli', 'init-copy.js');
const registry = loadManifest(kitRoot).platforms;
const ALL_PLATFORMS = Object.keys(registry).sort();

const scratch = mkdtempSync(join(tmpdir(), 'kk18-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const freshDir = () => {
  const dir = join(scratch, `t${n += 1}`);
  mkdirSync(dir);
  return dir;
};

function runInitCopy(...args) {
  const r = spawnSync(process.execPath, [initCopyJs, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ------------------------------------------------------ registry (the data)

test('the shipped registry covers the five §6 platforms at their conventional paths, with §6 modes', () => {
  assert.deepEqual(ALL_PLATFORMS, ['claude-code', 'codex', 'copilot', 'cursor', 'gemini']);
  const expect = {
    'claude-code': ['CLAUDE.md', 'dedicated'],
    codex: ['AGENTS.md', 'shared'],
    copilot: ['.github/copilot-instructions.md', 'shared'],
    cursor: ['.cursor/rules/unknown-knowledge.mdc', 'dedicated'],
    gemini: ['GEMINI.md', 'dedicated'],
  };
  for (const [id, [target, mode]] of Object.entries(expect)) {
    assert.equal(registry[id].target, target, `${id} conventional path`);
    assert.equal(registry[id].mode, mode, `${id} §6 collision mode`);
    assert.ok(registry[id].name.length > 0, `${id} display name`);
    assert.ok(existsSync(join(kitRoot, 'payload', registry[id].template)),
      `${id} template must exist in payload/: ${registry[id].template}`);
  }
});

// -------------------------------------- generation matrix (the public seam)

test('per-platform matrix: each platform alone generates exactly its wrapper — a thin pointer at the conventional path', () => {
  for (const id of ALL_PLATFORMS) {
    const target = freshDir();
    const r = runInitCopy('--target', target, '--platforms', id, '--json');
    assert.equal(r.status, 0, r.stderr);
    const { wrappers } = JSON.parse(r.stdout);
    assert.deepEqual(
      wrappers.map((w) => [w.platform, w.target, w.action]),
      [[id, registry[id].target, 'created']]);

    const text = readFileSync(join(target, registry[id].target), 'utf8');
    assert.ok(text.includes(`${DEFAULT_ROOT}/protocol/AGENTS.md`),
      `${id} wrapper must point at the protocol contract`);
    assert.ok(text.split('\n').length < 25, `${id} wrapper must stay a THIN pointer, got ${text.split('\n').length} lines`);
    assert.ok(!/\{\{/.test(text), `${id} wrapper has unresolved placeholders`);
    // Single source of truth: the wrapper names the contract, it never
    // carries the loop's own steps.
    assert.ok(!text.includes('RESOLVE'), `${id} wrapper must not inline AGENTS.md content`);

    // Only the selected platform's wrapper (and no other registry target) landed.
    for (const other of ALL_PLATFORMS.filter((p) => p !== id)) {
      assert.ok(!existsSync(join(target, registry[other].target)),
        `unselected ${other} wrapper must not land for selection [${id}]`);
    }
  }
});

test('all platforms at once: every wrapper lands; shared files carry sentinels, cursor .mdc carries rule frontmatter', () => {
  const target = freshDir();
  const r = runInitCopy('--target', target, '--platforms', ALL_PLATFORMS.join(','), '--json');
  assert.equal(r.status, 0, r.stderr);
  const { wrappers } = JSON.parse(r.stdout);
  assert.deepEqual(wrappers.map((w) => w.action), ALL_PLATFORMS.map(() => 'created'));

  for (const id of ALL_PLATFORMS) {
    const text = readFileSync(join(target, registry[id].target), 'utf8');
    if (registry[id].mode === 'shared') {
      assert.ok(text.startsWith(SENTINEL_BEGIN), `${id}: fresh shared file is exactly the sentinel block`);
      assert.ok(text.endsWith(`${SENTINEL_END}\n`), `${id}: sentinel block closed`);
    } else {
      assert.ok(!text.includes(SENTINEL_BEGIN), `${id}: dedicated wrappers carry no sentinels`);
    }
  }
  const mdc = readFileSync(join(target, '.cursor/rules/unknown-knowledge.mdc'), 'utf8');
  assert.match(mdc, /^---\n[\s\S]*alwaysApply: true[\s\S]*\n---\n/, 'cursor rule needs .mdc frontmatter');
});

test('no --platforms selection generates nothing outside the seeded root', () => {
  const target = freshDir();
  const r = runInitCopy('--target', target, '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).wrappers, []);
  for (const id of ALL_PLATFORMS) {
    assert.ok(!existsSync(join(target, registry[id].target)), `${id} wrapper shipped by omission`);
  }
});

test('--root name flows into every wrapper pointer', () => {
  const target = freshDir();
  const r = runInitCopy('--target', target, '--root', 'kb', '--platforms', ALL_PLATFORMS.join(','), '--json');
  assert.equal(r.status, 0, r.stderr);
  for (const id of ALL_PLATFORMS) {
    const text = readFileSync(join(target, registry[id].target), 'utf8');
    assert.ok(text.includes('kb/protocol/AGENTS.md'), `${id} wrapper must cite the chosen root`);
    assert.ok(!text.includes(`${DEFAULT_ROOT}/protocol`), `${id} wrapper still cites the default root`);
  }
});

test('unknown platform refuses with the available list (exit 2) BEFORE seeding anything', () => {
  const target = freshDir();
  const r = runInitCopy('--target', target, '--platforms', 'claude-code,emacs');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown platform "emacs"/);
  assert.match(r.stderr, /claude-code, codex, copilot, cursor, gemini/);
  assert.ok(!existsSync(join(target, DEFAULT_ROOT)), 'a refused selection must not leave a seed behind');
  assert.ok(!existsSync(join(target, 'CLAUDE.md')), 'a refused selection must not leave wrappers behind');
});

// --------------------------------------------- §6 collision matrix (shared)

test('PRE-EXISTING root AGENTS.md is sentinel-APPENDED, never clobbered; existing bytes survive verbatim (§6 AC)', () => {
  const target = freshDir();
  const existing = '# Project contract\n\nHouse rules live here. Keep me intact.\n';
  writeFileSync(join(target, 'AGENTS.md'), existing);
  const r = runInitCopy('--target', target, '--platforms', 'codex', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).wrappers.map((w) => [w.platform, w.action]), [['codex', 'appended']]);

  const text = readFileSync(join(target, 'AGENTS.md'), 'utf8');
  assert.ok(text.startsWith(existing), 'existing content must survive byte-for-byte, at the top');
  assert.equal(text.split(SENTINEL_BEGIN).length - 1, 1, 'exactly one sentinel block');
  const block = text.slice(text.indexOf(SENTINEL_BEGIN), text.indexOf(SENTINEL_END));
  assert.ok(block.includes(`${DEFAULT_ROOT}/protocol/AGENTS.md`), 'the appended block is the pointer');
});

test('pre-existing .github/copilot-instructions.md gets the same sentinel-append treatment', () => {
  const target = freshDir();
  mkdirSync(join(target, '.github'), { recursive: true });
  writeFileSync(join(target, '.github/copilot-instructions.md'), 'Use tabs.\n');
  const r = runInitCopy('--target', target, '--platforms', 'copilot', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).wrappers[0].action, 'appended');
  const text = readFileSync(join(target, '.github/copilot-instructions.md'), 'utf8');
  assert.ok(text.startsWith('Use tabs.\n'));
  assert.ok(text.includes(SENTINEL_BEGIN) && text.includes(SENTINEL_END));
});

test('an existing well-formed sentinel block is REPLACED WITHIN the sentinels — idempotent, and a root rename converges (library seam)', () => {
  const target = freshDir();
  const head = '# Mine\n\n';
  const tail = '\n## After the block\n\ntrailing prose survives\n';
  writeFileSync(join(target, 'AGENTS.md'),
    `${head}${SENTINEL_BEGIN}\nstale pointer to old-root/protocol/AGENTS.md\n${SENTINEL_END}\n${tail}`);

  const first = generateWrappers({ kitRoot, targetDir: target, platforms: ['codex'] });
  assert.equal(first[0].action, 'replaced');
  const afterFirst = readFileSync(join(target, 'AGENTS.md'), 'utf8');
  assert.ok(afterFirst.startsWith(head) && afterFirst.endsWith(tail), 'content outside the sentinels is untouched');
  assert.ok(!afterFirst.includes('old-root'), 'stale block content replaced');
  assert.ok(afterFirst.includes(`${DEFAULT_ROOT}/protocol/AGENTS.md`));
  assert.equal(afterFirst.split(SENTINEL_BEGIN).length - 1, 1, 'still exactly one block');

  // Idempotent: a second identical run is byte-stable.
  generateWrappers({ kitRoot, targetDir: target, platforms: ['codex'] });
  assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), afterFirst, 'replace-within-sentinels must be idempotent');

  // A different root name updates the pointer in place — no second block.
  generateWrappers({ kitRoot, targetDir: target, rootName: 'kb', platforms: ['codex'] });
  const renamed = readFileSync(join(target, 'AGENTS.md'), 'utf8');
  assert.ok(renamed.includes('kb/protocol/AGENTS.md'));
  assert.equal(renamed.split(SENTINEL_BEGIN).length - 1, 1);
});

test('append then re-generate converges too: the appended block is replaced, not doubled', () => {
  const target = freshDir();
  writeFileSync(join(target, 'AGENTS.md'), 'existing\n');
  assert.equal(generateWrappers({ kitRoot, targetDir: target, platforms: ['codex'] })[0].action, 'appended');
  const once = readFileSync(join(target, 'AGENTS.md'), 'utf8');
  assert.equal(generateWrappers({ kitRoot, targetDir: target, platforms: ['codex'] })[0].action, 'replaced');
  assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), once);
});

test('MALFORMED sentinels skip-and-report — never guess, never clobber', () => {
  const cases = [
    ['begin without end', `${SENTINEL_BEGIN}\nunclosed\n`],
    ['end before begin', `${SENTINEL_END}\nreversed\n${SENTINEL_BEGIN}\n`],
    ['doubled blocks', `${SENTINEL_BEGIN}\na\n${SENTINEL_END}\n${SENTINEL_BEGIN}\nb\n${SENTINEL_END}\n`],
  ];
  for (const [why, content] of cases) {
    const target = freshDir();
    writeFileSync(join(target, 'AGENTS.md'), content);
    const [w] = generateWrappers({ kitRoot, targetDir: target, platforms: ['codex'] });
    assert.equal(w.action, 'skipped', `must skip: ${why}`);
    assert.match(w.reason, /malformed/);
    assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), content, `skipped file must be byte-untouched: ${why}`);
  }
});

// ------------------------------------------ §6 collision matrix (dedicated)

test('existing DEDICATED files (CLAUDE.md, cursor rule, GEMINI.md) skip-and-report, byte-untouched — while the rest still generate', () => {
  const target = freshDir();
  writeFileSync(join(target, 'CLAUDE.md'), 'my own claude notes\n');
  mkdirSync(join(target, '.cursor/rules'), { recursive: true });
  writeFileSync(join(target, '.cursor/rules/unknown-knowledge.mdc'), 'my own rule\n');
  const r = runInitCopy('--target', target, '--platforms', ALL_PLATFORMS.join(','), '--json');
  assert.equal(r.status, 0, r.stderr);
  const byId = Object.fromEntries(JSON.parse(r.stdout).wrappers.map((w) => [w.platform, w]));

  for (const id of ['claude-code', 'cursor']) {
    assert.equal(byId[id].action, 'skipped', `${id} must skip`);
    assert.match(byId[id].reason, /never overwritten/);
  }
  assert.equal(readFileSync(join(target, 'CLAUDE.md'), 'utf8'), 'my own claude notes\n');
  assert.equal(readFileSync(join(target, '.cursor/rules/unknown-knowledge.mdc'), 'utf8'), 'my own rule\n');
  // Skips are per-platform: the others still landed.
  for (const id of ['codex', 'copilot', 'gemini']) {
    assert.equal(byId[id].action, 'created', `${id} must still generate`);
  }
  // Skip-and-report reaches the human-readable seam too — on a REAL
  // collision, asserting the plain-text skip line, not just exit 0.
  const plainTarget = freshDir();
  writeFileSync(join(plainTarget, 'CLAUDE.md'), 'my own claude notes\n');
  const plain = runInitCopy('--target', plainTarget, '--platforms', 'claude-code');
  assert.equal(plain.status, 0);
  assert.match(plain.stdout, /wrapper claude-code: skipped CLAUDE\.md — .*never overwritten/);
});

test('symlinked targets are skipped, never written through', () => {
  const target = freshDir();
  writeFileSync(join(target, 'elsewhere.md'), 'linked\n');
  symlinkSync(join(target, 'elsewhere.md'), join(target, 'AGENTS.md'));
  const [w] = generateWrappers({ kitRoot, targetDir: target, platforms: ['codex'] });
  assert.equal(w.action, 'skipped');
  assert.match(w.reason, /symlink/);
  assert.equal(readFileSync(join(target, 'elsewhere.md'), 'utf8'), 'linked\n');
});

// ------------------------------------------- determinism + registry guards

test('deterministic: two runs with identical inputs generate byte-identical wrappers (A1 substrate)', () => {
  const [a, b] = [freshDir(), freshDir()];
  for (const target of [a, b]) {
    assert.equal(runInitCopy('--target', target, '--platforms', ALL_PLATFORMS.join(',')).status, 0);
  }
  for (const id of ALL_PLATFORMS) {
    assert.deepEqual(
      readFileSync(join(b, registry[id].target)), readFileSync(join(a, registry[id].target)),
      `nondeterministic wrapper: ${id}`);
  }
});

test('registry guards refuse: templates escaping payload/, bad modes, duplicate targets, target traversal (D-007)', () => {
  const write = (lines) => {
    const p = join(freshDir(), 'kit.manifest.yaml');
    writeFileSync(p, ['schema-version: 1', 'platforms:', ...lines].join('\n'));
    return p;
  };
  const spec = (over) => [
    '  evil:',
    '    name: Evil',
    `    template: ${over.template ?? 'wrappers/pointer.md'}`,
    `    target: ${over.target ?? 'EVIL.md'}`,
    `    mode: ${over.mode ?? 'dedicated'}`,
  ];
  assert.throws(() => loadManifest(kitRoot, write(spec({ template: '../tests/init-copy.test.js' }))),
    /"\.\." segments/, 'template traversal must refuse');
  assert.throws(() => loadManifest(kitRoot, write(spec({ mode: 'overwrite' }))),
    /mode must be "shared" or "dedicated"/);
  assert.throws(() => loadManifest(kitRoot, write(spec({ target: '../outside.md' }))),
    /"\.\." segments/, 'target traversal must refuse');
  assert.throws(() => loadManifest(kitRoot, write([
    ...spec({}),
    '  evil2:',
    '    name: Evil2',
    '    template: wrappers/pointer.md',
    '    target: EVIL.md',
    '    mode: shared',
  ])), /duplicate wrapper target/);
});

test('assertKnownPlatforms: the CLI pre-seed guard names the registry', () => {
  const manifest = loadManifest(kitRoot);
  assert.doesNotThrow(() => assertKnownPlatforms(manifest, ALL_PLATFORMS));
  assert.throws(() => assertKnownPlatforms(manifest, ['vim']), /unknown platform "vim"/);
});
