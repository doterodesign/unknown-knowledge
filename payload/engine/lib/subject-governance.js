/** Pure review-evidence evaluation; no file reads or human-approval authentication. */
import { types } from 'node:util';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { isCaptureLocator } from './capture-locator.js';
import { verifyCapturedBytes } from './captured-source.js';
import { verifyDecisionEvidence } from './decision-evidence.js';
import { createSubjectValidationBudget, adaptDocumentBudgetError, selectSubjectValidationBudget, getSubjectValidationBudget } from './subject-validation-budget.js';
import { verifyRefusalAssessment } from './subject-refusal-assessment.js';
import { resolveRecord, getIdentityIndexDescriptor } from './record-identity-index.js';
import { validateIdentityLedger } from './identity-ledger.js';
import { validateSubjectSplitAllocation } from './subject-split-allocation.js';
import { validateSubjectCreationAllocation } from './subject-allocation.js';
import { validateReconsiderationEvent, verifySubjectReconsiderationEvidence } from './subject-reconsideration-evidence.js';
import { isIdentityUuid, parseCanonicalId, parseProposalKey, iterateCurrentRecords,
  recordIdentityMatches, IdentityOperationError } from './record-identity.js';
import { parentEdgeProblem, associationEdgeProblem, associationPair } from './subject-graph-rules.js';
import { SubjectError, indexSubjects, resolveSubject, validateSubjectResolutionOptions } from './subjects.js';

const evaluations = new WeakMap();
const same = (a, b) => canonicalSha256(a) === canonicalSha256(b);
const accepted = (status) => ['accepted', 'addressed'].includes(status);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim() !== '';
const fail = (code, message) => { throw new SubjectError(code, message); };
const stateOf = ({ id, changes, ...state }) => state;
const eventBody = ({ review, ...event }) => event;
const digest = (value) => typeof value === 'string' && /^[0-9a-f]{64}(?![\s\S])$/.test(value);

// Only fixed split composition uses these adapters, after its existing guards.
// Keep native capture failures separate from errors in surrounding validation.
function splitDigest(value) {
  try { return canonicalSha256(value); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new CapturedInputError('Guarded split JSON exceeds native canonical capture capacity.');
  }
}
const splitSame = (a, b) => splitDigest(a) === splitDigest(b);
function splitIndexSubjects(document) {
  try { return indexSubjects(document); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new CapturedInputError('Guarded split registry exceeds native index capture capacity.');
  }
}

function validRef(ref, namespace, kind) {
  return object(ref) && Object.keys(ref).length === 3 && ref.namespace === namespace
    && (!kind || ref.kind === kind) && ['knowledge', 'ontology', 'decision'].includes(ref.kind)
    && parseCanonicalId(ref.kind, ref.id).ok;
}

function checkWarrant(state, namespace) {
  const warrant = state.warrant;
  if (state.status !== 'active') return;
  if (!validRef(state.originDecision, namespace, 'decision') || !object(warrant)
    || !Array.isArray(warrant.records) || !Array.isArray(warrant.sources)
    || warrant.records.length + warrant.sources.length === 0
    || warrant.records.some((item) => !validRef(item?.ref, namespace) || !isCaptureLocator(item.capture))
    || warrant.sources.some((item) => !text(item?.locator) || !text(item.revision))) {
    fail('invalid-warrant', 'An active meaning requires a typed origin Decision and captured material warrant.');
  }
}

// Local proof data only: no caller can supply or retain this graph state.
function seedHistoryTopology(states, budget) {
  const parents = new Map(), pairs = new Map();
  for (const [id, state] of states) {
    budget?.charge('subjects', 1, 'history-topology-seed');
    budget?.charge('validationSteps', 1, 'history-topology-seed');
    if (state.parent !== undefined) parents.set(id, state.parent);
    for (const edge of state.related) {
      budget?.charge('validationSteps', 1, 'history-association-seed');
      pairs.set(associationPair(id, edge.target), id);
    }
  }
  return { parents, pairs };
}

/** Return false only for a structural graph defect; budget failures propagate. */
function updateHistoryTopology(graph, states, rows, budget) {
  const step = phase => budget?.charge('validationSteps', 1, phase);
  const vertex = (id, phase) => {
    budget?.charge('subjects', 1, phase); step(phase);
    return states.has(id);
  };
  const overlay = new Map();
  for (const row of rows) {
    step('history-topology-stage');
    if (!row.parentChanged) continue;
    step('history-parent-edge');
    if (parentEdgeProblem(row.id, row.after.parent, id => vertex(id, 'history-topology-endpoint'))) return false;
    overlay.set(row.id, row.after.parent); // explicit undefined removes an old parent
  }
  const safe = new Set();
  for (const [source, parent] of overlay) {
    if (parent === undefined) continue;
    step('history-cycle-start');
    const path = [], visiting = new Set();
    let cursor = source;
    while (!safe.has(cursor)) {
      if (visiting.has(cursor)) return false;
      visiting.add(cursor); path.push(cursor);
      budget?.charge('subjects', 1, 'history-cycle-visit'); step('history-cycle-visit');
      const next = overlay.has(cursor) ? overlay.get(cursor) : graph.parents.get(cursor);
      if (next === undefined) break;
      cursor = next;
    }
    for (const id of path) { step('history-cycle-proof'); safe.add(id); }
  }
  // Remove all old owners before adding any new declarations: an atomic
  // ownership transfer must not depend on participant order.
  for (const row of rows) if (row.relatedChanged) for (const edge of row.before?.related ?? []) {
    step('history-association-remove');
    const pair = associationPair(row.id, edge.target);
    if (graph.pairs.get(pair) !== row.id) throw new TypeError('Historical association proof lost its owner.');
    graph.pairs.delete(pair);
  }
  for (const row of rows) if (row.relatedChanged) for (const edge of row.after.related) {
    step('history-association-add');
    if (associationEdgeProblem(row.id, edge, id => vertex(id, 'history-topology-endpoint'))) return false;
    const pair = associationPair(row.id, edge.target);
    if (graph.pairs.has(pair)) return false;
    graph.pairs.set(pair, row.id);
  }
  for (const [id, parent] of overlay) {
    step('history-parent-commit');
    if (parent === undefined) graph.parents.delete(id);
    else graph.parents.set(id, parent);
  }
  return true;
}

// Evaluated historical support only. The public transition validator still
// refuses new split publication without the separate complete affected-use owner.
function checkSplitHistoryPair(event, activation, states, budget, splitCreation = false) {
  const equal = splitCreation ? splitSame : same;
  const invalid = () => fail('invalid-split-history', 'A split must immediately follow its exact assessed fresh activation and preserve the source under one review tuple.');
  const fields = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
  const tuple = value => ({ ref: value.decision, reference: value.review.reference,
    acceptedStatus: value.review.acceptedStatus, decisionDigest: value.review.decisionDigest,
    decisionCapture: value.review.decisionCapture });
  budget?.charge('validationSteps', 1, 'split-history-pair');
  if (!activation || activation.action !== 'activate' || activation.rows.length < 2
    || !activation.refusalAssessment || event.rows.length !== 1 || !text(event.reason)
    || !fields(activation, ['id', 'action', 'decision', 'rows', 'review', 'reason', 'refusalAssessment'])
    || !fields(event, ['id', 'action', 'decision', 'rows', 'review', 'reason'])
    || !equal(tuple(event), tuple(activation))) invalid();
  const row = event.rows[0];
  const successors = row.after.retirement?.successors;
  if (row.before?.status !== 'active' || Object.hasOwn(row.before, 'retirement') || Object.hasOwn(row.before, 'refusal')
    || !parseCanonicalId('subject', row.id).ok || !Array.isArray(successors)
    || successors.length !== activation.rows.length
    || !equal(row.after, { ...row.before, status: 'retired', retirement: { kind: 'split', successors } })) invalid();
  for (const [index, created] of activation.rows.entries()) {
    budget?.charge('validationSteps', 1, 'split-history-successor');
    if (created.id === row.id || created.id !== successors[index] || created.before !== null
      || !parseCanonicalId('subject', created.id).ok || created.after.status !== 'active'
      || Object.hasOwn(created.after, 'retirement') || Object.hasOwn(created.after, 'refusal')
      || !equal(created.after.originDecision, activation.decision)) invalid();
    const parent = created.after.parent;
    if (parent !== undefined) {
      budget?.charge('subjects', 1, 'split-history-parent');
      budget?.charge('validationSteps', 1, 'split-history-parent');
      // This is the state at pair completion, not the final registry: later
      // reviewed retirement of a successor or its parent retains this history.
      if (parent === row.id || states.get(parent)?.status !== 'active') invalid();
    }
  }
  return activation.id;
}

