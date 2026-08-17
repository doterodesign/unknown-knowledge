// KK-04: store loader with single health model (PRD §4). One loader parses
// all three stores into an indexed in-memory model; every downstream surface
// (validator, audit, preflight) consumes the SAME diagnostics — they can
// never disagree. These tests exercise the loader only through its public
// seam: loadStores(root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  loadStores,
  refEdges,
  REF_FIELDS,
  assertDistinctPaths,
  DIAGNOSTIC_CODES,
  SEVERITIES,
} from '../payload/engine/lib/load-stores.js';

const fixtures = fileURLToPath(new URL('fixtures/loader/', import.meta.url));
const fixture = (name) => join(fixtures, name);

// Fixtures are immutable; load each once and let every test read the model.
const models = new Map();
const fixtureModel = (name) => {
  if (!models.has(name)) models.set(name, loadStores(fixture(name)));
  return models.get(name);
};

function byCode(model, code) {
  return model.diagnostics.filter((d) => d.code === code);
}

// -------------------------------------------------------- healthy store

test('healthy store: ok, zero diagnostics', () => {
  const model = fixtureModel('healthy');
  assert.deepEqual(model.diagnostics, []);
  assert.equal(model.ok, true);
});

test('healthy store: entries indexed by id in each id space', () => {
  const model = fixtureModel('healthy');
  assert.deepEqual([...model.concepts.keys()], ['K-210', 'K-220']);
  // Leaves are keyed by ACCESSION (UCS-1147). This golden read ['362.1',
  // '362.2'] while the notation was a leaf's identity; the fixture minted
  // L-000362/L-000363 and the notation became the legacy display label, which
  // no index answers to.
  assert.deepEqual([...model.leaves.keys()], ['L-000362', 'L-000363']);
  assert.deepEqual([...model.decisions.keys()], ['D-004']);
  const token = model.concepts.get('K-210');
  assert.equal(token.record.term, 'Design token');
  assert.equal(token.file, 'ontology/classes/200-design-system.yaml');
  const leaf = model.leaves.get('L-000362');
  assert.equal(leaf.record.heading, 'Preview deploy windows');
  assert.equal(leaf.notation, '362.1', 'the notation rides along as a published field');
  assert.match(leaf.body, /actual knowledge content/);
  assert.equal(model.decisions.get('D-004').record.status, 'accepted');
});

test('healthy store: pointer index maps source-of-truth paths to concepts (KK-06 --paths)', () => {
  const model = fixtureModel('healthy');
  assert.deepEqual(
    model.pointers.get('src/design-system/tokens/registry.ts'),
    ['K-210'],
  );
  assert.deepEqual(model.pointers.get('src/design-system/component-set'), ['K-220']);
});

test('healthy store: cross-ref graph edges are typed and resolved', () => {
  const model = fixtureModel('healthy');
  // Both ENDS of a leaf edge are accessions now (UCS-1147): the `from` is the
  // declaring leaf's identity, and the `to` is the only spelling a citation may
  // take. This golden read notations at both positions before that ticket.
  //
  // The leaf edge also MOVED, from first row to last, and that is a real
  // consequence rather than a cosmetic one: `refs` is sorted by `from`, so
  // re-identifying leaves from "362.1" to "L-000362" re-sorts the published
  // graph. It is pinned as a golden precisely so a change like that cannot pass
  // unnoticed (PRD §5 diffability).
  assert.deepEqual(model.refs, [
    { from: 'D-004', type: 'relates-to.concepts', to: 'K-210', file: 'decisions/entries/D-004-three-stores.yaml', path: 'entries[0].relates-to.concepts[0]', resolved: true },
    { from: 'D-004', type: 'relates-to.leaves', to: 'L-000362', file: 'decisions/entries/D-004-three-stores.yaml', path: 'entries[0].relates-to.leaves[0]', resolved: true },
    { from: 'K-210', type: 'rationale', to: 'D-004', file: 'ontology/classes/200-design-system.yaml', path: 'entries[0].rationale[0]', resolved: true },
    { from: 'K-210', type: 'used-by', to: 'K-220', file: 'ontology/classes/200-design-system.yaml', path: 'entries[0].used-by[0]', resolved: true },
    { from: 'K-220', type: 'confusable-with', to: 'K-210', file: 'ontology/classes/200-design-system.yaml', path: 'entries[1].confusable-with[0]', resolved: true },
    { from: 'L-000362', type: 'cross-references.see-also', to: 'L-000363', file: 'knowledge/engineering/362.1-preview-deploy-windows.md', path: 'cross-references.see-also[0]', resolved: true },
  ]);
});

