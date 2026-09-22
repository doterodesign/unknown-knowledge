/** Cumulative input reads; independent of Subject authority and native parsing. */
import { closeSync, constants, fstatSync, openSync, readFileSync, readSync } from 'node:fs';

const budgets = new WeakMap();
const CHUNK_BYTES = 65536;

export class SourceBudgetError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'SourceBudgetError'; this.code = code;
    Object.assign(this, details);
  }
}

export function createSourceBudget(limits) {
  if (!limits || typeof limits !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(limits))
    || Reflect.ownKeys(limits).length !== 1 || !Object.hasOwn(limits, 'maxSourceBytes')
    || !Number.isSafeInteger(limits.maxSourceBytes) || limits.maxSourceBytes < 0) {
    throw new SourceBudgetError('invalid-source-budget', 'Supply an explicit safe nonnegative maxSourceBytes.');
  }
  const handle = Object.freeze({});
  budgets.set(handle, { limit: limits.maxSourceBytes, sourceBytes: 0, failure: null });
  return handle;
}

function stateOf(handle) {
  const state = budgets.get(handle);
  if (!state) throw new SourceBudgetError('invalid-source-budget', 'An authentic source budget handle is required.');
  return state;
}

/** Read-only snapshots remain available after exhaustion. */
export function getSourceBudgetUsage(handle) {
  const state = stateOf(handle);
  return { sourceBytes: state.sourceBytes, failure: state.failure && { ...state.failure } };
}

export function assertSourceBudget(handle) {
  const state = stateOf(handle);
  if (state.failure) throw new SourceBudgetError(state.failure.code, 'The source allowance is exhausted.', state.failure);
}

/**
 * In bounded mode only regular files are accepted. An fd is read positionally
 * from zero each time, without moving its offset or closing it. The path form
 * owns its fd. Repeated reads count again; metadata is never a byte debit.
 * Native parser allocations, directory enumeration and installed code reads
 * are outside this input-byte counter.
 */
export function readSourceFileSync(fileOrFd, { sourceBudget, encoding } = {}) {
  if (sourceBudget === undefined) return readFileSync(fileOrFd, encoding);
  assertSourceBudget(sourceBudget);
  const state = stateOf(sourceBudget);
  if (encoding !== undefined && (typeof encoding !== 'string' || !Buffer.isEncoding(encoding))) {
    throw new TypeError('Source encoding must be a supported Buffer encoding.');
  }
  const owned = typeof fileOrFd !== 'number';
  // Nonblocking open prevents a FIFO substituted for a path from hanging before
  // the regular-file check. No read occurs until fstat approves the actual fd.
  const fd = owned ? openSync(fileOrFd, constants.O_RDONLY | constants.O_NONBLOCK) : fileOrFd;
  try {
    if (!fstatSync(fd).isFile()) {
      throw new SourceBudgetError('invalid-source-file', 'Bounded source reads require a regular file.');
    }
    const chunks = [];
    let position = 0;
    while (true) {
      const remaining = state.limit - state.sourceBytes;
      if (remaining === 0) {
        if (fstatSync(fd).size <= position) break;
        state.failure = { code: 'source-budget-exhausted', counter: 'sourceBytes', phase: 'source-read', attemptedBytes: 1 };
        throw new SourceBudgetError(state.failure.code, 'Source bytes exceed the remaining operation allowance.', state.failure);
      }
      const chunk = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, remaining));
      const count = readSync(fd, chunk, 0, chunk.length, position);
      state.sourceBytes += count;
      position += count;
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
    }
    const bytes = Buffer.concat(chunks, position);
    return encoding === undefined ? bytes : bytes.toString(encoding);
  } finally {
    if (owned) closeSync(fd);
  }
}
