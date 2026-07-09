#!/usr/bin/env node
/**
 * `npx unknown-knowledge init` (KK-19, PRD §6 Phase 1) — the interactive,
 * npx-facing wrapper over the deterministic seams KK-17/KK-18 landed:
 * cli/lib/copy-payload.js (manifest-driven copy engine) and
 * cli/lib/generate-wrappers.js (platform pointer files). This file owns the
 * cold-run UX ONLY — prompts (node:readline, zero-dependency D-002), repo
 * stack auto-detection, the git check-ignore sweep, and the exit messaging.
 * The copy/collision semantics live (and are tested) in the seams; this CLI
 * never reimplements them.
 *
 * EVERY prompt is flag-drivable for non-interactive use (--root,
 * --platforms, --stacks, --yes accepting the detected defaults) — CI and
 * the acceptance harness drive it headlessly.
 *
 * NO CI MUTATION, EVER (D-006): init never writes workflow files — nothing
 * under .github/workflows/ (or any other CI config) is created or edited by
 * this command. The only .github/ path init may touch is the Copilot
 * wrapper (.github/copilot-instructions.md), and only when the user selects
 * the copilot platform.
 *
 * npx-ability: package.json maps bin "unknown-knowledge" → this file. The
 * package stays `private: true` until the first release (the publish guard,
 * docs/publishing.md) — until then, run locally via `node cli/init.js init`
 * (or `npm link` and `unknown-knowledge init`); the real
 * `npx unknown-knowledge init` works post-publish.
 *
 * Exit codes (same contract as cli/init-copy.js):
 *   0 — seeded clean. Wrapper skips and gitignore WARNs are reported
 *       results, not failures — the seed happened.
 *   2 — refusal (existing/partial seed, dotted root), usage error, a target
 *       that is not an existing directory, or any engine failure — including
 *       an unexpected throw, which the entry point maps here rather than
 *       letting it exit 1. A seed that did not happen is never a silent pass,
 *       and never wears the FINDINGS code.
 */
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { copyPayload, loadManifest, DEFAULT_ROOT, SeedRefusal } from './lib/copy-payload.js';
import { assertKnownPlatforms, generateWrappers } from './lib/generate-wrappers.js';
import { EXIT_CODES } from '../payload/engine/lib/exit-codes.js';

const USAGE = 'usage: npx unknown-knowledge init [--root <name>] [--platforms <ids|none>] '
  + '[--stacks <ids|none>] [--target <dir>] [--yes]';
const kitRoot = fileURLToPath(new URL('..', import.meta.url));

// The D-009 later-stacks warning — printed at the end of every init AND
// carried by the seeded README (payload/docs/README.md, KK-24).
const LATER_STACKS_WARNING = 'Extractor fixtures for your selected stacks are included. If you adopt '
  + 'another stack later, you author your own pack from the included template '
  + '(templates/new-kind/) — there is no update channel. (D-001, D-009)';

// ----------------------------------------------------------------- flags

/** Split a multi-select answer: comma/whitespace separated; "none" → []. */
function parseSelection(value) {
  const items = value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return items.length === 1 && items[0].toLowerCase() === 'none' ? [] : items;
}

function parseArgs(argv) {
  const opts = { target: '.', root: null, stacks: null, platforms: null, yes: false, help: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length || argv[i].startsWith('--')) throw new Error(`${arg} requires a value\n${USAGE}`);
      return argv[i];
    };
    if (arg === '--target') opts.target = next();
    else if (arg === '--root') opts.root = next();
    else if (arg === '--stacks') opts.stacks = parseSelection(next());
    else if (arg === '--platforms') opts.platforms = parseSelection(next());
    else if (arg === '--yes') opts.yes = true;
    else if (arg === '--help') opts.help = true;
    else if (arg.startsWith('--')) throw new Error(`unknown argument: ${arg}\n${USAGE}`);
    else positional.push(arg);
  }
  if (positional.length > 1 || (positional.length === 1 && positional[0] !== 'init')) {
    throw new Error(`unknown command: ${positional.join(' ')}\n${USAGE}`);
  }
  return opts;
}

// ------------------------------------------------- stack auto-detection

