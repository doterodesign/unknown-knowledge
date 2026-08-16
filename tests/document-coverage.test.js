/**
 * Document coverage map (UCS-1156) — one entry point, three input shapes, and
 * a map bounded by content richness rather than document length.
 *
 * What this file pins, and how each claim fails differently if it breaks:
 *
 *  1. ONE ENTRY POINT, THREE SHAPES, and a query is processed as a ONE-BLOCK
 *     DOCUMENT. The golden equivalence pair is the load-bearing test: if a
 *     query and its equivalent one-block document ever produce different
 *     joins, the document path has grown a second matcher — and the drift is
 *     invisible from the outside, because both return plausible results.
 *  2. THE MAP'S SHAPE: per-section joins with locators, a gather rollup with
 *     verdicts and scope-mismatch flags, ranked candidates each carrying a
 *     section address. Broken, an agent cannot open a section just-in-time and
 *     the map's whole economy (context cost = map + what you open) collapses
 *     back to reading the document.
 *  3. SALIENCE IS PINNED AND REPRODUCIBLE — emphasis, Title-Case phrases, and
 *     the size-stepped repetition threshold, each demonstrated by a fixture,
 *     with known vocabulary, stopwords, and suppressions subtracted. Broken,
 *     the candidate list stops being re-derivable from the document, and the
 *     minting decisions it feeds stop being auditable.
 *  4. A SUPPRESSED TERM is excluded from document candidates exactly as from
 *     reverse-audit terms, and REPORTED as suppressed. Broken in the silent
 *     direction, a steward cannot tell a term they settled from one the
 *     extractor never found — and those demand opposite conduct.
 *  5. RESUBMISSION DEDUPES on the content hash, machine-visibly. Broken, the
 *     pipeline reprocesses identical submissions and nothing downstream can
 *     tell that it has seen this document before.
 *  6. OUTPUT GROWS WITH RICHNESS, NOT LENGTH. Asserted on a fixture PAIR, which
 *     is the only honest way to assert it: a single document's map size means
 *     nothing without something to compare it to.
 *
 * Tested through the CLI seam — exit codes and output ARE the contract — with
 * direct imports for the pure functions whose thresholds are pinned tables.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADDRESS_CAP, PREAMBLE_ADDRESS, REPETITION_STEPS, repetitionThreshold, sectionsOf,
} from '../payload/engine/lib/coverage.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) => join(root, 'tests/fixtures', name);

/** The scenario store the joins run against — the query-decomposition fixture. */
const STORE = fixture('resolver-v2');
/** The sample documents. Kept OUTSIDE the store so no loader walk can see them. */
const DOCS = fixture('coverage-docs');

// The injected date every verdict here is measured against (D-012). Pinned, so
// these expectations hold forever — the engine never reads the wall clock.
const TODAY = '2026-08-16';

function runCli(...args) {
  return spawnSync(process.execPath, [join(root, 'payload/engine/resolve.js'), ...args], { encoding: 'utf8' });
}

/** Resolve a document into its coverage map, asserting a clean exit. */
function coverage(document, { store = STORE, today = TODAY } = {}) {
  const r = runCli('--doc', document, '--root', store, '--today', today, '--json');
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout).map;
}

