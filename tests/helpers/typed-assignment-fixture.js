import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { iterateCurrentRecords } from '../../payload/engine/lib/record-identity.js';
import { readAssignments } from '../../payload/engine/lib/subject-assignments.js';

const eventId = '45678901-2345-4678-89ab-123456789abc';
const noteInput = { date: '2026-09-19', author: 'steward', skill: 'typed-classification' };
export function typedAssignmentFixture(t, { kind = 'ontology', nested = false } = {}) {
  const f = subjectQueryDiskFixture(t, { nested });
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', f.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const kitPath = nested ? 'unknown-knowledge' : '.';
  const path = (file) => kitPath === '.' ? file : `${kitPath}/${file}`;
  const read = (file) => readFileSync(join(f.kitRoot, file), 'utf8');
  const identity = structuredClone(f.context.model.identity);
  const publication = identity.allocations[0].publication;
  for (const ownerKind of ['ontology', 'decision']) {
    const store = ownerKind === 'decision' ? 'decisions' : ownerKind;
    const ids = ownerKind === 'decision' ? ['D-000002', 'D-000003', 'D-000004'] : ['O-000001', 'O-000002', 'O-000003'];
    const file = `${store}/${ownerKind === 'decision' ? 'entries' : 'classes'}/typed.yaml`;
    const entries = ids.map((id, i) => ownerKind === 'ontology'
      ? { id, term: `Typed ${id}`, class: 'general', summary: `Original ${id}`, status: 'active',
        'source-of-truth': [path('src/owned.js')], 'last-verified': '2026-09-19', subjects: i === 0 ? ['S-000001'] : [] }
      : { id, title: `Typed ${id}`, category: 'architecture', status: i === 1 ? 'addressed' : 'accepted',
        date: '2026-09-19', deciders: ['steward'], context: `Original ${id}`, decision: 'Retained reasoning', subjects: i === 0 ? ['S-000001'] : [] });
    f.put(file, 'schema-version: 2\nentries:\n' + entries.map((entry) => Object.entries(entry)
      .map(([key, value], i) => `${i === 0 ? '  - ' : '    '}${key}: ${JSON.stringify(value)}\n`).join('')).join(''));
    const catalog = ownerKind === 'decision' ? JSON.parse(read('decisions/_catalog.yaml')) : { 'schema-version': 2, store, entries: [] };
    catalog.entries.push(...entries.map((entry) => ({ id: entry.id, title: entry.term ?? entry.title, file: file.slice(store.length + 1) })));
    f.put(`${store}/_catalog.yaml`, catalog);
    identity.allocations.push(...ids.map((id) => ({ kind: ownerKind, id, state: 'allocated', publication })));
  }
  f.put('src/owned.js', 'export const retained = true;\n');
  f.put('_identity.yaml', identity);
  // A normal block-frontmatter K record lets the same fixture exercise v2 notes.
  const knowledgeFile = f.context.model.leaves.get('K-000001').file;
  f.put(knowledgeFile, '---\nschema-version: 3\nid: K-000001\nheading: Retained Knowledge\ndomain: world\n'
    + 'citations: [{source: observed-source}]\nfacets: {stage: verified}\nsubjects: [S-000001]\n# Retained\n---\nEvidence stays.\n');
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'typed before');
  const commit = git('rev-parse', 'HEAD'); const tree = git('rev-parse', 'HEAD^{tree}');
  const model = loadStores(f.kitRoot);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const ids = kind === 'knowledge' ? ['K-000001'] : kind === 'ontology' ? ['O-000001', 'O-000002'] : ['D-000002', 'D-000003'];
  const current = iterateCurrentRecords(model, { kinds: [kind] });
  const rows = ids.map((id) => current.find((row) => row.ref.id === id));
  const source = captureCommittedFile({ repoRoot: f.root, commit, file: path(rows[0].entry.file) });
  let next = source.bytes.toString();
  if (kind === 'knowledge') {
    const note = { type: 'revision', date: noteInput.date,
      text: `Classification review by ${noteInput.author} using ${noteInput.skill}: subjects unknown (classification withdrawn). Existing evidence metadata retained.` };
    next = next.replace('subjects: [S-000001]\n', '').replace('# Retained', `notes:\n  - ${JSON.stringify(note)}\n# Retained`);
  } else next = next.replace('    subjects: ["S-000001"]\n', '').replace('subjects: []', 'subjects: ["S-000002"]');
  f.put(rows[0].entry.file, next);
  const capture = () => describeCandidateBytes({ file: source.locator.file, bytes: Buffer.from(read(rows[0].entry.file)), objectFormat: source.objectFormat });
  const authorizer = captureCommittedFile({ repoRoot: f.root, commit, file: path(model.decisions.get('D-000001').file) });
  const event = sealAssignmentEvent({ 'schema-version': 2, event: eventId, namespace: identity.namespace, operation: 'existing-subjects',
    scope: { kind: 'typed-records', refs: rows.map(({ ref }) => ref) },
    'before-input': { commit, tree, 'kit-path': kitPath }, decision: { namespace: identity.namespace, kind: 'decision', id: 'D-000001' },
    review: { reference: 'review:typed-assignment', 'accepted-status': 'accepted', 'decision-capture': authorizer.locator,
      'decision-digest': canonicalSha256(model.decisions.get('D-000001').record) },
    rows: rows.map(({ ref, entry }, i) => ({ ref, before: readAssignments(entry), after: i === 0
      ? { state: 'unknown', reason: 'absent' } : { state: 'known', ids: ['S-000002'] },
    'before-revision': 0, 'after-revision': 1, disposition: 'changed', reason: i === 0
      ? 'Withdraw unsupported classification; retain unknown aboutness.' : 'Review positive whole-record assignment.',
    'before-capture': source.locator, 'after-capture': capture() })) });
  const baseline = { 'schema-version': 1, namespace: identity.namespace,
    baselines: event.rows.map((row) => ({ ref: row.ref, state: row.before, capture: row['before-capture'] })) };
  const save = () => {
    for (const row of event.rows) row['after-capture'] = capture();
    f.put('subjects/_assignments/_baselines.yaml', baseline);
    f.put(`subjects/_assignments/${eventId}.yaml`, sealAssignmentEvent(event)); git('add', '.');
    const nextTree = git('write-tree'); const candidateCommit = git('commit-tree', nextTree, '-p', commit, '-m', 'typed candidate');
    return { ...options, before: { commit, tree, kitPath }, candidate: { commit: candidateCommit, tree: nextTree, kitPath } };
  };
  const options = { repoRoot: f.root, eventId, selection: structuredClone(event.scope), reviewNote: noteInput,
    decisionCaptures: f.decisionCaptures, limits: { maxRecords: 20, maxCaptureBytes: 1000000, maxRedirects: 20 }, impact: { required: [] } };
  const prepared = save();
  return { ...f, git, read, path, event, baseline, options, prepared, save, model, source, file: rows[0].entry.file };
}
