/**
 * Payload copy engine (KK-17, PRD §6 Phase 1 / §9.1-§9.2, D-007/D-009) — the
 * manifest-driven library `npx unknown-knowledge init` (KK-19) drives. This
 * is the ENGINE only: prompting UX is KK-19's; callers pass the answers
 * (root name, stacks) as parameters.
 *
 * Copy is manifest-driven ONLY (cli/kit.manifest.yaml): a file the manifest
 * does not name is never copied. Leakage of the kit's acceptance fixtures/
 * and tests/ is impossible BY CONSTRUCTION, not by author discipline:
 *
 *   - every `from` must be relative, `..`-free, and resolve INSIDE payload/
 *     (the §9.2 allowlist root); the loader refuses the manifest otherwise;
 *   - even a hypothetically-contained path that lands under the kit's
 *     fixtures/ or tests/ is refused by name — the engine distrusts
 *     manifest authors (D-007: nothing ships by omission);
 *   - the ONE exception is the `root-files` section, limited to an exact
 *     basename allowlist (LICENSE, NOTICE — required-at-publish, KK-28);
 *     until those files land they are required only when present, so the
 *     parallel PRs compose.
 *
 * Seeding contract (§6):
 *   - root dir defaults to `unknown-knowledge/`, caller-named, NEVER dotted
 *     (a dot-root hides the knowledge base — refused);
 *   - an existing target root — even a partial seed — REFUSES with guidance;
 *     re-init/upgrade is deferred (§11.1);
 *   - the seeded root gets a generated kit.manifest.yaml (§9.1): kit version
 *     stamp (package version — semver semantics are KK-28's), selected
 *     stacks, zone map, and the full sorted seeded-file list (the manifest
 *     echo doubles as the §6 seed marker).
 *
 * Deterministic by construction: sorted expansion, byte-exact copies, no
 * wall-clock reads — identical inputs seed byte-identical trees (A1).
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { load, YAMLException } from 'js-yaml';

export const DEFAULT_ROOT = 'unknown-knowledge';
export const MANIFEST_FILE = join('cli', 'kit.manifest.yaml');
export const SEEDED_MANIFEST = 'kit.manifest.yaml';
/** The one sanctioned exception to the payload/ boundary (KK-28 files). */
export const ROOT_FILE_ALLOWLIST = Object.freeze(['LICENSE', 'NOTICE']);

/** Refusals (existing seed, bad root name) — expected conditions, not bugs. */
export class SeedRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = 'SeedRefusal';
    this.refused = true;
  }
}

// --------------------------------------------------------------- validation

/** A `from`/`to` path must be relative, non-empty, and free of `..`/`.` games. */
function assertSanePath(value, field, entryDesc) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`manifest entry ${entryDesc}: ${field} must be a non-empty string`);
  }
  if (isAbsolute(value) || value.includes('\\')) {
    throw new Error(`manifest entry ${entryDesc}: ${field} must be a relative /-separated path, got ${JSON.stringify(value)}`);
  }
  const segments = value.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error(`manifest entry ${entryDesc}: ${field} may not contain empty, "." or ".." segments (got ${JSON.stringify(value)})`);
  }
}

/** True when `path` is `parent` or lives beneath it (both pre-resolved). */
function within(path, parent) {
  return path === parent || path.startsWith(parent + sep);
}

/**
 * The constructional D-007 guard: a manifest source must resolve inside
 * payload/ and may never name the kit's acceptance fixtures/ or tests/ —
 * the engine refuses such entries rather than trusting manifest authors.
 */
function assertInsidePayload(fromAbs, kitRoot, entryDesc) {
  const payloadRoot = resolve(kitRoot, 'payload');
  for (const forbidden of ['fixtures', 'tests']) {
    if (within(fromAbs, resolve(kitRoot, forbidden))) {
      throw new Error(`manifest entry ${entryDesc}: refuses to ship the kit's ${forbidden}/ (D-007 — acceptance fixtures and kit tests can never ship)`);
    }
  }
  if (!within(fromAbs, payloadRoot)) {
    throw new Error(`manifest entry ${entryDesc}: resolves outside payload/ (${fromAbs}) — the allowlist root is payload/ (D-007)`);
  }
}

