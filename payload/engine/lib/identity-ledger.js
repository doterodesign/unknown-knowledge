/** Pure new-system occupancy and publication validation (UCS-1234). */
import { CANONICAL_ID_GRAMMARS } from './id-grammars.js';
import { isIdentityUuid, parseCanonicalId } from './record-identity.js';

const CAPACITY = 999999;
const states = new Set(['allocated', 'retired', 'cancelled']);
const nonblank = (value) => typeof value === 'string' && value.trim().length > 0;
const fieldPath = (base, field) => base ? `${base}.${field}` : field;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const keyOf = ({ kind, id }) => `${kind}:${id}`;

function finish(diagnostics) {
  diagnostics.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
  return { ok: diagnostics.length === 0, diagnostics };
}

function closed(value, required, optional, path, diagnostics) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({ code: 'invalid-object', path });
    return false;
  }
  for (const field of required) {
    if (!Object.hasOwn(value, field)) diagnostics.push({ code: 'missing-required', path: fieldPath(path, field) });
  }
  for (const field of Object.keys(value)) {
    if (!required.includes(field) && !optional.includes(field)) {
      diagnostics.push({ code: 'unknown-field', path: fieldPath(path, field) });
    }
  }
  return true;
}

function checkPublication(value, path, diagnostics) {
  if (!closed(value, ['id', 'review'], [], path, diagnostics)) return;
  if (!isIdentityUuid(value.id)) diagnostics.push({ code: 'invalid-publication', path: fieldPath(path, 'id') });
  if (!nonblank(value.review)) diagnostics.push({ code: 'invalid-review', path: fieldPath(path, 'review') });
}

/** Validate current new-system data only; no old-ID correspondence is accepted. */
export function validateIdentityLedger(ledger) {
  const diagnostics = [];
  if (!closed(ledger, ['schema-version', 'identity-format', 'namespace', 'allocations'], ['lineage'], '', diagnostics)) {
    return finish(diagnostics);
  }
  for (const field of ['schema-version', 'identity-format']) {
    if (ledger[field] !== 1) diagnostics.push({ code: 'unsupported-version', path: field });
  }
  if (!isIdentityUuid(ledger.namespace)) diagnostics.push({ code: 'invalid-namespace', path: 'namespace' });
  if (Object.hasOwn(ledger, 'lineage') && closed(ledger.lineage, ['namespace', 'review'], [], 'lineage', diagnostics)) {
    if (!isIdentityUuid(ledger.lineage.namespace) || ledger.lineage.namespace === ledger.namespace) {
      diagnostics.push({ code: 'invalid-lineage', path: 'lineage.namespace' });
    }
    if (!nonblank(ledger.lineage.review)) diagnostics.push({ code: 'invalid-review', path: 'lineage.review' });
  }
  if (!Array.isArray(ledger.allocations)) {
    diagnostics.push({ code: 'invalid-allocations', path: 'allocations' });
    return finish(diagnostics);
  }
  const occupied = new Set();
  const publications = new Map();
  for (const [i, row] of ledger.allocations.entries()) {
    const path = `allocations[${i}]`;
    if (!closed(row, ['id', 'kind', 'state', 'publication'], ['reason'], path, diagnostics)) continue;
    const identity = parseCanonicalId(row.kind, row.id);
    if (!identity.ok) diagnostics.push({ code: identity.code, path: `${path}.${identity.code === 'invalid-kind' ? 'kind' : 'id'}` });
    else {
      const key = keyOf(row);
      if (occupied.has(key)) diagnostics.push({ code: 'duplicate-allocation', path });
      occupied.add(key);
    }
    if (!states.has(row.state)) diagnostics.push({ code: 'invalid-state', path: `${path}.state` });
    if ((row.state !== 'allocated' || Object.hasOwn(row, 'reason')) && !nonblank(row.reason)) {
      diagnostics.push({ code: 'invalid-reason', path: `${path}.reason` });
    }
    checkPublication(row.publication, `${path}.publication`, diagnostics);
    if (isIdentityUuid(row.publication?.id) && nonblank(row.publication.review)) {
      const { id, review } = row.publication;
      if (publications.has(id) && publications.get(id) !== review) {
        diagnostics.push({ code: 'publication-conflict', path: `${path}.publication` });
      }
      publications.set(id, review);
    }
  }
  return finish(diagnostics);
}

