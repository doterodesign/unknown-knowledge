/** Semantic JSON digest, distinct from hashing original source file bytes. */
import { createHash } from 'node:crypto';

/** Deliberate capture rejection, distinct from unexpected programming errors. */
export class CapturedInputError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'CapturedInputError';
    this.code = 'invalid-captured-input';
  }
}

function canonical(value, visiting = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  if (value !== null && typeof value === 'object') {
    if (visiting.has(value)) throw new CapturedInputError('cyclic captured input is not JSON serializable');
    visiting.add(value);
    let result;
    if (Array.isArray(value)) {
      result = `[${Array.from(value, (item) => canonical(item, visiting)).join(',')}]`;
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        throw new CapturedInputError('captured input must contain only JSON serializable objects');
      }
      result = `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key], visiting)}`).join(',')}}`;
    }
    visiting.delete(value);
    return result;
  }
  throw new CapturedInputError('captured input must contain only JSON serializable values');
}

/**
 * Hash the full supplied JSON value with sorted object keys and authored array
 * order. No field omission, set normalization, Unicode normalization or clock.
 * @param {unknown} value a finite, acyclic JSON value
 * @returns {string} SHA256 of canonical JSON (UTF-8, no trailing newline)
 */
export function canonicalSha256(value) {
  return createHash('sha256').update(canonicalJsonBytes(value)).digest('hex');
}

/** The exact bytes underlying canonicalSha256, for retained JSON evidence. */
export const canonicalJsonBytes = (value) => Buffer.from(canonical(value), 'utf8');
