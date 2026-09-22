/** Validate declared query provenance and explicitly execute reserved plan branches. */
import { validateIntentPlan } from './intent-plan.js';
import { validateSubjectQuery, querySubjects } from './subject-query.js';
import { admitValidationBranches, admitExecutionBranches, safeSum } from './intent-query-admission.js';
import { assertSubjectOperationContext, guardSubjectOperationDocument } from './subject-operation.js';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const emptyObserved = () => ({ astNodes: 0, astDepth: 0, redirects: 0 });
const missingObserved = () => ({ astNodes: null, astDepth: null, redirects: null });

function prepareOperation(plan, context, options, execution = false) {
  const operation = options?.operation;
  // Also reject dropping an operation from an already bound context.
  assertSubjectOperationContext(operation, context);
  if (operation !== undefined) {
    guardSubjectOperationDocument(operation, plan, 'intent-plan');
    for (const key of execution ? ['admission', 'executionAdmission'] : ['admission']) {
      if (Object.hasOwn(options, key)) guardSubjectOperationDocument(operation, options[key], `intent-${key}`);
    }
  }
  return operation;
}

function observeValidation(work, index, validation) {
  const branch = work.branches[index];
  branch.status = validation.ok ? 'validated' : 'refused';
  work.queryValidationReturns += 1;
  for (const field of ['astNodes', 'astDepth', 'redirects']) {
    const value = validation.used?.[field];
    if (!count(value)) { work.observed[field] = null; continue; }
    branch.observed[field] = value;
    const combine = previous => field === 'astDepth'
      ? previous === null ? null : Math.max(previous, value) : safeSum(previous, value);
    work.knownObserved[field] = combine(work.knownObserved[field]);
    work.observed[field] = combine(work.observed[field]);
  }
}

// Read only paths emitted by the owning query validator, never walk its AST.
const valueAt = (query, path) => path.slice(1).split('/').reduce((value, segment) =>
  value[segment.replace(/~1/g, '/').replace(/~0/g, '~')], query);

/**
 * Validate each authored branch through actual P4 captured-model governance,
 * then account for every semantic path returned by that same validator.
 * P4's explicit/default origin describes query authorship; the plan's separate
 * explicit/inferred origin describes the host's claim about user intent.
 * @param {unknown} plan version 1 transient intent plan
 * @param {object} context real P4 {model,subjectGovernance} context
 * @param {{admission?: {version:1,maxBranches:number,maxReservedAstNodes:number,maxReservedRedirects:number},operation?:object}} [options]
 */
