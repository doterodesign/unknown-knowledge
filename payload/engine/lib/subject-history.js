/**
 * Assignment history over an explicitly captured, selected record universe.
 * This checks consistency, not captured-byte authenticity, complete migration
 * scope, subject eligibility, human approval, or publication. Those gates must
 * run separately. Current record.subjects remains the only authored current
 * assignment list; event snapshots describe earlier states, never overrides.
 */
import { readAssignments } from './subject-assignments.js';
import { parseCanonicalId, IdentityOperationError } from './record-identity.js';
import { resolveRecord } from './record-identity-index.js';
import { UUID_V4_PATTERN } from './id-grammars.js';
import { isDeepStrictEqual } from 'node:util';
import { isCaptureLocator } from './capture-locator.js';

const uuid = new RegExp(`^${UUID_V4_PATTERN}(?![\\s\\S])$`);
const kinds = new Set(['knowledge', 'ontology', 'decision']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblank = (value) => typeof value === 'string' && value.trim() !== '';
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (ref) => JSON.stringify([ref.namespace, ref.kind, ref.id]);
const revision = (value) => Number.isSafeInteger(value) && value >= 0;

function validRef(ref, namespace) {
  return object(ref) && ref.namespace === namespace && kinds.has(ref.kind)
    && parseCanonicalId(ref.kind, ref.id).ok;
}

function normalized(state) {
  return state.state === 'known'
    ? { state: 'known', ids: [...state.ids].sort(compare) }
    : { state: 'unknown' };
}

/** Use the actual assignment reader for historical ID/array validation too. */
function snapshot(state) {
  if (!object(state)) return null;
  let record;
  if (state.state === 'unknown') {
    if (Object.keys(state).some((key) => key !== 'state' && key !== 'reason')
      || (Object.hasOwn(state, 'reason') && state.reason !== 'absent')) return null;
    record = {};
  } else if (state.state === 'known') {
    if (Object.keys(state).some((key) => key !== 'state' && key !== 'ids')) return null;
    record = { subjects: state.ids };
  } else return null;
  const result = readAssignments({ record });
  return result.state === 'invalid' ? null : normalized(result);
}

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const exactKeys = (value, required, optional = []) => object(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

function readBaselines(namespace, baselines, path, add) {
  const records = new Map();
  for (const [i, item] of baselines.entries()) {
    const itemPath = `${path}[${i}]`;
    if (!exactKeys(item, ['ref', 'state', 'capture'], ['origin'])) {
      add('invalid-baseline', itemPath, 'expected one exact ref, state and capture declaration');
      continue;
    }
    if (!validRef(item.ref, namespace)) {
      add('invalid-reference', `${itemPath}.ref`, 'baseline requires a canonical reference in this installation');
      continue;
    }
    const key = keyOf(item.ref);
    if (records.has(key)) add('duplicate-baseline', itemPath, 'record has more than one adoption baseline');
    const state = snapshot(item.state);
    if (!state) add('invalid-state', `${itemPath}.state`, 'baseline must preserve valid known or absent assignments');
    if (!isCaptureLocator(item.capture)) {
      add('invalid-capture', `${itemPath}.capture`, 'expected relative file, Git blob, SHA-256 and optional commit/tree source');
    }
    if (Object.hasOwn(item, 'origin') && (!exactKeys(item.origin, ['kind', 'event']) || item.origin.kind !== 'creation'
      || !uuid.test(item.origin.event) || !exactKeys(item.capture, ['file', 'blob', 'sha256']))) {
      add('invalid-creation-origin', `${itemPath}.origin`, 'Creation origin requires its exact event UUID and detached Git content capture, never an adoption fallback.');
    }
    if (!records.has(key)) records.set(key, { ref: { ...item.ref }, baseline: state, declaration: item });
  }
  return records;
}

/**
 * Preserve every prior captured baseline verbatim in field value, including
 * authored ID order. New tracked refs may be appended at revision zero. This
 * does not prove allocation novelty or authorize adoption: publication also
 * needs captured before-state, identity and capture-byte verification gates.
 * @param {{namespace:string,before:object[],after:object[]}} input
 * @returns {{ok:boolean,diagnostics:object[]}}
 */
export function validateBaselineTransition(input) {
  const diagnostics = [];
  const add = (code, path, message) => diagnostics.push({ code, path, message });
  if (!object(input) || typeof input.namespace !== 'string' || !uuid.test(input.namespace)
    || !Array.isArray(input.before) || !Array.isArray(input.after)) {
    add('invalid-input', '', 'expected namespace and captured before/after baseline arrays');
  } else {
    const before = readBaselines(input.namespace, input.before, 'before', add);
    const after = readBaselines(input.namespace, input.after, 'after', add);
    for (const [key, record] of before) {
      if (!after.has(key)) add('removed-baseline', key, 'captured baseline cannot be removed');
      else if (!isDeepStrictEqual(record.declaration, after.get(key).declaration)) {
        add('changed-baseline', key, 'captured baseline cannot be replaced or reset');
      }
    }
  }
  diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
  return { ok: diagnostics.length === 0, diagnostics };
}

/**
 * Inspect retired or occupied-but-unavailable identities using explicitly
 * supplied historical parsed entries. Complete means structural replay and
 * assignment-state comparison only; byte authentication is never claimed.
 * Unavailable captures keep inspectable chain metadata but make this result
 * incomplete. No caller may substitute this for current-record validation.
 * @param {{namespace:string,baselines:object[],events:object[],identityIndex:object,capturedRecords:object[]}} input
 */
export function inspectAssignmentHistory(input) {
  const replay = replayAssignmentHistory(input);
  const diagnostics = [...replay.diagnostics];
  const history = [];
  const unavailable = 'historical-assignment-state-unavailable';
  const add = (code, path, message) => diagnostics.push({ code, path, message });
  const finish = () => {
    diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
    const invalid = diagnostics.some((d) => d.code !== unavailable);
    return { mode: 'history-only', status: invalid ? 'invalid' : diagnostics.length ? 'incomplete' : 'complete',
      captureVerification: 'not-performed', history: invalid ? [] : history, diagnostics };
  };
  if (!replay.ok) return finish();
  if (!Array.isArray(input.capturedRecords) || replay.revisions.length === 0) {
    add('invalid-input', 'capturedRecords', 'historical inspection requires selected history and captured-record array');
    return finish();
  }
  const tracked = new Map(replay.revisions.map((r) => [keyOf(r.ref), r]));
  const captures = new Map();
  for (const [i, item] of input.capturedRecords.entries()) {
    const path = `capturedRecords[${i}]`;
    if (!validRef(item?.ref, input.namespace) || item?.entry?.record?.id !== item.ref.id) {
      add('invalid-reference', path, 'historical entry must match its exact qualified record reference');
      continue;
    }
    const key = keyOf(item.ref);
    if (captures.has(key)) add('duplicate-historical-record', path, 'historical capture identity is ambiguous');
    if (!tracked.has(key)) add('missing-baseline', path, 'historical capture is outside the selected baseline universe');
    if (!isCaptureLocator(item.capture)) add('invalid-capture', path, 'historical entry requires an exact capture locator');
    const state = readAssignments(item.entry);
    if (state.state === 'invalid') add('invalid-historical-record', path, 'historical assignment metadata is invalid');
    else captures.set(key, { state: normalized(state), capture: item.capture });
  }
  for (const row of replay.revisions) {
    const key = keyOf(row.ref);
    let resolution;
    try { resolution = resolveRecord(input.identityIndex, row.ref); } catch (error) {
      if (!(error instanceof IdentityOperationError)) throw error;
      add('invalid-identity-index', key, 'historical inspection requires a real captured identity index');
      continue;
    }
    if (!(resolution.status === 'retired' || resolution.status === 'missing') || !resolution.allocation) {
      add('uninspectable-identity', key, 'expected a retired or occupied-only unavailable identity');
      continue;
    }
    const captured = captures.get(key);
    if (captured && !equal(row.state, captured.state)) {
      add('historical-state-mismatch', key, 'supplied historical assignments disagree with terminal replay state');
    } else if (!captured) {
      add(unavailable, key, 'no captured historical assignment payload supplied; retained event metadata only');
    }
    history.push({ ...row, allocation: resolution.allocation,
      currentCheck: resolution.status === 'retired' ? 'retired' : 'unavailable',
      assignmentStateCheck: captured ? 'matched' : 'unavailable',
      ...(captured ? { capture: structuredClone(captured.capture) } : {}) });
  }
  return finish();
}

/**
 * Validate immutable history independently of input/event/date ordering.
 * Each baseline state is revision zero at adoption, not inferred earlier
 * history. Changed rows form one contiguous chain; unchanged reviews inspect
 * the state at their asserted revision and never increment its change count.
 *
 * @param {{namespace:string, baselines:Array<{ref:object,state:object,capture:object}>, events:object[]}} input
 * @returns {{ok:boolean, diagnostics:Array<{code:string,path:string,message:string}>, revisions:Array<{ref:object,revision:number,state:object}>}}
 */
function replayAssignmentHistory(input) {
  const diagnostics = [];
  const revisions = [];
  const add = (code, path, message) => diagnostics.push({ code, path, message });
  const result = () => ({
    ok: diagnostics.length === 0,
    diagnostics: diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code)),
    revisions: diagnostics.length ? [] : revisions,
  });
  if (!object(input) || typeof input.namespace !== 'string' || !uuid.test(input.namespace)
    || Object.hasOwn(input, 'baseline') || !Array.isArray(input.baselines) || !Array.isArray(input.events)) {
    add('invalid-input', '', 'expected namespace, exact captured adoption baselines and events');
    return result();
  }
  const { namespace, events } = input;
  const records = readBaselines(namespace, input.baselines, 'baselines', add);
  if (diagnostics.length) return result();
  for (const record of records.values()) Object.assign(record, { changes: new Map(), reviews: [] });

  const seenEvents = new Set();
  for (const [i, event] of events.entries()) {
    const path = `events[${i}]`;
    if (!object(event) || !(event['schema-version'] === 1
      || (event['schema-version'] === 2 && ['existing-subjects', 'canonical-creation', 'subject-use-transition'].includes(event.operation))) || typeof event.event !== 'string'
      || !uuid.test(event.event) || event.namespace !== namespace
      || !nonblank(event.beforeInputRef) || !nonblank(event.candidateInputRef)
      || !Array.isArray(event.rows) || event.rows.length === 0) {
      add('invalid-event', path, 'expected version 1 event, exact UUID, namespace, captured inputs and nonempty rows');
      continue;
    }
    if (seenEvents.has(event.event)) add('duplicate-event', path, 'an event may be retained only once');
    seenEvents.add(event.event);
    const seenRows = new Set();
    for (const [j, row] of event.rows.entries()) {
      const rowPath = `${path}.rows[${j}]`;
      if (!validRef(row?.ref, namespace)) {
        add('invalid-reference', `${rowPath}.ref`, 'event row requires a canonical reference in this installation');
        continue;
      }
      const key = keyOf(row.ref);
      if (seenRows.has(key)) add('duplicate-row', rowPath, 'event must have one disposition per record');
      seenRows.add(key);
      const record = records.get(key);
      if (!record) add('missing-baseline', rowPath, 'event target has no captured adoption baseline');
      if (!nonblank(row.reason)) add('missing-reason', rowPath, 'every disposition requires a review reason');
      if (event['schema-version'] === 2 && event.operation === 'canonical-creation') {
        if (!record || row.disposition !== 'created' || row.before !== null || row.beforeCapture !== null
          || row.beforeRevision !== null || row.afterRevision !== 0 || !snapshot(row.after)
          || record.declaration.origin?.kind !== 'creation' || record.declaration.origin.event !== event.event
          || !isDeepStrictEqual(record.declaration.state, row.after) || !isCaptureLocator(row.afterCapture)
          || !exactKeys(row.afterCapture, ['file', 'blob', 'sha256'])
          || !isDeepStrictEqual(record.declaration.capture, row.afterCapture) || record.created) {
          add('invalid-creation-row', rowPath, 'Genesis requires a unique exact baseline/ref/event/after-state/content-capture tie and null prior record at revision zero.');
        } else record.created = true;
        continue;
      }
      const before = snapshot(row.before);
      const after = snapshot(row.after);
      if (!before || !after) {
        add('invalid-state', rowPath, 'event snapshots must preserve valid known or absent assignments');
        continue;
      }
      const changed = !equal(before, after);
      if (!revision(row.beforeRevision) || !revision(row.afterRevision)
        || row.afterRevision - row.beforeRevision !== (changed ? 1 : 0)) {
        add('invalid-revision', rowPath, 'revision increments exactly once for a changed assignment state');
        continue;
      }
      if (row.disposition !== (changed ? 'changed' : 'unchanged')) {
        add('invalid-disposition', rowPath, 'disposition must agree with semantic assignment change');
      }
      if (!record) continue;
      const checked = { before, after, beforeRevision: row.beforeRevision, path: rowPath };
      if (changed) {
        if (record.changes.has(row.beforeRevision)) {
          add('history-fork', rowPath, 'multiple changed rows claim the same record revision');
        } else record.changes.set(row.beforeRevision, checked);
      } else record.reviews.push(checked);
    }
  }

  for (const [key, record] of [...records].sort(([a], [b]) => compare(a, b))) {
    if (Object.hasOwn(record.declaration, 'origin') && !record.created) {
      add('missing-creation-event', key, 'A creation baseline requires its exact originating v2 creation row.');
    }
    const states = [record.baseline];
    for (const [number, change] of [...record.changes].sort(([a], [b]) => a - b)) {
      if (number !== states.length - 1) {
        add('history-gap', change.path, 'changed revision has no complete predecessor chain');
        break;
      }
      if (!equal(states[number], change.before)) {
        add('stale-before', change.path, 'before snapshot disagrees with the preceding captured state');
      }
      states.push(change.after);
    }
    for (const review of record.reviews) {
      if (!states[review.beforeRevision]) add('history-gap', review.path, 'review refers to an unavailable revision');
      else if (!equal(states[review.beforeRevision], review.before)) {
        add('stale-before', review.path, 'unchanged review disagrees with its historical revision');
      }
    }
    const state = states.at(-1);
    revisions.push({ ref: record.ref, revision: states.length - 1, state });
  }
  return result();
}