/** Repo file list for detection: git ls-files when a repo, fs walk otherwise. */
function listRepoFiles(targetDir) {
  const git = spawnSync('git', ['-C', targetDir, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' });
  if (git.status === 0) return git.stdout.split('\0').filter(Boolean);
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else out.push(path);
    }
  };
  walk(resolve(targetDir), '');
  return out;
}

/**
 * Auto-detect the target repo's stacks (PRD §6: the multi-select's
 * pre-selection). Heuristics, per file list:
 *   ts    — tsconfig.json / package.json anywhere, or any *.ts / *.tsx
 *   swift — Package.swift anywhere, any *.xcodeproj, or any *.swift
 * Nothing detected = config-only: an empty default, not an error.
 */
export function detectStacks(targetDir) {
  const files = listRepoFiles(targetDir);
  const detected = [];
  if (files.some((f) => /(^|\/)(Package\.swift)$/.test(f) || /\.xcodeproj(\/|$)/.test(f) || /\.swift$/.test(f))) {
    detected.push('swift');
  }
  if (files.some((f) => /(^|\/)(tsconfig\.json|package\.json)$/.test(f) || /\.tsx?$/.test(f))) {
    detected.push('ts');
  }
  return detected.sort();
}

// ------------------------------------------------------------- prompts

/**
 * readline ask: empty answer (or closed/exhausted stdin) accepts the
 * default. Lines are BUFFERED into a queue — with piped stdin (the headless
 * test path) all answers can arrive before the next question registers, and
 * bare rl.question() would drop them.
 */
function makeAsker(rl, output) {
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else queue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  return (prompt) => {
    output.write(prompt);
    if (queue.length) return Promise.resolve(queue.shift().trim());
    if (closed) return Promise.resolve('');
    return new Promise((resolveAnswer) => {
      waiters.push((line) => resolveAnswer(line === null ? '' : line.trim()));
    });
  };
}

/** Multi-select prompt loop: empty accepts the default, invalid ids re-ask. */
async function askSelection(ask, out, { label, known, defaults, validate }) {
  for (;;) {
    const answer = await ask(`${label} [${defaults.join(', ') || 'none'}]: `);
    const selection = answer === '' ? [...defaults] : parseSelection(answer);
    try {
      validate(selection);
      return selection;
    } catch (error) {
      out(`  ${error.message.split('\n')[0]}\n  available: ${known.join(', ') || '(none)'} — or "none"\n`);
    }
  }
}

// ------------------------------------------------ git check-ignore sweep

/**
 * PRD §6: run `git check-ignore` across all seeded paths (batched via
 * --stdin) — a gitignored findings log kills the improvement loop silently.
 * Not a git repo → { skipped: true }; the caller says so and moves on.
 */
