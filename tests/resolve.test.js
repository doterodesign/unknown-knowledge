// KK-06: resolver CLI (PRD §4, §7; acceptance A4). Scored term matching over
// terms/aliases/summaries with confusable-with surfaced, SSOT pointers and
// knowledge entry points attached, plus --paths reverse lookup over the
// loader's pointer index (the ACT-step pre-commit check). Tested only through
// its public seam: the CLI process — exit codes and output ARE the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../payload/engine/resolve.js', import.meta.url));
const store = fileURLToPath(new URL('fixtures/resolver/store', import.meta.url));
const brokenStore = fileURLToPath(new URL('fixtures/loader/duplicate-id', import.meta.url));
// A store whose source-of-truth pointers EXIST ON DISK, so the folder-pointer
// test can consult the filesystem instead of guessing from the name (UCS-933).
const onDiskStore = fileURLToPath(new URL('fixtures/resolver/on-disk', import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function runJson(...args) {
  const r = run(...args, '--root', store, '--json');
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ------------------------------------------------- scoring ladder (A4)

test('exact term match scores 100 and ranks first', () => {
  const out = runJson('export');
  assert.equal(out.mode, 'query');
  assert.equal(out.query, 'export');
  const first = out.results[0];
  assert.equal(first.id, 'K-120');
  assert.equal(first.term, 'Export');
  assert.equal(first.score, 100);
  assert.equal(first.match, 'exact-term');
});

test('exact alias match scores 80', () => {
  const out = runJson('swatch');
  assert.deepEqual(
    out.results.map((r) => [r.id, r.score, r.match]),
    [['K-100', 80, 'exact-alias']],
  );
});

test('prefix/word match in term scores 60; score ties break by id asc', () => {
  const out = runJson('asset');
  assert.deepEqual(
    out.results.map((r) => [r.id, r.score, r.match]),
    [['K-100', 60, 'term-match'], ['K-110', 60, 'term-match']],
  );
});

test('alias prefix/word match scores 50 — aliases get the same rung treatment as terms', () => {
  // K-100 has alias "asset variant"; a partial alias query must resolve
  // (aliases are the synonyms recorded to cure retrieval-struggle findings).
  const out = runJson('variant');
  assert.deepEqual(
    out.results.map((r) => [r.id, r.score, r.match]),
    [['K-100', 50, 'alias-match']],
  );
});

test('summary word match scores 40', () => {
  const out = runJson('artboards');
  assert.deepEqual(
    out.results.map((r) => [r.id, r.score, r.match]),
    [['K-120', 40, 'summary-match']],
  );
});

test('matching is case-insensitive; multi-word query terms join into one query', () => {
  const out = runJson('ASSET', 'Variant');
  assert.equal(out.query, 'asset variant');
  assert.equal(out.results[0].id, 'K-100');
  assert.equal(out.results[0].match, 'exact-alias');
});

test('one ranked list: exact > summary > downranked prefix (§3.5)', () => {
  const out = runJson('export');
  assert.deepEqual(
    out.results.map((r) => [r.id, r.score, r.match, r.status]),
    [
      ['K-120', 100, 'exact-term', 'active'],
      ['K-140', 40, 'summary-match', 'deprecated'],
      ['K-130', 30, 'term-match', 'draft'],
    ],
  );
});

test('draft/proposed concepts are downranked by 30, floored at 1 (§3.5)', () => {
  const windows = runJson('export', 'preset');
  const draft = windows.results.find((r) => r.id === 'K-130');
  assert.equal(draft.match, 'exact-term');
  assert.equal(draft.score, 70, 'exact-term 100 - 30 draft downrank');
});

// --------------------------------- what results carry (PRD §4 resolver row)

test('results carry SSOT pointers, confusable-with, and knowledge entry points', () => {
  const out = runJson('asset', 'source');
  const method = out.results[0];
  assert.equal(method.id, 'K-100');
  assert.equal(method.summary, 'A place raw graphics are imported from.');
  assert.deepEqual(method['source-of-truth'], ['src/design/assets/registry.ts']);
  assert.deepEqual(method['confusable-with'], [{ id: 'K-110', term: 'Asset target' }]);
  // The golden for one published knowledge entry point, extended over several
  // tickets. `id` is the leaf's ACCESSION: this fixture's leaves were unminted
  // and published `id: null` under UCS-1144's expand phase, and UCS-1147 made
  // the accession required, so a null here would now mean a defective store
  // rather than an unmigrated one. Every other added key stays present-and-
  // possibly-null so a consumer reads ONE result shape regardless of what the
  // store declares. `excerpt` is derived from the body's topic sentence — the
  // retired `description` field is not read, because it no longer exists.
  // Extended again by typed edges (UCS-1151): `via` names which join reached
  // the leaf, and `relates` carries its one-hop neighborhood with every declared
  // kind present as a stable key — empty here, because this fixture leaf
  // declares no relates edges.
  assert.deepEqual(method.knowledge, [
    {
      via: 'terms',
      id: 'L-000411',
      notation: '410.2',
      heading: 'Supported asset kinds',
      stage: 'draft',
      excerpt: 'Which kinds an editor accepts for import is decided per surface.',
      provenance: null,
      downranked: true,
      // Extended again by the Time facet (UCS-1150). `demotions` names every
      // demotion that fired with its reason — the stage one here, since this
      // leaf is draft and declares no volatility. A bare `downranked: true`
      // would say a leaf was demoted without saying why, and a demotion a
      // reader cannot explain is one they cannot act on.
      demotions: [
        {
          reason: 'stage',
          detail: 'stage "draft" is pre-promotion — no moderator has certified this leaf\'s citations (UCS-1149)',
        },
      ],
      time: {
        volatility: null, verified: null, age: null, limit: null, stale: false,
        verdict: 'exempt',
        reason: 'no volatility declared — this leaf is not under time governance, so no freshness verdict applies (UCS-1150)',
      },
      file: 'knowledge/design-system/410.2-supported-asset-kinds.md',
      relates: {
        'depends-on': [], 'see-also': [], contradicts: [], supersedes: [],
      },
      'superseded-by': [],
    },
  ]);
});

test('v2: a draft-stage leaf is downranked, and provenance round-trips untouched (golden)', () => {
  // The resolver half of the draft-stage contract (UCS-1149). 410.1 is
  // verified and carries provenance; 410.2 is draft and carries none. Each is
  // pinned through the concept whose terms reach it.
  const exported = runJson('export').results.find((r) => r.id === 'K-120');
  assert.deepEqual(exported.knowledge, [
    {
      via: 'terms',
      id: 'L-000410',
      notation: '410.1',
      heading: 'Export format windows',
      stage: 'verified',
      excerpt: 'Renderers flush exported artboards in fixed windows.',
      // Carried verbatim: no registry governs provenance, so the resolver has
      // no judgement to apply and passing it through unchanged is the contract.
      provenance: { author: 'dimitri', 'skill-version': 'kb-build@2.0.0' },
      downranked: false,
      // No demotion fired, so the list is empty — a stable key, not an absent
      // one (UCS-1150).
      demotions: [],
      // This leaf declares no volatility, so the Time facet does not govern it:
      // `exempt`, which is deliberately NOT `trusted`. A leaf nothing governs
      // has not passed a check.
      time: {
        volatility: null, verified: null, age: null, limit: null, stale: false,
        verdict: 'exempt',
        reason: 'no volatility declared — this leaf is not under time governance, so no freshness verdict applies (UCS-1150)',
      },
      file: 'knowledge/design-system/410.1-export-format-windows.md',
      relates: {
        'depends-on': [], 'see-also': [], contradicts: [], supersedes: [],
      },
      'superseded-by': [],
    },
  ]);

  // The draft leaf still SURFACES — a demotion, never a filter: a draft leaf is
  // the best answer when it is the only answer, and hiding it would send the
  // reader off to invent one.
  const instruments = runJson('asset', 'variant').results.find((r) => r.id === 'K-100');
  assert.equal(instruments.knowledge[0].downranked, true);
  assert.equal(instruments.knowledge[0].stage, 'draft');

  // The human surface says WHY the leaf sits where it does, and shows the
  // derived excerpt where display prose used to come from `description`.
  const human = run('export', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /Renderers flush exported artboards in fixed windows\./);
  const drafty = run('asset', 'variant', '--root', store);
  assert.match(drafty.stdout, /\[draft — downranked\]/);
});

test('knowledge entry points come from leaf terms naming the concept term or alias', () => {
  const out = runJson('export');
  const exported = out.results.find((r) => r.id === 'K-120');
  assert.deepEqual(exported.knowledge.map((k) => k.notation), ['410.1']);
  const palette = out.results.find((r) => r.id === 'K-140');
  assert.deepEqual(palette.knowledge, []);
});

test('deprecated concepts are surfaced flagged, in JSON and human output (§3.5)', () => {
  const json = runJson('palette');
  assert.equal(json.results[0].status, 'deprecated');
  const human = run('palette', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /K-140/);
  assert.match(human.stdout, /\[deprecated\]/);
});

test('confusable-with warning is prominent in human output', () => {
  const human = run('asset', 'source', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /confusable-with: K-110 "Asset target"/);
});

test('human output is readable: id, term, score, pointers, entry points', () => {
  const human = run('export', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /resolve "export" -> 3 concepts/);
  assert.match(human.stdout, /K-120 {2}Export {2}\[active\] {2}score 100 \(exact-term\)/);
  assert.match(human.stdout, /source-of-truth:\n {4}src\/design\/export\.ts/);
  assert.match(human.stdout, /410\.1 {2}Export format windows/);
});

// --------------------------------------------- zero resolution (PRD §7)

test('zero-hit query is a normal outcome: exit 0, explicit empty result', () => {
  const json = runJson('quantum', 'entanglement');
  assert.deepEqual(json.results, []);
  const human = run('quantum', 'entanglement', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /0 concepts/);
  assert.match(human.stdout, /survey-scope\.yaml/);
  assert.match(human.stdout, /retrieval-miss/);
});

test('zero-hit CLI guidance routes through health and catalog recovery before scoped search', () => {
  const human = run('quantum', 'entanglement', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /preflight[^\n]*catalog[^\n]*survey-scope\.yaml/i);
  assert.match(human.stdout, /retrieval-struggle/);
  assert.match(human.stdout, /retrieval-miss/);
  assert.match(human.stdout, /protocol\/AGENTS\.md/);
});

// ------------------------------------- --paths reverse lookup (ACT step)

test('--path: repeated complete names preserve commas and edge whitespace', () => {
  const out = runJson(
    '--path', 'src/design/targets/first,second.ts',
    '--path=src/design/targets/ spaced.ts ',
  );
  assert.deepEqual(out.paths, [
    {
      path: 'src/design/targets/ spaced.ts ',
      concepts: [{ id: 'K-110', term: 'Asset target', status: 'active', pointer: 'src/design/targets' }],
      knowledge: [],
    },
    {
      path: 'src/design/targets/first,second.ts',
      concepts: [{ id: 'K-110', term: 'Asset target', status: 'active', pointer: 'src/design/targets' }],
      knowledge: [],
    },
  ]);
});

test('--path: mixing complete paths with legacy comma lists is a usage failure', () => {
  for (const args of [
    ['--path', 'a,b.ts', '--paths', 'c.ts,d.ts'],
    ['--paths=c.ts,d.ts', '--path=a,b.ts'],
  ]) {
    const r = run(...args, '--root', store, '--json');
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /cannot combine --path and --paths/);
    assert.match(r.stderr, /usage:/);
  }
});

test('--path: argv transports unusual filenames to their exact pointers without executing shell syntax', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resolver-path-'));
  const names = [
    ' leading.ts', 'trailing.ts \t\n', 'comma,name.ts', '"quoted".ts', "quote'name.ts",
    'tab\tline\nend.ts', '-leading.ts', '--json', '雪.ts', 'back\\slash.ts',
    ',', ' ', '\t', '\n', '$(touch UCS1229-shell-marker)', '`touch UCS1229-shell-marker`',
  ];
  try {
    cpSync(store, dir, { recursive: true });
    writeFileSync(join(dir, 'ontology/classes/100-design.yaml'), JSON.stringify({
      'schema-version': 1,
      entries: [{
        id: 'K-120', term: 'Export', class: '100-design', status: 'active',
        'source-of-truth': names,
      }],
    }));
    for (const name of names) writeFileSync(join(dir, name), 'fixture\n');
    // An argv array, never a shell command. Equals form also escapes --json
    // as a filename rather than treating it as a resolver option.
    const r = spawnSync(process.execPath, [
      cli, ...names.map((name) => `--path=${name}`), '--root', dir, '--json',
    ], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.paths.length, names.length);
    for (const name of names) {
      assert.deepEqual(out.paths.find((row) => row.path === name), {
        path: name,
        concepts: [{ id: 'K-120', term: 'Export', status: 'active', pointer: name }],
        knowledge: [],
      }, JSON.stringify(name));
    }
    assert.equal(existsSync(join(dir, 'UCS1229-shell-marker')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--path: ordinary path sets have byte-identical legacy attribution, ordering and deduplication', () => {
  const args = ['--root', store, '--json'];
  const repeated = run(
    '--path', 'src/unmapped/thing.ts', '--path', 'src/design/export.ts',
    '--path=./src/design/export.ts', '--path=src/design/export.ts', ...args,
  );
  const legacy = run('--paths=src/unmapped/thing.ts,./src/design/export.ts,src/design/export.ts', ...args);
  const reordered = run('--path=src/design/export.ts', '--path=src/unmapped/thing.ts', ...args);
  for (const r of [repeated, legacy, reordered]) assert.equal(r.status, 0, r.stderr);
  assert.equal(repeated.stdout, legacy.stdout);
  assert.equal(repeated.stdout, reordered.stdout);
  assert.deepEqual(JSON.parse(repeated.stdout).paths, [
    {
      path: 'src/design/export.ts',
      concepts: [{ id: 'K-120', term: 'Export', status: 'active', pointer: 'src/design/export.ts' }],
      knowledge: [],
    },
    { path: 'src/unmapped/thing.ts', concepts: [], knowledge: [] },
  ]);
});

test('--path: duplicate complete comma paths collapse without splitting', () => {
  const out = runJson('--path=src/unmapped/a,b.ts', '--path', 'src/unmapped/a,b.ts');
  assert.deepEqual(out.paths, [{ path: 'src/unmapped/a,b.ts', concepts: [], knowledge: [] }]);
});

test('--path: empty or missing values fail even after a valid path', () => {
  for (const invalid of [['--path'], ['--path', ''], ['--path='], ['--path', '--json']]) {
    const r = run('--root', store, '--path=src/design/export.ts', ...invalid);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /--path requires a value/);
    assert.match(r.stderr, /usage:/);
  }
});

test('--path: query and document input cannot be combined with reverse lookup', () => {
  for (const args of [['export'], ['--doc=README.md']]) {
    const r = run('--path=src/design/export.ts', '--root', store, ...args);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /give exactly one input shape/);
  }
});

test('--paths: exact file pointer maps back to its concept', () => {
  const out = runJson('--paths', 'src/design/export.ts');
  assert.equal(out.mode, 'paths');
  // `knowledge` joins the result shape in UCS-1151 — the leaves governing this
  // path. Empty here: this fixture's leaves declare neither `paths` nor
  // `concepts`, so the reverse lookup is unchanged for a pre-1151 store, which
  // is the compatibility claim worth pinning alongside the new field.
  assert.deepEqual(out.paths, [
    {
      path: 'src/design/export.ts',
      concepts: [
        { id: 'K-120', term: 'Export', status: 'active', pointer: 'src/design/export.ts' },
      ],
      knowledge: [],
    },
  ]);
});

test('--paths: a file under a folder pointer matches that concept', () => {
  const out = runJson('--paths', 'src/design/targets/stripe.ts');
  assert.deepEqual(out.paths[0].concepts, [
    { id: 'K-110', term: 'Asset target', status: 'active', pointer: 'src/design/targets' },
  ]);
});

test('--paths: concepts carry status — a deprecated concept surfaces flagged', () => {
  const out = runJson('--paths', 'src/palette/entries.ts');
  assert.deepEqual(out.paths[0].concepts, [
    { id: 'K-140', term: 'Palette', status: 'deprecated', pointer: 'src/palette' },
  ]);
  const human = run('--paths', 'src/palette/entries.ts', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /K-140.*\[deprecated\]/);
});

test('--paths: nesting applies only to folder pointers, never file pointers', () => {
  // src/design/export.ts is a FILE pointer; a path "under" it cannot exist.
  const out = runJson('--paths', 'src/design/export.ts/anything.ts');
  assert.deepEqual(out.paths, [
    { path: 'src/design/export.ts/anything.ts', concepts: [], knowledge: [] },
  ]);
});

test('--paths: paths are normalized — .., //, internal ./, backslashes, absolute', () => {
  // `..` must attribute to the file pointer (K-120), not the folder it detoured through.
  const dotdot = runJson('--paths', 'src/design/targets/../export.ts');
  assert.equal(dotdot.paths[0].path, 'src/design/export.ts');
  assert.deepEqual(dotdot.paths[0].concepts.map((c) => c.id), ['K-120']);

  const doubled = runJson('--paths', 'src//design/./export.ts');
  assert.equal(doubled.paths[0].path, 'src/design/export.ts');
  assert.deepEqual(doubled.paths[0].concepts.map((c) => c.id), ['K-120']);

  const backslashed = runJson('--paths', 'src\\design\\export.ts');
  assert.equal(backslashed.paths[0].path, 'src/design/export.ts');
  assert.deepEqual(backslashed.paths[0].concepts.map((c) => c.id), ['K-120']);

  const absolute = runJson('--paths', `${store}/src/design/export.ts`);
  assert.equal(absolute.paths[0].path, 'src/design/export.ts');
  assert.deepEqual(absolute.paths[0].concepts.map((c) => c.id), ['K-120']);
});

test('--paths: unmatched path is a normal outcome — empty concepts, exit 0', () => {
  const out = runJson('--paths', 'src/unmapped/thing.ts');
  assert.deepEqual(out.paths, [{ path: 'src/unmapped/thing.ts', concepts: [], knowledge: [] }]);
  const human = run('--paths', 'src/unmapped/thing.ts', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /no concepts point at this path/);
});

test('--paths: comma-separated list; output deduped and sorted by path asc', () => {
  const out = runJson(
    '--paths',
    'src/unmapped/thing.ts,./src/design/export.ts,src/design/export.ts',
  );
  assert.deepEqual(out.paths.map((p) => p.path), [
    'src/design/export.ts',
    'src/unmapped/thing.ts',
  ]);
  assert.equal(out.paths[0].concepts[0].id, 'K-120');
});

// ------------------------------------------- determinism & store health

test('JSON output is deterministic: two runs are byte-identical, no timestamps', () => {
  const a = run('export', '--root', store, '--json');
  const b = run('export', '--root', store, '--json');
  assert.equal(a.stdout, b.stdout);
  assert.doesNotMatch(a.stdout, /\d{4}-\d{2}-\d{2}T/);
});

test('warning-only health is surfaced in human mode too', () => {
  // The partial fixture loads ok (no errors) but with missing-store warnings;
  // zero resolution over a half-present store must not read as a clean miss.
  const partialStore = fileURLToPath(new URL('fixtures/loader/partial', import.meta.url));
  const human = run('anything', '--root', partialStore);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /store health: 0 error\(s\), 2 warning\(s\)/);
});

test('unhealthy store still resolves; health surfaced, not fatal (one health model)', () => {
  const r = run('design token', '--root', brokenStore, '--json');
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out['store-health'].ok, false);
  assert.ok(out['store-health'].errors > 0);
  assert.equal(out.results[0].id, 'K-210');
  const human = run('design token', '--root', brokenStore);
  assert.match(human.stdout, /store health: /);
});

