/** Fixed internal Subject transition cores; never caller-supplied policy or proof. */
import { isDeepStrictEqual as same } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalSha256, canonicalJsonBytes } from './canonical-json.js';
import { readCommittedTree } from './commit-snapshot.js';
import { captureCommittedFile } from './captured-source.js';
import { validateSubjectGovernanceCapture, evaluateSubjectGovernance, subjectEligibility } from './subject-governance.js';
import { getSubjectValidationBudget } from './subject-validation-budget.js';
import { verifyLifecycleEvidenceSources } from './subject-lifecycle-context.js';
import { createSubjectValidationBudget } from './subject-validation-budget.js';
import { SubjectError } from './subjects.js';
import { inspectSubjectUses, inspectContinuedSubjectUses } from './subject-use-inventory.js';
import { iterateCurrentRecords, RECORD_KINDS, parseCanonicalId } from './record-identity.js';
import { recordLifecycleState } from './record-lifecycle.js';
import { rethrowIfBug } from './engine-refusal.js';

const recordKey = (row) => canonicalSha256(row.ref ?? row.proposalRef);
const state = ({ id, changes, ...value }) => value;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const repoPath = (kitPath, file) => kitPath === '.' ? file : `${kitPath}/${file}`;
const semanticCapture = ({ source, ...capture }) => capture;

/** Logical retained rows/UTF-8 JSON only; native Git I/O, parsing and allocation are excluded. */
function createClosureBudget(limits, retirement) {
  const code = retirement ? 'retirement-closure-budget' : 'merge-closure-budget';
  const label = retirement ? 'Retirement' : 'Merge';
  if (!limits || Object.keys(limits).length !== 2 || !['maxRows', 'maxBytes'].every((key) =>
    Number.isSafeInteger(limits[key]) && limits[key] >= 0)) {
    throw new SubjectError(`invalid-${code}`, 'Supply explicit closure row and canonical-byte capacities.');
  }
  const report = { used: { rows: 0, bytes: 0 }, failure: null };
  const admit = (row) => {
    if (report.failure) throw new SubjectError(report.failure.code, `${label} closure allowance remains exhausted.`);
    const requested = { rows: 1, bytes: canonicalJsonBytes(row).length };
    for (const [counter, limit] of [['rows', 'maxRows'], ['bytes', 'maxBytes']]) {
      if (requested[counter] > limits[limit] - report.used[counter]) {
        report.failure = { code, limit, used: report.used[counter], requested: requested[counter] };
        throw new SubjectError(report.failure.code, `${label} closure exceeds ${limit}.`);
      }
    }
    report.used.rows += requested.rows; report.used.bytes += requested.bytes;
  };
  return { report, admit };
}

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const refTuple = (ref) => JSON.stringify([ref.namespace, ref.kind, ref.id]);
const inheritedKey = (row) => JSON.stringify([row.ref?.namespace, row.ref?.kind, row.ref?.id, row.assignedSubject]);
const parentKey = (row) => JSON.stringify([row.child, row.parent]);
const sameKeys = (rows, requests, key) => new Set(requests.map(key)).size === requests.length
  && same(rows.map(key).sort(compare), requests.map(key).sort(compare));

