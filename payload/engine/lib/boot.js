/**
 * Load a command, then run it through the harness (UCS-956).
 *
 * `runCli` promises that a crash exits 2, never 1. It cannot keep that promise
 * for a failure that happens BEFORE it loads: Node exits 1 on an unhandled ES
 * module load error, so a SyntaxError in any lib/ module — or a missing
 * `js-yaml` — used to make every engine surface exit 1, the FINDINGS code, with
 * the harness never having run.
 *
 * That is the worst possible failure for the exit-code contract (PRD §5,
 * D-011). An agent reads exit 1 as "the check ran and found problems", so it
 * quarantines and continues — past a check that never ran. And it is MORE
 * reachable than an ordinary crash, because the kit is seeded into a client
 * repo (D-001): a partial copy, a corrupted file, or an uninstalled dependency
 * lands exactly here.
 *
 * So the entry point of every surface is a shim that statically imports
 * NOTHING, and reaches the engine only through `import()`, whose failure is an
 * ordinary catchable rejection. Everything the engine is made of — including
 * `cli.js`, and this module — loads inside that seam.
 *
 * This module is loaded dynamically too. If it cannot load, the shim's own
 * catch reports it and exits 2.
 */
import process from 'node:process';
import { runCli } from './cli.js';

/**
 * The shim performs the `import()` itself, with a string-literal specifier, and
 * hands the loaded module here. Nothing in the engine ever imports a computed
 * path — there is no variable that could be made to name client code (D-014).
 *
 * @param {string} name the command's name, for its messages
 * @param {{ main: (argv: string[]) => number | Promise<number>, USAGE: string }} command
 * @returns {Promise<number>} an exit code; 1 only if the command returned it
 */
export async function boot(name, command) {
  return runCli(name, command.main, { usage: command.USAGE });
}
