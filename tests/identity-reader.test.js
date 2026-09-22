import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subjectGovernanceFixture } from './helpers/subject-governance-fixture.js';
import { loadStores } from '../payload/engine/lib/load-stores.js';
import { iterateCurrentRecords, iterateProposalRecords } from '../payload/engine/lib/record-identity.js';
import { resolveRecord } from '../payload/engine/lib/record-identity-index.js';
import { validateStoreFile } from '../payload/engine/lib/validate-record.js';
import { validateValues } from '../payload/engine/commands/validate-values.js';
import { runChecks } from '../payload/engine/commands/validate.js';
import { runPreflight } from '../payload/engine/lib/preflight.js';
import { load } from 'js-yaml';
import { lookupSubjects } from '../payload/engine/lib/subjects.js';
import { locateKit } from '../payload/engine/lib/kit-root.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { indexRegistryValues } from '../payload/engine/lib/registry-values.js';
import { knownVocabulary } from '../payload/engine/lib/coverage.js';
import { canonicalSha256 } from '../payload/engine/lib/canonical-json.js';
import { assignmentEventFixture } from './helpers/assignment-event-fixture.js';

const namespace = '11111111-1111-4111-8111-111111111111';
const publication = { id: '22222222-2222-4222-8222-222222222222', review: 'review:cutover' };
const proposal = 'proposal:decision:33333333-3333-4333-8333-333333333333';
const decision = (id = 'D-000001', status = 'accepted') => ({
  id, title: 'Direction', category: 'architecture', status, date: '2026-09-19',
  deciders: ['steward'], context: 'Observed context', decision: 'Reviewed direction',
});
function fixture(t, { proposals = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'identity-reader-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const identity = { 'schema-version': 1, 'identity-format': 1, namespace,
    allocations: [{ kind: 'decision', id: 'D-000001', state: 'allocated', publication }] };
  const catalog = { 'schema-version': 2, store: 'decisions', entries: [
    { id: 'D-000001', title: 'Direction', file: 'entries/direction.yaml' },
    ...(proposals ? [{ id: proposal, title: 'Proposal', file: 'entries/direction.yaml' }] : []),
  ] };
  const records = { 'schema-version': 2, entries: [decision(), ...(proposals ? [decision(proposal, 'proposed')] : [])] };
  function put(file, value) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), JSON.stringify(value));
  }
  put('_identity.yaml', identity);
  put('decisions/_catalog.yaml', catalog);
  put('decisions/entries/direction.yaml', records);
  return { root, identity, catalog, records, put };
}

test('actual reader loads required identity and distinct canonical/proposal captures', (t) => {
  const f = fixture(t, { proposals: true });
  const model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.deepEqual(model.identity, f.identity);
  assert.deepEqual([...model.decisions.keys()], ['D-000001']);
  assert.deepEqual([...model.proposals.decision.keys()], [proposal]);
  assert.equal(iterateCurrentRecords(model, { kinds: ['decision'] }).length, 1);
  assert.equal(iterateProposalRecords(model, { kinds: ['decision'] })[0].entry.record.id, proposal);
  assert.equal(resolveRecord(model.identityIndex, { namespace, kind: 'decision', id: 'D-000001' }).status, 'loaded');
  assert.equal(resolveRecord(model.identityIndex, { namespace, kind: 'decision', id: proposal }).status, 'invalid');
});

test('required identity, exact active versions and old IDs fail the real reader', (t) => {
  for (const mutate of [
    (f) => rmSync(join(f.root, '_identity.yaml')),
    (f) => { f.identity['identity-format'] = 2; f.put('_identity.yaml', f.identity); },
    (f) => { f.identity.allocations = []; f.put('_identity.yaml', f.identity); },
    (f) => { f.catalog['schema-version'] = 1; f.put('decisions/_catalog.yaml', f.catalog); },
    (f) => { f.records['schema-version'] = 1; f.put('decisions/entries/direction.yaml', f.records); },
    (f) => { f.records.entries[0].id = 'D-1'; f.put('decisions/entries/direction.yaml', f.records); },
  ]) {
    const f = fixture(t);
    mutate(f);
    const model = loadStores(f.root);
    assert.equal(model.ok, false, 'old, missing, mixed or unallocated inputs must fail');
    assert.throws(() => iterateCurrentRecords(model, { kinds: ['decision'] }), { code: 'invalid-model' });
  }
});