test('healthy store: all three stores present, record files listed', () => {
  const model = fixtureModel('healthy');
  assert.equal(model.stores.ontology.present, true);
  assert.equal(model.stores.knowledge.present, true);
  assert.equal(model.stores.decisions.present, true);
  assert.deepEqual(model.stores.ontology.files, ['ontology/classes/200-design-system.yaml']);
  assert.deepEqual(model.stores.decisions.files, ['decisions/entries/D-004-three-stores.yaml']);
  assert.equal(model.stores.ontology.catalog.store, 'ontology');
  assert.equal(model.stores.ontology.rules.store, 'ontology');
  assert.equal(model.stores.decisions.rules, null, 'decisions has no _rules.yaml (§9.1)');
});

test('loading twice is deterministic — identical models (PRD §5 diffability)', () => {
  assert.deepEqual(loadStores(fixture('healthy')), loadStores(fixture('healthy')));
});

test('a nonexistent root is an engine failure, not a diagnostic', () => {
  assert.throws(() => loadStores(fixture('no-such-dir')), /no-such-dir/);
});

// ---------------------------------------------- malformed entries (§4, §5)

test('malformed: unparseable YAML is a parse-error attributed to its file', () => {
  const model = fixtureModel('malformed');
  assert.equal(model.ok, false, 'the loader refuses to call a broken store healthy');
  assert.deepEqual(byCode(model, 'parse-error').map(({ file, severity }) => ({ file, severity })), [
    { file: 'decisions/entries/broken.yaml', severity: 'error' },
    { file: 'knowledge/regulation/no-front-matter.md', severity: 'error' },
  ]);
});

test('malformed: schema defects carry the KK-02 codes on the same scale', () => {
  const model = fixtureModel('malformed');
  const classFile = model.diagnostics.filter((d) => d.file === 'ontology/classes/100-core.yaml');
  assert.deepEqual(
    classFile.map(({ path, code, severity }) => ({ path, code, severity })),
    [
      { path: 'entries[0].status', code: 'invalid-enum-value', severity: 'error' },
      { path: 'entries[0].term', code: 'missing-required', severity: 'error' },
    ],
  );
});

test('malformed: a schema-invalid record with a usable id is still indexed (preflight needs it)', () => {
  const model = fixtureModel('malformed');
  assert.deepEqual([...model.concepts.keys()], ['K-100']);
});

test('every diagnostic sits on the one scale: severity/code/file/path/message', () => {
  const model = fixtureModel('malformed');
  assert.ok(model.diagnostics.length > 0);
  for (const d of model.diagnostics) {
    assert.deepEqual(Object.keys(d).sort(), ['code', 'file', 'message', 'path', 'severity']);
    assert.ok(SEVERITIES.includes(d.severity), d.severity);
    assert.ok(DIAGNOSTIC_CODES.includes(d.code), d.code);
    assert.equal(typeof d.message, 'string');
  }
});

// ------------------------------------------------------ duplicate id (§3.5)

test('duplicate-id: the same id minted in two files errors on the later file', () => {
  const model = fixtureModel('duplicate-id');
  assert.equal(model.ok, false);
  const dupes = byCode(model, 'duplicate-id');
  const conceptDupe = dupes.find((d) => d.file === 'ontology/classes/200-branch-b.yaml');
  assert.ok(conceptDupe, JSON.stringify(dupes));
  assert.equal(conceptDupe.path, 'entries[0].id');
  assert.match(conceptDupe.message, /K-210/);
  assert.match(conceptDupe.message, /200-branch-a\.yaml/, 'names the first mint');
});

