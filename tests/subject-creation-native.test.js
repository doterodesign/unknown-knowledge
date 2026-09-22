import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectCreationFixture } from './helpers/subject-creation-fixture.js';
import { validateSubjectActivation, validateSubjectPromotion } from '../payload/engine/lib/subject-governance.js';
import { validateSubjectCreationAllocation } from '../payload/engine/lib/subject-allocation.js';
import { createSubjectValidationBudget } from '../payload/engine/lib/subject-validation-budget.js';

for (const [name, options] of [
  ['fresh', {}], ['promotion', { action: 'promote-proposal' }], ['union preserves originals', { union: true }],
  ['SHA256 nested fresh', { objectFormat: 'sha256', nested: true }], ['present-empty bootstrap', { bootstrap: true, stores: 'decisions' }],
]) test(`actual native control: ${name}`, t => {
  const f = subjectCreationFixture(t, options);
  const validate = f.operation.action === 'activate' ? validateSubjectActivation : validateSubjectPromotion;
  const result = validate(f.modelInput()); assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const plan = validateSubjectCreationAllocation({ beforeIdentity: f.beforeIdentity, candidateIdentity: f.candidateIdentity,
    subject: f.operation.subject, publication: { id: f.operation.id, review: f.event.review.reference } },
  { limits: f.limits.allocation, operationBudget: createSubjectValidationBudget(f.limits.governance) });
  assert.equal(plan.ok, true, JSON.stringify(plan.diagnostics)); assert.deepEqual(plan.allocation.ids, [f.operation.subject]);
  if (options.union) assert.deepEqual(f.candidateDocument.subjects.slice(0, 2), f.beforeDocument.subjects);
});
