import { describeCandidateBytes } from '../../payload/engine/lib/captured-source.js';

export function mergeInput() {
  const bytes = Buffer.from('retained evidence');
  const capture = describeCandidateBytes({ bytes, file: 'decisions/approval.yaml', objectFormat: 'sha1' });
  return { repoRoot: '/actual/repository', before: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), kitPath: '.' },
    candidate: { commit: 'c'.repeat(40), tree: 'd'.repeat(40), kitPath: '.' },
    operation: { version: 1, id: '11111111-1111-4111-8111-111111111111', action: 'merge-equivalent',
      survivor: 'S-000002', absorbed: ['S-000001'],
      registryEvents: [{ id: '22222222-2222-4222-8222-222222222222', changeDigest: 'a'.repeat(64) }],
      assignmentEvent: { id: '33333333-3333-4333-8333-333333333333', changeDigest: 'b'.repeat(64) }, retainedUnknowns: [] },
    reviewNote: { date: '2026-09-19', author: 'steward', skill: 'kb-build' },
    evidence: { decisionCaptures: [{ capture, bytes, objectFormat: 'sha1' }], assessmentCaptures: [] },
    limits: {
      inventory: { maxRecordVisits: 100, maxRegistryReferenceVisits: 100, maxHierarchyNodes: 100, maxHierarchyEdges: 100 },
      governance: { maxCaptureBytes: 1000000, maxDocumentNodes: 1000000, maxDocumentTextUnits: 1000000,
        maxSubjects: 10000, maxHistoryRows: 10000, maxValidationSteps: 1000000 },
      assignments: { maxRecords: 100, maxCaptureBytes: 1000000, maxRedirects: 100 },
      reach: { maxHierarchyNodes: 100, maxHierarchyEdges: 100, maxRecords: 100 },
      views: { version: 1, maxViews: 1 }, tree: { budget: { nodes: 100, edges: 100, rows: 100 }, maxBytes: 100000 },
      replays: { version: 1, maxSubjects: 100, maxEligibilityRedirects: 100, maxCases: 1000, maxInventoryBytes: 1000000 },
      query: { version: 1, maxAstNodes: 100, maxAstDepth: 10, maxHierarchyNodes: 100, maxHierarchyEdges: 100,
        maxRedirects: 100, maxRecords: 100, maxPredicateSteps: 10000, maxResultsPerStore: 100, maxExplanationNodes: 100000 }
    }, impact: { version: 1, policy: 'equivalent-merge-impact-v1', routes: { kind: 'runtime-capability' } } };
}