function checkHistory(document, { actions = true, budget, splitCreation = false } = {}) {
  const equal = splitCreation ? splitSame : same;
  const hash = splitCreation ? splitDigest : canonicalSha256;
  const index = splitCreation ? splitIndexSubjects : indexSubjects;
  if (!isIdentityUuid(document.namespace) || !Array.isArray(document.history)) fail('invalid-history', 'Governance requires namespace and explicit history.');
  const events = new Set();
  const states = new Map();
  const changes = new Map();
  const promoted = new Set();
  const splitActivations = new Map();
  let previousEvent;
  let graph = null;
  for (const event of document.history) {
    const topologyRows = [];
    if (!isIdentityUuid(event?.id)) fail('invalid-history', 'Every history event requires an exact UUID.');
    if (events.has(event.id)) fail('duplicate-event', 'History event IDs cannot repeat.');
    events.add(event.id);
    if (!validRef(event.decision, document.namespace, 'decision')) fail('invalid-authorizer', 'History authorizer must be an exact qualified Decision.');
    const review = event.review;
    if (!object(review) || !text(review.reference) || !accepted(review.acceptedStatus)
      || !digest(review.decisionDigest) || !digest(review.changeDigest) || !isCaptureLocator(review.decisionCapture)) {
      fail('invalid-review', 'Review must bind accepted status, source locator and canonical digests.');
    }
    if (hash(eventBody(event)) !== review.changeDigest) fail('change-digest-mismatch', 'History event differs from reviewed change digest.');
    if (Object.hasOwn(event, 'promotes')) {
      const promotion = event.promotes;
      const reconsideration = Object.hasOwn(event, 'reconsiderationAssessment');
      if (reconsideration) {
        validateReconsiderationEvent(event, document.namespace, budget);
        const parent = event.rows[0].after.parent;
        if (parent !== undefined) {
          budget?.charge('validationSteps', 1, 'reconsideration-activation-parent');
          if (states.get(parent)?.status !== 'active') fail('invalid-history', 'Reconsideration requires an active parent at the activation event.');
        }
        if (promoted.has(promotion.key) || !equal(states.get(promotion.key), stateOf(promotion.before))
          || !equal(changes.get(promotion.key), promotion.before.changes)) {
          fail('invalid-history', 'Reconsideration consumes only the exact tracked suppressed state and ordered history.');
        }
        // Remove only this verified proposal's ownership before the atomic new
        // canonical row is added; retained events/snapshot preserve its history.
        budget?.charge('validationSteps', 1, 'reconsideration-history-consumption');
        states.delete(promotion.key); changes.delete(promotion.key);
        if (graph) {
          graph.parents.delete(promotion.key);
          for (const edge of promotion.before.related) {
            budget?.charge('validationSteps', 1, 'reconsideration-history-association-consumption');
            const pair = associationPair(promotion.key, edge.target);
            if (graph.pairs.get(pair) !== promotion.key) fail('invalid-history', 'Consumed association ownership must match its proposal.');
            graph.pairs.delete(pair);
          }
        }
      } else {
      if (!object(promotion) || Object.keys(promotion).length !== 2
        || !parseProposalKey('subject', promotion.key).ok || promoted.has(promotion.key)
        || !object(promotion.before) || promotion.before.id !== promotion.key
        || promotion.before.status !== 'proposed' || !Array.isArray(promotion.before.changes)
        || promotion.before.changes.length || Object.hasOwn(promotion.before, 'refusal')
        || Object.hasOwn(promotion.before, 'retirement') || event.action !== 'activate'
        || !event.refusalAssessment || event.rows?.length !== 1) {
        fail('invalid-history', 'Promotion retains one exact unused proposed entry and its reviewed assessment.');
      }
      }
      promoted.add(promotion.key);
    }
    if (['reconsiderationAssessment', 'reconsideration'].some(key => Object.hasOwn(event,key))) {
      validateReconsiderationEvent(event, document.namespace, budget);
    }

    if (!Array.isArray(event.rows) || event.rows.length === 0) fail('invalid-history', 'History event requires participant states.');
    const participants = new Set();
    for (const row of event.rows) {
      budget?.charge('historyRows', 1, 'history-row');
      budget?.charge('validationSteps', 1, 'history-row');
      if (!object(row) || participants.has(row.id) || !object(row.after)
        || !Object.hasOwn(row, 'before') || (row.before !== null && !object(row.before))) {
        fail('invalid-history', 'History rows require unique participants and complete before/after states.');
      }
      participants.add(row.id);
      if (['id', 'changes', 'history'].some((key) => Object.hasOwn(row.after, key) || (row.before && Object.hasOwn(row.before, key)))) {
        fail('invalid-history', 'State snapshots cannot recursively embed identity or history.');
      }
      // A draft has no effective creation event. Its first refusal retains the
      // declared baseline; publication separately binds it to the actual prior capture.
      const proposalBaseline = event.action === 'suppress' && parseProposalKey('subject', row.id).ok
        && row.before?.status === 'proposed' && !Object.hasOwn(row.before, 'refusal')
        && !Object.hasOwn(row.before, 'retirement');
      if (states.has(row.id) ? !equal(states.get(row.id), row.before) : row.before !== null && !proposalBaseline) {
        fail('invalid-history', 'History must start at creation and preserve state continuity.');
      }
      const { parent, related, ...metadata } = row.after;
      budget?.charge('subjects', 1, 'history-row-metadata');
      // Endpoints are checked against the complete atomic event graph below.
      // This detached projection must not alter the authored reviewed snapshot.
      const metadataCheck = index({ schemaVersion: document.schemaVersion, namespace: document.namespace,
        revision: 0, hierarchyRevision: 0, subjects: [{ id: row.id, ...metadata, related: [] }] });
      if (!metadataCheck.ok || !Array.isArray(related) || (parent !== undefined && !parseCanonicalId('subject', parent).ok)) {
        fail('invalid-history', 'History must retain valid subject metadata and exact parent identity.');
      }
      checkWarrant(row.after, document.namespace);
      if (graph) {
        budget?.charge('validationSteps', 1, 'history-topology-comparison');
        const previous = states.get(row.id);
        const parentChanged = previous === undefined || previous.parent !== parent;
        const relatedChanged = previous === undefined || !equal(previous.related, related);
        if (parentChanged || relatedChanged) topologyRows.push({ id: row.id, before: previous,
          after: row.after, parentChanged, relatedChanged });
      }
      states.set(row.id, row.after);
      if (!changes.has(row.id)) changes.set(row.id, []);
      changes.get(row.id).push(event.id);
    }
    const incremental = graph && updateHistoryTopology(graph, states, topologyRows, budget);
    if (!graph || !incremental) {
      // Structural rejection alone reaches the reference. Budget exceptions
      // have already escaped; never spend more after a sticky admission latch.
      budget?.charge('validationSteps', states.size, 'history-forest');
      budget?.charge('subjects', states.size, 'history-forest');
      const forest = index({ schemaVersion: document.schemaVersion, namespace: document.namespace,
        revision: 0, hierarchyRevision: 0, subjects: [...states].map(([id, state]) => ({ id, ...state })) });
      if (!forest.ok) fail('invalid-history-forest', `Event ${event.id} has an invalid complete forest: ${forest.diagnostics.map((d) => d.code).join(', ')}.`);
      if (graph) throw new TypeError('Incremental historical topology disagrees with the full graph validator.');
      graph = seedHistoryTopology(states, budget);
    }
    if (actions) {
      if (event.action === 'split') splitActivations.set(event.id, checkSplitHistoryPair(event, previousEvent, states, budget, splitCreation));
      checkAction(event, { historical: true, splitCreation });
    }
    previousEvent = event;
  }
  for (const subject of document.subjects) {
    if (promoted.has(subject.id)) fail('invalid-history', 'A consumed proposal cannot remain or reappear in the current registry.');
    budget?.charge('validationSteps', 1, 'current-history-state');
    if (!Array.isArray(subject.changes) || !equal(subject.changes, changes.get(subject.id) ?? [])
      || (states.has(subject.id) && !equal(stateOf(subject), states.get(subject.id)))
      || (subject.status === 'active' && !states.has(subject.id))) {
      fail('invalid-history', 'Current state and ordered change references must match the complete history.');
    }
    states.delete(subject.id);
  }
  if (states.size) fail('invalid-history', 'History participant identities cannot disappear.');
  return splitActivations;
}

function checkRegistryIdentity(registry, identity) {
  if (!validateIdentityLedger(identity).ok) fail('invalid-identity-ledger', 'The subject authority requires the validated installation identity ledger.');
  if (identity.namespace !== registry.namespace) fail('namespace-mismatch', 'Registry and identity must share the exact installation namespace.');
  const allocations = new Map(identity.allocations.filter((row) => row.kind === 'subject').map((row) => [row.id, row]));
  for (const subject of registry.subjects.values()) {
    const allocation = allocations.get(subject.id);
    if (!allocation || allocation.state === 'cancelled' || (subject.status === 'active' && allocation.state !== 'allocated')) {
      fail('invalid-subject-allocation', 'Canonical subjects require matching occupied subject allocations; active subjects must be allocated.');
    }
  }
}

/** Structural authority metadata only: no source retrieval or evaluated approval. */
export function validateSubjectRegistryMetadata(registry, { identity, budget, operationBudget }) {
  budget = selectSubjectValidationBudget(budget, operationBudget);
  try {
    checkRegistryIdentity(registry, identity);
    checkHistory(registry.document, { actions: false, budget });
    return { ok: true, diagnostics: [] };
  } catch (error) {
    if (!(error instanceof SubjectError) || error.code === 'subject-validation-budget') throw error;
    return { ok: false, diagnostics: [{ code: error.code, path: '', message: error.message }] };
  }
}

function checkAction(event, { historical = false, splitCreation = false } = {}) {
  const equal = splitCreation ? splitSame : same;
  const allowed = { rename: ['label', 'aliases'], clarify: ['definition'], reparent: ['parent'], relate: ['related'] };
  let changed = false;
  for (const row of event.rows) {
    if (event.action === 'suppress') {
      if (!parseProposalKey('subject', row.id).ok || row.before?.status !== 'proposed'
        || row.after.status !== 'suppressed' || Object.hasOwn(row.before, 'refusal')
        || Object.hasOwn(row.before, 'retirement') || !text(event.reason)
        || !equal(row.after, { ...row.before, status: 'suppressed',
          refusal: { decision: event.decision, reason: event.reason } })) {
        fail('invalid-action', 'Suppression preserves a proposed meaning and binds its refusal to this Decision and reason.');
      }
      changed = true;
      continue;
    }
    if (equal(row.before, row.after)) {
      if (!text(row.reason)) fail('missing-row-reason', 'Unchanged carry-forward participants require a reason.');
      continue;
    }
    changed = true;
    if (event.action === 'activate') {
      if (row.before !== null || row.after.status !== 'active' || !parseCanonicalId('subject', row.id).ok
        || !equal(row.after.originDecision, event.decision)) fail('invalid-action', 'Activation creates a canonical active meaning bound to its origin Decision.');
    } else if (historical && ['retire', 'merge-equivalent', 'split'].includes(event.action)) {
      const expectedKind = event.action === 'merge-equivalent' ? 'equivalent-merge' : event.action;
      if (row.before?.status !== 'active' || row.after.status !== 'retired' || row.after.retirement?.kind !== expectedKind) {
        fail('invalid-action', 'Historical retirement must preserve a formerly active meaning and its explicit disposition.');
      }
      const { status: beforeStatus, ...beforeMeaning } = row.before;
      const { status: afterStatus, retirement, ...afterMeaning } = row.after;
      if (!equal(beforeMeaning, afterMeaning)) fail('invalid-action', 'Retirement cannot rewrite the retained meaning.');
    } else if (Object.hasOwn(allowed, event.action)) {
      if (!row.before || row.before.status !== 'active' || row.after.status !== 'active') fail('invalid-action', 'This action requires an existing active subject.');
      if (['rename', 'clarify'].includes(event.action) && event.unchangedMeaning !== true) fail('invalid-action', 'Rename and clarification require a reviewed unchanged-meaning assertion.');
      const fields = new Set([...Object.keys(row.before), ...Object.keys(row.after)]);
      for (const key of fields) {
        if (!allowed[event.action].includes(key) && !equal(row.before[key] ?? null, row.after[key] ?? null)) {
          fail('invalid-action', `Action ${event.action} cannot change ${key}.`);
        }
      }
    } else fail('unsupported-action', 'This lifecycle publication requires the complete affected-use validation slice.');
  }
  if (!changed) fail('no-op', 'A history event must change subject state.');
}

function checkEvidence(event, captures, budget) {
  const { review } = event;
  const result = verifyDecisionEvidence({ decision: event.decision, acceptedStatus: review?.acceptedStatus,
    decisionDigest: review?.decisionDigest, decisionCapture: review?.decisionCapture, captures }, { budget });
  if (result.status === 'invalid') {
    const diagnostic = result.diagnostics[0];
    throw new SubjectError(diagnostic.code, diagnostic.message);
  }
  return result.status;
}

function resolveAuthorizer(index, ref, budget, phase) {
  try { return resolveRecord(index, ref, budget ? { documentBudget: budget.documentBudget, phase } : undefined); }
  catch (error) { throw adaptDocumentBudgetError(error); }
}

/** One call owns these detached results; neither callers nor handles receive the memo. */
function authorizerResolver(index, budget, phase, splitCreation = false) {
  const hash = splitCreation ? splitDigest : canonicalSha256;
  const loaded = new Map();
  return ref => {
    budget?.assertActive();
    budget?.charge('validationSteps', 1, `${phase}-lookup`);
    // Do not project malformed refs onto a previously admitted identity. Ordinary
    // resolution retains its own diagnostics and strict guards on every miss.
    const exact = validRef(ref, index?.namespace, 'decision') && Reflect.ownKeys(ref).length === 3
      && ['namespace', 'kind', 'id'].every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(ref, key) ?? {}, 'value'));
    const key = exact ? JSON.stringify([ref.namespace, ref.kind, ref.id]) : null;
    if (key !== null && loaded.has(key)) return loaded.get(key);
    const resolved = resolveAuthorizer(index, ref, budget, phase);
    const result = { resolved, recordDigest: resolved.status === 'loaded' ? hash(resolved.entry.record) : null };
    if (exact && resolved.status === 'loaded') loaded.set(key, result);
    return result;
  };
}

