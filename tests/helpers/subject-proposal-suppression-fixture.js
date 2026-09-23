/** Actual before/candidate proposal refusal, reusing the registry-only disk setup. */
import { subjectMetadataFixture } from './subject-metadata-fixture.js';
import { stateOf, wire } from './subject-reconsideration-fixture.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { validateSubjectTransition } from '../../payload/engine/lib/subject-governance.js';

export const suppressedProposal = 'proposal:subject:a7000000-0000-4000-8000-000000000001';
export async function subjectProposalSuppressionFixture(t, options = {}) {
  const { beforeChange, candidateChange, ...setup } = options;
  const f = await subjectMetadataFixture(t, { ...setup, action: 'rename',
    beforeChange(h) {
      const model = loadStores(h.kitRoot), document = structuredClone(model.subjectRegistry.document);
      const original = document.subjects.find(row => row.status === 'active');
      const draft = { id: suppressedProposal, ...stateOf(original), status: 'proposed', changes: [], related: [] };
      delete draft.parent;
      draft.label = 'Unwarranted proposed facet';
      document.subjects.push(draft);
      h.put('subjects/registry.yaml', wire(document));
      h.input.operation.action = 'suppress';
      h.input.impact.policy = 'subject-proposal-suppression-impact-v1';
      beforeChange?.({ ...h, proposal: suppressedProposal });
    },
    candidateChange(h) {
      const { document, event, beforeModel } = h;
      document.subjects = structuredClone(beforeModel.subjectRegistry.document.subjects);
      const proposal = document.subjects.find(row => row.id === suppressedProposal);
      event.action = 'suppress'; delete event.unchangedMeaning;
      event.reason = 'Observed material does not warrant this proposed meaning';
      event.rows = [{ id: suppressedProposal, before: stateOf(proposal), after: { ...stateOf(proposal),
        status: 'suppressed', refusal: { decision: event.decision, reason: event.reason } } }];
      Object.assign(proposal, event.rows[0].after); proposal.changes.push(event.id);
      candidateChange?.({ ...h, proposal: suppressedProposal });
    } });
  return { ...f, proposal: suppressedProposal,
    native: () => validateSubjectTransition({ before: f.beforeModel.subjectRegistry.document,
      candidate: f.candidateModel.subjectRegistry.document, model: f.beforeModel,
      identityIndex: f.beforeModel.identityIndex, ...f.input.evidence }) };
}

import { finalSubjectProposalSuppressionFixture as prepared, subjectProposalSuppressionReviewFixture as reviewed } from './subject-metadata-fixture.js';
export { runtimeLimits, evidenceLimits, reviewLimits, subjectMetadataEvidenceVariant as subjectProposalSuppressionEvidenceVariant } from './subject-metadata-fixture.js';
export function finalSubjectProposalSuppressionFixture(t, options = {}) { return prepared(t, options, subjectProposalSuppressionFixture); }
export function subjectProposalSuppressionReviewFixture(t, options = {}) { return reviewed(t, options, subjectProposalSuppressionFixture); }