export function validateIntentQueryPlan(plan, context, options = {}) {
  const operation = prepareOperation(plan, context, options);
  const diagnostics = [];
  const result = { version: 1, valid: false, validationScope: 'declared-inventory-and-query-provenance',
    queryValidation: 'not-run', execution: 'not-run', bindingValidation: 'not-run', evidenceReview: 'not-run',
    readiness: 'invalid', diagnostics, branches: [], handoff: null,
    admission: { status: 'not-run', scope: 'query-validation-reservations',
      excludedWork: ['plan-structure-validation', 'loader', 'record-selection', 'registry-indexing',
        'captured-input-fingerprinting', 'query-execution'],
      limits: null, reserved: null, allocations: [] },
    work: { declaredBranches: null, queryValidationCalls: 0, queryValidationReturns: 0,
      observed: emptyObserved(), knownObserved: emptyObserved(), branches: [] } };
  const finish = () => {
    diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
    return structuredClone(result);
  };
  const declared = validateIntentPlan(plan);
  // Only unresolved query pointers may be deferred: an inferred constraint can
  // reference an omitted selector that exists in P4's effective query. All other
  // shape/inventory errors stop here. Every deferred pointer is rechecked below.
  if (!declared.valid && declared.diagnostics.some(d => d.code !== 'invalid-query-reference')) {
    diagnostics.push(...declared.diagnostics);
    return finish();
  }
  const authored = structuredClone(plan);
  result.work.declaredBranches = authored.branches.length;
  result.work.branches = authored.branches.map((branch, index) => ({
    index, key: branch.key, status: 'not-run', observed: missingObserved(),
  }));
  let reservationOptions = options;
  if (options && typeof options === 'object' && !Array.isArray(options) && Object.hasOwn(options, 'operation')) {
    reservationOptions = { ...options }; delete reservationOptions.operation;
  }
  admitValidationBranches(authored.branches, reservationOptions, result.admission, diagnostics);
  if (diagnostics.length) return finish();
  for (const [index, branch] of authored.branches.entries()) {
    result.work.queryValidationCalls += 1;
    const validation = validateSubjectQuery(branch.query, context, { operation });
    observeValidation(result.work, index, validation);
    result.branches.push({ key: branch.key, kind: branch.kind, authoredQuery: branch.query,
      validation, provenance: [] });
    if (!validation.ok) diagnostics.push(...validation.diagnostics.map(d => ({
      ...d, path: `/branches/${index}/query${d.path}`,
    })));
  }
  result.queryValidation = !result.branches.length ? 'not-run' : diagnostics.length ? 'failed' : 'passed';
  if (diagnostics.length) return finish();

  const effective = structuredClone(authored);
  effective.branches.forEach((branch, i) => { branch.query = result.branches[i].validation.query; });
  const checked = validateIntentPlan(effective);
  if (!checked.valid) {
    diagnostics.push(...checked.diagnostics);
    return finish();
  }
  const required = new Map(result.branches.map(branch => [branch.key,
    new Map(branch.validation.requirements.constraintPaths.map(row => [row.path, row]))]));
  const coverage = new Map(result.branches.map(branch => [branch.key, new Map()]));
  authored.constraints.forEach((constraint, ci) => {
    constraint.queryRefs.forEach((ref, ri) => {
      const path = `/constraints/${ci}/queryRefs/${ri}`;
      const row = required.get(ref.branch)?.get(ref.path);
      if (!row) {
        diagnostics.push({ code: 'unrecognized-constraint-path', path,
          message: 'Query constraints must reference an exact semantic path emitted by the query validator.' });
        return;
      }
      if (row.origin === 'default' && constraint.origin === 'explicit') {
        diagnostics.push({ code: 'explicit-default-claim', path,
          message: 'An omitted default cannot be claimed as explicit user intent; author the selector explicitly.' });
      }
      const paths = coverage.get(ref.branch);
      if (!paths.has(ref.path)) paths.set(ref.path, []);
      paths.get(ref.path).push({ key: constraint.key, origin: constraint.origin, unitKeys: constraint.unitKeys });
    });
  });
  result.branches.forEach((branch, index) => {
    const { query, requirements, input } = branch.validation;
    branch.provenance = requirements.constraintPaths.map(row => {
      const constraints = coverage.get(branch.key).get(row.path) ?? [];
      if (row.origin === 'explicit' && !constraints.length) diagnostics.push({
        code: 'uncovered-query-constraint', path: `/branches/${index}/query${row.path}`,
        message: 'This authored semantic query path needs its own declared intent constraint.',
      });
      const value = valueAt(query, row.path);
      return { path: row.path, kind: row.kind, queryOrigin: row.origin,
        ...(row.op ? { op: row.op } : {}), value, constraints,
        ...(row.origin === 'default' ? { generated: { origin: 'default', validator: 'subject-query',
          queryVersion: input.versions.query, path: row.path, value } } : {}) };
    });
  });
  if (diagnostics.length) return finish();
  result.valid = true;
  result.readiness = checked.readiness === 'ready-for-query-validation' ? 'query-validated' : checked.readiness;
  const { version: _version, ...handoff } = authored;
  result.handoff = { ...handoff, branches: authored.branches.map((branch, i) => ({
    ...branch, effectiveQuery: result.branches[i].validation.query,
  })) };
  return finish();
}

const executionCounters = ['astNodes', 'astDepth', 'redirects', 'hierarchyNodes', 'hierarchyEdges',
  'recordsStarted', 'recordsCompleted', 'predicateSteps', 'explanationNodes'];
const executionObserved = value => Object.fromEntries(executionCounters.map(field => [field, value]));
const admissionReport = (scope, excludedWork) => ({ status: 'not-run', scope, excludedWork,
  limits: null, reserved: null, allocations: [] });

function observeExecution(work, index, result) {
  const branch = work.branches[index];
  work.queryExecutionReturns += 1;
  for (const field of executionCounters) {
    const value = result.resources?.used?.[field];
    if (!count(value)) { work.observed[field] = null; continue; }
    branch.observed[field] = value;
    const combine = previous => field === 'astDepth'
      ? previous === null ? null : Math.max(previous, value) : safeSum(previous, value);
    work.knownObserved[field] = combine(work.knownObserved[field]);
    work.observed[field] = combine(work.observed[field]);
  }
}

/**
 * Execute declared hypotheses through the owning query engine. Both phases
 * reserve their whole authored workload first. Completion proves neither
 * intent fidelity nor source support, and never grants an evidence handoff.
 */
