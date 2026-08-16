// UCS-1148: registries — warrant-governed vocabulary files with membership
// validation.
//
// The governed vocabularies every v2 facet draws from (domains, operations,
// jurisdictions, authority tiers) load through a PER-STORE DESCRIPTOR, so a
// registry is a declared file class rather than a fourth bespoke code path in
// the loader; membership becomes a structural-validator check, because it
// cannot be expressed in the hand-rolled schema subset (a JSON Schema `enum`
// would freeze the vocabulary at seed time, and under D-001 a seeded repo has
// no update channel).
//
// The validator is tested through its public seam — the CLI process, whose
// exit codes and JSON output ARE the contract (PRD §5: 0 clean / 1 findings /
// 2 never-ran). The loader is tested by direct import, as the other pure-lib
// pins are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import {
  REGISTRY_DIR, STORES, STORE_DESCRIPTORS, assertReadersResolve, loadStores,
} from '../payload/engine/lib/load-stores.js';
import {
  CHECKS, FACET_REGISTRIES, GOVERNED_COLLECTIONS, assertGovernedKinds,
} from '../payload/engine/commands/validate.js';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'payload/engine/validate.js');
const fixture = (name) => join(root, 'tests/fixtures/structural-validator', name);

const CLEAN = fixture('registries-clean');
const FINDINGS = fixture('registries-findings');
const MALFORMED = fixture('registries-malformed');
const ABSENT = fixture('registries-absent');
const OPEN_TOP = fixture('registries-open-top-level');

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function runJson(expectStatus, storeRoot) {
  const r = run('--root', storeRoot, '--json');
  assert.equal(r.status, expectStatus, `expected exit ${expectStatus}, got ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Findings as [code, id, path] triples — the golden projection. */
const triples = (payload) => payload.findings.map((f) => [f.code, f.id, f.path]);

function tempCopy(from) {
  const dir = mkdtempSync(join(tmpdir(), 'uk-registries-'));
  cpSync(from, dir, { recursive: true });
  return dir;
}

// ------------------------------------- AC1: the per-store descriptor seam

test('a registry is a DECLARED file class, reached through the store descriptor', () => {
  // The point of the descriptor is that store shape is DATA. If registries
  // were a fourth bespoke code path this table would not mention them, and
  // adding the fifth file class would be another `if` in the loader.
  for (const store of STORES) {
    assert.equal(typeof STORE_DESCRIPTORS[store].registries, 'boolean',
      `${store} must declare whether it carries registries`);
  }
  // §9.1: decisions has no _rules.yaml, and that too is declared, not branched.
  assert.equal(STORE_DESCRIPTORS.decisions.rules, false);
  assert.equal(STORE_DESCRIPTORS.ontology.rules, true);
  assert.equal(STORE_DESCRIPTORS.knowledge.rules, true);
});

test('registries load into the model keyed by "<store>/<name>", with their file', () => {
  const model = loadStores(CLEAN);
  assert.deepEqual([...model.registries.keys()], [
    'knowledge/authority-tiers',
    'knowledge/domains',
    'knowledge/jurisdictions',
    'knowledge/operations',
  ], 'all four governed vocabularies load, deterministically sorted');

  const domains = model.registries.get('knowledge/domains');
  assert.equal(domains.file, `knowledge/${REGISTRY_DIR}/domains.yaml`);
  assert.equal(domains.hierarchical, true);
  assert.deepEqual([...domains.minted].sort(), ['gadgets', 'widgets', 'widgets/care']);
  assert.deepEqual([...domains.suppressed], ['widgets/disposal'],
    'a refused value stays listed — suppression is durable, never a deletion');
  // Flat registries carry no hierarchy claim.
  assert.equal(model.registries.get('knowledge/operations').hierarchical, false);
});

test('registries are governed META, never records: the leaf walk cannot see them', () => {
  const model = loadStores(CLEAN);
  // `_registries/` is underscore-prefixed exactly like `_catalog.yaml` and
  // `_rules.yaml`, so the naming grammar does the separating and there is no
  // exception list to keep in sync. Two leaves loaded; the four registry
  // files did not become leaves, nor a skipped-file warning.
  assert.deepEqual([...model.leaves.keys()], ['600.1', '600.2']);
  assert.deepEqual(model.diagnostics, []);
});

test('a registry file validates against its own shipped schema', () => {
  const doc = load(readFileSync(join(CLEAN, 'knowledge/_registries/domains.yaml'), 'utf8'));
  assert.deepEqual(validateStoreFile('registry', doc).errors, []);
});

// ------------------------- AC1: malformed is exit-2, absence is never silent

test('a MALFORMED registry is a parse hard error — exit 2, never a silent pass', () => {
  const r = run('--root', MALFORMED, '--json');
  assert.equal(r.status, 2, 'a vocabulary the engine could not read is a check that never ran');
  assert.match(r.stderr, /parse-error/);
  assert.match(r.stderr, /knowledge\/_registries\/domains\.yaml/,
    'the refusal names the registry file a steward must open');
  // Degrading to "the registry loaded as empty" would fail every value that
  // WAS minted, wearing exit 1 — a crash dressed as findings (PRD §5).
  assert.equal(r.stdout, '', 'no findings payload is emitted for a store that never loaded');
});

test('a registry with a SCHEMA defect is a hard error too, not a partial vocabulary', () => {
  const dir = tempCopy(CLEAN);
  try {
    // `warrant` is required: a value minted with no material named to fill it
    // is exactly what literary warrant refuses, so the file is refused.
    writeFileSync(join(dir, 'knowledge/_registries/operations.yaml'), [
      'schema-version: 1',
      'store: knowledge',
      'registry: operations',
      'values:',
      '  - value: register',
    ].join('\n'));
    const r = run('--root', dir, '--json');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /missing-required/);
    assert.match(r.stderr, /warrant/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a registry whose declared name disagrees with its filename is refused', () => {
  const dir = tempCopy(CLEAN);
  try {
    const file = join(dir, 'knowledge/_registries/operations.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('registry: operations', 'registry: verbs'));
    const r = run('--root', dir, '--json');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /registry-name-mismatch/);
    // Otherwise every membership finding would cite a registry name that no
    // file answers to, and the file a steward opens would not be the one named.
    assert.match(r.stderr, /"verbs"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an ABSENT registry surfaces explicitly at the value that needed it', () => {
  // The conduct choice this ticket turns on. Registry absence is NOT diagnosed
  // at load: a store carrying no registries is complete and valid, and every
  // store seeded before this layer existed is exactly that store. Absence
  // surfaces where it can mean something — at the point a record CLAIMS a
  // governed value whose vocabulary never loaded.
  const payload = runJson(1, ABSENT);
  assert.ok(payload.findings.length > 0, 'never a silent pass');
  assert.ok(payload.findings.every((f) => f.code === 'missing-registry'));
  const one = payload.findings.find((f) => f.path === 'facets.domain');
  assert.match(one.message, /knowledge\/domains/, 'the finding names the registry it wanted');
  assert.match(one.message, /never ran/, 'and says the membership went unjudged');
});

test('a store with NO registries and NO governed facets stays clean — governance is opt-in', () => {
  // Backward compatibility, pinned. Demanding registries of every store would
  // fail the entire installed base for a layer it never opted into, and a
  // warning on every registry-less store would train stewards to ignore it.
  const payload = runJson(0, fixture('clean'));
  assert.deepEqual(payload.findings, []);
});

// -------------------------------- AC2/AC3: membership findings, by golden

test('every membership finding names both the value and its registry (golden)', () => {
  const payload = runJson(1, FINDINGS);
  assert.deepEqual(triples(payload), [
    ['unregistered-value', '600.1', 'applies.jurisdictions[1]'],
    ['unregistered-value', '600.1', 'citations[0].authority'],
    ['unregistered-value', '600.1', 'operations[1]'],
    ['unminted-segment', '600.2', 'facets.domain'],
    ['unminted-segment', '600.3', 'facets.domain'],
    ['suppressed-value', '600.4', 'facets.domain'],
  ]);
  for (const f of payload.findings) {
    assert.match(f.message, /knowledge\/(domains|operations|jurisdictions|authority-tiers)/,
      `${f.code} must name the registry: ${f.message}`);
  }
});

test('an unregistered value names the value and the registry FILE a steward opens', () => {
  const payload = runJson(1, FINDINGS);
  const f = payload.findings.find((x) => x.path === 'operations[1]');
  assert.equal(f.code, 'unregistered-value');
  assert.match(f.message, /"dismantle"/, 'the value');
  assert.match(f.message, /"knowledge\/operations" registry/, 'the registry');
  assert.match(f.message, /knowledge\/_registries\/operations\.yaml/, 'and the file');
});

test('hierarchical domains: a child is valid only if EVERY segment is minted', () => {
  const payload = runJson(1, FINDINGS);
  // An unminted TOP segment: the finding names `sprockets`, not the whole
  // path — the segment is the registry edit the author can actually make.
  const parent = payload.findings.find((x) => x.id === '600.2');
  assert.equal(parent.code, 'unminted-segment');
  assert.match(parent.message, /the segment "sprockets" is not minted/);
  assert.match(parent.message, /"sprockets\/care"/, 'the offending value is named too');

  // A minted parent with an unminted child: the missing segment is the child.
  const child = payload.findings.find((x) => x.id === '600.3');
  assert.equal(child.code, 'unminted-segment');
  assert.match(child.message, /the segment "widgets\/packaging" is not minted/);

  // And the clean store proves the rule is not simply "reject every path":
  // `widgets/care` passes because `widgets` is minted in its own right.
  assert.deepEqual(runJson(0, CLEAN).findings, []);
});

test('a SUPPRESSED value reads as refused, never as a typo', () => {
  const payload = runJson(1, FINDINGS);
  const f = payload.findings.find((x) => x.code === 'suppressed-value');
  assert.match(f.message, /SUPPRESSED/);
  assert.match(f.message, /proposed and refused/);
  // "not in the registry" would invite the author to fix their spelling
  // rather than read the decision that went against them.
  assert.doesNotMatch(f.message, /is not minted in/);
});

test('a suppressed hierarchical class mints no children', () => {
  const dir = tempCopy(CLEAN);
  try {
    const leaf = join(dir, 'knowledge/widgets/600.1-gadget-registry.md');
    writeFileSync(leaf, readFileSync(leaf, 'utf8')
      .replace('domain: widgets/care', 'domain: widgets/disposal/bins'));
    const payload = JSON.parse(run('--root', dir, '--json').stdout);
    const f = payload.findings.find((x) => x.path === 'facets.domain');
    assert.equal(f.code, 'suppressed-value');
    assert.match(f.message, /descends from "widgets\/disposal", which is SUPPRESSED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('membership findings gate to exit 1, and every check class is reported as run', () => {
  const payload = runJson(1, FINDINGS);
  assert.equal(payload.counts.errors, 6);
  assert.equal(payload.counts.warnings, 0);
  for (const code of ['missing-registry', 'suppressed-value', 'unminted-segment', 'unregistered-value']) {
    assert.ok(CHECKS.includes(code), `${code} must be reported in the checks list`);
    assert.ok(payload.checks.includes(code));
  }
});

// ------------------------------- AC4: the domains registry top level is open

test('adding a TOP-LEVEL domain class is a registry edit plus a Decisions entry', () => {
  // The fixture mints `logistics` — a top-level class that exists in this
  // store and nowhere else — and a leaf files under `logistics/transfer`.
  const payload = runJson(0, OPEN_TOP);
  assert.deepEqual(payload.findings, [], 'the store validates clean');

  const model = loadStores(OPEN_TOP);
  const domains = model.registries.get('knowledge/domains');
  assert.ok(domains.minted.has('logistics'), 'the new top-level class is minted');
  // Its governance is a Decisions entry, exactly as the conduct requires.
  assert.ok(model.decisions.has('D-202'));
  assert.match(model.decisions.get('D-202').record.decision, /top-level/i);
});

test('the open top level needs NO schema and NO engine change — proven by diff', () => {
  // The strongest form of this criterion: the ONLY difference between the
  // clean store and the store carrying a brand-new top-level class is store
  // DATA — registry values, a leaf, a catalog row, a Decisions entry. If a
  // top-level class needed an allocation somewhere in the kit, this test
  // could not pass, because the two stores share one engine and one schema.
  const engineFiles = ['payload/engine/commands/validate.js', 'payload/engine/lib/load-stores.js'];
  for (const file of [...engineFiles, 'payload/schemas/registry.schema.json', 'payload/schemas/knowledge-leaf.schema.json']) {
    const text = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(text, /\blogistics\b/,
      `${file} must not know the fixture's top-level class — the registry alone decides what the top level contains`);
    assert.doesNotMatch(text, /\bwidgets\b/, `${file} must not know any domain value`);
  }
});

