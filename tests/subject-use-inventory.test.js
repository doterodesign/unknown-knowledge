import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { subjectQueryDiskFixture } from './helpers/subject-query-disk-fixture.js';
import { inspectSubjectUses } from '../payload/engine/lib/subject-use-inventory.js';
import { authored, digestEvent } from './helpers/subject-suppression-fixture.js';

function fixture(t, { nested = false, known = false, graph = false } = {}) {
  const f = subjectQueryDiskFixture(t, { nested });
  if (known) {
    const file = 'knowledge/K-000005.md';
    f.put(file, readFileSync(join(f.kitRoot, file), 'utf8').replace('"facets":', '"subjects":[],"facets":'));
    const decisionFile = 'decisions/entries/approval.yaml';
    const decision = JSON.parse(readFileSync(join(f.kitRoot, decisionFile)));
    decision.entries[0].subjects = [];
    f.put(decisionFile, decision);
  }
  if (graph) {
    const document = structuredClone(f.context.model.subjectRegistry.document);
    document.subjects[1].parent = 'S-000001';
    document.history[0].rows[1].after.parent = 'S-000001';
    document.subjects[0].related = [{ type: 'association', target: 'S-000003' }];
    document.history[0].rows[0].after.related = document.subjects[0].related;
    document.hierarchyRevision = 1;
    document.history[0].review.changeDigest = digestEvent(document.history[0]);
    f.put('subjects/registry.yaml', authored(document));
  }
  const git = (...args) => {
    const result = spawnSync('/usr/bin/git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', f.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'captured inventory');
  const side = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath: nested ? 'unknown-knowledge' : '.' };
  return { ...f, git, input: { repoRoot: f.root, before: side, candidate: side, subjects: ['S-000001'],
    evidence: { decisionCaptures: f.decisionCaptures, assessmentCaptures: [] },
    limits: { maxRecordVisits: 100, maxRegistryReferenceVisits: 100, maxHierarchyNodes: 100, maxHierarchyEdges: 100 },
    impactPolicy: { required: [], requiredExtensions: [] } } };
}

test('inventory includes original canonical and proposal uses without querying eligibility', async (t) => {
  const f = fixture(t);
  const result = await inspectSubjectUses(f.input);
  assert.notEqual(result.status, 'refused', JSON.stringify(result.diagnostics));
  const before = result.uses.filter((row) => row.side === 'before');
  assert.deepEqual(before.filter((row) => row.ref).map((row) => row.ref.id), ['K-000001', 'K-000002']);
  assert.deepEqual(before.filter((row) => row.proposalRef).map((row) => row.proposalRef.key),
    ['proposal:knowledge:11111111-1111-4111-8111-111111111111']);
  assert.equal(before.find((row) => row.proposalRef).lifecycle.state, 'unpublished');
  assert.equal(result.status, 'incomplete', 'unknown assignments remain potential impact');
  assert.ok(result.potentialUses.some((row) => row.ref?.id === 'K-000005' && row.reason === 'unknown-assignments'));
  assert.deepEqual(result.records.find((row) => row.ref?.id === 'K-000004').assignments, { state: 'known', ids: [] });
});

test('complete owned record scope reports inherited witnesses and each authored registry edge once', async (t) => {
  const f = fixture(t, { known: true, graph: true });
  const result = await inspectSubjectUses(f.input);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  const uses = result.uses.filter((row) => row.side === 'before');
  assert.deepEqual(uses.filter((row) => row.kind === 'inherited-assignment').map((row) => [row.ref.id, row.path]),
    [['K-000003', ['S-000001', 'S-000002']]]);
  assert.deepEqual(uses.filter((row) => row.kind === 'registry-reference').map((row) => [row.type, row.source, row.target]),
    [['association', 'S-000001', 'S-000003'], ['parent', 'S-000002', 'S-000001']]);
  assert.equal(result.coverage.before.registry, 'complete');
  assert.ok(result.used.hierarchyNodes > 0);
  assert.equal(result.used.registryReferenceVisits, 4);
  assert.deepEqual(result.deltas, { added: [], removed: [], complete: true });
});

