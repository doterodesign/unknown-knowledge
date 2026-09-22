/** Actual immutable Git pairs for the fixed four-action metadata family. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { subjectQueryDiskFixture } from './subject-query-disk-fixture.js';
import { priorReconsideredLifecycleFixture } from './subject-lifecycle-material-fixture.js';
import { mergeInput } from './equivalent-merge-input-fixture.js';
import { wire, stateOf, digestEvent } from './subject-reconsideration-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { iterateCurrentRecords, iterateProposalRecords } from '../../payload/engine/lib/record-identity.js';
import { readAssignments } from '../../payload/engine/lib/subject-assignments.js';
import { validateSubjectTransition } from '../../payload/engine/lib/subject-governance.js';

export async function subjectMetadataFixture(t, { action = 'rename', objectFormat = 'sha1', nested = false,
  material = false, beforeChange, candidateChange } = {}) {
  assert.ok(['rename', 'clarify', 'reparent', 'relate'].includes(action));
  const base = material ? await priorReconsideredLifecycleFixture(t, { objectFormat, nested, priorReconsideration: true })
    : subjectQueryDiskFixture(t, { objectFormat, nested, descendants: true });
  const root = base.root, kitPath = nested ? 'unknown-knowledge' : '.';
  const git = (...args) => {
    const value = spawnSync('/usr/bin/git', ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-C',root,...args], { encoding:'utf8' });
    assert.equal(value.status, 0, value.stderr); return value.stdout.trim();
  };
  if (!material) git('init', '-q', `--object-format=${objectFormat}`);
  const commit = message => {
    git('add', '.'); git('commit', '-qm', message);
    return { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), kitPath };
  };
  const inherited = mergeInput().limits;
  const { assignments, ...limits } = inherited;
  limits.governance = { ...limits.governance, maxCaptureBytes: 10000000, maxDocumentNodes: 2000000,
    maxDocumentTextUnits: 10000000, maxValidationSteps: 5000000 };
  limits.closure = { maxRows: 10000, maxBytes: 10000000 };
  limits.lookup = { maxTerms: 100, maxTermBytes: 10000, maxMatches: 1000, maxBytes: 1000000 };
  const input = { repoRoot: root, before: null, candidate: null,
    operation: { version: 1, id: 'a6000000-0000-4000-8000-000000000001', action,
      registryEvent: { id: 'a6000000-0000-4000-8000-000000000002', changeDigest: '' }, retainedUnknowns: [] },
    evidence: material ? base.evidence : { decisionCaptures: base.decisionCaptures, assessmentCaptures: [], materialCaptures: [] },
    limits, impact: { version: 1, policy: 'subject-metadata-impact-v1', routes: { kind: 'runtime-capability' } } };
  const h = { ...base, root, git, commit, input, read: file => readFileSync(join(base.kitRoot, file), 'utf8') };
  beforeChange?.(h);
  input.before = commit('actual original metadata and positive assigned users');
  const beforeModel = loadStores(base.kitRoot);
  assert.equal(beforeModel.ok, true, JSON.stringify(beforeModel.diagnostics));
  const kinds = [['knowledge','knowledge'],['ontology','ontology'],['decision','decisions']]
    .filter(([,store]) => beforeModel.stores[store].present).map(([kind]) => kind);
  input.operation.retainedUnknowns = [...iterateCurrentRecords(beforeModel, { kinds }), ...iterateProposalRecords(beforeModel, { kinds })]
    .filter(row => readAssignments(row.entry).state === 'unknown')
    .map(row => ({ ...(row.ref ? { ref: row.ref } : { proposalRef: row.proposalRef }), reason: 'Preserve absent classification' }));
  const document = structuredClone(beforeModel.subjectRegistry.document);
  const selected = document.subjects.find(row => row.id === (action === 'reparent' ? 'S-000002' : 'S-000001'));
  const after = stateOf(selected);
  if (action === 'rename') { after.label = 'Chromatic perception'; after.aliases = [{ label: 'Color', locale: 'en' }]; }
  if (action === 'clarify') after.definition.text += '; wording clarified without changing meaning';
  if (action === 'reparent') { if (material) after.parent = 'S-000001'; else after.parent = 'S-000003'; }
  if (action === 'relate') after.related = [{ type: 'association', target: 'S-000002' }];
  const authorizer = document.history.at(-1);
  const event = { id: input.operation.registryEvent.id, action, decision: authorizer.decision,
    reason: 'Reviewed same-meaning metadata transition',
    ...(['rename','clarify'].includes(action) ? { unchangedMeaning: true } : {}),
    rows: [{ id: selected.id, before: stateOf(selected), after }] };
  event.review = { ...authorizer.review, changeDigest: digestEvent(event) };
  Object.assign(selected, after); selected.changes.push(event.id);
  document.history.push(event); document.revision++;
  if (action === 'reparent') document.hierarchyRevision++;
  candidateChange?.({ ...h, document, event, beforeModel });
  event.review.changeDigest = digestEvent(event);
  input.operation.registryEvent.changeDigest = event.review.changeDigest;
  const encoded = wire(document);
  for (const row of encoded.history) if (Object.hasOwn(row, 'unchangedMeaning')) {
    row['unchanged-meaning'] = row.unchangedMeaning; delete row.unchangedMeaning;
  }
  base.put('subjects/registry.yaml', encoded);
  input.candidate = commit('actual registry-only metadata transition');
  const candidateModel = loadStores(base.kitRoot);
  const native = () => validateSubjectTransition({ before: beforeModel.subjectRegistry.document,
    candidate: candidateModel.subjectRegistry.document, model: candidateModel, identityIndex: candidateModel.identityIndex, ...input.evidence });
  return { ...h, document, event, beforeModel, candidateModel, native };
}

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { subjectMetadataInputWire } from '../../payload/engine/lib/subject-metadata-input.js';
import { runPreparedCandidateChecks } from '../../payload/engine/lib/prepared-validation.js';
import { readRetainedPreparedEvidence, retainPreparedEvidence, artifactCapture } from '../../payload/engine/lib/prepared-evidence.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';

import { verifyRetainedRuntimeCapability } from '../../payload/engine/lib/runtime-capability.js';

export const runtimeLimits = { maxRuntimeFiles: 3000, maxRuntimeBytes: 30000000, maxOutputBytesPerCheck: 20000000, maxCheckMilliseconds: 60000 };
export const evidenceLimits = { maxManifestBytes: 2000000, maxArtifacts: 4000, maxArtifactBytes: 30000000, maxTotalArtifactBytes: 200000000 };
export const reviewLimits = { ...evidenceLimits, maxRequestBytes: 20000000, maxAuthorizationBytes: 10000, maxReceiptBytes: 100000 };

/** Actual prepared worker/readback only; the final owner is a separate explicit call. */
export function finalSubjectMetadataFixture(t, options = {}, factory = subjectMetadataFixture) {
  return finalRegistryOnlyFixture(t, options, factory, false);
}
export function finalSubjectProposalSuppressionFixture(t, options, factory) {
  return finalRegistryOnlyFixture(t, options, factory, true);
}
async function finalRegistryOnlyFixture(t, options, factory, suppression) {
  const operation = suppression ? 'subject-proposal-suppression' : 'subject-metadata';
  const f = await factory(t, options);
  const evidenceDirectory = mkdtempSync(join(f.root, '..', 'metadata-evidence-'));
  t.after(() => rmSync(evidenceDirectory, { recursive: true, force: true }));
  const operationInputs = { gateInput: subjectMetadataInputWire(f.input), captureLimits: { maxRegistryBytes: 1000000 } };
  const source = f.input.before, candidate = f.input.candidate;
  const validation = await runPreparedCandidateChecks({ repoRoot: f.root, source, candidate, operation,
    operationInputs, evidenceDirectory, limits: runtimeLimits });
  assert.equal(validation.retention?.status, 'retained', JSON.stringify(validation));
  const expected = { source, candidate, operation, runtimeDigest: validation.runtimeDigest, reportDigest: validation.reportDigest };
  const validationInput = { evidenceDirectory, bundleDigest: validation.retention.bundleDigest, expected, limits: evidenceLimits };
  const retained = readRetainedPreparedEvidence(validationInput);
  assert.equal(retained.status, 'verified', JSON.stringify(retained.diagnostics));
  const profile = { version: 1, id: 'subject-route-persistence-unsupported-v1', scope: 'kit-managed-subject-route-persistence',
    persistence: 'unsupported', managedPaths: [], exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
    files: retained.runtimeManifest.files };
  const approvedRuntimeProfile = { digest: canonicalSha256(profile), profile };
  const finalInput = { repoRoot: f.root, evidenceDirectory, validationBundleDigest: validation.retention.bundleDigest,
    expected, approvedRuntimeProfile, limits: { evidence: evidenceLimits, runtime: runtimeLimits } };
  const gate = JSON.parse(retained.artifacts.find(({ file }) => file === 'checks/operation/result').bytes);
  return { ...f, source, candidate, operationInputs, validation, retained, gate, validationInput, finalInput, approvedRuntimeProfile, evidenceDirectory };
}

