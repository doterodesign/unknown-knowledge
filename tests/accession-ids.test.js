// UCS-1144: leaves carry accession ids (L-NNNNNN), minted, indexed, validated.
//
// The expand phase of the identity inversion. A leaf may now mint an opaque
// accession id alongside its positional notation; the loader indexes by the
// accession when present, a collision is a hard error, the structural
// validator checks shape/uniqueness/catalog agreement, and the resolver
// publishes the accession.
//
// The property these tests exist to pin is the one that makes the expand phase
// safe: BOTH citation forms stay legal. An accessioned leaf is still reachable
// by the notation every store, fixture and cross-reference written before it
// was minted spells — so the migrate batches can proceed one leaf at a time
// without a flag day, and nothing downstream has to know two id spaces exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { ID_GRAMMARS, idPattern } from '../payload/engine/lib/id-grammars.js';
import { validateRecord } from '../payload/engine/lib/validate-record.js';

const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const engineCli = (name) => fileURLToPath(new URL(`../payload/engine/${name}`, import.meta.url));
const runCli = (name, ...args) =>
  spawnSync(process.execPath, [engineCli(name), ...args], { encoding: 'utf8' });

const ACCESSIONED = fixture('structural-validator/accessioned');

/**
 * One leaf's file text. `accession` and `seeAlso` are optional so a caller
 * spells only the field the case is about.
 */
const leafFile = ({ heading, notation, accession, seeAlso }) => [
  '---',
  'schema-version: 1',
  ...(accession ? [`id: ${accession}`] : []),
  `notation: "${notation}"`,
  'domain: w',
  `heading: ${heading}`,
  ...(seeAlso ? ['cross-references:', `  see-also: [${seeAlso}]`] : []),
  'citations: [{source: s}]',
  '---',
  'body',
  '',
].join('\n');

/**
 * Load a throwaway store built from the given knowledge leaves and hand the
 * model to `check`. Collision cases turn on which file the loader reads FIRST,
 * which is filename order — so they need a real directory, not a stub.
 *
 * @param {Record<string, string>} leaves filename under knowledge/w → file text
 * @param {(model: object) => void} check assertions against the loaded model
 */
function withStore(leaves, check) {
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
    mkdirSync(join(root, 'knowledge/w'), { recursive: true });
    for (const [name, text] of Object.entries(leaves)) {
      writeFileSync(join(root, 'knowledge/w', name), text);
    }
    check(loadStores(root));
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
  assert.equal(ID_GRAMMARS.accessions.hint, 'L-NNNNNN');
});

test('the leaf-ref grammar accepts either shape, and is composed from both', () => {
  // A citation may spell its target either way while both forms are legal.
  const leafRef = idPattern('leaf-ref');
  assert.match('L-000101', leafRef);
  assert.match('362.1', leafRef);
  assert.doesNotMatch('K-101', leafRef, 'an id from another space is still refused');
  assert.doesNotMatch('L-42', leafRef, 'a malformed accession is not rescued by the union');

  // Composed, never restated — the union carries no third spelling of either
  // member's pattern, which is the property that keeps them from drifting.
  const source = ID_GRAMMARS['leaf-ref'].pattern;
  for (const member of ['accessions', 'knowledge']) {
    const body = ID_GRAMMARS[member].pattern.replace(/^\^/, '').replace(/\$$/, '');
    assert.ok(source.includes(body), `the union must contain the ${member} pattern verbatim`);
  }
  // The hint names both shapes, so an id-shape finding tells an author what
  // they may write — not just that what they wrote was wrong.
  assert.match(ID_GRAMMARS['leaf-ref'].hint, /L-NNNNNN/);
  assert.match(ID_GRAMMARS['leaf-ref'].hint, /362\.1/);
});