test('catalog declarations and duplicate claims keep actual source locators', (t) => {
  const f = fixture(t);
  f.identity.allocations.push({ kind: 'decision', id: 'D-000002', state: 'allocated', publication });
  f.catalog.entries.push({ id: 'D-000002', title: 'Pending', file: 'pending-import' });
  f.put('_identity.yaml', f.identity);
  f.put('decisions/_catalog.yaml', f.catalog);
  let model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const pending = resolveRecord(model.identityIndex, { namespace, kind: 'decision', id: 'D-000002' });
  assert.equal(pending.status, 'declared-only');
  assert.deepEqual(pending.declarations[0], {
    target: 'pending-import', locator: { file: 'decisions/_catalog.yaml', path: 'entries[1]' },
  });
  f.put('decisions/entries/duplicate.yaml', f.records);
  model = loadStores(f.root);
  assert.equal(model.ok, false);
  const duplicate = model.diagnostics.find(({ code }) => code === 'duplicate-id');
  assert.match(duplicate.message, /rebuild the unpublished candidate against the current ledger; never renumber published identities/);
  const result = resolveRecord(model.identityIndex, { namespace, kind: 'decision', id: 'D-000001' });
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates.filter(({ source }) => source === 'record').map(({ locator }) => locator), [
    { file: 'decisions/entries/direction.yaml', path: 'entries[0]' },
    { file: 'decisions/entries/duplicate.yaml', path: 'entries[0]' },
  ]);
});

test('a proposal catalog row requires its actual same-file proposal payload', (t) => {
  const f = fixture(t, { proposals: true });
  f.records.entries.pop();
  f.put('decisions/entries/direction.yaml', f.records);
  const model = loadStores(f.root);
  assert.equal(model.ok, false, 'missing proposal payload cannot look like complete empty draft capture');
  assert.ok(model.diagnostics.some(({ code, file, path }) => code === 'invalid-identity'
    && file === 'decisions/_catalog.yaml' && path === 'entries[1]'));
});

test('record schemas accept canonical/proposal identities at only their active file version', () => {
  const docs = [
    ['decision-entry', { 'schema-version': 2, entries: [decision(), decision(proposal, 'proposed')] }],
    ['ontology-concept', { 'schema-version': 2, entries: [{ id: 'O-000001', term: 'Source', class: 'arbitrary', summary: 'Meaning', status: 'draft' }] }],
    ['knowledge-leaf', { 'schema-version': 3, id: 'K-000001', domain: 'world', heading: 'Evidence', citations: [{ source: 'recorded-source' }] }],
  ];
  for (const [kind, doc] of docs) {
    assert.equal(validateStoreFile(kind, doc).ok, true, `${kind}: ${JSON.stringify(validateStoreFile(kind, doc))}`);
    for (const version of [0, 1, 99]) {
      const invalid = validateStoreFile(kind, { ...doc, 'schema-version': version });
      assert.equal(invalid.ok, false, `${kind} must reject version ${version}`);
      assert.ok(invalid.errors.some(({ code, path }) => code === 'invalid-schema-version' && path === 'schema-version'));
    }
  }
});

test('every operational file kind enforces its agreed exact cutover version', () => {
  for (const [kind, version] of Object.entries({ 'knowledge-leaf': 3, 'ontology-concept': 2, 'decision-entry': 2,
    catalog: 2, registry: 2, 'graduation-categories': 2, 'phoenix-event': 2, finding: 2, gap: 2,
    miss: 1, rules: 1, 'survey-scope': 1 })) {
    for (const value of [0, 1, 2, 3, 99]) {
      const checked = validateStoreFile(kind, { 'schema-version': value });
      assert.equal(checked.errors.some(({ code }) => code === 'invalid-schema-version'), value !== version,
        `${kind} accepts exactly version ${version}`);
    }
  }
});

test('moving and reclassifying an Ontology record never ties identity to a filename range', (t) => {
  const f = fixture(t);
  f.identity.allocations.push({ kind: 'ontology', id: 'O-900001', state: 'allocated', publication });
  f.put('_identity.yaml', f.identity);
  const record = { id: 'O-900001', term: 'Meaning', class: 'arbitrary', summary: 'Definition', status: 'active' };
  f.put('ontology/classes/100-arbitrary.yaml', { 'schema-version': 2, entries: [record] });
  const catalog = { 'schema-version': 2, store: 'ontology', entries: [{ id: record.id, title: 'Meaning', file: 'classes/100-arbitrary.yaml' }] };
  f.put('ontology/_catalog.yaml', catalog);
  let model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.equal(runChecks(model).some(({ code }) => code === 'id-range'), false);
  rmSync(join(f.root, 'ontology/classes/100-arbitrary.yaml'));
  record.class = 'moved';
  record.term = 'Renamed meaning';
  f.put('ontology/classes/500-moved.yaml', { 'schema-version': 2, entries: [record] });
  catalog.entries[0].file = './classes/500-moved.yaml';
  f.put('ontology/_catalog.yaml', catalog);
  model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.equal(resolveRecord(model.identityIndex, { namespace, kind: 'ontology', id: record.id }).entry.record.term, 'Renamed meaning');
  assert.equal(runChecks(model).some(({ code }) => code === 'index-drift'), false);
});

