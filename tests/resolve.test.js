// KK-06: resolver CLI (PRD §4, §7; acceptance A4). Scored term matching over
// terms/aliases/summaries with confusable-with surfaced, SSOT pointers and
// knowledge entry points attached, plus --paths reverse lookup over the
// loader's pointer index (the ACT-step pre-commit check). Tested only through
// its public seam: the CLI process — exit codes and output ARE the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../payload/engine/resolve.js', import.meta.url));
const store = fileURLToPath(new URL('fixtures/resolver/store', import.meta.url));
const brokenStore = fileURLToPath(new URL('fixtures/loader/duplicate-id', import.meta.url));

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
  const out = runJson('settlement');
  assert.equal(out.mode, 'query');
  assert.equal(out.query, 'settlement');
  const first = out.results[0];
  assert.equal(first.id, 'K-120');
  assert.equal(first.term, 'Settlement');
  assert.equal(first.score, 100);
  assert.equal(first.match, 'exact-term');
});

test('exact alias match scores 80', () => {
  const out = runJson('tender');
  assert.deepEqual(
    out.results.map((r) => [r.id, r.score, r.match]),
    [['K-100', 80, 'exact-alias']],
  );
});

test('prefix/word match in term scores 60; score ties break by id asc', () => {
  const out = runJson('method');
  assert.deepEqual(
    out.results.map((r) => [r.id, r.score, r.match]),
    [['K-100', 60, 'term-match'], ['K-110', 60, 'term-match']],
  );
});

test('summary word match scores 40', () => {
  const out = runJson('banks');
  assert.deepEqual(
    out.results.map((r) => [r.id, r.score, r.match]),
    [['K-120', 40, 'summary-match']],
  );
});

test('matching is case-insensitive; multi-word query terms join into one query', () => {
  const out = runJson('PAYMENT', 'Instrument');
  assert.equal(out.query, 'payment instrument');
  assert.equal(out.results[0].id, 'K-100');
  assert.equal(out.results[0].match, 'exact-alias');
});

test('one ranked list: exact > summary > downranked prefix (§3.5)', () => {
  const out = runJson('settlement');
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
  const windows = runJson('settlement', 'window');
  const draft = windows.results.find((r) => r.id === 'K-130');
  assert.equal(draft.match, 'exact-term');
  assert.equal(draft.score, 70, 'exact-term 100 - 30 draft downrank');
});

// --------------------------------- what results carry (PRD §4 resolver row)

test('results carry SSOT pointers, confusable-with, and knowledge entry points', () => {
  const out = runJson('payment', 'method');
  const method = out.results[0];
  assert.equal(method.id, 'K-100');
  assert.equal(method.summary, 'A way a user pays money in.');
  assert.deepEqual(method['source-of-truth'], ['src/payments/methods/registry.ts']);
  assert.deepEqual(method['confusable-with'], [{ id: 'K-110', term: 'Payout method' }]);
  assert.deepEqual(method.knowledge, [
    {
      notation: '410.2',
      heading: 'Accepted payment instruments',
      file: 'knowledge/payments/410.2-accepted-payment-instruments.md',
    },
  ]);
});

test('knowledge entry points come from leaf terms naming the concept term or alias', () => {
  const out = runJson('settlement');
  const settlement = out.results.find((r) => r.id === 'K-120');
  assert.deepEqual(settlement.knowledge.map((k) => k.notation), ['410.1']);
  const ledger = out.results.find((r) => r.id === 'K-140');
  assert.deepEqual(ledger.knowledge, []);
});

test('deprecated concepts are surfaced flagged, in JSON and human output (§3.5)', () => {
  const json = runJson('ledger');
  assert.equal(json.results[0].status, 'deprecated');
  const human = run('ledger', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /K-140/);
  assert.match(human.stdout, /\[deprecated\]/);
});

test('confusable-with warning is prominent in human output', () => {
  const human = run('payment', 'method', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /confusable-with: K-110 "Payout method"/);
});

test('human output is readable: id, term, score, pointers, entry points', () => {
  const human = run('settlement', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /resolve "settlement" -> 3 concepts/);
  assert.match(human.stdout, /K-120 {2}Settlement {2}\[active\] {2}score 100 \(exact-term\)/);
  assert.match(human.stdout, /source-of-truth:\n {4}src\/payments\/settlement\.ts/);
  assert.match(human.stdout, /410\.1 {2}Card settlement windows/);
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

// ------------------------------------- --paths reverse lookup (ACT step)

test('--paths: exact file pointer maps back to its concept', () => {
  const out = runJson('--paths', 'src/payments/settlement.ts');
  assert.equal(out.mode, 'paths');
  assert.deepEqual(out.paths, [
    {
      path: 'src/payments/settlement.ts',
      concepts: [{ id: 'K-120', term: 'Settlement', pointer: 'src/payments/settlement.ts' }],
    },
  ]);
});

test('--paths: a file under a folder pointer matches that concept', () => {
  const out = runJson('--paths', 'src/payments/payouts/stripe.ts');
  assert.deepEqual(out.paths[0].concepts, [
    { id: 'K-110', term: 'Payout method', pointer: 'src/payments/payouts' },
  ]);
});

test('--paths: unmatched path is a normal outcome — empty concepts, exit 0', () => {
  const out = runJson('--paths', 'src/unmapped/thing.ts');
  assert.deepEqual(out.paths, [{ path: 'src/unmapped/thing.ts', concepts: [] }]);
  const human = run('--paths', 'src/unmapped/thing.ts', '--root', store);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /no concepts point at this path/);
});

test('--paths: comma-separated list; output deduped and sorted by path asc', () => {
  const out = runJson(
    '--paths',
    'src/unmapped/thing.ts,./src/payments/settlement.ts,src/payments/settlement.ts',
  );
  assert.deepEqual(out.paths.map((p) => p.path), [
    'src/payments/settlement.ts',
    'src/unmapped/thing.ts',
  ]);
  assert.equal(out.paths[0].concepts[0].id, 'K-120');
});

// ------------------------------------------- determinism & store health

test('JSON output is deterministic: two runs are byte-identical, no timestamps', () => {
  const a = run('settlement', '--root', store, '--json');
  const b = run('settlement', '--root', store, '--json');
  assert.equal(a.stdout, b.stdout);
  assert.doesNotMatch(a.stdout, /\d{4}-\d{2}-\d{2}T/);
});

test('unhealthy store still resolves; health surfaced, not fatal (one health model)', () => {
  const r = run('sport', '--root', brokenStore, '--json');
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out['store-health'].ok, false);
  assert.ok(out['store-health'].errors > 0);
  assert.equal(out.results[0].id, 'K-210');
  const human = run('sport', '--root', brokenStore);
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

test('unreadable root exits 2 — a lookup that never ran is a failure, not a miss', () => {
  const r = run('settlement', '--root', `${store}/does-not-exist`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /resolve: /);
});
