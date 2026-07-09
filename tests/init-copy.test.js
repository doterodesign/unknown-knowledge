// KK-17: payload manifest + copy engine (PRD §6/§9.1/§9.2, D-007/D-009).
// Exercised through the public seam — the cli/init-copy.js process — plus
// the library's validation guards directly where the seam can't reach
// (adversarial manifests, synthetic kit roots). Covers: the D-007
// constructional leakage guards, stack-conditional inclusion per selection
// combination (none/ts/swift/both), the version stamp, root-dir naming
// rules, existing/partial-seed refusal, and byte-for-byte determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  copyPayload, expandManifest, loadManifest, validateRootName,
  DEFAULT_ROOT, ROOT_FILE_ALLOWLIST, SeedRefusal,
} from '../cli/lib/copy-payload.js';

const kitRoot = fileURLToPath(new URL('..', import.meta.url));
const initCopyJs = join(kitRoot, 'cli', 'init-copy.js');

const scratch = mkdtempSync(join(tmpdir(), 'kk17-'));
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

/** Every file under dir, seeded-root-relative, sorted. */
function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, base));
    else out.push(relative(base, abs).split('\\').join('/'));
  }
  return out.sort();
}

// -------------------------------------------------- the public seam (CLI)

test('seeds the default root with the unconditional payload; second run REFUSES (exit 2) and changes nothing (§6)', () => {
  const target = freshDir();
  const first = runInitCopy('--target', target, '--json');
  assert.equal(first.status, 0, first.stderr);
  const out = JSON.parse(first.stdout);
  assert.equal(out.rootName, DEFAULT_ROOT);
  const seeded = walk(join(target, DEFAULT_ROOT));
  assert.deepEqual(seeded, out.files, 'reported file list must be exactly what landed on disk');
  // Store scaffolding, protocol, log-dir .gitkeeps, generated manifest — all present.
  for (const must of ['ontology/_catalog.yaml', 'ontology/_rules.yaml', 'knowledge/_catalog.yaml',
    'knowledge/_rules.yaml', 'decisions/_catalog.yaml', 'decisions/entries/.gitkeep',
    'protocol/AGENTS.md', 'logs/findings/.gitkeep', 'logs/misses/.gitkeep', 'logs/gaps/.gitkeep',
    'engine/validate.js', 'schemas/catalog.schema.json', 'templates/new-kind/README.md',
    'engine/tests/fixtures/README.md', 'kit.manifest.yaml']) {
    assert.ok(seeded.includes(must), `missing seeded file: ${must}`);
  }
  const second = runInitCopy('--target', target, '--json');
  assert.equal(second.status, 2);
  assert.match(second.stderr, /refused/);
  assert.match(second.stderr, /already exists/);
  assert.deepEqual(walk(join(target, DEFAULT_ROOT)), seeded, 'a refused run must not touch the seed');
});

test('stack-conditional inclusion per selection combination — none/ts/swift/both (D-009)', () => {
  const packDirs = (files) => new Set(files
    .filter((f) => f.startsWith('engine/tests/fixtures/') && f !== 'engine/tests/fixtures/README.md')
    .map((f) => f.split('/')[3]));
  const combos = [
    [[], []],
    [['ts'], ['ts']],
    [['swift'], ['swift']],
    [['ts', 'swift'], ['swift', 'ts']],
  ];
  for (const [sel, expected] of combos) {
    const target = freshDir();
    const args = ['--target', target, '--json'];
    if (sel.length) args.push('--stacks', sel.join(','));
    const r = runInitCopy(...args);
    assert.equal(r.status, 0, r.stderr);
    const files = walk(join(target, DEFAULT_ROOT));
    assert.deepEqual([...packDirs(files)].sort(), [...expected].sort(),
      `selection [${sel}] must seed exactly its packs`);
    // The selected packs' contents are the payload's, byte-for-byte.
    for (const stack of expected) {
      const src = walk(join(kitRoot, 'payload', 'extractor-fixtures', stack));
      for (const rel of src) {
        assert.deepEqual(
          readFileSync(join(target, DEFAULT_ROOT, 'engine/tests/fixtures', stack, rel)),
          readFileSync(join(kitRoot, 'payload', 'extractor-fixtures', stack, rel)),
          `byte drift in seeded ${stack}/${rel}`);
      }
    }
  }
});

test('unknown stack refuses with the available list (exit 2)', () => {
  const r = runInitCopy('--target', freshDir(), '--stacks', 'ts,kotlin');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown stack "kotlin"/);
  assert.match(r.stderr, /swift, ts/);
});

