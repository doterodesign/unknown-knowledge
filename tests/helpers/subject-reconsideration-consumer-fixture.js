/** Real reconsidered history plus a literal consumer corpus, not a publication delta. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { subjectReconsiderationFixture } from './subject-reconsideration-fixture.js';
import { subjectQuery } from './subject-query-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';

export const captureTransport = ({ capture, bytes, objectFormat }) => ({
  capture: structuredClone(capture), bytesBase64: bytes.toString('base64'), objectFormat,
});

export function subjectReconsiderationConsumerFixture(t, { objectFormat = 'sha1', nested = false } = {}) {
  const original = subjectReconsiderationFixture(t, { objectFormat, nested, parent: true, sourceMaterial: true });
  const kitRoot = original.candidateRoot;
  const root = nested ? dirname(kitRoot) : kitRoot;
  const writeJson = (name, value) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const put = (name, value) => {
    const file = join(kitRoot, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const subjects = [['S-000001', 'S-000002'], []];
  const entries = subjects.map((assigned, index) => {
    const id = `K-00000${index + 1}`;
    const record = { 'schema-version': 3, id, heading: `Consumer ${id}`, domain: 'world',
      citations: [{ source: 'Actual consumer fixture' }], subjects: assigned, facets: { stage: 'verified' } };
    put(`knowledge/${id}.md`, `---\n${JSON.stringify(record)}\n---\nLiteral retained consumer body ${id}.\n`);
    original.identity.allocations.push({ kind: 'knowledge', id, state: 'allocated',
      publication: { id: 'a2000000-0000-4000-8000-000000000020', review: 'review:consumer-corpus' } });
    return { id, title: record.heading, file: `${id}.md` };
  });
  put('knowledge/_catalog.yaml', { 'schema-version': 2, store: 'knowledge', entries });
  put('knowledge/_registries/stage.yaml', { 'schema-version': 2, store: 'knowledge', registry: 'stage',
    values: [{ value: 'verified', gloss: 'Verified fixture lifecycle', warrant: 'Consumer test', decision: 'D-000003' }] });
  put('_identity.yaml', original.identity);
  const model = loadStores(kitRoot);
  assert.equal(model.ok, true, JSON.stringify(model.diagnostics));
  const decisionCaptures = original.decisionCaptures;
  const assessmentCaptures = [original.beforeCaptures];
  const materialCaptures = original.materialCaptures;
  const rawCaptureBytes = [...decisionCaptures, ...assessmentCaptures.flatMap(pair => [pair.registry, pair.identity]),
    ...materialCaptures].reduce((sum, capture) => sum + capture.bytes.length, 0);
  const query = subjectQuery();
  const plan = { version: 1, inputRef: 'request:color', inventoryStatus: 'declared-complete',
    units: [{ key: 'color', sourceRef: 'request:color', disposition: 'mapped' }], bindings: [], clarifications: [],
    constraints: [{ key: 'color', origin: 'explicit', unitKeys: ['color'], bindingKeys: [],
      queryRefs: ['/where', '/stores', '/view'].map(path => ({ branch: 'strict', path })), requirementKeys: ['source'] }],
    requirements: [{ key: 'source', unitKeys: ['color'], description: 'Read source support.' }],
    branches: [{ key: 'strict', kind: 'strict', unitKeys: ['color'], assumptions: [], relaxes: [], query }] };
  const admission = { version: 1, maxBranches: 1, maxReservedAstNodes: 32, maxReservedRedirects: 8 };
  const executionAdmission = { version: 1, maxBranches: 1, maxReservedAstNodes: 32, maxAstDepth: 8,
    maxReservedRedirects: 8, maxReservedHierarchyNodes: 64, maxReservedHierarchyEdges: 64, maxReservedRecords: 100,
    maxReservedPredicateSteps: 1000, maxReservedExplanationNodes: 10000, maxReservedResultSlots: 10 };
  const { where, ...routeQuery } = query;
  const routeRequest = { version: 1, route: { version: 1, kind: 'intersection', subjects: ['S-000001'] }, query: routeQuery };
  const contextsRequest = { version: 1, query, contextBudgets: { version: 1, maxRecords: 30, maxAssignments: 50,
    maxHierarchyNodes: 30, maxHierarchyEdges: 30, maxRedirects: 30, maxContexts: 10 } };
  const operationLimits = { version: 1, maxSourceBytes: 33554432, maxSingleCaptureBytes: 2097152, maxOutputBytes: 262144,
    validation: { maxCaptureBytes: rawCaptureBytes, maxDocumentNodes: 2000000, maxDocumentTextUnits: 67108864,
      maxSubjects: 32768, maxHistoryRows: 131072, maxValidationSteps: 5000000 },
    corpus: { maxCanonicalRecords: 1000, maxAuthoredRecords: 1200, maxSubjects: 256, maxHierarchyDepth: 16,
      maxHistoryEvents: 256, maxHistoryRows: 1024, maxAssignmentsPerRecord: 16, maxAssignments: 16000, maxBodyBytesPerRecord: 16384 } };
  const files = {
    query: writeJson('query.json', query), decisions: writeJson('decisions.json', decisionCaptures.map(captureTransport)),
    assessments: writeJson('assessments.json', assessmentCaptures.map(pair => ({
      registry: captureTransport(pair.registry), identity: captureTransport(pair.identity) }))),
    materials: writeJson('materials.json', materialCaptures.map(captureTransport)),
    plan: writeJson('plan.json', plan), admission: writeJson('admission.json', admission),
    executionAdmission: writeJson('execution-admission.json', executionAdmission),
    route: writeJson('route.json', routeRequest), contexts: writeJson('contexts.json', contextsRequest),
  };
  return { root, kitRoot, namespace: model.identity.namespace, subject: 'S-000001', contextSubject: 'S-000002',
    expectedIds: ['K-000001'], model, decisionCaptures, assessmentCaptures, materialCaptures, rawCaptureBytes,
    files, query, plan, admission, executionAdmission, routeRequest, contextsRequest, operationLimits, writeJson };
}
