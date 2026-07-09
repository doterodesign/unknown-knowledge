#!/usr/bin/env node
/**
 * Survey map (KK-25) — deterministic traversal-surface builder (PRD §4), the
 * token-efficiency backbone of bootstrap and audit. Agents TRIAGE this
 * artifact; raw repo traversal is a protocol violation (§6).
 *
 *   - Git-tracked files only (`git ls-files --stage`) — never raw fs walks.
 *   - Built-in denylist: dot-directories, vendored/generated dirs, lockfiles,
 *     `*.gen.*`, binary extensions.
 *   - Per-directory extension/count histograms (direct children).
 *   - Anchor-candidate pre-scan: lexical sniff per §5.1 kind, sharing ONE
 *     regex table with the extractors (lib/anchor-signatures.js). Ranked by
 *     path/kind — a stable triage order, not a judgment call.
 *   - Proposed include/exclude scope over top-level directories; once the
 *     human-confirmed survey-scope.yaml exists it is HONORED: the map is
 *     bounded to it, and audit/reflect share the same contract via
 *     loadSurveyScope()/inScope(). A malformed scope file is an engine
 *     failure (exit 2), never silently ignored.
 *   - Explicit `unsurveyed:` disclosure — submodule gitlinks and out-of-root
 *     symlinks the map could NOT see (§11.1). Blind spots exit 1 (findings),
 *     never a silent pass.
 *
 * Deterministic by construction: stable sorting everywhere, no wall-clock
 * timestamps, no network, and — D-014 — no import/eval/spawn of repo content;
 * candidate scanning is lexical only.
 */
import { readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, isAbsolute, resolve, sep } from 'node:path';
import { load, YAMLException } from 'js-yaml';
import { ANCHOR_SIGNATURES } from './lib/anchor-signatures.js';
import { SCOPE_FILE } from './lib/kit-root.js';
import { validateStoreFile, compare } from './lib/validate-record.js';
import { EXIT_CODES } from './lib/exit-codes.js';
import { isEntrypoint, parseArgs as parseFlags, runCli, UsageError } from './lib/cli.js';

export { SCOPE_FILE } from './lib/kit-root.js';

/** Vendored/generated directory names (any path segment). */
const DENY_DIRS = new Set([
  'node_modules', 'bower_components', 'vendor', 'vendors', 'third_party',
  'third-party', 'Pods', 'Carthage', 'DerivedData', 'dist', 'build', 'out',
  'coverage', '__pycache__', '.build',
]);
const DENY_LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lock', 'bun.lockb', 'deno.lock', 'Podfile.lock', 'Package.resolved',
  'Cargo.lock', 'Gemfile.lock', 'composer.lock', 'poetry.lock', 'uv.lock',
  'go.sum',
]);
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.ico', '.icns', '.pdf',
  '.zip', '.gz', '.tgz', '.jar', '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.mov', '.wav', '.so', '.dylib', '.a', '.o', '.bin',
  '.exe', '.dll', '.sqlite', '.realm', '.car', '.dat',
]);
/** Siblings (files sharing one extension, or module subfolders) before a dir reads as dir-modules. */
const DIR_MODULES_MIN = 3;

function denied(path) {
  const name = basename(path);
  if (DENY_LOCKFILES.has(name) || /\.gen\./.test(name)) return true;
  if (BINARY_EXTENSIONS.has(extname(name).toLowerCase())) return true;
  const dirs = path.split('/').slice(0, -1);
  return dirs.some((d) => d.startsWith('.') || DENY_DIRS.has(d));
}

/**
 * `git ls-files --stage` rows: { mode, path }. Throws on any git failure.
 * Deduped by path: a merge-conflicted path emits one row per stage (1/2/3),
 * which would otherwise inflate tracked counts and triplicate candidates.
 */