test('draft Knowledge dependencies resolve drafts, effective dependencies cannot borrow proposal authority', (t) => {
  const f = fixture(t);
  const targetId = proposal.replace('decision', 'knowledge');
  const sourceId = targetId.replace('333333333333', '444444444444');
  const leaf = (id, stage) => ({ 'schema-version': 3, id, domain: 'world', heading: 'Evidence',
    citations: [{ source: 'recorded-source' }], facets: { stage } });
  const source = { ...leaf(sourceId, 'draft'), relates: { 'depends-on': [targetId] } };
  const target = leaf(targetId, 'draft');
  function writeLeaf(file, record) {
    mkdirSync(join(f.root, 'knowledge'), { recursive: true });
    writeFileSync(join(f.root, file), `---\n${JSON.stringify(record)}\n---\nObserved evidence.\n`);
  }
  const catalog = { 'schema-version': 2, store: 'knowledge', entries: [
    { id: sourceId, title: 'Source', file: 'source.md' }, { id: targetId, title: 'Target', file: 'target.md' },
  ] };
  f.put('knowledge/_catalog.yaml', catalog);
  writeLeaf('knowledge/source.md', source);
  writeLeaf('knowledge/target.md', target);
  let model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.equal(model.refs.find(({ type }) => type === 'relates.depends-on').resolution, 'proposal');
  assert.equal(model.leaves.size, 0);
  assert.equal(iterateProposalRecords(model, { kinds: ['knowledge'] }).length, 2);
  source.id = 'K-000001';
  source.facets.stage = 'verified';
  catalog.entries[0].id = source.id;
  f.identity.allocations.push({ kind: 'knowledge', id: source.id, state: 'allocated', publication });
  f.put('_identity.yaml', f.identity);
  f.put('knowledge/_catalog.yaml', catalog);
  writeLeaf('knowledge/source.md', source);
  model = loadStores(f.root);
  assert.equal(model.ok, false);
  assert.ok(model.diagnostics.some(({ code }) => code === 'invalid-dependency'));
  source.relates = { 'see-also': [targetId] };
  writeLeaf('knowledge/source.md', source);
  model = loadStores(f.root);
  assert.equal(model.ok, true, 'navigation does not acquire dependency semantics');
  target.facets.stage = 'verified';
  writeLeaf('knowledge/target.md', target);
  model = loadStores(f.root);
  assert.equal(model.ok, false);
  assert.ok(model.diagnostics.some(({ code }) => code === 'proposal-lifecycle'));
});

test('real quarantine logging retains canonical Ontology references in version-2 findings', (t) => {
  const f = fixture(t);
  f.identity.allocations.push({ kind: 'ontology', id: 'O-000001', state: 'allocated', publication });
  f.put('_identity.yaml', f.identity);
  f.put('ontology/classes/example.yaml', { 'schema-version': 2, entries: [{
    id: 'O-000001', term: 'Broken source', class: 'example', summary: 'Unverified claim', status: 'active',
    'source-of-truth': ['src/does-not-exist.txt'], 'last-verified': '2026-09-19',
  }] });
  f.put('ontology/_catalog.yaml', { 'schema-version': 2, store: 'ontology', entries: [
    { id: 'O-000001', title: 'Broken source', file: 'classes/example.yaml' },
  ] });
  const model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const result = runPreflight(model, { repoRoot: f.root, concepts: ['O-000001'], today: '2026-09-19', log: true });
  assert.equal(result.payload.logged.length, 1);
  const finding = load(readFileSync(join(f.root, result.payload.logged[0]), 'utf8'));
  assert.equal(finding['schema-version'], 2);
  assert.deepEqual(finding.consulted, { concepts: ['O-000001'] });
});

test('actual loader preserves optional subject capability states without adding a content store', (t) => {
  const f = fixture(t);
  assert.equal(Object.hasOwn(loadStores(f.root), 'subjectRegistry'), false);
  f.put('subjects/derived/registry.yaml', { broken: true });
  assert.equal(loadStores(f.root).ok, true, 'derived registry-looking output is ignored');
  const registry = { 'schema-version': 1, namespace, revision: 0, 'hierarchy-revision': 0,
    subjects: [{ id: `proposal:subject:${namespace}`, label: 'Café', status: 'proposed',
      definition: { text: 'A place serving coffee', includes: [], excludes: [] },
      aliases: [{ label: 'Coffeehouse', locale: 'en', context: 'places' }], related: [], changes: [] }], history: [] };
  f.put('subjects/registry.yaml', registry);
  let model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.equal(lookupSubjects(model.subjectRegistry, 'coffeehouse').matches[0].label, 'Café');
  assert.deepEqual(Object.keys(model.stores).sort(), ['decisions', 'knowledge', 'ontology']);
  assert.equal(Object.hasOwn(model.subjectRegistry, 'governance'), false);
  f.put('subjects/registry.yaml', { ...registry, subjects: [] });
  model = loadStores(f.root);
  assert.equal(model.ok, true);
  assert.equal(model.subjectRegistry.subjects.size, 0, 'present empty is not absent capability');
  f.put('subjects/registry.yaml', { ...registry, namespace: publication.id });
  model = loadStores(f.root);
  assert.equal(model.ok, false);
  assert.equal(Object.hasOwn(model, 'subjectRegistry'), false);
  assert.ok(model.diagnostics.some(({ code, file }) => code === 'namespace-mismatch' && file === 'subjects/registry.yaml'));
  f.put('subjects/registry.yaml', registry);
  rmSync(join(f.root, 'decisions'), { recursive: true });
  model = loadStores(f.root);
  assert.equal(model.ok, true, 'subject metadata remains available with no content stores installed');
  assert.equal(lookupSubjects(model.subjectRegistry, 'café').matches.length, 1);
});

