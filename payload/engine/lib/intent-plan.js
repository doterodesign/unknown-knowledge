/**
 * P5: validate the declared intent inventory and preserve its evidence handoff.
 * This cannot establish that the host noticed every material part of an ask.
 * Queries and target identities stay opaque until their owning validators run.
 * Input/output are transient JSON data, never a store or cached trust verdict.
 */
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const pointerSegment = (key) => key.replace(/~/g, '~0').replace(/\//g, '~1');

// Small shapes specific to this request. P4 owns the nested query grammar.
const shapes = {
  units: { key: 'text', sourceRef: 'text', disposition: ['mapped', 'grammatical', 'unresolved'] },
  bindings: { key: 'text', unitKeys: 'refs', target: 'object', label: 'text',
    basis: ['label', 'alias', 'inference'], sourceRef: 'text' },
  constraints: { key: 'text', unitKeys: 'refs', origin: ['explicit', 'inferred'],
    bindingKeys: 'refs', queryRefs: 'array', requirementKeys: 'refs' },
  requirements: { key: 'text', unitKeys: 'refs', description: 'text' },
  branches: { key: 'text', unitKeys: 'refs', kind: ['strict', 'alternative', 'recovery'],
    query: 'object', assumptions: 'refs', relaxes: 'refs' },
  clarifications: { key: 'text', unitKeys: 'refs', prompt: 'text' },
};

/** Reject non-JSON values/cycles without recursively walking an opaque query. */
function jsonData(value) {
  const active = new Set();
  const stack = [{ value }];
  while (stack.length) {
    const item = stack.pop();
    if (item.leave) { active.delete(item.value); continue; }
    const current = item.value;
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
    if (typeof current === 'number' && Number.isFinite(current)) continue;
    if (typeof current !== 'object' || active.has(current)) return false;
    if (!Array.isArray(current) && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) return false;
    if (Object.getOwnPropertySymbols(current).length) return false;
    if (Array.isArray(current) && (Object.keys(current).length !== current.length
      || Object.keys(current).some((key) => !/^(0|[1-9][0-9]*)$/.test(key)))) return false;
    active.add(current);
    stack.push({ value: current, leave: true });
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(current))) {
      if (!Object.hasOwn(descriptor, 'value')) return false;
      stack.push({ value: descriptor.value });
    }
  }
  return true;
}

/** Own-property RFC 6901 resolution; array positions use canonical indexes. */
function hasPointer(value, pointer) {
  if (pointer === '') return true;
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || /~(?:[^01]|$)/.test(pointer)) return false;
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null || typeof value !== 'object') return false;
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) return false;
    if (!Object.hasOwn(value, key)) return false;
    value = value[key];
  }
  return true;
}

/**
 * @param {unknown} plan transient JSON request
 * @returns {object} structural diagnostics and a detached handoff, never trust
 */