/** Resolve a query, asserting a clean exit. */
function query(text, { store = STORE, today = TODAY } = {}) {
  const r = runCli(text, '--root', store, '--today', today, '--json');
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const tempDir = () => mkdtempSync(join(tmpdir(), 'uk-coverage-'));

// ---------------------------------------------------------------------------
// 1. ONE ENTRY POINT, THREE INPUT SHAPES
// ---------------------------------------------------------------------------

test('one entry point accepts all three input shapes', () => {
  // A query.
  const q = runCli('add a new sport', '--root', STORE, '--today', TODAY, '--json');
  assert.equal(q.status, 0);
  assert.equal(JSON.parse(q.stdout).mode, 'query');

  // Repo paths.
  const p = runCli('--paths', 'src/registry/sports.ts', '--root', STORE, '--today', TODAY, '--json');
  assert.equal(p.status, 0);
  assert.equal(JSON.parse(p.stdout).mode, 'paths');

  // A document.
  const d = runCli('--doc', join(DOCS, 'launch-plan.md'), '--root', STORE, '--today', TODAY, '--json');
  assert.equal(d.status, 0);
  assert.equal(JSON.parse(d.stdout).mode, 'doc');
});

test('GOLDEN: a query and its equivalent one-block document produce IDENTICAL joins', () => {
  // The size-invariance claim, made falsifiable. A query is processed as a
  // one-block document through the same `joinText`, so these must agree on
  // every axis AND on the scores — not merely overlap.
  const text = 'add a new sport for the new jersey launch';
  const dir = tempDir();
  const doc = join(dir, 'one-block.txt');
  writeFileSync(doc, text);

  const asQuery = query(text);
  const asDocument = coverage(doc);

  // A one-block document has exactly one section, and its joins are the query's.
  assert.equal(asDocument.sections.length, 1);
  const section = asDocument.sections[0];

  assert.deepEqual(
    section.joins.operations,
    asQuery.decomposition.operations.map((o) => o.value),
    'the verb axis must join identically',
  );
  assert.deepEqual(
    section.joins.concepts,
    asQuery.decomposition.concepts.map((c) => c.id),
    'the noun axis must join identically',
  );
  assert.deepEqual(
    section.joins.jurisdictions,
    asQuery.decomposition.jurisdictions.map((j) => j.value),
    'the place axis must join identically',
  );
  assert.deepEqual(
    section.joins.leaves,
    asQuery.leaves.map((l) => l.id ?? l.notation),
    'the same leaves, in the same order',
  );

  // The SCORES too. Two matchers could reach the same leaves by different
  // routes and rank them differently; identical scores is what says the same
  // signals fired.
  assert.deepEqual(
    asDocument.gather.map((g) => [g.id, g.score]),
    asQuery.leaves.map((l) => [l.id, l.score]),
    'identical leaves AND identical scores — one pipeline, not two that agree',
  );
});

// ---------------------------------------------------------------------------
// 2. THE COVERAGE MAP'S SHAPE
// ---------------------------------------------------------------------------

test('GOLDEN: the coverage map has the prototype\'s shape', () => {
  const map = coverage(join(DOCS, 'launch-plan.md'));

  // Provenance: the adapter that produced the IR, and the content hash.
  assert.equal(map.adapter, 'md@1');
  assert.match(map.hash, /^fnv1a64:[0-9a-f]{16}$/);
  assert.equal(typeof map.ir.blocks, 'number');
  assert.equal(typeof map.ir.sections, 'number');
  assert.equal(map.ir['repetition-threshold'], repetitionThreshold(map.ir.blocks));

  // PER-SECTION JOINS, each with a locator usable for a just-in-time read.
  assert.ok(map.sections.length > 0);
  for (const section of map.sections) {
    assert.equal(typeof section.section, 'string');
    assert.equal(typeof section.locator.line, 'number');
    assert.equal(typeof section.locator.endLine, 'number');
    assert.ok(section.locator.endLine >= section.locator.line);
    // Every join axis is a STABLE KEY that may be empty, never an omitted one.
    for (const axis of ['operations', 'concepts', 'jurisdictions', 'leaves']) {
      assert.ok(Array.isArray(section.joins[axis]), `joins.${axis} must always be present`);
    }
    assert.ok(Array.isArray(section.candidates));
  }

  // THE GATHER ROLLUP: unique leaves, verdicts applied, scope mismatch flagged.
  assert.ok(map.gather.length > 0);
  const ids = map.gather.map((g) => g.id);
  assert.deepEqual(ids, [...new Set(ids)], 'a leaf reached from four sections is ONE entry');
  for (const hit of map.gather) {
    assert.equal(typeof hit.verdict, 'string');
    assert.equal(typeof hit.file, 'string');
    assert.ok(Array.isArray(hit.sections) && hit.sections.length > 0, 'where it was reached is never lost');
    // A stable key that may be null.
    assert.ok(hit['scope-mismatch'] === null || typeof hit['scope-mismatch'] === 'string');
  }

  // The Malta leaf is reached by a document scoped to New Jersey, and the
  // mismatch is FLAGGED rather than the leaf being filtered away: "this
  // constraint is for another regulator" is a finding, not an absence.
  const malta = map.gather.find((g) => g.id === 'L-000190');
  assert.ok(malta, 'the out-of-scope leaf is still published');
  assert.match(malta['scope-mismatch'], /malta/);
  assert.match(malta['scope-mismatch'], /new-jersey/);

  // Time verdicts travel from the shared verdict module, demotions and all.
  const stale = map.gather.find((g) => g.id === 'L-000213');
  assert.equal(stale.verdict, 'stale');
  assert.deepEqual(stale.demotions.map((d) => d.reason).sort(), ['stage', 'time']);

  // RANKED CANDIDATES, each carrying a section address for a JIT read.
  assert.ok(map['candidates-ranked'].length > 0);
  const addresses = new Set(map.sections.map((s) => s.section));
  for (const candidate of map['candidates-ranked']) {
    assert.ok(candidate.sections.length > 0, 'every candidate carries a section address');
    for (const address of candidate.sections) {
      assert.ok(addresses.has(address), `candidate address ${address} must name a mapped section`);
    }
  }
});

test('a section locator addresses the lines the section actually occupies', () => {
  // The locator is only worth carrying if opening it shows the content the map
  // attributed to it — otherwise "read the section just-in-time" sends the
  // reader to the wrong lines, which is worse than no locator at all.
  const map = coverage(join(DOCS, 'launch-plan.md'));
  const source = readFileSync(join(DOCS, 'launch-plan.md'), 'utf8').split('\n');
  for (const section of map.sections) {
    if (section.section === PREAMBLE_ADDRESS) continue;
    const heading = source[section.locator.line - 1];
    assert.match(heading, /^#{1,6}\s/, 'a section locator starts at its heading line');
    assert.ok(
      heading.includes(section.section),
      `line ${section.locator.line} should carry the address "${section.section}", got "${heading}"`,
    );
  }
});

test('sections: a heading opens one, and preamble content is its own section', () => {
  const sections = sectionsOf([
    { kind: 'paragraph', text: 'Before any heading.', locator: { line: 1, endLine: 1 } },
    { kind: 'heading', text: 'First', locator: { line: 3, endLine: 3 }, level: 1 },
    { kind: 'paragraph', text: 'Under first.', locator: { line: 4, endLine: 4 } },
    { kind: 'heading', text: 'Second', locator: { line: 6, endLine: 6 }, level: 1 },
  ]);
  assert.deepEqual(sections.map((s) => s.address), [PREAMBLE_ADDRESS, 'First', 'Second']);
  // The preamble is NOT merged into the first heading's section: its lines are
  // its own, and a locator that claimed otherwise would misaddress the reader.
  assert.deepEqual(
    sections.map((s) => [s.line, s.endLine]),
    [[1, 1], [3, 4], [6, 6]],
  );
});

test('sections nest: a subsection\'s lines are inside its parent\'s range', () => {
  // Nesting is what makes the parent's locator honest — an agent opening the
  // `#` section genuinely sees the `##` content the map attributed to it.
  const sections = sectionsOf([
    { kind: 'heading', text: 'Parent', locator: { line: 1, endLine: 1 }, level: 1 },
    { kind: 'heading', text: 'Child', locator: { line: 3, endLine: 3 }, level: 2 },
    { kind: 'paragraph', text: 'Under child.', locator: { line: 4, endLine: 4 } },
    { kind: 'heading', text: 'Sibling', locator: { line: 6, endLine: 6 }, level: 1 },
  ]);
  const parent = sections.find((s) => s.address === 'Parent');
  const child = sections.find((s) => s.address === 'Child');
  assert.ok(parent.line <= child.line && parent.endLine >= child.endLine,
    'the child\'s range sits inside the parent\'s');
  const sibling = sections.find((s) => s.address === 'Sibling');
  assert.ok(sibling.line > parent.endLine, 'a same-level heading closes the previous section');
});

// ---------------------------------------------------------------------------
// 3. PINNED SALIENCE
// ---------------------------------------------------------------------------

test('GOLDEN: salience — emphasis, Title-Case, and size-stepped repetition', () => {
  const map = coverage(join(DOCS, 'launch-plan.md'));
  const byTerm = new Map(map['candidates-ranked'].map((c) => [c.term, c]));

  // EMPHASIS: `**Provisional Market Ladder**` is marked up by the author, and
  // the markers survive `adapt()` (md@1 flattens whitespace, never markup), so
  // no adapter change was needed to see them.
  const emphasized = byTerm.get('provisional market ladder');
  assert.ok(emphasized, 'the emphasized phrase is a candidate');
  assert.ok(emphasized.signatures.includes('emphasis'), 'and it is attributed to the emphasis signature');

  // TITLE-CASE: "Quiet Period" is never emphasized in the fixture — it is a
  // multi-word Title-Case phrase and nothing else.
  const titled = byTerm.get('quiet period');
  assert.ok(titled, 'the Title-Case phrase is a candidate');
  assert.deepEqual(titled.signatures, ['title-case'], 'reached by Title-Case alone');

  // A sentence-initial determiner does not fragment a term into two candidates.
  assert.ok(!byTerm.has('the quiet period'), '"The Quiet Period" folds into "quiet period"');

  // REPETITION: the threshold is the pinned step function of document size, and
  // it is PUBLISHED so a reader can re-derive the candidate list.
  assert.equal(map.ir['repetition-threshold'], repetitionThreshold(map.ir.blocks));
  const repeated = map['candidates-ranked'].filter((c) => c.signatures.includes('repetition'));
  for (const candidate of repeated) {
    assert.ok(candidate.count >= map.ir['repetition-threshold'],
      `${candidate.term} cleared the threshold`);
  }
});

test('the repetition threshold is a pinned STEP FUNCTION of document size', () => {
  // Spelled as a table so a steward can re-derive a threshold by reading one
  // row, without evaluating an expression.
  assert.deepEqual(
    REPETITION_STEPS.map((s) => [s.maxBlocks, s.threshold]),
    [[8, 2], [24, 3], [120, 4], [400, 6], [Infinity, 8]],
  );
  // The steps are monotonic — a longer document never demands FEWER repeats.
  const thresholds = REPETITION_STEPS.map((s) => s.threshold);
  assert.deepEqual(thresholds, [...thresholds].sort((a, b) => a - b));

  assert.equal(repetitionThreshold(1), 2);
  assert.equal(repetitionThreshold(8), 2);
  assert.equal(repetitionThreshold(9), 3);
  assert.equal(repetitionThreshold(24), 3);
  assert.equal(repetitionThreshold(25), 4);
  assert.equal(repetitionThreshold(120), 4);
  assert.equal(repetitionThreshold(400), 6);
  assert.equal(repetitionThreshold(10000), 8);
});

test('known vocabulary, stopwords, and code blocks are SUBTRACTED from candidates', () => {
  const dir = tempDir();
  const doc = join(dir, 'subtraction.md');
  writeFileSync(doc, [
    '# Subtraction check',
    '',
    // `sport` and `settlement` are governed leaf terms; `Sport` is a concept
    // term. A phrase built only from known words is a recombination, not new
    // vocabulary — the store can already reach it.
    'The **Sport Settlement** pairing is entirely known vocabulary.',
    'Sport sport sport sport sport settlement settlement settlement settlement.',
    '',
    // Stopwords never become candidates however often they appear.
    'The the the the the of of of of of with with with with with.',
    '',
    // Code is content no lexicon should tokenize as prose.
    '```',
    'const Widget Factory = new Widget Factory();',
    'widget widget widget widget widget widget',
    '```',
  ].join('\n'));

  const map = coverage(doc);
  const terms = map['candidates-ranked'].map((c) => c.term);
  assert.ok(!terms.includes('sport settlement'), 'a phrase of only known words is not new vocabulary');
  assert.ok(!terms.some((t) => ['the', 'of', 'with'].includes(t)), 'stopwords are never candidates');
  assert.ok(!terms.includes('widget'), 'code-block content is not scanned as prose');
  assert.ok(!terms.includes('widget factory'), 'nor are Title-Case phrases inside code');
});

test('long-but-redundant repetition never becomes a candidate — richness, not length', () => {
  // The concentration rule, tested directly: boilerplate repeated once per
  // section clears any doc-wide count threshold in a long enough document, and
  // must still not be minted. Adding another identical section raises the count
  // and the section count together, so it never becomes concentrated.
  const map = coverage(join(DOCS, 'long-redundant.md'));
  const terms = map['candidates-ranked'].map((c) => c.term);
  for (const boilerplate of ['clean', 'manual', 'documented', 'required', 'nothing']) {
    assert.ok(!terms.includes(boilerplate),
      `"${boilerplate}" appears once in each of many sections — spread, not stressed`);
  }
});

// ---------------------------------------------------------------------------
// 4. SUPPRESSION — exactly as for reverse-audit terms
// ---------------------------------------------------------------------------

test('GOLDEN: a suppressed term is excluded from candidates and REPORTED as suppressed', () => {
  const dir = tempDir();
  const store = join(dir, 'store');
  cpSync(STORE, store, { recursive: true });
  const document = join(DOCS, 'launch-plan.md');

  // The SAME entry grammar the reverse audit uses — { term, sourcePath, reason,
  // date }, exact match. One grammar, so a steward writes one kind of entry.
  writeFileSync(join(store, 'suppressions.yaml'), [
    '- term: quiet period',
    `  sourcePath: ${document}`,
    "  reason: The trading team's informal name for an existing window; not new vocabulary.",
    '  date: "2026-08-16"',
  ].join('\n'));

  const before = coverage(document);
  assert.ok(before['candidates-ranked'].some((c) => c.term === 'quiet period'));
  assert.deepEqual(before.suppressed, [], 'nothing suppressed without an entry');

  const after = coverage(document, { store });
  assert.ok(
    !after['candidates-ranked'].some((c) => c.term === 'quiet period'),
    'the suppressed term leaves the candidate list',
  );
  // REPORTED, never silently absent — the audit's contract. A term missing from
  // a list is indistinguishable from one the extractor never found, and the two
  // demand opposite conduct.
  const suppressed = after.suppressed.find((c) => c.term === 'quiet period');
  assert.ok(suppressed, 'and is reported in the suppressed list');
  assert.ok(suppressed.count > 0, 'carrying the evidence that produced it');
  assert.ok(suppressed.sections.length > 0, 'and its section addresses');
});

test('suppression FAILS OPEN: a malformed file suppresses nothing and says so', () => {
  const dir = tempDir();
  const store = join(dir, 'store');
  cpSync(STORE, store, { recursive: true });
  writeFileSync(join(store, 'suppressions.yaml'), 'not: a list\n');

  const map = coverage(join(DOCS, 'launch-plan.md'), { store });
  assert.ok(map['candidates-ranked'].some((c) => c.term === 'quiet period'),
    'a broken suppressions file must never silence a candidate');
  assert.ok(map['suppression-warnings']?.length, 'and the breakage is reported, never silent');
});

// ---------------------------------------------------------------------------
// 5. IDEMPOTENCE VIA CONTENT HASH
// ---------------------------------------------------------------------------

test('GOLDEN: resubmitting byte-identical content dedupes via content hash', () => {
  const document = join(DOCS, 'launch-plan.md');
  const first = coverage(document);
  const second = coverage(document);

  // Machine-visible: the hash IS the dedupe key, carried in the output.
  assert.equal(first.hash, second.hash);
  assert.match(first.hash, /^fnv1a64:/);
  // And the whole map is byte-identical, which is the stronger claim — dedupe
  // is a property a consumer can check by comparing one field, and the rest of
  // the map cannot disagree with it.
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  // The hash is of the CONTENT, not the path: the same bytes submitted under a
  // different name are the same submission.
  const dir = tempDir();
  const copy = join(dir, 'renamed.md');
  cpSync(document, copy);
  const renamed = coverage(copy);
  assert.equal(renamed.hash, first.hash, 'identical bytes dedupe regardless of filename');

  // One byte different is a different submission.
  const edited = join(dir, 'edited.md');
  writeFileSync(edited, `${readFileSync(document, 'utf8')}\nOne more line.\n`);
  assert.notEqual(coverage(edited).hash, first.hash);
});

// ---------------------------------------------------------------------------
// 6. RICHNESS, NOT LENGTH
// ---------------------------------------------------------------------------

test('GOLDEN: a long redundant document yields a SMALLER map than a short rich one', () => {
  const redundant = coverage(join(DOCS, 'long-redundant.md'));
  const rich = coverage(join(DOCS, 'short-rich.md'));

  // The premise: the redundant document really is the longer one. Without this,
  // the comparison below proves nothing.
  assert.ok(
    redundant.ir.blocks > rich.ir.blocks * 2,
    `the redundant document must be substantially longer (${redundant.ir.blocks} vs ${rich.ir.blocks} blocks)`,
  );

  // The claim: its map is nonetheless smaller, on every measure that matters.
  assert.ok(
    JSON.stringify(redundant).length < JSON.stringify(rich).length,
    `serialized map: redundant ${JSON.stringify(redundant).length} bytes should be under `
    + `rich ${JSON.stringify(rich).length}`,
  );
  assert.ok(
    redundant.sections.length < rich.sections.length,
    `mapped sections: redundant ${redundant.sections.length} < rich ${rich.sections.length}`,
  );
  assert.ok(
    redundant['candidates-ranked'].length < rich['candidates-ranked'].length,
    'the rich document introduces more vocabulary',
  );
  assert.ok(
    redundant.gather.length < rich.gather.length,
    'the rich document reaches more governed knowledge',
  );
});

test('sections with identical coverage FOLD, keeping every address openable', () => {
  const map = coverage(join(DOCS, 'long-redundant.md'));
  const folded = map.sections.find((s) => s['repeats-count'] > 0);
  assert.ok(folded, 'the repeated weekly sections fold into one entry');
  // Folding drops redundancy, never evidence: the count is exact, and each
  // retained repeat keeps its own address and locator so an agent can open it.
  assert.ok(folded['repeats-count'] >= folded.repeats.length);
  for (const repeat of folded.repeats) {
    assert.equal(typeof repeat.section, 'string');
    assert.equal(typeof repeat.locator.line, 'number');
  }
  // Capped, so the fold cannot reintroduce length-dependence.
  assert.ok(folded.repeats.length <= ADDRESS_CAP);
});

test('address lists are CAPPED, with the overflow reported as an exact count', () => {
  // The one part of the map that would otherwise grow with length.
  const map = coverage(join(DOCS, 'long-redundant.md'));
  for (const candidate of map['candidates-ranked']) {
    assert.ok(candidate.sections.length <= ADDRESS_CAP);
    assert.equal(typeof candidate['sections-more'], 'number');
  }
  for (const hit of map.gather) {
    assert.ok(hit.sections.length <= ADDRESS_CAP);
    assert.equal(typeof hit['sections-more'], 'number');
  }
});

// ---------------------------------------------------------------------------
// DETERMINISM AND THE EXIT CONTRACT
// ---------------------------------------------------------------------------

test('the map is byte-identical across runs and across store authoring order', () => {
  const document = join(DOCS, 'launch-plan.md');
  const a = coverage(document);
  const b = coverage(document);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'no timestamps, no enumeration order');

  // The same store with every declaration order changed. Identical content,
  // different authoring order: the engine must not be able to tell them apart.
  const reordered = coverage(document, { store: fixture('resolver-v2-reordered') });
  assert.equal(
    JSON.stringify(a.sections), JSON.stringify(reordered.sections),
    'reordering the store must not move a single byte of the coverage map',
  );
  assert.equal(JSON.stringify(a.gather), JSON.stringify(reordered.gather));
  assert.equal(JSON.stringify(a['candidates-ranked']), JSON.stringify(reordered['candidates-ranked']));
});

test('a run without --today says its verdicts were SKIPPED, never silently fresh', () => {
  const r = runCli('--doc', join(DOCS, 'launch-plan.md'), '--root', STORE, '--json');
  assert.equal(r.status, 0);
  const payload = JSON.parse(r.stdout);
  assert.match(payload['time-check'], /skipped/);
  // A check that never ran is never a silent pass: the leaves say so too.
  for (const hit of payload.map.gather) assert.equal(hit.verdict, 'skipped');
});

test('an unsupported format exits 2 with the adapter conduct, and emits NO map', () => {
  const dir = tempDir();
  const doc = join(dir, 'plan.docx');
  writeFileSync(doc, 'binary-ish');
  const r = runCli('--doc', doc, '--root', STORE, '--today', TODAY, '--json');
  // Exit 2: a parse that never ran is a failure, never a silent partial. Never
  // exit 1 — the resolver emits no findings.
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '', 'nothing on stdout: a caller piping it gets no map, not a truncated one');
  assert.match(r.stderr, /no format adapter for '\.docx'/);
  assert.match(r.stderr, /conduct:/);
  assert.match(r.stderr, /author an adapter/);
});

