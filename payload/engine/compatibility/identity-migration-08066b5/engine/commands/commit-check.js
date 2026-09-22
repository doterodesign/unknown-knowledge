/** Whole-store commit gate over one isolated proposed Git snapshot. */
import process from 'node:process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs as parseFlags, rethrowIfBug, runCli } from '../lib/cli.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { withCommitSnapshot } from '../lib/commit-snapshot.js';
import { locateKitRoot } from '../lib/kit-root.js';

export const USAGE = 'usage: commit-check [--root <repo-root>]';

/** @param {string[]} argv @returns {Promise<number>} */
export async function main(argv) {
  const { options } = parseFlags(argv, { value: ['root'] });
  return withCommitSnapshot(options.root ?? process.cwd(), ({ candidate }) => checkCandidate(candidate.root));
}

async function checkCandidate(root) {
  let kitRoot;
  try {
    kitRoot = locateKitRoot(root);
  } catch (error) {
    rethrowIfBug(error);
    // Layout refusals describe candidate evidence, not the random directory
    // used to hold it. Operational cleanup failures still name their artifact.
    process.stderr.write(`commit-check: snapshot: ${error.message.replaceAll(root, '<candidate>')}\n`);
    return EXIT_CODES.FAILURE;
  }
  if (!['ontology', 'knowledge', 'decisions'].some((store) => existsSync(join(kitRoot, store)))) {
    throw new Error('snapshot: no governed stores in the candidate; stage the kit before checking a commit');
  }
  const args = ['--root', root];
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