export function validateIntentPlan(plan) {
  const diagnostics = [];
  const issue = (code, path, message) => diagnostics.push({ code, path, message });
  const result = (handoff = null, readiness = 'invalid') => ({
    version: 1, valid: diagnostics.length === 0, validationScope: 'declared-inventory-only',
    queryValidation: 'not-run', targetValidation: 'not-run', readiness,
    diagnostics: diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code)), handoff,
  });
  if (!object(plan) || !jsonData(plan)) {
    issue('invalid-plan', '', 'Expected an acyclic JSON object.');
    return result();
  }

  function shape(value, fields, path, optional = {}) {
    if (!object(value)) { issue('wrong-type', path, 'Expected an object.'); return; }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(fields, key) && !Object.hasOwn(optional, key)) {
        issue('unknown-field', `${path}/${pointerSegment(key)}`, 'Unknown intent-plan field.');
      }
    }
    for (const [key, type] of Object.entries({ ...fields, ...optional })) {
      const field = `${path}/${pointerSegment(key)}`;
      if (!Object.hasOwn(value, key)) {
        if (!Object.hasOwn(optional, key)) issue('missing-field', field, 'Required field is missing.');
        continue;
      }
      const item = value[key];
      const valid = Array.isArray(type) ? type.includes(item)
        : type === 'text' ? text(item)
          : type === 'object' ? object(item)
            : type === 'pointer' ? typeof item === 'string'
              : type === 'refs' ? Array.isArray(item) && item.every(text) && new Set(item).size === item.length
                : type === 'array' && Array.isArray(item);
      if (!valid) issue('invalid-field', field, 'Field does not conform to the intent-plan contract.');
    }
  }

  shape(plan, { version: [1], inputRef: 'text', inventoryStatus: ['open', 'declared-complete'],
    ...Object.fromEntries(Object.keys(shapes).map((key) => [key, 'array'])) }, '');
  if (diagnostics.length) return result();
  for (const [section, fields] of Object.entries(shapes)) {
    plan[section].forEach((entry, index) => {
      shape(entry, fields, `/${section}/${index}`, section === 'branches' ? { baseBranch: 'text' } : {});
      if (section === 'constraints' && Array.isArray(entry?.queryRefs)) {
        entry.queryRefs.forEach((ref, ri) => shape(ref, { branch: 'text', path: 'pointer' }, `/${section}/${index}/queryRefs/${ri}`));
      }
    });
  }
  if (diagnostics.length) return result();
  const indexes = {};
  for (const section of Object.keys(shapes)) {
    indexes[section] = new Map();
    plan[section].forEach((entry, index) => {
      if (indexes[section].has(entry.key)) issue('duplicate-key', `/${section}/${index}/key`, 'Keys must be unique within a section.');
      indexes[section].set(entry.key, entry);
    });
  }
  if (!plan.units.length || plan.units.every((u) => u.disposition === 'grammatical')) {
    issue('missing-material-inventory', '/units', 'Declare at least one material intent unit; an open inventory remains open.');
  }
  const refs = (values, section, path) => values.forEach((key, index) => {
    if (!indexes[section].has(key)) issue('unknown-reference', `${path}/${index}`, `Reference is absent from ${section}.`);
  });
  for (const section of Object.keys(shapes).filter((s) => s !== 'units')) {
    plan[section].forEach((entry, index) => {
      const path = `/${section}/${index}/unitKeys`;
      if (!entry.unitKeys.length) issue('missing-unit-reference', path, 'Declare the material intent this item serves.');
      refs(entry.unitKeys, 'units', path);
      for (const key of entry.unitKeys) {
        if (indexes.units.get(key)?.disposition === 'grammatical') issue('grammatical-conflict', path, 'A grammatical unit cannot also carry semantic intent.');
      }
    });
  }
  plan.constraints.forEach((constraint, index) => {
    const path = `/constraints/${index}`;
    refs(constraint.bindingKeys, 'bindings', `${path}/bindingKeys`);
    refs(constraint.requirementKeys, 'requirements', `${path}/requirementKeys`);
    if (!constraint.queryRefs.length && !constraint.requirementKeys.length) {
      issue('unrouted-constraint', path, 'Route the constraint to query validation or evidence review.');
    }
    for (const [field, section] of [['bindingKeys', 'bindings'], ['requirementKeys', 'requirements']]) {
      constraint[field].forEach((key, index) => {
        const target = indexes[section].get(key);
        if (target && !target.unitKeys.some((unit) => constraint.unitKeys.includes(unit))) {
          issue('unrelated-reference', `${path}/${field}/${index}`, 'Linked item must concern the same declared intent.');
        }
      });
    }
    const seen = new Set();
    constraint.queryRefs.forEach((ref, index) => {
      const refPath = `${path}/queryRefs/${index}`;
      const branch = indexes.branches.get(ref.branch);
      const key = JSON.stringify([ref.branch, ref.path]);
      if (seen.has(key)) issue('duplicate-reference', refPath, 'Query references must be unique.');
      seen.add(key);
      if (!branch || !hasPointer(branch.query, ref.path)) issue('invalid-query-reference', refPath, 'Query pointer must resolve within the named branch.');
    });
  });
  plan.units.forEach((unit, index) => {
    const mapped = plan.constraints.some((c) => c.unitKeys.includes(unit.key))
      || plan.requirements.some((r) => r.unitKeys.includes(unit.key));
    const unresolved = plan.requirements.some((r) => r.unitKeys.includes(unit.key))
      || plan.clarifications.some((c) => c.unitKeys.includes(unit.key))
      || plan.branches.some((b) => b.kind === 'alternative' && b.unitKeys.includes(unit.key));
    if ((unit.disposition === 'mapped' && !mapped) || (unit.disposition === 'unresolved' && !unresolved)) {
      issue('uncovered-unit', `/units/${index}`, 'Carry this unit into a constraint, source requirement or explicit uncertainty path.');
    }
  });
  if (plan.branches.filter((b) => b.kind === 'strict').length > 1) {
    issue('multiple-strict-branches', '/branches', 'Interpretation alternatives need distinct labels.');
  }
  plan.branches.forEach((branch, index) => {
    const path = `/branches/${index}`;
    refs(branch.relaxes, 'constraints', `${path}/relaxes`);
    if (branch.kind !== 'strict' && !branch.assumptions.length) issue('missing-assumption', path, 'State the interpretation or recovery assumption.');
    if (branch.kind !== 'recovery') {
      if (branch.relaxes.length || Object.hasOwn(branch, 'baseBranch')) issue('unlabeled-recovery', path, 'Only recovery branches may relax a base plan.');
      return;
    }
    const base = indexes.branches.get(branch.baseBranch);
    if (!base || base.kind === 'recovery' || !branch.relaxes.length) {
      issue('invalid-recovery', path, 'Recovery requires a non-recovery base and explicit relaxed constraints.');
    }
    for (const key of branch.relaxes) {
      const constraint = indexes.constraints.get(key);
      if (!constraint) continue;
      if (!constraint.queryRefs.some((r) => r.branch === branch.baseBranch)) {
        issue('unrelated-relaxation', path, 'Relaxed constraint must refer to the declared base query.');
      }
      if (!constraint.unitKeys.every((unit) => branch.unitKeys.includes(unit))) {
        issue('lost-recovery-intent', path, 'Recovery must retain every unit of each relaxed constraint.');
      }
    }
  });
  if (diagnostics.length) return result();
  const readiness = plan.inventoryStatus === 'open' ? 'inventory-open'
    : plan.units.some((u) => u.disposition === 'unresolved') || plan.clarifications.length || !plan.branches.length
      ? 'unresolved-intent' : 'ready-for-query-validation';
  // Detached output means a host annotating its handoff cannot rewrite input.
  const { version: _version, ...handoff } = structuredClone(plan);
  return result(handoff, readiness);
}
