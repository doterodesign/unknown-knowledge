/** Actual reconsideration history followed by native typed canonical genesis. */
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { priorReconsideredLifecycleFixture, lifecycleKnowledgeFile } from './subject-lifecycle-material-fixture.js';
import { typedPromotionGateFixture } from './typed-promotion-gate-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { sealAssignmentEvent } from './assignment-event-fixture.js';

const entryFile = entries => `{"schema-version":2,"entries":[\n${entries.map(entry => JSON.stringify(entry)).join(',\n')}\n]}\n`;
const today = '2026-09-21';
const publication = { id: 'b2000000-0000-4000-8000-000000000001', review: 'review:material-record-promotion' };
const eventId = 'b2000000-0000-4000-8000-000000000002';
const limits = governance => ({
  promotion: { maxFiles: 100, maxFileBytes: 1000000, maxSourceBytes: 10000000, maxPromotions: 10 },
  assignments: { maxRecords: 100, maxCaptureBytes: 10000000, maxRedirects: 1000 }, governance: { ...governance },
  reach: { maxHierarchyNodes: 10000, maxHierarchyEdges: 10000, maxRecords: 1000 }, views: { version: 1, maxViews: 1 },
  tree: { budget: { nodes: 10000, edges: 10000, rows: 10000 }, maxBytes: 1000000 },
  replays: { version: 1, maxSubjects: 100, maxEligibilityRedirects: 1000, maxCases: 1000, maxInventoryBytes: 5000000 },
  query: { version: 1, maxAstNodes: 100, maxAstDepth: 10, maxHierarchyNodes: 10000, maxHierarchyEdges: 10000,
    maxRedirects: 1000, maxRecords: 1000, maxPredicateSteps: 100000, maxResultsPerStore: 1000, maxExplanationNodes: 100000 },
});

