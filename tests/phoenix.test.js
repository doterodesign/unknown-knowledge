// KK-34: phoenix events (UCS-1154) — governed bulk re-taxonomy. A drifted
// subtree's facets are rewritten from a leaf-granular mapping, the `edition` of
// every moved leaf is bumped (the only thing that ever bumps it in v2), and the
// event lands as an ordinary PR. Tested through the public seam — the CLI
// process — because exit codes and output ARE the contract, plus golden
// before/after pairs over the fixture store, because the byte-level claim
// (citations untouched) is the whole point and only bytes can prove it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  accessSync, chmodSync, constants, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import {
  CHECKS, FACET_REGISTRY, rewriteFailure, rewriteLeaf, rewriteScalarLine,
} from '../payload/engine/lib/phoenix.js';
import { FACET_REGISTRIES } from '../payload/engine/commands/validate.js';

const cli = fileURLToPath(new URL('../payload/engine/phoenix.js', import.meta.url));
const validateCli = fileURLToPath(new URL('../payload/engine/validate.js', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`fixtures/phoenix/${name}`, import.meta.url));
const SPLIT = fixture('split');

/** The three leaves the event touches, by the file each lives in. */
const LEAF_FILES = {
  'L-000117': 'knowledge/sportsbook/117.1-odds-feed-provider-quirks.md',
  'L-000133': 'knowledge/sportsbook/133.1-bankers-rounding-at-settlement.md',
  'L-000213': 'knowledge/sportsbook/213.1-live-betting-latency-budget.md',
};

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function runJson(expectStatus, ...args) {
  const r = run(...args, '--json');
  assert.equal(r.status, expectStatus, `expected exit ${expectStatus}, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/**
 * A disposable copy of a fixture store. Phoenix is the one command that writes,
 * so every apply test runs against a copy — a test that mutated the fixture
 * would pass once and then describe a store nobody committed.
 */
function scratch(t, name) {
  const root = mkdtempSync(join(tmpdir(), 'kk-phoenix-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixture(name), root, { recursive: true });
  return root;
}

const read = (root, file) => readFileSync(join(root, file), 'utf8');
/** Still writable despite a read-only mode — true only when running as root. */
function accessible(file) {
  try {
    accessSync(file, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
/** The frontmatter half of a leaf file, and the body half, split at the closing fence. */
function halves(text) {
  const end = text.indexOf('\n---\n', 4);
  return { front: text.slice(0, end), body: text.slice(end) };
}
/** Every citation line, verbatim — the bytes that must survive an event. */
function citationBlock(text) {
  const lines = text.split('\n');
  const start = lines.indexOf('citations:');
  assert.notEqual(start, -1, 'fixture leaf has no citations block');
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z]/.test(lines[i])) break; // a new top-level field ends the block
    out.push(lines[i]);
  }
  return out.join('\n');
}
const field = (text, name) => new RegExp(`^${name}: (.*)$`, 'm').exec(text)?.[1];
const facetDomain = (text) => /^ {2}domain: (.*)$/m.exec(text)?.[1];

// ------------------------------------------------- the mapping applies (AC1)

test('--check plans the event and writes nothing: the default verb cannot damage a store', (t) => {
  const root = scratch(t, 'split');
  const before = Object.fromEntries(Object.entries(LEAF_FILES).map(([id, f]) => [id, read(root, f)]));

  const out = runJson(0, 'P-001', '--root', root);
  assert.equal(out.verb, 'check');
  assert.equal(out.counts.rewritten, 3);
  assert.equal(out.counts.findings, 0);

  for (const [id, file] of Object.entries(LEAF_FILES)) {
    assert.equal(read(root, file), before[id], `${id} must be byte-identical after a --check`);
  }
});

test('--apply rewrites facets, bumps edition, and leaves accession ids alone', (t) => {
  const root = scratch(t, 'split');
  const before = Object.fromEntries(Object.entries(LEAF_FILES).map(([id, f]) => [id, read(root, f)]));

  const out = runJson(0, 'P-001', '--root', root, '--apply');
  assert.equal(out.verb, 'apply');
  assert.deepEqual(out.counts, { findings: 0, rewritten: 3, carried: 0 });

  for (const [id, file] of Object.entries(LEAF_FILES)) {
    const after = read(root, file);
    assert.equal(field(after, 'edition'), '2', `${id} edition must bump 1 -> 2`);
    assert.equal(field(before[id], 'edition'), '1', `${id} started at edition 1`);
    // IDENTITY HOLDS. This is the property the whole design exists to protect:
    // nothing that cites this leaf has to chase its reclassification.
    assert.equal(field(after, 'id'), id);
    assert.equal(field(after, 'id'), field(before[id], 'id'));
  }
});

// -------------------------------------- citations untouched, byte-for-byte

test('citations are byte-identical before and after — untouched by construction', (t) => {
  const root = scratch(t, 'split');
  const before = Object.fromEntries(Object.entries(LEAF_FILES).map(([id, f]) => [id, read(root, f)]));
  runJson(0, 'P-001', '--root', root, '--apply');

  for (const [id, file] of Object.entries(LEAF_FILES)) {
    const after = read(root, file);
    assert.equal(citationBlock(after), citationBlock(before[id]),
      `${id}: the citations block must not change when a leaf is re-filed`);
    assert.equal(halves(after).body, halves(before[id]).body,
      `${id}: the body must not change`);
  }
});

test('the ONLY frontmatter lines that change are edition and the scoped facet', (t) => {
  const root = scratch(t, 'split');
  const before = Object.fromEntries(Object.entries(LEAF_FILES).map(([id, f]) => [id, read(root, f)]));
  runJson(0, 'P-001', '--root', root, '--apply');

  for (const [id, file] of Object.entries(LEAF_FILES)) {
    const beforeLines = before[id].split('\n');
    const afterLines = read(root, file).split('\n');
    assert.equal(afterLines.length, beforeLines.length, `${id}: line count must not change`);
    const changed = beforeLines
      .map((line, i) => (line === afterLines[i] ? null : i))
      .filter((i) => i !== null);
    // Exactly two lines, and we can say which: this is what makes a phoenix
    // event a reviewable diff rather than a migration.
    assert.equal(changed.length, 2, `${id}: expected exactly 2 changed lines, got ${changed.length}`);
    assert.match(beforeLines[changed[0]], /^edition: 1$/);
    assert.match(afterLines[changed[0]], /^edition: 2$/);
    assert.match(beforeLines[changed[1]], /^ {2}domain: /);
    assert.match(afterLines[changed[1]], /^ {2}domain: feeds\//);
  }
});

// ------------------------------------------------------- the split (AC2)

test('a split is expressible and applied: one class divides across two successors', (t) => {
  const root = scratch(t, 'split');
  runJson(0, 'P-001', '--root', root, '--apply');

  // Both leaves came from `sportsbook/odds-feed`; only a leaf-granular mapping
  // can send them to different places, which is why the mapping is per-leaf.
  assert.equal(facetDomain(read(root, LEAF_FILES['L-000117'])), 'feeds/ingest');
  assert.equal(facetDomain(read(root, LEAF_FILES['L-000213'])), 'feeds/ingest');
  // And the merge half: a different predecessor arrives at one of the same
  // successors.
  assert.equal(facetDomain(read(root, LEAF_FILES['L-000133'])), 'feeds/settlement');
});

test('the split is reported per leaf, with the predecessor each came from', (t) => {
  const root = scratch(t, 'split');
  const out = runJson(0, 'P-001', '--root', root);
  assert.deepEqual(out.rewrites.map((r) => [r.id, r.from, r.to, r.edition]), [
    ['L-000117', 'sportsbook/odds-feed', 'feeds/ingest', 2],
    ['L-000133', 'sportsbook/settlement', 'feeds/settlement', 2],
    ['L-000213', 'sportsbook/odds-feed', 'feeds/ingest', 2],
  ]);
});

test('a store that has been through a phoenix event still validates clean', (t) => {
  const root = scratch(t, 'split');
  runJson(0, 'P-001', '--root', root, '--apply');
  const r = spawnSync(process.execPath, [validateCli, '--root', root], { encoding: 'utf8' });
  assert.equal(r.status, 0, `applied store must stay structurally clean:\n${r.stdout}`);
});

// ------------------------------------------------ the golden pair

test('the golden after-state is byte-identical to what the engine produces', (t) => {
  // A committed before/after pair, so the event is a diff a reviewer reads
  // rather than a property a test asserts. If the rewriter ever changes what it
  // emits, this fails with the actual bytes.
  const root = scratch(t, 'split');
  runJson(0, 'P-001', '--root', root, '--apply');
  for (const file of Object.values(LEAF_FILES)) {
    const golden = join(fixture('split-after'), file.replace('knowledge/', ''));
    assert.equal(read(root, file), readFileSync(golden, 'utf8'),
      `${file} diverges from the committed golden after-state`);
  }
});

test('the golden pair differs ONLY in edition and the scoped facet', () => {
  // The same claim as the line-level test above, made against the committed
  // artifacts rather than a temp copy — this is the diff the README describes.
  for (const file of Object.values(LEAF_FILES)) {
    const before = readFileSync(join(SPLIT, file), 'utf8');
    const after = readFileSync(join(fixture('split-after'), file.replace('knowledge/', '')), 'utf8');
    assert.equal(citationBlock(before), citationBlock(after), `${file}: citations moved`);
    assert.equal(halves(before).body, halves(after).body, `${file}: body moved`);
    assert.equal(field(before, 'id'), field(after, 'id'), `${file}: IDENTITY moved`);
    assert.equal(field(before, 'edition'), '1');
    assert.equal(field(after, 'edition'), '2');
    assert.notEqual(facetDomain(before), facetDomain(after));
  }
});

// ------------------------------------------------------- rejection (AC3)

test('a mapping that misses a leaf in scope is refused, naming the leaf', (t) => {
  const root = scratch(t, 'incomplete');
  const out = runJson(1, 'P-001', '--root', root, '--apply');
  assert.equal(out.counts.findings, 1);
  const [finding] = out.findings;
  assert.equal(finding.code, 'scope-unaccounted');
  assert.equal(finding.id, 'L-000213', 'the finding must NAME the leaf that was missed');
  assert.match(finding.message, /L-000213/);
  assert.match(finding.message, /mapped, split, or explicitly carried forward/);
});

test('a mapping naming an unknown accession is refused, naming the id', (t) => {
  const root = scratch(t, 'unknown-leaf');
  const out = runJson(1, 'P-001', '--root', root, '--apply');
  assert.equal(out.counts.findings, 1);
  const [finding] = out.findings;
  assert.equal(finding.code, 'unknown-leaf');
  assert.equal(finding.id, 'L-000999');
  assert.match(finding.message, /no leaf in this store carries/);
});

test('a refused mapping NEVER partially applies — not one byte, even under --apply', (t) => {
  for (const name of ['incomplete', 'unknown-leaf']) {
    const root = scratch(t, name);
    const before = Object.fromEntries(Object.entries(LEAF_FILES).map(([id, f]) => [id, read(root, f)]));
    assert.equal(run('P-001', '--root', root, '--apply').status, 1, name);
    for (const [id, file] of Object.entries(LEAF_FILES)) {
      // The valid rows in these mappings would each have applied cleanly on
      // their own. A partial apply is the outcome the gate exists to prevent:
      // it leaves a store half re-taxonomized, and the next run cannot tell
      // which leaves already moved.
      assert.equal(read(root, file), before[id],
        `${name}/${id}: a refused event must write nothing at all`);
    }
  }
});

test('a moved-to value that is not minted is refused — an event does not invent vocabulary', (t) => {
  const root = scratch(t, 'split');
  const mapping = join(root, 'knowledge/_phoenix/P-001.yaml');
  writeFileSync(mapping, readFileSync(mapping, 'utf8').replace('to: feeds/settlement', 'to: feeds/nowhere'));
  const out = runJson(1, 'P-001', '--root', root, '--apply');
  assert.equal(out.findings[0].code, 'facet-unminted');
  assert.match(out.findings[0].message, /not minted/);
  assert.equal(read(root, LEAF_FILES['L-000117']), read(SPLIT, LEAF_FILES['L-000117']),
    'the other rows must not have applied');
});

test('a no-op row is REFUSED — "to" present must mean moved', (t) => {
  // Left as a silent carry-forward this was a real inconsistency: the event
  // applied cleanly and the validator then reported the store as broken,
  // because planEvent read the row as "not moved" and unaccountedEditions read
  // it as "moved". Refusing upstream makes `to` present <=> moved true by
  // construction, and the two agree without either learning about the other.
  const root = scratch(t, 'split');
  const mapping = join(root, 'knowledge/_phoenix/P-001.yaml');
  writeFileSync(mapping, readFileSync(mapping, 'utf8')
    .replace('    to: feeds/settlement\n', '    to: sportsbook/settlement\n'));

  const out = runJson(1, 'P-001', '--root', root, '--apply');
  assert.equal(out.findings[0].code, 'noop-row');
  assert.equal(out.findings[0].id, 'L-000133');
  assert.match(out.findings[0].message, /where it already sits/);
  assert.match(out.findings[0].message, /omit "to" to carry the leaf forward/);
  assert.equal(read(root, LEAF_FILES['L-000117']), read(SPLIT, LEAF_FILES['L-000117']),
    'the whole event is refused, so no sibling was written');
});

test('a move with no "why" is refused — a moved leaf carries its reason', (t) => {
  const root = scratch(t, 'split');
  const mapping = join(root, 'knowledge/_phoenix/P-001.yaml');
  writeFileSync(mapping, readFileSync(mapping, 'utf8').replace(
    '    why: Provider quirks are ingest material — they describe the wire, not the book.\n', ''));

  const out = runJson(1, 'P-001', '--root', root, '--apply');
  assert.equal(out.findings[0].code, 'unexplained-move');
  assert.equal(out.findings[0].id, 'L-000117');
  assert.match(out.findings[0].message, /no "why"/);
});

test('re-running an applied event is refused, and says it looks already applied', (t) => {
  // Refusing is the correct behavior: a second --apply must never bump the
  // edition twice for a move that happened once. What improves is the wording —
  // the generic out-of-scope text reads like a broken mapping.
  const root = scratch(t, 'split');
  runJson(0, 'P-001', '--root', root, '--apply');
  const out = runJson(1, 'P-001', '--root', root);
  for (const f of out.findings) {
    assert.match(f.message, /appears to have been applied already/);
    assert.match(f.message, /bump the edition a second time/);
  }
  // And a second --apply changes nothing.
  const before = Object.fromEntries(Object.entries(LEAF_FILES).map(([id, f]) => [id, read(root, f)]));
  assert.equal(run('P-001', '--root', root, '--apply').status, 1);
  for (const [id, f] of Object.entries(LEAF_FILES)) assert.equal(read(root, f), before[id], id);
});

test('two events that each moved a leaf sanction edition 3', (t) => {
  // The counting rule generalizes: edition === 1 + moves. A second event moving
  // one leaf again must validate clean at edition 3.
  const root = scratch(t, 'split');
  runJson(0, 'P-001', '--root', root, '--apply');
  writeFileSync(join(root, 'knowledge/_phoenix/P-002.yaml'), [
    'schema-version: 1',
    'event: P-002',
    'title: Move ingest material under a dedicated provider class',
    'decision: D-420',
    'scope:',
    '  facet: facets.domain',
    '  values: [feeds/ingest]',
    'leaves:',
    '  - id: L-000117',
    '    to: feeds/settlement',
    '    why: A second governed move, to prove the edition counts events rather than capping at two.',
    '  - id: L-000213',
    '', // carried forward: in scope, considered, unmoved
  ].join('\n'));

  const out = runJson(0, 'P-002', '--root', root, '--apply');
  assert.deepEqual(out.carried, ['L-000213']);
  assert.equal(field(read(root, LEAF_FILES['L-000117']), 'edition'), '3');
  const r = spawnSync(process.execPath, [validateCli, '--root', root], { encoding: 'utf8' });
  assert.equal(r.status, 0, `edition 3 = 1 + two moves must validate clean:\n${r.stdout}`);
});

// ------------------------------------------- carried-forward accounting

test('a leaf can be explicitly carried forward: accounted for, unmoved, edition unchanged', (t) => {
  const root = scratch(t, 'split');
  const mapping = join(root, 'knowledge/_phoenix/P-001.yaml');
  // Drop the `to:` from L-000213's row — it stays in scope, and the steward
  // says so deliberately rather than by omission.
  writeFileSync(mapping, readFileSync(mapping, 'utf8').replace(
    /  - id: L-000213\n    to: feeds\/ingest\n/,
    '  - id: L-000213\n',
  ));
  const out = runJson(0, 'P-001', '--root', root, '--apply');
  assert.deepEqual(out.carried, ['L-000213']);
  assert.equal(out.counts.rewritten, 2);
  // Carrying forward is not a rewrite, so it bumps no edition: the edition
  // records that a leaf CHANGED, not that it was reviewed.
  const after = read(root, LEAF_FILES['L-000213']);
  assert.equal(field(after, 'edition'), '1');
  assert.equal(after, read(SPLIT, LEAF_FILES['L-000213']), 'a carried leaf is untouched');
});

// ------------------------------------- unaccounted edition bumps (AC4)

test('an edition bump no phoenix mapping accounts for is a validator finding', (t) => {
  const root = scratch(t, 'split');
  runJson(0, 'P-001', '--root', root, '--apply');
  // Remove the retained mapping: the leaves still claim edition 2, and now
  // nothing in the working tree sanctions that claim.
  rmSync(join(root, 'knowledge/_phoenix/P-001.yaml'));

  const r = spawnSync(process.execPath, [validateCli, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  const out = JSON.parse(r.stdout);
  const found = out.findings.filter((f) => f.code === 'unaccounted-edition');
  assert.deepEqual(found.map((f) => f.id), ['L-000117', 'L-000133', 'L-000213']);
  for (const f of found) {
    assert.equal(f.severity, 'error');
    assert.equal(f.path, 'edition');
    assert.match(f.message, /no retained phoenix event moves it/);
  }
});

test('a hand-typed edition is caught even though an event does map that leaf', (t) => {
  const root = scratch(t, 'split');
  // Nobody ran an event; an author simply typed a higher number. P-001 IS
  // retained and DOES map L-000117 — so a check that only asked "does some
  // event mention this leaf" would pass this store. The rule is an equality:
  // the edition COUNTS the events that moved the leaf, and one event cannot
  // sanction edition 4.
  runJson(0, 'P-001', '--root', root, '--apply'); // the store is now consistent
  const file = LEAF_FILES['L-000117'];
  writeFileSync(join(root, file), read(root, file).replace('edition: 2', 'edition: 4'));

  const r = spawnSync(process.execPath, [validateCli, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const found = JSON.parse(r.stdout).findings.filter((f) => f.code === 'unaccounted-edition');
  assert.deepEqual(found.map((f) => f.id), ['L-000117'], 'only the tampered leaf is a finding');
  assert.match(found[0].message, /should be at 2/);
  assert.match(found[0].message, /P-001/);
});

test('an edition that lags the events that moved it is equally a finding', (t) => {
  const root = scratch(t, 'split');
  runJson(0, 'P-001', '--root', root, '--apply');
  // Reverting one leaf's edition by hand, keeping the facet the event wrote:
  // the store now says this leaf both did and did not go through the event.
  const file = LEAF_FILES['L-000133'];
  writeFileSync(join(root, file), read(root, file).replace('edition: 2', 'edition: 1'));

  const r = spawnSync(process.execPath, [validateCli, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const found = JSON.parse(r.stdout).findings.filter((f) => f.code === 'unaccounted-edition');
  assert.deepEqual(found.map((f) => f.id), ['L-000133']);
});

test('the validator reports unaccounted-edition as a check it runs', () => {
  const r = spawnSync(process.execPath, [validateCli, '--root', SPLIT, '--json'], { encoding: 'utf8' });
  assert.ok(JSON.parse(r.stdout).checks.includes('unaccounted-edition'));
});

test('a store with no phoenix mapping and edition 1 everywhere is clean', (t) => {
  // The floor case: a store that has never been through an event. Nothing
  // claims a re-taxonomy, so nothing needs sanctioning.
  const root = scratch(t, 'split');
  rmSync(join(root, 'knowledge/_phoenix/P-001.yaml'));
  const r = spawnSync(process.execPath, [validateCli, '--root', root], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
});

test('a retained mapping whose event has NOT been applied is itself a finding', () => {
  // The fixture is the pre-event store with the mapping already staged, which
  // is exactly the state a phoenix PR is in before the engine runs: the mapping
  // says these leaves moved and the leaves say they did not. The equality rule
  // catches it from either side, so a PR that lands the mapping and forgets to
  // run `--apply` cannot merge green.
  const r = spawnSync(process.execPath, [validateCli, '--root', SPLIT, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const found = JSON.parse(r.stdout).findings.filter((f) => f.code === 'unaccounted-edition');
  assert.deepEqual(found.map((f) => f.id), ['L-000117', 'L-000133', 'L-000213']);
  for (const f of found) assert.match(f.message, /should be at 2/);
});

// ------------------------------------------------------- exit contract

test('a refused mapping is FINDINGS (1), never the never-ran code (2)', (t) => {
  const root = scratch(t, 'incomplete');
  assert.equal(run('P-001', '--root', root).status, 1);
  assert.equal(run('P-001', '--root', root, '--apply').status, 1);
});

test('an event that does not exist never ran: exit 2, and it says what it looked for', (t) => {
  const root = scratch(t, 'split');
  const r = run('P-404', '--root', root);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /knowledge\/_phoenix\/P-404\.yaml/);
  assert.match(r.stderr, /P-001/, 'it names the events the store does carry');
});

test('a store the loader rejects runs no event: exit 2, never a write', (t) => {
  const root = scratch(t, 'split');
  writeFileSync(join(root, 'knowledge/_catalog.yaml'), 'schema-version: 1\nstore: knowledge\nentries: [\n');
  const before = read(root, LEAF_FILES['L-000117']);
  const r = run('P-001', '--root', root, '--apply');
  assert.equal(r.status, 2, 'a store that does not load cannot be re-taxonomized');
  assert.equal(read(root, LEAF_FILES['L-000117']), before);
});

test('usage errors exit 2: no event named, two verbs, a second event', () => {
  assert.equal(run('--root', SPLIT).status, 2);
  assert.equal(run('P-001', '--apply', '--check', '--root', SPLIT).status, 2);
  assert.equal(run('P-001', 'P-002', '--root', SPLIT).status, 2);
});

// ------------------------------------------------ write failure mid-apply

test('a write that fails mid-apply exits 2 and names every file already written', (t) => {
  // The gate makes this improbable, not impossible: a file readable at probe
  // time can be unwritable at write time. The store is then partially
  // rewritten, which is the one state this design cannot produce silently — so
  // it exits 2 (the event did not finish; exit 1 would claim a clean refusal
  // with nothing written) and lists the files in write order so the revert is
  // mechanical.
  const root = scratch(t, 'split');
  // L-000213 sorts last, so the two earlier leaves are already on disk when
  // this one refuses the write.
  const blocked = join(root, LEAF_FILES['L-000213']);
  chmodSync(blocked, 0o444);
  // Restore before the scratch dir is removed; `after` hooks run last-first, so
  // this one runs before scratch's rmSync, but tolerate either order.
  t.after(() => { try { chmodSync(blocked, 0o644); } catch { /* already removed */ } });
  if (accessible(blocked)) return; // running as root: permissions are advisory

  const r = run('P-001', '--root', root, '--apply');
  assert.equal(r.status, 2, `expected the never-finished code, got ${r.status}: ${r.stdout}`);
  assert.match(r.stderr, /FAILED PART-WAY THROUGH/);
  assert.match(r.stderr, /2 file\(s\) were written before the failure/);
  assert.match(r.stderr, /117\.1-odds-feed-provider-quirks\.md/);
  assert.match(r.stderr, /133\.1-bankers-rounding-at-settlement\.md/);
  assert.doesNotMatch(r.stderr, /213\.1-live-betting-latency-budget\.md\n.*written/,
    'the file that failed is not reported as written');
  // The blocked leaf is genuinely untouched.
  assert.equal(readFileSync(blocked, 'utf8'), readFileSync(join(SPLIT, LEAF_FILES['L-000213']), 'utf8'));
});

// --------------------------------------------------------- determinism

test('JSON output is deterministic: two runs byte-identical, no timestamps', (t) => {
  const root = scratch(t, 'split');
  const a = run('P-001', '--root', root, '--json');
  const b = run('P-001', '--root', root, '--json');
  assert.equal(a.stdout, b.stdout);
  assert.doesNotMatch(a.stdout, /\d{4}-\d{2}-\d{2}T/);
});

test('findings are stable-sorted, so a re-run diffs cleanly', (t) => {
  const root = scratch(t, 'unknown-leaf');
  const a = runJson(1, 'P-001', '--root', root);
  const b = runJson(1, 'P-001', '--root', root);
  assert.deepEqual(a.findings, b.findings);
});

// ----------------------------------------- the rewriter refuses, never guesses

test('the rewriter edits front matter only — a body line that looks like a field is prose', () => {
  const text = '---\nedition: 1\nfacets:\n  domain: a\n---\n\nedition: 99 in prose\n';
  const after = rewriteLeaf(text, 'facets.domain', 'b', 2);
  assert.match(after, /^edition: 2$/m);
  assert.ok(after.endsWith('edition: 99 in prose\n'), 'the body must be carried through untouched');
});

test('the rewriter does not confuse a same-named key in another block', () => {
  // `provenance.domain` is not `facets.domain`. Rewriting the wrong one would
  // be a corruption wearing a clean two-line diff.
  const text = '---\nedition: 1\nprovenance:\n  domain: wrong\nfacets:\n  domain: right\n---\n\nbody\n';
  const after = rewriteLeaf(text, 'facets.domain', 'moved', 2);
  assert.match(after, /^ {2}domain: wrong$/m, 'the other block must be untouched');
  assert.match(after, /^ {2}domain: moved$/m);
});

test('a shape the rewriter cannot edit surgically is REFUSED, not reformatted', () => {
  // A flow mapping has no line of its own to replace. Re-serializing the
  // document to make room would rewrite every byte — which is exactly what the
  // "citations are untouched by construction" claim rules out.
  for (const [text, expected] of [
    ['---\nedition: 1\nfacets: {domain: a}\n---\n\nbody\n', 'facets.domain'],
    ['---\nfacets:\n  domain: a\n---\n\nbody\n', 'edition'],
  ]) {
    assert.equal(rewriteFailure(text, 'facets.domain'), expected);
    assert.equal(rewriteLeaf(text, 'facets.domain', 'b', 2), null);
  }
});

test('a nested key never shadows the top-level field — the citations-block corruption', () => {
  // The regression that matters most: `citations:` containing an `edition:`
  // key. Matching on the name alone rewrote the CITATION and left the leaf's
  // real edition untouched — editing the exact bytes this module promises can
  // never change. Indentation is part of the match at every level.
  const text = '---\nid: L-000117\ncitations:\n  edition: 3\nedition: 1\nfacets:\n  domain: a\n---\n\nbody\n';
  const after = rewriteScalarLine(text, ['edition'], '2');
  assert.match(after, /^ {2}edition: 3$/m, 'the citation must be byte-identical');
  assert.match(after, /^edition: 2$/m, 'the real top-level edition is the one that moves');
});

test('a grandchild key never stands in for a direct child', () => {
  const text = '---\nedition: 1\nfacets:\n  meta:\n    domain: GRANDCHILD\n  domain: REAL\n---\n\nbody\n';
  const after = rewriteScalarLine(text, ['facets', 'domain'], 'MOVED');
  assert.match(after, /^ {4}domain: GRANDCHILD$/m, 'the nested block must be untouched');
  assert.match(after, /^ {2}domain: MOVED$/m);
});

test('a shadowed field with no real line is refused, not satisfied by the shadow', () => {
  // `citations.edition` exists, the leaf's own `edition` does not. Rewriting
  // the shadow would fabricate a bump on a citation.
  const text = '---\nid: L-1\ncitations:\n  edition: 3\nfacets:\n  domain: a\n---\n\nbody\n';
  assert.equal(rewriteScalarLine(text, ['edition'], '2'), null);
  assert.equal(rewriteFailure(text, 'facets.domain'), 'edition');
});

test('the rewriter reads the document own indent step, not an assumed one', () => {
  const text = '---\nedition: 1\nfacets:\n    domain: a\n    form: b\n---\n\nbody\n';
  const after = rewriteLeaf(text, 'facets.domain', 'moved', 2);
  assert.match(after, /^ {4}domain: moved$/m);
  assert.match(after, /^ {4}form: b$/m);
});

// ------------------------------------------------- YAML round-trip safety

test('a facet value YAML would reload as a number is quoted', () => {
  // `010` reloads as 10 (octal, YAML 1.1) and `2024` as a number; either would
  // stop equalling the minted string and turn a validated move into a
  // membership finding on the next run.
  for (const value of ['010', '2024', '1e5']) {
    const text = '---\nedition: 1\nfacets:\n  domain: a\n---\n\nbody\n';
    const after = rewriteLeaf(text, 'facets.domain', value, 2);
    const reloaded = load(after.slice(4, after.indexOf('\n---\n', 4)));
    assert.equal(reloaded.facets.domain, value, `${value} must reload as the same string`);
    assert.equal(typeof reloaded.facets.domain, 'string');
  }
});

test('an ordinary facet value stays unquoted — the common diff is unremarkable', () => {
  const text = '---\nedition: 1\nfacets:\n  domain: a\n---\n\nbody\n';
  assert.match(rewriteLeaf(text, 'facets.domain', 'feeds/ingest', 2), /^ {2}domain: feeds\/ingest$/m);
  assert.match(rewriteLeaf(text, 'facets.domain', 'feeds/ingest', 2), /^edition: 2$/m);
});

test('an unrewritable leaf is a GATE finding, so no sibling leaf is written', (t) => {
  const root = scratch(t, 'split');
  const file = LEAF_FILES['L-000133'];
  // Collapse one leaf's facets into a flow mapping — legal YAML the rewriter
  // will not touch. The other two rows are still perfectly applicable.
  writeFileSync(join(root, file), read(root, file).replace(
    /facets:\n {2}domain: (.*)\n {2}form: (.*)\n {2}anchor: (.*)\n {2}stage: (.*)\n/,
    'facets: {domain: $1, form: $2, anchor: $3, stage: $4}\n',
  ));
  const before = Object.fromEntries(Object.entries(LEAF_FILES).map(([id, f]) => [id, read(root, f)]));

  const out = runJson(1, 'P-001', '--root', root, '--apply');
  assert.equal(out.findings[0].code, 'unrewritable-leaf');
  assert.equal(out.findings[0].id, 'L-000133');
  for (const [id, f] of Object.entries(LEAF_FILES)) {
    assert.equal(read(root, f), before[id], `${id} must be untouched — the whole event was refused`);
  }
});

// ------------------------------------------------------------- wiring

test('every facet a phoenix event may move names the registry the validator governs it by', () => {
  // Two tables, one truth. A facet that gained a registry in the validator and
  // kept a stale one here would let an event move a leaf to a value the
  // validator then rejects — an applied event leaving a store that fails.
  const governed = new Map(
    FACET_REGISTRIES['knowledge-leaf']
      .filter((row) => row.field.startsWith('facets.') && !row.within)
      .map((row) => [row.field, row.registry]),
  );
  for (const [facet, registry] of Object.entries(FACET_REGISTRY)) {
    assert.equal(registry, governed.get(facet),
      `phoenix governs ${facet} by ${registry}; the validator uses ${governed.get(facet)}`);
  }
  // And the reverse: a scalar leaf facet the validator governs that phoenix
  // does not know about is a facet no event could ever move — a silent gap
  // rather than a refusal, which is the harder kind to notice.
  for (const [facet, registry] of governed) {
    assert.equal(FACET_REGISTRY[facet], registry,
      `the validator governs ${facet}, and no phoenix event can move it`);
  }
  assert.equal(Object.keys(FACET_REGISTRY).length, governed.size);
});

test('the checks the command reports are sorted and complete', () => {
  assert.deepEqual([...CHECKS].sort(), [...CHECKS]);
  const out = runJson(0, 'P-001', '--root', SPLIT);
  assert.deepEqual(out.checks, [...CHECKS]);
});

test('--check is the default verb: a bare run plans, it does not write', (t) => {
  const root = scratch(t, 'split');
  const before = read(root, LEAF_FILES['L-000117']);
  assert.equal(runJson(0, 'P-001', '--root', root).verb, 'check');
  assert.equal(runJson(0, 'P-001', '--root', root, '--check').verb, 'check');
  assert.equal(read(root, LEAF_FILES['L-000117']), before);
});

test('the event carries its decision, so the diff points at the governance that sanctioned it', () => {
  const out = runJson(0, 'P-001', '--root', SPLIT);
  assert.equal(out.decision, 'D-420');
  assert.equal(out.mapping, 'knowledge/_phoenix/P-001.yaml');
  assert.deepEqual(out.scope.values, ['sportsbook/odds-feed', 'sportsbook/settlement']);
});
