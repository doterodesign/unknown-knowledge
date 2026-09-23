// Test-only transport and exposure accounting; domain decisions belong to the installed CLI.
import { mkdtempSync, writeFileSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function shape(value, allowed, required = allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))
    || required.some(key => !Object.hasOwn(value, key))) throw new Error('unsupported engine output shape');
}
function array(value) {
  if (!Array.isArray(value)) throw new Error('unsupported engine output shape');
  return value;
}
const modes = ['structural', 'inspect-bindings', 'validate-queries', 'execute-queries'];

export function installedFiles(root, prefix = 'unknown-knowledge') {
  return readdirSync(resolve(root, prefix), { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    if (entry.isSymbolicLink()) throw new Error('trial installation contains a symlink');
    const path = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? installedFiles(root, path) : [path];
  }).sort();
}

export function invokeIntentOperation(config, operation, stateFile) {
  if (!config.identityNamespace || !config.runtimeFiles?.length) throw new Error('intent operations require a frozen canonical installation');
  // These checks concern the host transport, never the plan/query language.
  try {
    if (operation.type === 'subject-lookup') {
      shape(operation, ['type', 'text', 'options'], ['type', 'text']);
      shape(operation.options ?? {}, ['locale', 'context'], []);
      if (typeof operation.text !== 'string' || !operation.text.trim() || operation.text.startsWith('-')
        || Object.values(operation.options ?? {}).some(value => typeof value !== 'string' || value.startsWith('-'))) throw new Error();
    } else {
      shape(operation, ['type', 'mode', 'plan', 'lookupRequests'], ['type', 'mode', 'plan']);
      if (!modes.includes(operation.mode) || (Object.hasOwn(operation, 'lookupRequests') && operation.mode !== 'inspect-bindings')) throw new Error();
    }
  } catch { throw new Error('invalid host request'); }
  const policy = key => {
    const file = config.intentPolicies?.[key];
    if (!file || !config.fileHashes[file]) throw new Error('frozen intent policy unavailable');
    return resolve(config.root, file);
  };
  let temporary;
  try {
    let args;
    if (operation.type === 'subject-lookup') {
      args = [resolve(config.root, 'unknown-knowledge/engine/subject.js'), 'lookup', operation.text, '--root', config.root, '--json'];
      for (const [key, value] of Object.entries(operation.options ?? {})) args.push(`--${key}`, value);
    } else {
      const relativeState = realpathSync(dirname(stateFile));
      if (relativeState === config.root || relativeState.startsWith(`${config.root}/`)) throw new Error('request state must be outside the immutable installation');
      temporary = mkdtempSync(resolve(dirname(stateFile), 'intent-request-'));
      const put = (name, value) => {
        const path = resolve(temporary, name);
        writeFileSync(path, JSON.stringify(value), { flag: 'wx' });
        return path;
      };
      args = [resolve(config.root, 'unknown-knowledge/engine/intent-plan.js'), put('plan.json', operation.plan), '--json'];
      if (operation.mode !== 'structural') args.push(`--${operation.mode}`, '--root', config.root);
      if (operation.lookupRequests !== undefined) args.push('--lookup-requests', put('lookup.json', operation.lookupRequests));
      if (['validate-queries', 'execute-queries'].includes(operation.mode)) {
        args.push('--admission', policy('validation'));
        if (operation.mode === 'execute-queries') args.push('--execution-admission', policy('execution'));
        for (const [field, flag] of [['decisionCaptures', '--decision-captures'], ['assessmentCaptures', '--assessment-captures']]) {
          if (config[field]) {
            if (!config.fileHashes[config[field]]) throw new Error('frozen captures unavailable');
            args.push(flag, resolve(config.root, config[field]));
          }
        }
      }
    }
    return spawnSync(process.execPath, args, { cwd: config.root,
      maxBuffer: config.limits.resultBytes + 1, timeout: 30000 });
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

const structuralFields = ['version', 'valid', 'validationScope', 'queryValidation', 'targetValidation', 'readiness', 'diagnostics', 'handoff'];
const validationFields = ['version', 'valid', 'validationScope', 'queryValidation', 'execution', 'bindingValidation',
  'evidenceReview', 'readiness', 'diagnostics', 'branches', 'handoff', 'admission', 'work'];
const executionFields = ['version', 'status', 'execution', 'readiness', 'validation', 'admission', 'branches', 'work',
  'diagnostics', 'evidenceReview', 'bindingValidation', 'handoff'];
const requireOutput = condition => { if (!condition) throw new Error('unsupported engine output shape'); };
function structural(result) {
  shape(result, structuralFields);
  requireOutput(result.version === 1 && typeof result.valid === 'boolean' && result.validationScope === 'declared-inventory-only');
  array(result.diagnostics);
}
function validation(result, inspectOutcome) {
  shape(result, validationFields);
  requireOutput(result.version === 1 && typeof result.valid === 'boolean' && result.validationScope === 'declared-inventory-and-query-provenance');
  array(result.diagnostics);
  for (const branch of array(result.branches)) {
    shape(branch, ['key', 'kind', 'authoredQuery', 'validation', 'provenance']);
    array(branch.provenance);
    if (Object.hasOwn(branch.validation ?? {}, 'validationScope')) {
      // P4 predicate grammar failures have their own closed, metadata-free DTO.
      // They remain real domain refusals, not unrecognized host output.
      shape(branch.validation, ['ok', 'validationScope', 'diagnostics', 'used']);
      requireOutput(branch.validation.ok === false && branch.validation.validationScope === 'syntax-only');
      shape(branch.validation.used, ['astNodes', 'astDepth']);
      requireOutput(Object.values(branch.validation.used).every(value => Number.isSafeInteger(value) && value >= 0));
      for (const diagnostic of array(branch.validation.diagnostics)) {
        shape(diagnostic, ['code', 'path', 'message']);
        requireOutput(Object.values(diagnostic).every(value => typeof value === 'string'));
      }
      continue;
    }
    shape(branch.validation, ['ok', 'query', 'requirements', 'input', 'used', 'coverage', 'diagnostics'], ['ok']);
    requireOutput(typeof branch.validation.ok === 'boolean');
    const requirements = branch.validation.requirements;
    if (requirements !== undefined) {
      shape(requirements, ['subjects', 'constraintPaths', 'subjectResolutions'], ['subjects']);
      if (requirements.subjectResolutions !== undefined) for (const row of array(requirements.subjectResolutions)) {
        shape(row, ['subject', 'outcome']); inspectOutcome(row.outcome, branch.validation.input?.namespace);
      }
    }
  }
}

/** Inspect only documented output containers. Never recursively match arbitrary IDs or walk query ASTs. */
export function inspectIntentDelivery(payload, operation, config) {
  const inspected = new Set(), detailed = new Set(), subjects = new Set();
  const subject = ref => {
    shape(ref, ['namespace', 'kind', 'id']);
    if (ref.namespace !== config.identityNamespace || ref.kind !== 'subject' || typeof ref.id !== 'string'
      || !config.subjectInventory?.includes(ref.id)) throw new Error('returned subject outside declared namespace or inventory');
    subjects.add(`${ref.namespace}/subject/${ref.id}`);
  };
  const inspectOutcome = (outcome, namespace) => {
    shape(outcome, ['eligible', 'resolution', 'verification', 'code'], ['eligible', 'resolution', 'verification']);
    const resolution = outcome.resolution;
    shape(resolution, ['status', 'requestedId', 'subject', 'policy', 'redirects', 'id', 'code', 'alternatives'],
      ['status', 'requestedId', 'subject', 'policy', 'redirects']);
    requireOutput(object(resolution.subject) && ['resolved', 'unresolved'].includes(resolution.status));
    if (resolution.status === 'resolved') requireOutput(resolution.id === resolution.subject.id);
    // Full subject metadata is exposed here. Redirect IDs and warrant refs alone
    // are not metadata exposures and are deliberately not traversed.
    subject({ namespace, kind: 'subject', id: resolution.subject.id });
  };
  const record = (ref, identityType, file, full = false) => {
    shape(ref, identityType === 'proposal' ? ['namespace', 'kind', 'key'] : ['namespace', 'kind', 'id']);
    const kind = ref.kind === 'decision' ? 'decisions' : ref.kind;
    const localId = identityType === 'proposal' ? ref.key : ref.id;
    const found = config.records.find(row => row.kind === kind && row.localId === localId && row.identityType === identityType);
    if (ref.namespace !== config.identityNamespace || !['ontology', 'knowledge', 'decision'].includes(ref.kind)
      || !found || (file !== undefined && `unknown-knowledge/${file}` !== found.file)) throw new Error('returned record outside declared inventory');
    inspected.add(found.id);
    if (full) detailed.add(found.id);
  };
  if (operation.type === 'subject-lookup') {
    shape(payload, ['operation', 'scope', 'context', 'input', 'result']);
    if (payload.operation !== 'subject.lookup' || payload.scope !== 'declared-metadata'
      || payload.context?.namespace !== config.identityNamespace) throw new Error('unsupported engine output shape');
    shape(payload.context, ['consistency', 'namespace', 'identityFormat', 'subjectSchema', 'normalizer', 'registryRevision', 'hierarchyRevision', 'registryDigest']);
    shape(payload.input, ['text', 'options']);
    shape(payload.result, ['normalizerVersion', 'matches']);
    for (const row of array(payload.result.matches)) {
      shape(row, ['id', 'label', 'definition', 'status', 'matches']);
      subject({ namespace: payload.context.namespace, kind: 'subject', id: row.id });
    }
  } else if (operation.mode === 'structural') {
    structural(payload);
  } else {
    shape(payload, ['mode', 'result', 'contextDiagnostics', 'diagnostics'], ['mode', 'result']);
    if (payload.mode !== operation.mode) throw new Error('unsupported engine output shape');
    if (payload.result === null) {
      shape(payload, ['mode', 'result', 'diagnostics']); array(payload.diagnostics);
    } else {
      shape(payload, ['mode', 'result', 'contextDiagnostics']); array(payload.contextDiagnostics);
      const result = payload.result;
      if (operation.mode === 'inspect-bindings') {
        shape(result, ['version', 'inspectionScope', 'planValidation', 'queryValidation', 'governanceValidation', 'bindings']);
        structural(result.planValidation);
        if (result.version !== 1 || result.inspectionScope !== 'captured-navigation-only') throw new Error('unsupported engine output shape');
        for (const row of array(result.bindings)) {
          shape(row, ['key', 'sourceRef', 'claim', 'target', 'lookup', 'basisCheck']);
          const target = row.target;
          shape(target, ['status', 'ref', 'entry', 'subject', 'allocation', 'declarations', 'candidates', 'reason', 'details'], ['status']);
          requireOutput(['loaded', 'retired', 'declared-only', 'ambiguous', 'missing', 'invalid', 'unavailable', 'invalid-context'].includes(target.status));
          if (target.status === 'loaded') requireOutput(Object.hasOwn(target, 'subject') !== Object.hasOwn(target, 'entry'));
          if (Object.hasOwn(target, 'entry')) {
            if (!['loaded', 'retired'].includes(target.status) || !object(target.entry)
              || target.entry.record?.id !== target.ref?.id || typeof target.entry.file !== 'string') throw new Error('unsupported engine output shape');
            record(target.ref, 'canonical', target.entry.file, true);
          }
          if (Object.hasOwn(target, 'subject')) {
            if (target.status !== 'loaded' || target.subject?.id !== target.ref?.id) throw new Error('unsupported engine output shape');
            subject(target.ref);
          }
          shape(row.lookup, ['status', 'reason', 'diagnostics', 'text', 'options', 'expected', 'captured', 'candidates'], ['status']);
          requireOutput(['available', 'stale-context', 'unavailable', 'invalid-context'].includes(row.lookup.status));
          if (Object.hasOwn(row.lookup, 'candidates')) for (const candidate of array(row.lookup.candidates)) {
            shape(candidate, ['ref', 'label', 'definition', 'status', 'matches']); subject(candidate.ref);
          }
        }
      } else if (operation.mode === 'validate-queries') {
        validation(result, inspectOutcome);
      } else {
        shape(result, executionFields);
        requireOutput(result.version === 1 && ['complete', 'incomplete', 'refused'].includes(result.status));
        if (result.validation !== null) validation(result.validation, inspectOutcome);
        // Prior results remain visible even if the wrapper or a later branch failed.
        for (const branch of array(result.branches)) {
          shape(branch, ['index', 'key', 'kind', 'baseBranch', 'assumptions', 'relaxes', 'status', 'reason', 'fingerprintCheck', 'result'],
            ['index', 'key', 'kind', 'assumptions', 'relaxes', 'status', 'reason', 'fingerprintCheck', 'result']);
          if (branch.result === null) continue;
          // Historical v1 receipts have no marker. The v2 shape is a separate,
          // closed contract; unknown versions cannot silently fall back to v1.
          const factored = branch.result.outputVersion === 2;
          requireOutput(factored || !Object.hasOwn(branch.result, 'outputVersion'));
          shape(branch.result, ['status', 'query', 'input', 'groups', 'counts', 'resources', 'diagnostics', 'coverage',
            ...(factored ? ['outputVersion', 'assignmentEvidence'] : [])], ['status', 'groups', 'counts', 'diagnostics']);
          requireOutput(['complete', 'incomplete', 'refused'].includes(branch.result.status));
          if (branch.result.groups === null) {
            requireOutput(!Object.hasOwn(branch.result, 'assignmentEvidence'));
            continue;
          }
          const evidence = branch.result.assignmentEvidence;
          const referenced = new Set();
          if (evidence !== undefined) {
            shape(evidence, ['namespace', 'kind', 'purpose', 'policy', 'outcomes']);
            requireOutput(evidence.namespace === branch.result.input?.namespace && evidence.namespace === config.identityNamespace
              && evidence.kind === 'subject' && evidence.purpose === 'query'
              && ['current', 'historical', 'equivalent'].includes(evidence.policy)
              && evidence.policy === branch.result.query?.subjectPolicy && object(evidence.outcomes)
              && Object.keys(evidence.outcomes).length > 0);
            for (const [id, outcome] of Object.entries(evidence.outcomes)) {
              requireOutput(/^S-\d{6}$/.test(id) && id !== 'S-000000' && config.subjectInventory.includes(id));
              inspectOutcome(outcome, evidence.namespace);
              requireOutput(outcome.eligible === true && outcome.verification === 'verified'
                && outcome.resolution.status === 'resolved' && outcome.resolution.requestedId === id
                && outcome.resolution.policy === evidence.policy);
              let resolved = id;
              for (const redirect of array(outcome.resolution.redirects)) {
                shape(redirect, ['from', 'to']);
                requireOutput(redirect.from === resolved && /^S-\d{6}$/.test(redirect.to) && redirect.to !== 'S-000000');
                resolved = redirect.to;
              }
              requireOutput(resolved === outcome.resolution.id);
            }
          }
          shape(branch.result.groups, ['ontology', 'knowledge', 'decisions'], []);
          for (const [store, group] of Object.entries(branch.result.groups)) {
            shape(group, ['strict', 'possible']);
            for (const row of [...array(group.strict), ...array(group.possible)]) {
              shape(row, ['identityType', 'ref', 'proposalRef', 'label', 'file', 'sourcePointers', 'lifecycle', 'truth',
                'witness', 'unknowns', 'assignments', ...(!factored ? ['assignmentSubjects'] : []), 'applicability', 'rank'],
              ['identityType', 'label', 'file', 'sourcePointers', 'lifecycle', 'truth', 'witness', 'unknowns', 'assignments',
                ...(!factored ? ['assignmentSubjects'] : []), 'rank']);
              const ref = row.identityType === 'record' ? row.ref : row.proposalRef;
              if (!['record', 'proposal'].includes(row.identityType) || (ref?.kind === 'decision' ? 'decisions' : ref?.kind) !== store
                || Object.hasOwn(row, row.identityType === 'record' ? 'proposalRef' : 'ref')) throw new Error('unsupported engine output shape');
              record(ref, row.identityType === 'record' ? 'canonical' : 'proposal', row.file);
              if (factored) {
                const known = row.assignments?.state === 'known';
                shape(row.assignments, known ? ['state', 'ids'] : ['state', 'reason']);
                if (known) {
                  const ids = array(row.assignments.ids);
                  requireOutput(new Set(ids).size === ids.length);
                  for (const id of ids) {
                    requireOutput(typeof id === 'string' && evidence !== undefined && Object.hasOwn(evidence.outcomes, id));
                    referenced.add(id);
                  }
                } else requireOutput(row.assignments.state === 'unknown' && row.assignments.reason === 'absent');
              } else for (const assignment of array(row.assignmentSubjects)) {
                shape(assignment, ['originalId', 'index', 'path', 'outcome']);
                inspectOutcome(assignment.outcome, branch.result.input?.namespace);
              }
            }
          }
          if (factored) requireOutput(Object.keys(evidence?.outcomes ?? {}).length === referenced.size);
        }
      }
    }
  }
  return { inspected: [...inspected], detailed: [...detailed], subjects: [...subjects] };
}
