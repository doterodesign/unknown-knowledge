/**
 * The difference between a refusal and a bug (UCS-949).
 *
 * A surface may catch an engine throw and print a clean, actionable message:
 * "no git", "the store loader reported 3 error(s)", "illegal transition". These
 * are ANTICIPATED conditions. The engine reached them on purpose, so a stack
 * trace would be noise.
 *
 * A `TypeError` from a genuine bug is not that. It must reach `runCli`, which
 * prints the stack — otherwise a crash hides behind a one-line message that
 * reads exactly like a considered refusal, and nobody can debug it.
 *
 * Both still exit 2. This is about diagnosability, not the exit-code contract.
 *
 * The rule: an anticipated refusal is a plain `new Error(msg)` — which is what
 * every refusal in the engine already throws — or an `EngineRefusal` subclass
 * for the ones that carry more than a message. Everything else is a bug, or a
 * `UsageError` that the harness alone gets to interpret.
 */

/** An anticipated, actionable engine refusal. Reported without a stack trace. */
export class EngineRefusal extends Error {
  name = 'EngineRefusal';
}

/**
 * Rethrow `error` unless it is an anticipated engine refusal.
 *
 * Call this first inside a surface's engine-failure catch, so the catch speaks
 * only for the failures it can actually explain and everything else — a bug, a
 * UsageError raised deep in the loader — travels on to the harness.
 *
 * @param {unknown} error
 * @returns {void} when the error is a refusal the caller may report itself
 * @throws {unknown} the original error, when it is not
 */
export function rethrowIfBug(error) {
  const expected = error instanceof EngineRefusal || error?.constructor === Error;
  if (!expected) throw error;
}
