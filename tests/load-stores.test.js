// KK-04: store loader with single health model (PRD §4). One loader parses
// all three stores into an indexed in-memory model; every downstream surface
// (validator, audit, preflight) consumes the SAME diagnostics — they can
// never disagree. These tests exercise the loader only through its public
// seam: loadStores(root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  loadStores,
  DIAGNOSTIC_CODES,
  SEVERITIES,
} from '../payload/engine/lib/load-stores.js';

const fixtures = fileURLToPath(new URL('fixtures/loader/', import.meta.url));
const fixture = (name) => join(fixtures, name);

function byCode(model, code) {
  return model.diagnostics.filter((d) => d.code === code);
}

// -------------------------------------------------------- healthy store

test('healthy store: ok, zero diagnostics', () => {
  const model = loadStores(fixture('healthy'));
  assert.deepEqual(model.diagnostics, []);
  assert.equal(model.ok, true);
});

test('healthy store: entries indexed by id in each id space', () => {
  const model = loadStores(fixture('healthy'));
  assert.deepEqual([...model.concepts.keys()], ['K-210', 'K-220']);
  assert.deepEqual([...model.leaves.keys()], ['362.1', '362.2']);
  assert.deepEqual([...model.decisions.keys()], ['D-004']);
  const sport = model.concepts.get('K-210');
  assert.equal(sport.record.term, 'Sport');
  assert.equal(sport.file, 'ontology/classes/200-sportsbook.yaml');
  const leaf = model.leaves.get('362.1');
  assert.equal(leaf.record.heading, 'ACH settlement windows');
  assert.match(leaf.body, /actual knowledge content/);
  assert.equal(model.decisions.get('D-004').record.status, 'accepted');
});

test('healthy store: pointer index maps source-of-truth paths to concepts (KK-06 --paths)', () => {
  const model = loadStores(fixture('healthy'));
  assert.deepEqual(
    model.pointers.get('src/verticals/sportsbook/sports/registry.ts'),
    ['K-210'],
  );
  assert.deepEqual(model.pointers.get('src/verticals/sportsbook/bet-slip'), ['K-220']);
});

test('healthy store: cross-ref graph edges are typed and resolved', () => {
  const model = loadStores(fixture('healthy'));
  assert.deepEqual(model.refs, [
    { from: '362.1', type: 'cross-references.see-also', to: '362.2', file: 'knowledge/regulation/362.1-ach-settlement-windows.md', path: 'cross-references.see-also[0]', resolved: true },
    { from: 'D-004', type: 'relates-to.concepts', to: 'K-210', file: 'decisions/entries/D-004-three-stores.yaml', path: 'entries[0].relates-to.concepts[0]', resolved: true },
    { from: 'D-004', type: 'relates-to.leaves', to: '362.1', file: 'decisions/entries/D-004-three-stores.yaml', path: 'entries[0].relates-to.leaves[0]', resolved: true },
    { from: 'K-210', type: 'rationale', to: 'D-004', file: 'ontology/classes/200-sportsbook.yaml', path: 'entries[0].rationale[0]', resolved: true },
    { from: 'K-210', type: 'used-by', to: 'K-220', file: 'ontology/classes/200-sportsbook.yaml', path: 'entries[0].used-by[0]', resolved: true },
    { from: 'K-220', type: 'confusable-with', to: 'K-210', file: 'ontology/classes/200-sportsbook.yaml', path: 'entries[1].confusable-with[0]', resolved: true },
  ]);
});

test('healthy store: all three stores present, record files listed', () => {
  const model = loadStores(fixture('healthy'));
  assert.equal(model.stores.ontology.present, true);
  assert.equal(model.stores.knowledge.present, true);
  assert.equal(model.stores.decisions.present, true);
  assert.deepEqual(model.stores.ontology.files, ['ontology/classes/200-sportsbook.yaml']);
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
  const model = loadStores(fixture('malformed'));
  assert.equal(model.ok, false, 'the loader refuses to call a broken store healthy');
  assert.deepEqual(byCode(model, 'parse-error').map(({ file, severity }) => ({ file, severity })), [
    { file: 'decisions/entries/broken.yaml', severity: 'error' },
    { file: 'knowledge/regulation/no-front-matter.md', severity: 'error' },
  ]);
});

test('malformed: schema defects carry the KK-02 codes on the same scale', () => {
  const model = loadStores(fixture('malformed'));
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
  const model = loadStores(fixture('malformed'));
  assert.deepEqual([...model.concepts.keys()], ['K-100']);
});

