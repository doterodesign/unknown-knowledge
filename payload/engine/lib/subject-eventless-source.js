/** Shared eventless source/capture and whole-owner retention mechanics; no lifecycle executor. */
import { isDeepStrictEqual as same } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { captureCommittedFile } from './captured-source.js';
import { canonicalJsonBytes } from './canonical-json.js';
import { RECORD_KINDS, iterateCurrentRecords, iterateProposalRecords } from './record-identity.js';
import { resolveRecord } from './record-identity-index.js';
import { parseRecordFile } from './record-file.js';
import { readAssignments } from './subject-assignments.js';
import { recordLifecycleState } from './record-lifecycle.js';
import { SubjectError } from './subject-error.js';
const sides = ['before', 'candidate'];
const stores = { knowledge: 'knowledge', ontology: 'ontology', decision: 'decisions' };
const maps = { knowledge: 'leaves', ontology: 'concepts', decision: 'decisions' };
const repoPath = (kitPath, file) => kitPath === '.' ? file : `${kitPath}/${file}`;
const content = ({ source, ...locator }) => locator;
const observed = actual => ({ capture: actual.locator, mode: actual.mode });
const ownerRef = row => row.ref ? { ref: row.ref } : { proposalRef: row.proposalRef };
const key = row => { const ref = row.ref ?? row.proposalRef; return JSON.stringify([ref.namespace, ref.kind, ref.id ?? ref.key]); };
const fail = (code, message) => { throw new SubjectError(code, message); };
const requireThat = (condition, code, message) => { if (!condition) fail(code, message); };
export function governanceLimits(input) {
  // Authenticate/create the one allowance without evaluating caller getters.
  const field = (object, key) => {
    requireThat(object !== null && typeof object === 'object'
      && [Object.prototype, null].includes(Object.getPrototypeOf(object)), 'invalid-subject-reconsideration-input', 'Expected own-data input.');
    const value = Object.getOwnPropertyDescriptor(object, key);
    requireThat(value?.enumerable && Object.hasOwn(value, 'value'), 'invalid-subject-reconsideration-input', 'Expected own-data capacity.');
    return value.value;
  };
  const limits = field(field(input, 'limits'), 'governance');
  const names = ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits', 'maxSubjects', 'maxHistoryRows', 'maxValidationSteps'];
  requireThat(limits !== null && typeof limits === 'object' && Reflect.ownKeys(limits).length === names.length,
    'invalid-subject-reconsideration-input', 'Supply exact governance capacities.');
  return Object.fromEntries(names.map(name => [name, field(limits, name)]));
}

export function closureBudget(limits) {
  const report = { used: { rows: 0, bytes: 0 }, failure: null };
  return { report, admit(value) {
    if (report.failure) fail('reconsideration-closure-budget', 'The closure allowance remains exhausted.');
    const amounts = { rows: 1, bytes: canonicalJsonBytes(value).length };
    for (const [counter, limit] of [['rows', 'maxRows'], ['bytes', 'maxBytes']]) {
      if (amounts[counter] > limits[limit] - report.used[counter]) {
        report.failure = { code: 'reconsideration-closure-budget', counter, limit,
          used: report.used[counter], requested: amounts[counter] };
        fail('reconsideration-closure-budget', `Retained proof exceeds ${limit}.`);
      }
    }
    report.used.rows += 1; report.used.bytes += amounts.bytes;
    return value;
  } };
}

export function originalPair(input, budget) {
  const source = { commit: input.before.commit, tree: input.before.tree };
  const matches = [];
  for (const pair of input.evidence.assessmentCaptures) {
    budget.charge('validationSteps', 1, 'reconsideration-original-pair-selection');
    if (pair.registry.capture.file === repoPath(input.before.kitPath, 'subjects/registry.yaml')
      && same(pair.registry.capture.source, source)) matches.push(pair);
  }
  requireThat(matches.length === 1, 'reconsideration-original-before-pair', 'Retain the actual original pair exactly once.');
  const pair = matches[0];
  requireThat(pair.identity.capture.file === repoPath(input.before.kitPath, '_identity.yaml')
    && same(pair.identity.capture.source, source), 'reconsideration-original-before-pair', 'Both original authorities must name the same actual before source.');
  return pair;
}