test('an unreadable document exits 2 — a map that never ran is a failure', () => {
  const r = runCli('--doc', join(tempDir(), 'absent.md'), '--root', STORE, '--today', TODAY);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
});

test('the three input shapes are alternatives — two at once is a usage error', () => {
  const both = runCli('--doc', join(DOCS, 'launch-plan.md'), 'add a sport', '--root', STORE);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /exactly one input shape/);

  const docAndPaths = runCli('--doc', join(DOCS, 'launch-plan.md'), '--paths', 'src/registry/sports.ts', '--root', STORE);
  assert.equal(docAndPaths.status, 2);
  assert.match(docAndPaths.stderr, /exactly one input shape/);
});

test('the human surface carries the map\'s substance, not just its counts', () => {
  const r = runCli('--doc', join(DOCS, 'launch-plan.md'), '--root', STORE, '--today', TODAY);
  assert.equal(r.status, 0);
  const out = r.stdout;
  assert.match(out, /adapter: md@1/);
  assert.match(out, /hash: fnv1a64:/);
  assert.match(out, /coverage by section:/);
  assert.match(out, /gather rollup:/);
  // The locator is what makes a just-in-time read possible; it must be on the
  // human surface too, or the reader cannot act on the map without --json.
  assert.match(out, /L\d+-\d+/);
  assert.match(out, /scope-mismatch:/);
  assert.match(out, /candidates \(ranked/);
});

test('a txt document degrades structure but not process', () => {
  // No headings means ONE section covering the document — the honest answer.
  // The map's structure degrades with the input's; the process is identical,
  // and no section boundaries are invented that an editor would not show.
  const dir = tempDir();
  const doc = join(dir, 'plain.txt');
  writeFileSync(doc, [
    'We plan to add a new sport for the new jersey launch.',
    '',
    'Settlement rounding is unchanged this quarter.',
  ].join('\n'));

  const map = coverage(doc);
  assert.equal(map.adapter, 'txt@1');
  assert.equal(map.sections.length, 1, 'no headings: one section, never invented windows');
  assert.equal(map.sections[0].section, PREAMBLE_ADDRESS);
  // The joins still fire — the process is identical.
  assert.ok(map.sections[0].joins.operations.includes('add-sport'));
  assert.ok(map.gather.length > 0);
});
