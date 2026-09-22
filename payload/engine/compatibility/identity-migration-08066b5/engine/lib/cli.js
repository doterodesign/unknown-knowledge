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
 * Every surface reaches this through `lib/boot.js`, from an entry shim that
 * statically imports nothing (UCS-956). The nine hand-written shells that this
 * replaced are gone (UCS-952).
 */
import process from 'node:process';
import { EXIT_CODES } from './exit-codes.js';
import { UsageError } from './usage-error.js';

export { UsageError } from './usage-error.js';
export { EngineRefusal, rethrowIfBug } from './engine-refusal.js';

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
 * @param {string[]} [spec.allowEmpty] value flags for which "" is a legal value
 *   — preflight reads an empty `--concepts` as store-health-only (PRD §7)
 * @param {boolean} [spec.positionals] whether bare arguments are allowed
 * @returns {{ options: object, positionals: string[] }}
 */
export function parseArgs(argv, spec = {}) {
  const booleans = new Set(spec.boolean ?? []);
  const values = new Set(spec.value ?? []);
  const repeatables = new Set(spec.repeatable ?? []);
  const allowEmpty = new Set(spec.allowEmpty ?? []);
  const known = new Set([...booleans, ...values, ...repeatables]);
  const options = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (!spec.positionals) {
        throw new UsageError(`unexpected argument ${JSON.stringify(arg)} — this CLI takes flags only`);
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
      // `--flag=value` carries its value unambiguously, so a value that looks
      // like a flag is legal here — this spelling is the escape hatch for one.
      value = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      // In the space form a `--`-prefixed token is the next flag, not a value.
      if (next === undefined || next.startsWith('--')) {
        throw new UsageError(`${flag} requires a value`);
      }
      value = next;
      i += 1;
    }
    // An empty value is as valueless as none, in EITHER spelling. Both `--root=`
    // and `--root ""` arrive when a shell expands an unset variable, and both
    // would otherwise resolve to the current directory — answering about a repo
    // nobody named.
    // A flag may declare "" meaningful — preflight's empty `--concepts` selects
    // store-health-only. Everything else treats it as no value at all.
    if (value === '' && !allowEmpty.has(name)) throw new UsageError(`${flag} requires a value`);

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