export function sweepGitIgnore({ targetDir, paths }) {
  const inside = spawnSync('git', ['-C', targetDir, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') return { skipped: true, ignored: [] };
  const r = spawnSync('git', ['-C', targetDir, 'check-ignore', '--stdin'],
    { input: `${paths.join('\n')}\n`, encoding: 'utf8' });
  // check-ignore exit contract: 0 = some path ignored, 1 = none, other = error.
  if (r.status === 1) return { skipped: false, ignored: [] };
  if (r.status !== 0) return { skipped: false, ignored: [], error: (r.stderr || 'git check-ignore failed').trim() };
  return { skipped: false, ignored: r.stdout.split('\n').filter(Boolean) };
}

/**
 * The seeded engine's one runtime dependency (D-002: js-yaml, resolved from
 * the client's repo like any other package). Resolution is checked from the
 * seeded engine file itself, so this answers the question the engine will
 * ask at import time — not an approximation of it.
 *
 * Unresolvable is a WARN, never a refusal: the seed is correct and the fix
 * is one `npm install` away. But it is a LOUD warn, because the crash it
 * predicts is silent in the worst way — an unresolved import exits 1, which
 * the §5 exit-code contract reads as "findings present", not "engine
 * failure". An agent riding those codes would quarantine-and-continue past
 * an engine that never ran (D-011 conduct assumes exit 2 for that).
 */
export function checkRuntimeDependency(seededRoot, dependency = 'js-yaml') {
  const anchor = join(seededRoot, 'engine', 'lib', 'load-stores.js');
  try {
    createRequire(anchor).resolve(dependency);
    return { resolved: true, dependency };
  } catch {
    return { resolved: false, dependency };
  }
}

/** Negation rules to offer: one `!<root>/<dir>/**` per affected seeded dir. */
export function negationRules(ignored, rootName) {
  const rules = new Set();
  for (const path of ignored) {
    if (path.startsWith(`${rootName}/`)) {
      const segments = path.split('/');
      rules.add(segments.length > 2 ? `!${rootName}/${segments[1]}/**` : `!${path}`);
    } else {
      rules.add(`!${path}`);
    }
  }
  return [...rules].sort();
}

// ----------------------------------------------------------------- main

export async function main(argv, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    stderr.write(`unknown-knowledge init: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }
  if (opts.help) {
    stdout.write(`${USAGE}\n`);
    return EXIT_CODES.CLEAN;
  }
  const out = (text) => stdout.write(text);
  const warn = (text) => stderr.write(text);

  let manifest;
  try {
    manifest = loadManifest(kitRoot);
  } catch (error) {
    stderr.write(`unknown-knowledge init: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }
  const knownStacks = Object.keys(manifest.sections.stacks).sort();
  const knownPlatforms = Object.keys(manifest.platforms).sort();

  // The target must exist before anything reads it: auto-detection walks it
  // (below) long before the copy engine's own guard would fire, and a typo'd
  // --target should say so, not surface an ENOENT stack trace.
  const target = resolve(opts.target);
  if (!statSync(target, { throwIfNoEntry: false })?.isDirectory()) {
    stderr.write(`unknown-knowledge init: target ${JSON.stringify(target)} is not an existing directory — `
      + 'create it (or fix --target) and re-run; a seed that did not happen is never a silent pass\n');
    return EXIT_CODES.FAILURE;
  }
  const detected = detectStacks(opts.target).filter((s) => knownStacks.includes(s));

  // Resolve the three answers: flags win; --yes accepts every default
  // (root: unknown-knowledge, platforms: none, stacks: the detection);
  // otherwise prompt interactively (node:readline, D-002).
  let rootName = opts.root ?? DEFAULT_ROOT;
  let platforms = opts.platforms ?? [];
  let stacks = opts.stacks ?? detected;
  out(`stack auto-detection: ${detected.join(', ') || 'none (config-only)'}\n`);

  const needPrompts = !opts.yes && (opts.root === null || opts.platforms === null || opts.stacks === null);
  if (needPrompts) {
    const rl = createInterface({ input: stdin, terminal: false });
    const ask = makeAsker(rl, stdout);
    try {
      if (opts.root === null) {
        for (;;) {
          const answer = await ask(`root dir name (always visible, never dotted) [${DEFAULT_ROOT}]: `);
          rootName = answer === '' ? DEFAULT_ROOT : answer;
          // The engine validates (copy-payload.js §6 rules); we present.
          if (!rootName.startsWith('.') && !/[/\\]/.test(rootName)) break;
          out('  root dir names are single, visible path segments — never dotted (PRD §6)\n');
        }
      }
      if (opts.platforms === null) {
        out('agent platforms (thin wrappers pointing at the protocol):\n');
        for (const id of knownPlatforms) out(`  ${id.padEnd(12)} ${manifest.platforms[id].name}\n`);
        platforms = await askSelection(ask, out, {
          label: 'platforms (comma/space separated ids)',
          known: knownPlatforms,
          defaults: [],
          validate: (sel) => assertKnownPlatforms(manifest, sel),
        });
      }
      if (opts.stacks === null) {
        out(`stacks (drives which extractor-fixture packs ship, D-009): ${knownStacks.join(', ')}\n`);
        stacks = await askSelection(ask, out, {
          label: 'stacks (pre-selected by auto-detection)',
          known: knownStacks,
          defaults: detected,
          validate: (sel) => {
            for (const s of sel) {
              if (!knownStacks.includes(s)) throw new Error(`unknown stack ${JSON.stringify(s)}`);
            }
          },
        });
      }
    } finally {
      rl.close();
    }
  }

  // ---- scaffold: one call into each landed seam (KK-17 copy engine,
  // KK-18 wrapper generator) — their refusal/collision semantics apply.
  let result;
  let wrappers;
  try {
    assertKnownPlatforms(manifest, platforms); // refuse BEFORE seeding
    result = copyPayload({ kitRoot, targetDir: opts.target, rootName, stacks });
    try {
      wrappers = generateWrappers({ kitRoot, targetDir: opts.target, rootName, platforms });
    } catch (error) {
      // The seed already landed; shared files may carry sentinel appends, so
      // a silent rollback could destroy user bytes — name the partial state
      // instead (a retry refuses on the existing root by design, §6).
      error.message = `${error.message}\n  the store seed was already created at ${result.root} — remove it `
        + '(and any wrapper sentinel blocks) before retrying; init refuses on an existing root';
      throw error;
    }
  } catch (error) {
    const kind = error instanceof SeedRefusal ? 'refused' : 'error';
    stderr.write(`unknown-knowledge init: ${kind}: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }

  out(`seeded ${result.rootName}/ (kit ${result.version}, stacks: ${result.stacks.join(', ') || 'none'}) `
    + `— ${result.files.length} files at ${result.root}\n`);
  for (const w of wrappers) {
    out(w.action === 'skipped'
      ? `wrapper ${w.platform}: skipped ${w.target} — ${w.reason}\n`
      : `wrapper ${w.platform}: ${w.action} ${w.target}\n`);
  }

  // ---- git check-ignore sweep over every seeded path (PRD §6).
  const seededPaths = [
    ...result.files.map((f) => `${result.rootName}/${f}`),
    ...wrappers.filter((w) => w.action !== 'skipped').map((w) => w.target),
  ];
  const sweep = sweepGitIgnore({ targetDir: opts.target, paths: seededPaths });
  if (sweep.skipped) {
    warn('WARN: not a git repo — skipping the git check-ignore sweep; once the repo exists, '
      + `verify none of the seeded paths (especially ${result.rootName}/logs/) are gitignored\n`);
  } else if (sweep.error) {
    warn(`WARN: git check-ignore sweep failed (${sweep.error}) — verify the seeded paths are not gitignored\n`);
  } else if (sweep.ignored.length > 0) {
    warn(`WARN: ${sweep.ignored.length} seeded path(s) are gitignored — a gitignored findings log kills `
      + 'the improvement loop silently. Ignored:\n');
    for (const path of sweep.ignored) warn(`  ${path}\n`);
    warn('add negation rule(s) to your .gitignore:\n');
    for (const rule of negationRules(sweep.ignored, result.rootName)) warn(`  ${rule}\n`);
  }

  // ---- runtime-dependency preflight: the handoff below tells the human to
  // run phase 2, and every engine command it reaches for imports js-yaml.
  const dep = checkRuntimeDependency(result.root);
  if (!dep.resolved) {
    warn(`WARN: the seeded engine's one runtime dependency, ${dep.dependency}, does not resolve `
      + `from ${result.rootName}/engine/ — every engine command will fail to start until it does.\n`);
    warn(`  install it before phase 2:  npm install --save-dev ${dep.dependency}\n`);
    warn('  (an unresolved import exits 1, which the exit-code contract reads as "findings present" '
      + 'rather than "engine failure" — install it and the codes mean what they say)\n');
  }

  // ---- D-009 later-stacks warning (also carried by the seeded README) +
  // the phase-2 handoff (D-019 skill name). PRD §6, verbatim intent.
  out(`\nwarning: ${LATER_STACKS_WARNING}\n`);
  out('\nnow run /knowledge-bootstrap in your agent — phase 2 surveys the repo and populates the stores.\n');
  return EXIT_CODES.CLEAN;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      // An unhandled rejection would die on an unhandled-rejection trace with
      // exit 1 — the FINDINGS code — so a crashed init would read as "seeded
      // with findings" instead of "the seed never happened" (PRD §5).
      process.stderr.write(`unknown-knowledge init: internal failure — nothing was seeded\n${error.stack || error.message}\n`);
      process.exitCode = EXIT_CODES.FAILURE;
    },
  );
}
