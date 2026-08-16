// UCS-1155: trust graduation — the mechanism that lets moderation narrow from
// 100% inspection to sampling. Autonomy is per change CATEGORY and never per
// leaf: a governed table declares which categories may graduate (with a
// threshold N) and which are permanently gated, and graduations and revocations
// are ordinary Decisions entries carrying a typed `graduation:` block that the
// validator holds against that table.
//
// Tested through the public seam — the CLI process — because exit codes and
// output ARE the contract.
//
// What is deliberately NOT tested here, because it is deliberately not built:
// the engine does not compute approved-unmodified counts and does not decide
// whether a threshold was met. v1's analytics are MANUAL (the moderator judges
// the recorded counts). These tests assert that the recorded artifacts are
// well-formed and consistent with the table — never that a graduation was
// EARNED, which is a judgment no fixture can stand in for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { loadStores, DIAGNOSTIC_CODES } from '../payload/engine/lib/load-stores.js';
import { KINDS } from '../payload/engine/lib/validate-record.js';
import { CHECKS } from '../payload/engine/commands/validate.js';

const cli = fileURLToPath(new URL('../payload/engine/validate.js', import.meta.url));
const fixture = (name) =>
  fileURLToPath(new URL(`fixtures/structural-validator/${name}`, import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function runJson(expected, ...args) {
  const r = run('--json', ...args);
  assert.equal(r.status, expected, `exit ${r.status}, stderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const codes = (out) => out.findings.map((f) => [f.code, f.id, f.path]);

// ------------------------------------------------- A1: the table loads

test('A1: a well-formed category table loads and the store validates clean', () => {
  const out = runJson(0, '--root', fixture('graduation-clean'));
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out.counts, { errors: 0, warnings: 0 });
  assert.equal(out['store-health'].ok, true);
});

test('A1: the table declares eligibility per category — eligible carries N, gated does not', () => {
  const model = loadStores(fixture('graduation-clean'));
  const table = model.graduations.get('decisions/graduation-categories');
  assert.ok(table, 'the table is indexed under its store-qualified key');
  assert.equal(table.store, 'decisions');

  const eligible = table.categories.get('alias-additions');
  assert.equal(eligible.eligibility, 'eligible');
  assert.equal(eligible.threshold, 3, 'an eligible category names the bar N');

  const gated = table.categories.get('authority-assignments');
  assert.equal(gated.eligibility, 'gated');
  assert.equal(gated.threshold, null, 'a gated category has no threshold — it can never graduate');
});

test('A1: every table row cites a decision, resolved on the ordinary ref graph', () => {
  const model = loadStores(fixture('graduation-clean'));
  const edges = model.refs.filter((r) => r.type === 'graduation.decision');
  assert.equal(edges.length, 2, 'one warrant edge per declared category');
  for (const edge of edges) {
    assert.equal(edge.resolved, true, `${edge.from} cites a decision that must resolve`);
  }
});

test('A1: a malformed table is a HARD ERROR — checks never ran, exit 2, never exit 1', () => {
  // The load-bearing invariant: exit 1 means FINDINGS. A table the engine could
  // not trust means the graduation checks never ran, and a check that never ran
  // is a blocking defect, never a silent pass or a partial findings list.
  const r = run('--json', '--root', fixture('graduation-malformed'));
  assert.equal(r.status, 2, 'a table the loader cannot trust gates to exit 2');
  assert.match(r.stderr, /structural checks never ran/);

  const model = loadStores(fixture('graduation-malformed'));
  assert.deepEqual(
    model.diagnostics
      .filter((d) => d.file.endsWith('graduation-categories.yaml'))
      .map((d) => [d.code, d.path]),
    [
      ['duplicate-graduation-category', 'categories[1].category'],
      ['graduation-threshold-shape', 'categories[2].threshold'],
      ['graduation-threshold-shape', 'categories[3].threshold'],
    ],
  );
  assert.equal(model.ok, false);
});

test('A1: the three table defects are declared loader diagnostics', () => {
  for (const code of [
    'graduation-table-name-mismatch', 'duplicate-graduation-category',
    'graduation-threshold-shape',
  ]) {
    assert.ok(DIAGNOSTIC_CODES.includes(code), `${code} must be a declared diagnostic`);
  }
});

test('A1: the table is its own schema kind, validated like every other store file', () => {
  assert.ok(KINDS.includes('graduation-categories'));
});

// --------------------------------- A2: entries are held against the table

test('A2: a graduation for a gated category, and one naming an undeclared category, are findings', () => {
  const out = runJson(1, '--root', fixture('graduation-findings'));
  assert.deepEqual(codes(out), [
    ['gated-category-graduation', 'D-205', 'graduation.category'],
    ['undeclared-category', 'D-206', 'graduation.category'],
  ]);
});

test('A2: the gated refusal explains that a streak does not make judgment mechanical', () => {
  const out = runJson(1, '--root', fixture('graduation-findings'));
  const finding = out.findings.find((f) => f.code === 'gated-category-graduation');
  assert.match(finding.message, /PERMANENTLY GATED/);
  assert.match(finding.message, /does not become mechanical/);
});

test('A2: REVOCATION of a gated category is clean — revoking only ever narrows autonomy', () => {
  // The asymmetry is the design. Graduating a gated category is refused;
  // revoking one is legitimate, because refusing it would be refusing the safe
  // direction. The clean fixture carries exactly that entry (D-204).
  const model = loadStores(fixture('graduation-clean'));
  const revocation = model.decisions.get('D-204').record.graduation;
  assert.equal(revocation.action, 'revoke');
  assert.equal(revocation.category, 'authority-assignments');
  const table = model.graduations.get('decisions/graduation-categories');
  assert.equal(table.categories.get('authority-assignments').eligibility, 'gated');
  // ...and the store still validates clean (asserted in A1).
});

test('A2: an entry moving the trust boundary with no table at all is a finding', () => {
  const out = runJson(1, '--root', fixture('graduation-no-table'));
  assert.deepEqual(codes(out), [
    ['missing-graduation-table', 'D-205', 'graduation.category'],
  ]);
  assert.match(out.findings[0].message, /a check that never ran is a blocking defect/);
});

test('A2: a revocation names the graduation it withdraws, resolved as an ordinary ref', () => {
  const model = loadStores(fixture('graduation-clean'));
  assert.equal(model.decisions.get('D-203').record.graduation.revokes, 'D-202');
  const edge = model.refs.find((r) => r.from === 'D-203' && r.to === 'D-202');
  assert.ok(edge, 'the withdrawal and the thing withdrawn stay connected in the record');
  assert.equal(edge.resolved, true);
});

test('A2: the three graduation checks are declared in CHECKS', () => {
  for (const code of [
    'gated-category-graduation', 'undeclared-category', 'missing-graduation-table',
  ]) {
    assert.ok(CHECKS.includes(code), `${code} must be reported as a check class`);
  }
});

// ------------------------------------------- A3: provenance is surfaced

test('A3: decision-entry provenance validates and is surfaced in validator output', () => {
  const out = runJson(0, '--root', fixture('graduation-clean'));
  assert.deepEqual(out.provenance, [
    {
      id: 'D-202',
      file: 'decisions/entries/D-202-graduate-alias-additions.yaml',
      author: 'dimitri',
      'skill-version': 'knowledge-reflect@1.4.0',
    },
    {
      id: 'D-203',
      file: 'decisions/entries/D-203-revoke-alias-additions.yaml',
      author: 'dimitri',
      'skill-version': 'knowledge-reflect@1.4.0',
    },
    {
      id: 'D-204',
      file: 'decisions/entries/D-204-revoke-gated-category.yaml',
      author: 'dimitri',
      'skill-version': 'knowledge-reflect@1.4.0',
    },
  ]);
});

test('A3: provenance makes a bad skill revision traceable across entries', () => {
  // The question provenance exists to answer, asked the way a steward would:
  // "which entries did that skill vintage write?" The findings fixture carries
  // two vintages, so the answer must discriminate.
  const out = runJson(1, '--root', fixture('graduation-findings'));
  const byVersion = (v) => out.provenance.filter((p) => p['skill-version'] === v).map((p) => p.id);
  assert.deepEqual(byVersion('knowledge-reflect@1.3.0'), ['D-206']);
  assert.deepEqual(byVersion('knowledge-reflect@1.4.0'), ['D-205']);
});

test('A3: provenance is surfaced in the human renderer too, not only in JSON', () => {
  const r = run('--root', fixture('graduation-clean'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /decision provenance \(author \/ skill version\)/);
  assert.match(r.stdout, /D-202\s+dimitri\s+knowledge-reflect@1\.4\.0/);
});

test('A3: entries without provenance are omitted rather than padded with nulls', () => {
  // D-201 carries none — the installed base predates the field (D-001: no
  // update channel), so a list padded with an entry per un-migrated record
  // would bury the ones that can actually be traced.
  const out = runJson(1, '--root', fixture('graduation-findings'));
  assert.ok(!out.provenance.some((p) => p.id === 'D-201'));
});

test('A3: provenance output is stable-sorted and free of timestamps (D-012)', () => {
  const first = runJson(0, '--root', fixture('graduation-clean'));
  const second = runJson(0, '--root', fixture('graduation-clean'));
  assert.deepEqual(first.provenance, second.provenance);
  assert.deepEqual(
    first.provenance.map((p) => p.id),
    [...first.provenance.map((p) => p.id)].sort(),
  );
});

// ------------------------------- A4: templates, manifest, documented conduct

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const readPayload = (p) => readFileSync(new URL(`../payload/${p}`, import.meta.url), 'utf8');

test('A4: graduation and revocation templates ship via the payload allowlist', () => {
  const manifest = readFileSync(new URL('../cli/kit.manifest.yaml', import.meta.url), 'utf8');
  for (const t of ['trust-graduation.yaml', 'trust-revocation.yaml']) {
    assert.match(manifest, new RegExp(`templates/decisions/${t}`), `${t} must be in the manifest`);
  }
  assert.match(
    manifest,
    /templates\/decisions\/_registries\/graduation-categories\.yaml.*decisions\/_registries\/graduation-categories\.yaml/,
    'the category table seeds into the decisions store',
  );
});

test('A4: both templates parse, carry the typed block, and are DELIBERATELY invalid until filled', () => {
  // Same conduct as the phoenix and registry-minting templates: pasting one
  // unedited must never produce a Decisions entry, or moderation would narrow
  // on a rationale nobody wrote.
  for (const [file, action] of [
    ['templates/decisions/trust-graduation.yaml', 'graduate'],
    ['templates/decisions/trust-revocation.yaml', 'revoke'],
  ]) {
    const doc = load(readPayload(file));
    const entry = doc.entries[0];
    assert.equal(entry.category, 'trust', `${file}: the third store governs the trust boundary`);
    assert.equal(entry.graduation.action, action);
    assert.match(entry.id, /^D-YYYY-MM-DD-/, `${file}: placeholder id must not validate`);
    assert.equal(entry.date, 'YYYY-MM-DD', `${file}: placeholder date must not validate`);
    assert.ok(entry.provenance, `${file}: templates model provenance`);
  }
});

test('A4: the seeded category table ships EMPTY — the kit does not pre-judge the client', () => {
  const doc = load(readPayload('templates/decisions/_registries/graduation-categories.yaml'));
  assert.equal(doc.store, 'decisions');
  assert.equal(doc.table, 'graduation-categories');
  assert.deepEqual(doc.categories, [], 'seeded empty, like every other registry');
});

test('A4: documented conduct — automatic revocation on ANY defect', () => {
  const guide = readPayload('docs/steward-guide.md');
  assert.match(guide, /automatic/i, 'the guide must state revocation is automatic');
  assert.match(
    guide,
    /any defect/i,
    'the trigger is any defect — not a severity judgment',
  );
});

test('A4: documented conduct — citation spot-checks at EVERY trust level', () => {
  const guide = readPayload('docs/steward-guide.md');
  assert.match(guide, /spot-check/i);
  assert.match(guide, /every (trust )?level/i, 'spot-checks survive every graduation');
});

test('A4: documented conduct — v1 analytics are explicitly MANUAL', () => {
  const guide = readPayload('docs/steward-guide.md');
  assert.match(guide, /manual/i, 'the guide must say the analytics are manual in v1');
  assert.match(
    guide,
    /does not compute|never computes|no.*comput/i,
    'the guide must say plainly that the engine does not compute the counts',
  );
});

test('A4: the glossary records that graduation is per category, never per leaf', () => {
  const context = readFileSync(new URL('../CONTEXT.md', import.meta.url), 'utf8');
  assert.match(context, /Trust graduation/);
  assert.match(context, /per-category|per change category|per category/i);
});
