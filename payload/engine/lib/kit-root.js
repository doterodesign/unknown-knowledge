/**
 * Where the Kit lives under a repo root — the one authority (UCS-934).
 *
 * Every repo-root-taking surface asks this module two questions, and there is
 * exactly one answer to each: which directory holds the stores, and which
 * root-relative paths are KIT ZONE (kit-vendored data the reverse audit must
 * never propose concepts for — the map is never told to map itself).
 *
 * This used to be answered twice, with opposite tie-breaks: the loader
 * preferred the nested seeded dir, the reverse audit preferred the repo root.
 * A repo carrying both read as two different Stores depending on which surface
 * asked, which voids the single-health-model guarantee — the audit could
 * propose Concepts against one Store while preflight verdicted another.
 *
 * THERE IS NO TIE-BREAK, because the answer is not knowable. A repo carrying
 * BOTH a seeded kit dir and root-level stores is ambiguous in a way no rule
 * decides correctly:
 *
 *   - a client with a product `ontology/` who seeds a kit wants the NESTED one
 *   - a client who moved their stores to the root, leaving a stale seeded dir
 *     behind, wants the ROOT one
 *
 * Both repos look identical from here. Picking either silently reads one Store
 * and ignores the other — a confident wrong answer, which is the failure class
 * this engine exists to prevent. So an ambiguous layout REFUSES: every surface
 * fails identically (exit 2) and names both candidates, rather than four
 * surfaces agreeing on one Store while the audit quietly reads the other.
 *
 * Unambiguous layouts resolve without ceremony: a seeded dir alone is the Kit
 * (the D-016 default `init` creates, and where the generated platform wrappers
 * point every agent); otherwise the repo root is, which is how the kit's own
 * repo eats its own cooking and how every engine test fixture is laid out.
 * Stores absent entirely is not an error: the loader reports missing-store
 * warnings and the audit proposes every anchor.
 */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { EngineRefusal } from './engine-refusal.js';

/** The §9.1/D-016 seeded kit directory name. Renames are a later seam. */
export const KIT_DIR_DEFAULT = 'unknown-knowledge';

/** The human-confirmed survey boundary (§6), written at the kit root. */
export const SCOPE_FILE = 'survey-scope.yaml';

/** Client-zone suppression file (KK-27/D-013) — kit zone, at the kit root. */
export const SUPPRESSIONS_FILE = 'suppressions.yaml';

/** The three governed stores plus the fragment logs (§3, D-010). */
const STORE_DIRS = ['ontology', 'knowledge', 'decisions', 'logs'];

/**
 * Kit zone when the stores live at the scan root itself. The seeded dir name
 * stays listed as belt-and-braces: a seeded DIRECTORY here would now refuse as
 * ambiguous before the zone is ever consulted, but a stray file by that name
 * is still kit-shaped and never product surface to propose concepts for.
 */
const KIT_ZONE_AT_ROOT = [...STORE_DIRS, SCOPE_FILE, SUPPRESSIONS_FILE, KIT_DIR_DEFAULT];

const isDir = (path) => !!statSync(path, { throwIfNoEntry: false })?.isDirectory();

/**
 * The repo root is itself a store root when it carries the artifact-owned or
 * world-owned stores. `decisions/` alone does not count: the kit's own repo
 * keeps a decisions store at its root without being a seeded kit.
 */
const looksLikeStoreRoot = (root) => isDir(join(root, 'ontology')) || isDir(join(root, 'knowledge'));

/** A repo whose Kit cannot be identified — never resolved by guessing. */
export class AmbiguousKitLayout extends EngineRefusal {
  // Without this, `err.name` reads "Error" and a logged refusal hides which
  // failure it was — the exit-2 message should identify itself.
  name = 'AmbiguousKitLayout';
}

/**
 * Locate the Kit under a repo root.
 *
 * @param {string} root the repo root (`--root`), never the store dir
 * @returns {{ kitRoot: string, kitPrefixes: string[] }} the directory holding
 *   the stores, and the root-relative paths that are kit zone
 * @throws {AmbiguousKitLayout} when a seeded kit dir and root-level stores
 *   both exist, so no surface can know which Store is authoritative
 */
export function locateKit(root) {
  const nested = join(root, KIT_DIR_DEFAULT);
  if (isDir(nested)) {
    if (looksLikeStoreRoot(root)) {
      throw new AmbiguousKitLayout(
        `two candidate kit roots under ${JSON.stringify(root)}: the seeded ${KIT_DIR_DEFAULT}/ and stores at the root itself. `
        + 'Which one is authoritative is not knowable from here, and guessing would let the reverse audit read a different '
        + 'store than the validators (PRD §4, single health model). Point --root at the intended kit root, or remove the stale one.',
      );
    }
    return { kitRoot: nested, kitPrefixes: [KIT_DIR_DEFAULT] };
  }
  return { kitRoot: root, kitPrefixes: KIT_ZONE_AT_ROOT };
}

/** The store root alone, for surfaces that never scan for product anchors. */
export const locateKitRoot = (root) => locateKit(root).kitRoot;
