/** Shared expanded-document accounting; not a native allocation or CPU-time limit. */
const budgets = new WeakMap();
const counters = { documentNodes: 'maxDocumentNodes', documentTextUnits: 'maxDocumentTextUnits' };

export class DocumentBudgetError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'DocumentBudgetError'; this.code = code;
    Object.assign(this, details);
  }
}

export function createDocumentBudget(limits) {
  const keys = Object.values(counters);
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)
    || Object.keys(limits).length !== keys.length
    || keys.some((key) => !Object.hasOwn(limits, key) || !Number.isSafeInteger(limits[key]) || limits[key] < 0)) {
    throw new DocumentBudgetError('invalid-document-budget', 'Supply both explicit safe nonnegative document limits.');
  }
  const captured = { ...limits };
  const used = { documentNodes: 0, documentTextUnits: 0 };
  let failure = null;
  function charge(counter, amount, phase) {
    if (failure) throw new DocumentBudgetError(failure.code, failure.message, failure);
    if (amount > captured[counters[counter]] - used[counter]) {
      failure = { code: 'document-budget-exhausted', message: `Limit ${counters[counter]} exhausted during ${phase}.`,
        counter, phase, attempted: amount, remaining: captured[counters[counter]] - used[counter] };
      throw new DocumentBudgetError(failure.code, failure.message, failure);
    }
    used[counter] += amount;
  }
  function guard(document, phase, allowUndefined, recordResult = false) {
    if (recordResult) {
      charge('documentNodes', 0, phase); // A failed allowance precedes even wrapper shape inspection.
      const entry = document !== null && typeof document === 'object'
        ? Object.getOwnPropertyDescriptor(document, 'entry') : undefined;
      allowUndefined = entry !== undefined;
      if (entry !== undefined) {
        const invalid = () => { throw new DocumentBudgetError('invalid-document',
          `Record results require enumerable data entry and record slots during ${phase}.`, { phase }); };
        if (!entry.enumerable || !Object.hasOwn(entry, 'value') || !entry.value
          || typeof entry.value !== 'object' || Array.isArray(entry.value)) invalid();
        const record = Object.getOwnPropertyDescriptor(entry.value, 'record');
        if (!record?.enumerable || !Object.hasOwn(record, 'value')) invalid();
      }
    }
    const active = new Set();
    function* children(value, strict, boundary) {
      const array = Array.isArray(value);
      let index = 0;
      if (Object.getOwnPropertySymbols(value).length) {
        throw new DocumentBudgetError('invalid-document', `Symbol properties are not captured JSON data during ${phase}.`, { phase });
      }
      for (const key in value) if (Object.hasOwn(value, key)) {
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (!Object.hasOwn(property, 'value') || (array && key !== String(index++))) {
          throw new DocumentBudgetError('invalid-document', `Accessors and extra or sparse array properties are not captured JSON data during ${phase}.`, { phase });
        }
        if (!array) charge('documentTextUnits', key.length, phase);
        yield { value: property.value,
          strict: strict || (boundary === 'entry' && key === 'record'),
          boundary: boundary === 'root' && key === 'entry' ? 'entry' : null };
      }
      if (array && index !== value.length) {
        throw new DocumentBudgetError('invalid-document', `Sparse arrays are not captured JSON data during ${phase}.`, { phase });
      }
    }
    const stack = [{ iterator: [{ value: document, strict: !allowUndefined,
      boundary: recordResult ? 'root' : null }][Symbol.iterator]() }];
    while (stack.length) {
      const frame = stack.at(-1);
      const next = frame.iterator.next();
      if (next.done) { active.delete(frame.value); stack.pop(); continue; }
      const { value, strict, boundary } = next.value;
      charge('documentNodes', 1, phase);
      if (typeof value === 'string') charge('documentTextUnits', value.length, phase);
      else if (value !== null && typeof value === 'object') {
        if (active.has(value)) throw new DocumentBudgetError('cyclic-document', `Cyclic document during ${phase}.`);
        if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
          throw new DocumentBudgetError('invalid-document', `Expected JSON-shaped captured document during ${phase}.`);
        }
        active.add(value); stack.push({ value, iterator: children(value, strict, boundary) });
      } else if (!(!strict && value === undefined) && value !== null && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) {
        throw new DocumentBudgetError('invalid-document', `Expected finite JSON data during ${phase}.`);
      }
    }
  }
  const handle = Object.freeze({});
  budgets.set(handle, { guard, used, get failure() { return failure; } });
  return handle;
}

function capturedBudget(handle) {
  const state = budgets.get(handle);
  if (!state) throw new DocumentBudgetError('invalid-document-budget-handle', 'An authentic document budget handle is required.');
  return state;
}

/** Guard the actual input before recursive mapping, hashing or copying. */
export function guardCapturedDocument(value, handle, { phase, allowUndefined = false } = {}) {
  const state = capturedBudget(handle);
  if (typeof phase !== 'string' || phase.trim() === '' || typeof allowUndefined !== 'boolean') {
    throw new TypeError('Document guards require a named phase and explicit boolean wrapper policy.');
  }
  state.guard(value, phase, allowUndefined);
}

/** One actual result walk: loader bookkeeping is permissive, entry.record stays strict. */
export function guardCapturedRecordResult(value, handle, { phase } = {}) {
  const state = capturedBudget(handle);
  if (typeof phase !== 'string' || phase.trim() === '') throw new TypeError('Record result guards require a named phase.');
  state.guard(value, phase, false, true);
}

export function getDocumentBudgetUsage(handle) { return { ...capturedBudget(handle).used }; }

/** First exhaustion is sticky even when a different owner used the neutral handle. */
export function getDocumentBudgetFailure(handle) {
  const failure = capturedBudget(handle).failure;
  return failure ? { ...failure } : null;
}