test('installation identity identifies a metadata-only root and keeps subjects in the kit zone', (t) => {
  const f = fixture(t);
  rmSync(join(f.root, 'decisions'), { recursive: true });
  const located = locateKit(f.root);
  assert.ok(located.kitPrefixes.includes('_identity.yaml'));
  assert.ok(located.kitPrefixes.includes('subjects'));
  mkdirSync(join(f.root, 'unknown-knowledge'));
  assert.throws(() => locateKit(f.root), { name: 'AmbiguousKitLayout' },
    'a nested installation cannot silently take precedence over a root identity authority');
});

test('ordinary derive includes actual draft proposals with stage markers and no canonical alias', (t) => {
  const f = fixture(t);
  const key = proposal.replace('decision', 'knowledge');
  f.identity.allocations.push({ kind: 'knowledge', id: 'K-000001', state: 'allocated', publication });
  f.put('_identity.yaml', f.identity);
  f.put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries: [
    { id: 'K-000001', title: 'Published', file: 'published.md' }, { id: key, title: 'Draft', file: 'draft.md' },
  ] });
  for (const [file, id, heading, stage] of [['published.md', 'K-000001', 'Published', 'verified'], ['draft.md', key, 'Draft', 'draft']]) {
    const record = { 'schema-version': 3, id, heading, domain: 'world', citations: [{ source: 'observed-source' }], facets: { stage } };
    writeFileSync(join(f.root, 'knowledge', file), `---\n${JSON.stringify(record)}\n---\nObserved content.\n`);
  }
  const command = fileURLToPath(new URL('../payload/engine/derive.js', import.meta.url));
  const result = spawnSync(process.execPath, [command, '--root', f.root, '--write', '--json', '--today', '2026-09-19'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.counts.leaves, 2, 'moving drafts into proposal maps must not hide authored content');
  assert.equal(output.counts.demoted, 1);
  const index = JSON.parse(readFileSync(join(f.root, 'knowledge/derived/index.json'), 'utf8'));
  assert.deepEqual(index.leaves.map(({ id }) => id), ['K-000001', key]);
  assert.equal(index.leaves[1].stage, 'draft');
  assert.equal(index.leaves[1].demotions[0].reason, 'stage');
  const model = loadStores(f.root);
  assert.equal(model.leaves.has(key), false);
  assert.equal(resolveRecord(model.identityIndex, { namespace, kind: 'knowledge', id: key }).status, 'invalid');
});

test('actual vocabulary registry capture retains the full authored document for scope fingerprints', (t) => {
  const f = fixture(t);
  f.put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries: [] });
  const doc = { 'schema-version': 2, registry: 'jurisdictions', store: 'knowledge', hierarchical: false,
    values: [{ value: 'eu', gloss: 'European context', warrant: 'Reviewed scope', decision: 'D-000001' }] };
  f.put('knowledge/_registries/jurisdictions.yaml', doc);
  const model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const captured = model.registries.get('knowledge/jurisdictions');
  assert.deepEqual(captured.document, doc);
  assert.equal(captured.file, 'knowledge/_registries/jurisdictions.yaml');
  captured.minted.clear();
  assert.equal(indexRegistryValues(captured.document).minted.has('eu'), true);
  doc.values[0].gloss = 'Clarified scope';
  f.put('knowledge/_registries/jurisdictions.yaml', doc);
  const next = loadStores(f.root).registries.get('knowledge/jurisdictions');
  assert.notEqual(canonicalSha256(captured.document), canonicalSha256(next.document));
  assert.equal(captured.document.values[0].gloss, 'European context', 'later file edits do not rewrite the capture');
});


test('nonempty assignments require actual subject authority at every authored owner location', (t) => {
  const f = fixture(t, { proposals: true });
  for (const record of f.records.entries) record.subjects = ['S-000001'];
  f.put('decisions/entries/direction.yaml', f.records);
  f.put('decisions/entries/duplicate.yaml', f.records);
  const expected = ['decisions/entries/direction.yaml', 'decisions/entries/duplicate.yaml']
    .flatMap((file) => [0, 1].map((i) => [file, `entries[${i}].subjects[0]`]));
  let model = loadStores(f.root);
  assert.equal(model.ok, false);
  assert.deepEqual(model.diagnostics.filter(({ code }) => code === 'subjects-unavailable')
    .map(({ file, path }) => [file, path]).sort(), expected.sort());
  f.put('subjects/registry.yaml', { 'schema-version': 1, namespace, revision: 0,
    'hierarchy-revision': 0, subjects: [], history: [] });
  model = loadStores(f.root);
  assert.deepEqual(model.diagnostics.filter(({ code }) => code === 'unknown-subject')
    .map(({ file, path }) => [file, path]).sort(), expected.sort());
  f.put('subjects/registry.yaml', { 'schema-version': 99 });
  model = loadStores(f.root);
  assert.equal(model.ok, false);
  assert.ok(model.diagnostics.some(({ file }) => file === 'subjects/registry.yaml'));
  assert.equal(model.diagnostics.filter(({ code }) => code === 'subjects-unavailable').length, 4);
});

