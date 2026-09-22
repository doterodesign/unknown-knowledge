/** Shared CLI failure policy for an already authentic Subject operation. */
import { SubjectOperationError, getSubjectOperationUsage, writeSubjectOperationOutput } from './subject-operation.js';
import { SourceBudgetError } from './source-budget.js';
import { DocumentBudgetError } from './document-budget.js';
import { SubjectError } from './subject-error.js';
import { EngineRefusal } from './engine-refusal.js';
import { UsageError } from './usage-error.js';
import { EXIT_CODES } from './exit-codes.js';

/** Programmatic callers retain exceptions; only explicit CLI boundaries call this. */
export function reportSubjectOperationFailure(operation, error) {
  const expected = error instanceof SubjectOperationError || error instanceof SourceBudgetError
    || error instanceof DocumentBudgetError || error instanceof SubjectError
    || error instanceof EngineRefusal || error instanceof UsageError;
  const first = getSubjectOperationUsage(operation).failure ?? error;
  const failure = expected
    ? { kind: 'admission-refused', code: first.code ?? 'invalid-usage', counter: first.counter ?? null,
      phase: first.phase ?? (error instanceof UsageError ? 'cli-usage' : null) }
    : { kind: 'internal-error', name: typeof error?.name === 'string' ? error.name : 'ThrownValue',
      message: typeof error?.message === 'string' ? error.message : String(error),
      stack: typeof error?.stack === 'string' ? error.stack : null };
  try { writeSubjectOperationOutput(operation, `${JSON.stringify({ version: 1, status: 'host-failed', failure })}\n`); }
  catch (deliveryError) { if (!(deliveryError instanceof SubjectOperationError)) throw deliveryError; }
  return EXIT_CODES.FAILURE;
}
