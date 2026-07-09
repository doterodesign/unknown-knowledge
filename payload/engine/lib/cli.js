/**
 * The CLI shell, once (UCS-944).
 *
 * Nine command-line surfaces each hand-roll the same flag grammar, the same
 * usage-error type, and the same mapping from outcome to exit code. The copies
 * have already drifted — the `--concepts` filter meant two different things to
 * two validators until UCS-935 settled it.
 *
 * The safety rule they restate is the load-bearing one:
 *
 *   EXIT 1 MEANS FINDINGS. A crash must never wear it.
 *
 * An engine that dies mid-check and exits 1 tells an agent riding the exit-code
 * contract that the check RAN and found problems — so it quarantines and
 * continues, past a check that never ran (PRD §5, D-011). Today that rule is
 * enforced by each author remembering to copy a catch block, and this session
 * found FIVE surfaces where the copy was wrong or missing.
 *
 * `runCli` owns the epilogue instead: a usage error reports and exits 2, and
 * ANY unexpected throw reports and exits 2. Exit 1 is reachable only by a main
 * that deliberately returns it, having actually run and actually found things.
 *
 * Nothing consumes this yet — UCS-948/949/950 migrate the surfaces, UCS-952
 * deletes their shells.
 */
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES } from './exit-codes.js';

/** The caller spelled the command wrong. Always exit 2, never exit 1. */
export class UsageError extends Error {
  name = 'UsageError';
}

/**
 * Parse the flag grammar every engine CLI shares.
 *
 * Both conventional spellings work — `--flag value` and `--flag=value` — and
 * everything the grammar cannot account for is a UsageError, never a guess:
 * an unknown flag, a stray positional where none is allowed, a value flag with
 * no value, a boolean flag given one, or an empty value (`--root=` would
 * otherwise resolve to the current directory, answering about a repo nobody
 * named).
 *
 * @param {string[]} argv arguments after the script name
 * @param {object} spec
 * @param {string[]} [spec.boolean] flags that take no value
 * @param {string[]} [spec.value] flags taking one value; last wins
 * @param {string[]} [spec.repeatable] value flags that accumulate into an array
 * @param {boolean} [spec.positionals] whether bare arguments are allowed
 * @returns {{ options: object, positionals: string[] }}
 */
export function parseArgs(argv, spec = {}) {
  const booleans = new Set(spec.boolean ?? []);
  const values = new Set(spec.value ?? []);
  const repeatables = new Set(spec.repeatable ?? []);
  const known = new Set([...booleans, ...values, ...repeatables]);
  const options = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (!spec.positionals) {
        throw new UsageError(`unexpected argument ${JSON.stringify(arg)} — this command takes flags only`);
      }
      positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const name = flag.slice(2);
    if (!known.has(name)) throw new UsageError(`unknown flag ${flag}`);

    if (booleans.has(name)) {
      if (eq !== -1) throw new UsageError(`${flag} takes no value`);
      options[name] = true;
      continue;
    }

    let value;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
      // `--flag=` is as valueless as a bare `--flag`.
      if (value === '') throw new UsageError(`${flag} requires a value`);
    } else {
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`${flag} requires a value`);
      }
      i += 1;
    }

    if (repeatables.has(name)) (options[name] ??= []).push(value);
    else options[name] = value;
  }

  return { options, positionals };
}

/**
 * Run a command's main and own the epilogue: nothing it throws can exit 1.
 *
 * `main` returns an exit code, or throws. A UsageError reports itself with the
 * usage line; anything else is an engine failure — the command did not finish,
 * so it cannot have findings. Both exit 2.
 *
 * Returns the code rather than setting it, so the caller stays in charge of
 * `process.exitCode`. Never calls `process.exit()`: that drops queued async
 * stdout writes, truncating piped `--json` at the pipe buffer and yielding
 * corrupt JSON with a clean exit code.
 *
 * @param {string} name the command's name, for its messages
 * @param {(argv: string[]) => number | Promise<number>} main
 * @param {object} opts
 * @param {string} opts.usage the usage line printed on a UsageError
 * @param {string[]} [opts.argv]
 * @param {{ write: (s: string) => unknown }} [opts.stderr]
 * @returns {Promise<number>} an exit code; 1 only if `main` returned it
 */
export async function runCli(name, main, { usage, argv = process.argv.slice(2), stderr = process.stderr } = {}) {
  try {
    return await main(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      stderr.write(`${name}: ${error.message}\n${usage}\n`);
      return EXIT_CODES.FAILURE;
    }
    // The command did not finish. It cannot have findings, so it must not wear
    // the FINDINGS code — an agent would quarantine-and-continue past a check
    // that never ran.
    stderr.write(`${name}: internal failure — the command did not complete\n${error?.stack || error?.message || String(error)}\n`);
    return EXIT_CODES.FAILURE;
  }
}

/** True when this module URL is the process entry point, not an import. */
export const isEntrypoint = (importMetaUrl) =>
  !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