test('the engine holds no list of legal facet values anywhere', () => {
  // A JSON Schema `enum` would have been the obvious implementation and is
  // the one this ticket refuses: under D-001 (seeded once, no update channel)
  // an enum freezes the vocabulary at seed time for the life of the repo.
  const schema = JSON.parse(readFileSync(join(root, 'payload/schemas/knowledge-leaf.schema.json'), 'utf8'));
  assert.equal(schema.properties.facets.properties.domain.enum, undefined,
    'domain must be a governed registry value, never a schema enum');
  assert.equal(schema.properties.operations.items.enum, undefined);
  assert.equal(schema.$defs.citation.properties.authority.enum, undefined);
});

// ------------------------------- AC5: the field→registry declaration map

// -------------------- registry shape, duplicates, and governed decision refs
// (post-review hardening: each of these was a silent pass before.)

test('a registry whose shape disagrees with its facet is refused, not silently obeyed', () => {
  // The worst of the silent passes: dropping `hierarchical: true` from the
  // domains registry turned every path into an opaque string, disabling the
  // segment rule entirely — at exit 0, with nothing reported.
  const dir = tempCopy(CLEAN);
  try {
    const file = join(dir, 'knowledge/_registries/domains.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^hierarchical: true\n/m, ''));
    const payload = JSON.parse(run('--root', dir, '--json').stdout);
    const f = payload.findings.find((x) => x.code === 'registry-shape-mismatch');
    assert.ok(f, 'a flat domains registry must be refused, never quietly obeyed');
    // Reported ONCE, against the registry file — that is the one edit that
    // fixes it. Per-leaf reporting would bury it under a finding per leaf.
    assert.equal(payload.findings.filter((x) => x.code === 'registry-shape-mismatch').length, 1);
    assert.equal(f.file, 'knowledge/_registries/domains.yaml');
    assert.match(f.message, /must be hierarchical/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the converse shape mismatch is refused too: a flat facet on a hierarchical registry', () => {
  const dir = tempCopy(CLEAN);
  try {
    const file = join(dir, 'knowledge/_registries/operations.yaml');
    writeFileSync(file, readFileSync(file, 'utf8')
      .replace('registry: operations', 'registry: operations\nhierarchical: true'));
    const payload = JSON.parse(run('--root', dir, '--json').stdout);
    const f = payload.findings.find((x) => x.code === 'registry-shape-mismatch');
    assert.ok(f, 'path-splitting a flat vocabulary would demand parents nobody minted');
    assert.match(f.message, /declares itself hierarchical/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('one value declared twice in a registry is refused', () => {
  const dir = tempCopy(CLEAN);
  try {
    const file = join(dir, 'knowledge/_registries/operations.yaml');
    writeFileSync(file, `${readFileSync(file, 'utf8')}  - value: register
    gloss: A redundant second row for a value already minted above.
    warrant: Duplicate.
    decision: D-201
`);
    const r = run('--root', dir, '--json');
    assert.equal(r.status, 2, 'a registry that declares a value twice never loaded cleanly');
    assert.match(r.stderr, /duplicate-registry-value/);
    assert.match(r.stderr, /two warrants with no way to tell which one governs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a value both MINTED and SUPPRESSED is refused, never settled by file order', () => {
  // Before this check the value landed in both sets, and because judgeValue
  // tests suppression first a minted value silently read as refused — the
  // engine resolving a governance contradiction by evaluation order.
  const dir = tempCopy(CLEAN);
  try {
    const file = join(dir, 'knowledge/_registries/operations.yaml');
    writeFileSync(file, `${readFileSync(file, 'utf8')}  - value: register
    gloss: The same value, this time refused.
    warrant: Contradicts the minting above.
    status: suppressed
    decision: D-201
`);
    const r = run('--root', dir, '--json');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /declared as both minted and suppressed/);
    assert.match(r.stderr, /governance decision nobody made/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a registry filed under the wrong store is refused', () => {
  const dir = tempCopy(CLEAN);
  try {
    const file = join(dir, 'knowledge/_registries/jurisdictions.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('store: knowledge', 'store: ontology'));
    const r = run('--root', dir, '--json');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /registry-store-mismatch/);
    assert.match(r.stderr, /governs the store it sits in/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every registry value MUST cite a Decisions entry, and the citation must resolve', () => {
  // "Each minting a Decisions entry" enforced mechanically rather than left to
  // conduct: a vocabulary change nobody signed is exactly what the warrant rule
  // exists to prevent.
  const schema = JSON.parse(readFileSync(join(root, 'payload/schemas/registry.schema.json'), 'utf8'));
  assert.ok(schema.$defs.registryValue.required.includes('decision'),
    'a value citing no decision is a vocabulary change nobody signed');

  const dir = tempCopy(CLEAN);
  try {
    const file = join(dir, 'knowledge/_registries/operations.yaml');
    // A well-formed id that names no decision: it rides the ordinary ref graph,
    // so it fails as the same unresolved-ref error as any other dangling
    // cross-store citation rather than through bespoke registry machinery.
    writeFileSync(file, readFileSync(file, 'utf8').replace('decision: D-201', 'decision: D-999'));
    const r = run('--root', dir, '--json');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unresolved-ref/);
    assert.match(r.stderr, /D-999/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a whitespace-only warrant is refused — the field must carry actual material', () => {
  const dir = tempCopy(CLEAN);
  try {
    const file = join(dir, 'knowledge/_registries/operations.yaml');
    writeFileSync(file, readFileSync(file, 'utf8')
      .replace('warrant: 600.1 documents the registration procedure.', 'warrant: "   "'));
    const r = run('--root', dir, '--json');
    assert.equal(r.status, 2, 'blank warrant is speculative shelving wearing a filled field');
    assert.match(r.stderr, /pattern-mismatch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('governed KINDS are declared too — the checker hardcodes no kind/collection pair', () => {
  // Both tables are read together, so a second governed record kind (UCS-1149)
  // is two table entries rather than an edit to the walker.
  assert.deepEqual(Object.keys(GOVERNED_COLLECTIONS), Object.keys(FACET_REGISTRIES),
    'every facet-governed kind must name the model collection its records live in');
  assert.equal(GOVERNED_COLLECTIONS['knowledge-leaf'], 'leaves');
});

test('a facet table naming a kind with no collection is refused at load', () => {
  // Such a row would look governed in the table and be checked in no store —
  // a facet governed by nothing, which is the failure class the engine exists
  // to prevent. Refused as an engine failure, never a silent pass.
  assert.throws(
    () => assertGovernedKinds({ ...FACET_REGISTRIES, 'ontology-concept': [] }),
    /maps to no model collection/,
  );
  assert.doesNotThrow(() => assertGovernedKinds(FACET_REGISTRIES));
});

test('a descriptor naming a reader that does not exist is refused at load', () => {
  // A store whose reader never resolves loads ZERO records and says nothing,
  // which is indistinguishable from an empty store.
  assert.throws(
    () => assertReadersResolve({ knowledge: { reader: 'noSuchReader' } }),
    /does not exist/,
  );
  assert.doesNotThrow(() => assertReadersResolve(STORE_DESCRIPTORS));
  // The knowledge store's bespoke leaf reader is named in the TABLE, so the
  // load loop asks each store how it is read rather than knowing one is special.
  assert.equal(STORE_DESCRIPTORS.knowledge.reader, 'loadLeafFiles');
  assert.equal(STORE_DESCRIPTORS.knowledge.records, null);
  for (const store of ['ontology', 'decisions']) {
    assert.equal(STORE_DESCRIPTORS[store].reader, undefined, `${store} is a plain walk`);
  }
});

test('a registry decision ref is store-qualified, like the registry key itself', () => {
  // `refs` is a published, from-sorted model field: two identically named
  // registries in different stores must not share an edge origin.
  const model = loadStores(CLEAN);
  const edges = model.refs.filter((r) => r.type === 'registry.decision');
  assert.ok(edges.length > 0, 'the clean store cites decisions from its registries');
  for (const edge of edges) {
    assert.match(edge.from, /^knowledge\/(domains|operations|jurisdictions|authority-tiers)\//,
      `edge origin must carry the store: ${edge.from}`);
    assert.equal(edge.resolved, true);
  }
});

test('facet→registry is a DECLARATION, not a per-facet branch', () => {
  // The seam UCS-1149 extends: a new governed facet is a new row here, and
  // nothing in the checker changes. Every declared registry must be one the
  // shipped templates actually seed, or a client would meet a facet governed
  // by a vocabulary that does not exist.
  const declared = FACET_REGISTRIES['knowledge-leaf'].map((r) => r.registry);
  assert.deepEqual([...declared].sort(), [
    'knowledge/authority-tiers',
    'knowledge/domains',
    'knowledge/jurisdictions',
    'knowledge/operations',
  ]);
  for (const row of FACET_REGISTRIES['knowledge-leaf']) {
    assert.ok(Object.isFrozen(row), 'a mutated row would silently reroute a facet at another vocabulary');
    assert.equal(typeof row.field, 'string');
    // Each row declares the registry SHAPE it needs, so a registry that
    // disagrees is caught rather than silently obeyed.
    assert.equal(typeof row.hierarchical, 'boolean', `${row.field} must declare its registry shape`);
  }
  // Only the domain facet is hierarchical; the rest are flat vocabularies.
  assert.deepEqual(
    FACET_REGISTRIES['knowledge-leaf'].filter((r) => r.hierarchical).map((r) => r.field),
    ['facets.domain'],
  );
});

test('the declaration map drives the checker: every declared facet is checked', () => {
  // Each row must actually produce a finding when its value is unminted —
  // a declared-but-unwalked row would be a governed facet silently ungoverned.
  const paths = triples(runJson(1, FINDINGS)).map(([, , path]) => path);
  assert.ok(paths.some((p) => p.startsWith('facets.domain')), 'facets.domain');
  assert.ok(paths.some((p) => p.startsWith('operations')), 'operations');
  assert.ok(paths.some((p) => p.startsWith('applies.jurisdictions')), 'applies.jurisdictions');
  assert.ok(paths.some((p) => p.endsWith('.authority')), 'citations[].authority');
});

// -------------------------------- AC5: conduct docs and templates, shipped

test('the warrant conduct doc ships through the D-007 manifest', () => {
  const manifest = readFileSync(join(root, 'cli/kit.manifest.yaml'), 'utf8');
  assert.match(manifest, /from: protocol\/registry-warrant\.md, to: protocol\/registry-warrant\.md/);
});

test('the four registry templates and the minting Decisions template are manifest-listed', () => {
  const manifest = readFileSync(join(root, 'cli/kit.manifest.yaml'), 'utf8');
  for (const name of ['domains', 'operations', 'jurisdictions', 'authority-tiers']) {
    assert.match(
      manifest,
      new RegExp(`from: templates/knowledge/_registries/${name}\\.yaml, to: knowledge/_registries/${name}\\.yaml`),
      `${name} registry must seed into the client's knowledge store`,
    );
  }
  assert.match(manifest, /from: templates\/decisions\/registry-minting\.yaml/);
});

test('every shipped registry template validates and seeds EMPTY', () => {
  for (const name of ['domains', 'operations', 'jurisdictions', 'authority-tiers']) {
    const path = join(root, 'payload/templates/knowledge/_registries', `${name}.yaml`);
    const doc = load(readFileSync(path, 'utf8'));
    assert.deepEqual(validateStoreFile('registry', doc).errors, [], name);
    assert.equal(doc.registry, name, `${name}: declared name must equal the filename`);
    assert.equal(doc.store, 'knowledge');
    // Empty by design: the bootstrap interview mints the first values from
    // material that already exists. A pre-populated registry would be values
    // minted with no warrant — the one thing the conduct forbids.
    assert.deepEqual(doc.values, [], `${name}: registries seed empty (literary warrant)`);
  }
  assert.equal(
    load(readFileSync(join(root, 'payload/templates/knowledge/_registries/domains.yaml'), 'utf8')).hierarchical,
    true,
    'domains is the hierarchical registry',
  );
});

test('the minting Decisions template is a decision entry in every field but its placeholders', () => {
  const path = join(root, 'payload/templates/decisions/registry-minting.yaml');
  const doc = load(readFileSync(path, 'utf8'));
  const entry = doc.entries[0];
  // Drafted provisionally (§3.5): `status: proposed`, category `governance` —
  // a registry edit changes what the Store may say, not how the engine works.
  assert.equal(entry.status, 'proposed');
  assert.equal(entry.category, 'governance');
  assert.equal(doc['schema-version'], 1);

  // The template carries UNFILLED placeholders on exactly the two fields a
  // steward must supply — and it fails validation because of them, on purpose.
  // Same conduct as the audit's `K-XXX` drafts: pasting an unedited template
  // must NOT produce a valid entry, or a placeholder rationale could reach the
  // Decisions store and a registry value would carry a warrant nobody wrote.
  const { errors } = validateStoreFile('decision-entry', doc);
  assert.deepEqual(errors.map((e) => [e.path, e.code]), [
    ['entries[0].date', 'pattern-mismatch'],
    ['entries[0].id', 'pattern-mismatch'],
  ], 'the template refuses to validate until its placeholders are filled');

  // Everything else is real, so filling those two fields yields a valid entry.
  const filled = load(readFileSync(path, 'utf8'));
  filled.entries[0].id = 'D-2026-07-08-mint-example-domain';
  filled.entries[0].date = '2026-07-08';
  assert.deepEqual(validateStoreFile('decision-entry', filled).errors, []);
});

test('the conduct doc states the warrant rule, the suppression rule, and the open top level', () => {
  const doc = readFileSync(join(root, 'payload/protocol/registry-warrant.md'), 'utf8');
  assert.match(doc, /minted only when material exists to fill it/i, 'literary warrant');
  assert.match(doc, /literary warrant/i);
  assert.match(doc, /top level is open/i);
  assert.match(doc, /status: suppressed/, 'suppression, not deletion');
  // Every finding code the doc promises must be one the validator can emit.
  for (const code of ['unregistered-value', 'unminted-segment', 'suppressed-value', 'missing-registry']) {
    assert.ok(doc.includes(code), `conduct doc must document ${code}`);
    assert.ok(CHECKS.includes(code), `${code} must be a real check`);
  }
});

test('the conduct doc names the real registry paths and the real templates', () => {
  const doc = readFileSync(join(root, 'payload/protocol/registry-warrant.md'), 'utf8');
  for (const name of ['domains', 'operations', 'jurisdictions', 'authority-tiers']) {
    assert.ok(doc.includes(`knowledge/_registries/${name}.yaml`), `doc must name the ${name} path`);
  }
  assert.ok(doc.includes('templates/decisions/registry-minting.yaml'),
    'the doc must point at the template a steward actually copies');
});