/** Real final, capability and receipt inputs; approval text applies solely to isolated test refs. */
export function subjectMetadataReviewFixture(t, options = {}, factory = subjectMetadataFixture) {
  return reviewRegistryOnlyFixture(t, options, factory, false);
}
export function subjectProposalSuppressionReviewFixture(t, options, factory) {
  return reviewRegistryOnlyFixture(t, options, factory, true);
}
async function reviewRegistryOnlyFixture(t, options, factory, suppression) {
  const f = await finalRegistryOnlyFixture(t, options, factory, suppression);
  const owners = await import('../../payload/engine/lib/final-prepared-subject-metadata.js');
  const final = await (suppression ? owners.runFinalPreparedSubjectProposalSuppressionGate : owners.runFinalPreparedSubjectMetadataGate)(f.finalInput);
  assert.equal(final.status, 'passed', JSON.stringify(final));
  const capability = verifyRetainedRuntimeCapability(f.validationInput, f.approvedRuntimeProfile);
  assert.equal(capability.status, 'established', JSON.stringify(capability));
  assert.equal(final.capability.resultDigest, canonicalSha256(capability));
  const capture = file => {
    const row = f.retained.artifacts.find(row => row.file === `checks/operation/${file}`);
    return artifactCapture(row.file, row.bytes);
  };
  const request = { version: 1, operation: f.finalInput.expected.operation, namespace: final.gate.decision.ref.namespace,
    objectFormat: f.source.commit.length === 40 ? 'sha1' : 'sha256',
    source: { ref: 'refs/heads/source', expectedCommit: f.source.commit, tree: f.source.tree, kitPath: f.source.kitPath },
    candidate: f.candidate, runtimeDigest: f.validation.runtimeDigest, policy: { id: final.policy.id, digest: final.policy.digest },
    evidence: { bundleDigest: f.validationInput.bundleDigest, reportDigest: f.validation.reportDigest },
    runtimeCapability: { profileDigest: f.approvedRuntimeProfile.digest, resultDigest: canonicalSha256(capability), result: capability },
    operationEvidence: { kind: f.finalInput.expected.operation, operationId: final.gate.operation.id,
      registryEvent: structuredClone(final.gate.sources.registryEvent), registryCapture: capture('registry.yaml'),
      validation: { inputDigest: final.gate.inputDigest,
        inputCapture: capture('input.json'), reportDigest: canonicalSha256(final.gate), reportCapture: capture('result') },
      finalGate: { resultDigest: canonicalSha256(final), result: final } },
    publish: { outputRef: 'refs/unknown-knowledge/candidates/12345678-1234-4123-8123-123456789abc', expectedOldCommit: null } };
  f.git('update-ref', request.source.ref, f.source.commit);
  const writer = (value = request) => ({ repoRoot: f.root, evidenceDirectory: f.evidenceDirectory, request: value,
    approvedRuntimeProfile: f.approvedRuntimeProfile, limits: reviewLimits, executionLimits: runtimeLimits,
    authorization: { outcome: 'approved', requestDigest: canonicalSha256(value), reference: 'synthetic isolated test authorization',
      bytes: Buffer.from('Synthetic exact-request authorization for this isolated test only.') } });
  const publisher = saved => ({ repoRoot: f.root, evidenceDirectory: f.evidenceDirectory,
    validationBundleDigest: request.evidence.bundleDigest, reviewBundleDigest: saved.reviewBundleDigest,
    expectedRequestDigest: saved.requestDigest, approvedRuntimeProfile: f.approvedRuntimeProfile,
    limits: { review: reviewLimits, execution: runtimeLimits,
      transaction: { maxOutputBytes: 100000, maxCommandMilliseconds: 3000, maxTransactionMilliseconds: 15000, maxWorktrees: 10 } } });
  return { ...f, final, request, writer, publisher };
}

export function subjectMetadataEvidenceVariant(f, edit) {
  const artifacts = f.retained.artifacts.map(({ file, bytes }) => ({ file, bytes: Buffer.from(bytes) }));
  edit(artifacts);
  const retained = retainPreparedEvidence({ evidenceDirectory: f.evidenceDirectory, repoRoot: f.root,
    runtimeRoot: f.root, binding: f.finalInput.expected, artifacts });
  assert.equal(retained.status, 'retained', JSON.stringify(retained));
  return { ...f.finalInput, validationBundleDigest: retained.bundleDigest };
}