/**
 * Plan one kind against an authoritative before ledger; this reserves nothing.
 * Multi-kind bundles plan each kind against that same before ledger and combine
 * their new rows before validation/publication. Counts describe the result.
 */
export function planAllocations(ledger, request) {
  const checked = validateIdentityLedger(ledger);
  if (!checked.ok) return { ok: false, code: 'invalid-ledger', diagnostics: checked.diagnostics };
  const diagnostics = [];
  if (!closed(request, ['kind', 'count', 'publication'], [], '', diagnostics)) {
    return { ok: false, code: 'invalid-allocation-request', diagnostics };
  }
  const { kind, count, publication } = request;
  if (typeof kind !== 'string' || !Object.hasOwn(CANONICAL_ID_GRAMMARS, kind)) {
    diagnostics.push({ code: 'invalid-kind', path: 'kind' });
  }
  if (!Number.isSafeInteger(count) || count < 1) diagnostics.push({ code: 'invalid-count', path: 'count' });
  checkPublication(publication, 'publication', diagnostics);
  if (diagnostics.length) return { ok: false, code: 'invalid-allocation-request', diagnostics: finish(diagnostics).diagnostics };
  if (ledger.allocations.some((row) => row.publication.id === publication.id)) {
    return { ok: false, code: 'publication-already-used' };
  }
  const occupied = new Set(ledger.allocations.filter((row) => row.kind === kind).map((row) => row.id));
  const remaining = CAPACITY - occupied.size;
  if (count > remaining) return { ok: false, code: 'id-space-exhausted', occupied: occupied.size, remaining };
  const ids = [];
  for (let slot = 1; ids.length < count; slot += 1) {
    const id = `${CANONICAL_ID_GRAMMARS[kind].prefix}-${String(slot).padStart(6, '0')}`;
    if (!occupied.has(id)) ids.push(id);
  }
  const rows = ids.map((id) => ({ id, kind, state: 'allocated', publication: { ...publication } }));
  const candidate = structuredClone(ledger);
  candidate.allocations = candidate.allocations.concat(rows);
  return {
    ok: true, ids,
    ledger: candidate,
    occupied: occupied.size + count, remaining: remaining - count,
  };
}

/**
 * Prove retention relative to the supplied published before-state, not arbitrary
 * Git history. A standalone cutover ledger is validated without inventing a
 * pre-cutover allocation history. Publication must recheck the final merged tree.
 */
export function validateIdentityTransition(before, candidate) {
  const diagnostics = [];
  for (const [name, value] of [['before', before], ['candidate', candidate]]) {
    const result = validateIdentityLedger(value);
    diagnostics.push(...result.diagnostics.map((d) => ({ ...d, path: fieldPath(name, d.path) })));
  }
  if (diagnostics.length) return finish(diagnostics);
  if (candidate.namespace !== before.namespace) diagnostics.push({ code: 'namespace-changed', path: 'namespace' });
  if (before.lineage?.namespace !== candidate.lineage?.namespace || before.lineage?.review !== candidate.lineage?.review) {
    diagnostics.push({ code: 'lineage-changed', path: 'lineage' });
  }
  const old = new Map(before.allocations.map((row) => [keyOf(row), row]));
  const current = new Map(candidate.allocations.map((row, i) => [keyOf(row), { row, path: `allocations[${i}]` }]));
  const publications = new Set(before.allocations.map((row) => row.publication.id));
  for (const [key, previous] of old) {
    const found = current.get(key);
    if (!found) {
      diagnostics.push({ code: 'allocation-removed', path: 'allocations', kind: previous.kind, id: previous.id });
      continue;
    }
    const { row, path } = found;
    if (row.publication.id !== previous.publication.id || row.publication.review !== previous.publication.review) {
      diagnostics.push({ code: 'allocation-changed', path: `${path}.publication` });
    }
    if (row.state === previous.state) {
      if (row.reason !== previous.reason) diagnostics.push({ code: 'allocation-changed', path: `${path}.reason` });
    } else if (previous.state !== 'allocated' || row.state === 'allocated') {
      diagnostics.push({ code: 'invalid-state-transition', path: `${path}.state` });
    }
  }
  for (const [key, { row, path }] of current) {
    if (old.has(key)) continue;
    if (row.state !== 'allocated') diagnostics.push({ code: 'invalid-state-transition', path: `${path}.state` });
    if (publications.has(row.publication.id)) diagnostics.push({ code: 'publication-reused', path: `${path}.publication` });
  }
  return finish(diagnostics);
}