test('unavailable required owner impact and declared extensions cannot be waived as empty', async (t) => {
  const f = fixture(t, { known: true });
  for (const policy of [
    { required: ['managedRoutes'], requiredExtensions: [] },
    { required: ['subjectTreeViews'], requiredExtensions: [] },
    { required: [], requiredExtensions: ['declared-client-extension'] },
  ]) {
    const result = await inspectSubjectUses({ ...f.input, impactPolicy: policy });
    assert.equal(result.status, 'incomplete');
    assert.ok(result.potentialUses.some((row) => row.reason === 'required-surface-unavailable'));
    assert.equal(result.scope.externalInventory, 'unknown');
  }
});

test('partial inventory does not invent removals from an unexamined candidate', async (t) => {
  const f = fixture(t, { known: true });
  const result = await inspectSubjectUses({ ...f.input, limits: { ...f.input.limits, maxRecordVisits: 8 } });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.used.recordVisits, 8);
  assert.equal(result.coverage.before.records, 'complete');
  assert.equal(result.coverage.candidate.records, 'incomplete');
  assert.deepEqual(result.deltas, { added: [], removed: [], complete: false });
});

test('actual nested committed pair produces deltas without changing dirty worktree or index', async (t) => {
  const f = fixture(t, { known: true, nested: true });
  const file = 'knowledge/K-000001.md';
  const original = readFileSync(join(f.kitRoot, file), 'utf8');
  f.put(file, original.replace('"subjects":["S-000001"]', '"subjects":[]'));
  f.git('add', '.'); f.git('commit', '-qm', 'remove one assignment');
  const candidate = { ...f.input.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  f.put(file, original + '\nStaged unrelated content.\n'); f.git('add', '.');
  f.put(file, original + '\nDirty unrelated content.\n');
  const status = f.git('status', '--porcelain=v1'); const index = f.git('write-tree');
  const input = { ...f.input, candidate };
  const result = await inspectSubjectUses(input);
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.deltas.removed.map((use) => use.ref.id), ['K-000001']);
  assert.deepEqual(result.deltas.added, []);
  const row = result.records.find((row) => row.side === 'before' && row.ref?.id === 'K-000001');
  assert.equal(row.capture.file, 'unknown-knowledge/knowledge/K-000001.md');
  assert.deepEqual(row.capture.source, { commit: f.input.before.commit, tree: f.input.before.tree });
  assert.deepEqual(await inspectSubjectUses(input), result, 'stable provenance and ordering');
  assert.equal(f.git('status', '--porcelain=v1'), status); assert.equal(f.git('write-tree'), index);
  assert.equal(readFileSync(join(f.kitRoot, file), 'utf8'), original + '\nDirty unrelated content.\n');
});

test('snapshot descriptors and duplicate or unknown selectors cannot forge coverage', async (t) => {
  const f = fixture(t, { known: true });
  for (const [input, code] of [
    [{ ...f.input, candidate: { ...f.input.candidate, tree: '0'.repeat(40) } }, 'subject-use-tree-mismatch'],
    [{ ...f.input, before: { ...f.input.before, kitPath: 'invented' } }, 'subject-use-kit-path-mismatch'],
    [{ ...f.input, subjects: ['S-000001', 'S-000001'] }, 'invalid-subject-use-input'],
    [{ ...f.input, subjects: ['S-999999'] }, 'subject-use-unknown-selector'],
  ]) {
    const result = await inspectSubjectUses(input);
    assert.equal(result.status, 'refused'); assert.equal(result.diagnostics[0].code, code);
  }
});

