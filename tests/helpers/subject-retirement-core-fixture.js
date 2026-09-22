/** Actual committed source retirement pairs; candidates are authored without a planner. */
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { registryWire } from './equivalent-merge-fixture.js';
import { retirementInput } from './subject-retirement-input-fixture.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { withTreeSnapshot } from '../../payload/engine/lib/commit-snapshot.js';
import { loadSubjectQueryContext } from '../../payload/engine/lib/subject-query-context.js';

const tuple = (ref) => JSON.stringify([ref.namespace, ref.kind, ref.id ?? ref.key]);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function subjectRetirementCoreFixture(t, { beforeChange, candidateChange, nested = false,
  kind = 'knowledge', zero = false, child = false, sameOwner = false, historical = false, knowledgePresent = true,
  objectFormat = 'sha1' } = {}) {
  assert.ok(knowledgePresent || ['ontology', 'decision'].includes(kind), 'Absent Knowledge requires an O/D selection.');
  assert.ok(knowledgePresent || !historical, 'The historical option selects K-000004 and requires Knowledge.');
  const f = subjectQueryDiskFixture(t, { nested, objectFormat });
  const input = retirementInput(); input.repoRoot = f.root;
  const kitPath = nested ? 'unknown-knowledge' : '.';
  const read = (file) => readFileSync(join(f.kitRoot, file), 'utf8');
  const editKnowledge = (file, edit) => {
    const parts = read(file).split('---\n'); const record = JSON.parse(parts[1]); edit(record);
    parts[1] = `${JSON.stringify(record)}\n`; f.put(file, parts.join('---\n'));
  };
  const replaceSubjects = (file, ids) => editKnowledge(file, (record) => {
    if (ids === undefined) delete record.subjects; else record.subjects = ids;
  });
  const git = (...args) => {
    const result = spawnSync('/usr/bin/git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', f.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const commit = (message) => {
    git('add', '.'); git('commit', '--allow-empty', '-qm', message);
    return { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath };
  };
  const namespace = f.context.model.identity.namespace;
  const ref = (id, ownerKind = kind) => ({ namespace, kind: ownerKind, id });
  const document = structuredClone(f.context.model.subjectRegistry.document);
  if (child) {
    document.subjects.find(({ id }) => id === 'S-000003').parent = 'S-000001';
    document.history[0].rows.find(({ id }) => id === 'S-000003').after.parent = 'S-000001';
    document.hierarchyRevision += 1;
    const { review, ...body } = document.history[0]; review.changeDigest = canonicalSha256(body);
  }
  f.put('subjects/registry.yaml', registryWire(document));
  replaceSubjects('knowledge/draft.md', []);
  replaceSubjects('knowledge/K-000001.md', zero || kind !== 'knowledge' ? [] : ['S-000001']);
  replaceSubjects('knowledge/K-000002.md', zero || kind !== 'knowledge' ? []
    : sameOwner ? ['S-000003', 'S-000001', 'S-000002'] : ['S-000001', 'S-000002']);
  if (child) replaceSubjects('knowledge/K-000003.md', ['S-000003']);
  if (historical) {
    replaceSubjects('knowledge/K-000004.md', ['S-000001']);
    editKnowledge('knowledge/K-000004.md', (record) => { record.facets.stage = 'draft'; });
  }
  let typedFile;
  if (kind !== 'knowledge') {
    const prefix = kind === 'ontology' ? 'O' : 'D';
    const ids = kind === 'ontology' ? ['O-000001', 'O-000002'] : ['D-000002', 'D-000003'];
    const ledger = JSON.parse(read('_identity.yaml'));
    for (const id of ids) ledger.allocations.push({ ...ledger.allocations.find((row) => row.kind === 'knowledge'), kind, id });
    f.put('_identity.yaml', ledger);
    typedFile = kind === 'ontology' ? 'ontology/classes/retirement.yaml' : 'decisions/entries/retirement.yaml';
    const records = ids.map((id, index) => kind === 'ontology'
      ? { id, term: `Retained ${prefix} owner ${index}`, class: 'general', summary: 'Original artifact contract', definition: 'Original meaning', status: 'active',
        'source-of-truth': [nested ? 'unknown-knowledge/src/owned.js' : 'src/owned.js'], 'last-verified': '2026-09-19',
        subjects: zero ? [] : index ? ['S-000003', 'S-000001', 'S-000002'] : ['S-000001'] }
      : { id, title: `Retained Decision ${index}`, category: 'architecture', status: 'accepted', date: '2026-09-19',
        deciders: ['steward'], context: 'Original reasoning', decision: 'Original choice',
        subjects: zero ? [] : index ? ['S-000003', 'S-000001', 'S-000002'] : ['S-000001'] });
    f.put(typedFile, { 'schema-version': 2, entries: records });
    const catalogFile = kind === 'ontology' ? 'ontology/_catalog.yaml' : 'decisions/_catalog.yaml';
    const catalog = kind === 'ontology' ? { 'schema-version': 2, store: 'ontology', entries: [] } : JSON.parse(read(catalogFile));
    catalog.entries.push(...records.map((record) => ({ id: record.id, title: record.title ?? record.term,
      file: kind === 'ontology' ? 'classes/retirement.yaml' : 'entries/retirement.yaml' })));
    f.put(catalogFile, catalog);
    if (kind === 'ontology') f.put('src/owned.js', 'export const retained = true;\n');
  }
  if (!knowledgePresent) {
    // Prepare the actual absent store and allocation universe before either capture.
    rmSync(join(f.kitRoot, 'knowledge'), { recursive: true });
    const ledger = JSON.parse(read('_identity.yaml'));
    ledger.allocations = ledger.allocations.filter(({ kind }) => kind !== 'knowledge');
    f.put('_identity.yaml', ledger);
  }
  const context = { ...f, read, git, ref, replaceSubjects, editKnowledge, document, typedFile };
  beforeChange?.(context);
  git('init', `--object-format=${objectFormat}`, '-q'); input.before = commit('actual before plain retirement');
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const prior = loaded.context.model.subjectRegistry.document;
  const next = structuredClone(prior);
  const source = next.subjects.find(({ id }) => id === input.operation.subject);
  const { id, changes, ...before } = source;
  const after = { ...structuredClone(before), status: 'retired', retirement: { kind: 'retire' } };
  const event = { id: input.operation.registryEvents[0].id, action: 'retire', decision: prior.history[0].decision,
    reason: 'Retain the original meaning as a plain tombstone', rows: [{ id, before, after }] };
  event.review = { ...prior.history[0].review, changeDigest: canonicalSha256(event) };
  next.subjects[next.subjects.indexOf(source)] = { id, ...after, changes: [...changes, event.id] };
  next.history.push(event); next.revision += 1;
  for (const id of knowledgePresent ? ['K-000001', 'K-000002'] : []) editKnowledge(`knowledge/${id}.md`, (record) => {
    if (record.subjects) record.subjects = record.subjects.filter((id) => id !== input.operation.subject);
  });
  if (typedFile) {
    const records = JSON.parse(read(typedFile));
    for (const record of records.entries) if (record.subjects) record.subjects = record.subjects.filter((id) => id !== input.operation.subject);
    f.put(typedFile, records);
  }
  candidateChange?.({ ...context, document: next, event });
  const { review, ...body } = event; review.changeDigest = canonicalSha256(body);
  f.put('subjects/registry.yaml', registryWire(next));
  input.candidate = commit('actual candidate plain retirement');
  input.operation.registryEvents[0].changeDigest = review.changeDigest;
  if (zero) input.operation.assignmentEvent = null;
  input.operation.retainedUnknowns = [
    ...(knowledgePresent ? [{ ref: ref('K-000005', 'knowledge'), reason: 'Preserve actual absent classification' }] : []),
    { ref: ref('D-000001', 'decision'), reason: 'Preserve unknown authorizer classification' },
  ].sort((a, b) => compare(tuple(a.ref), tuple(b.ref)));
  if (historical) input.operation.retainedHistoricalUses = [{ ref: ref('K-000004', 'knowledge'), reason: 'Preserve historical direct use' }];
  if (child) {
    input.operation.retainedParents = [{ child: 'S-000003', parent: 'S-000001', reason: 'Preserve narrower meaning' }];
    input.operation.retainedInheritedUses = [
      ...(!zero && (sameOwner || kind !== 'knowledge') ? [{ ref: ref(kind === 'knowledge' ? 'K-000002' : kind === 'ontology' ? 'O-000002' : 'D-000003'),
        assignedSubject: 'S-000003', reason: 'Expose retained descendant after direct withdrawal' }] : []),
      ...(knowledgePresent ? [
        { ref: ref('K-000003', 'knowledge'), assignedSubject: 'S-000003', reason: 'Retain original inherited use' },
        { ref: ref('K-000006', 'knowledge'), assignedSubject: 'S-000003', reason: 'Retain the base fixture descendant use' },
      ] : []),
    ].sort((a, b) => compare(tuple(a.ref), tuple(b.ref)));
  }
  input.evidence = { decisionCaptures: f.decisionCaptures, assessmentCaptures: [] };
  const withCoreInput = (fn) => withTreeSnapshot(f.root, input.before.tree, (old) =>
    withTreeSnapshot(f.root, input.candidate.tree, (candidate) => {
      const sides = {};
      for (const [side, snapshot] of [['before', old], ['candidate', candidate]]) {
        const loaded = loadSubjectQueryContext({ root: snapshot.root, ...input.evidence });
        assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
        sides[side] = { descriptor: input[side], root: snapshot.root, context: loaded.context };
      }
      return fn({ repoRoot: f.root, ...sides, operation: input.operation, reviewNote: input.reviewNote, evidence: input.evidence,
        limits: { inventory: input.limits.inventory, governance: input.limits.governance, closure: input.limits.closure } });
    }));
  return { ...context, input, event, document: next, withCoreInput };
}