/** Retirement-only closure; all models and inventories were independently read above. */
function inspectRetirementClosure({ input, result, models, oldRecords, newRecords, budget, append }) {
  const { operation } = input; const subject = operation.subject; const closure = result.authoredReferenceClosure;
  const refusal = (code, message, details = {}) => ({ code, message, details });
  const useRows = (side, kind) => result.inventory.uses.filter((row) => row.side === side && row.kind === kind && row.subject === subject);
  const allocated = (row, side) => row.ref && RECORD_KINDS.includes(row.ref.kind)
    && models[side].identity.allocations.some((allocation) => allocation.kind === row.ref.kind
      && allocation.id === row.ref.id && allocation.state === 'allocated');
  const beforeByRef = new Map(oldRecords.map((row) => [recordKey(row), row]));
  const direct = useRows('before', 'direct-assignment');
  const nextDirect = useRows('candidate', 'direct-assignment');
  for (const [side, rows] of [['before', direct], ['candidate', nextDirect]]) {
    if (rows.some((row) => !allocated(row, side) || !['effective', 'non-effective'].includes(row.lifecycle.state))) {
      return refusal('retirement-source-use-unsupported', 'Direct source uses require actual allocated canonical owners with known lifecycle.', { side });
    }
  }
  const effective = direct.filter(({ lifecycle }) => lifecycle.state === 'effective');
  const historical = direct.filter(({ lifecycle }) => lifecycle.state === 'non-effective');
  if (effective.length === 0 ? operation.assignmentEvent !== null : operation.assignmentEvent == null) {
    return refusal('retirement-assignment-event-intent', 'A null assignment event is required exactly when no effective direct source uses exist.');
  }
  if (!sameKeys(historical, operation.retainedHistoricalUses, (row) => refTuple(row.ref))
    || !sameKeys(nextDirect, historical, (row) => refTuple(row.ref))) {
    return refusal('retirement-retained-historical-scope', 'Reviewed historical rows and candidate direct uses must equal the exact prior inactive canonical set.');
  }
  for (const use of historical.sort((a, b) => compare(refTuple(a.ref), refTuple(b.ref)))) {
    const beforeRecord = beforeByRef.get(recordKey(use)); const candidateRecord = newRecords.get(recordKey(use));
    if (!candidateRecord || !same(beforeRecord.assignments, candidateRecord.assignments)
      || !same(beforeRecord.locator, candidateRecord.locator) || !same(beforeRecord.lifecycle, candidateRecord.lifecycle)
      || beforeRecord.resolution !== candidateRecord.resolution
      || !same(semanticCapture(beforeRecord.capture), semanticCapture(candidateRecord.capture))) {
      return refusal('retirement-retained-historical-changed', 'Historical owners retain their exact assignments, occurrence, lifecycle and full source file.', { ref: use.ref });
    }
    const captures = ['before', 'candidate'].map((side) => captureCommittedFile({ repoRoot: input.repoRoot,
      commit: input[side].descriptor.commit, file: beforeRecord.capture.file }));
    for (const captured of captures) budget.admitCapture(captured);
    if (!captures[0].bytes.equals(captures[1].bytes) || captures[0].mode !== captures[1].mode) {
      return refusal('retirement-retained-historical-changed', 'Historical owner files and modes must remain wholly unchanged.', { ref: use.ref });
    }
    const request = operation.retainedHistoricalUses.find(({ ref }) => same(ref, use.ref));
    append(closure.retainedHistoricalUses, { ref: structuredClone(use.ref), reason: request.reason, beforeRecord, candidateRecord });
  }
  for (const use of effective.sort((a, b) => compare(refTuple(a.ref), refTuple(b.ref)))) {
    const before = beforeByRef.get(recordKey(use)); const after = newRecords.get(recordKey(use));
    const expected = { state: 'known', ids: before.assignments.ids.filter((id) => id !== subject) };
    if (!after || !allocated(after, 'candidate') || !same(after.assignments, expected)
      || !same(before.lifecycle, after.lifecycle) || !same(before.locator, after.locator) || before.resolution !== after.resolution) {
      return refusal('retirement-assignment-substitution', 'Withdraw only the retired source ID, preserving known state, other ID order, effective lifecycle and owner.', { ref: use.ref });
    }
    append(result.assignments, { ref: structuredClone(use.ref), after: expected });
  }
  const references = result.inventory.uses.filter((row) => row.kind === 'registry-reference'
    && (row.source === subject || row.target === subject));
  if (references.some((row) => row.type === 'association'
    || (['redirect', 'successor'].includes(row.type) && row.target === subject))) {
    return refusal('retirement-graph-use-unsupported', 'Incident associations and inbound redirects or successors remain unsupported.');
  }
  const parents = (side) => references.filter((row) => row.side === side && row.type === 'parent');
  const endpoints = (row) => ({ child: row.source, parent: row.target });
  const oldParents = parents('before'); const nextParents = parents('candidate');
  if (oldParents.some((row) => ![row.source, row.target].every((id) => parseCanonicalId('subject', id).ok))
    || !sameKeys(oldParents.map(endpoints), operation.retainedParents, parentKey)
    || !sameKeys(nextParents.map(endpoints), operation.retainedParents, parentKey)) {
    return refusal('retirement-retained-parent-scope', 'Review exactly the unchanged incident canonical parent-edge set on both sides.');
  }
  for (const request of operation.retainedParents) {
    const beforeWitness = oldParents.find((row) => same(endpoints(row), { child: request.child, parent: request.parent }));
    const candidateWitness = nextParents.find((row) => same(endpoints(row), { child: request.child, parent: request.parent }));
    if (beforeWitness.locator !== candidateWitness.locator
      || candidateWitness.declaredStatus !== (request.child === subject ? 'retired' : beforeWitness.declaredStatus)) {
      return refusal('retirement-retained-parent-changed', 'Retained edges keep their exact occurrence and all statuses except the retired source.');
    }
    append(closure.retainedParents, { child: request.child, parent: request.parent, reason: request.reason, beforeWitness, candidateWitness });
  }
  const oldInherited = useRows('before', 'inherited-assignment'); const nextInherited = useRows('candidate', 'inherited-assignment');
  for (const [side, rows] of [['before', oldInherited], ['candidate', nextInherited]]) {
    if (rows.some((row) => !allocated(row, side) || !['effective', 'non-effective'].includes(row.lifecycle.state)
      || !parseCanonicalId('subject', row.assignedSubject).ok)) {
      return refusal('retirement-inherited-use-unsupported', 'Inherited source uses require actual canonical owners and descendants with known lifecycle.', { side });
    }
  }
  const oldWitnesses = new Map(oldInherited.map((row) => [inheritedKey(row), row]));
  const nextWitnesses = new Map(nextInherited.map((row) => [inheritedKey(row), row]));
  const union = new Map([...oldWitnesses, ...nextWitnesses]);
  if (!sameKeys([...union.values()], operation.retainedInheritedUses, inheritedKey)) {
    return refusal('retirement-retained-inherited-scope', 'Reviewed inherited rows must equal the complete actual before/candidate witness union.');
  }
  const selected = new Set(effective.map(recordKey));
  for (const request of operation.retainedInheritedUses) {
    const beforeWitness = oldWitnesses.get(inheritedKey(request)) ?? null;
    const candidateWitness = nextWitnesses.get(inheritedKey(request));
    const beforeRecord = beforeByRef.get(recordKey(request)); const candidateRecord = newRecords.get(recordKey(request));
    if (!candidateWitness || !beforeRecord || !candidateRecord
      || !same(beforeRecord.lifecycle, candidateRecord.lifecycle) || !same(beforeRecord.locator, candidateRecord.locator)
      || beforeRecord.resolution !== candidateRecord.resolution
      || beforeRecord.assignments.state !== 'known' || candidateRecord.assignments.state !== 'known'
      || !beforeRecord.assignments.ids.includes(request.assignedSubject) || !candidateRecord.assignments.ids.includes(request.assignedSubject)
      || (!selected.has(recordKey(request)) && !same(beforeRecord.assignments, candidateRecord.assignments))
      || (beforeWitness && !same(beforeWitness.path, candidateWitness.path))) {
      return refusal('retirement-retained-inherited-changed', 'Each inherited use keeps its original owner, descendant membership and path; disappearing or unexplained uses refuse.', { ref: request.ref });
    }
    if (!beforeWitness && (!selected.has(recordKey(request)) || !beforeRecord.assignments.ids.includes(subject))) {
      return refusal('retirement-inherited-exposure-unexplained', 'A missing before witness requires actual direct-source suppression and the selected exact withdrawal.', { ref: request.ref });
    }
    append(closure.retainedInheritedUses, { ref: structuredClone(request.ref), assignedSubject: request.assignedSubject,
      reason: request.reason, beforeRecord, candidateRecord, beforeWitness, candidateWitness,
      disposition: beforeWitness ? 'retained' : 'exposed-by-direct-withdrawal' });
  }
  return null;
}

