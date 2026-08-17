// UCS-1149: frontmatter v2 core — facets, operations, applies, authority tiers,
// provenance, draft stage.
//
// The classification layer, built entirely from governed vocabularies: no free
// prose survives in a classification field. Three things are being pinned here
// and they are worth naming separately, because each fails differently:
//
//   1. EVERY governed field is checked for registry membership. Four facets
//      (domain, form, anchor, stage) plus operations, jurisdictions, and
//      citation authority. A field that looked governed and was checked in no
//      store is the failure class this engine exists to prevent (PRD §5).
//   2. `stage: draft` reaches BOTH surfaces through ONE predicate. The resolver
//      downranks and preflight verdicts unknown, and neither reads the stage
//      itself — both go through isPrePromotionStatus/leafStage, so they cannot
//      drift apart into two answers about one leaf.
//   3. `description` is GONE. Not deprecated, not ignored — an unknown property
//      that fails the leaf, with display prose derived from the body instead.
//
// Tested through the public seams: the CLI process for the validator and the
// resolver (exit codes and JSON output ARE the contract, PRD §5), direct import
// for the pure predicates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { isPrePromotionStatus, leafStage, loadStores } from '../payload/engine/lib/load-stores.js';
import { CHECKS, FACET_REGISTRIES } from '../payload/engine/commands/validate.js';
import { firstSentence } from '../payload/engine/commands/resolve.js';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) => join(root, 'tests/fixtures/structural-validator', name);

const CLEAN = fixture('frontmatter-v2');
const FINDINGS = fixture('frontmatter-v2-findings');

function runCli(command, ...args) {
  return spawnSync(process.execPath, [join(root, 'payload/engine', command), ...args], { encoding: 'utf8' });
}

