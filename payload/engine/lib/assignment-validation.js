/** Compose assignment metadata with the real subject governance domain. */
import { readAssignments } from './subject-assignments.js';
import { RECORD_KINDS, isIdentityUuid, recordIdentityMatches, proposalIdentityMatches } from './record-identity.js';
import { SubjectError } from './subjects.js';
import { subjectEligibility, validateSubjectEligibilityOptions, assertSubjectGovernanceOperation } from './subject-governance.js';
import { recordLifecycleState } from './record-lifecycle.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const shape = (value, keys) => object(value) && Reflect.ownKeys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const ownData = (value, keys) => shape(value, keys)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && keys.every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field.enumerable && Object.hasOwn(field, 'value');
  });

function rowReference(row) {
  const canonical = shape(row, ['ref', 'entry']);
  const proposed = shape(row, ['proposalRef', 'entry']);
  const reference = canonical ? row.ref : proposed ? row.proposalRef : null;
  return shape(reference, ['namespace', 'kind', canonical ? 'id' : 'key'])
    && isIdentityUuid(reference.namespace) && RECORD_KINDS.includes(reference.kind)
    && (canonical ? recordIdentityMatches(reference.kind, reference.id, row.entry)
      : proposalIdentityMatches(reference.kind, reference.key, row.entry)) ? reference : null;
}

function validateTargets(result, context, normalized, targets, report) {
  for (const { originalId, index, path } of targets) {
    const remaining = normalized.budget
      ? { ...normalized, budget: { redirects: normalized.budget.redirects - result.used.redirects } }
      : normalized;
    try {
      const outcome = subjectEligibility(context, originalId, remaining);
      result.used.redirects += outcome.resolution.redirects.length;
      result.subjects.push({ originalId, index, path, outcome });
      if (outcome.eligible !== true) {
        report(outcome.code ?? 'assignment-ineligible', path,
          outcome.eligible === null ? 'Subject governance verification is unavailable.' : 'Subject is ineligible for the requested purpose.');
      }
    } catch (error) {
      if (!(error instanceof SubjectError)) throw error;
      report(error.code, path, error.message);
      return;
    }
  }
}

const indexedTargets = (ids) => ids.map((originalId, index) => ({ originalId, index, path: `subjects[${index}]` }));

/**
 * Validate one captured canonical/proposal row against actual subject governance.
 * Eligibility belongs to P2; this wrapper only preserves assignment state,
 * identity and authored diagnostic positions. The caller owns store coverage,
 * captured-model consistency, record lifecycle/source gates and publication.
 *
 * An absent/empty list needs no subject context. This does not grant a subject
 * query capability. A nonempty list never gains approval from prior presence.
 * Explicit redirect budgets are shared across this entire invocation. `used`
 * counts edges in returned resolution witnesses; after a typed traversal error
 * it is only completed-call accounting, not a claimed total for the failed call.
 * The wrapper stops on that error, and callers must not continue a failed query.
 * @param {{ref?: import('./record-identity.js').RecordRef,
 * proposalRef?: {namespace:string,kind:string,key:string},entry:object}} row
 * @param {object|null|undefined} context actual P2 handle, or structural registry for inspection
 * @param {{purpose:'inspect'|'query'|'new-assignment',policy?:string,budget?:{redirects:number}}} options
 * @returns {{ok:boolean,assignments:import('./subject-assignments.js').AssignmentState,
 * subjects:object[],diagnostics:object[],used:{redirects:number}}}
 */