function gitLsFiles(root) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z', '--stage'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ls-files failed in ${root}: ${result.error?.message ?? result.stderr.trim()}`);
  }
  const rows = [];
  const seen = new Set();
  for (const row of result.stdout.split('\0').filter(Boolean)) {
    const tab = row.indexOf('\t');
    const path = row.slice(tab + 1);
    if (seen.has(path)) continue;
    seen.add(path);
    rows.push({ mode: row.slice(0, 6), path });
  }
  return rows;
}

/**
 * True when a tracked symlink resolves outside the repo root (a blind spot).
 * `realRoot` must be canonical (realpathSync'd once by the caller): comparing
 * against a non-canonical root (/tmp/x when /tmp -> /private/tmp) would flag
 * every absolute in-repo symlink as escaping. The landing point is
 * canonicalized too, so an in-repo absolute target never false-positives.
 */
function escapesRoot(realRoot, path) {
  try {
    const target = readlinkSync(resolve(realRoot, path));
    let landed = resolve(dirname(resolve(realRoot, path)), target);
    try {
      landed = realpathSync(landed);
    } catch {
      // dangling target: judge by the resolved path as-is
    }
    return landed !== realRoot && !landed.startsWith(realRoot + sep);
  } catch {
    return false; // unreadable link: surveyed as an ordinary tracked file
  }
}

/**
 * Load survey-scope.yaml from `root` — the shared honor-it contract for
 * survey-map, audit (KK-12), and reflect. Returns { present:false } when the
 * file does not exist; THROWS on unreadable/unparseable/invalid content — a
 * scope the engine cannot honor must never degrade to "no scope".
 */