function json(command, expectStatus, ...args) {
  const r = runCli(command, ...args, '--json');
  assert.equal(r.status, expectStatus, `expected exit ${expectStatus}, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Findings as [code, path] pairs — the golden projection. */
const pairs = (payload) => payload.findings.map((f) => [f.code, f.path]);

// ------------------- AC1: the full v2 record shape validates, every field governed

test('a v2 fixture leaf carrying the full record shape validates clean (golden)', () => {
  const payload = json('validate.js', 0, '--root', CLEAN);
  assert.deepEqual(payload.findings, []);
  assert.equal(payload['store-health'].ok, true);

  // The record shape the ticket specifies, read off the file itself rather
  // than restated — a fixture that drifted from the spec would still pass a
  // test that only asserted the validator's verdict.
  const leaf = load(readFileSync(
    join(CLEAN, 'knowledge/design-system/117.1-icon-component-sizing-quirks.md'), 'utf8',
  ).split('---')[1]);
  assert.equal(leaf.id, 'L-000117');
  assert.equal(leaf.edition, 1);
  assert.deepEqual(leaf.facets, {
    domain: 'design-system/components', form: 'reference', anchor: 'world', stage: 'verified',
  });
  assert.deepEqual(leaf.operations, ['add-component']);
  assert.deepEqual(leaf.applies, { jurisdictions: [] });
  assert.deepEqual(leaf.citations, [
    { source: 'Component Kit API v3 §4.2', accessed: '2026-08-01', authority: 'vendor-doc' },
  ]);
  // The time facets and typed edges land in LATER tickets — asserted absent so
  // this fixture cannot quietly acquire them ahead of the ticket that owns them.
  for (const later of ['verified', 'volatility', 'concepts', 'paths', 'relates']) {
    assert.equal(leaf[later], undefined, `${later} belongs to a later ticket`);
  }
});

test('every governed field is checked for registry membership, one finding each (golden)', () => {
  // One leaf, every governed field naming a value its registry does not carry.
  // The golden is the FULL finding set: an extra finding is over-reporting, a
  // missing one is a governed field silently ungoverned.
  const payload = json('validate.js', 1, '--root', FINDINGS);
  assert.deepEqual(pairs(payload).sort(), [
    ['missing-authority', 'citations[0].authority'],
    ['unminted-segment', 'facets.domain'],
    ['unregistered-value', 'applies.jurisdictions[0]'],
    ['unregistered-value', 'facets.anchor'],
    ['unregistered-value', 'facets.form'],
    ['unregistered-value', 'facets.stage'],
    ['unregistered-value', 'operations[0]'],
  ]);
  // Every finding names both the value and the registry file a steward opens.
  for (const f of payload.findings) {
    if (f.code === 'missing-authority') continue; // names the registry, has no value
    assert.match(f.message, /knowledge\/_registries\/[a-z-]+\.yaml|"knowledge\/[a-z-]+"/,
      `${f.code} at ${f.path} must name its registry`);
  }
});

test('the three new facets are DECLARATIONS, not new checker branches', () => {
  // The seam UCS-1148 built and this ticket consumes: form/anchor/stage are
  // three rows. If they had needed a code path, this assertion would be a lie
  // rather than a tautology — the point is that the checker never learned their
  // names.
  const declared = FACET_REGISTRIES['knowledge-leaf'];
  for (const field of ['facets.form', 'facets.anchor', 'facets.stage']) {
    const row = declared.find((r) => r.field === field);
    assert.ok(row, `${field} must be declared`);
    assert.equal(row.hierarchical, false, `${field} is a flat vocabulary`);
    assert.ok(Object.isFrozen(row));
  }
});

// -------------------------- AC2: draft stage, one predicate, two surfaces

test('a draft-stage leaf is downranked in resolver output (golden)', () => {
  const payload = json('resolve.js', 0, 'component', '--root', CLEAN);
  const entries = payload.results[0].knowledge;
  // Order IS the downrank: the draft leaf sorts below the verified one. A
  // demotion, never a filter — a draft leaf is still the best answer when it is
  // the only answer.
  assert.deepEqual(entries.map((k) => [k.id, k.stage, k.downranked]), [
    ['L-000117', 'verified', false],
    ['L-000213', 'draft', true],
  ]);
});

test('the SAME draft leaf yields an unknown-class preflight verdict (golden)', () => {
  const payload = json('preflight.js', 2, '--leaves', 'L-000117,L-000213', '--root', CLEAN);
  assert.deepEqual(payload['leaf-verdicts'].map((v) => [v.leaf, v.stage, v.verdict]), [
    ['L-000117', 'verified', 'trusted'],
    ['L-000213', 'draft', 'unknown'],
  ]);
  // An unknown verdict gates at 2 — a check that never ran is a blocking
  // defect, never a silent pass (PRD §5). Asserted by the expected exit above.
  assert.equal(payload.counts.unknown, 1);
  assert.equal(payload.ok, false);
});

test('resolver downrank and preflight verdict read ONE predicate — they cannot diverge', () => {
  // The structural guarantee behind the two goldens above. Both surfaces call
  // isPrePromotionStatus(leafStage(record)); neither spells `facets.stage` or
  // enumerates draft/proposed itself. So the vocabulary lives in one place and
  // a change moves both surfaces together or neither.
  const model = loadStores(CLEAN);
  const draft = model.leaves.get('L-000213');
  const verified = model.leaves.get('L-000117');
  assert.equal(leafStage(draft.record), 'draft');
  assert.equal(leafStage(verified.record), 'verified');
  assert.equal(isPrePromotionStatus(leafStage(draft.record)), true);
  assert.equal(isPrePromotionStatus(leafStage(verified.record)), false);

  // The predicate recognizes the concept lifecycle's spellings too — that
  // sharing is the whole point, not an accident of implementation.
  assert.equal(isPrePromotionStatus('proposed'), true);
  assert.equal(isPrePromotionStatus('active'), false);

  // A leaf declaring no stage is not pre-promotion, and a non-string stage
  // reads as null rather than being handed to the predicate raw: a `stage: 3`
  // that returned false would quietly promote the leaf its own defect should
  // have held back.
  assert.equal(leafStage({}), null);
  assert.equal(leafStage({ facets: { stage: 3 } }), null);
  assert.equal(isPrePromotionStatus(null), false);
});

test('a leaf with a quarantined-grade finding verdicts quarantined, not unknown', () => {
  // Evidence outranks stage: a leaf whose facets do not resolve is a defect to
  // fix, and reporting it as merely "unknown" would file a broken leaf under
  // the same verdict as an honest draft.
  // Named by accession, the one spelling `--leaves` takes (UCS-1147); this read
  // '900.1' while a leaf also answered to its notation.
  const payload = json('preflight.js', 1, '--leaves', 'L-000901', '--root', FINDINGS);
  const [verdict] = payload['leaf-verdicts'];
  assert.equal(verdict.verdict, 'quarantined');
  assert.equal(verdict.evidence.length, 7);
  assert.ok(verdict.evidence.every((e) => e.check === 'structural'),
    'a leaf carries no descriptor, so it has no value-check evidence');
});

test('--leaves names a leaf by its accession; a notation is an unknown id (exit 2)', () => {
  // REWRITTEN from "--leaves names a leaf by EITHER spelling". That test's
  // subject was the dual shape: a caller could name a leaf the way their
  // citation happened to spell it, because both spellings reached the same
  // record. UCS-1147 took the second one away, and this flag narrowed with the
  // rest of the surface rather than keeping a private convenience alias — a
  // selector that accepted a spelling no citation may use would be the alias
  // table growing back in one command's argument parser.
  const byAccession = json('preflight.js', 2, '--leaves', 'L-000213', '--root', CLEAN);
  assert.deepEqual(byAccession['leaf-verdicts'].map((v) => v.leaf), ['L-000213']);
  // Naming it twice is still ONE leaf, not two verdicts about nothing. The
  // de-duplication outlived the narrowing it was written for.
  const twice = json('preflight.js', 2, '--leaves', 'L-000213,L-000213', '--root', CLEAN);
  assert.equal(twice['leaf-verdicts'].length, 1);

  // The inversion, pinned where a caller meets it. The leaf EXISTS and still
  // carries "213.1" as its legacy display label — the selector simply does not
  // resolve labels, so this is an unknown id and a check that never ran, which
  // is exit 2 rather than an empty verdict list at exit 0 (PRD §5).
  const byNotation = runCli('preflight.js', '--leaves', '213.1', '--root', CLEAN, '--json');
  assert.equal(byNotation.status, 2, 'a notation selector names nothing, and must say so');
  assert.match(byNotation.stderr, /--leaves names id\(s\) not in the knowledge store: 213\.1/);

  const unknown = runCli('preflight.js', '--leaves', 'L-999999', '--root', CLEAN, '--json');
  assert.equal(unknown.status, 2, 'a verdict on a typo must never read as anything');
  assert.match(unknown.stderr, /not in the knowledge store/);
});

test('a degraded store reports the SAME leaf name and stage a healthy one would', () => {
  // The store-wide-failure path degrades every verdict to unknown without
  // selecting anything, so it cannot lean on selectLeaves to resolve the
  // caller's id. Both paths call leafIdentityOf, or a leaf would report with a
  // null stage on a broken store and with its real stage on a healthy one for a
  // reason that has nothing to do with the leaf.
  //
  // The id is the accession in both paths now (UCS-1147), which is a weaker
  // hazard than the one this test was written against — leafIdentityOf no
  // longer TRANSLATES a notation into an accession, it just answers whether the
  // store carries the leaf. It stays pinned because the two paths must still
  // agree, and agreeing is what they got wrong the first time.
  const healthy = json('preflight.js', 2, '--leaves', 'L-000213', '--root', CLEAN);
  assert.deepEqual(healthy['leaf-verdicts'].map((v) => [v.leaf, v.stage]), [['L-000213', 'draft']]);

  const dir = mkdtempSync(join(tmpdir(), 'uk-v2-degraded-'));
  try {
    cpSync(CLEAN, dir, { recursive: true });
    // Break the store LOADER-side: unparseable YAML is a parse-error
    // diagnostic, which is what degrades every verdict (a structural finding
    // would only quarantine the record it names).
    writeFileSync(join(dir, 'ontology/classes/100-feed.yaml'), 'entries: [oops\n');
    const degraded = json('preflight.js', 2, '--leaves', 'L-000213', '--root', dir);
    assert.equal(degraded['store-verdict'], 'unknown', 'the store must actually be broken');
    assert.deepEqual(degraded['leaf-verdicts'].map((v) => [v.leaf, v.stage, v.verdict]), [
      ['L-000213', 'draft', 'unknown'],
    ]);

    // And it de-duplicates by identity like the healthy path: one leaf named
    // twice is ONE verdict, not two rows a caller has to reconcile.
    const twice = json('preflight.js', 2, '--leaves', 'L-000213,L-000213', '--root', dir);
    assert.deepEqual(twice['leaf-verdicts'].map((v) => v.leaf), ['L-000213']);

    // An id that resolves to nothing keeps the caller's spelling — on a store
    // this broken the leaf may simply have failed to load — and two distinct
    // unresolved ids stay two rows rather than collapsing into one.
    const missing = json('preflight.js', 2, '--leaves', 'L-000900,L-000901', '--root', dir);
    assert.deepEqual(missing['leaf-verdicts'].map((v) => [v.leaf, v.stage]), [
      ['L-000900', null], ['L-000901', null],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Edit the clean fixture in a temp copy and validate it. */
function withEditedLeaf(replacements, expectStatus, assertions) {
  const dir = mkdtempSync(join(tmpdir(), 'uk-v2-edit-'));
  try {
    cpSync(CLEAN, dir, { recursive: true });
    const leaf = join(dir, 'knowledge/design-system/117.1-icon-component-sizing-quirks.md');
    let text = readFileSync(leaf, 'utf8');
    for (const [from, to] of replacements) {
      assert.ok(text.includes(from), `fixture no longer contains ${JSON.stringify(from)}`);
      text = text.replace(from, to);
    }
    writeFileSync(leaf, text);
    assertions(json('validate.js', expectStatus, '--root', dir), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a blank value on a field whose absence IS owned is one finding, not two', () => {
  // `authority: ""` is an omission wearing a string, and `missing-authority`
  // owns that field's absence (declared as `blankOwnedBy`). So membership
  // defers and the owning check reports alone — two findings on one path would
  // send an author looking for a second edit that does not exist.
  withEditedLeaf([['authority: vendor-doc', 'authority: ""']], 1, (payload) => {
    assert.deepEqual(pairs(payload), [['missing-authority', 'citations[0].authority']]);
  });
});

test('a blank governed FACET is a finding — an empty string never passes silently', () => {
  // The other half, and the one that matters more. No check owns the absence
  // of `facets.stage` or `facets.form`, so deferring a blank there would let an
  // empty string ungovern a governed field at exit 0 — a check that never ran
  // wearing a clean verdict (PRD §5). Whitespace-only is the same defect
  // wearing a wider disguise.
  withEditedLeaf([
    ['stage: verified', 'stage: ""'],
    ['form: reference', 'form: "   "'],
  ], 1, (payload) => {
    assert.deepEqual(pairs(payload).sort(), [
      ['unregistered-value', 'facets.form'],
      ['unregistered-value', 'facets.stage'],
    ]);
  });
});

test('only fields with an owning absence check may defer a blank', () => {
  // The declaration behind the asymmetry above. `blankOwnedBy` is a fact about
  // a field, so it lives in the table with the rest of them — and every value
  // it names must be a check this validator actually runs, or a field would
  // defer its blanks to a check that never reports.
  for (const row of FACET_REGISTRIES['knowledge-leaf']) {
    if (!row.blankOwnedBy) continue;
    assert.ok(CHECKS.includes(row.blankOwnedBy),
      `${row.field} defers blanks to ${row.blankOwnedBy}, which is not a check class`);
  }
  const deferring = FACET_REGISTRIES['knowledge-leaf']
    .filter((r) => r.blankOwnedBy).map((r) => r.field);
  assert.deepEqual(deferring, ['authority'], 'only citations[].authority has an owning check today');
});

test('a --concepts-only run is byte-identical to before: no leaf surface appears', () => {
  // The new flag must not change the shape of a run that did not ask for it.
  const payload = json('preflight.js', 0, '--concepts', 'K-102', '--root', CLEAN);
  assert.equal(payload.mode, 'concepts');
  assert.equal(payload['leaf-verdicts'], undefined);
  assert.equal(payload.verdicts.length, 1);
});

// ---------------- AC3: description retired, display prose derived

test('a leaf carrying the retired `description` fails as an unknown property (golden)', () => {
  // The sanctioned v2 break (D-021 major release). Retired rather than
  // deprecated: an authored one-liner is a second copy of the claim, and the
  // copy is what goes stale when the body is edited and the frontmatter is not.
  const leaf = load(readFileSync(
    join(CLEAN, 'knowledge/design-system/117.1-icon-component-sizing-quirks.md'), 'utf8',
  ).split('---')[1]);
  assert.equal(leaf.description, undefined, 'no shipped fixture may carry it');

  leaf.description = 'When components misbehave.';
  const result = validateStoreFile('knowledge-leaf', leaf);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.filter((e) => e.path === 'description').map((e) => e.code),
    ['unknown-property'],
  );
});

test('display prose is DERIVED: the excerpt is the body topic sentence (golden)', () => {
  const payload = json('resolve.js', 0, 'component', '--root', CLEAN);
  assert.deepEqual(payload.results[0].knowledge.map((k) => k.excerpt), [
    'Icons ship on a 24px grid, but the export step trims the transparent bounding box.',
    'First paint of a newly inserted component must complete within four hundred milliseconds or the canvas shows a skeleton.',
  ]);
  // And it reaches the human surface, which is where display prose is actually
  // read — the retired field had no renderer at all, so this is the first time
  // a leaf one-liner is shown anywhere.
  const human = runCli('resolve.js', 'component', '--root', CLEAN);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /Icons ship on a 24px grid, but the export step trims the transparent bounding box\./);
  assert.match(human.stdout, /\[draft — downranked\]/);
});

test('the excerpt deriver is literal about what a first sentence is', () => {
  // A clever extractor that guesses wrong is worse than a plain one that
  // occasionally returns a long line.
  assert.equal(firstSentence('One. Two.'), 'One.');
  // Hard-wrapped bodies: a sentence routinely spans lines, so the paragraph is
  // flattened before it is split.
  assert.equal(firstSentence('A sentence that\nwraps across lines. Next.'), 'A sentence that wraps across lines.');
  // A dotted token is not a sentence end — `§4.2` and `v3.` must not truncate.
  assert.equal(firstSentence('See Component Kit API v3.2 §4.2 for detail. Then stop.'),
    'See Component Kit API v3.2 §4.2 for detail.');
  // Markdown structure is not prose: headings, lists, quotes, and fences are
  // skipped until an actual paragraph turns up.
  assert.equal(firstSentence('# Title\n\n- a list item\n\nThe real opening. More.'), 'The real opening.');
  // Structure is skipped LINE by line, not block by block. A heading needs no
  // blank line after it, so `# Title\nProse` is ONE block whose first line is
  // structural — discarding the block would blank the excerpt for an entirely
  // ordinary body. Same for prose following a list item or a quote.
  assert.equal(firstSentence('# Title\nThe real opening. More.'), 'The real opening.');
  assert.equal(firstSentence('- item\nProse after list.'), 'Prose after list.');
  assert.equal(firstSentence('> quote\nProse after quote.'), 'Prose after quote.');
  // And prose stops AT structure rather than swallowing it, so an excerpt never
  // shows markup.
  assert.equal(firstSentence('Prose here\n- then a list item'), 'Prose here');
  // Fences are tracked as STATE, not matched as lines, and in BOTH spellings
  // (CommonMark allows ~~~ as well as ```). Skipping only the fence markers
  // would leave the code BETWEEN them looking like ordinary prose — which is
  // how `code();` ends up published as a leaf's excerpt.
  assert.equal(firstSentence('```\ncode();\n```\n\nThe prose. More.'), 'The prose.');
  assert.equal(firstSentence('~~~\ncode();\n~~~\n\nThe prose. More.'), 'The prose.');
  assert.equal(firstSentence('~~~\nx\n~~~\nProse right after.'), 'Prose right after.');
  assert.equal(firstSentence('Prose first.\n\n```\ncode();\n```'), 'Prose first.');
  assert.equal(firstSentence('~~~js\ncode();\n~~~'), null, 'a body that is only a fenced block has no prose');
  // An unclosed fence runs to the end of the body — the honest reading of a
  // malformed block, and it never leaves code in the excerpt.
  assert.equal(firstSentence('```\nunclosed code'), null);
  // A paragraph with no terminator IS the excerpt: returning null would blank
  // the surface rather than show what the author wrote.
  assert.equal(firstSentence('no terminator here'), 'no terminator here');
  // Nothing to derive from is null, never a crash or an empty string.
  assert.equal(firstSentence(''), null);
  assert.equal(firstSentence(undefined), null);
  assert.equal(firstSentence('## only a heading'), null);
});