test('duplicate-id: the same id minted twice within one file is the same defect', () => {
  const model = fixtureModel('duplicate-id');
  const dupe = byCode(model, 'duplicate-id')
    .find((d) => d.file === 'decisions/entries/D-001-twice.yaml');
  assert.ok(dupe);
  assert.equal(dupe.path, 'entries[1].id');
  assert.match(dupe.message, /D-001/);
});

test('duplicate-id: the first mint wins the index; the model is still queryable', () => {
  const model = fixtureModel('duplicate-id');
  assert.equal(model.concepts.get('K-210').record.term, 'Design token');
  assert.equal(model.decisions.get('D-001').record.title, 'First mint');
});

// ------------------------------------------------- unresolved refs (§3, §4)

test('unresolved-ref: dangling typed refs error in every store, with paths', () => {
  const model = fixtureModel('unresolved-ref');
  assert.equal(model.ok, false);
  assert.deepEqual(
    byCode(model, 'unresolved-ref').map(({ file, path }) => ({ file, path })),
    [
      { file: 'decisions/entries/D-004-present.yaml', path: 'entries[0].relates-to.concepts[0]' },
      { file: 'knowledge/engineering/362.1-preview-deploy-windows.md', path: 'cross-references.see-also[0]' },
      { file: 'ontology/classes/200-design-system.yaml', path: 'entries[0].rationale[0]' },
      { file: 'ontology/classes/200-design-system.yaml', path: 'entries[0].used-by[0]' },
    ],
  );
});

test('unresolved-ref: messages name the missing id and its store', () => {
  const model = fixtureModel('unresolved-ref');
  const messages = byCode(model, 'unresolved-ref').map((d) => d.message).join('\n');
  assert.match(messages, /"K-999".*ontology/);
  assert.match(messages, /"D-777".*decisions/);
  // The dangling leaf target is spelled "L-000999" since UCS-1147 (it was the
  // notation "999.9"). A notation can no longer reach the ref graph at all —
  // the schema refuses it first — so the specimen for a dangling LEAF ref has
  // to be a well-formed accession that names nothing.
  assert.match(messages, /"L-000999".*knowledge/);
  assert.match(messages, /"K-888".*ontology/);
});

test('unresolved-ref: catalog-declared pending ids resolve (file check is KK-05)', () => {
  const model = fixtureModel('unresolved-ref');
  const d005 = model.refs.find((r) => r.to === 'D-005');
  assert.equal(d005.resolved, true, 'the catalog never implies a declared id is absent');
  assert.equal(
    byCode(model, 'unresolved-ref').some((d) => d.message.includes('D-005')),
    false,
  );
});

test('unresolved-ref: the graph still records dangling edges as resolved: false', () => {
  const model = fixtureModel('unresolved-ref');
  const dangling = model.refs.filter((r) => !r.resolved).map((r) => r.to).sort();
  // "999.9" became "L-000999" with the fixture's migration (UCS-1147), which
  // also re-sorts it: the leaf target now sorts among the other id spaces
  // rather than ahead of them all.
  assert.deepEqual(dangling, ['D-777', 'K-888', 'K-999', 'L-000999']);
});

// ------------------------------------ §3.5 YAML coercion trap, end to end

test('coercion trap: unquoted true/1.0 in a store FILE hard-error; the model is not healthy', () => {
  const model = fixtureModel('coercion-trap');
  assert.equal(model.ok, false, 'the loader refuses a healthy verdict on coerced scalars');
  const traps = byCode(model, 'non-string-enumerates-value');
  assert.deepEqual(
    traps.map(({ file, path, severity }) => ({ file, path, severity })),
    [
      { file: 'ontology/classes/300-flags.yaml', path: 'entries[0].enumerates[0].values[1]', severity: 'error' },
      { file: 'ontology/classes/300-flags.yaml', path: 'entries[0].enumerates[0].values[2]', severity: 'error' },
    ],
    'true and 1.0 coerce; dark-mode and no (YAML 1.2) stay strings',
  );
  assert.match(traps[0].message, /quote/i, 'tells the author the fix');
});