/**
 * Check captured baseline/event chains without requiring current payloads.
 * This is the same replay used by current and historical validation; it does
 * not authenticate captures, determine affected scope, or authorize publication.
 * @param {{namespace:string,baselines:object[],events:object[]}} input
 * @returns {{ok:boolean,diagnostics:object[],revisions:object[]}}
 */
export function validateAssignmentHistoryChain(input) {
  return replayAssignmentHistory(input);
}

/**
 * Replay selected history and require every terminal state to match the supplied
 * current record. The caller must supply the actual captured current universe;
 * this function never synthesizes absent payloads or selects historical entries.
 * @param {{namespace:string,baselines:object[],events:object[],currentRecords:Iterable<{ref:object,entry:object}>}} input
 * @returns {{ok:boolean,diagnostics:object[],revisions:object[]}}
 */
export function validateAssignmentHistory(input) {
  const replay = replayAssignmentHistory(input);
  if (!replay.ok) return replay;
  const diagnostics = [];
  const add = (code, path, message) => diagnostics.push({ code, path, message });
  const current = new Map();
  const tracked = new Set(replay.revisions.map((row) => keyOf(row.ref)));
  let currentRecords;
  try {
    if (typeof input.currentRecords?.[Symbol.iterator] !== 'function') throw new TypeError();
    currentRecords = [...input.currentRecords];
  } catch {
    add('invalid-input', 'currentRecords', 'current-record iterable could not be consumed completely');
    return { ok: false, diagnostics, revisions: [] };
  }
  for (const [i, item] of currentRecords.entries()) {
    const path = `currentRecords[${i}]`;
    if (!validRef(item?.ref, input.namespace) || item?.entry?.record?.id !== item.ref.id) {
      add('invalid-reference', path, 'current record must match its canonical qualified reference');
      continue;
    }
    const key = keyOf(item.ref);
    if (current.has(key)) add('duplicate-current-record', path, 'current record identity is ambiguous');
    if (!tracked.has(key)) add('missing-baseline', path, 'current record has no captured adoption baseline');
    const state = readAssignments(item.entry);
    if (state.state === 'invalid') add('invalid-current-record', path, 'current assignment metadata is invalid');
    else current.set(key, normalized(state));
  }
  for (const row of replay.revisions) {
    const key = keyOf(row.ref);
    if (!current.has(key)) add('missing-current-record', key, 'tracked history has no valid current record');
    else if (!equal(row.state, current.get(key))) {
      add('current-state-mismatch', key, 'current assignments disagree with retained event history');
    }
  }
  diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
  return { ok: diagnostics.length === 0, diagnostics, revisions: diagnostics.length ? [] : replay.revisions };
}
