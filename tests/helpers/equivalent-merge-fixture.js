import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { mergeInput } from './equivalent-merge-input-fixture.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { withTreeSnapshot } from '../../payload/engine/lib/commit-snapshot.js';
import { loadSubjectQueryContext } from '../../payload/engine/lib/subject-query-context.js';

const wireKeys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision', originDecision: 'origin-decision',
  acceptedStatus: 'accepted-status', decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest' };
export function registryWire(value) {
  if (Array.isArray(value)) return value.map(registryWire);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [wireKeys[key] ?? key, registryWire(item)]));
  return value;
}

export function equivalentMergeFixture(t, { beforeChange, candidateChange, survivor = 'S-000002', nested = false } = {}) {
  const f = subjectQueryDiskFixture(t, { nested }); const input = mergeInput();
  const kitPath = nested ? 'unknown-knowledge' : '.';
  input.operation.survivor = survivor;
  const git = (...args) => {
    const r = spawnSync('/usr/bin/git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', f.root, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  const read = (file) => readFileSync(join(f.kitRoot, file), 'utf8');
  const replaceSubjects = (file, subjects) => {
    const text = read(file); const parts = text.split('---\n');
    const record = JSON.parse(parts[1]);
    if (subjects === undefined) delete record.subjects; else record.subjects = subjects;
    parts[1] = `${JSON.stringify(record)}\n`; f.put(file, parts.join('---\n'));
  };
  replaceSubjects('knowledge/draft.md', []);
  beforeChange?.({ ...f, replaceSubjects, read });
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'before merge');
  input.repoRoot = f.root;
  input.before = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath };
  const loaded = loadSubjectQueryContext({ root: f.root, decisionCaptures: f.decisionCaptures });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const document = structuredClone(loaded.context.model.subjectRegistry.document);
  const oldSource = document.subjects.find(({ id }) => id === 'S-000001');
  const oldSurvivor = document.subjects.find(({ id }) => id === survivor);
  const state = ({ id, changes, ...row }) => structuredClone(row);
  const event = { id: input.operation.registryEvents[0].id, action: 'merge-equivalent',
    decision: document.history[0].decision, reason: 'Reviewed equivalent meaning', rows: [
      { id: oldSource.id, before: state(oldSource), after: { ...state(oldSource), status: 'retired',
        retirement: { kind: 'equivalent-merge', redirect: oldSurvivor.id } }, reason: 'Use the reviewed survivor' },
      { id: oldSurvivor.id, before: state(oldSurvivor), after: state(oldSurvivor), reason: 'Preserve the survivor meaning' },
    ] };
  event.review = { ...document.history[0].review, changeDigest: canonicalSha256(event) };
  document.history.push(event); document.revision += 1;
  for (const row of event.rows) {
    const i = document.subjects.findIndex(({ id }) => id === row.id);
    document.subjects[i] = { id: row.id, ...structuredClone(row.after), changes: [...document.subjects[i].changes, event.id] };
  }
  replaceSubjects('knowledge/K-000001.md', [survivor]);
  replaceSubjects('knowledge/K-000002.md', ['S-000002', 'S-000003']);
  candidateChange?.({ ...f, document, event, replaceSubjects, read });
  const { review, ...body } = event; event.review.changeDigest = canonicalSha256(body);
  f.put('subjects/registry.yaml', registryWire(document));
  git('add', '.'); git('commit', '-qm', 'candidate merge');
  input.candidate = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath };
  input.operation.registryEvents[0].changeDigest = event.review.changeDigest;
  input.evidence = { decisionCaptures: f.decisionCaptures, assessmentCaptures: [] };
  input.operation.retainedUnknowns = [
    { ref: { namespace: document.namespace, kind: 'knowledge', id: 'K-000005' }, reason: 'Preserve unclassified Knowledge' },
    { ref: { namespace: document.namespace, kind: 'decision', id: 'D-000001' }, reason: 'Preserve unclassified authorizer' },
  ];
  const withCoreInput = (fn) => withTreeSnapshot(f.root, input.before.tree, (before) =>
    withTreeSnapshot(f.root, input.candidate.tree, (candidate) => {
      const contexts = {};
      for (const [side, snapshot] of [['before', before], ['candidate', candidate]]) {
        const result = loadSubjectQueryContext({ root: snapshot.root, ...input.evidence });
        assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); contexts[side] = result.context;
      }
      return fn({ repoRoot: f.root, before: { descriptor: input.before, root: before.root, context: contexts.before },
        candidate: { descriptor: input.candidate, root: candidate.root, context: contexts.candidate },
        operation: input.operation, reviewNote: input.reviewNote, evidence: input.evidence,
        limits: { inventory: input.limits.inventory, governance: input.limits.governance } });
    }));
  return { ...f, input, document, event, git, read, replaceSubjects, withCoreInput };
}