test('retained canonical and proposal assignments resolve exact active or retired subject meanings', (t) => {
  for (const retired of [false, true]) {
    const f = fixture(t, { proposals: true });
    const data = subjectGovernanceFixture();
    if (retired) {
      const first = data.document.history[0];
      const before = structuredClone(first.rows[0].after);
      const after = { ...structuredClone(before), status: 'retired', retirement: { kind: 'retire' } };
      const event = { id: '34567890-1234-4234-8234-123456789abc', action: 'retire', decision: first.decision,
        rows: [{ id: 'S-000001', before, after }], reason: 'Retained historical meaning' };
      event.review = { ...first.review, changeDigest: canonicalSha256(event) };
      data.document.history.push(event);
      data.document.revision = 2;
      data.document.subjects = [{ id: 'S-000001', ...after, changes: [first.id, event.id] }];
    }
    const state = ({ originDecision, ...rest }) => ({ ...rest, 'origin-decision': originDecision });
    const { schemaVersion, hierarchyRevision, subjects, history, ...rest } = data.document;
    f.put('_identity.yaml', data.identityInput.identity);
    f.put('subjects/registry.yaml', { ...rest, 'schema-version': schemaVersion, 'hierarchy-revision': hierarchyRevision,
      subjects: subjects.map(state), history: history.map(({ review, rows, ...event }) => ({ ...event,
        review: { reference: review.reference, 'accepted-status': review.acceptedStatus,
          'decision-capture': review.decisionCapture, 'decision-digest': review.decisionDigest, 'change-digest': review.changeDigest },
        rows: rows.map((row) => ({ ...row, before: row.before === null ? null : state(row.before), after: state(row.after) })) })) });
    for (const record of f.records.entries) record.subjects = ['S-000001'];
    f.put('decisions/entries/direction.yaml', f.records);
    const model = loadStores(f.root);
    assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
    assert.deepEqual(model.decisions.get('D-000001').record.subjects, ['S-000001']);
    assert.deepEqual(model.proposals.decision.get(proposal).record.subjects, ['S-000001']);
    assert.equal(model.subjectRegistry.subjects.get('S-000001').status, retired ? 'retired' : 'active');
  }
});

test('assignment target diagnostics retain Knowledge root and Ontology entry paths', (t) => {
  const f = fixture(t);
  f.identity.allocations.push(...[['knowledge', 'K-000001'], ['ontology', 'O-000001']]
    .map(([kind, id]) => ({ kind, id, state: 'allocated', publication })));
  f.put('_identity.yaml', f.identity);
  f.put('ontology/_catalog.yaml', { 'schema-version': 2, store: 'ontology', entries: [
    { id: 'O-000001', title: 'Meaning', file: 'classes/example.yaml' }] });
  f.put('ontology/classes/example.yaml', { 'schema-version': 2, entries: [{ id: 'O-000001',
    term: 'Meaning', class: 'example', summary: 'Definition', status: 'draft', subjects: ['S-000001'] }] });
  f.put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries: [
    { id: 'K-000001', title: 'Evidence', file: 'evidence.md' }] });
  const leaf = { 'schema-version': 3, id: 'K-000001', heading: 'Evidence', domain: 'world',
    citations: [{ source: 'observed-source' }], subjects: ['S-000001'] };
  writeFileSync(join(f.root, 'knowledge/evidence.md'), `---\n${JSON.stringify(leaf)}\n---\nObserved.\n`);
  const model = loadStores(f.root);
  assert.equal(model.ok, false);
  assert.deepEqual(model.diagnostics.filter(({ code }) => code === 'subjects-unavailable')
    .map(({ file, path }) => [file, path]).sort(), [
    ['knowledge/evidence.md', 'subjects[0]'], ['ontology/classes/example.yaml', 'entries[0].subjects[0]'],
  ]);
});


