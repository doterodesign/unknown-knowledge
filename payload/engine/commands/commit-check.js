/** Whole-store commit gate. Reads working-tree evidence; no staged snapshot yet. */
import process from 'node:process';
import { parseArgs as parseFlags, runCli } from '../lib/cli.js';
import { EXIT_CODES } from '../lib/exit-codes.js';

export const USAGE = 'usage: commit-check [--root <repo-root>]';

/** @param {string[]} argv @returns {Promise<number>} */
export async function main(argv) {
  const { options } = parseFlags(argv, { value: ['root'] });
  const args = ['--root', options.root ?? process.cwd()];
  let outcome = EXIT_CODES.CLEAN;
  // Literal imports load only versioned engine code (D-005/D-014). Each check
  // loads independently, so a broken validator cannot hide the other's result.
  for (const [name, load] of [
    ['validate', () => import('./validate.js')],
    ['validate-values', () => import('./validate-values.js')],
  ]) {
    const status = await runCli(name, async (argv) => {
      const command = await load();
      return command.main(argv);
    }, { usage: USAGE, argv: args });
    process.stderr.write(`commit-check: ${name}: ${status === EXIT_CODES.CLEAN ? 'clean' : status === EXIT_CODES.FINDINGS ? 'findings' : 'failure'} (exit ${status})\n`);
    // Failure (2) dominates findings (1), which dominate clean (0).
    outcome = Math.max(outcome, status);
  }
  return outcome;
}