/** Evaluate supplied historical source integrity, never repository membership or reviewer authenticity. */
export function evaluateSubjectGovernance({ registry, identity, identityIndex, decisionCaptures = [], assessmentCaptures = [], materialCaptures = [] } = {}, { budget, operationBudget } = {}) {
  return evaluateGovernance({ registry, identity, identityIndex, decisionCaptures, assessmentCaptures, materialCaptures }, { budget, operationBudget });
}

function evaluateGovernance({ registry, identity, identityIndex, decisionCaptures, assessmentCaptures, materialCaptures = [] }, { budget, operationBudget }, splitCreation = false) {
  const hash = splitCreation ? splitDigest : canonicalSha256;
  const index = splitCreation ? splitIndexSubjects : indexSubjects;
  budget = selectSubjectValidationBudget(budget, operationBudget);
  budget?.guard(identity, 'evaluate-identity');
  budget?.guard(registry?.document, 'evaluate-registry');
  budget?.charge('subjects', registry?.document?.subjects?.length ?? 0, 'evaluate-registry');
  const indexed = index(registry?.document);
  if (!indexed.ok) return { ok: false, governance: null, diagnostics: indexed.diagnostics };
  const captured = indexed.registry;
  const verification = new Map();
  const evidenceEvents = [];
  const diagnostics = [];
  let splitActivations;
  try {
    checkRegistryIdentity(captured, identity);
    if (identity.namespace !== captured.namespace || identityIndex?.namespace !== captured.namespace) {
      fail('namespace-mismatch', 'Registry and identity captures must share the exact installation namespace.');
    }
    if (hash(identity) !== identityIndex.identityDigest) {
      fail('identity-capture-mismatch', 'Supplied ledger differs from the identity index capture.');
    }
    splitActivations = checkHistory(captured.document, { budget, splitCreation });
    for (const subject of captured.subjects.values()) {
      if (subject.status === 'retired') resolveSubject(captured, subject.id, { policy: 'equivalent',
        ...(operationBudget ? { operationBudget } : {}) });
    }
    if (!Array.isArray(decisionCaptures) || !Array.isArray(assessmentCaptures)) fail('invalid-evidence', 'Retained captures must be lists.');
    if (!Array.isArray(materialCaptures)) fail('invalid-evidence', 'Material captures must be a dense list.');
    const requiredMaterial = materialCaptures.length ? reconsiderationMaterialKeys(captured.document, budget) : new Set();
    const seenMaterial = new Set();
    for (let i = 0; i < materialCaptures.length; i += 1) {
      budget?.charge('validationSteps', 1, 'reconsideration-material-capture');
      const field = Object.getOwnPropertyDescriptor(materialCaptures, String(i));
      if (!field || !Object.hasOwn(field, 'value') || !splitDataObject(field.value, ['capture','bytes','objectFormat'])) fail('invalid-evidence', 'Material evidence requires own data capture wrappers.');
      const capture = field.value;
      if (budget) { budget.admitCapture(capture); budget.guard(capture.capture, 'reconsideration-material-locator'); }
      if (!verifyCapturedBytes({ locator:capture.capture, bytes:capture.bytes, objectFormat:capture.objectFormat }).ok) fail('invalid-evidence', 'Material capture integrity differs.');
      const key = splitDigest(capture.capture);
      if (seenMaterial.has(key) || !requiredMaterial.has(key)) fail('invalid-evidence', 'Material captures must be unique members of the retained reconsideration history.');
      seenMaterial.add(key);
    }
    if (Reflect.ownKeys(materialCaptures).length !== materialCaptures.length + 1) fail('invalid-evidence', 'Material captures cannot carry extra fields.');
    if (operationBudget !== undefined) {
      // The opt-in transport shares capture admission. Independent creation
      // already owns its aggregate raw debit and retains that separate path.
      for (const capture of [...decisionCaptures, ...assessmentCaptures.flatMap((pair) => [pair?.registry, pair?.identity])]) {
        budget.admitCapture(capture);
        budget.guard(capture.capture, 'evidence-locator');
      }
    }
  } catch (error) {
    if (budget && !(error instanceof SubjectError || error instanceof IdentityOperationError)) throw error;
    if (error.code === 'subject-validation-budget') throw error;
    return { ok: false, governance: null, diagnostics: [{ code: error.code ?? 'invalid-history', path: 'history', message: error.message }] };
  }
  const authorizerFor = authorizerResolver(identityIndex, budget, 'historical-authorizer', splitCreation);
  for (const [i, event] of (captured.document.history ?? []).entries()) {
    try {
      const { resolved: authorizer, recordDigest } = authorizerFor(event.decision);
      if (authorizer.status !== 'loaded') throw new SubjectError('invalid-authorizer', 'Review authorizer must resolve to a loaded Decision.');
      const checked = checkEvidence(event, decisionCaptures, budget);
      const assessment = event.reconsiderationAssessment
        ? verifySubjectReconsiderationEvidence(event, assessmentCaptures, materialCaptures, budget)
        : event.refusalAssessment ? verifyRefusalAssessment(event, assessmentCaptures, budget) : null;
      let activationVerified = true;
      if (splitActivations.has(event.id)) {
        budget?.charge('validationSteps', 1, 'split-activation-verification');
        activationVerified = verification.get(splitActivations.get(event.id)) === 'verified';
      }
      if (event.reconsiderationAssessment) {
        budget?.charge('validationSteps', 1, 'reconsideration-refusal-verification');
        activationVerified = verification.get(event.priorRefusal) === 'verified';
      }
      const complete = checked === 'verified' && (!assessment || assessment.status === 'verified') && activationVerified;
      verification.set(event.id, complete ? 'verified' : 'unavailable');
      evidenceEvents.push({ id: event.id, verification: complete ? 'verified' : 'unavailable',
        ...(assessment ? { assessmentVerification: assessment.status } : {}),
        decision: { ref: event.decision, currentStatus: authorizer.entry.record.status ?? null,
          currentRecordDigest: recordDigest },
        captureVerification: checked === 'verified' ? 'integrity-checked' : 'unavailable' });
    } catch (error) {
      if (budget && !(error instanceof SubjectError || error instanceof IdentityOperationError)) throw error;
      if (error.code === 'subject-validation-budget') throw error;
      diagnostics.push({ code: error.code ?? 'invalid-evidence', path: `history[${i}]`, message: error.message });
    }
  }
  if (diagnostics.length) return { ok: false, governance: null, diagnostics };
  const governance = Object.freeze({ namespace: captured.namespace, revision: captured.revision,
    hierarchyRevision: captured.hierarchyRevision });
  const descriptor = { version: 1, namespace: captured.namespace,
    registryDigest: hash(captured.document), identityDigest: hash(identity), events: evidenceEvents };
  evaluations.set(governance, { registry: captured, verification, descriptor, operationBudget,
    currentQueryEligibility: new Map() });
  return { ok: true, governance, diagnostics };
}

/** Validate options even when an assignment list contains no target to resolve. */
export function validateSubjectEligibilityOptions(options) {
  if (!object(options)) throw new SubjectError('invalid-options', 'Eligibility requires an explicit purpose.');
  const { purpose, operationBudget, ...resolutionOptions } = options;
  if (Object.hasOwn(options, 'operationBudget')) getSubjectValidationBudget(operationBudget).assertActive();
  if (!['inspect', 'query', 'new-assignment'].includes(purpose)) throw new SubjectError('invalid-options', 'Choose inspect, query or new-assignment purpose.');
  return { purpose, ...validateSubjectResolutionOptions(resolutionOptions),
    ...(Object.hasOwn(options, 'operationBudget') ? { operationBudget } : {}) };
}

/** New assignments never inherit eligibility merely by resolving an old redirect. */
export function subjectEligibility(context, id, options = {}) {
  const { purpose, operationBudget, ...resolutionOptions } = validateSubjectEligibilityOptions(options);
  const evaluation = evaluations.get(context);
  if (!evaluation && purpose !== 'inspect') {
    throw new SubjectError('governance-unavailable', 'Queries and new assignments require evaluated subject governance.');
  }
  if (operationBudget && evaluation && evaluation.operationBudget !== operationBudget) {
    fail('subject-operation-mismatch', 'Evaluated governance belongs to a different or unbounded operation.');
  }
  const registry = evaluation?.registry ?? context;
  if (operationBudget) {
    operationBudget.charge('validationSteps', 1, 'subject-eligibility');
    if (!evaluation) {
      operationBudget.charge('subjects', registry?.document?.subjects?.length ?? 0, 'inspect-registry');
      operationBudget.guard(registry?.document, 'inspect-registry');
    }
  }
  // Only this immutable capture and its exact allowance own the proof. No model,
  // assignment row, authorizer binding or caller-owned outcome is memoized.
  const memo = operationBudget && evaluation && purpose === 'query' && resolutionOptions.policy === 'current'
    && parseCanonicalId('subject', id).ok ? evaluation.currentQueryEligibility : null;
  if (memo) {
    operationBudget.charge('validationSteps', 1, 'current-query-eligibility-lookup');
    const subject = memo.get(id);
    if (subject) return { eligible: true, resolution: { status: 'resolved', requestedId: id,
      subject, policy: 'current', redirects: [], id }, verification: 'verified' };
  }
  const resolution = resolveSubject(registry, id, { ...resolutionOptions, ...(operationBudget ? { operationBudget } : {}) });
  if (purpose === 'inspect') return { eligible: resolution.status === 'resolved', resolution, verification: 'not-required',
    ...(resolution.code ? { code: resolution.code } : {}) };
  const original = resolveSubject(registry, id, operationBudget ? { operationBudget } : undefined);
  const originalIneligible = (purpose === 'new-assignment' && original.status !== 'resolved')
    || ['proposed', 'suppressed'].includes(original.subject.status);
  if (originalIneligible || resolution.status !== 'resolved') {
    return { eligible: false, resolution, verification: 'not-required',
      code: originalIneligible ? original.code : resolution.code };
  }
  const ids = new Set([id, resolution.id, ...resolution.redirects.flatMap(({ from, to }) => [from, to])]);
  const verified = [...ids].every((subjectId) => {
    operationBudget?.charge('subjects', 1, 'eligibility-subject');
    operationBudget?.charge('validationSteps', 1, 'eligibility-subject');
    const changes = registry.subjects.get(subjectId)?.changes ?? [];
    return changes.length > 0 && changes.every((event) => {
      operationBudget?.charge('validationSteps', 1, 'eligibility-event');
      return evaluation.verification.get(event) === 'verified';
    });
  });
  if (memo && verified && resolution.status === 'resolved' && resolution.id === id
    && resolution.requestedId === id && resolution.redirects.length === 0 && resolution.subject.status === 'active') {
    // Publication of the private proof must not follow a latched failure.
    operationBudget.assertActive();
    memo.set(id, resolution.subject); // Captured Subject JSON is already deeply frozen.
  }
  return { eligible: verified ? true : null, resolution, verification: verified ? 'verified' : 'unavailable',
    ...(!verified ? { code: 'governance-unavailable' } : {}) };
}

/** Check a detached candidate; this does not publish or certify filesystem coverage. */
export function validateSubjectTransition(input) { return validateTransition(input); }

/** Fixed metadata family: authentic allowance, existing native transition mechanics. */
export function validateSubjectMetadataTransition(input, { operationBudget } = {}) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  budget.guard(input.before, 'metadata-before-registry');
  budget.guard(input.candidate, 'metadata-candidate-registry');
  const additions = input.candidate.history?.slice(input.before.history?.length);
  if (!Array.isArray(additions) || additions.length !== 1
    || !['rename', 'clarify', 'reparent', 'relate'].includes(additions[0].action)) {
    return { ok: false, governance: null, diagnostics: [{ code: 'invalid-metadata-transition', path: '', message: 'One fixed metadata event is required.' }] };
  }
  return validateTransition(input, { metadataTransition: true, budget });
}