test('explicit draft preflight and value reporting inspect proposals without publishing aliases', (t) => {
  const f = fixture(t);
  const conceptId = proposal.replace('decision', 'ontology');
  const leafId = proposal.replace('decision', 'knowledge');
  f.put('knowledge/_registries/stage.yaml', { 'schema-version': 2, store: 'knowledge', registry: 'stage',
    values: [{ value: 'draft', warrant: 'Reviewed authoring lifecycle', decision: 'D-000001' }] });
  f.put('ontology/_catalog.yaml', { 'schema-version': 2, store: 'ontology', entries: [
    { id: conceptId, title: 'Draft meaning', file: 'classes/draft.yaml' }] });
  f.put('ontology/classes/draft.yaml', { 'schema-version': 2, entries: [{ id: conceptId, term: 'Draft meaning',
    class: 'example', summary: 'Definition', status: 'draft', 'source-of-truth': ['src/missing.js'],
    enumerates: [{ kind: 'test-lines', source: 'src/missing.js', values: ['one'] }] }] });
  f.put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries: [
    { id: leafId, title: 'Draft evidence', file: 'draft.md' }] });
  const leaf = { 'schema-version': 3, id: leafId, heading: 'Draft evidence', domain: 'world',
    citations: [{ source: 'observed-source' }], facets: { stage: 'draft' } };
  writeFileSync(join(f.root, 'knowledge/draft.md'), `---\n${JSON.stringify(leaf)}\n---\nObserved.\n`);
  let model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const values = validateValues(model, null, f.root);
  assert.deepEqual(values.checked, [{ concept: conceptId, status: 'draft', descriptors: 1, skipped: 'draft' }]);
  assert.deepEqual(values.hardErrors, [], 'draft source is never read by the value validator');
  assert.deepEqual(validateValues(model, [conceptId], f.root).checked, values.checked);
  f.put('src/missing.js', 'one');
  model = loadStores(f.root);
  const result = runPreflight(model, { repoRoot: f.root, concepts: [conceptId], leaves: [leafId], today: '2026-09-19' });
  assert.equal(result.exitCode, 2);
  assert.equal(result.payload.verdicts[0]['next-action'], 'review-status');
  assert.equal(result.payload['leaf-verdicts'][0]['next-action'], 'review-stage');
  assert.equal(model.concepts.size, 0);
  assert.equal(model.leaves.size, 0);
  assert.equal(resolveRecord(model.identityIndex, { namespace, kind: 'ontology', id: conceptId }).status, 'invalid');
  f.put('decisions/entries/broken.yaml', { 'schema-version': 99 });
  const degraded = runPreflight(loadStores(f.root), { repoRoot: f.root, concepts: [conceptId], leaves: [leafId] });
  assert.equal(degraded.payload.verdicts[0].status, 'draft');
  assert.equal(degraded.payload['leaf-verdicts'][0].stage, 'draft');
  assert.equal(degraded.payload.verdicts[0]['next-action'], 'repair-store');
});


test('authoring navigation and structural checks retain draft records across every indexed view', (t) => {
  const f = fixture(t);
  const concept = proposal.replace('decision', 'ontology');
  const draft = proposal.replace('decision', 'knowledge');
  f.identity.allocations.push(...[['ontology', 'O-000001'], ['knowledge', 'K-000001']]
    .map(([kind, id]) => ({ kind, id, state: 'allocated', publication })));
  f.put('_identity.yaml', f.identity);
  f.put('src/shared.js', 'observed');
  f.put('ontology/_catalog.yaml', { 'schema-version': 2, store: 'ontology', entries: [
    { id: 'O-000001', title: 'Shared meaning', file: 'classes/example.yaml' },
    { id: concept, title: 'Shared meaning', file: 'classes/example.yaml' }] });
  f.put('ontology/classes/example.yaml', { 'schema-version': 2, entries: [
    { id: 'O-000001', term: 'Shared meaning', class: 'example', summary: 'Canonical', status: 'active' },
    { id: concept, term: 'Shared meaning', aliases: ['draftword'], class: 'example', summary: 'Draft',
      status: 'draft', 'source-of-truth': ['src/shared.js'] }] });
  f.put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries: [
    { id: 'K-000001', title: 'Shared meaning', file: 'published.md' },
    { id: draft, title: 'Shared meaning', file: 'draft.md' }] });
  const records = [
    { id: 'K-000001', facets: { stage: 'verified' }, concepts: ['O-000001'], relates: { 'see-also': [draft] } },
    { id: draft, facets: { stage: 'draft' }, concepts: [concept], terms: ['draftterm'], paths: ['src/shared.js'],
      relates: { supersedes: ['K-000001'] } },
  ];
  for (const [i, file] of ['published.md', 'draft.md'].entries()) {
    const record = { 'schema-version': 3, domain: 'world', heading: 'Shared meaning',
      citations: [{ source: 'recorded-source' }], ...records[i] };
    writeFileSync(join(f.root, 'knowledge', file), `---\n${JSON.stringify(record)}\n---\nObserved.\n`);
  }
  let model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.deepEqual(model.pointers.get('src/shared.js'), [concept]);
  assert.deepEqual(model.leavesByConcept.get(concept), [draft]);
  assert.deepEqual(model.supersedingLeaves.get('K-000001'), [draft]);
  assert.equal(knownVocabulary(model).has('draftword'), true);
  assert.equal(knownVocabulary(model).has('draftterm'), true);
  const command = fileURLToPath(new URL('../payload/engine/resolve.js', import.meta.url));
  const result = spawnSync(process.execPath, [command, 'Shared meaning', '--root', f.root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.results.map(({ id }) => id), ['O-000001', concept], 'draft concept remains visible and downranked');
  assert.deepEqual(output.leaves.map(({ id }) => id), ['K-000001', draft], 'draft evidence remains visible and downranked');
  assert.ok(JSON.stringify(output).includes('draft.md'), 'proposal neighborhoods retain actual locators');
  rmSync(join(f.root, 'src/shared.js'));
  model = loadStores(f.root);
  const findings = runChecks(model, f.root);
  for (const id of [concept, draft]) assert.ok(findings.some((x) => x.id === id && x.code === 'missing-path'));
  assert.equal(model.concepts.has(concept), false);
  assert.equal(model.leaves.has(draft), false);
});