export function loadSurveyScope(root) {
  let text;
  try {
    text = readFileSync(resolve(root, SCOPE_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { present: false, include: [], exclude: [] };
    throw new Error(`${SCOPE_FILE}: cannot read: ${error.message}`);
  }
  let doc;
  try {
    doc = load(text, { filename: SCOPE_FILE });
  } catch (error) {
    const reason = error instanceof YAMLException ? error.reason ?? error.message : error.message;
    throw new Error(`${SCOPE_FILE}: unparseable YAML: ${reason}`);
  }
  const { ok, errors } = validateStoreFile('survey-scope', doc);
  if (!ok) {
    const detail = errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`${SCOPE_FILE}: invalid scope file — ${detail}`);
  }
  return {
    present: true,
    include: doc.include.map(normalizePrefix).sort(compare),
    exclude: (doc.exclude ?? []).map(normalizePrefix).sort(compare),
  };
}

/** `src/` means `src` — a trailing slash must never make an include silently match nothing. */
const normalizePrefix = (prefix) => {
  const stripped = prefix.replace(/\/+$/, '');
  return stripped === '' ? '.' : stripped;
};

/** `.` covers root-level files only; any other prefix covers itself and its subtree. */
const underPrefix = (path, prefix) =>
  prefix === '.' ? !path.includes('/') : path === prefix || path.startsWith(`${prefix}/`);

/** The honor-it contract: include prefixes bound the sweep; exclude wins. */
export function inScope(path, scope) {
  if (!scope.present) return true;
  if (scope.exclude.some((p) => underPrefix(path, p))) return false;
  return scope.include.some((p) => underPrefix(path, p));
}

/** Lexical §5.1 pre-scan of one file; returns matched kinds (never executes). */
function sniffKinds(root, path) {
  const ext = extname(path).toLowerCase();
  const sigs = ANCHOR_SIGNATURES.filter((s) => s.extensions?.includes(ext));
  if (sigs.length === 0) return [];
  let bytes;
  try {
    bytes = readFileSync(resolve(root, path));
  } catch {
    return []; // tracked but absent from the worktree: nothing to sniff
  }
  // UTF-16 BOM (legacy Xcode .strings exports): the UTF-8 sniff cannot read
  // the content, so treat the file as candidate-by-extension rather than
  // skipping it silently — the extractor decides, the map never hides.
  if (bytes.length >= 2
    && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) {
    return [...new Set(sigs.map((s) => s.kind))];
  }
  const text = bytes.toString('utf8');
  return sigs.filter((s) => new RegExp(s.pattern, s.flags).test(text)).map((s) => s.kind);
}

/**
 * Build the survey map for a git repo at `root`. Deterministic: same tree in,
 * byte-identical map out. Throws on engine failure (no git, malformed scope).
 */
export function buildSurveyMap(root) {
  const rows = gitLsFiles(root);
  const scope = loadSurveyScope(root);
  // Canonicalize ONCE: a root reached through a symlink (/tmp -> /private/tmp
  // on macOS) must not flag every absolute in-repo symlink as out-of-root.
  const realRoot = realpathSync(resolve(root));

  // A scope that matches nothing would emit a plausible-looking empty survey —
  // an engine failure (exit 2), never a silent surveyed:0 pass.
  if (scope.present
    && !rows.some(({ mode, path }) => mode !== '160000' && inScope(path, scope))) {
    throw new Error(`${SCOPE_FILE}: include [${scope.include.join(', ')}] matches zero tracked files — refusing to emit a silent empty survey`);
  }

  const unsurveyed = [];
  const surveyed = [];
  let deniedCount = 0;
  for (const { mode, path } of rows) {
    if (mode === '160000') {
      unsurveyed.push({ path, reason: 'submodule-gitlink' });
    } else if (mode === '120000' && escapesRoot(realRoot, path)) {
      unsurveyed.push({ path, reason: 'out-of-root-symlink' });
    } else if (denied(path)) {
      deniedCount += 1;
    } else if (inScope(path, scope)) {
      surveyed.push(path);
    }
  }
  surveyed.sort(compare);
  unsurveyed.sort((a, b) => compare(a.path, b.path));

  // Per-directory histograms over direct children.
  const byDir = new Map();
  for (const path of surveyed) {
    const dir = path.includes('/') ? dirname(path) : '.';
    if (!byDir.has(dir)) byDir.set(dir, new Map());
    const ext = extname(path) || '(none)';
    const hist = byDir.get(dir);
    hist.set(ext, (hist.get(ext) ?? 0) + 1);
  }
  const directories = [...byDir.keys()].sort(compare).map((dir) => {
    const hist = byDir.get(dir);
    const extensions = Object.fromEntries([...hist.entries()].sort((a, b) => compare(a[0], b[0])));
    return { path: dir, files: [...hist.values()].reduce((a, b) => a + b, 0), extensions };
  });

  // Anchor candidates: content sniffs plus the structural dir-modules shapes —
  // sibling FILES sharing one extension, or per-module SUBFOLDERS (the PRD's
  // canonical modules/nfl/, modules/nba/, modules/mlb/ layout).
  const candidates = [];
  for (const path of surveyed) {
    for (const kind of sniffKinds(root, path)) candidates.push({ kind, path });
  }
  const childDirs = new Map(); // dir -> Set of direct child dirs holding tracked files
  for (const path of surveyed) {
    const segs = path.split('/');
    let parent = '.';
    for (let i = 0; i < segs.length - 1; i += 1) {
      const dir = parent === '.' ? segs[i] : `${parent}/${segs[i]}`;
      if (!childDirs.has(parent)) childDirs.set(parent, new Set());
      childDirs.get(parent).add(dir);
      parent = dir;
    }
  }
  const dirModules = new Set();
  for (const { path, extensions } of directories) {
    if (Object.values(extensions).some((n) => n >= DIR_MODULES_MIN)) dirModules.add(path);
  }
  for (const [dir, kids] of childDirs) {
    if (kids.size >= DIR_MODULES_MIN) dirModules.add(dir);
  }
  for (const path of dirModules) candidates.push({ kind: 'dir-modules', path });
  candidates.sort((a, b) => compare(a.path, b.path) || compare(a.kind, b.kind));

  // Scope: honor the confirmed file, else propose from top-level directories —
  // include those with surveyed files, exclude those that are pure denylist.
  let scopeOut;
  if (scope.present) {
    scopeOut = { source: SCOPE_FILE, include: scope.include, exclude: scope.exclude };
  } else {
    const topSurveyed = new Set();
    const topDenied = new Set();
    for (const { mode, path } of rows) {
      if (mode === '160000') continue;
      // Root-level files are proposed as '.' (root files only, no subtree) —
      // accepting the proposal must never silently drop package.json et al.
      const top = path.includes('/') ? path.slice(0, path.indexOf('/')) : '.';
      (denied(path) ? topDenied : topSurveyed).add(top);
    }
    scopeOut = {
      source: 'proposed',
      include: [...topSurveyed].sort(compare),
      exclude: [...topDenied].filter((d) => !topSurveyed.has(d)).sort(compare),
    };
  }

  return {
    counts: { tracked: rows.length, surveyed: surveyed.length, denied: deniedCount, unsurveyed: unsurveyed.length },
    scope: scopeOut,
    directories,
    candidates,
    unsurveyed,
  };
}

// ---------------------------------------------------------------- CLI

const USAGE = 'usage: node payload/engine/survey-map.js [root] [--root <dir>] [--json]';

function parseArgs(argv) {
  const { options, positionals } = parseFlags(argv, {
    boolean: ['json'],
    value: ['root'],
    positionals: true,
  });
  if (positionals.length > 1) {
    throw new UsageError(`unexpected argument ${JSON.stringify(positionals[1])}`);
  }
  // The root may be named positionally or by flag, never both: two names for
  // the root is exactly the ambiguity `locateKit` refuses to guess at.
  if (options.root !== undefined && positionals.length) {
    throw new UsageError(`the root is named twice: ${JSON.stringify(positionals[0])} and --root ${JSON.stringify(options.root)}`);
  }
  return { root: resolve(options.root ?? positionals[0] ?? '.'), json: !!options.json };
}

function printHuman(map) {
  const lines = [
    `surveyed ${map.counts.surveyed} tracked file(s) across ${map.directories.length} director(ies); ${map.counts.denied} denylisted`,
    `scope (${map.scope.source}): include ${map.scope.include.join(', ') || '(none)'}; exclude ${map.scope.exclude.join(', ') || '(none)'}`,
    `anchor candidates: ${map.candidates.length}`,
    ...map.candidates.map((c) => `  ${c.kind.padEnd(18)} ${c.path}`),
    map.unsurveyed.length === 0
      ? 'nothing unsurveyed — the map saw every tracked path'
      : `UNSURVEYED (blind spots the map could NOT see — disclose at the scope gate):`,
    ...map.unsurveyed.map((u) => `  ${u.reason.padEnd(22)} ${u.path}`),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

/**
 * CLI entry. Exit codes per the engine contract (PRD §5): 0 clean,
 * 1 blind spots disclosed under unsurveyed:, 2 engine/environment failure.
 */
export function main(argv) {
  const opts = parseArgs(argv); // a UsageError reaches the harness

  let map;
  try {
    map = buildSurveyMap(opts.root);
  } catch (error) {
    // An EXPECTED environment failure (no git, unparseable scope, a scope whose
    // include matches nothing): the survey never ran, so it cannot report blind
    // spots. Exit 2 — never 1, which would claim it ran and found them.
    process.stderr.write(`survey-map: ${error.message}\n`);
    return EXIT_CODES.FAILURE;
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(map, null, 2)}\n`);
  else printHuman(map);
  return map.unsurveyed.length === 0 ? EXIT_CODES.CLEAN : EXIT_CODES.FINDINGS;
}

if (isEntrypoint(import.meta.url)) {
  // runCli owns the epilogue: a usage error and ANY unexpected throw exit 2.
  // Never process.exit(): it truncates piped stdout mid-flush (PRD §5).
  runCli('survey-map', main, { usage: USAGE }).then((code) => { process.exitCode = code; });
}