test('every diagnostic sits on the one scale: severity/code/file/path/message', () => {
  const model = loadStores(fixture('malformed'));
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
  const model = loadStores(fixture('duplicate-id'));
  assert.equal(model.ok, false);
  const dupes = byCode(model, 'duplicate-id');
  const conceptDupe = dupes.find((d) => d.file === 'ontology/classes/200-branch-b.yaml');
  assert.ok(conceptDupe, JSON.stringify(dupes));
  assert.equal(conceptDupe.path, 'entries[0].id');
  assert.match(conceptDupe.message, /K-210/);
  assert.match(conceptDupe.message, /200-branch-a\.yaml/, 'names the first mint');
});

test('duplicate-id: the same id minted twice within one file is the same defect', () => {
  const model = loadStores(fixture('duplicate-id'));
  const dupe = byCode(model, 'duplicate-id')
    .find((d) => d.file === 'decisions/entries/D-001-twice.yaml');
  assert.ok(dupe);
  assert.equal(dupe.path, 'entries[1].id');
  assert.match(dupe.message, /D-001/);
});

test('duplicate-id: the first mint wins the index; the model is still queryable', () => {
  const model = loadStores(fixture('duplicate-id'));
  assert.equal(model.concepts.get('K-210').record.term, 'Sport');
  assert.equal(model.decisions.get('D-001').record.title, 'First mint');
});

// ------------------------------------------------- unresolved refs (§3, §4)

test('unresolved-ref: dangling typed refs error in every store, with paths', () => {
  const model = loadStores(fixture('unresolved-ref'));
  assert.equal(model.ok, false);
  assert.deepEqual(
    byCode(model, 'unresolved-ref').map(({ file, path }) => ({ file, path })),
    [
      { file: 'decisions/entries/D-004-present.yaml', path: 'entries[0].relates-to.concepts[0]' },
      { file: 'knowledge/regulation/362.1-ach-settlement-windows.md', path: 'cross-references.see-also[0]' },
      { file: 'ontology/classes/200-sportsbook.yaml', path: 'entries[0].rationale[0]' },
      { file: 'ontology/classes/200-sportsbook.yaml', path: 'entries[0].used-by[0]' },
    ],
  );
});

test('unresolved-ref: messages name the missing id and its store', () => {
  const model = loadStores(fixture('unresolved-ref'));
  const messages = byCode(model, 'unresolved-ref').map((d) => d.message).join('\n');
  assert.match(messages, /"K-999".*ontology/);
  assert.match(messages, /"D-777".*decisions/);
  assert.match(messages, /"999\.9".*knowledge/);
  assert.match(messages, /"K-888".*ontology/);
});

test('unresolved-ref: catalog-declared pending ids resolve (file check is KK-05)', () => {
  const model = loadStores(fixture('unresolved-ref'));
  const d005 = model.refs.find((r) => r.to === 'D-005');
  assert.equal(d005.resolved, true, 'the catalog never implies a declared id is absent');
  assert.equal(
    byCode(model, 'unresolved-ref').some((d) => d.message.includes('D-005')),
    false,
  );
});

test('unresolved-ref: the graph still records dangling edges as resolved: false', () => {
  const model = loadStores(fixture('unresolved-ref'));
  const dangling = model.refs.filter((r) => !r.resolved).map((r) => r.to).sort();
  assert.deepEqual(dangling, ['999.9', 'D-777', 'K-888', 'K-999']);
});

// ------------------------------------ §3.5 YAML coercion trap, end to end

test('coercion trap: unquoted true/1.0 in a store FILE hard-error; the model is not healthy', () => {
  const model = loadStores(fixture('coercion-trap'));
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
  const model = loadStores(fixture('coercion-trap'));
  const values = model.concepts.get('K-300').record.enumerates[0].values;
  assert.deepEqual(values, ['dark-mode', true, 1.0, 'no']);
});

// -------------------------------------------- missing / empty stores (§6)

test('missing-store: absent store dirs warn, never error — loading is well-defined', () => {
  const model = loadStores(fixture('partial'));
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
  const model = loadStores(fixture('no-catalog'));
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
    for (const dir of ['ontology', 'knowledge', 'decisions']) mkdirSync(join(root, dir));
    for (const file of [
      'ontology/_catalog.yaml', 'ontology/_rules.yaml',
      'knowledge/_catalog.yaml', 'knowledge/_rules.yaml',
      'decisions/_catalog.yaml',
    ]) copyFileSync(join(templates, file), join(root, file));
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
  const model = loadStores(fixture('malformed'));
  const keys = model.diagnostics.map((d) => `${d.file} ${d.path} ${d.code}`);
  assert.deepEqual(keys, [...keys].sort());
});