/** Fixed forward proposal refusal; its captured model must be the actual before side. */
export function validateSubjectProposalSuppressionTransition(input, { operationBudget } = {}) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  budget.guard(input.before, 'proposal-suppression-before-registry');
  budget.guard(input.candidate, 'proposal-suppression-candidate-registry');
  const additions = input.candidate.history?.slice(input.before.history?.length);
  if (!Array.isArray(additions) || additions.length !== 1 || additions[0].action !== 'suppress') {
    return { ok: false, governance: null, diagnostics: [{ code: 'invalid-proposal-suppression-transition', path: '', message: 'One forward proposal refusal event is required.' }] };
  }
  return validateTransition(input, { proposalSuppression: true, budget });
}

function validateTransition({ before, candidate, model, identityIndex, decisionCaptures = [], assessmentCaptures = [], materialCaptures = [] }, { assessedActivation = false, splitCreation = false, reconsiderationCreation = false, metadataTransition = false, proposalSuppression = false, ordinaryCreation = false, budget } = {}) {
  const boundedCreation = splitCreation || reconsiderationCreation || ordinaryCreation;
  const equal = boundedCreation ? splitSame : same;
  const hash = boundedCreation ? splitDigest : canonicalSha256;
  const index = boundedCreation ? splitIndexSubjects : indexSubjects;
  try {
    if (splitCreation && (!assessedActivation || !budget)) throw new TypeError('Split creation requires its fixed assessed operation.');
    budget?.charge('subjects', before.subjects.length + candidate.subjects.length, 'transition-indexes');
    const prior = index(before);
    const next = index(candidate);
    if (!prior.ok || !next.ok) return { ok: false, governance: null, diagnostics: [...prior.diagnostics, ...next.diagnostics] };
    checkHistory(prior.registry.document, { budget, splitCreation: boundedCreation });
    checkHistory(next.registry.document, { budget, splitCreation: boundedCreation });
    if (before.namespace !== candidate.namespace || model?.identity?.namespace !== candidate.namespace
      || identityIndex?.namespace !== candidate.namespace) fail('namespace-mismatch', 'All captures must share the installation namespace.');
    const kinds = boundedCreation ? null : [['knowledge', 'knowledge'], ['ontology', 'ontology'], ['decision', 'decisions']]
      .filter(([, store]) => model?.stores?.[store]?.present === true).map(([kind]) => kind);
    const records = assessedActivation ? null : iterateCurrentRecords(model, { kinds });
    if (candidate.history.length < before.history.length
      || !equal(before.history, candidate.history.slice(0, before.history.length))) fail('history-rewrite', 'Existing history must remain an exact prefix.');
    const additions = candidate.history.slice(before.history.length);
    if (additions.length === 0) fail('no-op', 'Publication requires a new effective subject event.');
    if (splitCreation && (additions.length !== 2 || additions[0].action !== 'activate' || additions[1].action !== 'split')) {
      fail('invalid-split-creation', 'Split creation requires exactly activation then split.');
    }
    if (!assessedActivation && additions.some((event) => event.action === 'activate' || event.promotes || event.refusalAssessment)) {
      fail('unsupported-action', 'New activation requires a bounded two-model creation or promotion operation.');
    }
    if (additions.some((event) => event.action === 'suppress')
      && (!model.subjectRegistry || !equal(model.subjectRegistry.document, before))) {
      fail('subject-capture-mismatch', 'Proposal suppression requires the complete prior registry captured by the model.');
    }
    const firstChanges = new Map();
    for (const event of additions) for (const row of event.rows) {
      if (!firstChanges.has(row.id)) firstChanges.set(row.id, row);
    }
    const nextSubjects = new Map(candidate.subjects.map((subject) => [subject.id, subject]));
    const priorIds = new Set(before.subjects.map((subject) => subject.id));
    for (const subject of candidate.subjects) {
      if (!priorIds.has(subject.id) && !firstChanges.has(subject.id)) {
        fail('unreviewed-state-change', 'Every newly added subject must be covered by a supported new event.');
      }
    }
    for (const [id, row] of firstChanges) {
      if (!priorIds.has(id) && row.before !== null) {
        fail('unreviewed-state-change', 'A nonnull first state must belong to an existing captured subject.');
      }
    }
    for (const subject of before.subjects) {
      const nextSubject = nextSubjects.get(subject.id);
      if (assessedActivation && additions[0].promotes?.key === subject.id && !nextSubject
        && equal(additions[0].promotes.before, subject)) continue;
      if (!nextSubject || !equal(subject.changes, nextSubject.changes.slice(0, subject.changes.length))) {
        fail('history-rewrite', 'Existing subjects and their ordered history must be retained.');
      }
      const firstChange = firstChanges.get(subject.id);
      if (firstChange ? !equal(firstChange.before, stateOf(subject)) : !equal(subject, nextSubject)) {
        fail('unreviewed-state-change', 'Candidate state must start from the captured before state, including nonparticipants.');
      }
    }
    let hierarchyEvents = 0;
    for (const event of additions) {
      // checkHistory above validated the exact adjacent pair. Only its split
      // receives historical action admission; ordinary callers retain their gate.
      checkAction(event, { historical: splitCreation && event === additions[1], splitCreation: boundedCreation });
      if (event.rows.some((row) => (row.before?.parent ?? null) !== (row.after.parent ?? null))) hierarchyEvents += 1;
      const current = resolveAuthorizer(identityIndex, event.decision, budget, 'promotion-authorizer');
      const modelRecord = assessedActivation ? { entry: model.decisions?.get(event.decision.id) }
        : records.find((item) => equal(item.ref, event.decision));
      if (modelRecord?.entry?.record) budget?.guard(modelRecord.entry.record, 'current-model-authorizer');
      if (current.status !== 'loaded' || !accepted(current.entry.record.status)) fail('ineffective-authorizer', 'A new event requires a currently accepted or addressed Decision.');
      if (!modelRecord || !recordIdentityMatches('decision', event.decision.id, modelRecord.entry)
        || !equal(modelRecord.entry.record, current.entry.record)
        || current.entry.record.status !== event.review.acceptedStatus
        || hash(current.entry.record) !== event.review.decisionDigest) {
        fail('authorizer-capture-mismatch', 'Current model, identity index and reviewed Decision must agree.');
      }
      if (checkEvidence(event, decisionCaptures, budget) !== 'verified') fail('governance-unavailable', 'A new event requires supplied source-bound approval evidence.');
    }
    if (candidate.revision !== before.revision + additions.length
      || candidate.hierarchyRevision !== before.hierarchyRevision + hierarchyEvents) {
      fail('invalid-revision', 'Registry and hierarchy revisions must count effective events and parent-edge changes.');
    }
    return evaluateGovernance({ registry: next.registry, identity: model.identity, identityIndex, decisionCaptures, assessmentCaptures, materialCaptures },
      boundedCreation || metadataTransition || proposalSuppression ? { operationBudget: budget } : { budget }, boundedCreation);
  } catch (error) {
    if (budget && !(error instanceof SubjectError || error instanceof IdentityOperationError)) throw error;
    if (error.code === 'subject-validation-budget') throw error;
    return { ok: false, governance: null, diagnostics: [{ code: error.code ?? 'invalid-transition', path: '', message: error.message }] };
  }
}

/** A detached view of the exact captured document, never a filesystem reread. */
export function getGovernedSubjectRegistry(handle, { operationBudget } = {}) {
  const evaluation = evaluations.get(handle);
  if (!evaluation) throw new SubjectError('governance-unavailable', 'A real evaluated governance handle is required.');
  if (operationBudget !== undefined) {
    getSubjectValidationBudget(operationBudget).assertActive();
    if (evaluation.operationBudget !== operationBudget) fail('subject-operation-mismatch', 'Evaluated governance belongs to a different or unbounded operation.');
    operationBudget.guard(evaluation.registry.document, 'governed-registry-view');
    operationBudget.charge('subjects', evaluation.registry.document.subjects.length, 'governed-registry-view');
  }
  return indexSubjects(evaluation.registry.document).registry;
}

/** Assert existing operation ownership only; no model evaluation, copy or new authority. */
export function assertSubjectGovernanceOperation(handle, { operationBudget } = {}) {
  const budget = getSubjectValidationBudget(operationBudget);
  budget.assertActive();
  const evaluation = evaluations.get(handle);
  if (!evaluation) fail('governance-unavailable', 'A real evaluated governance handle is required.');
  if (evaluation.operationBudget !== budget) {
    fail('subject-operation-mismatch', 'Evaluated governance belongs to a different or unbounded operation.');
  }
  budget.charge('validationSteps', 1, 'governance-operation-binding');
}

/** Serializable provenance from a real handle; this descriptor is not an approval input. */
export function getSubjectGovernanceDescriptor(handle, { operationBudget } = {}) {
  const evaluation = evaluations.get(handle);
  if (!evaluation) throw new SubjectError('governance-unavailable', 'A real evaluated governance handle is required.');
  if (operationBudget !== undefined) {
    getSubjectValidationBudget(operationBudget).assertActive();
    if (evaluation.operationBudget !== operationBudget) fail('subject-operation-mismatch', 'Evaluated governance belongs to a different or unbounded operation.');
    operationBudget.guard(evaluation.descriptor, 'governed-descriptor');
  }
  return structuredClone(evaluation.descriptor);
}

/** Corroborate an evaluated handle against one actual candidate model; this grants no approval. */
export function validateSubjectGovernanceCapture(handle, { model } = {}, { budget, operationBudget } = {}) {
  return bindGovernanceCapture(handle, { model }, { budget, operationBudget });
}

function bindGovernanceCapture(handle, { model }, { budget, operationBudget }, splitCreation = false) {
  const hash = splitCreation ? splitDigest : canonicalSha256;
  const equal = splitCreation ? splitSame : same;
  budget = selectSubjectValidationBudget(budget, operationBudget);
  const evaluation = evaluations.get(handle);
  if (!evaluation) return { ok: false, diagnostics: [{ code: 'governance-unavailable', path: '',
    message: 'A real evaluated governance handle is required.' }] };
  if (operationBudget && evaluation.operationBudget !== operationBudget) {
    fail('subject-operation-mismatch', 'Evaluated governance belongs to a different or unbounded operation.');
  }
  const mismatch = (message) => ({ ok: false, diagnostics: [{ code: 'input-mismatch', path: '', message }] });
  if (model?.identity) budget?.guard(model.identity, 'binding-identity');
  if (model?.subjectRegistry?.document) budget?.guard(model.subjectRegistry.document, 'binding-registry');
  if (!object(model) || model.ok !== true || !object(model.subjectRegistry?.document)
    || !validateIdentityLedger(model.identity).ok) {
    return mismatch('Binding requires a healthy captured model with a registry and valid identity ledger.');
  }
  const identityIndex = model.identityIndex;
  let identity;
  try { identity = getIdentityIndexDescriptor(identityIndex); }
  catch (error) {
    if (!(error instanceof IdentityOperationError)) throw error;
    return mismatch('Candidate identity index is unavailable or not an authentic capture.');
  }
  const { descriptor } = evaluation;
  if (descriptor.events.length && model.stores?.decisions?.present !== true) {
    return mismatch('Captured authorizers require a present Decisions store in the candidate model.');
  }
  if (identity.namespace !== descriptor.namespace || identity.identityFormat !== 1
    || identity.identityDigest !== descriptor.identityDigest
    || hash(model.identity) !== identity.identityDigest
    || !equal(model.subjectRegistry.document, evaluation.registry.document)) {
    return mismatch('Candidate registry or identity differs from the evaluated capture.');
  }
  const authorizerFor = authorizerResolver(identityIndex, budget, 'binding-index-authorizer', splitCreation);
  for (const event of descriptor.events) {
    const authorizer = model.decisions instanceof Map ? model.decisions.get(event.decision.ref.id) : undefined;
    if (authorizer?.record) budget?.guard(authorizer.record, 'binding-model-authorizer');
    if (model.identityIndex !== identityIndex) return mismatch('Candidate identity index changed during binding.');
    const { resolved: captured, recordDigest } = authorizerFor(event.decision.ref);
    if (!recordIdentityMatches('decision', event.decision.ref.id, authorizer)
      || captured.status !== 'loaded'
      || hash(authorizer.record) !== event.decision.currentRecordDigest
      || recordDigest !== event.decision.currentRecordDigest) {
      return mismatch('Current Decision authorizer differs between the model, identity index and evaluated capture.');
    }
  }
  return { ok: true, diagnostics: [] };
}