/**
 * INTERNAL: contexts/roots are constructed by P8's fixed verified snapshot adapter.
 * This result is never a public gate input or a publication/approval capability.
 */
export function inspectEquivalentMergeAssignmentScope(input) { return inspectTransition(input, false); }
export function inspectSubjectRetirementAssignmentScope(input) { return inspectTransition(input, true); }
export function inspectContinuedRetirementAssignmentScope(input, { operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  return inspectTransition(input, true, budget);
}

export function inspectContinuedMergeAssignmentScope(input, { operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  return inspectTransition(input, false, budget);
}

async function inspectTransition(input, retirement, continuedBudget = null) {
  const result = { version: 1, ok: false, inputs: null, operation: structuredClone(input.operation),
    registry: null, decision: null,
    authoredReferenceClosure: { status: 'not-performed', semanticCompleteness: 'unknown', affectedRefs: [], retainedUnknowns: [] },
    inventory: null, assignments: [], resources: { governance: null }, diagnostics: [] };
  const budget = continuedBudget ?? createSubjectValidationBudget(input.limits.governance);
  const zeroMerge = !retirement && input.operation.assignmentEvent === null;
  const closure = retirement || zeroMerge ? createClosureBudget(input.limits.closure, retirement) : null;
  if (retirement) Object.assign(result.authoredReferenceClosure, {
    retainedHistoricalUses: [], retainedParents: [], retainedInheritedUses: [],
  });
  if (closure) result.resources.closure = closure.report;
  const append = (rows, row) => { if (closure) closure.admit(row); rows.push(row); };
  const finish = () => { result.resources.governance = { used: budget.used, failure: budget.failure }; return result; };
  const stable = (value) => {
    if (typeof value === 'string') return value.replaceAll(input.before.root, '<before>')
      .replaceAll(input.candidate.root, '<candidate>').replaceAll(input.repoRoot, '<repository>');
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
    return value;
  };
  const fail = (code, message, details = {}) => {
    result.diagnostics.push(stable({ code: retirement ? code.replace(/^merge-/, 'retirement-') : code,
      path: retirement ? 'retirementScope' : 'mergeScope', message, ...details })); return finish();
  };
  const { operation } = input; const sourceId = retirement ? operation.subject : operation.absorbed[0]; const survivorId = operation.survivor;
  const models = {}; const captures = {}; const governed = {};
  try {
    for (const side of ['before', 'candidate']) {
      const descriptor = input[side].descriptor;
      const actual = readCommittedTree(input.repoRoot, descriptor.commit);
      if (actual.tree !== descriptor.tree) return fail('merge-tree-mismatch', 'Both trees must equal their actual committed trees.', { side });
      const context = input[side].context; const model = context.model;
      const bound = validateSubjectGovernanceCapture(context.subjectGovernance, { model }, continuedBudget ? { operationBudget: budget } : {});
      if (!bound.ok) return fail('merge-context-mismatch', 'The actual snapshot context must retain its own governance binding.', { side, diagnostics: bound.diagnostics });
      models[side] = model;
      const file = repoPath(descriptor.kitPath, 'subjects/registry.yaml');
      const captured = captureCommittedFile({ repoRoot: input.repoRoot, commit: descriptor.commit, file });
      budget.admitCapture(captured);
      const path = join(input[side].root, file); const bytes = readFileSync(path);
      if (!captured.bytes.equals(bytes) || (lstatSync(path).mode & 0o777) !== (Number.parseInt(captured.mode, 8) & 0o777)) {
        return fail('merge-registry-membership', 'Materialized registry bytes and mode must match the actual committed source.', { side });
      }
      captures[side] = captured;
      const evaluated = continuedBudget ? { ok: true, governance: context.subjectGovernance } : evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
        identityIndex: model.identityIndex, ...input.evidence }, { operationBudget: budget });
      if (!evaluated.ok) return fail('merge-governance-unavailable', 'Actual registry history must validate under the shared governance capacity.', { side, diagnostics: evaluated.diagnostics });
      governed[side] = evaluated.governance;
    }
    result.inputs = { before: structuredClone(input.before.descriptor), candidate: structuredClone(input.candidate.descriptor) };
    if (result.inputs.before.kitPath !== result.inputs.candidate.kitPath || !same(models.before.identity, models.candidate.identity)) {
      return fail('merge-installation-changed', retirement ? 'Retirement preserves the complete identity ledger and kit path.' : 'Merge preserves the complete identity ledger and kit path.');
    }
    if (retirement && captures.before.mode !== captures.candidate.mode) {
      return fail('retirement-registry-mode-changed', 'Retirement preserves the actual registry file mode.');
    }
    const prior = models.before.subjectRegistry.document; const next = models.candidate.subjectRegistry.document;
    if (prior.namespace !== next.namespace || next.revision !== prior.revision + 1 || next.hierarchyRevision !== prior.hierarchyRevision
      || next.history.length !== prior.history.length + 1 || !same(next.history.slice(0, prior.history.length), prior.history)) {
      return fail('merge-registry-suffix', retirement ? 'Retirement appends exactly one event and registry revision, preserving old history and hierarchy revision.' : 'First merge appends exactly one event and one registry revision, preserving all old history and hierarchy revision.');
    }
    const event = next.history.at(-1); const { review, ...body } = event;
    const actualEvents = [{ id: event.id, changeDigest: canonicalSha256(body) }];
    if (event.action !== (retirement ? 'retire' : 'merge-equivalent') || !text(event.reason) || !same(actualEvents, operation.registryEvents)
      || review.changeDigest !== actualEvents[0].changeDigest || prior.history.some(({ id }) => id === event.id)) {
      return fail('merge-event-mismatch', retirement ? 'The exact fresh plain-retire event must equal the requested ordered suffix.' : 'The exact fresh reviewed merge event must equal the requested ordered suffix.');
    }
    const oldSource = prior.subjects.find(({ id }) => id === sourceId); const oldSurvivor = prior.subjects.find(({ id }) => id === survivorId);
    const participants = retirement ? [sourceId] : [sourceId, survivorId];
    if (oldSource?.status !== 'active' || (!retirement && (oldSurvivor?.status !== 'active' || sourceId === survivorId))
      || !participants.every((id) => models.before.identity.allocations.some((row) => row.kind === 'subject' && row.id === id && row.state === 'allocated'))) {
      return fail('merge-participant-ineligible', retirement ? 'The source must be an existing allocated active canonical meaning.' : 'Both distinct existing canonical participants must be allocated active meanings.');
    }
    const expectedStates = retirement
      ? new Map([[sourceId, { ...state(oldSource), status: 'retired', retirement: { kind: 'retire' } }]])
      : new Map([[sourceId, { ...state(oldSource), status: 'retired', retirement: { kind: 'equivalent-merge', redirect: survivorId } }],
        [survivorId, state(oldSurvivor)]]);
    if (event.rows.length !== participants.length || new Set(event.rows.map(({ id }) => id)).size !== participants.length
      || event.rows.some((row) => !expectedStates.has(row.id)
        || !same(row.before, state(row.id === sourceId ? oldSource : oldSurvivor)) || !same(row.after, expectedStates.get(row.id))
        || (row.id === survivorId && !text(row.reason)))) {
      return fail('merge-meaning-changed', retirement ? 'Retire only the source without redirect or successor, retaining its exact prior meaning.' : 'Retire only the source to the exact survivor; retain all meaning and the explicit survivor carry-forward reason.');
    }
    const expectedSubjects = prior.subjects.map((row) => expectedStates.has(row.id)
      ? { id: row.id, ...expectedStates.get(row.id), changes: [...row.changes, event.id] } : row);
    if (!same(next, { ...prior, revision: prior.revision + 1, subjects: expectedSubjects, history: [...prior.history, event] })) {
      return fail('merge-unrelated-registry-change', 'All registry fields, participants and nonparticipants must match this exact one-event transition.');
    }
    for (const side of ['before', 'candidate']) for (const id of participants) {
      const outcome = subjectEligibility(governed[side], id, { purpose: 'query', policy: side === 'candidate' ? retirement ? 'historical' : 'equivalent' : 'current',
        budget: { redirects: 1 }, operationBudget: budget });
      const expectedId = !retirement && side === 'candidate' && id === sourceId ? survivorId : id;
      if (outcome.eligible !== true || outcome.verification !== 'verified' || outcome.resolution.id !== expectedId) {
        return fail('merge-participant-evidence', retirement ? 'The source requires verified current-before and historical-candidate eligibility with unchanged identity.' : 'Both actual participant histories require verified eligibility and the exact survivor mapping.', { side, id, outcome });
      }
    }
    result.registry = { file: captures.candidate.locator.file, beforeCapture: captures.before.locator,
      candidateCapture: captures.candidate.locator, events: actualEvents };
    const authorizers = {};
    for (const side of ['before', 'candidate']) {
      const row = iterateCurrentRecords(models[side], { kinds: ['decision'] }).find(({ ref }) => same(ref, event.decision));
      if (!row || recordLifecycleState(row).state !== 'effective') return fail('merge-authorizer-unavailable', 'The shared actual Decision must remain effective.', { side });
      const captured = captureCommittedFile({ repoRoot: input.repoRoot, commit: input[side].descriptor.commit,
        file: repoPath(input[side].descriptor.kitPath, row.entry.file) });
      budget.admitCapture(captured); authorizers[side] = captured;
      if (canonicalSha256(row.entry.record) !== review.decisionDigest
        || !same(semanticCapture(captured.locator), semanticCapture(review.decisionCapture))) {
        return fail('merge-authorizer-changed', 'Current protected Decision content and retained reviewed capture must agree exactly.', { side });
      }
    }
    if (!authorizers.before.bytes.equals(authorizers.candidate.bytes) || authorizers.before.mode !== authorizers.candidate.mode) {
      return fail('merge-authorizer-changed', 'The actual authorizer file and mode remain unchanged.');
    }
    // Zero retirement has no P8 event pipeline to verify a declared historical
    // source. Byte integrity and current-file equality do not prove that pair.
    if (retirement && review.decisionCapture.source) {
      const historical = captureCommittedFile({ repoRoot: input.repoRoot,
        commit: review.decisionCapture.source.commit, file: review.decisionCapture.file });
      budget.admitCapture(historical);
      if (!same(historical.locator, review.decisionCapture)) {
        return fail('retirement-authorizer-source', 'Decision source membership differs from its declared locator.');
      }
    }
    result.decision = { ref: event.decision, reference: review.reference, acceptedStatus: review.acceptedStatus,
      decisionDigest: review.decisionDigest, decisionCapture: review.decisionCapture };
    const subjects = [...new Set([...prior.subjects, ...next.subjects].map(({ id }) => id))].sort();
    if (continuedBudget) verifyLifecycleEvidenceSources({ repoRoot: input.repoRoot, before: input.before, candidate: input.candidate,
      evidence: input.evidence, operationBudget: budget });
    const inventoryInput = { repoRoot: input.repoRoot, ...result.inputs, subjects, evidence: input.evidence,
      limits: input.limits.inventory, impactPolicy: { required: [], requiredExtensions: [] } };
    const inventory = await (continuedBudget ? inspectContinuedSubjectUses(inventoryInput, { operationBudget: budget }) : inspectSubjectUses(inventoryInput));
    result.inventory = inventory;
    if (!['complete', 'incomplete'].includes(inventory.status) || ['before', 'candidate'].some((side) => {
      const coverage = inventory.coverage[side];
      return !coverage || ['records', 'registry', 'hierarchy'].some((key) => coverage[key] !== 'complete')
        || inventory.inputs[side]?.registryDigest !== canonicalSha256(models[side].subjectRegistry.document)
        || inventory.inputs[side]?.identityDigest !== canonicalSha256(models[side].identity);
    }) || inventory.potentialUses.some((row) => row.reason !== 'unknown-assignments')) {
      return fail('merge-inventory-incomplete', 'Complete actual authored-reference inspection is required; only explicit unchanged absence may remain unknown.');
    }
    const oldRecords = inventory.records.filter(({ side }) => side === 'before');
    const newRecords = new Map(inventory.records.filter(({ side }) => side === 'candidate').map((row) => [recordKey(row), row]));
    const unknowns = oldRecords.filter(({ assignments }) => assignments.state === 'unknown');
    const requests = new Map(operation.retainedUnknowns.map((row) => [recordKey(row), row]));
    const afterUnknowns = [...newRecords.values()].filter(({ assignments }) => assignments.state === 'unknown');
    if (requests.size !== operation.retainedUnknowns.length || requests.size !== unknowns.length || afterUnknowns.length !== unknowns.length
      || unknowns.some((row) => !requests.has(recordKey(row))) || afterUnknowns.some((row) => !requests.has(recordKey(row)))) {
      return fail('merge-retained-unknown-scope', 'Disposition rows must equal the exact absent-field owner set on both sides.');
    }
    for (const before of unknowns) {
      const after = newRecords.get(recordKey(before));
      if (!after || !same(before.assignments, { state: 'unknown', reason: 'absent' }) || !same(before.assignments, after.assignments)
        || !same(before.locator, after.locator) || !same(semanticCapture(before.capture), semanticCapture(after.capture))
        || !same(before.lifecycle, after.lifecycle) || before.lifecycle.state === 'unknown'
        || !['loaded', 'proposal'].includes(before.resolution) || before.resolution !== after.resolution) {
        return fail('merge-retained-unknown-changed', 'Retained unclassified occurrences must preserve the actual absent field, source, supported lifecycle and owner.');
      }
      const captures = ['before', 'candidate'].map((side) => captureCommittedFile({ repoRoot: input.repoRoot,
        commit: input[side].descriptor.commit, file: before.capture.file }));
      if (retirement || zeroMerge || continuedBudget) for (const captured of captures) budget.admitCapture(captured);
      if (!captures[0].bytes.equals(captures[1].bytes) || captures[0].mode !== captures[1].mode) {
        return fail('merge-retained-unknown-changed', 'Whole unknown-owner file bytes and mode remain exact.');
      }
      append(result.authoredReferenceClosure.retainedUnknowns, { ...structuredClone(requests.get(recordKey(before))), before, after });
    }
    if (retirement) {
      const error = inspectRetirementClosure({ input, result, models, oldRecords, newRecords, budget, append });
      if (error) return fail(error.code, error.message, error.details);
      result.authoredReferenceClosure.affectedRefs = result.assignments.map(({ ref }) => ref);
      result.authoredReferenceClosure.status = 'complete';
      if (!unknowns.length) result.authoredReferenceClosure.semanticCompleteness = 'complete';
      result.ok = true; return finish();
    }
    const direct = inventory.uses.filter((row) => row.side === 'before' && row.kind === 'direct-assignment' && row.subject === sourceId);
    if ((!direct.length && !zeroMerge) || direct.some((row) => !row.ref || !RECORD_KINDS.includes(row.ref.kind) || row.lifecycle.state !== 'effective'
      || !models.before.identity.allocations.some((entry) => entry.kind === row.ref.kind && entry.id === row.ref.id && entry.state === 'allocated'))) {
      return fail('merge-source-use-unsupported', 'Merge requires effective allocated canonical K/O/D direct uses only, with at least one changed record.');
    }
    for (const row of inventory.uses.filter((row) => row.side === 'before' && ((row.kind === 'inherited-assignment' && row.subject === sourceId)
      || (row.kind === 'registry-reference' && (row.target === sourceId || (row.type === 'association' && row.source === sourceId)))))) {
      // A prior absorbed meaning keeps its exact redirect; only the active endpoint changes.
      // The complete registry/history comparison above forbids flattening or editing that row.
      const original = prior.subjects.find(({ id }) => id === row.source);
      if (row.kind === 'registry-reference' && row.type === 'redirect' && row.target === sourceId
        && original?.status === 'retired' && original.retirement?.kind === 'equivalent-merge'
        && original.retirement.redirect === sourceId
        && same(original, next.subjects.find(({ id }) => id === row.source))) {
        for (const side of ['before', 'candidate']) {
          const outcome = subjectEligibility(governed[side], row.source, { purpose: 'query', policy: 'equivalent',
            budget: { redirects: side === 'before' ? 1 : 2 }, operationBudget: budget });
          const redirects = [{ from: row.source, to: sourceId },
            ...(side === 'candidate' ? [{ from: sourceId, to: survivorId }] : [])];
          if (outcome.eligible !== true || outcome.verification !== 'verified'
            || outcome.resolution.id !== (side === 'before' ? sourceId : survivorId)
            || !same(outcome.resolution.redirects, redirects)) {
            return fail('merge-redirect-evidence', 'An unchanged prior equivalence redirect requires verified exact before/after chains.',
              { side, id: row.source, outcome });
          }
        }
        continue;
      }
      return fail('merge-graph-use-unsupported', 'First merge admits no inbound, inherited or incident association references to the source.');
    }
    if (zeroMerge && direct.length !== 0) return fail('merge-assignment-event-intent',
      'A null assignment event requires an actually empty direct assignment scope.');
    for (const use of direct) {
      const before = oldRecords.find((row) => recordKey(row) === recordKey(use)); const after = newRecords.get(recordKey(use));
      const ids = before.assignments.ids.includes(survivorId) ? before.assignments.ids.filter((id) => id !== sourceId)
        : before.assignments.ids.map((id) => id === sourceId ? survivorId : id);
      const expected = { state: 'known', ids };
      if (!after || !same(after.assignments, expected) || after.lifecycle.state !== 'effective') {
        return fail('merge-assignment-substitution', 'Candidate assignments must replace source membership exactly and preserve unrelated original order.', { ref: use.ref });
      }
      result.assignments.push({ ref: structuredClone(use.ref), after: expected });
    }
    result.assignments.sort((a, b) => a.ref.id < b.ref.id ? -1 : a.ref.id > b.ref.id ? 1 : 0);
    result.authoredReferenceClosure.affectedRefs = result.assignments.map(({ ref }) => ref);
    result.authoredReferenceClosure.status = 'complete';
    if (!unknowns.length) result.authoredReferenceClosure.semanticCompleteness = 'complete';
    result.ok = true; return finish();
  } catch (error) {
    if (!(error instanceof SubjectError)) rethrowIfBug(error);
    return fail(error.code ?? 'merge-source-unavailable', retirement ? 'Actual retirement evidence could not be examined.' : 'Actual merge evidence could not be examined.', { detail: error.message });
  }
}