// --------------------------------------------- exit-code contract (PRD §5)

test('usage errors exit 2: no query, unknown flag, missing value, mixed modes', () => {
  for (const args of [
    [],
    ['--root', store],
    ['--nope', 'query', '--root', store],
    ['query', '--paths'],
    ['query', '--paths', 'a.ts', '--root', store],
    ['--root'],
  ]) {
    const r = run(...args);
    assert.equal(r.status, 2, `expected exit 2 for: ${args.join(' ') || '(no args)'}`);
    assert.match(r.stderr, /usage:/i);
  }
});

test('empty/comma-only --paths exits 2 — a lookup that never ran is a failure', () => {
  for (const args of [
    ['--paths', '', '--root', store],
    ['--paths', ',', '--root', store],
    ['--paths', ' , ', '--root', store],
  ]) {
    const r = run(...args);
    assert.equal(r.status, 2, `expected exit 2 for --paths ${JSON.stringify(args[1])}`);
    assert.match(r.stderr, /usage:/i);
  }
});

test('--flag=value equals-forms are accepted for --root and --paths', () => {
  const query = run('export', `--root=${store}`, '--json');
  assert.equal(query.status, 0, query.stderr);
  assert.equal(JSON.parse(query.stdout).results[0].id, 'K-120');
  const paths = run('--paths=src/design/export.ts,src/unmapped/x.ts', `--root=${store}`, '--json');
  assert.equal(paths.status, 0, paths.stderr);
  assert.deepEqual(JSON.parse(paths.stdout).paths.map((p) => p.path), [
    'src/design/export.ts',
    'src/unmapped/x.ts',
  ]);
});

