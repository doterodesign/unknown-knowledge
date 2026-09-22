import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { subjectReconsiderationCoreFixture } from './subject-reconsideration-core-fixture.js';
import { captureCommittedFile, describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { runChecks } from '../../payload/engine/commands/validate.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence } from '../../payload/engine/lib/prepared-evidence.js';
import { queryBudgets } from './subject-query-fixture.js';
import { runtimeLimits, evidenceLimits } from './final-assignment-fixture.js';

const eventId = 'b6000000-0000-4000-8000-000000000001';
export function assignmentContinuationFixture(t, { objectFormat = 'sha1', nested = false, afterIds = ['S-000001'] } = {}) {
  const f = subjectReconsiderationCoreFixture(t, { objectFormat, nested, stores: 'knowledge', beforeChange({ put }) {
    for (const [id, domain] of [['K-000001', 'reviewed'], ['K-000002', 'other']]) {
      put(`knowledge/${id}.md`, `---\nschema-version: 3\nid: ${id}\nheading: ${id}\ndomain: world\ncitations: [{source: Prior source}]\nfacets: {stage: verified, domain: ${domain}}\nsubjects: []\n# retained\n---\nOriginal body ${id}.\n`);
    }
    put('knowledge/_registries/domains.yaml', { 'schema-version': 2, store: 'knowledge', registry: 'domains', hierarchical: true,
      values: ['reviewed', 'other'].map(value => ({ value, warrant: 'Actual fixture record', decision: 'D-000003' })) });
  } });
  const source = f.candidate, model = loadStores(f.kitRoot), path = file => nested ? `unknown-knowledge/${file}` : file;
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  assert.deepEqual(runChecks(model, f.repoRoot).filter(row => row.severity === 'error'), []);
  const ref = { namespace: model.identity.namespace, kind: 'knowledge', id: 'K-000001' };
  const file = 'knowledge/K-000001.md';
  const prior = captureCommittedFile({ repoRoot: f.repoRoot, commit: source.commit, file: path(file) });
  const decision = { namespace: ref.namespace, kind: 'decision', id: 'D-000003' };
  const decisionCapture = captureCommittedFile({ repoRoot: f.repoRoot, commit: source.commit, file: path(model.decisions.get(decision.id).file) });
  const reviewNote = { date: '2026-09-20', author: 'steward', skill: 'kb-build' };
  const changed = afterIds.length > 0;
  const note = { type: 'revision', date: reviewNote.date,
    text: `Classification review by ${reviewNote.author} using ${reviewNote.skill}: subjects ${afterIds.join(', ')}. Existing evidence metadata retained.` };
  const text = prior.bytes.toString().replace('subjects: []', `subjects: ${JSON.stringify(afterIds)}`)
    .replace('# retained', changed ? `notes:\n  - ${JSON.stringify(note)}\n# retained` : '# retained');
  f.put(file, text);
  const event = sealAssignmentEvent({ 'schema-version': 1, event: eventId, namespace: ref.namespace,
    scope: { kind: 'knowledge-domain', occupancy: 'allocated', field: 'facets.domain', match: 'exact', values: ['reviewed'] },
    'before-input': { commit: source.commit, tree: source.tree, 'kit-path': source.kitPath }, decision,
    review: { reference: 'review:first-assignment-after-reconsideration', 'accepted-status': 'accepted',
      'decision-capture': decisionCapture.locator, 'decision-digest': canonicalSha256(model.decisions.get(decision.id).record) },
    rows: [{ ref, before: { state: 'known', ids: [] }, after: { state: 'known', ids: afterIds },
      'before-revision': 0, 'after-revision': Number(changed), disposition: changed ? 'changed' : 'unchanged',
      reason: 'Reviewed first use of reconsidered meaning', 'before-capture': prior.locator,
      'after-capture': describeCandidateBytes({ file: path(file), bytes: Buffer.from(text), objectFormat }) }] });
  const baseline = { 'schema-version': 1, namespace: ref.namespace,
    baselines: [{ ref, state: { state: 'known', ids: [] }, capture: prior.locator }] };
  const save = () => {
    f.put('subjects/_assignments/_baselines.yaml', baseline);
    f.put(`subjects/_assignments/${eventId}.yaml`, sealAssignmentEvent(event));
    f.git('add', '.');
  };
  save();
  const options = { repoRoot: f.repoRoot, eventId, reviewNote, decisionCaptures: f.evidence.decisionCaptures,
    continuation: { version: 1, assessmentCaptures: f.evidence.assessmentCaptures, materialCaptures: f.evidence.materialCaptures,
      limits: { governance: { ...f.limits.governance } } },
    limits: { maxRecords: 100, maxCaptureBytes: 1000000, maxRedirects: 20 }, impact: { required: [] } };
  const prepare = () => {
    const tree = f.git('write-tree');
    const commit = f.git('commit-tree', tree, '-p', source.commit, '-m', 'prepared ordinary assignment after reconsideration');
    return { ...options, before: source, candidate: { commit, tree, kitPath: source.kitPath } };
  };
  return { ...f, source, event, baseline, ref, prior, options, save, prepare, path, root: f.repoRoot };
}

export function assignmentContinuationWireInput(input, impact = {}) {
  const capture = ({ bytes, ...row }) => ({ ...row, bytesBase64: bytes.toString('base64') });
  return { eventId: input.eventId, reviewNote: input.reviewNote, limits: input.limits, impact, maxEventBytes: 100000,
    decisionCaptures: input.decisionCaptures.map(capture), continuation: { ...input.continuation,
      assessmentCaptures: input.continuation.assessmentCaptures.map(pair => ({ registry: capture(pair.registry), identity: capture(pair.identity) })),
      materialCaptures: input.continuation.materialCaptures.map(capture) } };
}

export async function retainedAssignmentContinuationFixture(t, options = {}, change) {
  const f = assignmentContinuationFixture(t, options), prepared = f.prepare();
  const base = mkdtempSync(join(tmpdir(), 'continued-assignment-evidence-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const evidenceDirectory = join(base, 'evidence');
  mkdirSync(evidenceDirectory, { mode: 0o700 });
  const operationInputs = assignmentContinuationWireInput(prepared, {
    regeneratedViews: { inventory: { version: 1, coverage: 'complete', views: [{ id: 'subject-tree', kind: 'subject-tree',
      options: { budget: { nodes: 50, edges: 50, rows: 20 }, maxBytes: 100000 } }] }, limits: { version: 1, maxViews: 10 } },
    representativeReplays: { limits: { version: 1, maxSubjects: 3, maxEligibilityRedirects: 0,
      maxCases: 500, maxInventoryBytes: 1000000 }, queryBudgets: { ...queryBudgets } },
  });
  change?.(operationInputs);
  const source = prepared.before, candidate = prepared.candidate;
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation: 'subject-assignment',
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  const expected = { source, candidate, operation: 'subject-assignment', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const retained = readRetainedPreparedEvidence({ evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits });
  // Independent test-only adopted configuration; no production auto-approval.
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const input = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: retained.bundleDigest, expected,
    approvedRuntimeProfile: { digest: canonicalSha256(profile), profile }, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  return { ...f, source, candidate, prepared, operationInputs, validation, retained, input };
}