// ------------------------------------- AC4: citation authority tiers

test('a citation with no authority tier is a finding (golden)', () => {
  const payload = json('validate.js', 1, '--root', FINDINGS);
  const finding = payload.findings.find((f) => f.code === 'missing-authority');
  assert.equal(finding.path, 'citations[0].authority');
  assert.equal(finding.severity, 'error');
  assert.match(finding.message, /how far this source can be trusted/);
  assert.match(finding.message, /knowledge\/authority-tiers/);
  assert.ok(CHECKS.includes('missing-authority'), 'reported as a check class on every run');
  // The message must not promise ranking. Tiers are governed as VOCABULARY
  // here: nothing in this engine compares two tiers or resolves a conflict
  // between citations, and conflict ranking arrives with the resolution
  // pipeline (UCS-1152). A finding that claimed otherwise would send an author
  // looking for behaviour that does not exist.
  assert.doesNotMatch(finding.message, /rank/i, 'the finding must not promise ranking this engine does not do');
});

test('no shipped prose claims the engine ranks conflicting citations', () => {
  // The overclaim guard. Requiring a tier now is what makes ranking possible
  // LATER — a tier nobody wrote down cannot be ranked retroactively — but the
  // documentation has to say that in the future tense, because a reader who
  // believes conflicts are already resolved will not check them by hand.
  const sites = [
    'payload/engine/commands/validate.js',
    'payload/templates/knowledge/_registries/authority-tiers.yaml',
    'tests/fixtures/structural-validator/frontmatter-v2/knowledge/_registries/authority-tiers.yaml',
    'payload/protocol/skills/kb-build.md',
  ];
  for (const rel of sites) {
    // Checked per PARAGRAPH, not per line: these are hard-wrapped comment
    // blocks, so "cannot be ranked retroactively" routinely spans two lines
    // and a line-based check would flag its own disclaimer.
    const text = readFileSync(join(root, rel), 'utf8');
    const paragraphs = text.split(/\n\s*\n|\n(?=\s*(?:\/\*\*|\*\/))/);
    for (const para of paragraphs) {
      if (!/\brank/i.test(para)) continue;
      const flat = para.replace(/\s+/g, ' ');
      // A paragraph may mention ranking only while placing it in the future or
      // denying it happens today.
      assert.match(
        flat,
        /UCS-1152|arrives with the resolution pipeline|cannot be ranked retroactively|lets a later|nothing compares|must not promise|would rank a retired/,
        `${rel} claims ranking as present behaviour: ${flat.trim().slice(0, 160)}`,
      );
    }
  }
});

