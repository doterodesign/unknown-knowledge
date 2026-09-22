/** Literal existing-record edits over actual source history; never planner-produced expectations. */
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { priorReconsideredLifecycleFixture, lifecycleKnowledgeFile } from './subject-lifecycle-material-fixture.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';

const eventId = 'b7000000-0000-4000-8000-000000000001';
const governance = { maxCaptureBytes: 10000000, maxDocumentNodes: 200000, maxDocumentTextUnits: 3000000,
  maxSubjects: 1000, maxHistoryRows: 10000, maxValidationSteps: 1000000 };
const entries = rows => 'schema-version: 2\nentries:\n' + rows.map(row => Object.entries(row)
  .map(([key, value], index) => `${index === 0 ? '  - ' : '    '}${key}: ${JSON.stringify(value)}\n`).join('')).join('');
const known = ids => ({ state: 'known', ids });
const absent = { state: 'unknown', reason: 'absent' };

export async function typedAssignmentSourceFixture(t, { kind = 'mixed', objectFormat = 'sha1', nested = false,
  continuation = false, decisionsOnly = false } = {}) {
  assert.ok(['mixed', 'knowledge', 'ontology', 'decision'].includes(kind));
  const base = continuation ? await priorReconsideredLifecycleFixture(t, { objectFormat, nested })
    : subjectQueryDiskFixture(t, { objectFormat, nested });
  const root = base.root, kitRoot = base.kitRoot, kitPath = nested ? 'unknown-knowledge' : '.';
  const path = file => nested ? `${kitPath}/${file}` : file;
  const read = file => readFileSync(join(kitRoot, file), 'utf8');
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  if (!continuation) git('init', '-q', `--object-format=${objectFormat}`);
  const beforeModel = loadStores(kitRoot), ledger = structuredClone(beforeModel.identity);
  const a = 'S-000001', b = continuation ? null : 'S-000002';
  const ab = b ? [a, b] : [a];
  const authorizer = continuation ? 'D-000003' : 'D-000001';
  const rowDefinitions = [
    { kind: 'knowledge', id: 'K-000101', before: absent, after: known([]), file: 'knowledge/typed-101.md' },
    { kind: 'ontology', id: 'O-000101', before: known([]), after: known([a]), file: 'ontology/classes/typed-assignment.yaml' },
    { kind: 'decision', id: 'D-000101', before: known(ab), after: known(b ? [b] : []), file: 'decisions/entries/typed-assignment.yaml' },
    { kind: 'decision', id: 'D-000102', before: known([a]), after: absent, file: 'decisions/entries/typed-assignment.yaml' },
    { kind: 'ontology', id: 'O-000102', before: known(ab), after: known(ab), file: 'ontology/classes/typed-assignment.yaml', unselected: true },
  ].filter(row => !decisionsOnly || row.kind === 'decision');
  if (decisionsOnly) for (const store of ['knowledge', 'ontology']) rmSync(join(kitRoot, store), { recursive: true, force: true });
  base.put('src/typed-assignment.js', 'export const typed = true;\n');
  const record = row => ({ ...(row.kind === 'knowledge'
    ? { 'schema-version': 3, id: row.id, heading: row.id, domain: 'world', citations: [{ source: 'Retained cited material' }], facets: { stage: 'verified' } }
    : row.kind === 'ontology'
      ? { id: row.id, term: row.id, class: 'general', summary: 'Retained artifact fact', status: 'active',
        'source-of-truth': [path('src/typed-assignment.js')], 'last-verified': '2026-09-21' }
      : { id: row.id, title: row.id, category: 'architecture', status: row.id === 'D-000102' ? 'addressed' : 'accepted',
        date: '2026-09-21', deciders: ['steward'], context: 'Retained reasoning', decision: 'Preserve the recorded choice' }),
    ...(row.before.state === 'known' ? { subjects: row.before.ids } : {}) });
  const authored = rowDefinitions.map(row => ({ ...row, ref: { namespace: ledger.namespace, kind: row.kind, id: row.id }, record: record(row) }));
  for (const row of authored) ledger.allocations.push({ kind: row.kind, id: row.id, state: 'allocated', publication: ledger.allocations[0].publication });
  for (const store of ['knowledge', 'ontology', 'decisions']) {
    const selected = authored.filter(row => (row.kind === 'decision' ? 'decisions' : row.kind) === store);
    if (!selected.length) continue;
    const catalog = beforeModel.stores[store]?.catalog ? JSON.parse(read(`${store}/_catalog.yaml`)) : { 'schema-version': 2, store, entries: [] };
    catalog.entries.push(...selected.map(row => ({ id: row.id, title: row.id, file: row.file.slice(store.length + 1) })));
    base.put(`${store}/_catalog.yaml`, catalog);
    for (const file of new Set(selected.map(row => row.file))) {
      const rows = selected.filter(row => row.file === file);
      base.put(file, store === 'knowledge' ? lifecycleKnowledgeFile(rows[0].record, `Unchanged cited body ${rows[0].id}.\n`) : entries(rows.map(row => row.record)));
    }
  }
  base.put('_identity.yaml', ledger);
  git('add', '.'); git('commit', '-qm', 'actual existing typed assignment source');
  const source = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath };
  const model = loadStores(kitRoot); assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const selected = authored.filter(row => !row.unselected && (kind === 'mixed' || row.kind === kind));
  assert.ok(selected.length);
  const reviewNote = { date: '2026-09-21', author: 'steward', skill: 'kb-build' };
  const captures = new Map([...new Set(selected.map(row => row.file))].map(file => [file,
    captureCommittedFile({ repoRoot: root, commit: source.commit, file: path(file) })]));
  for (const file of captures.keys()) {
    const rows = authored.filter(row => row.file === file);
    const changed = rows.map(row => {
      const next = structuredClone(row.record);
      if (selected.includes(row)) { if (row.after.state === 'known') next.subjects = row.after.ids; else delete next.subjects; }
      return next;
    });
    if (rows[0].kind === 'knowledge') {
      const row = rows[0], text = row.after.state === 'known' ? (row.after.ids.length ? row.after.ids.join(', ') : 'explicit empty') : 'unknown (classification withdrawn)';
      base.put(file, lifecycleKnowledgeFile(changed[0], `Unchanged cited body ${row.id}.\n`, { type: 'revision', date: reviewNote.date,
        text: `Classification review by ${reviewNote.author} using ${reviewNote.skill}: subjects ${text}. Existing evidence metadata retained.` }));
    } else base.put(file, entries(changed));
  }
  const decisionFile = model.decisions.get(authorizer).file;
  const decisionCapture = captureCommittedFile({ repoRoot: root, commit: source.commit, file: path(decisionFile) });
  const event = { 'schema-version': 2, event: eventId, namespace: ledger.namespace, operation: 'existing-subjects',
    scope: { kind: 'typed-records', refs: selected.map(row => row.ref) },
    'before-input': { commit: source.commit, tree: source.tree, 'kit-path': kitPath }, decision: { namespace: ledger.namespace, kind: 'decision', id: authorizer },
    review: { reference: 'review:typed-assignment-publication', 'accepted-status': model.decisions.get(authorizer).record.status,
      'decision-capture': decisionCapture.locator, 'decision-digest': canonicalSha256(model.decisions.get(authorizer).record) },
    rows: selected.map(row => ({ ref: row.ref, before: row.before, after: row.after, 'before-revision': 0, 'after-revision': 1,
      disposition: 'changed', reason: 'Reviewed change to whole-record classification; preserve original truth evidence',
      'before-capture': captures.get(row.file).locator,
      'after-capture': describeCandidateBytes({ file: path(row.file), bytes: Buffer.from(read(row.file)), objectFormat }) })) };
  const baseline = { 'schema-version': 1, namespace: ledger.namespace, baselines: event.rows.map(row => ({ ref: row.ref, state: row.before, capture: row['before-capture'] })) };
  const options = { repoRoot: root, eventId, selection: structuredClone(event.scope), reviewNote,
    decisionCaptures: continuation ? base.evidence.decisionCaptures : base.decisionCaptures,
    ...(continuation ? { continuation: { version: 1, assessmentCaptures: base.evidence.assessmentCaptures,
      materialCaptures: base.evidence.materialCaptures, limits: { governance } } } : {}),
    limits: { maxRecords: 100, maxCaptureBytes: 10000000, maxRedirects: 1000 }, impact: { required: [] } };
  const save = () => {
    for (const row of event.rows) {
      const owner = selected.find(item => item.ref.id === row.ref.id);
      row['after-capture'] = describeCandidateBytes({ file: path(owner.file), bytes: Buffer.from(read(owner.file)), objectFormat });
    }
    base.put('subjects/_assignments/_baselines.yaml', baseline);
    base.put(`subjects/_assignments/${eventId}.yaml`, sealAssignmentEvent(event));
    git('add', '.'); const tree = git('write-tree');
    const commit = git('commit-tree', tree, '-p', source.commit, '-m', 'typed classification candidate');
    return { ...options, before: source, candidate: { commit, tree, kitPath } };
  };
  const prepared = save();
  return { ...base, root, kitRoot, objectFormat, git, read, path, event, baseline, options, prepared, save,
    model, source, authored, selected, file: selected[0].file, prior: captures.get(selected[0].file) };
}