export function validateAssignments(row, context, options) {
  const result = { ok: false, assignments: readAssignments(row?.entry), subjects: [], diagnostics: [], used: { redirects: 0 } };
  const canonical = shape(row, ['ref', 'entry']);
  const proposed = shape(row, ['proposalRef', 'entry']);
  const reference = rowReference(row);
  const valid = reference !== null;
  const location = {
    ...(valid ? { [canonical ? 'ref' : 'proposalRef']: { ...reference } } : {}),
    ...(typeof row?.entry?.file === 'string' ? { file: row.entry.file } : {}),
  };
  const report = (code, path, message) => result.diagnostics.push({ ...location, code, path, message });
  if (!valid) {
    report('invalid-record-ref', proposed ? 'proposalRef' : 'ref', 'Expected exactly one coherent canonical or proposal record reference.');
    return result;
  }
  let normalized;
  try {
    normalized = validateSubjectEligibilityOptions(options);
  } catch (error) {
    if (!(error instanceof SubjectError)) throw error;
    report(error.code, 'options', error.message);
    return result;
  }
  if (result.assignments.state === 'invalid') {
    for (const diagnostic of result.assignments.diagnostics) {
      report(diagnostic.code, diagnostic.path, diagnostic.message);
    }
    return result;
  }
  if (typeof context?.namespace === 'string' && context.namespace !== reference.namespace) {
    report('namespace-mismatch', 'context.namespace', 'Record and subject context must share the installation namespace.');
    return result;
  }
  const ids = result.assignments.state === 'known' ? result.assignments.ids : [];
  validateTargets(result, context, normalized, indexedTargets(ids), report);
  result.ok = result.diagnostics.length === 0;
  return result;
}

/**
 * Compare original captured rows and check only newly effective assignments.
 * This row-local result never authorizes publication. The caller must bind the
 * real candidate model through P2, corroborate both rows/coverage through P1,
 * and enforce P8 history plus existing source/human gates. This remains required
 * when an empty list causes no subject lookups here. `before: null` does not
 * prove a fresh identity: the caller must distinguish new from occupied/missing.
 *
 * Options require inspect or new-assignment; policy is fixed to historical or
 * current respectively. Budget accounting follows validateAssignments: actual
 * returned witnesses only, and callers must abort on any failed result.
 * @param {{before:object|null,candidate:object,governance:object|undefined|null}} input
 * @param {{purpose:'inspect'|'new-assignment',budget?:{redirects:number}}} options
 */
export function validateAssignmentChange(input, options) {
  return validateChange(input, options);
}

/** Fixed split continuation; core/P8 retain full source, mapping and publication proof. */
export function validateSubjectSplitAssignmentChange(input, options) {
  return validateChange(input, options, 'Split');
}

/** Fixed ordinary continuation; actual source and publication remain owner work. */
export function validateContinuedAssignmentChange(input, options) {
  return validateChange(input, options, 'Continued assignment');
}