export function actualFiles(input, snapshots, budget) {
  const captures = new Map(), materialized = new Set();
  const capture = (commit, file) => {
    budget.charge('validationSteps', 1, 'reconsideration-source-lookup');
    const id = JSON.stringify([commit, file]);
    if (!captures.has(id)) {
      const actual = captureCommittedFile({ repoRoot: input.repoRoot, commit, file });
      budget.admitCapture(actual); captures.set(id, actual);
    }
    return captures.get(id);
  };
  const current = (side, file) => {
    const actual = capture(input[side].commit, file);
    const id = JSON.stringify([side, file]);
    if (!materialized.has(id)) {
      const path = join(snapshots[side].root, file), stat = lstatSync(path);
      requireThat(stat.isFile() && (stat.mode & 0o777) === (parseInt(actual.mode, 8) & 0o777),
        'reconsideration-file-membership', 'Materialized files must retain actual regular Git modes.');
      const raw = { bytes: readFileSync(path) }; budget.admitCapture(raw);
      requireThat(raw.bytes.equals(actual.bytes), 'reconsideration-file-membership', 'Materialized bytes must equal the actual commit.');
      materialized.add(id);
    }
    return actual;
  };
  return { capture, current, pair(file) {
    const before = current('before', file), candidate = current('candidate', file);
    requireThat(before.mode === candidate.mode, 'reconsideration-file-mode-changed', 'Authority and owner modes must remain unchanged.');
    return { before, candidate };
  } };
}

export function evidenceMembership(input, files, budget, closure, section) {
  const matchingSides = new Map();
  const prove = supplied => {
    budget.charge('validationSteps', 1, 'reconsideration-evidence-membership');
    const locator = supplied.capture;
    let matches;
    if (locator.source) {
      const actual = files.capture(locator.source.commit, locator.file);
      requireThat(same(actual.locator, locator) && actual.objectFormat === supplied.objectFormat && actual.bytes.equals(supplied.bytes),
        'reconsideration-evidence-source', 'Supplied source evidence must equal actual committed full-file bytes and locator.');
      matches = [{ side: null, ...observed(actual) }];
    } else {
      matches = [];
      for (const side of sides) {
        const actual = files.current(side, locator.file);
        if (same(content(actual.locator), locator) && actual.objectFormat === supplied.objectFormat && actual.bytes.equals(supplied.bytes)) {
          matches.push({ side, ...observed(actual) });
        }
      }
      requireThat(matches.length > 0, 'reconsideration-evidence-correspondence', 'Source-less evidence must correspond to an actual current side.');
    }
    matchingSides.set(supplied, matches.map(row => row.side));
    section.rows.push(closure.admit({ capture: locator, objectFormat: supplied.objectFormat,
      basis: locator.source ? 'declared-source' : 'current-correspondence', matches }));
  };
  for (const capture of input.evidence.decisionCaptures) prove(capture);
  for (const pair of input.evidence.assessmentCaptures) {
    prove(pair.registry); prove(pair.identity);
    if (!pair.registry.capture.source || !pair.identity.capture.source) {
      const correspondence = capture => capture.capture.source
        ? sides.filter(side => same(capture.capture.source, { commit: input[side].commit, tree: input[side].tree }))
        : matchingSides.get(capture);
      requireThat(correspondence(pair.registry).some(side => correspondence(pair.identity).includes(side)),
        'reconsideration-assessment-side', 'Assessment authorities with source-less evidence must correspond to the same actual side.');
    }
  }
  for (const capture of input.evidence.materialCaptures) prove(capture);
  section.status = 'passed';
}