test('unreadable root exits 2 — a lookup that never ran is a failure, not a miss', () => {
  const r = run('export', '--root', `${store}/does-not-exist`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /resolve: /);
});

// ------------------------------------- folder pointers follow the filesystem
// (UCS-933) The map is never the fact: `src/api.v2` is a directory whose
// extname is ".v2". A name-based guess silently drops every path beneath it —
// a missed attribution in the ACT pre-commit check a developer trusts.

function runJsonAt(root, ...args) {
  const r = run(...args, '--root', root, '--json');
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

test('--paths: a DOTTED directory pointer nests — the filesystem decides, not the extension', () => {
  const out = runJsonAt(onDiskStore, '--paths', 'src/api.v2/handler.ts');
  assert.deepEqual(out.paths[0].concepts.map((c) => c.id), ['K-100']);
  assert.equal(out.paths[0].concepts[0].pointer, 'src/api.v2');
});

test('--paths: a real FILE pointer still never nests — no false attribution', () => {
  const out = runJsonAt(onDiskStore, '--paths', 'src/types/model.ts/nope.ts');
  assert.deepEqual(out.paths[0].concepts, []);
  // ...while the exact path still attributes.
  const exact = runJsonAt(onDiskStore, '--paths', 'src/types/model.ts');
  assert.deepEqual(exact.paths[0].concepts.map((c) => c.id), ['K-110']);
});

test('--paths: a pointer absent from disk falls back to the name — a deleted directory still attributes', () => {
  // The `store` fixture's pointers are notional (nothing on disk), which is
  // exactly the diff-names-deleted-paths case: `src/design/targets` has no
  // extension, so it still nests, and the deletion reaches its concept.
  const out = runJson('--paths', 'src/design/targets/stripe.ts');
  assert.deepEqual(out.paths[0].concepts.map((c) => c.id), ['K-110']);
});

// ------------------------------------------- empty-value flags (UCS-933)

test('--root= and --paths= are as valueless as their space forms — never a silent cwd', () => {
  // `--root=` used to resolve to cwd: an answer about a repo nobody named.
  const emptyRoot = run('--paths', 'src/x.ts', '--root=');
  assert.equal(emptyRoot.status, 2);
  assert.match(emptyRoot.stderr, /--root requires a value/);
  const emptyPaths = run('--paths=', '--root', store);
  assert.equal(emptyPaths.status, 2);
  assert.match(emptyPaths.stderr, /--paths requires a value/);
});

test('--paths: an entry naming the repo root is a usage error, never silently dropped', () => {
  // `src/x.ts,.` used to drop the "." and answer about one path, not two.
  const r = run('--paths', 'src/design/targets,.', '--root', store);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /name the repo root/);
  // `src/..` normalizes to the root the same way.
  assert.equal(run('--paths', 'src/..', '--root', store).status, 2);
});

