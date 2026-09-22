/** Two fixed Subject allocation comparisons; shared mechanics reserve nothing and grant no authority. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { planAllocations } from './identity-ledger.js';
import { parseCanonicalId } from './record-identity.js';
import { getSubjectValidationBudget } from './subject-validation-budget.js';
import { SubjectError } from './subject-error.js';

const closed = (value, keys) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field?.enumerable && Object.hasOwn(field, 'value');
  });
const whole = value => Number.isSafeInteger(value) && value >= 0;
const ownArray = (value, key) => {
  if (value === null || typeof value !== 'object') return null;
  const field = Object.getOwnPropertyDescriptor(value, key);
  return field?.enumerable && Object.hasOwn(field, 'value') && Array.isArray(field.value) ? field.value : null;
};

const splitProfile = Object.freeze({ single: false, countKey: 'successors', phase: 'split',
  inputCode: 'invalid-split-allocation-input', budgetCode: 'split-allocation-budget', mismatchCode: 'split-allocation-mismatch',
  inputMessage: 'Supply two ledgers, at least two successors and both explicit population limits.',
  idsMessage: 'Successors must be distinct canonical Subject identities.',
  mismatchMessage: 'Successor order and the entire candidate ledger must equal the exact Subject allocation plan.' });
const creationProfile = Object.freeze({ single: true, countKey: 'subjects', phase: 'subject-creation',
  inputCode: 'invalid-subject-creation-allocation-input', budgetCode: 'subject-creation-allocation-budget', mismatchCode: 'subject-creation-allocation-mismatch',
  inputMessage: 'Supply two ledgers, one Subject and the explicit ledger row limit.',
  idsMessage: 'The created Subject must be an exact canonical Subject identity.',
  mismatchMessage: 'The Subject and entire candidate ledger must equal the exact one-Subject allocation plan.' });

/** One fixed single-Subject comparison under an authentic shared allowance. */
export function validateSubjectCreationAllocation(input, options) {
  return compareAllocation(input, options, creationProfile);
}

/** Existing split contract, including its minimum two successors, remains unchanged. */
export function validateSubjectSplitAllocation(input, options) {
  return compareAllocation(input, options, splitProfile);
}

// Profiles are private constants selected only by the two fixed entrypoints.
function compareAllocation(input, options, profile) {

  const result = { ok: false, publicationReady: false, allocation: null,
    resources: { accountingBasis: 'per-invocation-admitted-populations', limits: null,
      used: { ledgerRows: 0, [profile.countKey]: 0 }, failure: null }, diagnostics: [] };
  const fail = (code, message, details = {}) => {
    result.diagnostics.push({ code, message, ...details }); return result;
  };
  if (!closed(input, ['beforeIdentity', 'candidateIdentity', profile.single ? 'subject' : 'successors', 'publication'])
    || !closed(options, ['limits', 'operationBudget'])
    || !closed(options.limits, profile.single ? ['maxLedgerRows'] : ['maxLedgerRows', 'maxSuccessors'])
    || !Object.values(options.limits).every(whole)
    || (profile.single ? typeof input.subject !== 'string' : !Array.isArray(input.successors) || input.successors.length < 2)) {
    return fail(profile.inputCode, profile.inputMessage);
  }
  const { beforeIdentity, candidateIdentity, publication } = input;
  const ids = profile.single ? [input.subject] : input.successors;
  const limits = { ...options.limits }; result.resources.limits = limits;
  try {
    const budget = getSubjectValidationBudget(options.operationBudget);
    budget.assertActive();
    const beforeRows = ownArray(beforeIdentity, 'allocations')?.length;
    const candidateRows = ownArray(candidateIdentity, 'allocations')?.length;
    if (!whole(beforeRows) || !whole(candidateRows)) {
      return fail(profile.inputCode, 'Both ledgers require own enumerable data allocation arrays.');
    }
    // Admit the complete fixed workload atomically, before document expansion or planning.
    // A valid planner probes at most min(999999, beforeRows + ids.length)
    // slots (one ID for creation); this is mathematical, not an observed-work counter.
    const exhausted = beforeRows > limits.maxLedgerRows || candidateRows > limits.maxLedgerRows - beforeRows
      ? ['maxLedgerRows', beforeRows + candidateRows] : !profile.single && ids.length > limits.maxSuccessors
        ? ['maxSuccessors', ids.length] : null;
    if (exhausted) {
      result.resources.failure = { code: profile.budgetCode, limit: exhausted[0], used: 0, requested: exhausted[1] };
      return fail(profile.budgetCode, 'The complete fixed allocation comparison must fit before planning.');
    }
    result.resources.used = { ledgerRows: beforeRows + candidateRows, [profile.countKey]: ids.length };
    budget.guard(beforeIdentity, `${profile.phase}-before-identity`);
    budget.guard(candidateIdentity, `${profile.phase}-candidate-identity`);
    budget.guard(ids, `${profile.phase}-${profile.countKey}`);
    budget.guard(publication, `${profile.phase}-allocation-publication`);
    if (!ids.every(id => parseCanonicalId('subject', id).ok) || new Set(ids).size !== ids.length) {
      return fail(profile.inputCode, profile.idsMessage);
    }
    const plan = planAllocations(beforeIdentity, { kind: 'subject', count: ids.length, publication });
    if (!plan.ok) return fail(plan.code, 'The authoritative Subject allocator refused the requested allocation.', {
      ...(plan.diagnostics ? { diagnostics: plan.diagnostics } : {}),
      ...(Object.hasOwn(plan, 'occupied') ? { occupied: plan.occupied, remaining: plan.remaining } : {}),
    });
    if (!same(ids, plan.ids) || !same(candidateIdentity, plan.ledger)) {
      return fail(profile.mismatchCode, profile.mismatchMessage);
    }
    result.allocation = { publication: { ...publication }, ids: [...plan.ids],
      beforeIdentityDigest: canonicalSha256(beforeIdentity), candidateIdentityDigest: canonicalSha256(candidateIdentity),
      occupied: plan.occupied, remaining: plan.remaining };
    result.ok = true; return result;
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) throw error;
    return fail(error.code, error.message);
  }
}
