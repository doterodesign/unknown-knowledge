/** Whole-store commit gate over one isolated proposed Git snapshot. */
import process from 'node:process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs as parseFlags, rethrowIfBug, runCli } from '../lib/cli.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { withCommitSnapshot } from '../lib/commit-snapshot.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { load, YAMLException } from 'js-yaml';
import { validateIdentityLedger, validateIdentityTransition } from '../lib/identity-ledger.js';
import { EngineRefusal } from '../lib/engine-refusal.js';

export const USAGE = 'usage: commit-check [--root <repo-root>]';

/** @param {string[]} argv @returns {Promise<number>} */
export async function main(argv) {
  const { options } = parseFlags(argv, { value: ['root'] });
  return withCommitSnapshot(options.root ?? process.cwd(), async (snapshot) => {
    const status = await checkCandidate(snapshot.candidate.root);
    if (status !== EXIT_CODES.CLEAN) return status;
    return checkIdentity(snapshot);
  });
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


/** Structural ledger continuity only; source/review approval is a separate gate. */
function checkIdentity({ candidate, before }) {
  const absent = Symbol('absent identity authority');
  const read = (root, side, optional = false) => {
    const path = join(locateKitRoot(root), '_identity.yaml');
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat && optional) return absent;
    if (!stat?.isFile()) throw new EngineRefusal(`${side} identity authority must be a regular _identity.yaml file`);
    return load(readFileSync(path, 'utf8'));
  };
  let next;
  let previous = absent;
  let side = 'candidate';
  try {
    next = read(candidate.root, side);
    if (before) {
      side = 'before';
      previous = read(before.materialize().root, side, true);
    }
  } catch (error) {
    const failureCode = error?.code ?? error?.name;
    if (error instanceof YAMLException) error = new EngineRefusal(error.message, { cause: error });
    rethrowIfBug(error);
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error.errno)) throw error;
    // Do not print temporary paths; the selected snapshot and authority name
    // identify the immutable evidence without making output host-dependent.
    process.stderr.write(`commit-check: identity: ${side} _identity.yaml could not be read as regular YAML authority (${failureCode})\n`);
    return EXIT_CODES.FAILURE;
  }
  const checked = previous === absent ? validateIdentityLedger(next) : validateIdentityTransition(previous, next);
  for (const { code, path } of checked.diagnostics) {
    process.stderr.write(`commit-check: identity: ${code} at ${path || '_identity.yaml'}\n`);
  }
  if (checked.ok) process.stderr.write('commit-check: identity: clean (structural ledger continuity only)\n');
  return checked.ok ? EXIT_CODES.CLEAN : EXIT_CODES.FAILURE;
}
