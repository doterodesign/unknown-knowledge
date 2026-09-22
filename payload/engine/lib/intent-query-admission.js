/** Pure reservations; never invoke query validation or execution. */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shape = (value, fields) => object(value) && Reflect.ownKeys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));
const count = value => Number.isSafeInteger(value) && value >= 0;
export const safeSum = (left, right) => left === null || right > Number.MAX_SAFE_INTEGER - left ? null : left + right;

export function admitValidationBranches(branches, options, admission, diagnostics) {
  const invalid = (code, path, message) => {
    diagnostics.push({ code, path, message });
    admission.status = 'invalid';
  };
  if (!object(options) || Reflect.ownKeys(options).some(key => key !== 'admission')) {
    invalid('invalid-plan-admission', '/admission', 'Options accept only an explicit admission policy.');
    return;
  }
  if (!Object.hasOwn(options, 'admission')) { admission.status = 'not-requested'; return; }
  const limits = options.admission;
  if (!shape(limits, ['version', 'maxBranches', 'maxReservedAstNodes', 'maxReservedRedirects'])
    || limits.version !== 1 || ![limits.maxBranches, limits.maxReservedAstNodes, limits.maxReservedRedirects].every(count)) {
    invalid('invalid-plan-admission', '/admission', 'Supply version 1 and explicit nonnegative safe integer limits.');
    return;
  }
  admission.limits = { ...limits };
  branches.forEach((branch, index) => {
    const budget = branch.query.budgets;
    if (!object(budget) || budget.version !== 1 || !count(budget.maxAstNodes) || budget.maxAstNodes < 1
      || !count(budget.maxRedirects)) {
      invalid('invalid-branch-reservation', `/branches/${index}/query/budgets`,
        'Every branch needs version 1, a positive maxAstNodes and a nonnegative maxRedirects reservation.');
      return;
    }
    admission.allocations.push({ index, key: branch.key, astNodes: budget.maxAstNodes, redirects: budget.maxRedirects });
  });
  if (admission.status === 'invalid') return;
  const reserved = { astNodes: 0, redirects: 0 };
  for (const allocation of admission.allocations) {
    for (const field of ['astNodes', 'redirects']) reserved[field] = safeSum(reserved[field], allocation[field]);
  }
  admission.reserved = reserved;
  const deny = (code, path, message) => diagnostics.push({ code, path, message });
  if (branches.length > limits.maxBranches) deny('plan-branch-limit', '/admission/maxBranches', 'Declared branch count exceeds admission capacity.');
  for (const [field, limit] of [['astNodes', 'maxReservedAstNodes'], ['redirects', 'maxReservedRedirects']]) {
    if (reserved[field] === null) deny('plan-reservation-overflow', `/admission/${limit}`,
      'Total requested reservation exceeds the safe integer range. Individual allocations remain inspectable.');
    else if (reserved[field] > limits[limit]) deny(`plan-${field === 'astNodes' ? 'ast' : 'redirect'}-reservation-limit`,
      `/admission/${limit}`, 'Total requested reservation exceeds admission capacity.');
  }
  admission.status = diagnostics.length ? 'denied' : 'admitted';
}

const executionFields = [
  ['astNodes', 'maxAstNodes', 'maxReservedAstNodes'],
  ['astDepth', 'maxAstDepth', 'maxAstDepth'],
  ['redirects', 'maxRedirects', 'maxReservedRedirects'],
  ['hierarchyNodes', 'maxHierarchyNodes', 'maxReservedHierarchyNodes'],
  ['hierarchyEdges', 'maxHierarchyEdges', 'maxReservedHierarchyEdges'],
  ['records', 'maxRecords', 'maxReservedRecords'],
  ['predicateSteps', 'maxPredicateSteps', 'maxReservedPredicateSteps'],
  ['explanationNodes', 'maxExplanationNodes', 'maxReservedExplanationNodes'],
  ['resultSlots', 'maxResultsPerStore', 'maxReservedResultSlots'],
];

/** Sum every authored request, not predictions about actual evaluation work. */
export function admitExecutionBranches(branches, limits, admission, diagnostics) {
  const issue = (code, path, message) => diagnostics.push({ code, path, message });
  const limitNames = ['maxBranches', ...executionFields.map(([, , limit]) => limit)];
  if (!shape(limits, ['version', ...limitNames]) || limits.version !== 1 || !limitNames.every(key => count(limits[key]))) {
    admission.status = 'invalid';
    issue('invalid-execution-admission', '/executionAdmission', 'Supply version 1 and every explicit nonnegative safe integer limit.');
    return;
  }
  admission.limits = { ...limits };
  for (const [index, branch] of branches.entries()) {
    const budget = branch.query.budgets;
    const validBudget = object(budget) && budget.version === 1 && executionFields.every(([field, name]) =>
      count(budget[name]) && (!['astNodes', 'astDepth'].includes(field) || budget[name] > 0));
    if (!validBudget || !Array.isArray(branch.query.stores) || !branch.query.stores.length) {
      admission.status = 'invalid';
      issue('invalid-execution-reservation', `/branches/${index}/query`, 'Supply explicit branch budgets and requested stores to reserve execution.');
      continue;
    }
    const allocation = { index, key: branch.key };
    for (const [field, name] of executionFields) {
      allocation[field] = field === 'resultSlots'
        ? budget[name] > Math.floor(Number.MAX_SAFE_INTEGER / branch.query.stores.length)
          ? null : budget[name] * branch.query.stores.length
        : budget[name];
    }
    admission.allocations.push(allocation);
  }
  if (admission.status === 'invalid') return;
  admission.reserved = Object.fromEntries(executionFields.map(([field]) => [field, 0]));
  for (const allocation of admission.allocations) for (const [field] of executionFields) {
    const previous = admission.reserved[field];
    admission.reserved[field] = allocation[field] === null ? null : field === 'astDepth'
      ? Math.max(previous, allocation[field]) : safeSum(previous, allocation[field]);
  }
  if (branches.length > limits.maxBranches) {
    issue('plan-branch-limit', '/executionAdmission/maxBranches', 'Declared branch count exceeds execution admission capacity.');
  }
  for (const [field, , limit] of executionFields) {
    if (admission.reserved[field] === null) {
      issue('plan-reservation-overflow', `/executionAdmission/${limit}`, 'Requested reservation exceeds the safe integer range; allocations remain inspectable.');
    } else if (admission.reserved[field] > limits[limit]) {
      issue('plan-execution-reservation-limit', `/executionAdmission/${limit}`, 'Requested reservation exceeds execution admission capacity.');
    }
  }
  admission.status = diagnostics.length ? 'denied' : 'admitted';
}