test('coercion trap: scalar types survive parsing — never silently stringified', () => {
  const model = fixtureModel('coercion-trap');
  const values = model.concepts.get('K-300').record.enumerates[0].values;
  assert.deepEqual(values, ['dark-mode', true, 1.0, 'no']);
});

// -------------------------------------------- missing / empty stores (§6)

test('missing-store: absent store dirs warn, never error — loading is well-defined', () => {
  const model = fixtureModel('partial');
  assert.equal(model.ok, true, 'warnings do not break health');
  assert.deepEqual(
    model.diagnostics.map(({ severity, code, file }) => ({ severity, code, file })),
    [
      { severity: 'warning', code: 'missing-store', file: 'knowledge' },
      { severity: 'warning', code: 'missing-store', file: 'ontology' },
    ],
  );
  assert.equal(model.stores.ontology.present, false);
  assert.deepEqual([...model.decisions.keys()], ['D-001']);
});

test('missing-catalog: a store dir without its _catalog.yaml is an error', () => {
  const model = fixtureModel('no-catalog');
  assert.equal(model.ok, false);
  assert.deepEqual(
    byCode(model, 'missing-catalog').map(({ severity, file }) => ({ severity, file })),
    [{ severity: 'error', file: 'ontology/_catalog.yaml' }],
  );
  assert.deepEqual([...model.concepts.keys()], ['K-100'], 'records still load and index');
});