test('logical hierarchy and reference budgets are cumulative and never imply complete absence', async (t) => {
  const f = fixture(t, { known: true, graph: true });
  for (const [field, used, limit] of [['maxRegistryReferenceVisits', 'registryReferenceVisits', 2],
    ['maxHierarchyNodes', 'hierarchyNodes', 4], ['maxHierarchyEdges', 'hierarchyEdges', 0]]) {
    const result = await inspectSubjectUses({ ...f.input, limits: { ...f.input.limits, [field]: limit } });
    assert.equal(result.status, 'incomplete'); assert.ok(result.used[used] <= limit);
    assert.ok(result.potentialUses.some((row) => row.reason.endsWith('budget')));
    assert.equal(result.deltas.complete, false);
  }
});

test('absent store is known absent only without allocations; retained inactive records still have uses', async (t) => {
  const f = fixture(t, { known: true });
  const baseline = await inspectSubjectUses(f.input);
  assert.deepEqual(baseline.coverage.before.stores.find((row) => row.kind === 'ontology'),
    { kind: 'ontology', status: 'absent', allocations: 0 });
  const ledger = JSON.parse(readFileSync(join(f.kitRoot, '_identity.yaml'), 'utf8'));
  ledger.allocations.push({ ...ledger.allocations[0], kind: 'ontology', id: 'O-000001', state: 'allocated' });
  const allocation = ledger.allocations.find((row) => row.id === 'K-000001');
  allocation.state = 'retired'; allocation.reason = 'Keep original evidence';
  f.put('_identity.yaml', ledger);
  const file = 'knowledge/K-000001.md';
  f.put(file, readFileSync(join(f.kitRoot, file), 'utf8').replace('"stage":"verified"', '"stage":"draft"'));
  f.git('add', '.'); f.git('commit', '-qm', 'retained and unresolved allocations');
  const candidate = { ...f.input.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const result = await inspectSubjectUses({ ...f.input, candidate });
  assert.equal(result.status, 'incomplete', JSON.stringify(result.diagnostics));
  assert.ok(result.potentialUses.some((row) => row.ref?.id === 'O-000001' && row.resolution === 'missing'));
  const record = result.records.find((row) => row.side === 'candidate' && row.ref?.id === 'K-000001');
  assert.equal(record.resolution, 'retired'); assert.equal(record.lifecycle.state, 'non-effective');
  assert.ok(result.uses.some((row) => row.side === 'candidate' && row.ref?.id === 'K-000001'));
});

test('unavailable retained review evidence stays visible; corrupt referenced bytes refuse', async (t) => {
  const f = fixture(t, { known: true });
  const unavailable = await inspectSubjectUses({ ...f.input, evidence: { decisionCaptures: [], assessmentCaptures: [] } });
  assert.equal(unavailable.status, 'complete', 'structural inventory does not confer historical approval');
  assert.equal(unavailable.inputs.before.governance.events[0].verification, 'unavailable');
  assert.equal(unavailable.scope.evidence, 'referenced-historical-reviews');
  const capture = f.input.evidence.decisionCaptures[0];
  const unrelated = { ...capture, capture: { ...capture.capture, file: 'decisions/entries/unreferenced.yaml' }, bytes: Buffer.from('corrupt') };
  const extra = await inspectSubjectUses({ ...f.input, evidence: { ...f.input.evidence, decisionCaptures: [capture, unrelated] } });
  assert.equal(extra.status, 'complete', 'unreferenced supplied evidence is outside this inspection scope');
  assert.equal(extra.scope.evidence, 'referenced-historical-reviews');
  const corrupt = await inspectSubjectUses({ ...f.input, evidence: { ...f.input.evidence,
    decisionCaptures: [{ ...capture, bytes: Buffer.from('corrupt') }] } });
  assert.equal(corrupt.status, 'refused'); assert.equal(corrupt.diagnostics[0].code, 'subject-use-model-unavailable');
});

test('shared multi-entry files preserve canonical and proposal occurrence paths', async (t) => {
  const f = fixture(t, { known: true });
  const file = 'decisions/entries/approval.yaml';
  const document = JSON.parse(readFileSync(join(f.kitRoot, file), 'utf8'));
  const proposalKey = 'proposal:decision:22222222-2222-4222-8222-222222222222';
  document.entries.push({ ...document.entries[0], id: 'D-000002', subjects: ['S-000001'] },
    { ...document.entries[0], id: proposalKey, status: 'proposed', subjects: ['S-000001'] });
  f.put(file, document);
  const catalog = JSON.parse(readFileSync(join(f.kitRoot, 'decisions/_catalog.yaml'), 'utf8'));
  for (const entry of document.entries.slice(1)) catalog.entries.push({ id: entry.id, title: entry.title, file: 'entries/approval.yaml' });
  f.put('decisions/_catalog.yaml', catalog);
  const ledger = JSON.parse(readFileSync(join(f.kitRoot, '_identity.yaml'), 'utf8'));
  ledger.allocations.push({ ...ledger.allocations.find((row) => row.kind === 'decision'), id: 'D-000002' });
  f.put('_identity.yaml', ledger); f.git('add', '.'); f.git('commit', '-qm', 'multi-entry owners');
  const candidate = { ...f.input.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const result = await inspectSubjectUses({ ...f.input, candidate });
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  const canonical = result.uses.find((row) => row.side === 'candidate' && row.ref?.id === 'D-000002');
  const proposal = result.uses.find((row) => row.side === 'candidate' && row.proposalRef?.key === proposalKey);
  assert.deepEqual(canonical.locator, { file, path: 'entries[1]' });
  assert.deepEqual(proposal.locator, { file, path: 'entries[2]' });
  assert.deepEqual(canonical.capture, proposal.capture);
  assert.equal(proposal.lifecycle.state, 'unpublished');
  assert.equal(result.deltas.added.length, 2);
});

test('allocated unloaded declarations remain unresolved even when their store is present', async (t) => {
  const f = fixture(t, { known: true });
  const ledger = JSON.parse(readFileSync(join(f.kitRoot, '_identity.yaml'), 'utf8'));
  ledger.allocations.push({ ...ledger.allocations.find((row) => row.kind === 'knowledge'), id: 'K-000007' });
  f.put('_identity.yaml', ledger);
  const catalog = JSON.parse(readFileSync(join(f.kitRoot, 'knowledge/_catalog.yaml'), 'utf8'));
  catalog.entries.push({ id: 'K-000007', title: 'Pending payload', file: 'K-000007.md' });
  f.put('knowledge/_catalog.yaml', catalog); f.git('add', '.'); f.git('commit', '-qm', 'pending declaration');
  const candidate = { ...f.input.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const result = await inspectSubjectUses({ ...f.input, candidate });
  assert.equal(result.status, 'incomplete', JSON.stringify(result.diagnostics));
  assert.ok(result.potentialUses.some((row) => row.side === 'candidate' && row.ref?.id === 'K-000007' && row.resolution === 'declared-only'));
});

test('two individually healthy snapshots must share the same installation namespace', async (t) => {
  const f = fixture(t, { known: true });
  const namespace = '87654321-4321-4321-8321-cba987654321';
  const ledger = JSON.parse(readFileSync(join(f.kitRoot, '_identity.yaml'), 'utf8'));
  ledger.namespace = namespace; f.put('_identity.yaml', ledger);
  const document = structuredClone(f.context.model.subjectRegistry.document);
  const replaceNamespace = (value) => {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (key === 'namespace') value[key] = namespace;
        else replaceNamespace(value[key]);
      }
    }
  };
  replaceNamespace(document);
  document.history[0].review.changeDigest = digestEvent(document.history[0]);
  f.put('subjects/registry.yaml', authored(document)); f.git('add', '.'); f.git('commit', '-qm', 'different installation');
  const candidate = { ...f.input.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const result = await inspectSubjectUses({ ...f.input, candidate });
  assert.equal(result.status, 'refused'); assert.equal(result.diagnostics[0].code, 'subject-use-namespace-mismatch');
});

test('present Ontology canonical and proposal assignments are part of the fixed store universe', async (t) => {
  const f = fixture(t, { known: true });
  const proposalKey = 'proposal:ontology:33333333-3333-4333-8333-333333333333';
  const entries = [{ id: 'O-000001', term: 'Meaning', class: 'general', summary: 'Meaning', status: 'draft', subjects: ['S-000001'] },
    { id: proposalKey, term: 'Draft meaning', class: 'general', summary: 'Proposed meaning', status: 'proposed', subjects: ['S-000001'] }];
  f.put('ontology/classes/meaning.yaml', { 'schema-version': 2, entries });
  f.put('ontology/_catalog.yaml', { 'schema-version': 2, store: 'ontology', entries: entries.map(({ id, term }) => ({ id, title: term, file: 'classes/meaning.yaml' })) });
  const ledger = JSON.parse(readFileSync(join(f.kitRoot, '_identity.yaml'), 'utf8'));
  ledger.allocations.push({ ...ledger.allocations[0], kind: 'ontology', id: 'O-000001', state: 'allocated' });
  f.put('_identity.yaml', ledger); f.git('add', '.'); f.git('commit', '-qm', 'Ontology inventory');
  const candidate = { ...f.input.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const result = await inspectSubjectUses({ ...f.input, candidate });
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.deltas.added.map((row) => row.ref?.id ?? row.proposalRef?.key).sort(), ['O-000001', proposalKey]);
});

test('retirement redirect is an authored reference and never rewrites original assignment identity', async (t) => {
  const f = fixture(t, { known: true });
  const document = structuredClone(f.context.model.subjectRegistry.document);
  const initial = document.history[0];
  const before = initial.rows[0].after;
  const after = { ...structuredClone(before), status: 'retired', retirement: { kind: 'equivalent-merge', redirect: 'S-000002' } };
  const event = { id: '34567890-1234-4234-8234-123456789abc', action: 'merge-equivalent', decision: initial.decision,
    rows: [{ id: 'S-000001', before, after }, { id: 'S-000002', before: initial.rows[1].after,
      after: initial.rows[1].after, reason: 'Preserve survivor meaning' }], reason: 'Reviewed equivalence' };
  event.review = { ...initial.review, changeDigest: digestEvent(event) };
  document.history.push(event); document.revision += 1;
  document.subjects[0] = { id: 'S-000001', ...after, changes: [initial.id, event.id] };
  document.subjects[1].changes.push(event.id);
  f.put('subjects/registry.yaml', authored(document)); f.git('add', '.'); f.git('commit', '-qm', 'retained retired subject');
  const candidate = { ...f.input.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const result = await inspectSubjectUses({ ...f.input, candidate });
  assert.equal(result.status, 'complete', JSON.stringify(result.diagnostics));
  const redirect = result.uses.find((use) => use.side === 'candidate' && use.type === 'redirect');
  assert.equal(redirect.source, 'S-000001'); assert.equal(redirect.target, 'S-000002');
  assert.equal(redirect.locator, 'subjects[0].retirement.redirect');
  assert.ok(result.uses.some((use) => use.side === 'candidate' && use.ref?.id === 'K-000001' && use.subject === 'S-000001'));
});

test('ambiguous layout diagnostics use stable side labels instead of disposable snapshot paths', async (t) => {
  const f = fixture(t, { known: true });
  f.put('unknown-knowledge/marker.txt', 'ambiguous nested kit');
  f.git('add', '.'); f.git('commit', '-qm', 'ambiguous kit layout');
  const candidate = { ...f.input.candidate, commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') };
  const input = { ...f.input, candidate };
  const first = await inspectSubjectUses(input); const second = await inspectSubjectUses(input);
  assert.equal(first.status, 'refused');
  assert.deepEqual(first, second);
  assert.ok(first.diagnostics[0].message.includes('<candidate-snapshot>'));
  assert.ok(!first.diagnostics[0].message.includes('unknown-knowledge-tree-'));
});
