/**
 * init-copy (KK-17) — thin, flags-only CLI over the payload copy engine
 * (cli/lib/copy-payload.js). This is the deterministic Phase-1 copy step of
 * PRD §6 minus the prompts: KK-19's `npx unknown-knowledge init` wraps it
 * with the interactive UX (root-name prompt, platform multi-select, stack
 * auto-detection) and the git check-ignore sweep.
 *
 * Exit codes (engine contract, payload/engine/lib/exit-codes.js):
 *   0 — seeded clean. Wrapper collisions that skip-and-report (§6) are
 *       reported results, not failures — the seed happened.
 *   2 — refusal (existing/partial seed, dotted root), usage error (incl.
 *       unknown platform/stack — checked BEFORE seeding), or any engine
 *       failure. A seed that did not happen is never a silent pass.
 *   (1 is unused here: copying has no findings/quarantine middle ground.)
 *
 * Usage: node cli/init-copy.js --target <dir> [--root <name>]
 *                              [--stacks <s1,s2>] [--platforms <p1,p2>]
 *                              [--json]
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { copyPayload, loadManifest, DEFAULT_ROOT, SeedRefusal } from '../lib/copy-payload.js';
import { assertKnownPlatforms, generateWrappers } from '../lib/generate-wrappers.js';
import { EXIT_CODES } from '../../payload/engine/lib/exit-codes.js';
import { parseArgs as parseFlags, rethrowIfBug, UsageError } from '../../payload/engine/lib/cli.js';

export const USAGE = 'usage: node cli/init-copy.js --target <dir> [--root <name>] [--stacks <s1,s2>] [--platforms <p1,p2>] [--json]';
// The kit root, two levels up: cli/commands/<this>.js (UCS-950).
const kitRoot = fileURLToPath(new URL('../..', import.meta.url));

/** `a, b,,c` → ['a','b','c']; absent → []. */
const splitList = (value) => (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function parseArgs(argv) {
  const { options } = parseFlags(argv, {
    boolean: ['json'],
    value: ['target', 'root', 'stacks', 'platforms'],
  });
  if (options.target === undefined) throw new UsageError('--target is required');
  return {
    target: options.target,
    root: options.root ?? DEFAULT_ROOT,
    stacks: splitList(options.stacks),
    platforms: splitList(options.platforms),
    json: !!options.json,
  };
}

export function main(argv) {
  const opts = parseArgs(argv); // a UsageError reaches the harness
  try {
    // Unknown platform ids refuse BEFORE the seed — a failed multi-select
    // must not leave a half-initialized target behind.
    assertKnownPlatforms(loadManifest(kitRoot), opts.platforms);
    const result = copyPayload({
      kitRoot, targetDir: opts.target, rootName: opts.root, stacks: opts.stacks,
    });
    let wrappers;
    try {
      wrappers = generateWrappers({
        kitRoot, targetDir: opts.target, rootName: opts.root, platforms: opts.platforms,
      });
    } catch (error) {
      // The seed already landed; shared files may carry sentinel appends, so
      // a silent rollback could destroy user bytes — name the partial state
      // instead (a retry refuses on the existing root by design, §6).
      error.message = `${error.message}\n  the store seed was already created at ${result.root} — remove it (and any wrapper sentinel blocks) before retrying; init refuses on an existing root`;
      throw error;
    }
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ ok: true, ...result, wrappers }, null, 2)}\n`);
    } else {
      process.stdout.write(
        `seeded ${result.rootName}/ (kit ${result.version}, stacks: ${result.stacks.join(', ') || 'none'}) `
        + `— ${result.files.length} files at ${result.root}\n`);
      for (const w of wrappers) {
        process.stdout.write(w.action === 'skipped'
          ? `wrapper ${w.platform}: skipped ${w.target} — ${w.reason}\n`
          : `wrapper ${w.platform}: ${w.action} ${w.target}\n`);
      }
    }
    return EXIT_CODES.CLEAN;
  } catch (error) {
    const kind = error instanceof SeedRefusal ? 'refused' : 'error';
    process.stderr.write(`init-copy: ${kind}: ${error.message}\n`);
    rethrowIfBug(error); // a bug is not a refusal — the harness prints its stack
    return EXIT_CODES.FAILURE;
  }
}
