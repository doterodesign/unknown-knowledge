// UCS-1147: a leaf IS its accession id (L-NNNNNN) — minted, required, and the
// only spelling anything may cite it by.
//
// The CONTRACT phase of the identity inversion, and the end of it. UCS-1144's
// expand phase let a leaf mint an accession alongside its positional notation
// while BOTH citation forms stayed legal; the migrate batches (UCS-1145,
// UCS-1146) rewrote every notation-form citation in the repo; this ticket takes
// the second spelling away.
//
// The property these tests exist to pin is therefore the opposite of the one
// this file was written for. It is no longer "both forms resolve" — it is that
// a leaf answers to exactly ONE name:
//
//   - `leaf-ref` is the accession grammar and nothing else, so a notation in
//     any leaf-citation position is a schema defect rather than an alternate
//     spelling;
//   - a leaf that mints no accession has no identity, does not enter the index,
//     and surfaces as the schema's missing-required on `id`;
//   - the loader keys `leaves` by accession alone — there is no alias table, so
//     a notation resolves to nothing, loudly, everywhere;
//   - the resolver publishes the accession as `id` and the notation only as the
//     legacy display label it now is.
//
// Every dual-shape pin this file used to carry was deleted or inverted here;
// each rewritten test says which one it replaced.
//
// It also pins the payoff the inversion was for: identity that carries no
// position. The sharded fixture at the bottom files leaves by accession prefix
// and moves one between shards with nothing but a catalog `file:` field
// changing — the thing a positional notation could never survive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import {
  ACCESSION_MIGRATION_HINT, ID_GRAMMARS, idPattern,
} from '../payload/engine/lib/id-grammars.js';
import { validateRecord } from '../payload/engine/lib/validate-record.js';

const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const engineCli = (name) => fileURLToPath(new URL(`../payload/engine/${name}`, import.meta.url));
const runCli = (name, ...args) =>
  spawnSync(process.execPath, [engineCli(name), ...args], { encoding: 'utf8' });

const ACCESSIONED = fixture('structural-validator/accessioned');
const SHARDED = fixture('structural-validator/sharded');

/**
 * One leaf's file text. Every synthesized leaf carries `schema-version: 2` and
 * an `id`, because that is now the only shape a leaf may legally have — a
 * helper that could still emit an unaccessioned leaf by default would seed
 * every case with a missing-required defect it was not testing.
 *
 * `accession` stays a parameter rather than a constant precisely so the cases
 * ABOUT its absence or its wrong type can say so: `accession: null` omits the
 * field, and a non-string value is written through unquoted so a caller can
 * hand in `12345` and get the YAML NUMBER an author's unquoted `id:` produces.
 */
const leafFile = ({ heading, notation, accession, seeAlso, terms }) => [
  '---',
  'schema-version: 2',
  ...(accession ? [`id: ${accession}`] : []),
  `notation: "${notation}"`,
  'domain: w',
  `heading: ${heading}`,
  ...(terms ? [`terms: [${terms}]`] : []),
  ...(seeAlso ? ['cross-references:', `  see-also: [${seeAlso}]`] : []),
  'citations: [{source: s}]',
  '---',
  'body',
  '',
].join('\n');

/**
 * Build a throwaway store from the given knowledge leaves and hand `check` its
 * loaded model plus its root. Collision cases turn on which file the loader
 * reads FIRST, which is filename order — so they need a real directory, not a
 * stub; the root is passed on for the cases that drive a CLI over it.
 *
 * `concept` seeds one ontology concept, for tests that need the resolver to
 * have something to match a query against.
 *
 * @param {Record<string, string>} leaves filename under knowledge/w → file text
 * @param {(model: object, root: string) => void} check assertions to run
 * @param {{ concept?: { id: string, term: string } }} [options]
 */