test('root-dir naming: caller-overridable; dotted and multi-segment names REFUSE (§6)', () => {
  const target = freshDir();
  const named = runInitCopy('--target', target, '--root', 'kb', '--json');
  assert.equal(named.status, 0, named.stderr);
  assert.equal(JSON.parse(named.stdout).rootName, 'kb');
  assert.ok(walk(join(target, 'kb')).includes('kit.manifest.yaml'));

  for (const bad of ['.unknown-knowledge', '.kb', 'a/b', '..']) {
    const r = runInitCopy('--target', freshDir(), '--root', bad);
    assert.equal(r.status, 2, `root ${bad} must refuse`);
    assert.match(r.stderr, /refused/);
  }
});

test('partial seed refuses too: any existing root dir — even one stray file, no manifest — is refused (§6)', () => {
  const target = freshDir();
  mkdirSync(join(target, DEFAULT_ROOT));
  writeFileSync(join(target, DEFAULT_ROOT, 'stray.txt'), 'partial');
  const r = runInitCopy('--target', target);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refused: .*already exists/);
  assert.deepEqual(walk(join(target, DEFAULT_ROOT)), ['stray.txt'], 'refusal must not add files');
});

test('usage errors exit 2: missing --target, unknown flag, flag without value', () => {
  for (const args of [[], ['--target'], ['--target', freshDir(), '--no-such-flag']]) {
    const r = runInitCopy(...args);
    assert.equal(r.status, 2, `args [${args}] must exit 2`);
    assert.match(r.stderr, /usage:/);
  }
});

test('deterministic by construction: two runs with identical inputs seed byte-identical trees (A1 substrate)', () => {
  const [a, b] = [freshDir(), freshDir()];
  for (const target of [a, b]) {
    assert.equal(runInitCopy('--target', target, '--stacks', 'swift,ts').status, 0);
  }
  const files = walk(join(a, DEFAULT_ROOT));
  assert.deepEqual(walk(join(b, DEFAULT_ROOT)), files);
  for (const rel of files) {
    assert.deepEqual(readFileSync(join(b, DEFAULT_ROOT, rel)), readFileSync(join(a, DEFAULT_ROOT, rel)),
      `nondeterministic seeded file: ${rel}`);
  }
});

// ------------------------------------------------ version stamp (§9.1)