export function executeIntentQueryPlan(plan, context, options) {
  const operation = prepareOperation(plan, context, options, true);
  const diagnostics = [];
  const result = { version: 1, status: 'refused', execution: 'not-run', readiness: 'invalid',
    validation: null, admission: {
      validation: admissionReport('query-validation-reservations', ['plan-structure-validation', 'loader',
        'record-selection', 'registry-indexing', 'captured-input-fingerprinting', 'query-execution']),
      execution: admissionReport('query-execution-reservations', ['plan-structure-validation', 'loader',
        'record-selection', 'assignment-list-validation', 'assignment-eligibility', 'membership-comparisons',
        'registry-governance-binding-and-indexing', 'captured-input-fingerprinting', 'witness-construction',
        'failed-explanation-checks', 'sorting', 'source-pointer-bytes', 'output-json-bytes', 'unreported-failed-call-redirects']),
    }, branches: [], work: { declaredBranches: null, queryExecutionCalls: 0, queryExecutionReturns: 0,
      observed: executionObserved(0), knownObserved: executionObserved(0), branches: [] },
    diagnostics, evidenceReview: 'not-run', bindingValidation: 'not-run', handoff: null };
  const finish = () => {
    diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
    return structuredClone(result);
  };
  const declared = validateIntentPlan(plan);
  if (!declared.valid && declared.diagnostics.some(d => d.code !== 'invalid-query-reference')) {
    diagnostics.push(...declared.diagnostics);
    return finish();
  }
  const authored = structuredClone(plan);
  result.readiness = declared.readiness;
  result.work.declaredBranches = authored.branches.length;
  result.branches = authored.branches.map((branch, index) => ({ index, key: branch.key, kind: branch.kind,
    ...(Object.hasOwn(branch, 'baseBranch') ? { baseBranch: branch.baseBranch } : {}),
    assumptions: branch.assumptions, relaxes: branch.relaxes, status: 'not-run', reason: 'execution-not-started',
    fingerprintCheck: 'not-run', result: null }));
  result.work.branches = authored.branches.map((branch, index) => ({ index, key: branch.key,
    status: 'not-run', observed: executionObserved(null) }));
  if (options === null || typeof options !== 'object' || Array.isArray(options)
    || Reflect.ownKeys(options).some(key => !['admission', 'executionAdmission', 'operation'].includes(key))
    || !Object.hasOwn(options, 'admission') || !Object.hasOwn(options, 'executionAdmission')) {
    diagnostics.push({ code: 'invalid-execution-options', path: '', message: operation === undefined
      ? 'Supply explicit validation and execution admission policies only.'
      : 'Supply explicit validation and execution admission policies, with an optional authentic operation.' });
    return finish();
  }
  const validationDiagnostics = [], executionDiagnostics = [];
  admitValidationBranches(authored.branches, { admission: options.admission }, result.admission.validation, validationDiagnostics);
  admitExecutionBranches(authored.branches, options.executionAdmission, result.admission.execution, executionDiagnostics);
  diagnostics.push(...validationDiagnostics, ...executionDiagnostics);
  if (!authored.branches.length) diagnostics.push({ code: 'no-executable-branches', path: '/branches', message: 'No declared query branches are available for execution.' });
  if (diagnostics.length) {
    result.branches.forEach(branch => { branch.reason = 'plan-admission-refused'; });
    return finish();
  }
  const validation = validateIntentQueryPlan(authored, context, { admission: options.admission, ...(operation === undefined ? {} : { operation }) });
  result.validation = validation;
  result.readiness = validation.readiness;
  if (!validation.valid) {
    diagnostics.push(...validation.diagnostics);
    result.branches.forEach(branch => { branch.reason = 'plan-validation-refused'; });
    return finish();
  }
  for (const [index, authoredBranch] of authored.branches.entries()) {
    const branch = result.branches[index];
    result.work.queryExecutionCalls += 1;
    const executed = querySubjects(context, authoredBranch.query, { collect: 'results', ...(operation === undefined ? {} : { operation }) });
    observeExecution(result.work, index, executed);
    branch.result = executed;
    branch.status = executed.status;
    branch.reason = null;
    const before = validation.branches[index].validation.input?.fingerprint;
    const after = executed.input?.fingerprint;
    branch.fingerprintCheck = typeof before !== 'string' || !before.length || typeof after !== 'string' || !after.length
      ? 'unavailable' : before === after ? 'matched' : 'mismatch';
    if (branch.fingerprintCheck === 'mismatch'
      || (executed.status === 'complete' && branch.fingerprintCheck === 'unavailable')) {
      branch.status = 'refused';
      branch.reason = branch.fingerprintCheck === 'unavailable' ? 'capture-comparison-unavailable' : 'capture-fingerprint-mismatch';
      diagnostics.push({ code: branch.reason, path: `/branches/${index}`, message: 'Execution cannot be bound to the validated captured inputs.' });
    } else if (!['complete', 'incomplete', 'refused'].includes(executed.status)) {
      throw new TypeError('Unexpected query execution status.');
    }
    result.work.branches[index].status = branch.status;
    if (branch.status !== 'complete') {
      branch.reason ??= `query-${branch.status}`;
      result.status = branch.status;
      result.execution = branch.status;
      diagnostics.push(...(executed.diagnostics ?? []).map(d => ({ ...d, path: `/branches/${index}/query${d.path ?? ''}` })));
      result.branches.slice(index + 1).forEach(later => { later.reason = 'prior-branch-stopped-execution'; });
      return finish();
    }
  }
  result.status = 'complete';
  result.execution = 'complete';
  return finish();
}