export function ownerCensus(input, models, files, budget, closure, section) {
  const bySide = {};
  for (const side of sides) {
    const model = models[side], rows = [], parsedFiles = new Map();
    const kinds = RECORD_KINDS.filter(kind => model.stores[stores[kind]]?.present);
    for (const kind of kinds) {
      budget.charge('validationSteps', model[maps[kind]].size + model.proposals[kind].size, 'reconsideration-owner-population');
    }
    const owners = kinds.length ? [...iterateCurrentRecords(model, { kinds }), ...iterateProposalRecords(model, { kinds })] : [];
    const present = new Set(owners.map(key));
    for (const kind of kinds) {
      const catalog = model.stores[stores[kind]].catalog;
      budget.guard(catalog, 'reconsideration-owner-catalog');
      for (const declaration of catalog?.entries ?? []) {
        budget.charge('validationSteps', 1, 'reconsideration-owner-declaration');
        // Covers proposal declarations too. Retired identity resolution does
        // not reveal a pending catalog declaration, so check it explicitly.
        requireThat(present.has(JSON.stringify([model.identity.namespace, kind, declaration.id])),
          'reconsideration-owner-coverage', 'Every catalog-declared owner requires a stored payload, including pending declarations.');
      }
    }
    for (const allocation of model.identity.allocations) {
      budget.charge('validationSteps', 1, 'reconsideration-owner-allocation-coverage');
      if (!RECORD_KINDS.includes(allocation.kind)) continue;
      const ref = { namespace: model.identity.namespace, kind: allocation.kind, id: allocation.id };
      if (present.has(key({ ref }))) continue;
      const resolution = resolveRecord(model.identityIndex, ref,
        { documentBudget: budget.documentBudget, phase: 'reconsideration-owner-missing-resolution' });
      section.unavailable.push(closure.admit({ side, ref, resolution: resolution.status }));
      requireThat(['missing', 'retired'].includes(resolution.status),
        'reconsideration-owner-coverage', 'Only undeclared permanent occupancy may remain without an inspected payload.');
    }
    for (const row of owners) {
      budget.charge('validationSteps', 1, 'reconsideration-owner-visit');
      const ref = row.ref ?? row.proposalRef, file = repoPath(input[side].kitPath, row.entry.file);
      const actual = files.current(side, file), parseKey = JSON.stringify([ref.kind, file]);
      if (!parsedFiles.has(parseKey)) {
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(actual.bytes); }
        catch (error) {
          if (error.code !== 'ERR_ENCODING_INVALID_ENCODED_DATA') throw error;
          fail('reconsideration-owner-encoding', 'Stored owners require strict UTF-8.');
        }
        const parsed = parseRecordFile({ kind: ref.kind, file: row.entry.file, text, documentBudget: budget.documentBudget });
        requireThat(parsed.ok, 'reconsideration-owner-structure', 'The entire stored owner file must pass its schema.');
        const indexed = new Map();
        for (const occurrence of parsed.occurrences) {
          budget.charge('validationSteps', 1, 'reconsideration-owner-occurrence');
          const id = occurrence.entry.record.id;
          requireThat(!indexed.has(id), 'reconsideration-owner-occurrence', 'Duplicate stored record identities cannot be hidden.');
          indexed.set(id, occurrence);
        }
        parsedFiles.set(parseKey, indexed);
      }
      const occurrence = parsedFiles.get(parseKey).get(ref.id ?? ref.key);
      const resolved = row.ref ? resolveRecord(model.identityIndex, ref,
        { documentBudget: budget.documentBudget, phase: 'reconsideration-owner-resolution' }) : null;
      requireThat(occurrence && same(occurrence.entry, row.entry)
        && (!row.ref || (['loaded', 'retired'].includes(resolved.status) && same(resolved.entry, occurrence.entry))),
      'reconsideration-owner-occurrence', 'Actual whole-file occurrence must equal its loaded and indexed owner.');
      const assignments = readAssignments(row.entry);
      requireThat(assignments.state !== 'invalid', 'reconsideration-owner-assignments', 'Malformed assignments cannot be treated as empty.');
      requireThat(assignments.state !== 'known' || !assignments.ids.includes(input.operation.subject),
        'reconsideration-fresh-subject-assigned', 'Fresh reconsidered Subjects cannot already be assigned to any stored owner.');
      rows.push({ ...ownerRef(row), locator: occurrence.locator, assignments, lifecycle: recordLifecycleState(row),
        resolution: resolved?.status ?? 'proposal', actual });
    }
    bySide[side] = new Map(rows.map(row => [key(row), row]));
  }
  requireThat(bySide.before.size === bySide.candidate.size, 'reconsideration-owner-universe', 'Stored owner universes must remain equal.');
  for (const [id, before] of bySide.before) {
    budget.charge('validationSteps', 1, 'reconsideration-owner-preservation');
    const candidate = bySide.candidate.get(id);
    const { actual: original, ...state } = before;
    const { actual: next, ...nextState } = candidate ?? {};
    requireThat(candidate && same(state, nextState) && original.mode === next.mode && original.bytes.equals(next.bytes)
      && same(content(original.locator), content(next.locator)), 'reconsideration-owner-changed', 'Every stored owner and entire containing file must remain exact.');
    section.records.push(closure.admit({ ...state, before: observed(original), candidate: observed(next) }));
    if (state.assignments.state === 'unknown') section.unknownAssignments.push(closure.admit(ownerRef(before)));
  }
  section.status = 'passed';
}