test('a tier ABSENT from the registry is a separate finding from a tier omitted', () => {
  // Two codes because they send an author to two different edits: "you left it
  // out" versus "that tier does not exist". Neither is checked by the other —
  // the membership walk skips non-strings, which is exactly what an absent
  // field is.
  const payload = json('validate.js', 1, '--root', FINDINGS);
  const codes = new Set(payload.findings.map((f) => f.code));
  assert.ok(codes.has('missing-authority'));
  // The clean fixture proves the positive case: a minted tier is silent.
  assert.deepEqual(json('validate.js', 0, '--root', CLEAN).findings, []);
});

test('the tier requirement is opt-in: a store with no tiers registry is not nagged', () => {
  // UCS-1148's conduct one level up. A store with no authority-tiers registry
  // has no vocabulary to draw a tier from, so demanding one would fail every
  // leaf twice for a governance layer the store never opted into. Adding the
  // registry IS the opt-in, and it is the steward's to make.
  const legacy = fixture('clean'); // pre-v2 fixture: citations carry no tiers
  const model = loadStores(legacy);
  assert.equal(model.registries.has('knowledge/authority-tiers'), false);
  assert.deepEqual(json('validate.js', 0, '--root', legacy).findings, []);
});

// --------------------------------------------- AC5: provenance round-trips

