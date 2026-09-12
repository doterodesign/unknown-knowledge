/**
 * Query decomposition (UCS-1152) — structured joins, scope exclusion with
 * reasons, near-miss, and residue.
 *
 * What this file pins, and how each claim fails differently if it breaks:
 *
 *  1. A VERB-SHAPED ask joins the operations registry and reaches the leaves
 *     that declared the operation, with NO noun guessing. Broken, the resolver
 *     silently falls back to term matching and "add a token" returns whatever
 *     happens to say the word — a plausible answer with no join behind it,
 *     which is the failure mode hardest to notice from the outside.
 *  2. SCOPE EXCLUSION is published with its reason. Broken, an out-of-scope
 *     leaf is merely absent — and "no knowledge about this" and "the knowledge
 *     is for another jurisdiction" demand opposite conduct from the reader.
 *  3. RANKING IS REPRODUCIBLE: every leaf publishes the signals that scored it,
 *     and they sum to the published score. Broken, a ranking becomes an opaque
 *     number nobody can check, and a scoring regression is invisible until a
 *     human notices bad results months later.
 *  4. RESIDUE is exactly the unconsumed non-stopword tokens, carried with the
 *     context that DID resolve. Broken in the over-consuming direction, real
 *     gaps stop being reported and the store stops learning; broken in the
 *     under-consuming direction, every query files noise findings.
 *  5. ZERO RESOLUTION exits 0 with an explicit empty result and fallback
 *     conduct IN THE PAYLOAD. Broken, an agent cannot tell a silent miss from
 *     a failure, which is the one distinction the exit contract exists to make.
 *
 * Tested through the CLI seam — exit codes and output ARE the contract — with
 * direct imports for the pure functions and for asserting the scoring table is
 * DERIVED rather than restated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAF_SIGNALS, leafScore } from '../payload/engine/lib/scoring.js';
import {
  STOPWORDS, phraseHit, phraseOverlap, tokenize, valuePhrases,
} from '../payload/engine/lib/decomposition.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) => join(root, 'tests/fixtures', name);

/** The query-decomposition scenario store — verb/noun/place vocabularies populated. */
const STORE = fixture('resolver-v2');

/**
 * The same store with every declaration order changed — catalog rows, registry
 * values, ontology entries, and the arrays inside the leaves. Identical content,
 * different authoring order: the engine must not be able to tell them apart.
 */
const REORDERED = fixture('resolver-v2-reordered');

// The injected date every verdict here is measured against (D-012). Pinned, so
// these expectations hold forever — the engine never reads the wall clock.
const TODAY = '2026-08-16';

function runCli(command, ...args) {
  return spawnSync(process.execPath, [join(root, 'payload/engine', command), ...args], { encoding: 'utf8' });
}