// -------------------------------------- unreadable pointers & the exit-1 trap

test('--paths: an unreadable pointer falls back to the name, never crashes the lookup', () => {
  // `throwIfNoEntry: false` silences ENOENT only — an EACCES parent still
  // throws. The lookup must still answer for every other pointer.
  const dir = mkdtempSync(join(tmpdir(), 'resolve-eacces-'));
  cpSync(onDiskStore, dir, { recursive: true });
  const guarded = join(dir, 'src');
  try {
    chmodSync(guarded, 0o000);
    // If the sandbox does not enforce the mode (root, or a permissive fs),
    // the stat succeeds and there is no unreadable pointer to test.
    let enforced = false;
    try { statSync(join(guarded, 'api.v2'), { throwIfNoEntry: false }); } catch { enforced = true; }
    if (!enforced) return;
    const r = run('--paths', 'src/api.v2/handler.ts', '--root', dir, '--json');
    assert.equal(r.status, 0, `an unreadable pointer must not crash: ${r.stderr}`);
    assert.ok(!/EACCES|at Object\./.test(r.stderr), `no stack trace: ${r.stderr}`);
  } catch (error) {
    if (error?.code !== 'EPERM') throw error; // some CI sandboxes forbid chmod
  } finally {
    chmodSync(guarded, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an internal failure exits 2, never 1 — the resolver emits no findings', () => {
  // The resolver has no FINDINGS outcome, so exit 1 must be unreachable: a
  // crash reading as "resolved, with findings" is the PRD §5 failure class.
  const r = run('--paths', 'src/x.ts', '--root', brokenStore);
  assert.notEqual(r.status, 1, `resolve must never exit 1: ${r.stdout}${r.stderr}`);
});