test('provenance validates and round-trips into resolver output untouched (golden)', () => {
  const payload = json('resolve.js', 0, 'component', '--root', CLEAN);
  for (const entry of payload.results[0].knowledge) {
    assert.deepEqual(entry.provenance, { author: 'dimitri', 'skill-version': 'kb-build@2.0.0' },
      'carried verbatim — no registry governs provenance, so there is no judgement to apply');
  }
  // Absent provenance publishes null, never an omitted key: one result shape.
  const other = json('resolve.js', 0, 'asset', 'variant',
    '--root', join(root, 'tests/fixtures/resolver/store'));
  assert.equal(other.results[0].knowledge[0].provenance, null);
});

test('provenance travels through the validator untouched — recorded, never judged', () => {
  const model = loadStores(CLEAN);
  assert.deepEqual(model.leaves.get('L-000117').record.provenance, {
    author: 'dimitri', 'skill-version': 'kb-build@2.0.0',
  });
  // No governed-facet row claims it: provenance is a fact about how the entry
  // came to exist, not a vocabulary the store mints.
  const governed = FACET_REGISTRIES['knowledge-leaf'].map((r) => r.field);
  assert.ok(!governed.some((f) => f.startsWith('provenance')));
});

// --------------------------- AC6: the new registries ship, seeded or empty