test('proposal graph cycles, orphaning, provenance and citation defects remain observable', (t) => {
  const f = fixture(t, { proposals: true });
  Object.assign(f.records.entries[1], { supersedes: [proposal], provenance: { author: 'kb-author', 'skill-version': '1.0' },
    graduation: { action: 'graduate', category: 'governance' } });
  f.catalog.entries.pop();
  f.put('decisions/_catalog.yaml', f.catalog);
  f.put('decisions/entries/direction.yaml', f.records);
  const key = proposal.replace('decision', 'knowledge');
  f.put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries: [] });
  f.put('knowledge/_registries/authority-tiers.yaml', { 'schema-version': 2, store: 'knowledge', registry: 'authority-tiers',
    values: [{ value: 'primary', warrant: 'Reviewed evidence classification', decision: 'D-000001' }] });
  const leaf = { 'schema-version': 3, id: key, domain: 'world', heading: 'Draft', citations: [{ source: 'observed-source' }],
    facets: { stage: 'draft' }, relates: { supersedes: [key] } };
  writeFileSync(join(f.root, 'knowledge/draft.md'), `---\n${JSON.stringify(leaf)}\n---\nObserved.\n`);
  const model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const findings = runChecks(model, f.root);
  for (const id of [proposal, key]) {
    for (const code of ['orphan', 'ref-cycle']) assert.ok(findings.some((x) => x.id === id && x.code === code), `${id}: ${code}`);
  }
  assert.ok(findings.some((x) => x.id === key && x.code === 'missing-authority'));
  assert.ok(findings.some((x) => x.id === key && x.code === 'missing-registry'), 'draft stage facets remain checked');
  assert.ok(findings.some((x) => x.id === proposal && x.code === 'graduation-not-trust-category'));
  const command = fileURLToPath(new URL('../payload/engine/validate.js', import.meta.url));
  const result = spawnSync(process.execPath, [command, '--root', f.root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).provenance, [{ id: proposal, file: 'decisions/entries/direction.yaml',
    author: 'kb-author', 'skill-version': '1.0' }]);
});

const historyFile = 'subjects/_assignments/_baselines.yaml';
const historyRef = (kind = 'decision', id = 'D-000001') => ({ namespace, kind, id });
const historyBaseline = (ref = historyRef(), state = { state: 'unknown', reason: 'absent' }) => ({ ref, state,
  capture: { file: 'decisions/entries/direction.yaml', blob: 'a'.repeat(40), sha256: 'b'.repeat(64) } });
const historyEventId = '44444444-4444-4444-8444-444444444444';
function putHistory(f, baselines, rows = []) {
  f.put(historyFile, { 'schema-version': 1, namespace, baselines });
  if (rows.length) f.put(`subjects/_assignments/${historyEventId}.yaml`, assignmentEventFixture({
    namespace, event: historyEventId,
    rows: rows.map((ref) => ({ ref, before: { state: 'unknown', reason: 'absent' }, after: { state: 'known', ids: [] },
      'before-revision': 0, 'after-revision': 1, disposition: 'changed', reason: 'Reviewed assignment state' })),
  }));
}

test('actual history capability is optional and an empty tracked universe never implies a current check', (t) => {
  const f = fixture(t, { proposals: true });
  f.records.entries[0].subjects = [];
  f.put('decisions/entries/direction.yaml', f.records);
  let model = loadStores(f.root);
  assert.equal(model.ok, true);
  assert.equal(Object.hasOwn(model, 'assignmentHistory'), false);
  assert.equal(Object.hasOwn(model, 'assignmentHistoryCurrent'), false);
  putHistory(f, []);
  model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.deepEqual(model.assignmentHistoryCurrent, { scope: 'loaded-tracked-records', status: 'not-performed',
    reason: 'no-loaded-tracked-records', checkedRefs: [], unavailableRefs: [] });
  assert.equal(model.assignmentHistory.currentStateCheck, 'not-performed');
  assert.equal(model.assignmentHistory.publicationReady, false);
});

test('tracked loaded terminal states use the real chain validator and exact authored owner locator', (t) => {
  const f = fixture(t, { proposals: true });
  putHistory(f, [historyBaseline()]);
  let model = loadStores(f.root);
  assert.equal(model.ok, true);
  assert.deepEqual(model.assignmentHistoryCurrent, { scope: 'loaded-tracked-records', status: 'passed',
    checkedRefs: [historyRef()], unavailableRefs: [] });
  model.assignmentHistoryCurrent.checkedRefs[0].id = 'D-999999';
  assert.equal(model.assignmentHistory.baselines[0].ref.id, 'D-000001', 'reported refs are detached from authored history');
  f.records.entries[0].subjects = [];
  f.put('decisions/entries/direction.yaml', f.records);
  model = loadStores(f.root);
  assert.equal(model.ok, false, 'absent metadata and an authored empty assignment are distinct terminal states');
  assert.equal(model.assignmentHistoryCurrent.status, 'failed');
  const mismatch = model.diagnostics.find(({ code }) => code === 'current-state-mismatch');
  assert.equal(mismatch.file, 'decisions/entries/direction.yaml');
  assert.equal(mismatch.path, 'entries[0].subjects');
  putHistory(f, [historyBaseline()], [historyRef()]);
  model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.equal(model.assignmentHistoryCurrent.status, 'passed');
  assert.equal(model.assignmentHistory.currentStateCheck, 'not-performed');
  for (const field of ['captureVerification', 'eventScopeCheck', 'approvalCheck']) assert.equal(model.assignmentHistory[field], 'not-performed');
});

