/** Actual registry-only equivalent merge, retaining positive survivor users. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { load as loadYaml } from 'js-yaml';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { priorReconsideredLifecycleFixture, lifecycleKnowledgeFile } from './subject-lifecycle-material-fixture.js';
import { mergeInput } from './equivalent-merge-input-fixture.js';
import { wire as registryWire } from './subject-reconsideration-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { loadSubjectQueryContext } from '../../payload/engine/lib/subject-query-context.js';
import { iterateCurrentRecords, iterateProposalRecords } from '../../payload/engine/lib/record-identity.js';
import { readAssignments } from '../../payload/engine/lib/subject-assignments.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { captureCommittedFile } from '../../payload/engine/lib/captured-source.js';

export async function equivalentMergeZeroFixture(t, { objectFormat = 'sha1', nested = false,
  material = false, beforeChange, candidateChange } = {}) {
  const base = material ? await priorReconsideredLifecycleFixture(t, { objectFormat, nested, priorReconsideration: true })
    : subjectQueryDiskFixture(t, { objectFormat, nested });
  const root = base.root, kitPath = nested ? 'unknown-knowledge' : '.';
  const git = (...args) => {
    const value = spawnSync('/usr/bin/git', ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-C',root,...args], { encoding: 'utf8' });
    assert.equal(value.status, 0, value.stderr); return value.stdout.trim();
  };
  if (!material) git('init', '-q', `--object-format=${objectFormat}`);
  const read = file => readFileSync(join(base.kitRoot, file), 'utf8');
  const commit = message => {
    git('add', '.'); git('commit', '-qm', message);
    return { commit: git('rev-parse','HEAD'), tree: git('rev-parse','HEAD^{tree}'), kitPath };
  };
  const sourceId = material ? 'S-000002' : 'S-000001', survivorId = material ? 'S-000001' : 'S-000002';
  const model = loadStores(base.kitRoot);
  for (const entry of [...model.leaves.values(), ...model.proposals.knowledge.values()]) {
    const file = entry.record.id.startsWith('proposal:') ? 'knowledge/draft.md' : `knowledge/${entry.record.id}.md`;
    const parts = read(file).split('---'); const record = loadYaml(parts[1]);
    if (Object.hasOwn(record, 'subjects')) record.subjects = record.subjects.filter(id => id !== sourceId);
    if (record.id === 'K-000001') record.subjects = [survivorId];
    base.put(file, lifecycleKnowledgeFile(record, parts.slice(2).join('---').replace(/^\n/, '')));
  }
  const input = mergeInput(); input.repoRoot = root;
  input.operation.absorbed = [sourceId]; input.operation.survivor = survivorId; input.operation.assignmentEvent = null;
  input.limits.closure = { maxRows: 1000, maxBytes: 1000000 };
  input.evidence = material ? base.evidence : { decisionCaptures: base.decisionCaptures, assessmentCaptures: [] };
  if (material) input.limits.governance = { ...base.limits.governance };
  const h = { ...base, root, git, read, commit, input, sourceId, survivorId };
  beforeChange?.(h);
  input.before = commit('actual zero direct use before equivalent merge');
  const before = loadStores(base.kitRoot); assert.equal(before.ok, true, JSON.stringify(before.diagnostics));
  const kinds = [['knowledge','knowledge'],['ontology','ontology'],['decision','decisions']]
    .filter(([,store]) => before.stores[store].present).map(([kind]) => kind);
  input.operation.retainedUnknowns = [...iterateCurrentRecords(before, { kinds }),
    ...iterateProposalRecords(before, { kinds })]
    .filter(row => readAssignments(row.entry).state === 'unknown')
    .map(row => ({ ...(row.ref ? { ref: row.ref } : { proposalRef: row.proposalRef }), reason: 'Preserve absent classification' }));
  const document = structuredClone(before.subjectRegistry.document), authorizer = document.history.at(-1);
  const state = ({ id, changes, ...row }) => structuredClone(row);
  const source = document.subjects.find(row => row.id === sourceId), survivor = document.subjects.find(row => row.id === survivorId);
  const event = { id: input.operation.registryEvents[0].id, action: 'merge-equivalent', decision: authorizer.decision,
    reason: 'Reviewed equivalent meaning with no source assignments', rows: [
      { id: sourceId, before: state(source), after: { ...state(source), status: 'retired', retirement: { kind: 'equivalent-merge', redirect: survivorId } }, reason: 'Use the survivor' },
      { id: survivorId, before: state(survivor), after: state(survivor), reason: 'Preserve survivor meaning' }] };
  event.review = { ...authorizer.review, changeDigest: canonicalSha256(event) };
  for (const row of event.rows) {
    const subject = document.subjects.find(item => item.id === row.id); Object.assign(subject, row.after); subject.changes.push(event.id);
  }
  document.history.push(event); document.revision++;
  candidateChange?.({ ...h, document, event });
  const { review, ...body } = event; event.review.changeDigest = canonicalSha256(body);
  base.put('subjects/registry.yaml', registryWire(document));
  input.operation.registryEvents[0].changeDigest = event.review.changeDigest;
  input.candidate = commit('actual registry-only equivalent merge');
  const capture = (descriptor, file) => captureCommittedFile({ repoRoot: root, commit: descriptor.commit,
    file: kitPath === '.' ? file : `${kitPath}/${file}` });
  const survivorRef = { namespace: before.identity.namespace, kind: 'knowledge', id: 'K-000001' };
  const loaded = loadSubjectQueryContext({ root, ...input.evidence });
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return { ...h, document, event, capture, survivorRef, zero: true };
}

// Reuse actual runner/final/request setup; only the domain source factory differs.
import { finalSubjectMergeMaterialFixture, reviewSubjectMergeMaterialFixture } from './subject-merge-material-fixture.js';
export { runtimeLimits, evidenceLimits, reviewLimits, mergeMaterialEvidenceVariant as equivalentMergeZeroEvidenceVariant } from './subject-merge-material-fixture.js';
export function finalEquivalentMergeZeroFixture(t, options = {}) {
  return finalSubjectMergeMaterialFixture(t, options, equivalentMergeZeroFixture);
}
export function equivalentMergeZeroReviewFixture(t, options = {}) {
  return reviewSubjectMergeMaterialFixture(t, options, equivalentMergeZeroFixture);
}