/** Bounded two-model promotion evidence/eligibility check; P1 owns membership and publication. */
export function validateSubjectPromotion(input) { return validateCreation(input, { promotion: true }); }

/** Bounded fresh creation, including bootstrap from a real present empty authority. */
export function validateSubjectActivation(input) { return validateCreation(input, { promotion: false }); }

const splitDataObject = (value, required, optional = []) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && required.every(key => Object.hasOwn(value, key))
  && Reflect.ownKeys(value).every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return [...required, ...optional].includes(key) && field.enumerable && Object.hasOwn(field, 'value');
  });
const splitOwnValue = (value, key) => {
  const field = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
  if (!field?.enumerable || !Object.hasOwn(field, 'value')) fail('invalid-split-creation-input', `Split creation requires an own data ${key} field.`);
  return field.value;
};

function reconsiderationMaterialKeys(document, budget) {
  const keys = new Set();
  for (const event of document.history) {
    budget?.charge('validationSteps',1,'reconsideration-material-history');
    if (!event.reconsideration) continue;
    for (const row of [...event.reconsideration.records,...event.reconsideration.sources]) {
      budget?.charge('validationSteps',1,'reconsideration-material-history-row');
      keys.add(splitDigest(row.capture));
    }
  }
  return keys;
}

function selectReconsiderationMaterial(document, captures, allowance) {
  const keys = reconsiderationMaterialKeys(document, allowance);
  return captures.filter(capture => {
    allowance.charge('validationSteps', 1, 'reconsideration-before-material-selection');
    return keys.has(splitDigest(capture.capture));
  });
}

/** Selection of already owned bytes only; no evidence verification or authority. */
export function projectSubjectMaterialCaptures(input, options) {
  const descriptor = options && Object.getOwnPropertyDescriptor(options, 'operationBudget');
  const allowance = getSubjectValidationBudget(descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined);
  allowance.assertActive();
  if (!splitDataObject(options, ['operationBudget']) || !splitDataObject(input, ['registryDocument', 'materialCaptures']))
    fail('invalid-material-projection', 'Supply the fixed material projection and authentic operation.');
  const { registryDocument, materialCaptures } = input;
  allowance.guard(registryDocument, 'reconsideration-material-projection-document');
  const own = (value, key) => {
    const field = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    if (!field?.enumerable || !Object.hasOwn(field, 'value'))
      fail('invalid-material-projection', 'History and locator metadata require own enumerable data.');
    return field.value;
  };
  const locator = value => splitDataObject(value, ['file', 'blob', 'sha256'], ['source'])
    && (!Object.hasOwn(value, 'source') || splitDataObject(value.source, ['commit', 'tree'])) && isCaptureLocator(value);
  const history = own(registryDocument, 'history');
  if (!Array.isArray(history) || !Array.isArray(materialCaptures)
    || Object.getPrototypeOf(materialCaptures) !== Array.prototype)
    fail('invalid-material-projection', 'Supply a history document and dense material capture list.');
  allowance.charge('validationSteps', materialCaptures.length + 1, 'reconsideration-material-projection-population');
  const keys = Reflect.ownKeys(materialCaptures);
  if (keys.length !== materialCaptures.length + 1)
    fail('invalid-material-projection', 'Material capture arrays must have only dense own indices.');
  for (let index = 0; index < materialCaptures.length; index++) {
    const field = Object.getOwnPropertyDescriptor(materialCaptures, String(index));
    if (!field?.enumerable || !Object.hasOwn(field, 'value')
      || !splitDataObject(field.value, ['capture', 'bytes', 'objectFormat']))
      fail('invalid-material-projection', 'Material rows must contain own data fields.');
    allowance.guard({ capture: field.value.capture, objectFormat: field.value.objectFormat }, 'reconsideration-material-projection-locator');
    if (!locator(field.value.capture) || !Buffer.isBuffer(field.value.bytes)
      || !['sha1', 'sha256'].includes(field.value.objectFormat))
      fail('invalid-material-projection', 'Material rows require original bytes and exact locators.');
  }
  for (const event of history) {
    allowance.charge('validationSteps', 1, 'reconsideration-material-projection-history-shape');
    if (!object(event))
      fail('invalid-material-projection', 'Material history requires complete source and record arrays.');
    if (!Object.hasOwn(event, 'reconsideration')) continue;
    const material = own(event, 'reconsideration');
    for (const kind of ['records', 'sources']) {
      const rows = own(material, kind);
      if (!Array.isArray(rows)) fail('invalid-material-projection', 'Material history requires explicit arrays.');
      for (const row of rows) {
        allowance.charge('validationSteps', 1, 'reconsideration-material-projection-history-locator');
        if (!locator(own(row, 'capture'))) fail('invalid-material-projection', 'Material history requires exact locators.');
      }
    }
  }
  const selected = selectReconsiderationMaterial(registryDocument, materialCaptures, allowance);
  const selectedObjects = new Set(selected), excludedLocators = [];
  for (const capture of materialCaptures) {
    allowance.charge('validationSteps', 1, 'reconsideration-material-projection-report');
    if (!selectedObjects.has(capture)) excludedLocators.push(capture.capture);
  }
  return { selected, excludedLocators };
}

