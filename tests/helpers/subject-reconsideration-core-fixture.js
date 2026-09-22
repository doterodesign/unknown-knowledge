/** Actual immutable Git pair: corpus precedes suppression-scope capture; only two candidate files change. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { subjectReconsiderationFixture, wire, digestEvent } from './subject-reconsideration-fixture.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';

export function subjectReconsiderationCoreFixture(t, { objectFormat = 'sha1', nested = false,
  parent = false, related = false, stores = 'all', archivedPrior = false, sourceMaterial = true, beforeChange } = {}) {
  const base = subjectReconsiderationFixture(t, { objectFormat, nested, parent, related, archivedPrior, sourceMaterial });
  const { repoRoot, kitRoot } = base;
  const kitPath = nested ? 'unknown-knowledge' : '.';
  const path = file => nested ? `${kitPath}/${file}` : file;
  // Distinct actual commits let provenance tests remove material evidence
  // without removing either retained historical or current Decision evidence.
  if (sourceMaterial) {
    base.git('commit', '--allow-empty', '-qm', 'separate retained material source');
    const source = { commit: base.git('rev-parse', 'HEAD'), tree: base.git('rev-parse', 'HEAD^{tree}'), kitPath };
    const material = base.capture(source, 'material.txt');
    base.materialCaptures = [material];
    base.candidateDocument.history.at(-1).reconsideration.sources[0].capture = material.capture;
  }
  const beforeIdentity = structuredClone(base.beforeModel.identity);
  const ownerPublication = { id: 'a2000000-0000-4000-8000-000000000030', review: 'review:prior-corpus' };
  if (stores === 'all' || stores === 'knowledge') {
    const entries = [];
    for (const [id, assignments] of [['K-000001', parent ? ['S-000002'] : []], ['K-000002', undefined]]) {
      const record = { 'schema-version': 3, id, heading: id, domain: 'world', citations: [{ source: 'Prior source' }],
        ...(assignments === undefined ? {} : { subjects: assignments, facets: { stage: 'verified' } }) };
      base.put(`knowledge/${id}.md`, `---\n${JSON.stringify(record)}\n---\nOriginal body ${id}.\n`);
      entries.push({ id, title: id, file: `${id}.md` });
      beforeIdentity.allocations.push({ kind: 'knowledge', id, state: 'allocated', publication: ownerPublication });
    }
    base.put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries });
    base.put('knowledge/_registries/stage.yaml', { 'schema-version': 2, store: 'knowledge', registry: 'stage',
      values: [{ value: 'verified', gloss: 'Verified', warrant: 'Fixture', decision: 'D-000003' }] });
  }
  if (stores === 'all' || stores === 'ontology') {
    const entries = ['O-000001', 'O-000002'].map((id, index) => ({ id, term: id, class: 'general',
      summary: 'Original class', definition: 'Original meaning', status: index ? 'draft' : 'active',
      'source-of-truth': [path('src/owned.js')], 'last-verified': '2026-09-20', ...(index ? {} : { subjects: [] }) }));
    base.put('ontology/classes/owners.yaml', { 'schema-version': 2, entries });
    base.put('ontology/_catalog.yaml', { 'schema-version': 2, store: 'ontology',
      entries: entries.map(({ id }) => ({ id, title: id, file: 'classes/owners.yaml' })) });
    base.put('src/owned.js', 'export const original = true;\n');
    for (const { id } of entries) beforeIdentity.allocations.push({ kind: 'ontology', id, state: 'allocated', publication: ownerPublication });
  }
  const commit = message => {
    base.git('add', '.'); base.git('commit', '--allow-empty', '-qm', message);
    return { commit: base.git('rev-parse', 'HEAD'), tree: base.git('rev-parse', 'HEAD^{tree}'), kitPath };
  };
  if (beforeChange) beforeChange({ put: base.put, read: file => readFileSync(join(kitRoot, file), 'utf8'), beforeIdentity });
  base.put('_identity.yaml', beforeIdentity);
  const before = commit('actual stored corpus before reconsideration');
  const beforeModel = loadStores(kitRoot);
  assert.equal(beforeModel.ok, true, JSON.stringify(beforeModel.diagnostics));
  const beforeCaptures = { registry: base.capture(before, 'subjects/registry.yaml'), identity: base.capture(before, '_identity.yaml') };
  const beforeDocument = structuredClone(beforeModel.subjectRegistry.document);
  const candidateDocument = structuredClone(base.candidateDocument);
  const activation = candidateDocument.history.at(-1);
  activation.reconsiderationAssessment.scope = { beforeRegistry: { capture: beforeCaptures.registry.capture,
    documentDigest: canonicalSha256(beforeDocument) }, identityDigest: canonicalSha256(beforeIdentity) };
  activation.review.changeDigest = digestEvent(activation);
  const candidateIdentity = { ...structuredClone(beforeIdentity), allocations: [...structuredClone(beforeIdentity.allocations),
    { kind: 'subject', id: 'S-000001', state: 'allocated', publication: { id: base.operation.id, review: activation.review.reference } }] };
  const operation = { version: 1, id: base.operation.id, action: 'reconsider-proposal', proposal: base.operation.proposal,
    subject: 'S-000001', registryEvent: { id: activation.id, changeDigest: activation.review.changeDigest }, assignmentEvent: null };
  base.put('_identity.yaml', candidateIdentity); base.put('subjects/registry.yaml', wire(candidateDocument));
  const candidate = commit('actual one-Subject reconsideration candidate');
  const candidateModel = loadStores(kitRoot);
  assert.equal(candidateModel.ok, true, JSON.stringify(candidateModel.diagnostics));
  const evidence = { decisionCaptures: base.decisionCaptures, assessmentCaptures: [beforeCaptures], materialCaptures: base.materialCaptures };
  const limits = { governance: { maxCaptureBytes: 10000000, maxDocumentNodes: 2000000, maxDocumentTextUnits: 20000000,
    maxSubjects: 100000, maxHistoryRows: 100000, maxValidationSteps: 1000000 }, allocation: { maxLedgerRows: 1000 },
  closure: { maxRows: 1000, maxBytes: 1000000 } };
  return { repoRoot, kitRoot, before, candidate, operation, evidence, limits, beforeCaptures,
    beforeDocument, candidateDocument, beforeIdentity, candidateIdentity, beforeModel, candidateModel,
    files: { registry: path('subjects/registry.yaml'), identity: path('_identity.yaml'), decision: path('decisions/entries/review.yaml'),
      knowledge: path('knowledge/K-000001.md'), ontology: path('ontology/classes/owners.yaml') },
    git: base.git, put: base.put, read: file => readFileSync(join(kitRoot, file), 'utf8'), commit, capture: base.capture,
    input(overrides = {}) { return { repoRoot, before, candidate, operation, evidence, limits, ...overrides }; } };
}
