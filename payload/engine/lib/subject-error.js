/** Shared typed Subject diagnostic without a dependency on traversal primitives. */
import { UsageError } from './usage-error.js';

export class SubjectError extends UsageError {
  name = 'SubjectError';

  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