export async function recordPromotionMaterialFixture(t, { kind = 'knowledge', objectFormat = 'sha1', nested = false,
  subjectAuthority = true, companionStores } = {}) {
  assert.ok(['knowledge', 'ontology', 'decision'].includes(kind));
  if (!subjectAuthority) {
    const f = typedPromotionGateFixture(t, { kind, format: objectFormat, nested, subjectAuthority: false, history: false,
      ...(companionStores === undefined ? {} : { companionStores }) });
    f.input.evidence.materialCaptures = [];
    return { ...f, objectFormat, reconsideration: null, subjectAuthority };
  }
  const f = await priorReconsideredLifecycleFixture(t, { objectFormat, nested });
  f.git('branch', '-M', 'source');
  const store = kind === 'decision' ? 'decisions' : kind;
  const path = file => nested ? `unknown-knowledge/${file}` : file;
  const model = loadStores(f.kitRoot); assert.equal(model.ok, true);
  const identity = structuredClone(model.identity), namespace = identity.namespace;
  const authorizer = structuredClone(model.decisions.get('D-000003').record);
  const authorizerFile = 'decisions/entries/review.yaml';
  if (companionStores !== undefined) {
    assert.equal(kind, 'decision');
    for (const name of ['knowledge', 'ontology']) if (!companionStores.includes(name)) rmSync(join(f.kitRoot, name), { recursive: true });
  }
  if (kind === 'knowledge') {
    const stages = JSON.parse(f.read('knowledge/_registries/stage.yaml'));
    stages.values.push({ value: 'proposed', gloss: 'Proposed', warrant: 'Original proposal', decision: 'D-000003' });
    f.put('knowledge/_registries/stage.yaml', stages);
  }
  const assignments = [undefined, [], ['S-000001']];
  const canonicalIds = kind === 'decision' ? ['D-000004', 'D-000005', 'D-000006']
    : kind === 'knowledge' ? ['K-000003', 'K-000004', 'K-000005'] : ['O-000003', 'O-000004', 'O-000005'];
  const sources = assignments.map((subjects, index) => {
    const id = `proposal:${kind}:b2000000-0000-4000-8000-00000000001${index}`;
    const classification = subjects === undefined ? {} : { subjects };
    const record = kind === 'knowledge' ? { 'schema-version': 3, id, heading: `Material record ${index}`, domain: 'world',
      facets: { stage: 'proposed' }, citations: [{ source: 'Retained source', accessed: today }], verified: today, volatility: 'stable', ...classification }
      : kind === 'ontology' ? { id, term: `Material concept ${index}`, class: 'general', summary: 'Actual source meaning', status: 'proposed',
        'source-of-truth': [path('src/owned.js')], 'last-verified': today, ...classification }
      : { ...authorizer, id, title: `Material decision ${index}`, status: 'proposed', ...classification };
    return { record, file: kind === 'knowledge' ? `knowledge/material-promotion-${index}.md` : `${store}/${kind === 'ontology' ? 'classes' : 'entries'}/material-promotion.yaml` };
  });
  const writeRecords = records => {
    if (kind === 'knowledge') records.forEach((record, i) => f.put(sources[i].file, lifecycleKnowledgeFile(record, 'Original cited body.\n')));
    else f.put(sources[0].file, entryFile(records));
  };
  writeRecords(sources.map(row => row.record));
  const catalog = JSON.parse(f.read(`${store}/_catalog.yaml`));
  catalog.entries.push(...sources.map(({ record, file }) => ({ id: record.id, title: record.heading ?? record.term ?? record.title, file: file.slice(store.length + 1) })));
  f.put(`${store}/_catalog.yaml`, catalog);
  const before = f.commit('actual material-governed record proposals');
  const targetLifecycle = { knowledge: 'verified', ontology: 'active', decision: 'accepted' }[kind];
  const rows = sources.map(({ record, file }, i) => ({ proposalRef: { namespace, kind, key: record.id },
    canonicalRef: { namespace, kind, id: canonicalIds[i] }, targetLifecycle, beforeCapture: f.capture(before, file).capture }));
  const candidateRecords = sources.map(({ record }, i) => ({ ...record, id: canonicalIds[i],
    ...(kind === 'knowledge' ? { facets: { ...record.facets, stage: targetLifecycle } } : { status: targetLifecycle }) }));
  writeRecords(candidateRecords);
  let catalogBytes = f.read(`${store}/_catalog.yaml`);
  rows.forEach(row => { catalogBytes = catalogBytes.replace(JSON.stringify(row.proposalRef.key), JSON.stringify(row.canonicalRef.id)); });
  f.put(`${store}/_catalog.yaml`, catalogBytes);
  const newRows = canonicalIds.map(id => ({ id, kind, state: 'allocated', publication }));
  f.put('_identity.yaml', f.read('_identity.yaml').replace('"allocations":[', `"allocations":[${newRows.map(row => JSON.stringify(row)).join(',')},`));
  const contentCapture = file => describeCandidateBytes({ file: path(file), bytes: Buffer.from(f.read(file)), objectFormat });
  const event = { 'schema-version': 2, event: eventId, namespace, operation: 'canonical-creation',
    scope: { kind: 'typed-records', refs: rows.map(row => row.canonicalRef) },
    'before-input': { commit: before.commit, tree: before.tree, 'kit-path': before.kitPath },
    decision: { namespace, kind: 'decision', id: 'D-000003' }, review: { reference: publication.review, 'accepted-status': 'accepted',
      'decision-capture': f.capture(before, authorizerFile).capture, 'decision-digest': canonicalSha256(authorizer) },
    rows: rows.map(({ canonicalRef }, i) => ({ ref: canonicalRef, before: null, 'before-capture': null, 'before-revision': null,
      after: assignments[i] === undefined ? { state: 'unknown', reason: 'absent' } : { state: 'known', ids: assignments[i] },
      'after-capture': contentCapture(sources[i].file), 'after-revision': 0, disposition: 'created', reason: 'Reviewed canonical genesis' })) };
  const save = () => {
    event.rows.forEach((row, i) => { row['after-capture'] = contentCapture(sources[i].file); });
    f.put('subjects/_assignments/_baselines.yaml', `schema-version: 1\nnamespace: ${namespace}\nbaselines:\n`
      + event.rows.map(row => `  - ${JSON.stringify({ ref: row.ref, state: row.after, capture: row['after-capture'], origin: { kind: 'creation', event: eventId } })}\n`).join(''));
    f.put(`subjects/_assignments/${eventId}.yaml`, sealAssignmentEvent(event));
    f.git('add', '.'); const tree = f.git('write-tree');
    return { commit: f.git('commit-tree', tree, '-p', before.commit, '-m', 'actual material-governed canonical genesis'), tree, kitPath: before.kitPath };
  };
  const input = { version: 1, kind, repoRoot: f.root, before, candidate: save(), publication,
    promotion: { version: 1, rows }, eventId, reviewNote: { date: today, author: 'steward', skill: 'promote-records' }, today,
    evidence: f.evidence, limits: limits(f.limits.governance), impact: { version: 1, policy: 'typed-record-promotion-v3', routes: { kind: 'runtime-capability' } } };
  return { ...f, input, before, candidate: input.candidate, kind, objectFormat, format: objectFormat, namespace, today, publication,
    event, rows, sources, candidateRecords, authorizer, authorizerFile, path, subjectAuthority,
    save() { input.candidate = save(); return input; } };
}