export function wireEnvelope(input) {
  const fields = (value, names) => {
    requireThat(value && [Object.prototype, null].includes(Object.getPrototypeOf(value))
      && Reflect.ownKeys(value).length === names.length, 'invalid-subject-reconsideration-input', 'Supply the fixed own-data wire fields.');
    const result = {};
    for (const key of names) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      requireThat(field?.enumerable && Object.hasOwn(field, 'value'),
        'invalid-subject-reconsideration-input', 'Wire fields must be own enumerable data.');
      result[key] = field.value;
    }
    return result;
  };
  const outer = fields(input, ['repoRoot', 'gateInput']);
  const wire = fields(outer.gateInput, ['version', 'before', 'candidate', 'operation', 'limits', 'evidence', 'impact']);
  requireThat(wire.version === 1, 'invalid-subject-reconsideration-input', 'Unsupported reconsideration wire version.');
  delete wire.version;
  return { repoRoot: outer.repoRoot, ...wire };
}

export function gateProjection(rawInput, budget) {
  const keys = ['repoRoot', 'before', 'candidate', 'operation', 'evidence', 'limits', 'impact'];
  requireThat(rawInput && [Object.prototype, null].includes(Object.getPrototypeOf(rawInput))
    && Reflect.ownKeys(rawInput).length === keys.length,
  'invalid-reconsideration-gate-input', 'Supply the fixed seven own-data gate fields.');
  const fields = {};
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(rawInput, key);
    requireThat(field?.enumerable && Object.hasOwn(field, 'value'),
      'invalid-reconsideration-gate-input', 'Gate fields must be own enumerable data.');
    fields[key] = field.value;
  }
  budget.guard(fields.impact, 'reconsideration-gate-impact-input');
  const impact = structuredClone(fields.impact);
  const closed = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
    && Reflect.ownKeys(value).length === names.length && names.every(key => Object.hasOwn(value, key));
  const limits = (value, names, version = false) => closed(value, version ? ['version', ...names] : names)
    && (!version || value.version === 1) && names.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0);
  const validation = ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits', 'maxSubjects', 'maxHistoryRows', 'maxValidationSteps'];
  const corpus = ['maxCanonicalRecords', 'maxAuthoredRecords', 'maxSubjects', 'maxHierarchyDepth', 'maxHistoryEvents',
    'maxHistoryRows', 'maxAssignmentsPerRecord', 'maxAssignments', 'maxBodyBytesPerRecord'];
  requireThat(closed(impact, ['version', 'contexts', 'reach', 'views', 'tree', 'replays', 'query', 'closure']) && impact.version === 1
    && closed(impact.contexts, ['before', 'after']) && ['before', 'after'].every(side => {
      const value = impact.contexts[side];
      return closed(value, ['version', 'maxSourceBytes', 'maxSingleCaptureBytes', 'maxOutputBytes', 'validation', 'corpus'])
        && limits({ version: value.version, maxSourceBytes: value.maxSourceBytes, maxSingleCaptureBytes: value.maxSingleCaptureBytes,
          maxOutputBytes: value.maxOutputBytes }, ['maxSourceBytes', 'maxSingleCaptureBytes', 'maxOutputBytes'], true)
        && limits(value.validation, validation) && limits(value.corpus, corpus);
    }) && limits(impact.reach, ['maxHierarchyNodes', 'maxHierarchyEdges', 'maxRecords'])
    && limits(impact.views, ['maxViews'], true) && closed(impact.tree, ['budget', 'maxBytes'])
    && limits(impact.tree.budget, ['nodes', 'edges', 'rows']) && limits({ maxBytes: impact.tree.maxBytes }, ['maxBytes'])
    && limits(impact.replays, ['maxSubjects', 'maxEligibilityRedirects', 'maxQualificationRedirects', 'maxCases', 'maxInventoryBytes'], true)
    && limits(impact.query, ['maxAstNodes', 'maxAstDepth', 'maxHierarchyNodes', 'maxHierarchyEdges', 'maxRedirects',
      'maxRecords', 'maxPredicateSteps', 'maxResultsPerStore', 'maxExplanationNodes'], true)
    && impact.query.maxAstNodes > 0 && impact.query.maxAstDepth > 0 && limits(impact.closure, ['maxRows', 'maxBytes']),
  'invalid-reconsideration-gate-limits', 'Supply every explicit fixed impact capacity.');
  delete fields.impact;
  return { input: fields, impact };
}
