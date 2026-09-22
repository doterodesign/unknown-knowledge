import { retirementInput } from './subject-retirement-input-fixture.js';

export const splitRef = (kind = 'knowledge', id = 'K-000001') => ({
  namespace: '11111111-1111-4111-8111-111111111111', kind, id,
});

/** Literal request metadata; it does not claim actual repository evidence. */
export function splitInput() {
  const input = retirementInput();
  Object.assign(input.operation, { action: 'split', successors: ['S-000004', 'S-000005', 'S-000006'],
    mappings: [{ ref: splitRef(), successors: ['S-000004', 'S-000006'], reason: 'Separate two supported meanings' }],
    successorParents: [
      { subject: 'S-000004', parent: null, reason: 'Independent root' },
      { subject: 'S-000005', parent: 'S-000004', reason: 'Narrower successor' },
      { subject: 'S-000006', parent: 'S-000002', reason: 'Existing broader subject' },
    ] });
  input.operation.registryEvents.push({ id: '44444444-4444-4444-8444-444444444444', changeDigest: 'c'.repeat(64) });
  input.limits.allocation = { maxLedgerRows: 1000, maxSuccessors: 100 };
  input.impact.policy = 'subject-split-impact-v1';
  return input;
}