function json(command, expectStatus, ...args) {
  const r = runCli(command, ...args, '--json');
  assert.equal(r.status, expectStatus, `expected exit ${expectStatus}, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Resolve a query against the scenario store at the pinned date. */
const resolve = (query) => json('resolve.js', 0, query, '--root', STORE, '--today', TODAY);

/** One published leaf by accession, asserted present. */
function leaf(payload, id) {
  const found = payload.leaves.find((l) => l.id === id);
  assert.ok(found, `leaf ${id} is not among ${payload.leaves.map((l) => l.id).join(', ') || '(none)'}`);
  return found;
}

// ------------------------------------------- AC1: the verb-shaped ask (golden)

test('golden: a verb-shaped ask joins the operations registry, no noun guessing', () => {
  const payload = resolve('add a token');

  // The VERB axis landed in a minted registry value. `matched` names the
  // spelling that carried it — "add token" is the identifier `add-token` with
  // its separator opened, which is reading the identifier's own structure, not
  // fuzzy matching.
  assert.deepEqual(payload.decomposition.operations, [
    { value: 'add-token', matched: 'add token', tokens: ['add', 'token'] },
  ]);

  // The NOUN axis joined the ontology independently. `match` is null because
  // the pre-1152 whole-query ladder does NOT consider "add a token" a query for
  // the concept "Token" — the phrase test reached it, and the two joins are
  // deliberately kept apart so the published concept ranking is untouched.
  assert.deepEqual(payload.decomposition.concepts, [
    { id: 'K-101', term: 'Token', match: null, tokens: ['token'] },
  ]);

  // No place was named, so no scope is asserted and nothing can be out of it.
  assert.deepEqual(payload.decomposition.jurisdictions, []);

  // The recipe leaf is reached by all three joins and outranks the checklist
  // leaf, which only declares the operation. That ordering IS the acceptance
  // criterion: the leaf gathering the recipe, the constraint, and the ontology
  // concept comes first, and it got there by declared structure rather than by
  // saying the query's words more often.
  assert.deepEqual(
    payload.leaves.map((l) => [l.id, l.score, l.signals.map((s) => `${s.signal}:${s.via}`)]),
    [
      ['L-000102', 6, ['operation:add-token', 'concept:K-101', 'term:token']],
      ['L-000213', 4, ['operation:add-token', 'term:token']],
    ],
  );

  // The whole ask resolved: "a" is a stopword, "add" and "token" were both
  // consumed by joins. Residue is empty, and the store is entitled to say so.
  assert.deepEqual(payload.decomposition.residue, []);
});

test('the operation join is STRUCTURAL — it reaches a leaf whose text never says the verb', () => {
  // Fixture invariant: L-000213 declares `add-token` but its `terms` do not
  // contain the word "add". If a future fixture edit added it, this test would
  // pass for the wrong reason — so the invariant is asserted, not assumed.
  const payload = resolve('add a token');
  const checklist = leaf(payload, 'L-000213');
  assert.ok(
    checklist.signals.some((s) => s.signal === 'operation' && s.via === 'add-token'),
    'L-000213 must be reached by its declared operation',
  );
  assert.ok(
    !checklist.signals.some((s) => s.signal === 'term' && /add/.test(s.via)),
    'fixture invariant broken: L-000213 must not match the verb by term text',
  );
});

test('only the operation the ask NAMED scores, not every operation a leaf declares', () => {
  // L-000213 declares both `add-token` and `retire-token`. An ask that names
  // one must score it on that one alone — crediting a leaf for every verb it
  // happens to declare would make the score a property of the leaf rather than
  // of the match, and two leaves with different declared breadth would rank by
  // how much they claim instead of by how well they answer.
  const retiring = resolve('retire a token');
  assert.deepEqual(retiring.decomposition.operations.map((o) => o.value), ['retire-token']);
  assert.deepEqual(
    leaf(retiring, 'L-000213').signals.filter((s) => s.signal === 'operation').map((s) => s.via),
    ['retire-token'],
  );

  const adding = resolve('add a token');
  assert.deepEqual(
    leaf(adding, 'L-000213').signals.filter((s) => s.signal === 'operation').map((s) => s.via),
    ['add-token'],
  );
});

test('a SUPPRESSED registry value never joins an ask', () => {
  // `archive-theme` is suppressed — a value a steward explicitly refused. Joining it
  // would resolve a query through vocabulary the store has disowned.
  const payload = resolve('archive a theme');
  assert.deepEqual(payload.decomposition.operations, []);
  assert.ok(
    !payload.decomposition['near-miss'].some((m) => m.id === 'archive-theme'),
    'a suppressed value is not minted vocabulary and is not swept for near-misses',
  );
});

// --------------------------------------- AC2: scope exclusion, with reasons

test('golden: a jurisdiction-scoped ask excludes non-applicable leaves WITH the reason', () => {
  const payload = resolve('export themes in us ca');

  assert.deepEqual(payload.decomposition.jurisdictions, [
    { value: 'us-ca', matched: 'us ca', tokens: ['us', 'ca'] },
  ]);

  // The EU leaf is EXCLUDED — present in the payload, named, with the
  // reason that explains it. This is the criterion in full: excluded, never
  // silently absent.
  assert.deepEqual(payload.exclusions, [
    {
      id: 'L-000140',
      notation: '600.2',
      heading: 'Archived-theme fallback basis',
      file: 'knowledge/design-system/600.2-archived-theme-fallback-basis.md',
      applies: ['eu-eaa'],
      asked: ['us-ca'],
      'superseded-by': [],
      reason: 'declares applies.jurisdictions [eu-eaa] — the query is scoped to [us-ca], which this leaf does not cover (UCS-1152)',
    },
  ]);

  // And it is genuinely out of the result set, not merely annotated.
  assert.ok(!payload.leaves.some((l) => l.id === 'L-000140'));

  // The CA leaf is kept, and so is the leaf declaring NO jurisdictions:
  // empty `applies` is universal, never excluded.
  assert.deepEqual(payload.leaves.map((l) => l.id), ['L-000133', 'L-000190']);
  assert.deepEqual(leaf(payload, 'L-000133').applies, []);
});

test('the exclusion is symmetric — scoping the other way excludes the other leaf', () => {
  // The mirror case, which is what proves the rule is a JOIN and not a pinned
  // special case for one jurisdiction.
  const payload = resolve('export themes in eu eaa');
  assert.deepEqual(payload.exclusions.map((x) => [x.id, x.applies, x.asked]), [
    ['L-000190', ['us-ca'], ['eu-eaa']],
  ]);
  assert.deepEqual(payload.leaves.map((l) => l.id), ['L-000133', 'L-000140']);
});

test('an unscoped ask excludes nothing — with no scope asserted there is nothing to be outside of', () => {
  const payload = resolve('export a theme');
  assert.deepEqual(payload.decomposition.jurisdictions, []);
  assert.deepEqual(payload.exclusions, []);
  // Both jurisdiction-bearing leaves are present when no scope was named.
  assert.deepEqual(payload.leaves.map((l) => l.id).sort(), ['L-000133', 'L-000140', 'L-000190']);
});

// ------------------------------- AC3: reproducible ranking, demotion, near-miss

test('golden: every published score is reproducible from its own signals', () => {
  // The invariant that makes ranking auditable rather than asserted. Checked
  // across every leaf of every query in the fixture, so a new signal that
  // forgets to publish itself fails here rather than in a reader's judgement.
  for (const query of ['add a token', 'export themes in us ca', 'export a theme', 'token registry']) {
    const payload = resolve(query);
    for (const l of payload.leaves) {
      const sum = l.signals.reduce((total, s) => total + s.score, 0);
      assert.equal(sum, l.score, `${query}: ${l.id} publishes score ${l.score} but signals sum to ${sum}`);
      for (const s of l.signals) {
        assert.equal(s.score, LEAF_SIGNALS[s.signal], `${query}: ${l.id} signal ${s.signal} is off-table`);
      }
    }
  }
});

test('the payload carries the scoring table it was ranked with', () => {
  const payload = resolve('add a token');
  // Derived from the module, never restated: a hard-coded copy here would pass
  // while the engine and the published table drifted apart.
  assert.deepEqual(payload.scoring.leaf, { ...LEAF_SIGNALS });
  assert.deepEqual(payload.scoring.concept, {
    'exact-term': 100, 'exact-alias': 80, 'term-match': 60, 'alias-match': 50, 'summary-match': 40,
  });
  assert.equal(payload.scoring['status-downrank'], 30);
});

test('golden: time-verdict and draft-stage demotions both apply, each with its reason', () => {
  const payload = resolve('add a token');
  const checklist = leaf(payload, 'L-000213');

  // Both demotions fired on one leaf, and each is named. A leaf that is draft
  // AND stale must report both — one silently absorbing the other would hide a
  // reason the reader needs.
  assert.equal(checklist.downranked, true);
  assert.deepEqual(checklist.demotions.map((d) => d.reason), ['stage', 'time']);
  assert.equal(checklist.time.verdict, 'stale');
  assert.equal(checklist.time.volatility, 'volatile');
  assert.equal(checklist.time.limit, 90);

  // And the demotion OUTRANKS the score: the demoted leaf sorts below the
  // promoted one even though both are reached by the same verb. Currency over
  // confidence.
  assert.deepEqual(payload.leaves.map((l) => [l.id, l.downranked]), [
    ['L-000102', false], ['L-000213', true],
  ]);
});

test('a demoted leaf is never filtered — it is still published, scored, and explained', () => {
  const payload = resolve('add a token');
  const checklist = leaf(payload, 'L-000213');
  assert.equal(checklist.score, 4, 'a demoted leaf keeps its score');
  assert.ok(checklist.signals.length, 'a demoted leaf still shows its joins');
  assert.ok(checklist.time.reason, 'a demotion always travels with a reason');
});

test('golden: near-misses are reported with the overlap that carried them', () => {
  // "token registry" names the concept K-101 outright. Both token OPERATIONS
  // share the token "token" without being asked for — neither ask said "add" or
  // "retire" — so both are near-misses, reported with the token that carried
  // them. K-103 "Theme status" shares nothing and must be absent: near-miss is a
  // report of near-relevance, not a list of everything in the store.
  const payload = resolve('token registry');
  assert.deepEqual(payload.decomposition['near-miss'], [
    { kind: 'operation', id: 'add-token', overlap: ['token'] },
    { kind: 'operation', id: 'retire-token', overlap: ['token'] },
  ]);
  assert.ok(!payload.decomposition['near-miss'].some((m) => m.id === 'K-103'));
});

test('a near-miss reports a verb the ask nearly named', () => {
  // "theme lifecycle" MATCHES K-103 through its alias "theme" — so the concept
  // is a hit, not a near-miss, which is the distinction being drawn here. The
  // operation `export-theme` needs both its words and got one, so it near-misses
  // on the token that overlapped.
  const payload = resolve('theme lifecycle');
  assert.deepEqual(payload.decomposition['near-miss'], [
    { kind: 'operation', id: 'export-theme', overlap: ['theme'] },
  ]);
  // The matched concept is where a match belongs, and is not double-reported.
  assert.deepEqual(payload.decomposition.concepts.map((c) => c.id), ['K-103']);
  assert.ok(!payload.decomposition['near-miss'].some((m) => m.kind === 'concept'));
});

// ----------------------------------------------- AC4: residue (golden)

test('golden: residue is exactly the unconsumed non-stopword tokens, with resolved context', () => {
  const payload = resolve('add a token (stencil) for the eu eaa launch');

  // "stencil" is the novelty — the one word the store genuinely does not know.
  // "a", "for", "the" and "launch" are stopwords; "add"/"token" went to the
  // verb and noun joins; "eu"/"eaa" went to the place join. What is left is
  // precisely the gap.
  assert.deepEqual(payload.decomposition.residue, ['stencil']);

  // And it arrives with the context that DID resolve, which is what makes the
  // finding actionable: an unresolved token alone localizes nothing.
  assert.deepEqual(payload.decomposition['resolved-context'], ['add-token', 'K-101', 'eu-eaa']);

  // The ask still resolved on its resolved fraction — residue is a report, not
  // a failure, and the leaves it did reach are still ranked.
  assert.ok(payload.leaves.length, 'a partially-resolved ask still returns its resolved fraction');
});

test('stopwords never appear in residue, and domain words always can', () => {
  const payload = resolve('how should we wire the telemetry');
  for (const token of payload.decomposition.residue) {
    assert.ok(!STOPWORDS.has(token), `stopword "${token}" leaked into residue`);
  }
  // "telemetry" is not vocabulary this store governs, and it is emphatically
  // not a stopword: it must be reported, or the store never learns it is missing.
  assert.ok(payload.decomposition.residue.includes('telemetry'));
});

test('a token consumed by ANY join is not residue', () => {
  // Each axis in turn, so a regression that stops one join from recording its
  // consumption is caught rather than masked by the other two.
  assert.ok(!resolve('add a token').decomposition.residue.includes('add'), 'verb join consumes');
  assert.ok(!resolve('token registry').decomposition.residue.includes('token'), 'noun join consumes');
  assert.ok(!resolve('export themes in us ca').decomposition.residue.includes('us-ca'), 'place join consumes');
  // And a leaf's own `terms` text is a join like any other.
  assert.ok(!resolve('token registry').decomposition.residue.includes('registry'), 'term join consumes');
});

test('a repeated unresolved token is one residue entry', () => {
  const payload = resolve('stencil stencil');
  assert.deepEqual(payload.decomposition.residue, ['stencil']);
});

// ------------------------------------------- AC5: zero resolution (golden)

test('golden: zero resolution exits 0 with an explicit empty result and fallback conduct', () => {
  const payload = resolve('augmented reality mockups');

  // Explicitly empty, every section present. A consumer never needs a presence
  // check to tell "nothing matched" from "this engine predates the section".
  assert.deepEqual(payload.results, []);
  assert.deepEqual(payload.leaves, []);
  assert.deepEqual(payload.exclusions, []);
  assert.deepEqual(payload.decomposition.operations, []);
  assert.deepEqual(payload.decomposition.concepts, []);
  assert.deepEqual(payload.decomposition.jurisdictions, []);

  // The whole ask is residue, which is the honest report.
  assert.deepEqual(payload.decomposition.residue, ['augmented', 'reality', 'mockups']);
  assert.deepEqual(payload.decomposition['resolved-context'], []);

  // The conduct is IN THE PAYLOAD — machine-distinguishable from a failure,
  // never a silent miss. An agent reading JSON is told what to do next rather
  // than left to infer it from empty arrays.
  assert.match(payload.conduct, /zero resolution is a normal outcome/);
  assert.match(payload.conduct, /survey-scope\.yaml/);
  assert.match(payload.conduct, /retrieval-miss/);
});

test('conduct is present ONLY on a zero resolution', () => {
  // A payload that resolved something must not carry fallback conduct: an agent
  // that saw it on every run would learn to ignore it.
  assert.equal(Object.hasOwn(resolve('add a token'), 'conduct'), false);
  assert.equal(Object.hasOwn(resolve('augmented reality'), 'conduct'), true);
});

test('zero resolution is exit 0, and a lookup that never ran is exit 2', () => {
  // The exit contract's whole point: 0 means the lookup RAN, hits or none.
  const empty = runCli('resolve.js', 'augmented reality mockups', '--root', STORE, '--json');
  assert.equal(empty.status, 0);

  // A usage failure is 2, never 1, and never a clean empty result.
  const broken = runCli('resolve.js', '--root', STORE, '--json');
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /usage:/i);

  // The resolver emits no findings, so 1 is unreachable in every mode.
  assert.notEqual(empty.status, 1);
});

test('the human surface states zero resolution and its conduct, never silence', () => {
  const r = runCli('resolve.js', 'augmented reality mockups', '--root', STORE, '--today', TODAY);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /zero resolution is a normal outcome/);
  assert.match(r.stdout, /residue \(unresolved\): augmented, reality, mockups/);
});

// ------------------------------------------------------ the human surface

test('the human surface shows the decomposition, the signals, and the exclusion reason', () => {
  const r = runCli('resolve.js', 'export themes in us ca', '--root', STORE, '--today', TODAY);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /verb {2}-> operations: export-theme/);
  assert.match(r.stdout, /place -> jurisdictions: us-ca/);
  assert.match(r.stdout, /excluded by scope:/);
  assert.match(r.stdout, /L-000140/);
  assert.match(r.stdout, /the query is scoped to \[us-ca\]/);
  // The signals print, so the ranking is checkable on the human surface too.
  assert.match(r.stdout, /signals: operation:export-theme \+3/);
});

test('"residue: none" is stated out loud when the whole ask resolved', () => {
  const r = runCli('resolve.js', 'add a token', '--root', STORE, '--today', TODAY);
  assert.match(r.stdout, /residue: none/);
});

// -------------------------------------------------------------- determinism

test('output is byte-identical across runs, with no wall-clock leak (D-012)', () => {
  for (const query of ['add a token for the eu eaa launch', 'export themes in us ca', 'augmented reality']) {
    const a = runCli('resolve.js', query, '--root', STORE, '--today', TODAY, '--json');
    const b = runCli('resolve.js', query, '--root', STORE, '--today', TODAY, '--json');
    assert.equal(a.stdout, b.stdout, `"${query}" is not byte-stable`);
    assert.doesNotMatch(a.stdout, /\d{4}-\d{2}-\d{2}T/, 'no timestamp may leak into output');
  }
});

test('golden: output is independent of the order a store was AUTHORED in', () => {
  // The determinism contract D-012 leans on, tested the only way that actually
  // proves it: against a second store with identical CONTENT and every
  // declaration order changed — catalog rows, registry values, ontology
  // entries, and the `terms`/`operations` arrays inside the leaves themselves.
  //
  // Asserting a sorted projection of one store cannot catch this. A field
  // published in authoring order looks perfectly sorted as long as the author
  // happened to type it in order, and only a differently-ordered twin reveals
  // it. This test found two real leaks when it was written: `signals` followed
  // the leaf's `terms` order, and the published `operations` array passed
  // through unsorted.
  //
  // FULL payload equality, not a projection — every section at once, so a new
  // section cannot be added later without inheriting the guarantee.
  for (const query of [
    'add a token',
    'retire a token',
    'export themes in us ca',
    'export themes in eu eaa',
    'token registry',
    'add a token (stencil) for the eu eaa launch',
    'export a theme',
    'theme lifecycle',
    'token',
    'augmented reality mockups',
  ]) {
    const ordered = json('resolve.js', 0, query, '--root', STORE, '--today', TODAY);
    const reordered = json('resolve.js', 0, query, '--root', REORDERED, '--today', TODAY);
    assert.deepEqual(
      reordered, ordered,
      `"${query}" resolves differently against a store whose declarations were written in another order`,
    );
  }

  // --paths mode takes the same guarantee: it publishes leaves too.
  assert.deepEqual(
    json('resolve.js', 0, '--paths', 'src/registry/tokens.ts,src/theming/rounding.ts', '--root', REORDERED, '--today', TODAY),
    json('resolve.js', 0, '--paths', 'src/registry/tokens.ts,src/theming/rounding.ts', '--root', STORE, '--today', TODAY),
  );
});

test('the reordered twin is genuinely reordered — the test would be vacuous otherwise', () => {
  // A fixture invariant. If the twin were ever synced back into the same
  // declaration order, the test above would pass while proving nothing.
  const read = (store, file) => readFileSync(join(store, file), 'utf8');
  for (const [file, field] of [
    ['knowledge/_catalog.yaml', /- id: (L-\d+)/g],
    ['ontology/classes/100-design-system.yaml', /- id: (K-\d+)/g],
    ['knowledge/_registries/operations.yaml', /- value: ([a-z-]+)/g],
    ['knowledge/_registries/jurisdictions.yaml', /- value: ([a-z-]+)/g],
  ]) {
    const ids = (store) => [...read(store, file).matchAll(field)].map((m) => m[1]);
    assert.notDeepEqual(
      ids(REORDERED), ids(STORE),
      `fixture invariant broken: ${file} is in the same order in both stores`,
    );
    assert.deepEqual(
      [...ids(REORDERED)].sort(), [...ids(STORE)].sort(),
      `fixture invariant broken: ${file} does not hold the same values in both stores`,
    );
  }
  // And the within-record arrays differ too, which is what caught the signals leak.
  assert.notEqual(
    read(REORDERED, 'knowledge/design-system/600.4-token-launch-checklist.md').match(/^operations: .*$/m)[0],
    read(STORE, 'knowledge/design-system/600.4-token-launch-checklist.md').match(/^operations: .*$/m)[0],
  );
});

test('a leaf publishes its declared arrays sorted, not as authored', () => {
  // The direct statement of the fix, so a regression names itself rather than
  // showing up as an opaque payload diff.
  const payload = resolve('add a token');
  const checklist = leaf(payload, 'L-000213');
  // Authored `[retire-token, add-token]` in the reordered twin and
  // `[add-token, retire-token]` here; both publish the sorted form.
  assert.deepEqual(checklist.operations, ['add-token', 'retire-token']);
  // Signals are sorted within each weight class — here one operation and one
  // term, so the class ordering (operation before term) is what shows.
  assert.deepEqual(checklist.signals.map((s) => s.via), ['add-token', 'token']);
});

test('within one demotion class and score, leaves tie-break by id ascending', () => {
  const payload = resolve('theme');
  const tied = payload.leaves.filter((l) => !l.downranked && l.score === payload.leaves[0].score);
  assert.ok(tied.length > 1, 'the fixture must produce a tie for this ordering test to mean anything');
  assert.deepEqual(tied.map((l) => l.id), [...tied.map((l) => l.id)].sort());
});

// ------------------------------------------------- backward compatibility

test('concept results keep their pre-1152 shape and scores', () => {
  // The extension promise: leaves became first-class WITHOUT renegotiating the
  // concept ranking consumers already read. "token" is a whole-query ladder
  // match, so it produces a concept result exactly as it did before.
  const payload = resolve('token');
  const token = payload.results.find((r) => r.id === 'K-101');
  assert.ok(token, 'K-101 must still resolve as a concept result');
  assert.equal(token.score, 100);
  assert.equal(token.match, 'exact-term');
  // The concept-attached knowledge list is untouched and still published.
  assert.ok(Array.isArray(token.knowledge));
  assert.ok(token.knowledge.some((k) => k.id === 'L-000102'));
});

test('a concept reached only by the phrase test gets no invented score', () => {
  // It appears in the decomposition (the ask named it) but NOT in results (the
  // ladder did not rank it). Inventing a rung would add concepts the pre-1152
  // engine never returned.
  const payload = resolve('add a token');
  assert.deepEqual(payload.decomposition.concepts.map((c) => c.id), ['K-101']);
  assert.deepEqual(payload.results, []);
});

test('--paths mode is unaffected by query decomposition', () => {
  // A different mode entirely, and it must not have grown a decomposition
  // section or lost its shape.
  const payload = json('resolve.js', 0, '--paths', 'src/registry/tokens.ts', '--root', STORE, '--today', TODAY);
  assert.equal(payload.mode, 'paths');
  assert.equal(Object.hasOwn(payload, 'decomposition'), false);
  assert.deepEqual(payload.paths.map((p) => [p.path, p.knowledge.map((k) => k.id)]), [
    ['src/registry/tokens.ts', ['L-000102']],
  ]);
});

// ------------------------------------------------------ the pure functions

test('tokenize keeps path-shaped tokens whole', () => {
  // Splitting on "/" first would destroy the only evidence an ask was a path.
  assert.deepEqual(tokenize('src/registry/tokens.ts'), ['src/registry/tokens.ts']);
  assert.deepEqual(tokenize('Add a NEW token!'), ['add', 'a', 'new', 'token']);
});

test('phraseHit requires every word and consumes DISTINCT tokens', () => {
  assert.deepEqual(phraseHit(['eu', 'eaa'], ['eu', 'eaa']), ['eu', 'eaa']);
  assert.equal(phraseHit(['eu', 'eaa'], ['eaa']), null, 'a missing word fails the phrase');
  // The singular/plural fold, and nothing beyond it.
  assert.deepEqual(phraseHit(['token'], ['tokens']), ['tokens']);
  assert.equal(phraseHit(['token'], ['tokenized']), null, 'no stemming — aliases are the governed mechanism');
  assert.equal(phraseHit([], ['anything']), null, 'an empty phrase matches nothing, never everything');
});

test('phraseHit tracks distinctness by OCCURRENCE, not by token text', () => {
  // The regression this pins: distinctness was once tested with
  // `used.includes(token)`, comparing by VALUE. `tokens.find` then kept
  // returning the same first occurrence and rejecting it as already-used, so a
  // repeated word failed both ways at once.

  // Under-matching direction — a query that genuinely supplies two occurrences
  // must satisfy a phrase that needs two. This returned null before the fix.
  assert.deepEqual(phraseHit(['token', 'token'], ['token', 'token']), ['token', 'token']);
  assert.deepEqual(phraseHit(['new', 'new'], ['new', 'new']), ['new', 'new']);

  // Over-matching direction — ONE occurrence must never satisfy two words.
  assert.equal(phraseHit(['token', 'token'], ['token']), null);

  // Two occurrences that differ only by the plural fold are still two
  // occurrences, and each may be taken once.
  assert.deepEqual(phraseHit(['token', 'token'], ['token', 'tokens']), ['token', 'tokens']);

  // A duplicated query token does not break an ordinary single-word phrase.
  assert.deepEqual(phraseHit(['token'], ['token', 'token']), ['token']);
});

test('a repeated word in a query still resolves its vocabulary end-to-end', () => {
  // The CLI-level consequence, so the fix is pinned at the seam and not only in
  // the unit. A stuttered ask resolves exactly as the clean one does.
  const stuttered = resolve('add add a token');
  assert.deepEqual(stuttered.decomposition.operations.map((o) => o.value), ['add-token']);
  assert.deepEqual(stuttered.decomposition.residue, [], 'the duplicate is consumed, not left as residue');
});

test('phraseOverlap is the match test relaxed to any-word', () => {
  assert.deepEqual(phraseOverlap(['theme', 'status'], ['theme', 'export']), ['theme']);
  assert.deepEqual(phraseOverlap(['theme', 'status'], ['unrelated']), []);
});

test('valuePhrases reads an identifier its own way and opened out', () => {
  assert.deepEqual(valuePhrases('add-token'), [
    { spelling: 'add-token', words: ['add-token'] },
    { spelling: 'add token', words: ['add', 'token'] },
  ]);
  // A single-word value contributes one phrase, not a duplicate.
  assert.deepEqual(valuePhrases('stencil'), [{ spelling: 'stencil', words: ['stencil'] }]);
});

test('leafScore totals the table and keeps the working', () => {
  const { score, signals } = leafScore([
    { signal: 'operation', via: 'add-token' },
    { signal: 'concept', via: 'K-101' },
    { signal: 'term', via: 'token' },
  ]);
  assert.equal(score, 6);
  assert.deepEqual(signals.map((s) => s.score), [3, 2, 1]);
  // An unknown signal scores 0 rather than NaN — a NaN would sort
  // unpredictably AND serialize to JSON as null.
  assert.equal(leafScore([{ signal: 'nonesuch', via: 'x' }]).score, 0);
});

test('the stopword list is pinned, minimal, and holds no domain vocabulary', () => {
  // Provenance: copied verbatim from the prototype's STOP set. It must stay
  // small, and it must never swallow a word the store might need to report.
  assert.ok(STOPWORDS.has('the') && STOPWORDS.has('a') && STOPWORDS.has('for'));
  for (const domain of ['token', 'theme', 'export', 'eaa', 'stencil', 'registry', 'telemetry']) {
    assert.ok(!STOPWORDS.has(domain), `"${domain}" is domain vocabulary and must never be stopworded`);
  }
  assert.ok(STOPWORDS.size < 40, 'the stopword list is minimal by design');
});

// ----------------------------------------------- registry-absent stores

test('a store governing no operations resolves no verbs and still runs', () => {
  // Registry absence is the whole installed base (UCS-1148). The lookup must
  // run and report honestly, never demand a file the store never opted into.
  const legacy = fixture('resolver/store');
  const payload = json('resolve.js', 0, 'export', '--root', legacy, '--today', TODAY);
  assert.deepEqual(payload.decomposition.operations, []);
  assert.deepEqual(payload.decomposition.jurisdictions, []);
  // And concepts still resolve, so the pre-registry store is fully usable.
  assert.ok(payload.results.some((r) => r.id === 'K-120'));
});