test('the three new registry templates ship through the D-007 manifest', () => {
  const manifest = readFileSync(join(root, 'cli/kit.manifest.yaml'), 'utf8');
  for (const name of ['form', 'anchor', 'stage']) {
    assert.match(
      manifest,
      new RegExp(`from: templates/knowledge/_registries/${name}\\.yaml, to: knowledge/_registries/${name}\\.yaml`),
      `${name} registry must seed into the client's knowledge store, or it ships by omission`,
    );
  }
});

test('every shipped registry template validates and seeds EMPTY', () => {
  // Empty even for anchor/stage, whose vocabularies the kit fixes: a registry
  // value must cite a Decisions entry that RESOLVES, and a seeded repo's
  // decisions store is empty by design (D-001). Seeded values would hand every
  // client a broken ref on their first validation run.
  for (const name of ['form', 'anchor', 'stage']) {
    const file = join(root, 'payload/templates/knowledge/_registries', `${name}.yaml`);
    const doc = load(readFileSync(file, 'utf8'));
    assert.deepEqual(validateStoreFile('registry', doc), { ok: true, errors: [] }, name);
    assert.equal(doc.registry, name, 'the declared name must match the filename');
    assert.equal(doc.store, 'knowledge');
    assert.deepEqual(doc.values, [], `${name} must seed empty`);
  }
});

