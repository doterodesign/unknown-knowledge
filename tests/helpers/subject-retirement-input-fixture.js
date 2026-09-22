import { mergeInput } from './equivalent-merge-input-fixture.js';

export function retirementInput() {
  const input = mergeInput();
  const { survivor, absorbed, ...shared } = input.operation;
  input.operation = { ...shared, action: 'retire', subject: 'S-000001',
    retainedHistoricalUses: [], retainedParents: [], retainedInheritedUses: [] };
  input.limits.closure = { maxRows: 1000, maxBytes: 1000000 };
  input.impact.policy = 'plain-retirement-impact-v1';
  return input;
}