import { mkdtempSync } from 'node:fs';
import { recordPromotionInputWire } from '../../payload/engine/lib/record-promotion-input.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence, retainPreparedEvidence, artifactCapture } from '../../payload/engine/lib/prepared-evidence.js';
import { runFinalPreparedRecordPromotionGate } from '../../payload/engine/lib/final-prepared-promotion.js';
import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';
export const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
export const reviewLimits = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };

/** Actual prepared worker/readback only; final execution is an explicit next phase. */
export async function finalRecordPromotionMaterialFixture(t, options = {}) {
  const f = await recordPromotionMaterialFixture(t, options);
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'record-material-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const source = f.input.before, candidate = f.input.candidate;
  const operationInputs = { gateInput: recordPromotionInputWire(f.input), maxEventBytes: 1000000 };
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate,
    operation: 'typed-record-promotion', operationInputs, evidenceDirectory, limits: runtimeLimits });
  assert.equal(validation.retention?.status, 'retained', JSON.stringify(validation));
  const expected = { source, candidate, operation: 'typed-record-promotion', runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const validationInput = { evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits };
  const retained = readRetainedPreparedEvidence(validationInput);
  assert.equal(retained.status, 'verified', JSON.stringify(retained.diagnostics));
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'], files: retained.runtimeManifest.files };
  const approvedRuntimeProfile = { digest: canonicalSha256(profile), profile };
  const finalInput = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: retained.bundleDigest, expected,
    approvedRuntimeProfile, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  const gate = JSON.parse(retained.artifacts.find(row => row.file === 'checks/operation/result').bytes);
  return { ...f, source, candidate, operationInputs, validation, validationInput, retained, approvedRuntimeProfile, finalInput, gate, evidenceDirectory };
}

export async function reviewRecordPromotionMaterialFixture(t, options = {}) {
  const f = await finalRecordPromotionMaterialFixture(t, options);
  const final = await runFinalPreparedRecordPromotionGate(f.finalInput);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  const capability = verifyRetainedRuntimeCapability(f.validationInput, f.approvedRuntimeProfile);
  assert.equal(capability.status, 'established');
  const capture = file => artifactCapture(file, f.retained.artifacts.find(row => row.file === file).bytes);
  const request = { version: 1, operation: 'typed-record-promotion', namespace: f.event.namespace, objectFormat: f.objectFormat,
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath }, candidate: f.candidate,
    runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.retained.bundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: 'typed-record-promotion', publicationId: f.input.publication.id, createdRefs: final.gate.promotion.createdRefs,
      promotion: { inputDigest: final.gate.inputDigest, inputCapture: capture('checks/operation/input.json'),
        reportDigest: canonicalSha256(final.gate), reportCapture: capture('checks/operation/result') },
      assignmentEvent: { eventId: f.event.event, eventDigest: final.gate.assignment.eventSource.eventDigest,
        eventCapture: capture('checks/operation/event.yaml') }, finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/b2000000-0000-4000-8000-000000000050', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const writer = (value = request) => ({ repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, request: value,
    approvedRuntimeProfile: f.approvedRuntimeProfile, limits: reviewLimits, executionLimits: runtimeLimits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic isolated test approval',
      bytes: Buffer.from('Fixture approval for this exact disposable request only.') } });
  const publisher = saved => ({ repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, validationBundleDigest: f.retained.bundleDigest,
    reviewBundleDigest: saved.reviewBundleDigest, expectedRequestDigest: saved.requestDigest,
    approvedRuntimeProfile: f.approvedRuntimeProfile, limits: { review: reviewLimits, execution: runtimeLimits,
      transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } });
  return { ...f, final, request, writer, publisher };
}

export function promotionMaterialEvidenceVariant(f, edit) {
  const rows = f.retained.artifacts.map(row => ({ file: row.file, bytes: Buffer.from(row.bytes) }));
  edit(rows);
  const variant = retainPreparedEvidence({ evidenceDirectory: f.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: f.validationInput.expected, artifacts: rows });
  assert.equal(variant.status, 'retained');
  return { ...f.finalInput, validationBundleDigest: variant.bundleDigest };
}