function validateChange(input, options, owner) {
  const budgetedOwner = owner !== undefined;
  const result = { ok: false, scope: 'row-local-assignment-eligibility', publicationReady: false,
    purpose: null, before: null, candidate: null, lifecycle: { before: null, candidate: null },
    changes: { added: [], retained: [], removed: [], newEffective: [] },
    subjects: [], diagnostics: [], used: { redirects: 0 } };
  let location = {};
  let priorFile;
  const report = (code, path, message) => result.diagnostics.push({ ...location,
    ...(path.startsWith('before.') && typeof priorFile === 'string' ? { file: priorFile } : {}), code, path, message });
  let normalized;
  if (budgetedOwner) {
    try {
      if (!ownData(options, ['budget', 'operationBudget'])) {
        throw new SubjectError('invalid-options', `${owner} rows require only explicit redirect and operation allowances.`);
      }
      if (!ownData(options.budget, ['redirects'])) {
        throw new SubjectError('invalid-budget', `${owner} rows require an own-data redirects allowance.`);
      }
      normalized = validateSubjectEligibilityOptions({ purpose: 'new-assignment', policy: 'current',
        budget: options.budget, operationBudget: options.operationBudget });
    } catch (error) {
      if (!(error instanceof SubjectError)) throw error;
      report(error.code, 'options', error.message);
      return result;
    }
  }
  if (!(budgetedOwner ? ownData : shape)(input, ['before', 'candidate', 'governance'])) {
    report('invalid-input', '', 'Expected explicit before, candidate and governance fields only.');
    return result;
  }
  if (budgetedOwner) {
    try { assertSubjectGovernanceOperation(input.governance, { operationBudget: normalized.operationBudget }); }
    catch (error) {
      if (!(error instanceof SubjectError)) throw error;
      report(error.code, 'governance', error.message);
      return result;
    }
  }
  const { before, candidate, governance } = input;
  priorFile = before?.entry?.file;
  const reference = rowReference(candidate);
  if (!reference || (before !== null && (!rowReference(before) || !Object.hasOwn(before, 'ref')))) {
    report('invalid-record-ref', !reference ? 'candidate' : 'before', 'Expected coherent closed typed rows and a canonical prior owner or null.');
    return result;
  }
  location = { [Object.hasOwn(candidate, 'ref') ? 'ref' : 'proposalRef']: { ...reference },
    ...(typeof candidate.entry.file === 'string' ? { file: candidate.entry.file } : {}) };
  result[Object.hasOwn(candidate, 'ref') ? 'ref' : 'proposalRef'] = { ...reference };
  if (before !== null && (!Object.hasOwn(candidate, 'ref')
    || ['namespace', 'kind', 'id'].some((key) => before.ref[key] !== reference[key]))) {
    report('owner-mismatch', 'before.ref', 'Prior canonical owner must exactly match the candidate canonical owner.');
    return result;
  }
  try {
    if (!budgetedOwner) {
      if (!object(options) || Reflect.ownKeys(options).some((key) => !['purpose', 'budget'].includes(key))
        || !Object.hasOwn(options, 'purpose') || !['inspect', 'new-assignment'].includes(options.purpose)) {
        throw new SubjectError('invalid-options', 'Choose explicit inspect or new-assignment purpose with an optional redirect budget.');
      }
      normalized = validateSubjectEligibilityOptions({ ...options, policy: options.purpose === 'inspect' ? 'historical' : 'current' });
    }
  } catch (error) {
    if (!(error instanceof SubjectError)) throw error;
    report(error.code, 'options', error.message);
    return result;
  }
  result.purpose = normalized.purpose;
  result.before = before === null ? null : readAssignments(before.entry);
  result.candidate = readAssignments(candidate.entry);
  for (const [side, state] of [['before', result.before], ['candidate', result.candidate]]) {
    if (state?.state === 'invalid') for (const diagnostic of state.diagnostics) {
      report(diagnostic.code, side === 'before' ? `before.${diagnostic.path}` : diagnostic.path, diagnostic.message);
    }
  }
  if (result.diagnostics.length) return result;
  result.lifecycle = { before: before === null ? null : recordLifecycleState(before), candidate: recordLifecycleState(candidate) };
  if (normalized.purpose === 'new-assignment') {
    for (const side of ['before', 'candidate']) if (result.lifecycle[side]?.state === 'unknown') {
      report('unknown-record-lifecycle', `${side}.lifecycle`, 'Unknown lifecycle cannot establish effective assignment continuity.');
    }
    if (result.diagnostics.length) return result;
    if (result.lifecycle.candidate.state !== 'effective') {
      report('non-effective-candidate', 'candidate.lifecycle', 'New effective assignments require an effective canonical candidate; drafts require explicit inspection.');
      return result;
    }
  }
  if (typeof governance?.namespace === 'string' && governance.namespace !== reference.namespace) {
    report('namespace-mismatch', 'context.namespace', 'Record and subject context must share the installation namespace.');
    return result;
  }
  const priorIds = result.before?.state === 'known' ? result.before.ids : [];
  const nextIds = result.candidate.state === 'known' ? result.candidate.ids : [];
  const prior = new Set(priorIds);
  const next = new Set(nextIds);
  result.changes.added = nextIds.filter((id) => !prior.has(id));
  result.changes.retained = nextIds.filter((id) => prior.has(id));
  result.changes.removed = priorIds.filter((id) => !next.has(id));
  result.changes.newEffective = result.lifecycle.candidate.state === 'effective'
    ? [...(result.lifecycle.before?.state === 'effective' ? result.changes.added : nextIds)] : [];
  const required = new Set(result.changes.newEffective);
  const targets = indexedTargets(nextIds).filter(({ originalId }) => normalized.purpose === 'inspect' || required.has(originalId));
  validateTargets(result, governance, normalized, targets, report);
  result.ok = result.diagnostics.length === 0;
  return result;
}
