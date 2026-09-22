import { typedPromotionFixture } from './typed-promotion-fixture.js';

/** Full agreed O-first input, with actual sources/evidence and explicit domain capacities. */
export function typedPromotionGateFixture(t, options = {}) {
  const f = typedPromotionFixture(t, options);
  const input = { version: 1, kind: f.kind, repoRoot: f.root, before: f.before, candidate: f.candidate,
    publication: f.publication, promotion: { version: 1, rows: f.rows }, eventId: f.event.event,
    reviewNote: { date: f.today, author: 'steward', skill: 'promote-records' }, today: f.today, evidence: f.evidence,
    limits: {
      promotion: f.plannerInput.limits, assignments: { maxRecords: 100, maxCaptureBytes: 5000000, maxRedirects: 1000 },
      governance: { maxCaptureBytes: 10000000, maxDocumentNodes: 100000, maxDocumentTextUnits: 1000000,
        maxSubjects: 1000, maxHistoryRows: 10000, maxValidationSteps: 1000000 },
      reach: { maxHierarchyNodes: 10000, maxHierarchyEdges: 10000, maxRecords: 1000 },
      views: { version: 1, maxViews: 1 }, tree: { budget: { nodes: 10000, edges: 10000, rows: 10000 }, maxBytes: 1000000 },
      replays: { version: 1, maxSubjects: 100, maxEligibilityRedirects: 1000, maxCases: 1000, maxInventoryBytes: 5000000 },
      query: { version: 1, maxAstNodes: 100, maxAstDepth: 10, maxHierarchyNodes: 10000, maxHierarchyEdges: 10000,
        maxRedirects: 1000, maxRecords: 1000, maxPredicateSteps: 100000, maxResultsPerStore: 1000, maxExplanationNodes: 100000 },
    }, impact: { version: 1, policy: 'typed-record-promotion-v3', routes: { kind: 'runtime-capability' } } };
  const save = () => { input.candidate = f.save(); return input; };
  return { ...f, input, save };
}
