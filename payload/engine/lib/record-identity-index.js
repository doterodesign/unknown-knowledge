/** Diagnostic identity index over already captured, parsed inputs. */
import { validateIdentityLedger } from './identity-ledger.js';
import { IdentityOperationError, RECORD_KINDS, isIdentityUuid, parseCanonicalId, recordIdentityMatches } from './record-identity.js';
import { canonicalSha256 } from './canonical-json.js';
import { guardCapturedRecordResult } from './document-budget.js';

const indexes = new WeakMap();
/** @typedef {{file: string, path: string}} Locator */
/** @typedef {Readonly<{namespace: string, identityFormat: number, identityDigest: string}>} IdentityIndex */
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const keyOf = (kind, id) => `${kind}:${id}`;
const nonblank = (value) => typeof value === 'string' && value.trim().length > 0;
const locatorShape = (value) => shape(value, ['file', 'path']) && nonblank(value.file) && typeof value.path === 'string';

function shape(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function capture(value) {
  try {
    return structuredClone(value);
  } catch {
    throw new IdentityOperationError('invalid-model', { reason: 'uncapturable-input' });
  }
}

/**
 * Build an opaque diagnostic index from parsed inputs; no file reads occur.
 * All locator files and declaration targets must already be kit-relative;
 * the loader adapter expands catalog-store-relative targets before this call.
 * Unlike current-record iteration, lookup snapshots entries rather than keeping
 * caller object identity. Returned payloads are copies of that private capture.
 *
 * This is NOT authoritative-ledger acceptance: well-formed duplicate allocation
 * claims are retained for ambiguity diagnostics. All other ledger defects fail.
 * Normal operations must independently require full captured-model health.
 * @param {{identity: object, identitySource: Locator, records: Array<{kind: string, entry: object, locator: Locator}>, declarations: Array<{kind: string, id: string, target: string, locator: Locator}>}} input
 * @returns {IdentityIndex}
 */
export function buildIdentityIndex(input) {
  const data = capture(input);
  if (!shape(data, ['identity', 'identitySource', 'records', 'declarations'])
      || !locatorShape(data.identitySource) || !Array.isArray(data.records) || !Array.isArray(data.declarations)) {
    throw new IdentityOperationError('invalid-model', { reason: 'invalid-index-input' });
  }
  const checked = validateIdentityLedger(data.identity);
  const defects = checked.diagnostics.filter((d) => d.code !== 'duplicate-allocation');
  if (defects.length) {
    throw new IdentityOperationError('invalid-model', { diagnostics: defects });
  }
  const groups = new Map();
  function group(kind, id) {
    const key = keyOf(kind, id);
    if (!groups.has(key)) groups.set(key, { records: [], declarations: [], allocations: [] });
    return groups.get(key);
  }
  for (const item of data.records) {
    const id = item?.entry?.record?.id;
    if (!shape(item, ['kind', 'entry', 'locator']) || !RECORD_KINDS.includes(item.kind)
        || !locatorShape(item.locator) || !recordIdentityMatches(item.kind, id, item.entry)
        || (Object.hasOwn(item.entry, 'file') && item.entry.file !== item.locator.file)) {
      throw new IdentityOperationError('invalid-record');
    }
    group(item.kind, id).records.push(item);
  }
  for (const item of data.declarations) {
    if (!shape(item, ['kind', 'id', 'target', 'locator']) || !RECORD_KINDS.includes(item.kind)
        || !parseCanonicalId(item.kind, item.id).ok || !nonblank(item.target) || !locatorShape(item.locator)) {
      throw new IdentityOperationError('invalid-model', { reason: 'invalid-declaration' });
    }
    group(item.kind, item.id).declarations.push(item);
  }
  data.identity.allocations.forEach((allocation, i) => {
    const path = `${data.identitySource.path ? `${data.identitySource.path}.` : ''}allocations[${i}]`;
    group(allocation.kind, allocation.id).allocations.push({
      allocation, locator: { file: data.identitySource.file, path },
    });
  });
  // Consumers corroborating another ledger capture must compare the full
  // digest, not merely its namespace. This is consistency, never approval.
  const index = Object.freeze({ namespace: data.identity.namespace, identityFormat: 1,
    identityDigest: canonicalSha256(data.identity) });
  indexes.set(index, groups);
  return index;
}

/** Authenticate a real capture without requiring a sentinel record lookup. */
export function getIdentityIndexDescriptor(index) {
  if (!indexes.has(index)) throw new IdentityOperationError('invalid-model', { reason: 'invalid-identity-index' });
  const { namespace, identityFormat, identityDigest } = index;
  return { namespace, identityFormat, identityDigest };
}

/** Exact retained occurrence from the private capture, including its source locator. */
export function getRecordOccurrence(index, ref) {
  const resolved = resolveRecord(index, ref);
  if (resolved.status !== 'loaded' && !(resolved.status === 'retired' && resolved.entry)) return null;
  return capture(indexes.get(index).get(keyOf(ref.kind, ref.id)).records[0]);
}

/**
 * Exact typed identity resolution, separate from edge policy or approval.
 * An invalid result retains the raw reference rather than asserting its shape.
 * @param {IdentityIndex} index owned capture returned by buildIdentityIndex
 * @param {unknown} ref exact qualified reference, validated before lookup
 * @param {{documentBudget:object,phase:string}} [options] authentic shared operation budget
 * One full result walk guards entry.record strictly and permits undefined loader
 * bookkeeping elsewhere. Every occurrence is charged once, in wrapper order;
 * the detached clone still follows successful admission. This bounds logical
 * visits/text, not native allocation or CPU time.
 */
export function resolveRecord(index, ref, options) {
  const groups = indexes.get(index);
  if (!groups) throw new IdentityOperationError('invalid-model', { reason: 'invalid-identity-index' });
  const finish = (result, clone = true) => {
    if (options !== undefined) {
      const { documentBudget, phase } = options;
      guardCapturedRecordResult(result, documentBudget, { phase });
    }
    return clone ? capture(result) : result;
  };
  const invalid = (reason) => finish({ status: 'invalid', ref, reason }, false);
  if (!shape(ref, ['namespace', 'kind', 'id'])) return invalid('invalid-ref');
  if (!RECORD_KINDS.includes(ref.kind)) return invalid('invalid-kind');
  if (!parseCanonicalId(ref.kind, ref.id).ok) return invalid('invalid-id');
  if (!isIdentityUuid(ref.namespace)) return invalid('invalid-namespace');
  if (ref.namespace !== index.namespace) return invalid('namespace-mismatch');
  const found = groups.get(keyOf(ref.kind, ref.id));
  if (!found) return finish({ status: 'missing', ref: { ...ref } }, false);
  const { records, declarations, allocations } = found;
  if (records.length > 1 || declarations.length > 1 || allocations.length > 1) {
    const candidates = [
      ...records.map(({ locator }) => ({ source: 'record', locator })),
      ...declarations.map(({ locator }) => ({ source: 'catalog', locator })),
      ...allocations.map(({ locator }) => ({ source: 'allocation', locator })),
    ].sort((a, b) => compare(a.source, b.source) || compare(a.locator.file, b.locator.file) || compare(a.locator.path, b.locator.path));
    return finish({ status: 'ambiguous', ref, candidates });
  }
  const record = records[0];
  const declaration = declarations[0];
  const allocation = allocations[0]?.allocation;
  if (!allocation) return invalid('unallocated-record');
  if (record && declaration && record.locator.file !== declaration.target) {
    return invalid('declaration-target-mismatch');
  }
  if (allocation.state !== 'allocated') {
    return finish({ status: 'retired', ref, allocation, ...(record ? { entry: record.entry } : {}) });
  }
  if (record) return finish({ status: 'loaded', ref, entry: record.entry });
  if (declaration) {
    return finish({ status: 'declared-only', ref, declarations: [{ target: declaration.target, locator: declaration.locator }] });
  }
  return finish({ status: 'missing', ref, allocation });
}
