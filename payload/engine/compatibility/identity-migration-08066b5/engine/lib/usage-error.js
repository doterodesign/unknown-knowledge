/**
 * The caller spelled the command wrong (UCS-944/948).
 *
 * A leaf module on purpose. `lib/cli.js` re-exports it for the shells, and the
 * store loader raises a subclass of it — a `--concepts` id the ontology does
 * not carry is a usage error, not an engine failure. Keeping the class here
 * means the loader never has to import the command-line shell to say so.
 *
 * Every usage error exits 2. Never 1: exit 1 means findings, and a command that
 * refused its own arguments never ran.
 */
export class UsageError extends Error {
  name = 'UsageError';
}