function withStore(leaves, check, { concept } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kk-accession-'));
  try {
    for (const store of ['knowledge', 'ontology', 'decisions']) {
      mkdirSync(join(root, store), { recursive: true });
      writeFileSync(join(root, store, '_catalog.yaml'), `schema-version: 1\nstore: ${store}\nentries: []\n`);
      // decisions has no _rules.yaml (§9.1).
      if (store !== 'decisions') {
        writeFileSync(join(root, store, '_rules.yaml'), `schema-version: 1\nstore: ${store}\nrules: []\n`);
      }
    }
    if (concept) {
      mkdirSync(join(root, 'ontology/classes'), { recursive: true });
      writeFileSync(join(root, 'ontology/classes/500-w.yaml'),
        `schema-version: 1\nentries:\n  - id: ${concept.id}\n    term: ${concept.term}\n`
        + '    class: 500-w\n    summary: fixture concept\n    status: active\n');
    }
    mkdirSync(join(root, 'knowledge/w'), { recursive: true });
    for (const [name, text] of Object.entries(leaves)) {
      writeFileSync(join(root, 'knowledge/w', name), text);
    }
    check(loadStores(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ------------------------------------------------ the grammar (one module)

test('the accession grammar is declared in the one id-grammar module', () => {
  // Not a second regex somewhere: UCS-1142 made this module THE place, and the
  // accession space is the first real proof that adding one costs a lookup.
  assert.match('L-000101', idPattern('accessions'));
  assert.doesNotMatch('L-42', idPattern('accessions'), 'the mint width is fixed at six digits');
  assert.doesNotMatch('362.1', idPattern('accessions'), 'a notation is not an accession');
  assert.match(ID_GRAMMARS.accessions.hint, /L-NNNNNN/,
    'the hint names the shape an author must write');
});

test('the leaf-ref grammar is the accession grammar, and refuses a notation', () => {
  // REPLACES the dual-shape pin "the leaf-ref grammar accepts either shape, and
  // is composed from both", together with the union-anchoring test that only
  // existed to guard the `union()`/`body()` composition helpers. Both are gone
  // with the union itself: `leaf-ref` is a single pattern now, so there is no
  // composition left to mis-strip and nothing to keep two members from
  // drifting apart.
  const leafRef = idPattern('leaf-ref');
  assert.match('L-000101', leafRef);
  assert.doesNotMatch('362.1', leafRef, 'a notation is no longer a legal citation');
  assert.doesNotMatch('K-101', leafRef, 'an id from another space is still refused');
  assert.doesNotMatch('L-42', leafRef, 'the mint width is fixed at six digits');

  // `leaf-ref` and `accessions` coincide today but stay two entries, because
  // they answer two questions — what a leaf MINTS and what a record may CITE.
  // The patterns being identical is the fact under test; sharing one entry
  // would make it unfalsifiable.
  assert.equal(ID_GRAMMARS['leaf-ref'].pattern, ID_GRAMMARS.accessions.pattern);

  // The hints deliberately DIFFER, because the two findings say different
  // things: a minting finding tells an author to assign their leaf an identity,
  // a citation finding tells them the spelling they used was retired. Both name
  // L-NNNNNN, since that is the answer in either case.
  assert.notEqual(ID_GRAMMARS.accessions.hint, ID_GRAMMARS['leaf-ref'].hint);
  assert.match(ID_GRAMMARS.accessions.hint, /identity/,
    'the minting hint says what the field IS, not merely its shape');
  assert.equal(ID_GRAMMARS['leaf-ref'].hint, ACCESSION_MIGRATION_HINT);
  assert.match(ACCESSION_MIGRATION_HINT, /no longer resolves/,
    'the migration hint must tell an author the old spelling is dead, not merely wrong');
});

test('the legacy notation grammar survives as a LABEL grammar, not an id space', () => {
  // REPLACES the half of "minting grammars stay strict" that pinned the
  // dual-shape migration state (a leaf validating with a notation and no
  // accession). What survives is the reason `notation` and `leafRef` are still
  // two `$defs`: the notation field is still VALIDATED when present, because a
  // malformed display label is a defect even though nothing resolves through
  // it — but it is no longer an identity anything may hold.
  assert.match('362.1', idPattern('knowledge'));
  assert.doesNotMatch('L-000101', idPattern('knowledge'),
    'an accession is not a legal notation — a leaf cannot hold two identities');
  assert.match(ID_GRAMMARS.knowledge.hint, /legacy/,
    'the hint must say "legacy" out loud, so quoting it cannot read as an invitation');

  const leaf = (fields) => ({
    'schema-version': 2,
    domain: 'test',
    heading: 'test leaf',
    citations: [{ source: 'test' }],
    ...fields,
  });
  assert.deepEqual(
    validateRecord('knowledge-leaf', leaf({ id: 'L-000101', notation: 'L-000101' })).errors.map((e) => e.code),
    ['pattern-mismatch'],
    'an accession is not a legal notation',
  );
  assert.deepEqual(
    validateRecord('knowledge-leaf', leaf({ id: '700.1', notation: '700.1' })).errors.map((e) => e.code),
    ['pattern-mismatch'],
    'a notation is not a legal accession',
  );
  // The clean shape: a required accession, and the notation as an optional
  // label the leaf may keep or drop.
  assert.deepEqual(validateRecord('knowledge-leaf', leaf({ id: 'L-000101', notation: '700.1' })).errors, []);
  assert.deepEqual(validateRecord('knowledge-leaf', leaf({ id: 'L-000101' })).errors, [],
    'the notation is OPTIONAL now — a leaf that never had one is well-formed');
});

test('a leaf with no accession is a missing-required finding naming the migration', () => {
  // NEW pin, replacing the deleted "a leaf with no accession is indexed by
  // notation exactly as before". The expand phase's whole safety property was
  // that an unminted leaf kept working; the contract phase's is that it does
  // NOT — an accession is required, so a leaf without one is a defect an author
  // has to fix rather than a store state the engine tolerates.
  const unminted = {
    'schema-version': 2,
    notation: '700.1',
    domain: 'test',
    heading: 'test leaf',
    citations: [{ source: 'test' }],
  };
  assert.deepEqual(
    validateRecord('knowledge-leaf', unminted).errors,
    [{
      path: 'id',
      code: 'missing-required',
      // The message carries the accession grammar's hint, so the author is told
      // what to assign and why the field exists — not merely that a key is absent.
      message: `required property "id" is missing — expected ${ID_GRAMMARS.accessions.hint}`,
    }],
    'a leaf carrying only a notation is missing its identity, not carrying an alternate one',
  );

  // And it surfaces at the seam a user observes. The finding is a LOADER-level
  // schema error, so the validator refuses to run its structural checks and
  // exits 2 (PRD §5) — the leaf never entered the index, so there was nothing
  // to check it against.
  withStore({ 'a.md': leafFile({ heading: 'Unminted', notation: '700.1', accession: null }) },
    (model, root) => {
      assert.deepEqual([...model.leaves.keys()], [],
        'a leaf with no identity does not enter the index under any spelling');
      const r = runCli('validate.js', '--root', root);
      assert.equal(r.status, 2, 'the missing identity blocks the run');
      assert.match(r.stderr, /missing-required\s+knowledge\/w\/a\.md\s+id/,
        'the finding names the file and the field the author edits');
    });
});

// ------------------------------------- AC1: an accessioned store loads clean

test('a store whose leaves carry accession ids validates clean and byte-stable', () => {
  const r = runCli('validate.js', '--root', ACCESSIONED, '--json');
  assert.equal(r.status, 0, `validator must exit 0 on the accessioned store:\n${r.stderr}`);
  const payload = JSON.parse(r.stdout);
  assert.deepEqual(payload.findings, [], 'no findings on a well-formed accessioned store');
  assert.deepEqual(payload.counts, { errors: 0, warnings: 0 });

  // Byte-stable: the same input renders the same bytes, so a baseline diff
  // shows real change and nothing else (D-012).
  const again = runCli('validate.js', '--root', ACCESSIONED, '--json');
  assert.equal(again.stdout, r.stdout, 'JSON output must be byte-identical run over run');
});

test('the loader indexes a leaf by its accession and nothing else', () => {
  // REPLACES "the loader indexes an accessioned leaf by its accession, notation
  // aliased". The alias index is GONE, not merely empty: `model.leafAliases` no
  // longer exists, so there is no second index a notation could be looked up
  // in. That is the shape of the contract phase — one leaf, one key, one name.
  const model = loadStores(ACCESSIONED);
  assert.deepEqual([...model.leaves.keys()], ['L-000101', 'L-000102']);
  assert.equal(model.leafAliases, undefined,
    'the alias table left with the second spelling it existed to serve');

  const leaf = model.leaves.get('L-000101');
  assert.equal(leaf.identity, 'L-000101', 'identity IS the accession');
  assert.equal(leaf.id, 'L-000101');
  // The notation stays on the entry because it is still a PUBLISHED resolver
  // field — the legacy display label. What it is not is a key: nothing in
  // `leaves` answers to it.
  assert.equal(leaf.notation, '700.1');
  assert.equal(model.leaves.has('700.1'), false,
    'a notation reaches no leaf — it is a label, not an identity');
});

// --------------------------------- AC2: a collision is a loader hard error

test('two leaves claiming one accession is a duplicate-id loader error', () => {
  const model = loadStores(fixture('loader/duplicate-accession'));
  const duplicates = model.diagnostics.filter((d) => d.code === 'duplicate-id');
  assert.deepEqual(duplicates.map((d) => ({ file: d.file, path: d.path })), [
    { file: 'knowledge/widgets/700.2-branch-b.md', path: 'id' },
  ], 'the SECOND mint is the finding, attributed to the field that collided');
  assert.match(duplicates[0].message, /"L-000101" is already minted in/);
  assert.equal(model.ok, false, 'a collision makes the store unhealthy');

  // The loser owns NOTHING. This used to also assert that it contributed no
  // ALIAS — the dual-shape hazard was that indexing the loser's notation would
  // file "700.2" under L-000101, a different leaf in a different file, so a
  // notation-form citation of 700.2 would resolve silently to the wrong
  // content. That hazard is structurally gone with the alias table: there is
  // only one index, and the loser is simply not in it.
  assert.deepEqual([...model.leaves.keys()], ['L-000101']);
});

test('an accession collision is caught whichever leaf loads first', () => {
  // REPLACES "a notation collision is caught whichever leaf loads first". Two
  // of that test's three cases were about a NOTATION being claimed — as an
  // identity, or as the alternate spelling of an accessioned leaf — and neither
  // is a collision any more: nothing is keyed by notation, so two leaves may
  // share one freely. Both here carry notation "700.1" to say exactly that.
  //
  // What survives is order-independence, which is the whole content of "hard
  // error": the SECOND claimant of an accession must lose whichever file that
  // is, or the same two files pass or fail on readdir order — a silent pass
  // wearing a clean exit for half the repos that hit it.
  const leaf = (heading, accession) => leafFile({ heading, notation: '700.1', accession });

  const cases = [
    ['a before b', { 'a.md': leaf('A', 'L-000101'), 'b.md': leaf('B', 'L-000101') }, 'knowledge/w/b.md'],
    ['b before z', { 'b.md': leaf('B', 'L-000101'), 'z.md': leaf('Z', 'L-000101') }, 'knowledge/w/z.md'],
  ];

  for (const [label, leaves, expectedFile] of cases) {
    withStore(leaves, (model) => {
      const duplicates = model.diagnostics.filter((d) => d.code === 'duplicate-id');
      assert.deepEqual(duplicates.map((d) => d.file), [expectedFile],
        `${label}: the SECOND claimant must lose, whichever file that is`);
    });
  }

  // The control: one shared notation and two distinct accessions is not a
  // collision at all. A notation that still collided would be an identity
  // wearing a label's name.
  withStore({
    'a.md': leaf('A', 'L-000101'),
    'b.md': leaf('B', 'L-000102'),
  }, (model) => {
    assert.deepEqual(model.diagnostics, [],
      'two leaves may share a legacy display label — only identity is unique');
    assert.deepEqual([...model.leaves.keys()], ['L-000101', 'L-000102']);
  });
});

test('a leaf that loses its identity contributes nothing to the ref graph', () => {
  // Edges are collected under the leaf's IDENTITY, so collecting them for a
  // leaf that lost that identity files its cross-references under the winner —
  // the graph would show the winning leaf declaring edges it never wrote, in a
  // file it does not own. A losing mint contributes nothing: not an entry, not
  // an edge.
  //
  // The dangling target is spelled as an ACCESSION now (it was the notation
  // "999.9"), because a notation would be refused by the schema before the ref
  // graph ever saw it — and a second finding would blur what this test is
  // about, which is that the edge never enters the graph at all.
  withStore({
    'a.md': leafFile({ heading: 'Winner', accession: 'L-000101', notation: '700.1' }),
    'b.md': leafFile({
      heading: 'Loser', accession: 'L-000101', notation: '700.2', seeAlso: 'L-000999',
    }),
  }, (model) => {
    assert.deepEqual(model.refs, [], 'the loser\'s edge must not enter the graph');
    assert.deepEqual(
      model.diagnostics.filter((d) => d.code === 'unresolved-ref'), [],
      'and must not produce an unresolved-ref attributed to the winner',
    );
    assert.deepEqual(model.diagnostics.map((d) => d.code), ['duplicate-id'],
      'the collision is the whole story');
  });
});

test('an accession collision surfaces at every CLI surface', () => {
  // Through the EXISTING duplicate-id contract, not a parallel one: the
  // surfaces that certify must refuse a store they cannot certify (PRD §5).
  const store = fixture('loader/duplicate-accession');
  for (const cli of ['validate.js', 'validate-values.js']) {
    const r = runCli(cli, '--root', store);
    assert.equal(r.status, 2, `${cli} must refuse a store with a duplicate accession`);
    // Which stream carries the refusal is each command's own convention; what
    // this pins is that the refusal NAMES the defect rather than exiting mute.
    assert.match(`${r.stdout}${r.stderr}`, /duplicate-id/,
      `${cli} must name the defect it refused for`);
  }
  // Preflight and resolve still run and still agree about health.
  for (const [cli, args] of [['preflight.js', []], ['resolve.js', ['--paths', 'src/a.ts']]]) {
    const payload = JSON.parse(runCli(cli, '--root', store, '--json', ...args).stdout);
    assert.equal(payload['store-health'].ok, false, `${cli} must report the store unhealthy`);
  }
});

// ------------------------------ AC3: a malformed accession is an id-shape find

test('a malformed accession is an id-shape finding carrying the grammar hint', () => {
  const r = runCli('validate.js', '--root', fixture('structural-validator/bad-accession'), '--json');
  assert.equal(r.status, 1, 'findings exit 1');
  const shape = JSON.parse(r.stdout).findings.filter((f) => f.code === 'id-shape');
  assert.deepEqual(shape.map((f) => ({ id: f.id, file: f.file, path: f.path })), [
    { id: 'L-42', file: 'knowledge/_catalog.yaml', path: 'entries[0].id' },
  ]);
  // The message quotes the hint that travels WITH the pattern, so the prose can
  // never describe a grammar the engine no longer enforces (UCS-1142).
  assert.ok(
    shape[0].message.includes(ID_GRAMMARS['leaf-ref'].hint),
    `id-shape message must carry the paired hint; got: ${shape[0].message}`,
  );
});

// ----------------------------- AC4: resolver output carries the accession

test('resolver knowledge entry points publish the accession as the leaf id', () => {
  const out = JSON.parse(
    runCli('resolve.js', 'widget', '--root', ACCESSIONED, '--json').stdout);
  assert.deepEqual(out.results[0].knowledge, [
    {
      via: 'terms',
      id: 'L-000101',
      notation: '700.1',
      heading: 'Widget registry rules',
      // Frontmatter v2 keys (UCS-1149) on a leaf that declares none of them:
      // present and null, never absent. This fixture declares no facets on
      // purpose — it is the proof that a leaf carrying only the required shape
      // still resolves, and still publishes one stable result shape.
      stage: null,
      excerpt: 'Cites its sibling by ACCESSION while carrying an accession itself — the clean state every store lands in once the migration is done.',
      provenance: null,
      downranked: false,
      // Time facet keys (UCS-1150) on the same leaf, for the same reason
      // again: present, never absent. A leaf declaring no volatility is
      // `exempt` — outside time governance rather than having passed a
      // freshness check it never sat.
      demotions: [],
      time: {
        volatility: null, verified: null, age: null, limit: null, stale: false,
        verdict: 'exempt',
        reason: 'no volatility declared — this leaf is not under time governance, so no freshness verdict applies (UCS-1150)',
      },
      file: 'knowledge/widgets/700.1-widget-registry.md',
      // Typed-edge keys (UCS-1151) on the same leaf, and for the same reason:
      // present and empty, never absent. `via: terms` because this leaf
      // declares no `concepts` edge and so reaches its concept through text.
      relates: {
        'depends-on': [], 'see-also': [], contradicts: [], supersedes: [],
      },
      'superseded-by': [],
    },
  ]);
});

test('the published leaf id is ALWAYS the accession, and notation is never identity', () => {
  // NEW pin, replacing the deleted dual-shape golden "a notation-only store
  // resolves identically apart from the added field". That test existed to
  // prove `id: null` was a legal published value for an unminted leaf; there is
  // no such leaf any more, so the property worth pinning inverted with it.
  //
  // Read across every fixture store the resolver can be pointed at, because the
  // claim is about the FIELD rather than about one store: wherever a leaf is
  // published — as a concept's entry point or as a direct leaf hit — its `id`
  // is its accession, and `notation` is a label riding alongside that no
  // consumer may mistake for identity.
  for (const [root, query] of [
    [ACCESSIONED, 'widget'],
    [SHARDED, 'Widget'],
    [fixture('resolver/store'), 'export'],
  ]) {
    const out = JSON.parse(runCli('resolve.js', query, '--root', root, '--json').stdout);
    const published = [
      ...out.results.flatMap((r) => r.knowledge ?? []),
      ...(out.leaves ?? []),
    ];
    assert.ok(published.length > 0, `${root}: the query must actually reach a leaf`);
    for (const entry of published) {
      assert.match(entry.id, idPattern('accessions'),
        `${root}: every published leaf id is an accession, never a notation`);
      // The notation is present as a published field and is NOT the id — the
      // two are different facts about the leaf, and the day a leaf drops its
      // legacy label this key goes null while `id` does not move.
      assert.notEqual(entry.id, entry.notation);
    }
  }
});

test('a non-string accession publishes null, and indexes the leaf nowhere', () => {
  // An unquoted YAML `id: 12345` parses as a NUMBER. The schema rejects that
  // leaf, but the resolver deliberately does not gate on store health — a
  // lookup runs on whatever loaded (§4) — so it is the one surface that can be
  // asked to publish an id no check approved. `??` would have passed the
  // number straight through and broken the field's published type; `typeof`
  // is what keeps `id` string-or-null for every consumer.
  //
  // The second half of this test INVERTED. It used to assert the leaf stayed
  // findable, because identity fell back to the notation; it now asserts the
  // leaf is findable by nothing at all. A malformed accession is a leaf with no
  // identity, and indexing it under a spelling no citation may use would put a
  // record in every enumeration that no reference could reach.
  withStore(
    { 'a.md': leafFile({ heading: 'H', notation: '700.1', accession: '12345', terms: 'Widget' }) },
    (model, root) => {
      assert.deepEqual([...model.leaves.keys()], [],
        'a leaf whose accession is not a string holds no identity to be keyed under');
      const out = JSON.parse(runCli('resolve.js', 'widget', '--root', root, '--json').stdout);
      // The concept still resolves; it simply has no leaf hanging off it, which
      // is the honest report of a store in this state.
      assert.deepEqual(out.results[0].knowledge, []);
      assert.deepEqual(out.leaves, []);
    },
    { concept: { id: 'K-510', term: 'Widget' } },
  );
});

test('a leaf whose id is notation-form takes no identity, so the notation still refuses', () => {
  // REGRESSION (code review of UCS-1147). `leafIdentity` tested the accession
  // for being a STRING, not for matching the accession grammar, so a leaf
  // carrying `id: "700.2"` took identity under its own notation — and because
  // the leaf index is what ref resolution consults, a notation-form citation of
  // it RESOLVED. The schema reported both records, and the citation worked
  // anyway: two mechanisms disagreeing about whether a notation is a citation,
  // which is exactly the dual-shape contract this ticket retired.
  //
  // The malformed id is a string, so it passes every `typeof` guard; only the
  // grammar catches it. That is why the check has to be the grammar.
  withStore({
    'a.md': leafFile({ heading: 'Malformed', notation: '700.2', accession: '"700.2"' }),
    'b.md': leafFile({ heading: 'Citer', notation: '700.1', accession: 'L-000101', seeAlso: '"700.2"' }),
  }, (model) => {
    assert.deepEqual([...model.leaves.keys()], ['L-000101'],
      'a leaf whose id is not accession-shaped holds no identity to be keyed under');

    const cite = model.refs.find((r) => r.to === '700.2');
    assert.equal(cite.resolved, false,
      'the notation resolves to nothing — an unapproved id must not become a citable spelling');

    // Each defect is reported against the file whose author must edit it, and
    // nothing is reported about the leaf that failed to load — no cascade of
    // secondaries about a record that simply is not there.
    //
    // The citing leaf earns TWO findings, and both belong: the shape check says
    // a notation is not a legal citation, and the resolution check says this
    // one reaches no leaf. They are independent mechanisms, so a store where a
    // notation happened to be well-formed-but-absent would still get the
    // second — muting either would leave a way for one to pass alone.
    const codes = model.diagnostics.map((d) => [d.code, d.file.split('/').pop(), d.path]);
    assert.deepEqual(codes.sort(), [
      ['pattern-mismatch', 'a.md', 'id'],
      ['pattern-mismatch', 'b.md', 'cross-references.see-also[0]'],
      ['unresolved-ref', 'b.md', 'cross-references.see-also[0]'],
    ]);
  });
});

// ------------------- AC5: one shape cites, and every other shape is refused

test('cross-references, relates-to and catalog rows name leaves by accession', () => {
  // REPLACES "cross-references, relates-to and catalog rows accept either id
  // shape". Every one of the three citation sites that test read a MIXED pair
  // through now reads a uniform accession-form one — which is the migrated
  // store's real shape, and the shape a reader of these fixtures should see.
  const model = loadStores(ACCESSIONED);
  const edge = (from, type) => model.refs.find((r) => r.from === from && r.type === type);

  // A leaf cites its sibling by accession...
  assert.equal(edge('L-000101', 'cross-references.see-also').to, 'L-000102');
  assert.equal(edge('L-000101', 'cross-references.see-also').resolved, true);
  // ...and the sibling cites back the same way. There is no second form left
  // for either to be second-class against.
  assert.equal(edge('L-000102', 'cross-references.class-elsewhere').to, 'L-000101');
  assert.equal(edge('L-000102', 'cross-references.class-elsewhere').resolved, true);

  // A decision's relates-to.leaves reaches leaves the one legal way.
  const relates = model.refs.filter((r) => r.type === 'relates-to.leaves');
  assert.deepEqual(relates.map((r) => [r.to, r.resolved]), [['L-000101', true], ['L-000102', true]]);

  // And the catalog — the store's own citation of its leaves — names both rows
  // by accession. A catalog row is a POINTER, and a pointer has one spelling.
  assert.deepEqual(
    model.stores.knowledge.catalog.entries.map((e) => e.id), ['L-000101', 'L-000102']);
  assert.deepEqual(model.diagnostics, [], 'no drift, no orphans, no unresolved refs');
});

test('a notation-form value FAILS in every position a leaf citation is legal', () => {
  // NEW pin — the direct inversion of the dual-shape contract, asserted at each
  // of the three sites that may cite a leaf. A notation is not an alternate
  // spelling that merely fails to resolve; it is a SCHEMA defect, because
  // `leaf-ref` is the accession grammar and every one of these fields reads it.
  //
  // Read at the record level (the schema seam) so all three kinds can be shown
  // failing the same way, then confirmed below at the CLI seam a user observes.
  const sites = [
    ['knowledge-leaf', {
      'schema-version': 2,
      id: 'L-000101',
      domain: 'test',
      heading: 'test leaf',
      citations: [{ source: 'test' }],
      'cross-references': { 'see-also': ['700.2'] },
    }, 'cross-references.see-also[0]'],
    ['decision-entry', {
      id: 'D-301',
      title: 'Cites a leaf the retired way',
      category: 'architecture',
      status: 'accepted',
      date: '2026-07-07',
      deciders: ['dimitri'],
      context: 'c',
      decision: 'd',
      'relates-to': { concepts: [], leaves: ['700.2'], decisions: [] },
    }, 'relates-to.leaves[0]'],
    ['finding', {
      'schema-version': 1,
      date: '2026-07-07',
      status: 'open',
      trigger: 'retrieval-miss',
      summary: 'K-510 had no leaf',
      consulted: { concepts: ['K-510'], leaves: ['700.2'] },
    }, 'consulted.leaves[0]'],
  ];
  for (const [kind, record, path] of sites) {
    assert.deepEqual(
      validateRecord(kind, record).errors,
      [{
        path,
        code: 'pattern-mismatch',
        // Built from the grammar module's own hint rather than restated, so a
        // reworded hint reaches this golden. The hint is the half of the
        // message that names the migration — the criterion's actual demand.
        message: `"700.2" is not a valid id here — expected ${ID_GRAMMARS['leaf-ref'].hint}`,
      }],
      `${kind}: a notation in ${path} is a defect, not an alternate spelling`,
    );
  }

  // The migration is NAMED where an author meets it. The schema's message
  // quotes the pattern; the citation grammar's hint — the prose half of the
  // same fact — is what a catalog id-shape finding carries, and it is the one
  // place the engine tells an author what to do instead of what is wrong.
  const r = runCli('validate.js', '--root', fixture('structural-validator/bad-accession'), '--json');
  const [shape] = JSON.parse(r.stdout).findings.filter((f) => f.code === 'id-shape');
  assert.ok(shape.message.includes(ACCESSION_MIGRATION_HINT),
    `a leaf-citation id-shape finding must name the accession migration; got: ${shape.message}`);
});

test('a notation-form citation is refused at the CLI seam, in every store position', () => {
  // The same claim as above, observed where a user actually meets it: the
  // structural-validator process. A schema defect is an error-severity LOADER
  // diagnostic, so the validator refuses to run its structural checks at all
  // and exits 2 — a check that never ran is a blocking defect (PRD §5).
  //
  // Each case rewrites exactly one accession-form citation in the clean sharded
  // store back to the notation the target still carries as its legacy label. The
  // target EXISTS; only the spelling is retired. That is what makes these
  // findings about the contract rather than about a typo.
  const cases = [
    ['knowledge/L-01/L-010501-widget-audit.md', 'see-also: [L-000101]', 'see-also: ["700.1"]',
      'cross-references.see-also[0]'],
    ['decisions/entries/D-302-prefix-sharding.yaml', 'leaves: [L-000101]', 'leaves: ["700.1"]',
      'entries[0].relates-to.leaves[0]'],
  ];
  for (const [file, from, to, path] of cases) {
    const root = mkdtempSync(join(tmpdir(), 'kk-notation-'));
    try {
      cpSync(SHARDED, root, { recursive: true });
      const target = join(root, file);
      const text = readFileSync(target, 'utf8');
      assert.ok(text.includes(from), `${file}: the fixture no longer carries "${from}"`);
      writeFileSync(target, text.replace(from, to));

      const r = runCli('validate.js', '--root', root);
      assert.equal(r.status, 2, `${file}: a notation-form citation must block the run`);
      assert.match(r.stderr, new RegExp(`pattern-mismatch\\s+${file.replace(/[.]/g, '\\.')}\\s+${path.replace(/[.[\]]/g, '\\$&')}`),
        `${file}: the finding names the exact member the author wrote`);
      // The finding must name the MIGRATION, not merely the regex the value
      // failed. This is the acceptance criterion's actual demand, and the
      // difference is what an author can do about it: `does not match
      // ^L-[0-9]{6}$` describes the defect, while the hint says the notation is
      // a legacy label and points at the accession to write instead. The hint
      // is read from the grammar module rather than restated, so a reworded
      // hint reaches this assertion instead of silently passing it.
      assert.ok(r.stderr.includes('"700.1" is not a valid id here'),
        `${file}: the finding quotes the value the author wrote`);
      assert.ok(r.stderr.includes(ACCESSION_MIGRATION_HINT),
        `${file}: the message names the accession migration, not just the pattern`);
      // And the ref graph refuses it too, so the defect is reported by both the
      // shape check and the resolution check rather than only one of them.
      assert.match(r.stderr, /unresolved-ref/,
        `${file}: a notation resolves to nothing — the label is not an index key`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('a dangling accession is an unresolved-ref finding from every record kind', () => {
  // REPLACES "an unresolvable target of EITHER shape is an unresolved-ref
  // finding". Two of that test's four dangling targets were notations, which
  // can no longer reach the ref graph at all — the schema refuses them first.
  // What survives, and is the whole point, is that narrowing the grammar did
  // not narrow REFUSAL: a well-formed accession naming no leaf still dangles
  // loudly, from a leaf's cross-references and a decision's relates-to alike.
  const model = loadStores(fixture('loader/unresolved-leaf-ref'));
  const unresolved = model.diagnostics
    .filter((d) => d.code === 'unresolved-ref')
    .map((d) => d.message.match(/ref "([^"]+)"/)[1]);
  assert.deepEqual(unresolved.sort(), ['L-000996', 'L-000997', 'L-000998', 'L-000999']);
  for (const id of unresolved) {
    assert.match(id, idPattern('accessions'),
      'every dangling target is well-formed — the defect is that it names nothing');
  }
  assert.equal(model.ok, false);
});

test('a dangling accession in relates-to.leaves surfaces at the validator seam', () => {
  // UCS-1146 rewrote decisions' relates-to.leaves to accessions, which moves
  // the failure mode: the ref that can now dangle is an ACCESSION. The loader
  // test above pins that in-process; this pins the seam a client actually
  // observes — the structural-validator CLI — because a diagnostic the loader
  // records but the CLI swallows is a defect no user would ever see reported.
  const r = runCli('validate.js', '--root', fixture('loader/unresolved-leaf-ref'), '--json');

  // An unresolved ref is a LOADER error, so the validator refuses to run its
  // structural checks at all and exits 2 — a check that never ran is itself a
  // blocking defect (PRD §5). The report goes to stderr, not the JSON channel:
  // there is no result to serialize when nothing was checked.
  assert.equal(r.status, 2, 'a dangling ref blocks the run rather than degrading it');
  assert.equal(r.stdout, '', 'no JSON payload is emitted when the checks never ran');

  const lines = r.stderr.trimEnd().split('\n');
  assert.match(lines[0], /the store loader reported 4 error\(s\) — structural checks never ran/);

  // The dangling ACCESSION is named verbatim and addressed to the exact array
  // element that carries it — the property that makes the finding actionable
  // now that this field cites by accession.
  const dangling = lines.slice(1)
    .filter((l) => l.includes('decisions/entries/D-301-dangling.yaml'))
    .map((l) => l.trim().split(/\s{2,}/));
  assert.deepEqual(dangling, [
    ['unresolved-ref', 'decisions/entries/D-301-dangling.yaml', 'entries[0].relates-to.leaves[0]',
      'relates-to.leaves ref "L-000998" does not resolve to any knowledge entry or catalog-declared id'],
    // Both members are ACCESSIONS now; the second was the notation "700.8"
    // while the union stood. Two dangling accessions from one edge list still
    // produce two findings, so narrowing the grammar did not collapse the
    // per-element attribution an author acts on.
    ['unresolved-ref', 'decisions/entries/D-301-dangling.yaml', 'entries[0].relates-to.leaves[1]',
      'relates-to.leaves ref "L-000996" does not resolve to any knowledge entry or catalog-declared id'],
  ]);

  // Byte-stable, like every other seam (D-012).
  const again = runCli('validate.js', '--root', fixture('loader/unresolved-leaf-ref'), '--json');
  assert.equal(again.stderr, r.stderr, 'the report must be byte-identical run over run');
});

test('log-fragment leaf refs take accessions, and only accessions', () => {
  // REPLACES "log-fragment leaf refs accept either shape". finding/miss/gap
  // fragments cite leaves in `consulted.leaves` and read the same `leaf-ref`
  // grammar every other citation site does — so the narrowing reached them
  // without any edit of their own, which is the property that made `leaf-ref` a
  // named entry rather than a pattern spelled per record kind.
  for (const kind of ['finding', 'gap']) {
    const entry = (leaves) => ({
      'schema-version': 1,
      date: '2026-07-07',
      status: 'open',
      summary: 'K-510 had no leaf',
      consulted: { concepts: ['K-510'], leaves },
      ...(kind === 'finding' ? { trigger: 'retrieval-miss' } : {}),
    });
    assert.deepEqual(validateRecord(kind, entry(['L-000101', 'L-000102'])).errors, [],
      `${kind}: consulted.leaves takes accessions`);
    assert.deepEqual(
      validateRecord(kind, entry(['L-000101', '700.2'])).errors.map((e) => [e.path, e.code]),
      [['consulted.leaves[1]', 'pattern-mismatch']],
      `${kind}: and refuses the retired spelling, naming the element that carries it`,
    );
  }
});

// ------------- the payoff: identity that carries no position (prefix sharding)
//
// The reason the inversion was worth doing, executed. A dotted notation encoded
// where a leaf sat, so moving one meant renumbering it and rewriting every
// citation. An accession encodes nothing, which means a store may file its
// leaves however it likes — and may re-file them later without touching a
// single reference. The `sharded` fixture is that claim as data: leaves live
// under knowledge/L-00/ and knowledge/L-01/ by accession prefix, a fanout device
// with no meaning, and L-000101 and L-010501 cite each other ACROSS shards.

test('a store sharded by accession prefix loads, validates and resolves clean', () => {
  // The precondition for the move golden below, and a claim in its own right:
  // nothing in the engine knows or cares which directory a leaf sits in. A
  // layout the loader merely tolerated — findings, diagnostics, a degraded
  // health verdict — would make the move test's "unchanged" meaningless.
  const model = loadStores(SHARDED);
  assert.deepEqual(model.diagnostics, [], 'a shard directory is just a directory');
  assert.equal(model.ok, true);
  assert.deepEqual([...model.leaves.keys()], ['L-000101', 'L-000102', 'L-010501']);
  // The cross-shard citations resolve exactly as the same-shard one does.
  assert.deepEqual(
    model.refs.filter((r) => r.type.startsWith('cross-references'))
      .map((r) => [r.from, r.to, r.resolved]),
    [['L-000101', 'L-000102', true], ['L-000101', 'L-010501', true], ['L-010501', 'L-000101', true]],
  );

  const validated = runCli('validate.js', '--root', SHARDED, '--json');
  assert.equal(validated.status, 0, `the sharded store must validate clean:\n${validated.stderr}`);
  const payload = JSON.parse(validated.stdout);
  assert.deepEqual(payload.findings, []);
  assert.deepEqual(payload.counts, { errors: 0, warnings: 0 });

  const resolved = runCli('resolve.js', 'Widget', '--root', SHARDED, '--json');
  assert.equal(resolved.status, 0, `the sharded store must resolve clean:\n${resolved.stderr}`);
  const out = JSON.parse(resolved.stdout);
  assert.equal(out['store-health'].ok, true);
  assert.deepEqual(out.results[0].knowledge.map((k) => k.id), ['L-000101', 'L-000102', 'L-010501'],
    'all three leaves reach the concept, whichever shard they are filed under');
});

test('moving a leaf between shards changes its file field and nothing else', () => {
  // THE golden this whole ticket exists for. A leaf is moved from one shard
  // directory to another and its catalog row's `file:` is updated to match —
  // that is the ENTIRE edit. No citation is rewritten, because no citation
  // named a position; no id changes, because an accession is not a coordinate.
  //
  // The assertion is written to state the property honestly rather than to
  // overclaim it: `file` legitimately changes, because `file` is precisely the
  // field whose job is to say where the bytes are. Everything else — every
  // published id, notation, heading, score, edge and finding — must be
  // byte-identical, and that is what "position carries no meaning" means when
  // it is made falsifiable.
  const root = mkdtempSync(join(tmpdir(), 'kk-shard-move-'));
  try {
    cpSync(SHARDED, root, { recursive: true });
    const before = JSON.parse(runCli('resolve.js', 'Widget', '--root', root, '--json').stdout);

    // The move: L-000102 leaves the L-00 shard for the L-01 one. Its accession
    // does not change, so the new location disagrees with the prefix scheme —
    // deliberately. A layout that only works while every leaf sits in its
    // "correct" shard would be a coordinate system wearing a fanout device's
    // name, and this is what tells the two apart.
    renameSync(
      join(root, 'knowledge/L-00/L-000102-widget-retirement.md'),
      join(root, 'knowledge/L-01/L-000102-widget-retirement.md'),
    );
    const catalog = join(root, 'knowledge/_catalog.yaml');
    const text = readFileSync(catalog, 'utf8');
    const from = 'file: L-00/L-000102-widget-retirement.md';
    const to = 'file: L-01/L-000102-widget-retirement.md';
    assert.ok(text.includes(from), 'the catalog no longer locates the leaf where this test moves it from');
    writeFileSync(catalog, text.replace(from, to));

    // Nothing else was touched. Asserted rather than merely intended: a test
    // that silently rewrote a citation would prove the opposite of its claim.
    for (const leaf of ['L-00/L-000101-widget-registry.md', 'L-01/L-010501-widget-audit.md']) {
      assert.equal(
        readFileSync(join(root, 'knowledge', leaf), 'utf8'),
        readFileSync(join(SHARDED, 'knowledge', leaf), 'utf8'),
        `${leaf}: a move must not require editing the leaves that cite the moved one`,
      );
    }

    // The validator has nothing to say about it.
    const validated = runCli('validate.js', '--root', root, '--json');
    assert.equal(validated.status, 0, `a moved leaf must validate clean:\n${validated.stderr}`);
    assert.deepEqual(JSON.parse(validated.stdout).findings, [],
      'a leaf in the "wrong" shard is not a finding — the prefix classifies nothing');

    // And the resolver publishes the same store it did before, `file` aside.
    const after = JSON.parse(runCli('resolve.js', 'Widget', '--root', root, '--json').stdout);
    const withoutFile = (value) => JSON.parse(
      JSON.stringify(value, (key, v) => (key === 'file' ? undefined : v)));
    assert.deepEqual(withoutFile(after), withoutFile(before),
      'excluding the one field a move legitimately updates, the output is unchanged');

    // Said again at the level a reader cares about, because the deep-equal
    // above would also pass if the resolver had somehow published nothing.
    const ids = (out) => out.results[0].knowledge.map((k) => [k.id, k.notation, k.heading]);
    assert.deepEqual(ids(after), ids(before));
    assert.deepEqual(ids(after), [
      ['L-000101', '700.1', 'Widget registry rules'],
      ['L-000102', '700.2', 'Widget retirement rules'],
      ['L-010501', '701.5', 'Widget audit schedule'],
    ]);

    // The `file` field DID move, and tracks where the bytes actually are —
    // otherwise "unchanged apart from file" would be true of a field nobody
    // updates, which proves nothing.
    const fileOf = (out, id) => out.results[0].knowledge.find((k) => k.id === id).file;
    assert.equal(fileOf(before, 'L-000102'), 'knowledge/L-00/L-000102-widget-retirement.md');
    assert.equal(fileOf(after, 'L-000102'), 'knowledge/L-01/L-000102-widget-retirement.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