test('occupied unavailable histories stay inspectable while only loaded tracked rows join terminal state', (t) => {
  const f = fixture(t);
  const absent = [historyRef('decision', 'D-000002'), historyRef('ontology', 'O-000001'), historyRef('knowledge', 'K-000001')];
  f.identity.allocations.push(...absent.map(({ kind, id }, index) => ({ kind, id, publication,
    state: ['allocated', 'retired', 'cancelled'][index], ...(index ? { reason: 'Retained occupancy' } : {}) })));
  f.put('_identity.yaml', f.identity);
  putHistory(f, absent.map((ref) => historyBaseline(ref)));
  let model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const unavailableRefs = [absent[0], absent[2], absent[1]];
  assert.deepEqual(model.assignmentHistoryCurrent, { scope: 'loaded-tracked-records', status: 'not-performed',
    reason: 'no-loaded-tracked-records', checkedRefs: [], unavailableRefs });
  f.records.entries[0].subjects = [];
  f.put('decisions/entries/direction.yaml', f.records);
  putHistory(f, [...absent.map((ref) => historyBaseline(ref)), historyBaseline()], [historyRef(), absent[0]]);
  model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.deepEqual(model.assignmentHistoryCurrent, { scope: 'loaded-tracked-records', status: 'passed',
    checkedRefs: [historyRef()], unavailableRefs });
  assert.equal(model.assignmentHistory.sources.events[0].document.rows.length, 2, 'terminal projection never rewrites the full source event');
  assert.equal(model.assignmentHistory.revisions.length, 4);
});

test('loaded retired payloads still compare; unhealthy duplicate capture skips rather than passes', (t) => {
  const f = fixture(t);
  Object.assign(f.identity.allocations[0], { state: 'retired', reason: 'Retained identity' });
  f.put('_identity.yaml', f.identity);
  putHistory(f, [historyBaseline(historyRef(), { state: 'known', ids: [] })]);
  let model = loadStores(f.root);
  assert.equal(model.ok, false);
  assert.equal(model.assignmentHistoryCurrent.status, 'failed');
  f.records.entries[0].subjects = [];
  f.put('decisions/entries/direction.yaml', f.records);
  model = loadStores(f.root);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.equal(model.assignmentHistoryCurrent.status, 'passed');
  f.put('decisions/entries/duplicate.yaml', f.records);
  model = loadStores(f.root);
  assert.equal(model.ok, false);
  assert.deepEqual(model.assignmentHistoryCurrent, { scope: 'loaded-tracked-records', status: 'not-performed',
    reason: 'loader-errors', checkedRefs: [], unavailableRefs: [] });
  f.put(historyFile, { 'schema-version': 99 });
  model = loadStores(f.root);
  assert.ok(model.diagnostics.some(({ file }) => file === historyFile), 'history reading still diagnoses errors on unhealthy captures');
  assert.equal(Object.hasOwn(model, 'assignmentHistory'), false);
});

test('Knowledge history mismatch points at root subjects and blocks both actual validators', (t) => {
  const f = fixture(t);
  const ref = historyRef('knowledge', 'K-000001');
  f.identity.allocations.push({ kind: ref.kind, id: ref.id, state: 'allocated', publication });
  f.put('_identity.yaml', f.identity);
  f.put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries: [
    { id: ref.id, title: 'Evidence', file: 'evidence.md' }] });
  const record = { 'schema-version': 3, id: ref.id, heading: 'Evidence', domain: 'world',
    citations: [{ source: 'observed-source' }] };
  writeFileSync(join(f.root, 'knowledge/evidence.md'), `---\n${JSON.stringify(record)}\n---\nObserved.\n`);
  putHistory(f, [historyBaseline(ref, { state: 'known', ids: [] })]);
  const model = loadStores(f.root);
  assert.equal(model.ok, false);
  const mismatch = model.diagnostics.find(({ code }) => code === 'current-state-mismatch');
  assert.equal(mismatch.file, 'knowledge/evidence.md');
  assert.equal(mismatch.path, 'subjects');
  for (const name of ['validate', 'validate-values']) {
    const command = fileURLToPath(new URL(`../payload/engine/${name}.js`, import.meta.url));
    const result = spawnSync(process.execPath, [command, '--root', f.root], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /current-state-mismatch/);
  }
});
