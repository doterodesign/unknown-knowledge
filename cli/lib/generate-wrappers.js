/**
 * Platform wrapper generation (KK-18, PRD §6/§9.2) — the second half of the
 * init copy layer: thin pointer files at each selected agent platform's
 * conventional path, aiming the platform at <root>/protocol/AGENTS.md. Like
 * copy-payload.js this is the ENGINE only; the multi-select prompt is
 * KK-19's, callers pass the chosen platform ids.
 *
 * The registry is DATA, not code: the `platforms:` section of
 * cli/kit.manifest.yaml (id → { name, template, target, mode }). Adding a
 * platform later = adding a manifest entry (+ a template under
 * payload/wrappers/ if the generic pointer doesn't fit). Templates live in
 * payload/ under the same D-007 constructional guards as copy sources;
 * targets are CLIENT-REPO-ROOT-relative conventional paths (dotted dirs
 * allowed — the §6 never-dotted rule governs the seeded root only).
 * Wrappers duplicate nothing: protocol/AGENTS.md stays the single source of
 * truth; a wrapper is a few pointer lines rendered from its template with
 * `{{root}}` replaced by the seeded root name.
 *
 * Collision policy (§6), per the registry's `mode`:
 *   shared    — ecosystem-shared instruction files (root AGENTS.md,
 *               .github/copilot-instructions.md). Fresh file → created
 *               holding just the sentinel block. Existing file without
 *               sentinels → APPENDED between sentinel markers, existing
 *               content byte-preserved. Existing well-formed sentinel block
 *               → content REPLACED WITHIN the sentinels (the idempotent
 *               choice: re-generation converges instead of refusing, and a
 *               root rename updates the pointer in place). Malformed
 *               sentinels (unbalanced/reversed/multiple) → skip-and-report,
 *               never guess.
 *   dedicated — single-tool files (CLAUDE.md, GEMINI.md, .cursor rule).
 *               Created if absent; an existing file is the user's own —
 *               skip-and-report, never clobbered.
 * Symlinked targets are skipped, never written through (D-007 posture).
 *
 * Deterministic by construction: pure render of template x root name,
 * platforms processed sorted, no wall-clock reads. Skips are REPORTED
 * results, not errors — a partial wrapper set never fails the seed.
 */
import { lstatSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DEFAULT_ROOT, loadManifest, validateRootName } from './copy-payload.js';

export const SENTINEL_BEGIN = '<!-- unknown-knowledge:begin -->';
export const SENTINEL_END = '<!-- unknown-knowledge:end -->';

/** Refuse unknown platform ids against the manifest registry (pre-seed check). */
export function assertKnownPlatforms(manifest, ids) {
  const known = Object.keys(manifest.platforms).sort();
  for (const id of ids) {
    if (!known.includes(id)) {
      throw new Error(`unknown platform ${JSON.stringify(id)} — manifest defines: ${known.join(', ') || '(none)'}`);
    }
  }
}

/** Pure template render: {{root}} → seeded root name; leftovers are a template bug. */
function renderTemplate(text, rootName, templateRel) {
  const out = text.replaceAll('{{root}}', rootName);
  const leftover = out.match(/\{\{[a-z0-9-]+\}\}/);
  if (leftover) throw new Error(`wrapper template ${templateRel}: unresolved placeholder ${leftover[0]}`);
  return out;
}

function sentinelBlock(body) {
  return `${SENTINEL_BEGIN}\n${body.trimEnd()}\n${SENTINEL_END}\n`;
}

/** lstat that treats absence as null (a dangling symlink still counts as present). */
function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

const countOf = (text, needle) => text.split(needle).length - 1;

/** §6 shared-file policy: sentinel-append / replace-within-sentinels, never clobber. */
function writeShared(targetAbs, body) {
  const block = sentinelBlock(body);
  const stat = lstatOrNull(targetAbs);
  if (stat === null) {
    mkdirSync(dirname(targetAbs), { recursive: true });
    writeFileSync(targetAbs, block);
    return { action: 'created' };
  }
  if (stat.isSymbolicLink()) {
    return { action: 'skipped', reason: 'target is a symlink — wrappers are never written through links' };
  }
  const text = readFileSync(targetAbs, 'utf8');
  const begins = countOf(text, SENTINEL_BEGIN);
  const ends = countOf(text, SENTINEL_END);
  if (begins === 0 && ends === 0) {
    const sep = text.length === 0 ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(targetAbs, `${text}${sep}${block}`);
    return { action: 'appended' };
  }
  if (begins === 1 && ends === 1 && text.indexOf(SENTINEL_BEGIN) < text.indexOf(SENTINEL_END)) {
    const start = text.indexOf(SENTINEL_BEGIN);
    let after = text.indexOf(SENTINEL_END) + SENTINEL_END.length;
    if (text[after] === '\n') after += 1; // the block carries its own trailing newline
    writeFileSync(targetAbs, text.slice(0, start) + block + text.slice(after));
    return { action: 'replaced' };
  }
  return {
    action: 'skipped',
    reason: `existing sentinel markers are malformed (expected exactly one ${SENTINEL_BEGIN} before one ${SENTINEL_END}) — resolve the file by hand, then re-add the pointer`,
  };
}

/** §6 dedicated-file policy: create if absent; an existing file is never touched. */
function writeDedicated(targetAbs, body, rootName) {
  if (lstatOrNull(targetAbs) !== null) {
    return {
      action: 'skipped',
      reason: `already exists — dedicated wrapper targets are never overwritten (§6); add the pointer yourself: read ${rootName}/protocol/AGENTS.md before working`,
    };
  }
  mkdirSync(dirname(targetAbs), { recursive: true });
  writeFileSync(targetAbs, body);
  return { action: 'created' };
}

/**
 * Generate wrappers for the selected platforms into targetDir (the client
 * repo root — wrapper targets are root-relative conventional paths, NOT
 * inside the seeded kit dir).
 *
 * @param {object} options
 * @param {string} options.kitRoot   kit repo root (holds payload/ + cli/)
 * @param {string} options.targetDir client repo root receiving the wrappers
 * @param {string} [options.rootName] seeded kit dir name the pointers cite
 * @param {string[]} [options.platforms] selected registry ids
 * @param {string} [options.manifestPath] override, for tests
 * @returns {Array<{ platform: string, name: string, target: string, mode: string,
 *                   action: 'created'|'appended'|'replaced'|'skipped', reason?: string }>}
 */
export function generateWrappers({ kitRoot, targetDir, rootName = DEFAULT_ROOT, platforms = [], manifestPath }) {
  validateRootName(rootName);
  const manifest = loadManifest(kitRoot, manifestPath);
  assertKnownPlatforms(manifest, platforms);
  if (!existsSync(resolve(targetDir))) {
    throw new Error(`target dir ${resolve(targetDir)} does not exist`);
  }

  const results = [];
  for (const id of [...new Set(platforms)].sort()) {
    const spec = manifest.platforms[id];
    const templateAbs = resolve(manifest.payloadRoot, spec.template);
    if (!existsSync(templateAbs)) {
      throw new Error(`platforms.${id}: template ${spec.template} missing from payload/ — the registry and the payload tree have drifted`);
    }
    const body = renderTemplate(readFileSync(templateAbs, 'utf8'), rootName, spec.template);
    const targetAbs = join(resolve(targetDir), spec.target);
    const outcome = spec.mode === 'shared'
      ? writeShared(targetAbs, body)
      : writeDedicated(targetAbs, body, rootName);
    results.push({ platform: id, name: spec.name, target: spec.target, mode: spec.mode, ...outcome });
  }
  return results;
}