/**
 * Root-dir name contract (§6): visible (never dotted), a single path
 * segment, no traversal. The prompt lives in KK-19; the engine validates.
 */
export function validateRootName(rootName) {
  if (typeof rootName !== 'string' || rootName.length === 0) {
    throw new SeedRefusal('root dir name must be a non-empty string');
  }
  if (rootName.startsWith('.')) {
    throw new SeedRefusal(`root dir name ${JSON.stringify(rootName)} is dotted — the knowledge base is always visible, never hidden (PRD §6)`);
  }
  if (/[/\\]/.test(rootName) || rootName === '..' || isAbsolute(rootName)) {
    throw new SeedRefusal(`root dir name ${JSON.stringify(rootName)} must be a single path segment (no separators)`);
  }
  return rootName;
}

// ----------------------------------------------------------------- manifest

/**
 * Load + validate cli/kit.manifest.yaml. Every entry is checked against the
 * D-007 constructional guards at LOAD time — an invalid manifest never
 * reaches the copy phase. Returns the parsed manifest plus resolved roots.
 */
export function loadManifest(kitRoot, manifestPath = join(kitRoot, MANIFEST_FILE)) {
  let doc;
  try {
    doc = load(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    const detail = error instanceof YAMLException ? error.message : error.message;
    throw new Error(`cannot load payload manifest ${manifestPath}: ${detail}`);
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`payload manifest ${manifestPath}: top level must be a mapping`);
  }
  if (doc['schema-version'] !== 1) {
    throw new Error(`payload manifest ${manifestPath}: unsupported schema-version ${JSON.stringify(doc['schema-version'])}`);
  }

  const payloadRoot = resolve(kitRoot, 'payload');
  const sections = { unconditional: doc.unconditional ?? {}, stacks: doc.stacks ?? {} };
  for (const [group, bySection] of Object.entries(sections)) {
    if (typeof bySection !== 'object' || bySection === null || Array.isArray(bySection)) {
      throw new Error(`payload manifest: ${group} must be a mapping of sections to entry lists`);
    }
    for (const [section, entries] of Object.entries(bySection)) {
      if (!Array.isArray(entries)) throw new Error(`payload manifest: ${group}.${section} must be a list`);
      entries.forEach((entry, i) => {
        const desc = `${group}.${section}[${i}]`;
        if (typeof entry !== 'object' || entry === null) throw new Error(`manifest entry ${desc}: must be a { from, to } mapping`);
        assertSanePath(entry.from, 'from', desc);
        assertSanePath(entry.to, 'to', desc);
        assertInsidePayload(resolve(payloadRoot, entry.from), kitRoot, desc);
      });
    }
  }

  const create = doc.create ?? [];
  if (!Array.isArray(create)) throw new Error('payload manifest: create must be a list of target dirs');
  create.forEach((dir, i) => assertSanePath(dir, 'dir', `create[${i}]`));

  // Platform wrapper registry (KK-18): data-driven and extensible, but held
  // to the same D-007 construction as copy entries — a template that escapes
  // payload/ (or names fixtures/tests) refuses the manifest at load time.
  // Targets are CLIENT-REPO-ROOT-relative conventional paths; they only need
  // path sanity (relative, ..-free), not payload containment.
  const platforms = doc.platforms ?? {};
  if (typeof platforms !== 'object' || platforms === null || Array.isArray(platforms)) {
    throw new Error('payload manifest: platforms must be a mapping of platform ids to wrapper specs');
  }
  const wrapperTargets = new Set();
  for (const [id, spec] of Object.entries(platforms)) {
    const desc = `platforms.${id}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`payload manifest: ${desc}: platform ids are lowercase kebab-case`);
    }
    if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
      throw new Error(`payload manifest: ${desc}: must be a { name, template, target, mode } mapping`);
    }
    if (typeof spec.name !== 'string' || spec.name.length === 0) {
      throw new Error(`payload manifest: ${desc}: name must be a non-empty string`);
    }
    assertSanePath(spec.template, 'template', desc);
    assertInsidePayload(resolve(payloadRoot, spec.template), kitRoot, desc);
    assertSanePath(spec.target, 'target', desc);
    if (spec.mode !== 'shared' && spec.mode !== 'dedicated') {
      throw new Error(`payload manifest: ${desc}: mode must be "shared" or "dedicated" (§6 collision policy), got ${JSON.stringify(spec.mode)}`);
    }
    if (wrapperTargets.has(spec.target)) {
      throw new Error(`payload manifest: ${desc}: duplicate wrapper target ${JSON.stringify(spec.target)}`);
    }
    wrapperTargets.add(spec.target);
  }

  const rootFiles = doc['root-files'] ?? [];
  if (!Array.isArray(rootFiles)) throw new Error('payload manifest: root-files must be a list');
  for (const name of rootFiles) {
    if (!ROOT_FILE_ALLOWLIST.includes(name)) {
      throw new Error(`payload manifest: root-files entry ${JSON.stringify(name)} is not in the sanctioned allowlist [${ROOT_FILE_ALLOWLIST.join(', ')}] (D-007)`);
    }
  }

  const zones = doc.zones ?? {};
  const defaults = doc.defaults ?? {};
  return { manifestPath, kitRoot, payloadRoot, sections, platforms, create, rootFiles, zones, defaults };
}

/** Every file beneath dir (relative /-joined paths), sorted; symlinks refused. */
function walkFiles(dirAbs, relPrefix, entryDesc) {
  const out = [];
  for (const entry of readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error(`manifest entry ${entryDesc}: ${rel} is a symlink — payload sources must be regular files (D-007: a link could reach outside the allowlist)`);
    }
    if (entry.isDirectory()) out.push(...walkFiles(join(dirAbs, entry.name), rel, entryDesc));
    else out.push(rel);
  }
  return out;
}

/**
 * Expand the manifest for a stack selection into the exact copy plan:
 * sorted [{ from (abs), to (seeded-root-relative) }]. Root-files are
 * appended only when present at the kit root (required-at-publish, KK-28).
 * Duplicate targets are a manifest bug and refuse.
 */
export function expandManifest(manifest, stacks = []) {
  const { payloadRoot, kitRoot, sections } = manifest;
  const known = Object.keys(sections.stacks).sort();
  for (const stack of stacks) {
    if (!known.includes(stack)) {
      throw new Error(`unknown stack ${JSON.stringify(stack)} — manifest defines: ${known.join(', ') || '(none)'}`);
    }
  }

  const entries = [
    ...Object.values(sections.unconditional).flat(),
    ...[...new Set(stacks)].sort().flatMap((s) => sections.stacks[s]),
  ];

  const plan = [];
  for (const entry of entries) {
    const fromAbs = resolve(payloadRoot, entry.from);
    if (!existsSync(fromAbs)) throw new Error(`manifest entry ${entry.from}: missing from payload/ — the allowlist and the payload tree have drifted`);
    const stat = lstatSync(fromAbs);
    if (stat.isSymbolicLink()) throw new Error(`manifest entry ${entry.from}: symlink sources are refused (D-007)`);
    if (stat.isDirectory()) {
      for (const rel of walkFiles(fromAbs, '', entry.from)) {
        plan.push({ from: join(fromAbs, rel), to: `${entry.to}/${rel}` });
      }
    } else {
      plan.push({ from: fromAbs, to: entry.to });
    }
  }
  for (const name of manifest.rootFiles) {
    const fromAbs = join(kitRoot, name);
    if (existsSync(fromAbs)) plan.push({ from: fromAbs, to: name }); // required-at-publish (KK-28)
  }

  plan.sort((a, b) => a.to.localeCompare(b.to));
  for (let i = 1; i < plan.length; i += 1) {
    if (plan[i].to === plan[i - 1].to) throw new Error(`manifest expands to duplicate target ${plan[i].to}`);
  }
  const seededManifestClash = plan.find((p) => p.to === SEEDED_MANIFEST);
  if (seededManifestClash) throw new Error(`manifest entry targets ${SEEDED_MANIFEST} — that file is generated by the engine (§9.1)`);
  return plan;
}

// ------------------------------------------------------------------ seeding

/** Deterministic seeded kit.manifest.yaml (§9.1): stamp + zones + echo. */
function renderSeededManifest({ version, stacks, zones, files }) {
  const list = (xs) => (xs.length ? `[${xs.join(', ')}]` : '[]');
  const lines = [
    '# kit.manifest.yaml — seeded by `unknown-knowledge init` (PRD §9.1).',
    '# Kit version stamp (semver semantics per kit CHANGELOG, KK-28), the',
    '# stacks selected at init (D-009), the zone map (kit-vendored vs. client',
    '# data — everything is client-owned after seed, D-001), and the exact',
    '# seeded file list (the D-007 allowlist echo). Presence of this file',
    '# marks a seeded repo: v1 init refuses to re-seed (PRD §6).',
    'schema-version: 1',
    `kit-version: "${version}"`,
    `stacks: ${list(stacks)}`,
    'zones:',
    `  seeded: ${list(zones.seeded ?? [])}`,
    `  client: ${list(zones.client ?? [])}`,
    'files:',
    ...files.map((f) => `  - ${f}`),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Seed a target repo from the manifest. Refuses (SeedRefusal) on a dotted
 * root name or an existing target root — even a partial seed (§6).
 *
 * @param {object} options
 * @param {string} options.kitRoot   kit repo root (holds payload/ + cli/)
 * @param {string} options.targetDir client repo root to seed into
 * @param {string} [options.rootName] seeded dir name (default unknown-knowledge)
 * @param {string[]} [options.stacks] selected stacks (manifest keys)
 * @param {string} [options.manifestPath] override, for tests
 * @returns {{ root: string, rootName: string, version: string, stacks: string[], files: string[] }}
 */
export function copyPayload({ kitRoot, targetDir, rootName = DEFAULT_ROOT, stacks = [], manifestPath }) {
  validateRootName(rootName);
  const manifest = loadManifest(kitRoot, manifestPath);
  const selected = [...new Set(stacks)].sort();
  const plan = expandManifest(manifest, selected);

  const destRoot = resolve(targetDir, rootName);
  if (existsSync(destRoot)) {
    throw new SeedRefusal(
      `${destRoot} already exists — refusing to seed over it, even a partial seed. `
      + 'Re-init/upgrade is deferred (PRD §11.1): move or remove the directory, or pass a different root name, then re-run.');
  }
  if (!existsSync(resolve(targetDir))) {
    throw new Error(`target dir ${resolve(targetDir)} does not exist`);
  }

  const version = JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8')).version;

  mkdirSync(destRoot, { recursive: true });
  const files = [];
  for (const { from, to } of plan) {
    const dest = join(destRoot, to);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(from, dest);
    files.push(to);
  }
  for (const dir of manifest.create) {
    mkdirSync(join(destRoot, dir), { recursive: true });
    writeFileSync(join(destRoot, dir, '.gitkeep'), '');
    files.push(`${dir}/.gitkeep`);
  }
  files.push(SEEDED_MANIFEST);
  files.sort();
  writeFileSync(join(destRoot, SEEDED_MANIFEST),
    renderSeededManifest({ version, stacks: selected, zones: manifest.zones, files }));

  return { root: destRoot, rootName, version, stacks: selected, files };
}