test('the kit-fixed vocabularies are documented in the templates that seed empty', () => {
  // A registry that ships empty but whose values are NOT the project's to
  // choose has to say so, or a steward mints a fourth truth anchor and only
  // finds out when the store model stops making sense.
  const read = (name) => readFileSync(
    join(root, 'payload/templates/knowledge/_registries', `${name}.yaml`), 'utf8');

  const anchor = read('anchor');
  assert.match(anchor, /D-003/, 'the anchor vocabulary cites the decision that fixed it');
  for (const value of ['artifact', 'world', 'team']) assert.match(anchor, new RegExp(value));

  const stage = read('stage');
  assert.match(stage, /isPrePromotionStatus/, 'the stage values are load-bearing on a named predicate');
  for (const value of ['draft', 'proposed', 'verified']) {
    assert.match(stage, new RegExp(`- value: ${value}`));
  }
  // THREE values, not four. A `deprecated` stage is deliberately NOT offered:
  // the concept lifecycle gives that word real semantics (§3.5 demotes its
  // findings to warnings) and no leaf surface implements the match, so minting
  // it here would rank a retired leaf above a draft one and read as `trusted` —
  // a vocabulary that looks governed and governs nothing. The template must say
  // so, rather than leaving the omission to be read as an oversight.
  assert.doesNotMatch(stage, /- value: deprecated/, 'no deprecated stage is offered');
  assert.match(stage, /THREE VALUES, NOT FOUR/, 'the omission is stated, not silent');

  // form is the opposite case and must NOT claim to be fixed: which forms a
  // project recognizes is a judgement about its own material, like domains.
  assert.match(read('form'), /Ships EMPTY/);
});

test('no shipped stage registry mints a value with no runtime semantics', () => {
  // The guard behind the decision above, over every stage registry in the repo:
  // a stage value is only legitimate if some surface acts on it. `draft` and
  // `proposed` drive the downrank/unknown-verdict path; `verified` is the
  // promoted state that path contrasts against. `deprecated` drives nothing.
  const stageRegistries = [
    'payload/templates/knowledge/_registries/stage.yaml',
    'tests/fixtures/structural-validator/frontmatter-v2/knowledge/_registries/stage.yaml',
    'tests/fixtures/structural-validator/frontmatter-v2-findings/knowledge/_registries/stage.yaml',
    'fixtures/ts-app/unknown-knowledge/knowledge/_registries/stage.yaml',
  ];
  for (const rel of stageRegistries) {
    const doc = load(readFileSync(join(root, rel), 'utf8'));
    const minted = (doc.values ?? []).map((v) => v.value);
    assert.deepEqual(
      minted.filter((v) => !['draft', 'proposed', 'verified'].includes(v)),
      [],
      `${rel} mints a stage no surface acts on`,
    );
  }
});