test('seeded kit.manifest.yaml carries the version stamp, selected stacks, zone map, and the exact file echo', () => {
  const target = freshDir();
  const r = runInitCopy('--target', target, '--stacks', 'ts', '--json');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const pkgVersion = JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8')).version;
  assert.equal(out.version, pkgVersion, 'stamp must be the package version (semver semantics are KK-28)');

  const stamped = readFileSync(join(target, DEFAULT_ROOT, 'kit.manifest.yaml'), 'utf8');
  assert.match(stamped, new RegExp(`^kit-version: "${pkgVersion}"$`, 'm'));
  assert.match(stamped, /^stacks: \[ts\]$/m);
  assert.match(stamped, /^zones:$/m);
  const echoed = [...stamped.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(echoed, walk(join(target, DEFAULT_ROOT)), 'file echo must match the seeded tree exactly');
});

// -------------------------------- D-007: leakage impossible BY CONSTRUCTION

test('the shipped manifest expands to payload/ sources only — never fixtures/ or tests/ (D-007)', () => {
  const manifest = loadManifest(kitRoot);
  const plan = expandManifest(manifest, ['ts', 'swift']);
  const payloadRoot = join(kitRoot, 'payload');
  for (const { from } of plan) {
    const ok = from.startsWith(payloadRoot + '/')
      || ROOT_FILE_ALLOWLIST.includes(relative(kitRoot, from)); // LICENSE/NOTICE, required-at-publish (KK-28)
    assert.ok(ok, `plan reaches outside payload/: ${from}`);
    assert.ok(!from.startsWith(join(kitRoot, 'fixtures') + '/'), `acceptance fixture in plan: ${from}`);
    assert.ok(!from.startsWith(join(kitRoot, 'tests') + '/'), `kit test in plan: ${from}`);
  }
});

test('every payload/ file is covered by the manifest (union of stacks) — nothing rots unshipped, nothing ships by omission', () => {
  const manifest = loadManifest(kitRoot);
  const shipped = new Set(expandManifest(manifest, ['ts', 'swift'])
    .map(({ from }) => relative(join(kitRoot, 'payload'), from)));
  // Wrapper templates are GENERATED per platform at init (KK-18), not
  // copied — their manifest visibility is the `platforms:` registry, so a
  // payload/wrappers/ file counts as covered only when a registry entry
  // names it (D-007: nothing ships by omission, nothing rots unlisted).
  const wrapperTemplates = new Set(Object.values(manifest.platforms).map((p) => p.template));
  const exempt = (rel) => rel.endsWith('.gitkeep'); // kit-repo plumbing, never seeded as-is
  const missing = walk(join(kitRoot, 'payload'))
    .filter((rel) => !exempt(rel) && !shipped.has(rel) && !wrapperTemplates.has(rel));
  assert.deepEqual(missing, [], 'payload files absent from the manifest expansion');
});

test('engine REFUSES manifest entries that escape payload/ or name fixtures/tests — authors are not trusted (D-007)', () => {
  const attacks = [
    ['from: ../fixtures/ts-app', 'traversal into acceptance fixtures'],
    ['from: ../tests', 'traversal into kit tests'],
    ['from: ../PRD.html', 'traversal to the kit root'],
    [`from: ${JSON.stringify(join(kitRoot, 'fixtures/ts-app'))}`, 'absolute path'],
    ['from: engine/../../fixtures/ts-app', 'embedded ..'],
    ['from: ./engine', 'dot segment'],
  ];
  for (const [fromLine, why] of attacks) {
    const manifestPath = join(freshDir(), 'kit.manifest.yaml');
    writeFileSync(manifestPath, [
      'schema-version: 1',
      'unconditional:',
      '  evil:',
      `    - { ${fromLine}, to: engine/innocuous }`,
    ].join('\n'));
    assert.throws(() => loadManifest(kitRoot, manifestPath), /manifest entry/, `must refuse: ${why}`);
  }
});

test('engine refuses `to` traversal, duplicate targets, a kit.manifest.yaml target, and non-allowlisted root-files', () => {
  const write = (lines) => {
    const p = join(freshDir(), 'kit.manifest.yaml');
    writeFileSync(p, ['schema-version: 1', ...lines].join('\n'));
    return p;
  };
  assert.throws(() => loadManifest(kitRoot, write([
    'unconditional:', '  s:', '    - { from: engine/validate.js, to: ../escape.js }'])), /"\.\." segments/);
  assert.throws(() => expandManifest(loadManifest(kitRoot, write([
    'unconditional:', '  s:',
    '    - { from: engine/validate.js, to: engine/x.js }',
    '    - { from: engine/resolve.js, to: engine/x.js }'])), []), /duplicate target/);
  assert.throws(() => expandManifest(loadManifest(kitRoot, write([
    'unconditional:', '  s:', '    - { from: engine/validate.js, to: kit.manifest.yaml }'])), []),
  /generated by the engine/);
  assert.throws(() => loadManifest(kitRoot, write([
    'root-files:', '  - SECRETS.md'])), /allowlist/);
});

test('validateRootName: default is visible and sane; dotted roots are SeedRefusals', () => {
  assert.equal(validateRootName(DEFAULT_ROOT), DEFAULT_ROOT);
  assert.ok(!DEFAULT_ROOT.startsWith('.'));
  assert.throws(() => validateRootName('.hidden'), SeedRefusal);
  assert.throws(() => validateRootName(''), SeedRefusal);
});

// ------------------- root-files: required-at-publish, copied when present

test('root-files (LICENSE/NOTICE) are seeded when present at the kit root and skipped cleanly when absent (KK-28 seam)', () => {
  // Synthetic mini-kit so the test controls LICENSE presence without
  // touching the real repo (KK-28 adds the real files in a parallel PR).
  const miniKit = freshDir();
  mkdirSync(join(miniKit, 'payload/engine'), { recursive: true });
  mkdirSync(join(miniKit, 'cli'));
  writeFileSync(join(miniKit, 'package.json'), '{ "version": "9.9.9" }\n');
  writeFileSync(join(miniKit, 'payload/engine/a.js'), '// a\n');
  writeFileSync(join(miniKit, 'cli/kit.manifest.yaml'), [
    'schema-version: 1',
    'unconditional:',
    '  engine:',
    '    - { from: engine/a.js, to: engine/a.js }',
    'root-files:',
    '  - LICENSE',
    '  - NOTICE',
    'zones: { seeded: [engine], client: [] }',
  ].join('\n'));

  const absent = copyPayload({ kitRoot: miniKit, targetDir: freshDir() });
  assert.deepEqual(absent.files, ['engine/a.js', 'kit.manifest.yaml'],
    'absent root-files are skipped (required only at publish), not errors');
  assert.equal(absent.version, '9.9.9', 'stamp reads the kit package.json');

  writeFileSync(join(miniKit, 'LICENSE'), 'MIT-ish\n');
  const present = copyPayload({ kitRoot: miniKit, targetDir: freshDir() });
  assert.deepEqual(present.files, ['LICENSE', 'engine/a.js', 'kit.manifest.yaml'],
    'a present root-file MUST ship (required-at-publish, KK-28)');
  assert.equal(readFileSync(join(present.root, 'LICENSE'), 'utf8'), 'MIT-ish\n');
});
