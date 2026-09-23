/** Literal split history over actual committed registry, ledger and Decision captures. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { captureCommittedFile } from '../../payload/engine/lib/captured-source.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { evaluateSubjectGovernance } from '../../payload/engine/lib/subject-governance.js';

const keys = { schemaVersion: 'schema-version', hierarchyRevision: 'hierarchy-revision', originDecision: 'origin-decision',
  acceptedStatus: 'accepted-status', decisionCapture: 'decision-capture', decisionDigest: 'decision-digest', changeDigest: 'change-digest',
  refusalAssessment: 'refusal-assessment', beforeRegistry: 'before-registry', documentDigest: 'document-digest',
  identityDigest: 'identity-digest', relevantRefusals: 'relevant-refusals', unchangedMeaning: 'unchanged-meaning', priorRefusal: 'prior-refusal' };
const wire = value => Array.isArray(value) ? value.map(wire) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [keys[key] ?? key, wire(item)])) : value;
export const splitHistoryState = ({ id, changes, ...value }) => structuredClone(value);
export const splitHistoryDigest = ({ review, ...event }) => canonicalSha256(event);

export function subjectSplitHistoryFixture(t, { objectFormat = 'sha1', nested = false, count = 3, parents = [], retiredParent = false } = {}) {
  const f = subjectQueryDiskFixture(t, { objectFormat, nested, descendants: true });
  const kitPath = nested ? 'unknown-knowledge' : '.';
  const git = (...args) => {
    const result = spawnSync('/usr/bin/git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', f.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const commit = message => {
    git('add', '.'); git('commit', '--allow-empty', '-qm', message);
    return { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath };
  };
  const capture = (descriptor, file) => {
    const actual = captureCommittedFile({ repoRoot: f.root, commit: descriptor.commit,
      file: kitPath === '.' ? file : `${kitPath}/${file}` });
    return { capture: actual.locator, bytes: actual.bytes, objectFormat: actual.objectFormat };
  };
  const read = file => readFileSync(join(f.kitRoot, file), 'utf8');
  git('init', `--object-format=${objectFormat}`, '-q');
  // Deliberate loose-object deletion tests need stable storage until restoration.
  git('config', 'gc.auto', '0');
  git('config', 'maintenance.auto', 'false');
  const approvalSource = commit('original accepted Decision bytes');
  const decisionCapture = capture(approvalSource, 'decisions/entries/approval.yaml');
  const beforeDocument = structuredClone(f.context.model.subjectRegistry.document);
  for (const event of beforeDocument.history) {
    event.review.decisionCapture = decisionCapture.capture;
    for (const row of event.rows) row.after.warrant.records[0].capture = decisionCapture.capture;
    event.review.changeDigest = splitHistoryDigest(event);
  }
  for (const subject of beforeDocument.subjects) subject.warrant.records[0].capture = decisionCapture.capture;
  if (retiredParent) {
    const original = beforeDocument.subjects.find(({ id }) => id === 'S-000003');
    const after = { ...splitHistoryState(original), status: 'retired', retirement: { kind: 'retire' } };
    const event = { id: 'a1000000-0000-4000-8000-000000000009', action: 'retire', decision: original.originDecision,
      reason: 'Retire the existing parent before successor activation', rows: [{ id: original.id, before: splitHistoryState(original), after }] };
    event.review = { ...structuredClone(beforeDocument.history[0].review), changeDigest: splitHistoryDigest(event) };
    beforeDocument.history.push(event); beforeDocument.revision += 1;
    Object.assign(original, after); original.changes.push(event.id);
  }
  f.put('subjects/registry.yaml', wire(beforeDocument));
  const before = commit('actual pre-split authority');
  const beforeCaptures = { registry: capture(before, 'subjects/registry.yaml'), identity: capture(before, '_identity.yaml') };
  const beforeModel = loadStores(f.kitRoot);
  assert.equal(beforeModel.ok, true, JSON.stringify(beforeModel.diagnostics));
  const ids = Array.from({ length: count }, (_, index) => `S-${String(index + 4).padStart(6, '0')}`);
  const original = beforeDocument.subjects.find(({ id }) => id === 'S-000001');
  const activation = { id: 'a1000000-0000-4000-8000-000000000001', action: 'activate',
    decision: structuredClone(original.originDecision), reason: 'Review distinct successor meanings',
    rows: ids.map((id, index) => ({ id, before: null,
      after: { ...splitHistoryState(original), label: `Successor ${index + 1}`,
        definition: { text: `Distinct successor meaning ${index + 1}`, includes: [], excludes: [] },
        ...(parents[index] ? { parent: parents[index] } : {}) } })),
    refusalAssessment: { version: 1, scope: {
      beforeRegistry: { capture: beforeCaptures.registry.capture, documentDigest: canonicalSha256(beforeDocument) },
      identityDigest: canonicalSha256(beforeModel.identity) }, coverage: 'complete-registry',
    attestation: 'all-current-suppressed-meanings-assessed', relevantRefusals: [] } };
  activation.review = { ...structuredClone(beforeDocument.history[0].review), reference: 'review:split', changeDigest: splitHistoryDigest(activation) };
  const split = { id: 'a1000000-0000-4000-8000-000000000002', action: 'split', decision: structuredClone(activation.decision),
    reason: 'Retain the old meaning with explicit successor alternatives', rows: [{ id: original.id,
      before: splitHistoryState(original), after: { ...splitHistoryState(original), status: 'retired',
        retirement: { kind: 'split', successors: ids } } }] };
  split.review = { ...structuredClone(activation.review), changeDigest: splitHistoryDigest(split) };
  const identity = structuredClone(beforeModel.identity);
  // Expected candidate bytes are handwritten; no planner constructs fixture truth.
  identity.allocations.push(...ids.map(id => ({ id, kind: 'subject', state: 'allocated',
    publication: { id: 'a1000000-0000-4000-8000-000000000003', review: 'review:split' } })));
  const document = { ...structuredClone(beforeDocument), history: [...structuredClone(beforeDocument.history), activation, split] };
  const result = { ...f, git, read, commit, capture, before, beforeModel, beforeDocument, beforeCaptures,
    document, identity, activation, split, ids, decisionCaptures: [decisionCapture], assessmentCaptures: [beforeCaptures],
    reload({ resign = true } = {}) {
      const states = new Map(); const changes = new Map();
      for (const event of document.history) {
        if (resign) event.review.changeDigest = splitHistoryDigest(event);
        for (const row of event.rows) {
          states.set(row.id, structuredClone(row.after));
          changes.set(row.id, [...(changes.get(row.id) ?? []), event.id]);
        }
      }
      document.subjects = [...states].map(([id, state]) => ({ id, ...state, changes: changes.get(id) }));
      document.revision = document.history.length;
      document.hierarchyRevision = document.history.filter(event => event.rows.some(row =>
        (row.before?.parent ?? null) !== (row.after.parent ?? null))).length;
      f.put('_identity.yaml', identity); f.put('subjects/registry.yaml', wire(document));
      this.model = loadStores(f.kitRoot); return this.model;
    },
    evaluate(options = {}) {
      if (!this.model.ok) return { ok: false, governance: null, diagnostics: this.model.diagnostics };
      return evaluateSubjectGovernance({ registry: this.model.subjectRegistry, identity: this.model.identity,
        identityIndex: this.model.identityIndex, decisionCaptures: this.decisionCaptures,
        assessmentCaptures: this.assessmentCaptures }, options);
    },
  };
  result.reload(); result.candidate = commit('literal activation then split candidate');
  return result;
}
