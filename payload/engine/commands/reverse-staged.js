/** Informational attribution of the proposed commit and its prior governance. */
import process from 'node:process';
import { parseArgs, runCli } from '../lib/cli.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { withCommitSnapshot } from '../lib/commit-snapshot.js';

export const USAGE = 'usage: reverse-staged [--root <repo-root>]';

/** @param {string[]} argv @returns {Promise<number>} */
export async function main(argv) {
  const { options } = parseArgs(argv, { value: ['root'] });
  return withCommitSnapshot(options.root ?? process.cwd(), async ({ candidate, before, changedPaths }) => {
    const paths = changedPaths();
    if (!paths.length) return EXIT_CODES.CLEAN;
    // Materialize both before publishing attribution. The installed runtime
    // reads only immutable evidence within the shared cleanup lifetime.
    const origins = [['candidate', candidate]];
    if (before) origins.push(['before', before.materialize()]);
    let outcome = EXIT_CODES.CLEAN;
    for (const [origin, snapshot] of origins) {
      process.stdout.write(`staged attribution: ${origin} ${snapshot.tree}\n`);
      const status = await runCli('reverse-staged', async (args) => {
        const { main: resolve } = await import('./resolve.js');
        return resolve(args);
      }, { usage: USAGE, argv: ['--root', snapshot.root, '--json', ...paths.map((path) => `--path=${path}`)] });
      outcome = Math.max(outcome, status);
    }
    return outcome;
  }, { skipUnchanged: true });
}