test('minting grammars stay strict: a leaf cannot mint an accession into notation', () => {
  // The reason `notation` and `leafRef` are two `$defs` rather than one. If
  // widening citations had widened the minting field, a leaf could carry
  // `notation: L-000101` and hold two identities at once.
  const leaf = (fields) => ({
    'schema-version': 1,
    domain: 'test',
    heading: 'test leaf',
    citations: [{ source: 'test' }],
    ...fields,
  });
  assert.deepEqual(
    validateRecord('knowledge-leaf', leaf({ notation: 'L-000101' })).errors.map((e) => e.code),
    ['pattern-mismatch'],
    'an accession is not a legal notation',
  );
  assert.deepEqual(
    validateRecord('knowledge-leaf', leaf({ notation: '700.1', id: '700.1' })).errors.map((e) => e.code),
    ['pattern-mismatch'],
    'a notation is not a legal accession',
  );
  // Both fields well-formed, and the accession optional: the migration state.
  assert.deepEqual(validateRecord('knowledge-leaf', leaf({ notation: '700.1' })).errors, []);
  assert.deepEqual(
    validateRecord('knowledge-leaf', leaf({ notation: '700.1', id: 'L-000101' })).errors, []);
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

test('the loader indexes an accessioned leaf by its accession, notation aliased', () => {
  const model = loadStores(ACCESSIONED);
  // Identity is the accession — one entry per leaf, keyed by what it IS.
  assert.deepEqual([...model.leaves.keys()], ['L-000101', 'L-000102']);
  // The notation is what it still ANSWERS TO. Aliases are a separate index, so
  // an accessioned leaf is exactly one record however many names reach it.
  assert.deepEqual([...model.leafAliases.entries()], [
    ['700.1', 'L-000101'],
    ['700.2', 'L-000102'],
  ]);
  const leaf = model.leaves.get('L-000101');
  assert.equal(leaf.identity, 'L-000101');
  assert.equal(leaf.notation, '700.1', 'the notation stays on the entry — a published field');
  assert.equal(leaf.id, 'L-000101');
});

test('a leaf with no accession is indexed by notation exactly as before', () => {
  // The whole store is not required to migrate at once; an unminted leaf must
  // behave identically to how it did before this ticket.
  const model = loadStores(fixture('loader/healthy'));
  assert.deepEqual([...model.leaves.keys()], ['362.1', '362.2']);
  assert.equal(model.leafAliases.size, 0, 'nothing to alias when identity is the notation');
  assert.equal(model.leaves.get('362.1').id, null, 'an unminted accession reads null, not absent');
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

  // The loser owns NOTHING — not even its own notation. Indexing the aliases
  // of a leaf that lost its identity would file "700.2" under L-000101, whose
  // entry is a different leaf in a different file: a notation-form citation of
  // 700.2 would then resolve, silently, to the wrong content. Not resolving is
  // recoverable; resolving to the wrong leaf is not.
  assert.deepEqual([...model.leaves.keys()], ['L-000101']);
  assert.deepEqual([...model.leafAliases.entries()], [['700.1', 'L-000101']],
    'the losing leaf contributes no alias');
});

test('a notation collision is caught whichever leaf loads first', () => {
  // Order-independence is the whole content of "hard error". A leaf's notation
  // is claimed whether it serves as that leaf's identity or as the alternate
  // spelling of an accessioned one, so a second claimant must lose either way
  // — otherwise the same two files pass or fail on readdir order, which is a
  // silent pass wearing a clean exit for half the repos that hit it.
  // Every leaf here claims notation "700.1"; only the accession varies.
  const leaf = (heading, accession) => leafFile({ heading, notation: '700.1', accession });

  const cases = [
    ['notation-only first', { 'a.md': leaf('A'), 'b.md': leaf('B', 'L-000102') }, 'knowledge/w/b.md'],
    ['accessioned first', { 'b.md': leaf('B', 'L-000102'), 'z.md': leaf('Z') }, 'knowledge/w/z.md'],
    ['both accessioned', { 'a.md': leaf('A', 'L-000101'), 'b.md': leaf('B', 'L-000102') }, 'knowledge/w/b.md'],
  ];

  for (const [label, leaves, expectedFile] of cases) {
    withStore(leaves, (model) => {
      const duplicates = model.diagnostics.filter((d) => d.code === 'duplicate-id');
      assert.deepEqual(duplicates.map((d) => d.file), [expectedFile],
        `${label}: the SECOND claimant must lose, whichever file that is`);
    });
  }
});

test('a leaf that loses its identity contributes nothing to the ref graph', () => {
  // Same defect class as the misattributed alias. Edges are collected under
  // the leaf's IDENTITY, so collecting them for a leaf that lost that identity
  // files its cross-references under the winner — the graph would show the
  // winning leaf declaring edges it never wrote, in a file it does not own.
  // A losing mint contributes nothing: not an entry, not an alias, not an edge.
  withStore({
    'a.md': leafFile({ heading: 'Winner', accession: 'L-000101', notation: '700.1' }),
    'b.md': leafFile({
      heading: 'Loser', accession: 'L-000101', notation: '700.2', seeAlso: '"999.9"',
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

test('resolver knowledge entry points publish the accession id', () => {
  const out = JSON.parse(
    runCli('resolve.js', 'widget', '--root', ACCESSIONED, '--json').stdout);
  assert.deepEqual(out.results[0].knowledge, [
    {
      id: 'L-000101',
      notation: '700.1',
      heading: 'Widget registry rules',
      file: 'knowledge/widgets/700.1-widget-registry.md',
    },
  ]);
});

test('a notation-only store resolves identically apart from the added field', () => {
  // The golden diff. Strip the new key and the result must be exactly the
  // pre-ticket shape — so every existing consumer keeps reading what it read.
  const out = JSON.parse(
    runCli('resolve.js', 'payment', 'method', '--root', fixture('resolver/store'), '--json').stdout);
  const entries = out.results[0].knowledge;
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry), ['id', 'notation', 'heading', 'file'],
      'the accession takes a FIXED position, so output stays byte-stable');
    assert.equal(entry.id, null, 'an unminted leaf publishes null, never omits the key');
  }
  assert.deepEqual(entries.map(({ id, ...rest }) => rest), [
    {
      notation: '410.2',
      heading: 'Accepted payment instruments',
      file: 'knowledge/payments/410.2-accepted-payment-instruments.md',
    },
  ], 'removing the added field reproduces the pre-ticket output exactly');
});

// ------------------------- AC5: both shapes cite, both shapes can dangle

test('cross-references, relates-to and catalog rows accept either id shape', () => {
  const model = loadStores(ACCESSIONED);
  const edge = (from, type) => model.refs.find((r) => r.from === from && r.type === type);

  // A leaf carrying an accession cites its sibling by NOTATION...
  assert.equal(edge('L-000101', 'cross-references.see-also').to, '700.2');
  assert.equal(edge('L-000101', 'cross-references.see-also').resolved, true);
  // ...and the sibling cites back by ACCESSION. Neither form is second-class.
  assert.equal(edge('L-000102', 'cross-references.class-elsewhere').to, 'L-000101');
  assert.equal(edge('L-000102', 'cross-references.class-elsewhere').resolved, true);

  // A decision's relates-to.leaves reaches leaves by either spelling.
  const relates = model.refs.filter((r) => r.type === 'relates-to.leaves');
  assert.deepEqual(relates.map((r) => [r.to, r.resolved]), [['700.2', true], ['L-000101', true]]);

  // And the catalog — the store's own citation of its leaves — mixes the two
  // without drifting: one row names an accession, the other a notation.
  assert.deepEqual(
    model.stores.knowledge.catalog.entries.map((e) => e.id), ['L-000101', '700.2']);
  assert.deepEqual(loadStores(ACCESSIONED).diagnostics, [], 'no drift, no orphans, no unresolved refs');
});

test('an unresolvable target of EITHER shape is an unresolved-ref finding', () => {
  // Accepting two shapes must not mean accepting anything: a dangling
  // accession and a dangling notation each refuse, from both record kinds.
  const model = loadStores(fixture('loader/unresolved-leaf-ref'));
  const unresolved = model.diagnostics
    .filter((d) => d.code === 'unresolved-ref')
    .map((d) => d.message.match(/ref "([^"]+)"/)[1]);
  assert.deepEqual(unresolved.sort(), ['700.8', '700.9', 'L-000998', 'L-000999'],
    'both shapes dangle loudly, from leaf cross-references and decision relates-to alike');
  assert.equal(model.ok, false);
});

test('log-fragment leaf refs accept either shape', () => {
  // finding/miss/gap fragments cite leaves in `consulted.leaves`; they read the
  // same leaf-ref grammar, so a fragment written after minting is not rejected.
  for (const kind of ['finding', 'gap']) {
    const entry = {
      'schema-version': 1,
      date: '2026-07-07',
      status: 'open',
      summary: 'K-510 had no leaf',
      consulted: { concepts: ['K-510'], leaves: ['L-000101', '700.2'] },
      ...(kind === 'finding' ? { trigger: 'retrieval-miss' } : {}),
    };
    assert.deepEqual(validateRecord(kind, entry).errors, [],
      `${kind}: consulted.leaves must accept both id shapes`);
  }
});