test('the empty payload templates load healthy with zero diagnostics (post-init state)', () => {
  const templates = fileURLToPath(new URL('../payload/templates/', import.meta.url));
  const root = mkdtempSync(join(tmpdir(), 'kk04-templates-'));
  try {
    // Copy the whole template tree so this test tracks the payload itself —
    // tests/payload-templates.test.js owns the per-file schema assertions.
    cpSync(templates, root, { recursive: true });
    const model = loadStores(root);
    assert.deepEqual(model.diagnostics, []);
    assert.equal(model.ok, true);
    assert.deepEqual([...model.concepts.keys()], []);
    assert.deepEqual([...model.pointers.keys()], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('diagnostics are stable-sorted by file, then path, then code (PRD §5)', () => {
  const model = fixtureModel('malformed');
  const keys = model.diagnostics.map((d) => `${d.file} ${d.path} ${d.code}`);
  assert.deepEqual(keys, [...keys].sort());
});

// --------------------------------- the declarative ref graph (UCS-1143)
//
// The ref graph is DATA: REF_FIELDS declares each typed edge as a field path
// plus a target id space, and one generic walker serves every row. These tests
// pin the property the frontmatter-v2 edges depend on — that a new edge is a
// new declaration and nothing else. They drive the real walker (`refEdges`)
// with synthetic rows rather than adding a fake edge to the shipped table,
// because a test fixture in REF_FIELDS would ship a phantom edge to every
// consumer of the kit.

// A synthetic record kind standing in for frontmatter v2's `relates` map: a
// nested map of typed arrays, three levels deep — one level deeper than
// anything the walker handled before this ticket.
const RELATES_ROWS = [
  { field: 'meta.relates.depends-on', space: 'leaves' },
  { field: 'meta.relates.see-also', space: 'leaves' },
  { field: 'meta.relates.contradicts', space: 'concepts' },
  { field: 'meta.relates.supersedes', space: 'decisions' },
];

const relatesRecord = {
  meta: {
    relates: {
      'depends-on': ['362.2'],
      'see-also': ['362.1', '362.2'],
      contradicts: ['K-210'],
      supersedes: ['D-004'],
    },
  },
};

test('ref graph: declared field paths three levels deep are walked (UCS-1143)', () => {
  // Depth >= 3 is the acceptance criterion. Before this ticket the walker
  // destructured a fixed [head, tail] pair, so this record yielded nothing.
  const file = 'knowledge/regulation/362.5-nested.md';
  const edges = refEdges(RELATES_ROWS, relatesRecord, { from: '362.5', file });
  assert.deepEqual(edges, [
    { from: '362.5', type: 'meta.relates.depends-on', to: '362.2', file, path: 'meta.relates.depends-on[0]', space: 'leaves' },
    { from: '362.5', type: 'meta.relates.see-also', to: '362.1', file, path: 'meta.relates.see-also[0]', space: 'leaves' },
    { from: '362.5', type: 'meta.relates.see-also', to: '362.2', file, path: 'meta.relates.see-also[1]', space: 'leaves' },
    { from: '362.5', type: 'meta.relates.contradicts', to: 'K-210', file, path: 'meta.relates.contradicts[0]', space: 'concepts' },
    { from: '362.5', type: 'meta.relates.supersedes', to: 'D-004', file, path: 'meta.relates.supersedes[0]', space: 'decisions' },
  ]);
});

test('ref graph: an edge path is walked at any depth, and the path IS the type', () => {
  // One row, four depths, one walker — the generality stated as a property
  // rather than as four hand-written cases.
  const record = { a: ['1'], b: { c: ['2'] }, d: { e: { f: ['3'] } }, g: { h: { i: { j: ['4'] } } } };
  for (const [field, to] of [['a', '1'], ['b.c', '2'], ['d.e.f', '3'], ['g.h.i.j', '4']]) {
    const [edge, ...rest] = refEdges([{ field, space: 'leaves' }], record, { from: 'X', file: 'f' });
    assert.deepEqual(rest, [], `${field}: expected exactly one edge`);
    assert.equal(edge.to, to, `${field}: walked to the wrong array`);
    assert.equal(edge.type, field, `${field}: the declared path is the edge type`);
    assert.equal(edge.path, `${field}[0]`, `${field}: the finding path quotes the declared path`);
  }
});

test('ref graph: a segment with a literal dot is declared as an array of segments', () => {
  // Dotted strings are the ordinary spelling; the array form is the escape
  // hatch for a key that itself contains a dot, so no field is unreachable.
  const record = { 'v1.2': { refs: ['362.1'] } };
  assert.deepEqual(
    refEdges([{ field: ['v1.2', 'refs'], space: 'leaves' }], record, { from: 'X', file: 'f' }),
    [{ from: 'X', type: 'v1.2.refs', to: '362.1', file: 'f', path: 'v1.2.refs[0]', space: 'leaves' }],
  );
});

test('ref graph: a missing or non-object step along a deep path yields no edges', () => {
  // A record that simply does not carry the edge is the common case, never a
  // defect — and a scalar where the walker expected a map must not throw, or
  // one malformed record would crash the whole load (exit 2 territory, PRD §5).
  for (const record of [
    {},
    { meta: null },
    { meta: 'a string where a map was declared' },
    { meta: { relates: 42 } },
    { meta: { relates: { 'depends-on': 'not an array' } } },
    { meta: { relates: { 'depends-on': null } } },
  ]) {
    assert.deepEqual(refEdges(RELATES_ROWS, record, { from: 'X', file: 'f' }), [], JSON.stringify(record));
  }
});

test('ref graph: non-string members are skipped — KK-02 already diagnosed the type', () => {
  // A second complaint from the ref graph would double-report one defect.
  const record = { meta: { relates: { 'see-also': ['362.1', 42, null, { id: '362.2' }, '362.2'] } } };
  const edges = refEdges(RELATES_ROWS, record, { from: 'X', file: 'f' });
  assert.deepEqual(edges.map((e) => e.to), ['362.1', '362.2']);
  // The index is the position in the AUTHOR's array, so the finding path
  // points at the member they actually wrote.
  assert.deepEqual(edges.map((e) => e.path), ['meta.relates.see-also[0]', 'meta.relates.see-also[4]']);
});

test('ref graph: edges nested in a multi-record file carry their entry prefix', () => {
  // The basePath prefix is how a decisions/ entries file attributes an edge to
  // the right record; deep paths compose with it exactly like shallow ones.
  assert.deepEqual(
    refEdges(RELATES_ROWS, relatesRecord, { from: 'D-009', file: 'decisions/entries/D-009.yaml', basePath: 'entries[2]' })
      .map((e) => e.path),
    [
      'entries[2].meta.relates.depends-on[0]',
      'entries[2].meta.relates.see-also[0]',
      'entries[2].meta.relates.see-also[1]',
      'entries[2].meta.relates.contradicts[0]',
      'entries[2].meta.relates.supersedes[0]',
    ],
  );
});

test('ref graph: the shipped table declares every edge as a path plus an id space', () => {
  // REF_FIELDS is the graph. Anything that is not a well-formed row would be
  // an edge the walker silently never collects — a check that never ran.
  const spaces = new Set(['concepts', 'leaves', 'decisions']);
  for (const [kind, rows] of Object.entries(REF_FIELDS)) {
    assert.ok(Array.isArray(rows) && rows.length, `${kind}: expected declared rows`);
    for (const { field, space } of rows) {
      const segments = Array.isArray(field) ? field : field.split('.');
      assert.ok(segments.length >= 1 && segments.every((s) => s), `${kind}: malformed field path ${JSON.stringify(field)}`);
      assert.ok(spaces.has(space), `${kind}: row targets unknown id space "${space}"`);
    }
  }
});

test('ref graph: two declarations that would render the same path are refused', () => {
  // ['a.b','c'] and ['a','b.c'] both render "a.b.c". Two indistinguishable
  // edges would make a finding ambiguous about which declaration produced it,
  // so the TABLE is refused at load rather than believed. The alternative —
  // escaping dots in the rendered path — was rejected deliberately: `type` and
  // `path` are author-facing strings whose job is to be findable in the
  // author's own file, and `v1\.2.refs[0]` matches nothing anyone wrote.
  assert.throws(
    () => assertDistinctPaths({ 'synthetic-kind': [
      { field: ['a.b', 'c'], space: 'leaves' },
      { field: ['a', 'b.c'], space: 'leaves' },
    ] }),
    /render the same path "a\.b\.c"/,
  );

  // The dotted string form collides with the equivalent array form too.
  assert.throws(
    () => assertDistinctPaths({ 'synthetic-kind': [
      { field: 'a.b', space: 'leaves' },
      { field: ['a', 'b'], space: 'leaves' },
    ] }),
    /render the same path "a\.b"/,
  );

  // Distinct renderings are fine, including a dotted segment that collides
  // with nothing — the check refuses ambiguity, not the array form itself.
  assert.doesNotThrow(() => assertDistinctPaths({ 'synthetic-kind': [
    { field: ['v1.2', 'refs'], space: 'leaves' },
    { field: 'v1.3.refs', space: 'leaves' },
    { field: 'plain', space: 'leaves' },
  ] }));

  // Same rendering under DIFFERENT record kinds is not a collision: a finding
  // already knows which kind of record it came from.
  assert.doesNotThrow(() => assertDistinctPaths({
    'kind-a': [{ field: 'a.b', space: 'leaves' }],
    'kind-b': [{ field: ['a', 'b'], space: 'leaves' }],
  }));
});

test('ref graph: the shipped table is unambiguous and frozen all the way down', () => {
  // The shipped table is checked as the module loads; asserting it here keeps
  // the property visible where the rest of the ref-graph contract lives.
  assert.doesNotThrow(() => assertDistinctPaths(REF_FIELDS));

  // Object.freeze is shallow, so the rows and any array-form path need their
  // own freeze — a mutable row is a silently rewritten cross-reference graph.
  assert.equal(Object.isFrozen(REF_FIELDS), true, 'the table itself');
  for (const [kind, rows] of Object.entries(REF_FIELDS)) {
    assert.equal(Object.isFrozen(rows), true, `${kind}: the row array`);
    for (const row of rows) {
      assert.equal(Object.isFrozen(row), true, `${kind}: the row ${JSON.stringify(row.field)}`);
      if (Array.isArray(row.field)) {
        assert.equal(Object.isFrozen(row.field), true, `${kind}: the array-form path`);
      }
    }
  }

  // Frozen means a consumer's write does not land (strict mode throws; the
  // property that matters is that the declaration is unchanged either way).
  const [kind] = Object.keys(REF_FIELDS);
  const before = REF_FIELDS[kind][0].space;
  try {
    REF_FIELDS[kind][0].space = 'mutated';
  } catch {
    // strict-mode ESM throws on writing a frozen property — also acceptable
  }
  assert.equal(REF_FIELDS[kind][0].space, before, 'a consumer must not be able to rewrite a declared row');
});