/** Two supplied actual models; no Git membership, affected-use or publication authority. */
export function validateSubjectSplitCreation(input, options = {}) {
  let allowance;
  const result = { ok: false, governance: null, publicationReady: false, diagnostics: [], used: null,
    allocation: null, assessment: null, resources: { allocation: null } };
  const finish = diagnostics => {
    if (diagnostics) result.diagnostics.push(...diagnostics);
    result.used = allowance?.used ?? null; return result;
  };
  try {
    if (!splitDataObject(input, ['beforeModel', 'candidateModel', 'beforeCaptures', 'decisionCaptures', 'operation', 'allocationLimits'], ['assessmentCaptures', 'materialCaptures', 'budget'])
      || !splitDataObject(options, [], ['operationBudget'])
      || Object.hasOwn(input, 'budget') === Object.hasOwn(options, 'operationBudget')) {
      fail('invalid-split-creation-input', 'Supply closed split creation input and exactly one governance allowance source.');
    }
    if (Object.hasOwn(input, 'budget')) {
      if (!splitDataObject(input.budget, ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits', 'maxSubjects', 'maxHistoryRows', 'maxValidationSteps'])) {
        fail('invalid-split-creation-input', 'Standalone governance limits require own data fields.');
      }
      allowance = createSubjectValidationBudget(input.budget);
    } else allowance = getSubjectValidationBudget(options.operationBudget);
    allowance.assertActive();
    const { operation, allocationLimits, beforeCaptures } = input;
    if (!splitDataObject(operation, ['id', 'subject', 'successors', 'registryEvents'])
      || !splitDataObject(allocationLimits, ['maxLedgerRows', 'maxSuccessors'])) {
      fail('invalid-split-creation-input', 'Supply the exact split operation projection and allocation limits.');
    }
    allowance.guard(operation, 'split-creation-operation');
    if (!isIdentityUuid(operation.id) || !parseCanonicalId('subject', operation.subject).ok
      || !Array.isArray(operation.successors) || operation.successors.length < 2
      || !Array.isArray(operation.registryEvents) || operation.registryEvents.length !== 2
      || !operation.registryEvents.every(event => splitDataObject(event, ['id', 'changeDigest']) && isIdentityUuid(event.id) && digest(event.changeDigest))
      || operation.registryEvents[0].id === operation.registryEvents[1].id) {
      fail('invalid-split-creation-input', 'Split creation requires canonical participants and exactly two distinct ordered event bindings.');
    }
    const models = { before: input.beforeModel, candidate: input.candidateModel };
    const documents = {}; const identities = {}; const indexes = {};
    for (const [side, model] of Object.entries(models)) {
      if (splitOwnValue(model, 'ok') !== true) fail('input-mismatch', 'Split creation requires two healthy actual models.');
      const registry = splitOwnValue(model, 'subjectRegistry');
      documents[side] = splitOwnValue(registry, 'document');
      identities[side] = splitOwnValue(model, 'identity');
      indexes[side] = splitOwnValue(model, 'identityIndex');
      allowance.guard(documents[side], `split-${side}-registry`);
      if (!object(documents[side]) || !Array.isArray(documents[side].history) || !documents[side].history.every(object)
        || !Array.isArray(documents[side].subjects) || !documents[side].subjects.every(object)) {
        fail('input-mismatch', 'Split creation requires complete registry documents.');
      }
    }
    const { before, candidate } = documents;
    if (candidate.history.length !== before.history.length + 2
      || !splitSame(candidate.history.slice(0, before.history.length), before.history)) {
      fail('invalid-split-creation', 'The actual candidate must preserve history and append exactly activation then split.');
    }
    const [activation, split] = candidate.history.slice(-2);
    if (!object(activation) || !object(split) || activation.action !== 'activate' || split.action !== 'split'
      || !Array.isArray(activation.rows) || !Array.isArray(split.rows)
      || !validRef(activation.decision, before.namespace, 'decision') || !validRef(split.decision, before.namespace, 'decision')
      || !splitSame([activation, split].map(event => ({ id: event.id, changeDigest: event.review?.changeDigest })), operation.registryEvents)
      || !splitSame(activation.rows.map(row => row?.id), operation.successors)
      || split.rows.length !== 1 || split.rows[0]?.id !== operation.subject
      || !splitSame(split.rows[0]?.after?.retirement?.successors ?? null, operation.successors)
      || !text(activation.review?.reference)) {
      fail('invalid-split-creation', 'Actual event suffix, source and successor order must equal the requested operation.');
    }
    const source = before.subjects.find(row => row.id === operation.subject);
    if (source?.status !== 'active' || !parseCanonicalId('subject', source.id).ok) {
      fail('invalid-split-creation', 'The source must already be an active canonical meaning in the actual before registry.');
    }
    // This sole invocation admits both ledger populations before identity guards,
    // hashing or planning. Its exact native proof is never recomputed here.
    const allocation = validateSubjectSplitAllocation({ beforeIdentity: identities.before, candidateIdentity: identities.candidate,
      successors: operation.successors, publication: { id: operation.id, review: activation.review.reference } },
    { limits: allocationLimits, operationBudget: allowance });
    result.resources.allocation = allocation.resources;
    if (!allocation.ok) return finish(allocation.diagnostics);
    result.allocation = allocation.allocation;
    for (const side of ['before', 'candidate']) {
      const descriptor = getIdentityIndexDescriptor(indexes[side]);
      if (descriptor.identityFormat !== 1 || descriptor.identityDigest !== splitDigest(identities[side])
        || descriptor.namespace !== documents[side].namespace) fail('input-mismatch', 'Each model must own its coherent actual identity index.');
    }

    // Preflight only referenced public authorizer shells before legacy binding
    // reads them. Historical status and record validity remain its responsibility.
    for (const side of ['before', 'candidate']) {
      allowance.charge('validationSteps', 1, `split-${side}-authorizer-map`);
      const decisions = splitOwnValue(models[side], 'decisions');
      if (!types.isMap(decisions) || Object.getPrototypeOf(decisions) !== Map.prototype || Object.hasOwn(decisions, 'get')) {
        fail('input-mismatch', 'Actual Decision maps must retain native Map access.');
      }
      for (const event of [...documents[side].history, activation]) {
        allowance.charge('validationSteps', 1, `split-${side}-authorizer-shell`);
        const ref = event.decision;
        if (!validRef(ref, documents[side].namespace, 'decision')) fail('invalid-split-creation-input', 'History requires qualified Decision references.');
        const entry = Map.prototype.get.call(decisions, ref.id);
        if (entry === undefined) continue;
        splitOwnValue(entry, 'record');
        for (const field of ['id', 'identity']) if (Object.hasOwn(entry, field)) splitOwnValue(entry, field);
      }
    }

    // Allocation admission deliberately precedes capture admission. Any later
    // failure retains only a partial allocation observation, never governance.
    const admitCapture = (capture, phase) => {
      allowance.charge('validationSteps', 1, phase);
      if (!splitDataObject(capture, ['capture', 'bytes', 'objectFormat']) || !Buffer.isBuffer(capture.bytes)) {
        fail('invalid-split-creation-input', 'Supply complete raw evidence wrappers.');
      }
      allowance.admitCapture(capture); allowance.guard(capture.capture, `${phase}-locator`);
      if (!verifyCapturedBytes({ locator: capture.capture, bytes: capture.bytes, objectFormat: capture.objectFormat }).ok) {
        fail('invalid-evidence', 'Every supplied split capture must retain its exact byte integrity.');
      }
    };
    const readList = (list, phase) => {
      if (!Array.isArray(list)) fail('invalid-split-creation-input', 'Evidence lists must be dense arrays.');
      const values = [];
      for (let index = 0; index < list.length; index += 1) {
        allowance.charge('validationSteps', 1, phase);
        values.push(splitOwnValue(list, String(index)));
      }
      if (Reflect.ownKeys(list).length !== list.length + 1) fail('invalid-split-creation-input', 'Evidence arrays cannot carry extra fields.');
      return values;
    };
    const decisionCaptures = readList(input.decisionCaptures, 'split-decision-captures');
    const materialCaptures = Object.hasOwn(input, 'materialCaptures')
      ? readList(input.materialCaptures, 'split-material-captures') : [];
    if (Object.hasOwn(input, 'materialCaptures')) for (const capture of materialCaptures) admitCapture(capture, 'split-material-capture');
    const assessmentCaptures = [beforeCaptures, ...readList(Object.hasOwn(input, 'assessmentCaptures') ? input.assessmentCaptures : [], 'split-assessment-captures')];
    for (const capture of decisionCaptures) admitCapture(capture, 'split-decision-capture');
    const seen = new Set();
    for (const pair of assessmentCaptures) {
      allowance.charge('validationSteps', 1, 'split-assessment-pair');
      if (!splitDataObject(pair, ['registry', 'identity'])) fail('invalid-split-creation-input', 'Supply exactly the retained registry and identity pair.');
      for (const part of ['registry', 'identity']) admitCapture(pair[part], 'split-assessment-capture');
      const key = splitDigest(pair.registry.capture);
      if (seen.has(key)) fail('invalid-refusal-assessment', 'The actual before pair and historical pairs must occur exactly once.');
      seen.add(key);
    }
    const assessment = verifyRefusalAssessment(activation, [beforeCaptures], allowance);
    if (assessment.status !== 'verified') fail('assessment-evidence-unavailable', 'The activation requires the supplied exact before pair.');
    if (!splitSame(assessment.registry.document, before) || !splitSame(assessment.identity, identities.before)) {
      fail('input-mismatch', 'The retained assessment pair must equal the actual before registry and ledger.');
    }
    result.assessment = { verification: assessment.status, refusalSetDigest: assessment.refusalSetDigest,
      evidence: assessment.evidence, semanticCompleteness: 'asserted-in-reviewed-evidence' };

    const selected = [];
    for (const side of ['before', 'candidate']) {
      const model = models[side];
      const stores = splitOwnValue(model, 'stores');
      const decisionsStore = splitOwnValue(stores, 'decisions');
      if (splitOwnValue(decisionsStore, 'present') !== true) fail('ineffective-authorizer', 'Both actual models require the existing selected Decision store.');
      const decisions = splitOwnValue(model, 'decisions');
      if (!(decisions instanceof Map)) fail('input-mismatch', 'Both actual models require their captured Decision maps.');
      const { resolved, recordDigest } = authorizerResolver(indexes[side], allowance, `split-${side}-authorizer`, true)(activation.decision);
      if (resolved.status !== 'loaded' || !accepted(resolved.entry.record.status)) {
        fail('ineffective-authorizer', 'The selected authorizer must already be loaded and accepted/addressed on both sides.');
      }
      const entry = Map.prototype.get.call(decisions, activation.decision.id);
      const record = splitOwnValue(entry, 'record'); allowance.guard(record, `split-${side}-model-authorizer`);
      for (const field of ['id', 'identity']) if (Object.hasOwn(entry, field)) splitOwnValue(entry, field);
      if (!recordIdentityMatches('decision', activation.decision.id, entry) || !splitSame(record, resolved.entry.record)
        || record.status !== activation.review.acceptedStatus || recordDigest !== activation.review.decisionDigest) {
        fail('authorizer-capture-mismatch', 'Each actual selected Decision must equal its private index and the reviewed full record.');
      }
      selected.push(record);
    }
    if (!splitSame(selected[0], selected[1])) fail('authorizer-capture-mismatch', 'The full selected Decision record must be unchanged across actual models.');

    const prior = evaluateGovernance({ registry: models.before.subjectRegistry, identity: identities.before,
      identityIndex: indexes.before, decisionCaptures, assessmentCaptures, materialCaptures }, { operationBudget: allowance }, true);
    if (!prior.ok) return finish(prior.diagnostics);
    const priorBinding = bindGovernanceCapture(prior.governance, { model: models.before }, { operationBudget: allowance }, true);
    if (!priorBinding.ok) return finish(priorBinding.diagnostics);
    const eligible = (handle, id, purpose, policy) => {
      const outcome = subjectEligibility(handle, id, { purpose, policy, operationBudget: allowance });
      if (outcome.eligible !== true || outcome.verification !== 'verified' || outcome.resolution.id !== id) {
        fail('governance-unavailable', 'Split participants require verified eligibility in their own actual model.');
      }
    };
    eligible(prior.governance, operation.subject, 'query', 'current');
    const checked = validateTransition({ before, candidate, model: models.candidate, identityIndex: indexes.candidate,
      decisionCaptures, assessmentCaptures, materialCaptures }, { assessedActivation: true, splitCreation: true, budget: allowance });
    if (!checked.ok) return finish(checked.diagnostics);
    const binding = bindGovernanceCapture(checked.governance, { model: models.candidate }, { operationBudget: allowance }, true);
    if (!binding.ok) return finish(binding.diagnostics);
    eligible(checked.governance, operation.subject, 'query', 'historical');
    for (const id of operation.successors) eligible(checked.governance, id, 'new-assignment', 'current');
    allowance.assertActive(); result.ok = true; result.governance = checked.governance; return finish();
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof IdentityOperationError || error instanceof CapturedInputError)) throw error;
    return finish([{ code: error.code, path: '', message: error.message,
      ...(error.counter ? { counter: error.counter, phase: error.phase } : {}) }]);
  }
}

/** Fixed reconsideration model boundary; no Git membership or publication authority. */

