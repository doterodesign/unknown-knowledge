/**
 * Query decomposition (UCS-1152) — structured joins, scope exclusion with
 * reasons, near-miss, and residue.
 *
 * What this file pins, and how each claim fails differently if it breaks:
 *
 *  1. A VERB-SHAPED ask joins the operations registry and reaches the leaves
 *     that declared the operation, with NO noun guessing. Broken, the resolver
 *     silently falls back to term matching and "add a sport" returns whatever
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
  const payload = resolve('add a sport');

  // The VERB axis landed in a minted registry value. `matched` names the
  // spelling that carried it — "add sport" is the identifier `add-sport` with
  // its separator opened, which is reading the identifier's own structure, not
  // fuzzy matching.
  assert.deepEqual(payload.decomposition.operations, [
    { value: 'add-sport', matched: 'add sport', tokens: ['add', 'sport'] },
  ]);

  // The NOUN axis joined the ontology independently. `match` is null because
  // the pre-1152 whole-query ladder does NOT consider "add a sport" a query for
  // the concept "Sport" — the phrase test reached it, and the two joins are
  // deliberately kept apart so the published concept ranking is untouched.
  assert.deepEqual(payload.decomposition.concepts, [
    { id: 'K-101', term: 'Sport', match: null, tokens: ['sport'] },
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
      ['L-000102', 6, ['operation:add-sport', 'concept:K-101', 'term:sport']],
      ['L-000213', 4, ['operation:add-sport', 'term:sport']],
    ],
  );

  // The whole ask resolved: "a" is a stopword, "add" and "sport" were both
  // consumed by joins. Residue is empty, and the store is entitled to say so.
  assert.deepEqual(payload.decomposition.residue, []);
});

test('the operation join is STRUCTURAL — it reaches a leaf whose text never says the verb', () => {
  // Fixture invariant: L-000213 declares `add-sport` but its `terms` do not
  // contain the word "add". If a future fixture edit added it, this test would
  // pass for the wrong reason — so the invariant is asserted, not assumed.
  const payload = resolve('add a sport');
  const checklist = leaf(payload, 'L-000213');
  assert.ok(
    checklist.signals.some((s) => s.signal === 'operation' && s.via === 'add-sport'),
    'L-000213 must be reached by its declared operation',
  );
  assert.ok(
    !checklist.signals.some((s) => s.signal === 'term' && /add/.test(s.via)),
    'fixture invariant broken: L-000213 must not match the verb by term text',
  );
});

test('a minted operation no leaf declares resolves as a verb and gathers nothing', () => {
  // `retire-sport` is governed vocabulary with no knowledge behind it. The verb
  // must still resolve — "the store knows this word and has nothing on it" is a
  // real answer, and a different one from "unknown verb".
  const payload = resolve('retire a sport');
  assert.deepEqual(payload.decomposition.operations.map((o) => o.value), ['retire-sport']);
  assert.ok(
    !payload.leaves.some((l) => l.signals.some((s) => s.via === 'retire-sport')),
    'no leaf declares retire-sport, so none may be scored by it',
  );
});

test('a SUPPRESSED registry value never joins an ask', () => {
  // `void-bet` is suppressed — a value a steward explicitly refused. Joining it
  // would resolve a query through vocabulary the store has disowned.
  const payload = resolve('void a bet');
  assert.deepEqual(payload.decomposition.operations, []);
  assert.ok(
    !payload.decomposition['near-miss'].some((m) => m.id === 'void-bet'),
    'a suppressed value is not minted vocabulary and is not swept for near-misses',
  );
});

// --------------------------------------- AC2: scope exclusion, with reasons

test('golden: a jurisdiction-scoped ask excludes non-applicable leaves WITH the reason', () => {
  const payload = resolve('settle bets in malta');

  assert.deepEqual(payload.decomposition.jurisdictions, [
    { value: 'malta', matched: 'malta', tokens: ['malta'] },
  ]);

  // The New-Jersey leaf is EXCLUDED — present in the payload, named, with the
  // reason that explains it. This is the criterion in full: excluded, never
  // silently absent.
  assert.deepEqual(payload.exclusions, [
    {
      id: 'L-000140',
      notation: '600.2',
      heading: 'Void-bet refund basis',
      file: 'knowledge/sportsbook/600.2-void-bet-refund-basis.md',
      applies: ['new-jersey'],
      asked: ['malta'],
      reason: 'declares applies.jurisdictions [new-jersey] — the query is scoped to [malta], which this leaf does not cover (UCS-1152)',
    },
  ]);

  // And it is genuinely out of the result set, not merely annotated.
  assert.ok(!payload.leaves.some((l) => l.id === 'L-000140'));

  // The Malta leaf is kept, and so is the leaf declaring NO jurisdictions:
  // empty `applies` is universal, never excluded.
  assert.deepEqual(payload.leaves.map((l) => l.id), ['L-000133', 'L-000190']);
  assert.deepEqual(leaf(payload, 'L-000133').applies, []);
});

test('the exclusion is symmetric — scoping the other way excludes the other leaf', () => {
  // The mirror case, which is what proves the rule is a JOIN and not a pinned
  // special case for one jurisdiction.
  const payload = resolve('settle bets in new jersey');
  assert.deepEqual(payload.exclusions.map((x) => [x.id, x.applies, x.asked]), [
    ['L-000190', ['malta'], ['new-jersey']],
  ]);
  assert.deepEqual(payload.leaves.map((l) => l.id), ['L-000133', 'L-000140']);
});

test('an unscoped ask excludes nothing — with no scope asserted there is nothing to be outside of', () => {
  const payload = resolve('settle a bet');
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
  for (const query of ['add a sport', 'settle bets in malta', 'settle a bet', 'sport registry']) {
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
  const payload = resolve('add a sport');
  // Derived from the module, never restated: a hard-coded copy here would pass
  // while the engine and the published table drifted apart.
  assert.deepEqual(payload.scoring.leaf, { ...LEAF_SIGNALS });
  assert.deepEqual(payload.scoring.concept, {
    'exact-term': 100, 'exact-alias': 80, 'term-match': 60, 'alias-match': 50, 'summary-match': 40,
  });
  assert.equal(payload.scoring['status-downrank'], 30);
});

test('golden: time-verdict and draft-stage demotions both apply, each with its reason', () => {
  const payload = resolve('add a sport');
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
  const payload = resolve('add a sport');
  const checklist = leaf(payload, 'L-000213');
  assert.equal(checklist.score, 4, 'a demoted leaf keeps its score');
  assert.ok(checklist.signals.length, 'a demoted leaf still shows its joins');
  assert.ok(checklist.time.reason, 'a demotion always travels with a reason');
});

test('golden: near-misses are reported with the overlap that carried them', () => {
  // "sport registry" names the concept K-101 outright. Both sport OPERATIONS
  // share the token "sport" without being asked for — neither ask said "add" or
  // "retire" — so both are near-misses, reported with the token that carried
  // them. K-103 "Bet status" shares nothing and must be absent: near-miss is a
  // report of near-relevance, not a list of everything in the store.
  const payload = resolve('sport registry');
  assert.deepEqual(payload.decomposition['near-miss'], [
    { kind: 'operation', id: 'add-sport', overlap: ['sport'] },
    { kind: 'operation', id: 'retire-sport', overlap: ['sport'] },
  ]);
  assert.ok(!payload.decomposition['near-miss'].some((m) => m.id === 'K-103'));
});

test('a near-miss reports a verb the ask nearly named', () => {
  // "bet settlement" MATCHES K-103 through its alias "bet" — so the concept is
  // a hit, not a near-miss, which is the distinction being drawn here. The
  // operation `settle-bet` needs both its words and got one, so it near-misses
  // on the token that overlapped.
  const payload = resolve('bet settlement');
  assert.deepEqual(payload.decomposition['near-miss'], [
    { kind: 'operation', id: 'settle-bet', overlap: ['bet'] },
  ]);
  // The matched concept is where a match belongs, and is not double-reported.
  assert.deepEqual(payload.decomposition.concepts.map((c) => c.id), ['K-103']);
  assert.ok(!payload.decomposition['near-miss'].some((m) => m.kind === 'concept'));
});

// ----------------------------------------------- AC4: residue (golden)

test('golden: residue is exactly the unconsumed non-stopword tokens, with resolved context', () => {
  const payload = resolve('add a new sport (lacrosse) for the new jersey launch');

  // "lacrosse" is the novelty — the one word the store genuinely does not know.
  // "a", "for", "the" and "launch" are stopwords; "add"/"sport" went to the
  // verb and noun joins; "new"/"jersey" went to the place join. What is left is
  // precisely the gap.
  assert.deepEqual(payload.decomposition.residue, ['lacrosse']);

  // And it arrives with the context that DID resolve, which is what makes the
  // finding actionable: an unresolved token alone localizes nothing.
  assert.deepEqual(payload.decomposition['resolved-context'], ['add-sport', 'K-101', 'new-jersey']);

  // The ask still resolved on its resolved fraction — residue is a report, not
  // a failure, and the leaves it did reach are still ranked.
  assert.ok(payload.leaves.length, 'a partially-resolved ask still returns its resolved fraction');
});

test('stopwords never appear in residue, and domain words always can', () => {
  const payload = resolve('how should we process the withdrawal');
  for (const token of payload.decomposition.residue) {
    assert.ok(!STOPWORDS.has(token), `stopword "${token}" leaked into residue`);
  }
  // "withdrawal" is not vocabulary this store governs, and it is emphatically
  // not a stopword: it must be reported, or the store never learns it is missing.
  assert.ok(payload.decomposition.residue.includes('withdrawal'));
});

test('a token consumed by ANY join is not residue', () => {
  // Each axis in turn, so a regression that stops one join from recording its
  // consumption is caught rather than masked by the other two.
  assert.ok(!resolve('add a sport').decomposition.residue.includes('add'), 'verb join consumes');
  assert.ok(!resolve('sport registry').decomposition.residue.includes('sport'), 'noun join consumes');
  assert.ok(!resolve('settle bets in malta').decomposition.residue.includes('malta'), 'place join consumes');
  // And a leaf's own `terms` text is a join like any other.
  assert.ok(!resolve('sport registry').decomposition.residue.includes('registry'), 'term join consumes');
});

test('a repeated unresolved token is one residue entry', () => {
  const payload = resolve('lacrosse lacrosse');
  assert.deepEqual(payload.decomposition.residue, ['lacrosse']);
});

// ------------------------------------------- AC5: zero resolution (golden)

test('golden: zero resolution exits 0 with an explicit empty result and fallback conduct', () => {
  const payload = resolve('prediction markets liquidity');

  // Explicitly empty, every section present. A consumer never needs a presence
  // check to tell "nothing matched" from "this engine predates the section".
  assert.deepEqual(payload.results, []);
  assert.deepEqual(payload.leaves, []);
  assert.deepEqual(payload.exclusions, []);
  assert.deepEqual(payload.decomposition.operations, []);
  assert.deepEqual(payload.decomposition.concepts, []);
  assert.deepEqual(payload.decomposition.jurisdictions, []);

  // The whole ask is residue, which is the honest report.
  assert.deepEqual(payload.decomposition.residue, ['prediction', 'markets', 'liquidity']);
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
  assert.equal(Object.hasOwn(resolve('add a sport'), 'conduct'), false);
  assert.equal(Object.hasOwn(resolve('prediction markets'), 'conduct'), true);
});

test('zero resolution is exit 0, and a lookup that never ran is exit 2', () => {
  // The exit contract's whole point: 0 means the lookup RAN, hits or none.
  const empty = runCli('resolve.js', 'prediction markets liquidity', '--root', STORE, '--json');
  assert.equal(empty.status, 0);

  // A usage failure is 2, never 1, and never a clean empty result.
  const broken = runCli('resolve.js', '--root', STORE, '--json');
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /usage:/i);

  // The resolver emits no findings, so 1 is unreachable in every mode.
  assert.notEqual(empty.status, 1);
});

test('the human surface states zero resolution and its conduct, never silence', () => {
  const r = runCli('resolve.js', 'prediction markets liquidity', '--root', STORE, '--today', TODAY);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /zero resolution is a normal outcome/);
  assert.match(r.stdout, /residue \(unresolved\): prediction, markets, liquidity/);
});

// ------------------------------------------------------ the human surface

test('the human surface shows the decomposition, the signals, and the exclusion reason', () => {
  const r = runCli('resolve.js', 'settle bets in malta', '--root', STORE, '--today', TODAY);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /verb {2}-> operations: settle-bet/);
  assert.match(r.stdout, /place -> jurisdictions: malta/);
  assert.match(r.stdout, /excluded by scope:/);
  assert.match(r.stdout, /L-000140/);
  assert.match(r.stdout, /the query is scoped to \[malta\]/);
  // The signals print, so the ranking is checkable on the human surface too.
  assert.match(r.stdout, /signals: operation:settle-bet \+3/);
});

test('"residue: none" is stated out loud when the whole ask resolved', () => {
  const r = runCli('resolve.js', 'add a sport', '--root', STORE, '--today', TODAY);
  assert.match(r.stdout, /residue: none/);
});

// -------------------------------------------------------------- determinism

test('output is byte-identical across runs, with no wall-clock leak (D-012)', () => {
  for (const query of ['add a new sport for the new jersey launch', 'settle bets in malta', 'prediction markets']) {
    const a = runCli('resolve.js', query, '--root', STORE, '--today', TODAY, '--json');
    const b = runCli('resolve.js', query, '--root', STORE, '--today', TODAY, '--json');
    assert.equal(a.stdout, b.stdout, `"${query}" is not byte-stable`);
    assert.doesNotMatch(a.stdout, /\d{4}-\d{2}-\d{2}T/, 'no timestamp may leak into output');
  }
});

test('every published section is stable-sorted independent of store iteration order', () => {
  const payload = resolve('settle a bet');
  const ids = payload.leaves.map((l) => l.id ?? l.notation);
  // Within one demotion class and one score, ties break by id ascending.
  const tied = payload.leaves.filter((l) => !l.downranked && l.score === payload.leaves[0].score);
  assert.deepEqual(tied.map((l) => l.id), [...tied.map((l) => l.id)].sort());
  assert.ok(ids.length, 'the fixture must return leaves for this ordering test to mean anything');
});

// ------------------------------------------------- backward compatibility

test('concept results keep their pre-1152 shape and scores', () => {
  // The extension promise: leaves became first-class WITHOUT renegotiating the
  // concept ranking consumers already read. "sport" is a whole-query ladder
  // match, so it produces a concept result exactly as it did before.
  const payload = resolve('sport');
  const sport = payload.results.find((r) => r.id === 'K-101');
  assert.ok(sport, 'K-101 must still resolve as a concept result');
  assert.equal(sport.score, 100);
  assert.equal(sport.match, 'exact-term');
  // The concept-attached knowledge list is untouched and still published.
  assert.ok(Array.isArray(sport.knowledge));
  assert.ok(sport.knowledge.some((k) => k.id === 'L-000102'));
});

test('a concept reached only by the phrase test gets no invented score', () => {
  // It appears in the decomposition (the ask named it) but NOT in results (the
  // ladder did not rank it). Inventing a rung would add concepts the pre-1152
  // engine never returned.
  const payload = resolve('add a sport');
  assert.deepEqual(payload.decomposition.concepts.map((c) => c.id), ['K-101']);
  assert.deepEqual(payload.results, []);
});

test('--paths mode is unaffected by query decomposition', () => {
  // A different mode entirely, and it must not have grown a decomposition
  // section or lost its shape.
  const payload = json('resolve.js', 0, '--paths', 'src/registry/sports.ts', '--root', STORE, '--today', TODAY);
  assert.equal(payload.mode, 'paths');
  assert.equal(Object.hasOwn(payload, 'decomposition'), false);
  assert.deepEqual(payload.paths.map((p) => [p.path, p.knowledge.map((k) => k.id)]), [
    ['src/registry/sports.ts', ['L-000102']],
  ]);
});

// ------------------------------------------------------ the pure functions

test('tokenize keeps path-shaped tokens whole', () => {
  // Splitting on "/" first would destroy the only evidence an ask was a path.
  assert.deepEqual(tokenize('src/registry/sports.ts'), ['src/registry/sports.ts']);
  assert.deepEqual(tokenize('Add a NEW sport!'), ['add', 'a', 'new', 'sport']);
});

test('phraseHit requires every word and consumes DISTINCT tokens', () => {
  assert.deepEqual(phraseHit(['new', 'jersey'], ['new', 'jersey']), ['new', 'jersey']);
  assert.equal(phraseHit(['new', 'jersey'], ['jersey']), null, 'a missing word fails the phrase');
  // One token must not satisfy a two-word phrase twice over.
  assert.equal(phraseHit(['sport', 'sport'], ['sport']), null);
  // The singular/plural fold, and nothing beyond it.
  assert.deepEqual(phraseHit(['bet'], ['bets']), ['bets']);
  assert.equal(phraseHit(['sport'], ['sporting']), null, 'no stemming — aliases are the governed mechanism');
  assert.equal(phraseHit([], ['anything']), null, 'an empty phrase matches nothing, never everything');
});

test('phraseOverlap is the match test relaxed to any-word', () => {
  assert.deepEqual(phraseOverlap(['bet', 'status'], ['bet', 'settlement']), ['bet']);
  assert.deepEqual(phraseOverlap(['bet', 'status'], ['unrelated']), []);
});

test('valuePhrases reads an identifier its own way and opened out', () => {
  assert.deepEqual(valuePhrases('add-sport'), [
    { spelling: 'add-sport', words: ['add-sport'] },
    { spelling: 'add sport', words: ['add', 'sport'] },
  ]);
  // A single-word value contributes one phrase, not a duplicate.
  assert.deepEqual(valuePhrases('malta'), [{ spelling: 'malta', words: ['malta'] }]);
});

test('leafScore totals the table and keeps the working', () => {
  const { score, signals } = leafScore([
    { signal: 'operation', via: 'add-sport' },
    { signal: 'concept', via: 'K-101' },
    { signal: 'term', via: 'sport' },
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
  for (const domain of ['sport', 'bet', 'settlement', 'jersey', 'malta', 'registry', 'withdrawal']) {
    assert.ok(!STOPWORDS.has(domain), `"${domain}" is domain vocabulary and must never be stopworded`);
  }
  assert.ok(STOPWORDS.size < 40, 'the stopword list is minimal by design');
});

// ----------------------------------------------- registry-absent stores

test('a store governing no operations resolves no verbs and still runs', () => {
  // Registry absence is the whole installed base (UCS-1148). The lookup must
  // run and report honestly, never demand a file the store never opted into.
  const legacy = fixture('resolver/store');
  const payload = json('resolve.js', 0, 'settlement', '--root', legacy, '--today', TODAY);
  assert.deepEqual(payload.decomposition.operations, []);
  assert.deepEqual(payload.decomposition.jurisdictions, []);
  // And concepts still resolve, so the pre-registry store is fully usable.
  assert.ok(payload.results.some((r) => r.id === 'K-120'));
});
