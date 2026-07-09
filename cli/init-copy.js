#!/usr/bin/env node
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
import { copyPayload, loadManifest, DEFAULT_ROOT, SeedRefusal } from './lib/copy-payload.js';
import { assertKnownPlatforms, generateWrappers } from './lib/generate-wrappers.js';
import { EXIT_CODES } from '../payload/engine/lib/exit-codes.js';

const USAGE = 'usage: node cli/init-copy.js --target <dir> [--root <name>] [--stacks <s1,s2>] [--platforms <p1,p2>] [--json]';
const kitRoot = fileURLToPath(new URL('..', import.meta.url));

function parseArgs(argv) {
  const opts = { target: null, root: DEFAULT_ROOT, stacks: [], platforms: [], json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length || argv[i].startsWith('--')) throw new Error(`${arg} requires a value\n${USAGE}`);
      return argv[i];
    };
    if (arg === '--target') opts.target = next();
    else if (arg === '--root') opts.root = next();
    else if (arg === '--stacks') opts.stacks = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--platforms') opts.platforms = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--json') opts.json = true;
    else throw new Error(`unknown argument: ${arg}\n${USAGE}`);
  }
  if (!opts.target) throw new Error(`--target is required\n${USAGE}`);
  return opts;
}

export function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`init-copy: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }
  try {
    // Unknown platform ids refuse BEFORE the seed — a failed multi-select
    // must not leave a half-initialized target behind.
    assertKnownPlatforms(loadManifest(kitRoot), opts.platforms);
    const result = copyPayload({
      kitRoot, targetDir: opts.target, rootName: opts.root, stacks: opts.stacks,
    });
    const wrappers = generateWrappers({
      kitRoot, targetDir: opts.target, rootName: opts.root, platforms: opts.platforms,
    });
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
    return EXIT_CODES.FAILURE;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