export function validateSubjectReconsiderationCreation(input, options = {}) {
  let allowance;
  const result = { ok: false, governance: null, publicationReady: false, diagnostics: [], used: null,
    allocation: null, assessment: null, resources: { allocation: null }
  };
  const finish = diagnostics => {
    if (diagnostics) result.diagnostics.push(...diagnostics);
    result.used = allowance?.used ?? null;
    return result;
  };
  const invalid = message => fail('invalid-reconsideration-creation-input', message);
  const own = (value, key) => {
    const field = value && typeof value === 'object'?Object.getOwnPropertyDescriptor(value, key): undefined;
    if (!field?.enumerable || !Object.hasOwn(field, 'value'))
      invalid(`Reconsideration requires own data ${key}.`);
    return field.value;
  };
  try {
    if (!splitDataObject(input, ['beforeModel', 'candidateModel', 'beforeCaptures', 'decisionCaptures', 'materialCaptures', 'operation', 'allocationLimits'], ['assessmentCaptures', 'budget'])
      || !splitDataObject(options, [], ['operationBudget'])
      || Object.hasOwn(input, 'budget') === Object.hasOwn(options, 'operationBudget'))
      invalid('Supply closed inputs and exactly one governance allowance.');
    if (Object.hasOwn(input, 'budget')) {
      if (!splitDataObject(input.budget, ['maxCaptureBytes', 'maxDocumentNodes', 'maxDocumentTextUnits', 'maxSubjects', 'maxHistoryRows', 'maxValidationSteps']))
        invalid('Standalone limits require own data fields.');
      allowance = createSubjectValidationBudget(input.budget);
    } else allowance = getSubjectValidationBudget(options.operationBudget);
    allowance.assertActive();
    const { operation, allocationLimits, beforeCaptures } = input;
    if (!splitDataObject(operation, ['id', 'proposal', 'subject', 'registryEvent'])
      || !splitDataObject(allocationLimits, ['maxLedgerRows']))
      invalid('Supply the fixed operation and allocation limits.');
    allowance.guard(operation, 'reconsideration-operation');
    if (!isIdentityUuid(operation.id)
      || !parseProposalKey('subject', operation.proposal).ok
      || !parseCanonicalId('subject', operation.subject).ok
      || !splitDataObject(operation.registryEvent, ['id', 'changeDigest'])
      || !isIdentityUuid(operation.registryEvent.id)
      || !digest(operation.registryEvent.changeDigest))
      invalid('Select one proposal, canonical Subject and event binding.');
    const models = { before: input.beforeModel, candidate: input.candidateModel };
    const documents = {}, identities = {}, indexes = {};
    for (const [side, model] of Object.entries(models)) {
      if (own(model, 'ok') !== true)
        fail('input-mismatch', 'Reconsideration requires healthy actual models.');
      documents[side] = own(own(model, 'subjectRegistry'), 'document');
      identities[side] = own(model, 'identity');
      indexes[side] = own(model, 'identityIndex');
      allowance.guard(documents[side], `reconsideration-${side}-registry`);
      if (!object(documents[side])
        || !Array.isArray(documents[side].history)
        || !documents[side].history.every(object)
        || !Array.isArray(documents[side].subjects)
        || !documents[side].subjects.every(object))
        fail('input-mismatch', 'Both registry documents must be complete.');
    }
    const { before, candidate } = documents;
    if (candidate.history.length !== before.history.length + 1
      || !splitSame(candidate.history.slice(0, -1), before.history))
      fail('invalid-reconsideration-creation', 'Retain the exact history prefix and append one activation.');
    const event = candidate.history.at(-1);
    if (!object(event)
      || event.action !== 'activate'
      || !validRef(event.decision, before.namespace, 'decision')
      || !object(event.review)
      || !text(event.review.reference)
      || event.id !== operation.registryEvent.id
      || event.review.changeDigest !== operation.registryEvent.changeDigest
      || !Array.isArray(event.rows)
      || event.rows.length !== 1
      || event.rows[0]?.id !== operation.subject
      || event.promotes?.key !== operation.proposal)
      fail('invalid-reconsideration-creation', 'The actual suffix must equal the fixed requested activation.');
    const allocation = validateSubjectCreationAllocation({ beforeIdentity: identities.before, candidateIdentity: identities.candidate,
        subject: operation.subject, publication: { id: operation.id, review: event.review.reference }}, { limits: allocationLimits, operationBudget: allowance });
    result.resources.allocation = allocation.resources;
    if (!allocation.ok)
      return finish(allocation.diagnostics);
    result.allocation = allocation.allocation;
    for (const side of ['before', 'candidate']) {
      const descriptor = getIdentityIndexDescriptor(indexes[side]);
      if (descriptor.identityFormat !== 1
        || descriptor.namespace !== documents[side].namespace
        || descriptor.identityDigest !== result.allocation[`${side}IdentityDigest`])
        fail('input-mismatch', 'Both models must own the exact allocated identity captures.');
      const decisions = own(models[side], 'decisions');
      if (!types.isMap(decisions)
        || Object.getPrototypeOf(decisions) !== Map.prototype
        || Object.hasOwn(decisions, 'get'))
        fail('input-mismatch', 'Decision maps must retain native access.');
      for (const item of [...documents[side].history, event]) {
        allowance.charge('validationSteps', 1, `reconsideration-${side}-authorizer-shell`);
        if (!validRef(item.decision, documents[side].namespace, 'decision'))
          invalid('History authorizers must be qualified Decision references.');
        const entry = Map.prototype.get.call(decisions, item.decision.id);
        if (entry !== undefined) {
          own(entry, 'record');
          for (const key of ['id', 'identity']) if (Object.hasOwn(entry, key)) own(entry, key);
        }
      }
    }
    const list = (value, phase) => {
      if (!Array.isArray(value))
        invalid('Capture lists must be dense arrays.');
      const rows = [];
      for (let i = 0; i < value.length; i++) {
        allowance.charge('validationSteps', 1, phase);
        rows.push(own(value, String(i)));
      }
      if (Reflect.ownKeys(value).length !== value.length + 1)
        invalid('Capture lists cannot carry extra fields.');
      return rows;
    };
    const admit = (capture, phase) => {
      allowance.charge('validationSteps', 1, phase);
      if (!splitDataObject(capture, ['capture', 'bytes', 'objectFormat'])
        || !Buffer.isBuffer(capture.bytes))
        invalid('Raw evidence requires exact capture wrappers.');
      allowance.admitCapture(capture);
      allowance.guard(capture.capture, `${phase}-locator`);
      if (!verifyCapturedBytes({ locator: capture.capture, bytes: capture.bytes, objectFormat: capture.objectFormat }).ok)
        fail('invalid-evidence', 'Retained bytes differ from their exact capture.');
    };
    const decisionCaptures = list(input.decisionCaptures, 'reconsideration-decision-list');
    const materialCaptures = list(input.materialCaptures, 'reconsideration-material-list');
    const assessmentCaptures = [beforeCaptures, ...list(Object.hasOwn(input, 'assessmentCaptures')?input.assessmentCaptures: [], 'reconsideration-assessment-list')];
    for (const capture of decisionCaptures) admit(capture, 'reconsideration-decision-capture');
    const materialKeys = new Set();
    for (const capture of materialCaptures) {
      admit(capture, 'reconsideration-material-capture');
      const key = splitDigest(capture.capture);
      if (materialKeys.has(key))
        fail('invalid-reconsideration-evidence', 'Material capture locators cannot repeat.');
      materialKeys.add(key);
    }
    const seen = new Set();
    for (const pair of assessmentCaptures) {
      allowance.charge('validationSteps', 1, 'reconsideration-assessment-pair');
      if (!splitDataObject(pair, ['registry', 'identity']))
        invalid('Assessment pairs require exactly registry and identity.');
      for (const part of ['registry', 'identity']) admit(pair[part], 'reconsideration-assessment-capture');
      const key = splitDigest(pair.registry.capture);
      if (seen.has(key))
        fail('invalid-reconsideration-evidence', 'Original and historical assessment pairs cannot repeat.');
      seen.add(key);
    }
    validateReconsiderationEvent(event, before.namespace, allowance);
    const assessment = verifySubjectReconsiderationEvidence(event, [beforeCaptures], materialCaptures, allowance);
    if (assessment.status !== 'verified')
      fail('assessment-evidence-unavailable', 'Complete reconsideration source and material bytes are required.');
    if (!splitSame(assessment.registry.document, before)
      || !splitSame(assessment.identity, identities.before))
      fail('input-mismatch', 'Original assessed bytes differ from the actual before model.');
    const expectedMaterial = reconsiderationMaterialKeys(candidate, allowance);
    if ([...materialKeys].some(key => !expectedMaterial.has(key)))
      fail('invalid-reconsideration-evidence', 'Unrelated material captures are not part of this history.');
    result.assessment = { verification: assessment.status, refusalSetDigest: assessment.refusalSetDigest, evidence: assessment.evidence, semanticCompleteness: assessment.semanticCompleteness };
    const selected = [];
    for (const side of ['before', 'candidate']) {
      if (own(own(own(models[side], 'stores'), 'decisions'), 'present') !== true)
        fail('ineffective-authorizer', 'Both models require the selected Decision store.');
      const { resolved, recordDigest } = authorizerResolver(indexes[side], allowance, `reconsideration-${side}-authorizer`, true)(event.decision);
      if (resolved.status !== 'loaded' || !accepted(resolved.entry.record.status))
        fail('ineffective-authorizer', 'The new Decision must already be loaded and effective on both sides.');
      const entry = Map.prototype.get.call(own(models[side], 'decisions'), event.decision.id);
      const record = own(entry, 'record');
      allowance.guard(record, `reconsideration-${side}-current-authorizer`);
      if (!recordIdentityMatches('decision', event.decision.id, entry)
        || !splitSame(record, resolved.entry.record)
        || record.status !== event.review.acceptedStatus
        || recordDigest !== event.review.decisionDigest)
        fail('authorizer-capture-mismatch', 'Both current authorizers must match their authentic indexes and selected review.');
      selected.push(record);
    }
    if (!splitSame(selected[0], selected[1]))
      fail('authorizer-capture-mismatch', 'The new current Decision must remain fully unchanged.');
    const beforeMaterial = selectReconsiderationMaterial(before, materialCaptures, allowance);
    const prior = evaluateGovernance({ registry: models.before.subjectRegistry, identity: identities.before, identityIndex: indexes.before,
        decisionCaptures, assessmentCaptures, materialCaptures: beforeMaterial }, { operationBudget: allowance }, true);
    if (!prior.ok)
      return finish(prior.diagnostics);
    const priorBinding = bindGovernanceCapture(prior.governance, { model: models.before }, { operationBudget: allowance }, true);
    if (!priorBinding.ok)
      return finish(priorBinding.diagnostics);
    if (evaluations.get(prior.governance).verification.get(event.priorRefusal) !== 'verified')
      fail('governance-unavailable', 'The prior refusal must have verified historical evidence.');
    const checked = validateTransition({ before, candidate, model: models.candidate, identityIndex: indexes.candidate, decisionCaptures, assessmentCaptures, materialCaptures },
      { assessedActivation: true, reconsiderationCreation: true, budget: allowance });
    if (!checked.ok)
      return finish(checked.diagnostics);
    const bound = bindGovernanceCapture(checked.governance, { model: models.candidate }, { operationBudget: allowance }, true);
    if (!bound.ok)
      return finish(bound.diagnostics);
    const eligibility = subjectEligibility(checked.governance, operation.subject, { purpose: 'new-assignment', policy: 'current', operationBudget: allowance });
    if (eligibility.eligible !== true || eligibility.verification !== 'verified')
      fail('governance-unavailable', 'Activation depends on complete prior refusal and reconsideration verification.');
    allowance.assertActive();
    result.ok = true;
    result.governance = checked.governance;
    return finish();
  } catch (error) {
    if (!(error instanceof SubjectError
      || error instanceof IdentityOperationError
      || error instanceof CapturedInputError))
      throw error;
    return finish([{ code: error.code, path: '', message: error.message, ...(error.counter?{ counter: error.counter, phase: error.phase }: {})}]);
  }
}

/** Fixed one-Subject ordinary creation. Legacy activation/promotion entrypoints stay unchanged. */
export function validateSubjectOrdinaryCreation(input, options) {
  let allowance;
  const result = { ok: false, governance: null, publicationReady: false, diagnostics: [], used: null,
    allocation: null, assessment: null, resources: { allocation: null } };
  const finish = diagnostics => { if (diagnostics) result.diagnostics.push(...diagnostics); result.used = allowance?.used ?? null; return result; };
  const invalid = message => fail('invalid-subject-creation-input', message);
  try {
    const descriptor = options && Object.getOwnPropertyDescriptor(options, 'operationBudget');
    allowance = getSubjectValidationBudget(descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined);
    allowance.assertActive();
    if (!splitDataObject(options, ['operationBudget']) || !splitDataObject(input,
      ['beforeModel', 'candidateModel', 'beforeCaptures', 'decisionCaptures', 'assessmentCaptures', 'materialCaptures', 'operation', 'allocationLimits']))
      invalid('Supply the closed ordinary creation model input and one authentic allowance.');
    const { operation, allocationLimits } = input;
    allowance.guard({ operation, allocationLimits }, 'subject-creation-operation');
    if (!splitDataObject(operation, ['id', 'action', 'proposal', 'subject', 'registryEvent'])
      || !isIdentityUuid(operation.id) || !['activate', 'promote-proposal'].includes(operation.action)
      || (operation.action === 'activate' ? operation.proposal !== null : !parseProposalKey('subject', operation.proposal).ok)
      || !parseCanonicalId('subject', operation.subject).ok
      || !splitDataObject(operation.registryEvent, ['id', 'changeDigest'])
      || !isIdentityUuid(operation.registryEvent.id) || !digest(operation.registryEvent.changeDigest)) invalid('Select one fixed ordinary activation.');
    const docs = {}, identities = {}, indexes = {};
    for (const [side, model] of [['before', input.beforeModel], ['candidate', input.candidateModel]]) {
      if (splitOwnValue(model, 'ok') !== true) invalid('Both actual models must be healthy.');
      docs[side] = splitOwnValue(splitOwnValue(model, 'subjectRegistry'), 'document');
      identities[side] = splitOwnValue(model, 'identity'); indexes[side] = splitOwnValue(model, 'identityIndex');
      allowance.guard(docs[side], `subject-creation-${side}-registry`);
      if (!object(docs[side]) || !Array.isArray(docs[side].subjects) || !docs[side].subjects.every(object)
        || !Array.isArray(docs[side].history) || !docs[side].history.every(object)) invalid('Both registry documents must be complete.');
      const decisions = splitOwnValue(model, 'decisions');
      if (!(decisions instanceof Map) || Object.getPrototypeOf(decisions) !== Map.prototype || Object.hasOwn(decisions, 'get'))
        invalid('Actual Decision maps must retain native lookup.');
      for (const event of docs[side].history) {
        allowance.charge('validationSteps', 1, `subject-creation-${side}-authorizer-shell`);
        if (!validRef(event.decision, docs[side].namespace, 'decision')) invalid('History requires typed Decision references.');
        const entry = Map.prototype.get.call(decisions, event.decision.id);
        splitOwnValue(entry, 'record');
        for (const key of ['id', 'identity']) if (Object.hasOwn(entry, key)) splitOwnValue(entry, key);
      }
    }
    const event = docs.candidate.history.at(-1);
    if (docs.candidate.history.length !== docs.before.history.length + 1
      || !splitSame(docs.candidate.history.slice(0, -1), docs.before.history)
      || !object(event) || event.action !== 'activate' || !Array.isArray(event.rows) || event.rows.length !== 1
      || event.rows[0]?.id !== operation.subject || event.id !== operation.registryEvent.id
      || event.review?.changeDigest !== operation.registryEvent.changeDigest
      || (operation.action === 'promote-proposal' ? event.promotes?.key !== operation.proposal : Object.hasOwn(event, 'promotes'))
      || ['reconsideration', 'reconsiderationAssessment', 'priorRefusal'].some(key => Object.hasOwn(event, key)))
      invalid('Only the requested ordinary one-Subject event may be appended.');
    const allocation = validateSubjectCreationAllocation({ beforeIdentity: identities.before, candidateIdentity: identities.candidate,
      subject: operation.subject, publication: { id: operation.id, review: event.review.reference } },
    { limits: allocationLimits, operationBudget: allowance });
    result.resources.allocation = allocation.resources;
    if (!allocation.ok) return finish(allocation.diagnostics);
    result.allocation = allocation.allocation;
    for (const side of ['before', 'candidate']) {
      const model = side === 'before' ? input.beforeModel : input.candidateModel;
      const store = splitOwnValue(splitOwnValue(model, 'stores'), 'decisions');
      if (splitOwnValue(store, 'present') !== true) invalid('Both actual models require the selected Decision store.');
      const entry = Map.prototype.get.call(model.decisions, event.decision.id);
      const record = splitOwnValue(entry, 'record'); allowance.guard(record, `subject-creation-${side}-authorizer`);
      for (const field of ['id', 'identity']) if (Object.hasOwn(entry, field)) splitOwnValue(entry, field);
      const { resolved, recordDigest } = authorizerResolver(indexes[side], allowance, `subject-creation-${side}-index`, true)(event.decision);
      if (resolved.status !== 'loaded' || !accepted(record.status) || !recordIdentityMatches('decision', event.decision.id, entry)
        || !splitSame(record, resolved.entry.record) || record.status !== event.review.acceptedStatus
        || recordDigest !== event.review.decisionDigest) fail('authorizer-capture-mismatch', 'Both actual current authorizers must equal the full reviewed Decision.');
    }
    const list = (rows, phase) => {
      if (!Array.isArray(rows) || Reflect.ownKeys(rows).length !== rows.length + 1) invalid('Captures require dense lists.');
      for (let i = 0; i < rows.length; i++) { allowance.charge('validationSteps', 1, phase); splitOwnValue(rows, String(i)); }
      return rows;
    };
    const decisions = list(input.decisionCaptures, 'subject-creation-decision-list');
    const assessments = list(input.assessmentCaptures, 'subject-creation-assessment-list');
    const material = list(input.materialCaptures, 'subject-creation-material-list');
    for (const pair of [input.beforeCaptures, ...assessments]) {
      if (!splitDataObject(pair, ['registry', 'identity'])) invalid('Retain complete authority pairs.');
    }
    const captures = [...decisions, ...material, ...[input.beforeCaptures, ...assessments].flatMap(pair => [pair.registry, pair.identity])];
    for (const capture of captures) {
      if (!splitDataObject(capture, ['capture', 'bytes', 'objectFormat']) || !Buffer.isBuffer(capture.bytes)) invalid('Retain exact raw capture wrappers.');
      allowance.admitCapture(capture); allowance.guard(capture.capture, 'subject-creation-capture-locator');
      if (!verifyCapturedBytes({ locator: capture.capture, bytes: capture.bytes, objectFormat: capture.objectFormat }).ok)
        fail('invalid-evidence', 'All supplied captures must have intact byte evidence.');
    }
    const projection = projectSubjectMaterialCaptures({ registryDocument: docs.before, materialCaptures: material }, { operationBudget: allowance });
    if (projection.excludedLocators.length) invalid('Ordinary creation accepts only retained historical material.');
    const checked = validateCreation(input, { promotion: operation.action === 'promote-proposal', operationBudget: allowance });
    if (!checked.ok) return finish(checked.diagnostics);
    const eligible = subjectEligibility(checked.governance, operation.subject,
      { purpose: 'new-assignment', policy: 'current', operationBudget: allowance });
    if (eligible.eligible !== true || eligible.verification !== 'verified') fail('governance-unavailable', 'The new Subject requires verified actual eligibility.');
    allowance.assertActive(); result.ok = true; result.governance = checked.governance; result.assessment = checked.assessment;
    return finish();
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof IdentityOperationError || error instanceof CapturedInputError)) throw error;
    return finish([{ code: error.code, path: '', message: error.message,
      ...(error.counter ? { counter: error.counter, phase: error.phase } : {}) }]);
  }
}

function validateCreation({ beforeModel, candidateModel, beforeCaptures, decisionCaptures, assessmentCaptures = [], materialCaptures = [], budget }, { promotion, operationBudget }) {
  let operation;
  const composed = operationBudget !== undefined;
  const equal = composed ? splitSame : same;
  const hash = composed ? splitDigest : canonicalSha256;
  const refused = (diagnostics) => ({ ok: false, governance: null, publicationReady: false,
    diagnostics, used: operation?.used ?? null });
  try {
    operation = composed ? getSubjectValidationBudget(operationBudget) : createSubjectValidationBudget(budget);
    operation.assertActive();
    if (!object(beforeCaptures) || !Array.isArray(decisionCaptures) || !Array.isArray(assessmentCaptures)) {
      fail('invalid-promotion-input', 'Supply retained registry/identity, historical assessment pairs and Decision captures.');
    }
    const retainedAssessments = [beforeCaptures];
    for (let i = 0; i < assessmentCaptures.length; i += 1) {
      const entry = Object.getOwnPropertyDescriptor(assessmentCaptures, String(i));
      if (!entry || !Object.hasOwn(entry, 'value') || !object(entry.value)) {
        fail('invalid-promotion-input', 'Historical assessment captures require a dense array of pair objects.');
      }
      retainedAssessments.push(entry.value);
    }
    const evidence = [beforeCaptures.registry, beforeCaptures.identity, ...decisionCaptures,
      ...retainedAssessments.slice(1).flatMap((pair) => [pair.registry, pair.identity]), ...(composed ? materialCaptures : [])];
    for (const capture of evidence) {
      if (!Buffer.isBuffer(capture?.bytes)) fail('assessment-evidence-unavailable', 'Complete raw before and Decision capture bytes are required.');
      if (composed) operation.admitCapture(capture);
      else operation.charge('captureBytes', capture.bytes.length, 'raw-captures');
    }
    for (const capture of evidence) {
      operation.guard(capture.capture, 'capture-locator');
    }
    const seenPairs = new Set();
    for (const pair of retainedAssessments) {
      for (const part of ['registry', 'identity']) {
        const { capture, bytes, objectFormat } = pair[part];
        if (!verifyCapturedBytes({ locator: capture, bytes, objectFormat }).ok) {
          fail('invalid-refusal-assessment', 'Every supplied assessment pair requires intact raw byte evidence.');
        }
      }
      const key = hash(pair.registry.capture);
      if (seenPairs.has(key)) fail('invalid-refusal-assessment', 'Supplied assessment registry captures cannot repeat.');
      seenPairs.add(key);
    }
    for (const [side, model] of [['before', beforeModel], ['candidate', candidateModel]]) {
      if (!model?.ok || !model.subjectRegistry?.document) fail('input-mismatch', 'Creation requires two healthy models with present subject authority.');
      operation.guard(model.identity, `${side}-identity`);
      operation.guard(model.subjectRegistry.document, `${side}-registry`);
      const index = getIdentityIndexDescriptor(model.identityIndex);
      if (index.identityDigest !== hash(model.identity)
        || index.namespace !== model.subjectRegistry.namespace) fail('input-mismatch', 'Each model must own its coherent identity capture.');
    }
    const before = beforeModel.subjectRegistry.document;
    const candidate = candidateModel.subjectRegistry.document;
    if (candidate.history.length !== before.history.length + 1
      || !equal(candidate.history.slice(0, before.history.length), before.history)) {
      fail('invalid-promotion', 'Creation appends exactly one activation and preserves all prior history.');
    }
    const event = candidate.history.at(-1);
    if (event.action !== 'activate' || !Array.isArray(event.rows) || !event.rows.length || !event.refusalAssessment
      || (promotion ? event.rows.length !== 1 || !object(event.promotes) : Object.hasOwn(event, 'promotes'))) {
      fail('invalid-promotion', 'Creation requires fresh activation rows and complete-scope assessment; promotion additionally retains one exact proposal.');
    }
    if (promotion) {
      const priorProposal = beforeModel.subjectRegistry.proposals.get(event.promotes.key);
      if (!priorProposal || !equal(priorProposal, event.promotes.before) || priorProposal.status !== 'proposed'
        || priorProposal.changes.length || Object.hasOwn(priorProposal, 'refusal')
        || Object.hasOwn(priorProposal, 'retirement') || candidateModel.subjectRegistry.proposals.has(event.promotes.key)) {
        fail('invalid-promotion', 'Promotion must consume the exact existing unrefused proposed entry.');
      }
    }
    for (const row of event.rows) {
      if (!parseCanonicalId('subject', row.id).ok || row.before !== null
        || before.subjects.some((subject) => subject.id === row.id)
        || beforeModel.identity.allocations.some((prior) => prior.kind === 'subject' && prior.id === row.id)) {
        fail('invalid-promotion', 'Every activated canonical identity must be newly occupied in the actual before capture.');
      }
    }
    const assessment = verifyRefusalAssessment(event, [beforeCaptures], operation);
    if (assessment.status !== 'verified') fail('assessment-evidence-unavailable', 'Retained before registry and ledger evidence are required.');
    if (!equal(assessment.registry.document, before) || !equal(assessment.identity, beforeModel.identity)) {
      fail('input-mismatch', 'Reviewed before evidence differs from the actual before model.');
    }
    const result = validateTransition({ before, candidate, model: candidateModel,
      identityIndex: candidateModel.identityIndex, decisionCaptures, assessmentCaptures: retainedAssessments, ...(composed ? { materialCaptures } : {}) },
    { assessedActivation: true, ordinaryCreation: composed, budget: operation });
    if (!result.ok) return refused(result.diagnostics);
    const bound = validateSubjectGovernanceCapture(result.governance, { model: candidateModel }, composed ? { operationBudget: operation } : { budget: operation });
    if (!bound.ok) return refused(bound.diagnostics);
    for (const row of event.rows) {
      const parent = row.after.parent;
      if (parent && candidate.subjects.find((subject) => subject.id === parent)?.status !== 'active') {
        fail('invalid-promotion', 'A new effective child requires an active canonical parent.');
      }
    }
    return { ...result, publicationReady: false, used: operation.used,
      assessment: { verification: assessment.status, refusalSetDigest: assessment.refusalSetDigest,
        evidence: assessment.evidence, semanticCompleteness: 'asserted-in-reviewed-evidence' } };
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof IdentityOperationError || (composed && error instanceof CapturedInputError))) throw error;
    return refused([{ code: error.code, path: '', message: error.message,
      ...(error.counter ? { counter: error.counter, phase: error.phase } : {}) }]);
  }
}
