/**
 * Structural validator (KK-05) — blocking-grade (PRD §4, D-011).
 *
 *   node payload/engine/validate.js [--json] [--root <dir>] [--concepts <ids>]
 *
 * Runs the full §4 structural check list over the KK-04 loader model — the
 * single health model; this module NEVER re-parses stores itself. The loader
 * already carries schema validation (KK-02), duplicate-id detection, and
 * typed-ref resolution on its one error/warning scale; this validator adds
 * the checks that need the whole model and the working tree:
 *
 *   id-shape          catalog entry id violates the owning store's id grammar
 *                     (K-NNN / dotted notation / D-NNN or provisional draft id)
 *                     — record-level ids are schema-pattern-checked upstream,
 *                     catalog ids are plain strings there by design
 *   id-range          concept id outside the class file's declared range: the
 *                     numeric filename prefix N declares [N, N+99] (§3.5 ids
 *                     are minted within class ranges, leaving gaps)
 *   missing-path      a declared pointer that does not name a real thing inside
 *                     this repo — a concept source-of-truth path, or a
 *                     knowledge leaf `paths` entry (UCS-1151). Three shapes,
 *                     one code, because from the store's side they are one
 *                     defect class: the pointer is absent, it ESCAPES the repo
 *                     root (`../elsewhere`, an absolute path, or a symlink
 *                     inside the repo whose target is outside it — containment
 *                     is judged on CANONICAL paths, never lexically), or it
 *                     names the repo ROOT itself — a pointer at everything
 *                     attributes nothing. A dangling symlink reports as absent
 *                     rather than escaping, which is what it is.
 *                     Deprecated concepts demote an ABSENT pointer to
 *                     warning (§3.5 — the source-deletion escape hatch) but
 *                     never an escaping or root one: that hatch is for a path
 *                     that used to exist, not for a claim the store was never
 *                     entitled to make. Leaves have no demotion at all
 *   index-drift       catalog/tree index inconsistency: a row naming a file
 *                     that was not loaded, or naming a file that does not
 *                     contain the row's id. The documented pending marker
 *                     (file: pending-import, mid-import rows) is a warning —
 *                     declared, not drifted
 *   orphan            a loaded record its store's catalog never declares —
 *                     unreachable through the navigational entry point (§3)
 *   missing-citation  a knowledge-leaf citation whose source is empty — an
 *                     unsourced claim is not promotable (§3.2); presence and
 *                     minItems are schema checks upstream
 *   ref-cycle         a decision supersedes chain that loops (§3.3 chains
 *                     must be acyclic; supersedes/superseded-by mirror pairs
 *                     are legitimate, so only supersedes edges are walked)
 *   unregistered-value  a governed facet value absent from its registry
 *                     (UCS-1148). Registry membership cannot be a schema enum:
 *                     the vocabulary is minted by literary warrant under
 *                     steward review, so it lives in a governed file that
 *                     grows without an engine release
 *   unminted-segment  a hierarchical domain path with an unminted segment —
 *                     the finding names the SEGMENT, which is the edit the
 *                     author can actually make
 *   suppressed-value  a value the registry lists as REJECTED. Suppression is
 *                     durable and visible: a refused term must not read as a
 *                     typo, and must not be quietly re-minted
 *   missing-registry  a record cites a governed facet whose registry the store
 *                     does not carry. Registry absence surfaces HERE, at the
 *                     point a value actually needs judging — a store that
 *                     governs nothing is complete, but a value checked against
 *                     a registry that never loaded is a check that never ran
 *   missing-graduation-table
 *                     a graduation/revocation entry in a store carrying no
 *                     category table (UCS-1155). Absence surfaces where it can
 *                     mean something — at the entry that needed the table
 *   undeclared-category
 *                     a graduation/revocation naming a category the table does
 *                     not declare. Autonomy is per CATEGORY, so one nobody
 *                     scoped has no written extent
 *   gated-category-graduation
 *                     a graduation for a PERMANENTLY GATED category — the
 *                     refusal the mechanism exists for. Revocation of a gated
 *                     category is fine: it only ever narrows autonomy
 *   registry-shape-mismatch
 *                     a registry's hierarchical flag disagrees with the shape
 *                     the facet it governs requires. Reported once, against the
 *                     registry file: a domains registry missing its
 *                     `hierarchical: true` would judge whole paths as opaque
 *                     strings, silently disabling the segment rule at exit 0
 *
 * Exit codes (PRD §5, lib/exit-codes.js): 0 clean, 1 findings (any
 * error-severity finding), 2 engine failure. Loader error-severity
 * diagnostics gate to exit 2 — structural checks over a store that failed to
 * load never ran, and a check that never ran is a blocking defect, never a
 * silent pass. Warnings alone (from findings or the loader) exit 0.
 *
 * --concepts <ids> (comma-separated) filters findings to the named concepts
 * for mid-session ACT checks; an unknown id is a hard error (exit 2) —
 * filtering on a typo must never read as a clean pass.
 *
 * JSON findings output is deterministic and stable-sorted by file/path/code/id
 * (shared comparator), no timestamps — baseline-diffable (D-012).
 */
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  LEAF_ACCESSION_FIELD, LEAF_PATHS_FIELD, healthSummary, loadStores,
  normalizeConceptIds, recordId, storeHealth,
} from '../lib/load-stores.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { UsageError, parseArgs as parseFlags, rethrowIfBug } from '../lib/cli.js';
import { compare } from '../lib/validate-record.js';
// Catalog id grammars come from the one module that owns them (UCS-1142), the
// same source the record-level schema patterns bind to — so a catalog row and
// the record it points at can never be judged by two different grammars.
import { ID_GRAMMARS, idPattern } from '../lib/id-grammars.js';
// The Time facet's field spellings and pinned thresholds (UCS-1150), read from
// the one module that owns them — the validator's presence check and every
// surface's staleness verdict must agree about which fields those are.
import { VERIFIED_FIELD, VOLATILITY_LIMITS, leafVolatility } from '../lib/time-verdicts.js';
import { isCalendarDate } from '../lib/iso-date.js';
// Phoenix events own the `edition` field: they are the only thing that bumps it
// (UCS-1154), so the check that every bump was sanctioned reads its rule from
// the same module that applies them.
import { EDITION_FIELD, FIRST_EDITION, unaccountedEditions } from '../lib/phoenix.js';

export const USAGE = 'usage: node payload/engine/validate.js [--json] [--root <dir>] [--concepts <ids>]';

/** Every check class this validator runs, sorted — reported on every run. */
export const CHECKS = Object.freeze([
  'disconnected-revocation', 'gated-category-graduation',
  'graduation-field-shape', 'graduation-not-trust-category',
  'id-range', 'id-shape', 'index-drift',
  'malformed-verified', 'missing-authority', 'missing-citation',
  'missing-graduation-table', 'missing-path', 'missing-registry',
  'missing-verified', 'orphan', 'ref-cycle', 'registry-shape-mismatch',
  'suppressed-value', 'unaccounted-edition', 'undeclared-category',
  'unminted-segment', 'unregistered-value',
]);

/** The §3 documented mid-import marker a catalog row carries instead of a file. */
const PENDING_MARKER = 'pending-import';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/**
 * Judge one declared pointer into the working tree — the single reader of
 * "does this path exist, and is it even ours to ask about".
 *
 * Both pointer families ride this: concept `source-of-truth` and leaf `paths`.
 * They had the same defect independently, which is the argument for one
 * function rather than two call sites that happen to agree today.
 *
 * CONTAINMENT is checked before existence, and that order is the whole point.
 * `join(repoRoot, p)` happily resolves `../sibling` to a directory OUTSIDE the
 * repo, and `/etc/passwd` to `<repoRoot>/etc/passwd`. A pointer that escapes
 * would then be judged against a file the store has no claim on: an escaping
 * path that happens to exist on the author's machine passes silently, and the
 * same store fails on a machine where it does not. A check whose verdict
 * depends on what sits OUTSIDE the repo is not a check — the store is the unit
 * that gets committed, reviewed and shipped, so a pointer that leaves it is
 * refused on its shape rather than tested against the filesystem.
 *
 * The repo ROOT itself is refused too, for a reason the resolver already
 * settled from the other side: `--paths .` is a usage error there ("name the
 * files or directories the change touched"), because a pointer at everything
 * attributes nothing. A leaf declaring `paths: ["."]` makes that same empty
 * claim, and it is worse than useless — it would match every path ever queried,
 * putting one leaf in front of every developer regardless of what they touched.
 * Refusing it is the same judgement, applied where the claim is authored.
 *
 * @param {string} repoRoot the repo root pointers resolve against
 * @param {string} p the pointer as the record spells it
 * @returns {'escapes'|'root'|'missing'|null} the defect, or null if it is fine
 */
/**
 * What each pointer defect says, per family — one message per defect, taking
 * the family's own noun so a concept and a leaf each read naturally.
 *
 * All three ride the `missing-path` code, because they are one defect class
 * from the store's side: a declared pointer that does not name a real thing
 * inside this repo. The MESSAGE is what distinguishes them, and it has to,
 * since the three send an author to three different edits — restore the file,
 * bring the path inside the repo, or name something narrower than everything.
 */
const POINTER_MESSAGES = Object.freeze({
  missing: (p, noun) => `${noun} "${p}" does not exist in the working tree — the truth anchor is the artifact (§3.1)`,
  escapes: (p, noun) => `${noun} "${p}" resolves outside the repo root — a store may only point at its own repo, and a pointer that escapes would be judged against a file this store has no claim on (passing or failing by what happens to sit outside it)`,
  root: (p, noun) => `${noun} "${p}" names the repo root — a pointer at everything attributes nothing, and it would match every path ever queried; name the files or directories this actually governs`,
});

function pointerDefect(repoRoot, p) {
  const root = resolve(repoRoot);
  const target = resolve(root, p);
  // The repo root itself is its own defect — a pointer at everything — so it is
  // separated from the escapes it otherwise shares a test with.
  if (relative(root, target) === '') return 'root';
  if (outside(root, target)) return 'escapes';
  // Existence before canonicalization, because the two questions are ordered:
  // a path that is not there has no canonical form to compare, and reporting
  // it as an escape would send an author looking for a link that does not
  // exist. A dangling symlink lands here too — statSync follows links, so a
  // link whose target is gone is `missing`, which is what it is.
  if (!statSync(target, { throwIfNoEntry: false })) return 'missing';
  // Then AGAIN on the canonical paths. The lexical test above is necessary but
  // not sufficient: `src/link.ts` is lexically inside the repo while resolving
  // to anywhere at all, so a symlink would carry the whole escape back in
  // through a path that looks contained. Both sides are canonicalized, because
  // the ROOT may itself be reached through a link (a /tmp that is really
  // /private/tmp, which is exactly what macOS hands a test) — comparing a
  // canonical target against a lexical root would then read every ordinary
  // path as an escape.
  const realRoot = realpathOrNull(root);
  const realTarget = realpathOrNull(target);
  // If either cannot be canonicalized the filesystem has declined to answer.
  // The lexical test already passed and the path exists, so the honest reading
  // is to accept it rather than invent a defect from a failed syscall.
  if (realRoot === null || realTarget === null) return null;
  return outside(realRoot, realTarget) ? 'escapes' : null;
}

/** Is `target` outside `root`, or root itself? Both must already be absolute. */
function outside(root, target) {
  const rel = relative(root, target);
  // `''` is the root itself; a leading `..` climbed out; an absolute result
  // means a different volume entirely.
  return rel === '' || rel.startsWith('..') || isAbsolute(rel);
}

/**
 * The canonical path, or null when the filesystem will not say.
 *
 * A pointer this engine cannot canonicalize (a permissions wall on a parent, a
 * race with a concurrent delete) must not crash a validation run that can still
 * answer for every other pointer — the same conduct the resolver's folder test
 * already applies to an unreadable pointer.
 */
function realpathOrNull(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

// -------------------------------------------------------------- the checks

/**
 * The id grammar each store's CATALOG rows are judged by.
 *
 * Usually the store's own space — a catalog row names an id that store mints.
 * Knowledge stays a distinct entry after UCS-1147 narrowed citations, because a
 * knowledge row is still a POINTER rather than a mint: it is the store's own
 * citation of its leaves, so it is judged by the citation grammar, and its
 * finding carries the citation grammar's hint — the one that names the
 * accession migration. The two grammars accept the same strings today; the
 * table is what keeps the distinction available when they diverge.
 */
const CATALOG_ID_SPACE = Object.freeze({
  decisions: 'decisions',
  knowledge: 'leaf-ref',
  ontology: 'ontology',
});

/** Catalog rows: id grammar (id-shape) + row↔file agreement (index-drift). */
function checkCatalogs(model, push) {
  // What each loaded file actually contains — the fact the index must match.
  // One id per record now that a leaf answers to one spelling (UCS-1147); the
  // alternate-spelling pass the expand phase needed here left with the alias
  // index, so a row naming a leaf by its retired notation reads as the
  // id-shape finding it is rather than resolving to the file.
  const idsByFile = new Map();
  const addTo = (file, id) => {
    if (typeof file !== 'string' || typeof id !== 'string') return;
    if (!idsByFile.has(file)) idsByFile.set(file, new Set());
    idsByFile.get(file).add(id);
  };
  for (const records of [model.concepts, model.decisions, model.leaves]) {
    for (const entry of records.values()) addTo(entry.file, recordId(entry));
  }

  for (const store of ['decisions', 'knowledge', 'ontology']) {
    const catalog = model.stores[store].catalog;
    if (!isObject(catalog) || !Array.isArray(catalog.entries)) continue; // absent/invalid: loader diagnosed
    // A catalog row is a POINTER at a leaf, not a leaf, so it is judged by the
    // citation grammar rather than the minting one: a row names its leaf the
    // way a cross-reference does, which since UCS-1147 means by accession.
    // Agreement with the pointed-at file is checked below, and that check is
    // what actually ties the row to a leaf — the grammar only decides whether
    // the row names something of a shape a leaf could have.
    const space = CATALOG_ID_SPACE[store];
    const grammar = ID_GRAMMARS[space];
    const pattern = idPattern(space);
    catalog.entries.forEach((row, i) => {
      if (!isObject(row) || typeof row.id !== 'string' || typeof row.file !== 'string') return;
      if (!pattern.test(row.id)) {
        push({
          severity: 'error', code: 'id-shape', id: row.id,
          file: `${store}/_catalog.yaml`, path: `entries[${i}].id`,
          message: `id "${row.id}" violates the ${store} id grammar (${grammar.hint}, §3.5)`,
        });
        return; // a malformed id cannot be meaningfully matched against files
      }
      if (row.file === PENDING_MARKER) {
        push({
          severity: 'warning', code: 'index-drift', id: row.id,
          file: `${store}/_catalog.yaml`, path: `entries[${i}].file`,
          message: `"${row.id}" is declared pending import — resolve the marker to a real file once the record lands`,
        });
        return;
      }
      const target = `${store}/${row.file}`;
      if (!model.stores[store].files.includes(target)) {
        push({
          severity: 'error', code: 'index-drift', id: row.id,
          file: `${store}/_catalog.yaml`, path: `entries[${i}].file`,
          message: `catalog names ${target}, which does not exist in the store`,
        });
      } else if (!idsByFile.get(target)?.has(row.id)) {
        push({
          severity: 'error', code: 'index-drift', id: row.id,
          file: `${store}/_catalog.yaml`, path: `entries[${i}].file`,
          message: `catalog id "${row.id}" not found in ${target} — the map must point at the fact it names`,
        });
      }
    });
  }
}

/** Concepts: class-range membership (id-range) + SSOT existence (missing-path). */
function checkConcepts(model, push, repoRoot) {
  for (const { id, file, record } of model.concepts.values()) {
    // id-range: the class file's numeric prefix N declares [N, N+99] (§3.5).
    const prefix = /^(\d+)-/.exec(file.split('/').pop());
    const n = Number(id.slice(2));
    if (prefix && Number.isInteger(n)) {
      const lower = Number(prefix[1]);
      if (n < lower || n > lower + 99) {
        push({
          severity: 'error', code: 'id-range', id, file, path: 'id',
          message: `id "${id}" is outside the class range ${lower}..${lower + 99} declared by ${file} (§3.5: ids are minted within class ranges)`,
        });
      }
    }
    // missing-path: §3.5 deprecated demotes pointer checks to warnings — the
    // escape hatch that lets a source-deletion PR land without dead-ending.
    const severity = record.status === 'deprecated' ? 'warning' : 'error';
    strings(record['source-of-truth']).forEach((p, i) => {
      const defect = pointerDefect(repoRoot, p);
      if (!defect) return;
      push({
        // A pointer that ESCAPES the repo, or names the root, stays
        // error-severity even for a deprecated concept. The §3.5 demotion is
        // an escape hatch for a path that USED to exist and was deleted — it
        // says nothing about a pointer that was never the store's to make, and
        // demoting a malformed claim would let it ship under a warning.
        severity: defect === 'missing' ? severity : 'error',
        code: 'missing-path', id, file, path: `source-of-truth[${i}]`,
        message: POINTER_MESSAGES[defect](p, 'source-of-truth path'),
      });
    });
  }
}

/**
 * Leaf `paths` must exist in the working tree (UCS-1151) — the same check
 * concept source-of-truth pointers already ride, deliberately reusing the same
 * CODE.
 *
 * Three of frontmatter v2's typed edge families are declared in the ref-field
 * table and get `unresolved-ref` for free. `paths` cannot join them, and the
 * reason is worth stating plainly rather than papering over: the ref graph
 * resolves IDS. Its whole question is whether a string is minted in some store's
 * id space, and a repo path is not an id — it names the working tree, which is a
 * different truth anchor (§3.1: the artifact) checked by a different means (the
 * filesystem). Declaring `paths` as a ref row would have asked the loader
 * whether `src/api/handler.ts` resolves to a knowledge entry, which it never
 * could, and every leaf carrying a path would have failed for the wrong reason.
 *
 * So the family gets the HONEST mechanism for what it points at, and it is not a
 * new one: `missing-path` already means exactly this — a declared pointer into
 * the working tree that is not there. Reusing the code keeps one finding class
 * for one defect class, so a steward who has fixed a concept's dead pointer
 * needs nothing new to fix a leaf's.
 *
 * Unlike concepts there is no deprecation demotion. That escape hatch exists so
 * a source-deletion PR can land while a DEPRECATED concept still points at what
 * it deleted (§3.5); a leaf has no `status`, and its `facets.stage` is a
 * promotion lifecycle rather than a retirement one — there is no stage that
 * means "this leaf's pointers are allowed to dangle". Inventing one here would
 * be a governance decision this ticket has no warrant to make.
 */
function checkLeafPaths(model, push, repoRoot) {
  for (const entry of model.leaves.values()) {
    const { file, record } = entry;
    strings(record[LEAF_PATHS_FIELD]).forEach((p, i) => {
      const defect = pointerDefect(repoRoot, p);
      if (!defect) return;
      push({
        severity: 'error', code: 'missing-path', id: recordId(entry), file,
        path: `${LEAF_PATHS_FIELD}[${i}]`,
        message: POINTER_MESSAGES[defect](p, 'path'),
      });
    });
  }
}

/** Records the store catalog never declares are unreachable — orphans. */
function checkOrphans(model, push) {
  const declared = { ontology: new Set(), knowledge: new Set(), decisions: new Set() };
  for (const store of Object.keys(declared)) {
    const catalog = model.stores[store].catalog;
    if (!isObject(catalog) || !Array.isArray(catalog.entries)) continue;
    for (const row of catalog.entries) {
      if (isObject(row) && typeof row.id === 'string') declared[store].add(row.id);
    }
  }
  // The third element derives the FINDING path — which field of the record the
  // reported id was read from — not how this check GETS at the id: identity
  // comes through recordId(), so a leaf id space change never reaches this
  // loop (UCS-1142). A leaf's identity is its accession, so that is the field
  // an orphan finding points the author at (UCS-1147).
  const spaces = [
    ['ontology', model.concepts, () => 'id'],
    ['knowledge', model.leaves, () => LEAF_ACCESSION_FIELD],
    ['decisions', model.decisions, () => 'id'],
  ];
  for (const [store, records, idPath] of spaces) {
    if (!model.stores[store].catalog) continue; // no catalog loaded: loader diagnosed
    for (const [id, entry] of records) {
      if (!declared[store].has(id)) {
        push({
          severity: 'error', code: 'orphan', id, file: entry.file, path: idPath(entry),
          message: `"${id}" is not declared in ${store}/_catalog.yaml — unreachable through the store's navigational entry point (§3)`,
        });
      }
    }
  }
}

// ------------------------------------------- registry membership (UCS-1148)

/**
 * Which governed vocabulary each facet field draws from (UCS-1148).
 *
 * A DECLARATION, in the same spirit as the loader's REF_FIELDS: "this field's
 * values must be minted in that registry" is a fact about the store shape, and
 * facts about the store shape belong in a table every surface reads. Adding a
 * governed facet is adding a row — there is no per-facet branch in the checker
 * to extend, which is what lets frontmatter v2 (UCS-1149) declare the rest of
 * its facets here rather than growing a second membership code path.
 *
 * Each row:
 *   field     a path of object keys into the record, dotted. The path may end
 *             at a single string or at an ARRAY of strings; `each` says which
 *   each      true when the field holds an array, so every member is checked
 *             and the finding path carries the index the author can point at
 *   registry  "<store>/<name>" — the registry key, matching the loader's index
 *   within    an optional path prefix, so a field nested inside a repeated
 *             sub-record (a citation) is declared once rather than per index
 *   hierarchical
 *             the registry SHAPE this facet requires. Declared, and checked
 *             against the registry's own flag: see registryShapeMismatch
 *   blankOwnedBy
 *             the check that owns this field's ABSENCE, when one exists. A
 *             blank value is then that check's to report and membership defers,
 *             so one omission earns one finding. Absent means membership judges
 *             blanks itself — the safe default, since a field whose emptiness
 *             nobody checks would otherwise pass governed-but-unchecked
 *
 * Frozen all the way down: a mutated row would silently redirect a facet at a
 * different vocabulary, which is a governed store quietly ungoverned.
 *
 * @type {Readonly<Record<string, ReadonlyArray<Readonly<object>>>>}
 */
export const FACET_REGISTRIES = Object.freeze({
  'knowledge-leaf': Object.freeze([
    Object.freeze({ field: 'facets.domain', registry: 'knowledge/domains', hierarchical: true }),
    // Frontmatter v2's remaining classification facets (UCS-1149). Each is a
    // ROW, which is the whole point of the table: three more governed fields
    // cost three declarations and no second membership code path.
    Object.freeze({ field: 'facets.form', registry: 'knowledge/form', hierarchical: false }),
    Object.freeze({ field: 'facets.anchor', registry: 'knowledge/anchor', hierarchical: false }),
    Object.freeze({ field: 'facets.stage', registry: 'knowledge/stage', hierarchical: false }),
    Object.freeze({ field: 'operations', each: true, registry: 'knowledge/operations', hierarchical: false }),
    Object.freeze({ field: 'applies.jurisdictions', each: true, registry: 'knowledge/jurisdictions', hierarchical: false }),
    // `blankOwnedBy` names the check that OWNS this field's absence. Only
    // `authority` has one (`missing-authority`), so only `authority` may leave
    // a blank value to it; every other governed field judges a blank itself as
    // an unregistered value, because otherwise `stage: ""` would pass silently.
    Object.freeze({
      within: 'citations', field: 'authority', registry: 'knowledge/authority-tiers',
      hierarchical: false, blankOwnedBy: 'missing-authority',
    }),
  ]),
});

/**
 * Which model collection each governed record kind is indexed in.
 *
 * The one place the checker learns that `knowledge-leaf` records live in
 * `model.leaves`. Without it the kind and the collection were spelled at two
 * call sites apiece, so a second governed kind — which UCS-1149 brings — would
 * have meant editing the walker rather than the tables it reads.
 *
 * Keyed by the same kind strings FACET_REGISTRIES uses, so the two tables are
 * read together and a kind declared in one but missing from the other is
 * refused at load rather than silently unchecked (assertGovernedKinds).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const GOVERNED_COLLECTIONS = Object.freeze({
  'knowledge-leaf': 'leaves',
});

/**
 * Refuse a facet table naming a kind whose records the checker cannot reach —
 * an engine failure at load, never a silent pass.
 *
 * A row declared for a kind with no collection would govern nothing: the
 * facet would look governed in the table and be unchecked in every store,
 * which is the failure class this engine exists to prevent (PRD §5).
 *
 * @param {Record<string, unknown>} table the facet declaration table
 * @throws {Error} if a declared kind has no model collection
 */
export function assertGovernedKinds(table) {
  for (const kind of Object.keys(table)) {
    if (!GOVERNED_COLLECTIONS[kind]) {
      throw new Error(
        `facet table declares governed kind "${kind}", which maps to no model collection — `
        + 'its rows would look governed and be checked in no store; add it to GOVERNED_COLLECTIONS',
      );
    }
  }
}

/**
 * Refuse a facet table whose rows disagree about one registry's SHAPE — an
 * engine failure at load, never a silent pass.
 *
 * The shape check runs once per registry, because a mismatch is a fact about
 * the registry rather than about any record that drew from it. That
 * de-duplication is only sound while every row naming a registry agrees about
 * its shape: if two rows disagreed, the first one seen would settle the
 * question and the second would be checked against a shape it never asked for
 * — a facet silently governed by the wrong rule, which is the exact failure
 * `registry-shape-mismatch` exists to catch one level down.
 *
 * The contradiction cannot be resolved here either. One registry is either
 * hierarchical or flat; two facets needing it both ways need two registries,
 * and picking a winner by declaration order would be an arbitrary answer to a
 * question the table asked wrongly.
 *
 * @param {Record<string, ReadonlyArray<{ registry: string, hierarchical?: boolean }>>} table
 * @throws {Error} if two rows name one registry with different shapes
 */
export function assertConsistentRegistryShapes(table) {
  const expected = new Map(); // registry key -> { hierarchical, kind, field }
  for (const [kind, rows] of Object.entries(table)) {
    for (const row of rows) {
      const previous = expected.get(row.registry);
      if (previous === undefined) {
        expected.set(row.registry, { hierarchical: row.hierarchical, kind, field: row.field });
      } else if (previous.hierarchical !== row.hierarchical) {
        throw new Error(
          `facet table declares registry "${row.registry}" as both hierarchical=${previous.hierarchical} `
          + `(${previous.kind}.${previous.field}) and hierarchical=${row.hierarchical} (${kind}.${row.field}) — `
          + 'one registry has one shape, so one of these facets would be governed by a rule it never asked for; '
          + 'a facet needing the other shape needs its own registry',
        );
      }
    }
  }
}

// Both checked as this module loads: a facet governed by nothing, or governed
// against a shape another row settled, is a defect in the kit itself. Each must
// surface the moment it is introduced rather than as a store that quietly
// passes checks it never ran.
assertGovernedKinds(FACET_REGISTRIES);
assertConsistentRegistryShapes(FACET_REGISTRIES);

/** Follow a dotted path into a record; undefined if any segment is missing. */
function valueAtPath(record, field) {
  let node = record;
  for (const segment of field.split('.')) {
    if (!isObject(node)) return undefined;
    node = node[segment];
  }
  return node;
}

/**
 * The registry SHAPE a facet requires, checked against the shape the registry
 * declares — a silent disagreement here disables the rule it governs.
 *
 * `facets.domain` is hierarchical: its whole membership rule is that every
 * segment of a path is minted. That rule lives behind `registry.hierarchical`,
 * so a domains registry that lost its `hierarchical: true` line would judge a
 * two-segment path as one opaque string and pass it the moment that exact
 * string appeared in the file — the segment rule switched off by an omission,
 * at exit 0, with nothing said. The converse is as bad: a flat registry
 * declaring itself hierarchical would split values on '/' and demand parents
 * nobody meant to mint.
 *
 * Neither direction is a defect the value-level checks can see, because both
 * produce a coherent-looking verdict about the wrong question. So the shape is
 * declared on both sides and the disagreement is the finding: reported ONCE per
 * registry, against the registry file, because the registry is what must change
 * — reporting it per value would bury one edit under a finding for every leaf.
 *
 * @param {object} registry the loaded registry
 * @param {boolean|undefined} expected the shape the declaration requires
 * @returns {{ code: string, message: string }|null}
 */
function registryShapeMismatch(registry, expected, registryKey) {
  if (expected === undefined || registry.hierarchical === expected) return null;
  return {
    code: 'registry-shape-mismatch',
    message: expected
      ? `the "${registryKey}" registry must be hierarchical — the facet it governs is a '/'-joined path whose every segment must be minted, and a flat registry would judge the whole path as one opaque string, silently disabling that rule. Add "hierarchical: true" to ${registry.file}`
      : `the "${registryKey}" registry declares itself hierarchical, but the facet it governs is a flat value — path splitting would demand parent values nobody minted. Remove "hierarchical: true" from ${registry.file}`,
  };
}

/**
 * Judge one facet value against its registry — the whole membership rule.
 *
 * Returns the finding this value earns, or null when it is legitimately
 * minted. Four outcomes, and each one names both the value and the registry,
 * because a finding that says only "unknown value" leaves the author guessing
 * which of four vocabularies to go read:
 *
 *   - the registry did not load at all → `missing-registry`. This is where
 *     registry ABSENCE surfaces, and it surfaces HERE rather than at load
 *     because absence is only meaningful once a record actually claims a
 *     governed value. A store that governs nothing is complete; a store whose
 *     leaf cites a domain with no domains registry is a check that never ran.
 *   - the value is minted → clean.
 *   - the value is SUPPRESSED → `suppressed-value`, quoting the refusal. A
 *     term that was considered and rejected must not read as a typo: the
 *     author needs to know the vocabulary decision already went against them.
 *   - a hierarchical path with an unminted segment → `unminted-segment`,
 *     naming the SEGMENT rather than the whole path. "trading/derivatives/swaps
 *     is not in the registry" sends an author looking for the wrong edit; the
 *     finding they can act on is which parent is missing.
 *   - otherwise → `unregistered-value`.
 *
 * @param {object} registry the loaded registry, or undefined if absent
 * @param {string} registryKey the "<store>/<name>" the row declared
 * @param {string} value the facet value as the record spells it
 * @returns {{ code: string, message: string }|null}
 */
function judgeValue(registry, registryKey, value) {
  if (!registry) {
    return {
      code: 'missing-registry',
      message: `value "${value}" is governed by the "${registryKey}" registry, which the store does not carry — the vocabulary this value must be minted in never loaded, so its membership was never checked (a check that never ran is a blocking defect, PRD §5)`,
    };
  }
  const where = `the "${registryKey}" registry (${registry.file})`;
  if (registry.suppressed.has(value)) {
    return {
      code: 'suppressed-value',
      message: `value "${value}" is SUPPRESSED in ${where} — this term was proposed and refused, and a suppression is durable: re-minting it is a registry edit with its own Decisions entry, never a quiet reuse`,
    };
  }
  if (registry.hierarchical) {
    // Every segment above a child must itself be minted: a hierarchy where a
    // child may hang off an unminted parent is not a hierarchy, it is a set of
    // strings that happen to contain slashes.
    const segments = value.split('/');
    for (let i = 0; i < segments.length; i += 1) {
      const path = segments.slice(0, i + 1).join('/');
      if (registry.suppressed.has(path)) {
        return {
          code: 'suppressed-value',
          message: `value "${value}" descends from "${path}", which is SUPPRESSED in ${where} — a refused class mints no children`,
        };
      }
      if (!registry.minted.has(path)) {
        return {
          code: 'unminted-segment',
          message: `value "${value}" is invalid: the segment "${path}" is not minted in ${where} — every segment of a hierarchical path must be minted before a child may hang off it, and each minting is a registry edit plus a Decisions entry (literary warrant: material must exist to fill it)`,
        };
      }
    }
    return null;
  }
  if (registry.minted.has(value)) return null;
  return {
    code: 'unregistered-value',
    message: `value "${value}" is not minted in ${where} — governed facets draw only from their registry; minting a new value is a registry edit plus a Decisions entry, never an ad-hoc string`,
  };
}

/**
 * Every governed facet value is minted in its registry (UCS-1148).
 *
 * Generic over FACET_REGISTRIES and GOVERNED_COLLECTIONS: this function knows
 * how to walk a declared path and how to judge a value, and nothing about which
 * kinds or facets exist. That is the seam UCS-1149 extends by declaration —
 * a second governed record kind is two table entries, not an edit here.
 */
function checkRegistryMembership(model, push) {
  // Shape first, once per registry rather than once per record: a registry
  // whose shape disagrees with the facet it governs is judging the wrong
  // question, so the disagreement is reported against the registry file rather
  // than against every record that drew from it. De-duplicated across kinds,
  // since two kinds may legitimately draw on one registry — sound because
  // assertConsistentRegistryShapes refused at load any table whose rows
  // disagree about a registry's shape, so whichever row is seen first here
  // speaks for all of them.
  const shapeChecked = new Set();
  for (const rows of Object.values(FACET_REGISTRIES)) {
    for (const { registry: registryKey, hierarchical } of rows) {
      if (shapeChecked.has(registryKey)) continue;
      shapeChecked.add(registryKey);
      const registry = model.registries.get(registryKey);
      if (!registry) continue; // absence is the per-value missing-registry finding
      const mismatch = registryShapeMismatch(registry, hierarchical, registryKey);
      if (mismatch) {
        push({
          severity: 'error', code: mismatch.code, id: registryKey,
          file: registry.file, path: 'hierarchical', message: mismatch.message,
        });
      }
    }
  }
  for (const [kind, rows] of Object.entries(FACET_REGISTRIES)) {
    // Non-null by construction: assertGovernedKinds refused the table at load
    // if any declared kind lacked a collection.
    for (const entry of model[GOVERNED_COLLECTIONS[kind]].values()) {
      checkOneRecord(model, push, entry, rows);
    }
  }
}

/** Judge one record's governed facets against the rows its kind declares. */
function checkOneRecord(model, push, entry, rows) {
  const { file, record } = entry;
  const id = recordId(entry);
  for (const { within, field, each, registry: registryKey, blankOwnedBy } of rows) {
    const registry = model.registries.get(registryKey);
    // A row may sit inside a repeated sub-record (citations[]); declaring the
    // container once keeps the table free of per-index rows.
    const container = within ? valueAtPath(record, within) : null;
    const hosts = within
      ? (Array.isArray(container)
        ? container.map((host, i) => [host, `${within}[${i}]`])
        : [])
      : [[record, '']];
    for (const [host, hostPath] of hosts) {
      if (!isObject(host)) continue;
      const raw = valueAtPath(host, field);
      // Non-strings are already diagnosed by KK-02's schema check; a second
      // complaint here would double-report one defect.
      const values = each
        ? (Array.isArray(raw) ? raw.map((v, i) => [v, `${field}[${i}]`]) : [])
        : [[raw, field]];
      for (const [value, valuePath] of values) {
        if (typeof value !== 'string') continue;
        // A BLANK value is deferred ONLY when another check owns this field's
        // absence — declared as `blankOwnedBy`, which today is just
        // `citations[].authority` and its `missing-authority` check. There,
        // reporting `unregistered-value ""` too would put a second finding on a
        // path that already carries the one an author can act on.
        //
        // Everywhere else a blank is judged HERE, and that asymmetry is the
        // point: no check owns `facets.stage: ""`, so skipping it would make an
        // empty governed facet pass silently at exit 0 — a governed field
        // ungoverned by an empty string, which is worse than double-reporting.
        // The registry does not mint "", so it falls out as unregistered.
        if (value.trim() === '' && blankOwnedBy) continue;
        const verdict = judgeValue(registry, registryKey, value);
        if (!verdict) continue;
        push({
          severity: 'error', code: verdict.code, id, file,
          path: hostPath ? `${hostPath}.${valuePath}` : valuePath,
          message: verdict.message,
        });
      }
    }
  }
}

/**
 * Leaf citations must carry a non-empty source (§3.2) and an authority tier
 * (UCS-1149).
 *
 * The two failures are separate codes because they are separate defects. An
 * empty `source` is an unsourced claim. A missing `authority` is a sourced
 * claim that records nothing about HOW FAR the source can be trusted — a
 * regulator's text and a hallway conversation read identically once the tier
 * is gone, and a reader comparing two leaves that disagree has nothing to go
 * on but the source strings themselves.
 *
 * Note what this check does and does not claim. It governs the tier as
 * VOCABULARY: present, and minted in the registry. Nothing in this engine
 * compares two tiers or resolves a conflict between citations today —
 * automatic conflict ranking arrives with the resolution pipeline (UCS-1152).
 * Requiring the tier now is what makes that possible later: a tier nobody
 * recorded cannot be ranked retroactively.
 *
 * Absence is checked here; a tier naming a value the registry does not carry is
 * the ordinary `unregistered-value` finding the facet table already declares
 * (`{ within: 'citations', field: 'authority' }`). Two codes, because "you left
 * it out" and "that tier does not exist" send an author to two different edits
 * — and neither is checked by the other: the membership walk skips a value that
 * is not a string, which is exactly what an absent field is.
 *
 * The tier requirement is gated on the store CARRYING an authority-tiers
 * registry, which is UCS-1148's opt-in conduct applied one level up rather than
 * a softening of it. A store with no such registry has no vocabulary to draw a
 * tier from, so demanding one would be demanding a value that could only be
 * unregistered — every leaf failing twice for one thing the store never opted
 * into. Once the registry exists the project HAS said tiers govern its
 * citations, and an untiered citation is then a real omission. The escalation
 * is the steward's, made by adding the file, and it is exactly the escalation
 * `missing-registry` refuses to let happen silently in the other direction.
 */
function checkCitations(model, push) {
  const tiersGoverned = model.registries.has('knowledge/authority-tiers');
  for (const leaf of model.leaves.values()) {
    const { file, record } = leaf;
    if (!Array.isArray(record.citations)) continue; // presence is a schema check
    record.citations.forEach((c, i) => {
      if (!isObject(c)) return;
      if (typeof c.source === 'string' && c.source.trim() === '') {
        push({
          severity: 'error', code: 'missing-citation', id: recordId(leaf), file,
          path: `citations[${i}].source`,
          message: 'citation source is empty — an unsourced claim is not promotable (§3.2)',
        });
      }
      // A non-string authority is a schema defect KK-02 already reported;
      // complaining again here would double-report one mistake.
      if (tiersGoverned
        && (c.authority === undefined || (typeof c.authority === 'string' && c.authority.trim() === ''))) {
        push({
          severity: 'error', code: 'missing-authority', id: recordId(leaf), file,
          path: `citations[${i}].authority`,
          message: 'citation carries no authority tier — nothing records how far this source can be trusted, so a regulator\'s text and a hallway conversation read identically; name a tier minted in the "knowledge/authority-tiers" registry (UCS-1149)',
        });
      }
    });
  }
}

/**
 * The Time facet's presence check (UCS-1150) — a leaf under time governance
 * must carry a usable `verified` date.
 *
 * This is the validator's whole share of the time facet, and it is deliberately
 * DATE-FREE: it asks whether the leaf can be judged, never whether it is stale.
 * Staleness needs an injected `today` and belongs to the surfaces that project
 * verdicts; asking it here would put a wall-clock-dependent finding into the
 * baseline finding set, and diffing that set against a baseline is exactly what
 * D-012 protects. So this check's output is identical on every run forever,
 * whatever day it is.
 *
 * Two findings, because two different things are wrong:
 *
 *   missing-verified    a leaf declaring a NON-STATIC volatility with no
 *                       `verified` date. It has asked to be governed by time
 *                       and given nothing to measure from, so its verdict can
 *                       only ever be `undated` — a leaf that can never be
 *                       trusted and never be stale, sitting in the store
 *                       looking governed.
 *   malformed-verified  a date that matches the schema's pattern but names no
 *                       real day. `2026-02-30` is shaped like a date and rolls
 *                       forward to March 2nd under `Date.parse`, so an age
 *                       measured from it is off by two days with nothing said —
 *                       the defect `isCalendarDate` was written for (UCS-957).
 *                       The schema checks the shape; the calendar is checked
 *                       here, where the finding can name the file and field.
 *
 * A STATIC leaf with no date is CLEAN, and that asymmetry is the point. Static
 * knowledge never stales, so a date on it would measure an age nothing consumes
 * — demanding one would be demanding a field with no reader, which is how a
 * store fills up with ritual metadata nobody maintains. A static leaf that DOES
 * carry a date still has it checked for the calendar: an author who wrote one
 * meant it, and a malformed one is a mistake whether or not anything measures
 * from it.
 *
 * A leaf declaring NO volatility is clean too — absent means exempt from time
 * governance (see the schema), so there is nothing to be missing. That is what
 * keeps a store mid-migration from failing validation on every un-migrated leaf
 * the day this ticket lands.
 */
function checkVerifiedDates(model, push) {
  for (const leaf of model.leaves.values()) {
    const { file, record } = leaf;
    // Read through the module's own reader rather than testing membership here.
    // A second spelling of "is this a known class" is a second chance to get it
    // wrong — `volatility in VOLATILITY_LIMITS` would answer TRUE for inherited
    // names like `toString`, and this check would then demand a date from a
    // class that has no threshold. One reader, one answer.
    //
    // Null covers both a non-string volatility and an unknown class. Either is
    // a schema defect already reported, and judging the date on top of it would
    // be a second finding for one mistake.
    const volatility = leafVolatility(record);
    if (volatility === null) continue;
    const verified = record[VERIFIED_FIELD];

    if (verified === undefined) {
      // Static never stales, so it needs no date to measure from.
      if (volatility === 'static') continue;
      push({
        severity: 'error', code: 'missing-verified', id: recordId(leaf), file,
        path: VERIFIED_FIELD,
        message: `${volatility} knowledge carries no "${VERIFIED_FIELD}" date — it stales after ${VOLATILITY_LIMITS[volatility]} days and nothing records when it was last checked, so its freshness can never be computed (UCS-1150)`,
      });
      continue;
    }
    // A non-string date is a schema defect (KK-02) — do not double-report.
    if (typeof verified !== 'string') continue;
    if (!isCalendarDate(verified)) {
      push({
        severity: 'error', code: 'malformed-verified', id: recordId(leaf), file,
        path: VERIFIED_FIELD,
        message: `"${VERIFIED_FIELD}: ${verified}" is not a real calendar date — an age measured from a day that does not exist is a number no calendar agrees with (YYYY-MM-DD, UCS-957)`,
      });
    }
  }
}

/** Decision supersedes chains must be acyclic (§3.3). One finding per cycle. */
/**
 * Every edition bump must be sanctioned by a phoenix event (UCS-1154).
 *
 * `edition` is not an ordinary field an author may increment. A phoenix event
 * is THE ONLY thing that bumps it in v2, so a leaf at edition > 1 is making a
 * claim — "a governed bulk re-taxonomy moved me" — and this check holds it to
 * that claim. Without it the field would be a number anyone could type, and
 * "the edition tells you a phoenix event happened" would be a convention rather
 * than a fact.
 *
 * Checkable from the WORKING TREE ALONE, which is why the event mappings are
 * retained in `knowledge/_phoenix/` rather than living only in the PR that
 * applied them. The validator sees a fresh clone with no git history, and a
 * governance rule it could only verify by reading commits is a rule it cannot
 * verify at all.
 *
 * A carried-forward row does not count: it records that a leaf was considered
 * and deliberately left alone, so it cannot also be the warrant for an edition
 * that says the leaf changed.
 */
function checkEditions(model, push) {
  for (const { id, file, edition, events, expected } of unaccountedEditions(model)) {
    const sanctioned = events.length
      ? `${events.length} retained phoenix event(s) move it (${events.join(', ')}), so it should be at ${expected}`
      : `no retained phoenix event moves it, so it should be at ${FIRST_EDITION}`;
    push({
      severity: 'error', code: 'unaccounted-edition', id, file, path: EDITION_FIELD,
      message: `leaf "${id}" is at ${EDITION_FIELD} ${edition}, but ${sanctioned} — an edition COUNTS the governed re-taxonomies that moved a leaf, and a phoenix event is the only thing that bumps it, so a number that matches no mapping is one nobody sanctioned (UCS-1154)`,
    });
  }
}

/**
 * Every graduation or revocation entry is held against the category table
 * (UCS-1155).
 *
 * This is the machine-checkable half of trust graduation, and it is worth being
 * precise about which half that is. The engine does NOT compute approved-
 * unmodified counts, does not decide whether a threshold was met, and does not
 * grant or withdraw autonomy: v1's analytics are MANUAL, and the moderator
 * judges the recorded counts themselves (steward-guide.md). What is checked is
 * that the recorded artifacts are well-formed and consistent with the governed
 * table — which is exactly the part a human reviewer cannot reliably do by eye
 * across a growing decisions store.
 *
 * Three findings, because three different things are wrong:
 *
 *   missing-graduation-table
 *              an entry moves the trust boundary in a store carrying no
 *              category table at all. Absence surfaces HERE, at the point a
 *              record actually needs the table, for the same reason
 *              `missing-registry` does: a store that governs nothing is
 *              complete, but a graduation judged against a table that never
 *              loaded is a check that never ran (PRD §5).
 *   undeclared-category
 *              the entry names a category the table does not declare. Autonomy
 *              is per category, so a graduation for a category nobody scoped is
 *              autonomy with no declared extent — nothing says what class of
 *              change it covers, and nothing could later revoke it by name.
 *   gated-category-graduation
 *              a graduation for a PERMANENTLY GATED category. This is the one
 *              the whole mechanism exists to refuse: the gated list is where
 *              judgment lives (new domain classes, contradicts/supersedes
 *              edges, authority assignments, anything citation-bearing), and a
 *              judgment call does not become mechanical by having been made
 *              correctly N times. Revoking a gated category is NOT a finding —
 *              a revocation only ever narrows autonomy, and refusing to record
 *              one would be refusing the safe direction.
 *   graduation-not-trust-category
 *              an entry carrying a graduation block but filed under some other
 *              decision category. `trust` is the category that says the third
 *              store governs the trust boundary (PRD §3); an entry filed
 *              elsewhere moves that boundary invisibly to anyone auditing it
 *              by category, which is how a steward reads the store
 *   disconnected-revocation
 *              a revocation whose link to the graduation it withdraws is
 *              missing or wrong: it names no `revokes` WHILE a graduation for
 *              the same category stands, or its `revokes` names an entry that
 *              is not a graduation, or one that graduates a DIFFERENT category.
 *              Omission is clean when no graduation exists — the
 *              standing-position case has nothing to point at — and an
 *              unresolved id is the ref graph's to report
 *   graduation-field-shape
 *              the block's fields disagree with its own action: a graduation
 *              with no `observed-cycles` (the only record of what was counted,
 *              since v1 computes nothing) or carrying withdrawal fields, or a
 *              revocation naming no `defect` (the automatic trigger)
 */
/**
 * Which `graduation:` fields each action requires and which it refuses.
 *
 * The schema states these in prose because it cannot state them in keywords —
 * there is no conditional in the subset this engine interprets. Enforcing them
 * here is what keeps that prose from being decoration.
 *
 * Each rule earns its place:
 *
 *   graduate REQUIRES `observed-cycles` — the recorded count is the entire
 *     reviewable basis of the judgment. v1 computes nothing, so a graduation
 *     with no written count is exactly the unreviewable decision the manual-
 *     analytics stance depends on NOT existing: a reader cannot ask whether the
 *     bar was met, because nobody wrote down what was counted.
 *   graduate REFUSES `revokes` and `defect` — both describe a withdrawal. On a
 *     grant they are either copy-paste from the revocation template or a
 *     confusion about which direction the entry moves, and each would leave a
 *     grant carrying the vocabulary of its own reversal.
 *   revoke REQUIRES `defect` — revocation is automatic ON A DEFECT, so the
 *     defect is the trigger. A revocation that names none records that trust
 *     was withdrawn for no stated reason, and the next graduation of that
 *     category has nothing to have fixed.
 *
 * `observed-cycles` is deliberately NOT refused on a revoke: it is meaningless
 * there rather than contradictory, and refusing a harmless field would cost an
 * author an edit for nothing.
 *
 * @param {object} graduation the typed block
 * @param {'graduate'|'revoke'} action the block's own action
 * @returns {Array<{field: string, message: string}>}
 */
function graduationShapeDefects(graduation, action) {
  const defects = [];
  if (action === 'graduate') {
    if (!Number.isInteger(graduation['observed-cycles'])) {
      defects.push({
        field: 'observed-cycles',
        message: 'graduation records no "observed-cycles" — v1 computes no counts, so this number is the ONLY record of what the moderator judged against the category\'s threshold; without it the graduation cannot be reviewed by anyone who was not in the room (UCS-1155: the analytics are manual by design)',
      });
    }
    for (const field of ['revokes', 'defect']) {
      if (graduation[field] !== undefined) {
        defects.push({
          field,
          message: `graduation carries "${field}", which describes a WITHDRAWAL of autonomy — this entry grants it. Remove the field, or change "action" to revoke if the entry was meant to withdraw a graduation`,
        });
      }
    }
    return defects;
  }
  if (typeof graduation.defect !== 'string' || graduation.defect.trim() === '') {
    defects.push({
      field: 'defect',
      message: 'revocation names no "defect" — revocation is automatic ON A DEFECT, so the defect is the trigger and the substance both; without it the record says trust was withdrawn for no stated reason, and the next graduation of this category has nothing to have fixed',
    });
  }
  return defects;
}

function checkGraduations(model, push) {
  // One table per store, keyed "<store>/<name>"; decisions is where graduation
  // is governed (the change process is the team's truth anchor, D-003).
  const tables = [...model.graduations.values()];
  // Which categories the store carries a GRADUATION for, and the entry that
  // granted it. Built once: a revocation's coherence is a question about the
  // store as a whole, not about the entry in isolation, so it cannot be
  // answered while looking at one record.
  const graduatedBy = new Map();
  for (const entry of model.decisions.values()) {
    const block = entry.record.graduation;
    if (!isObject(block) || block.action !== 'graduate') continue;
    if (typeof block.category !== 'string') continue;
    if (!graduatedBy.has(block.category)) graduatedBy.set(block.category, recordId(entry));
  }
  for (const entry of model.decisions.values()) {
    const { file, record } = entry;
    const graduation = record.graduation;
    if (!isObject(graduation)) continue; // an ordinary decision carries no block
    const { action, category } = graduation;
    // A non-string category or unknown action is a schema defect KK-02 already
    // reported; judging it again here would double-report one mistake.
    if (typeof category !== 'string' || (action !== 'graduate' && action !== 'revoke')) continue;
    // The entry's own `category` field must be `trust`. The third store governs
    // the trust boundary (PRD §3), and `trust` is the category that says so —
    // an entry filed under `process` or `governance` that quietly moves the
    // boundary is invisible to anyone auditing the boundary by category, which
    // is how a steward reads the decisions store. A malformed value is a schema
    // defect KK-02 already reported, so only a well-formed MISMATCH is judged
    // here; one omission earns one finding.
    if (typeof record.category === 'string' && record.category !== 'trust') {
      push({
        severity: 'error', code: 'graduation-not-trust-category', id: recordId(entry), file,
        path: 'category',
        message: `entry carries a graduation block but is filed under category "${record.category}" — an entry that moves the trust boundary is a "trust" decision (PRD §3: the third store governs changes to the system's own trust boundary), and one filed elsewhere is invisible to anyone auditing that boundary by category`,
      });
    }
    // Which fields belong to which action. The schema describes these rules in
    // prose and cannot enforce them — its keyword subset has no conditional —
    // and a rule stated where nothing enforces it is contract drift wearing the
    // appearance of a check. One code for the family, like the loader's
    // `graduation-threshold-shape`, with a message per field: they are one
    // defect class (this block's fields disagree with its own action) and an
    // author fixes them the same way.
    for (const defect of graduationShapeDefects(graduation, action)) {
      push({
        severity: 'error', code: 'graduation-field-shape', id: recordId(entry), file,
        path: `graduation.${defect.field}`, message: defect.message,
      });
    }
    if (!tables.length) {
      push({
        severity: 'error', code: 'missing-graduation-table', id: recordId(entry), file,
        path: 'graduation.category',
        message: `entry ${action}s the category "${category}", but the store carries no graduation category table — the table that declares which categories may graduate never loaded, so this entry's category was never checked (a check that never ran is a blocking defect, PRD §5)`,
      });
      continue;
    }
    const row = tables.map((t) => t.categories.get(category)).find(Boolean);
    if (!row) {
      const table = tables[0];
      push({
        severity: 'error', code: 'undeclared-category', id: recordId(entry), file,
        path: 'graduation.category',
        message: `category "${category}" is not declared in the graduation category table (${table.file}) — autonomy is granted per CATEGORY, so a ${action} naming an undeclared one has no scope anyone wrote down; declare the category with its eligibility and warrant, or correct the name`,
      });
      continue;
    }
    // A revocation only ever narrows autonomy, so it is legitimate against any
    // declared category — including a gated one, where it is a no-op that
    // records a defect was found. Only GRADUATION is refused.
    if (action === 'graduate' && row.eligibility === 'gated') {
      push({
        severity: 'error', code: 'gated-category-graduation', id: recordId(entry), file,
        path: 'graduation.category',
        message: `category "${category}" is PERMANENTLY GATED in ${row.file} and cannot graduate — the table's warrant for gating it is the standing answer, and a judgment call does not become mechanical by having been made correctly ${typeof graduation['observed-cycles'] === 'number' ? graduation['observed-cycles'] : 'N'} times; changing that is a table edit with its own Decisions entry, never a graduation against the table as it stands`,
      });
    }
    // A revocation must name the graduation it withdraws WHEN THERE IS ONE.
    // The `revokes` field's whole promise is that the withdrawal and the thing
    // withdrawn stay connected in the record; a revocation that omits it while
    // a graduation for that category stands leaves the store asserting both,
    // with nothing linking them — a reader cannot tell whether the graduation
    // is live, and the revocation names no target to check against.
    //
    // Omission stays CLEAN when no graduation for the category exists. That is
    // the standing-position case: recording that a never-graduated category is
    // (and remains) at full inspection is a legitimate entry, and it has no
    // graduation to point at. Demanding a ref there would demand a citation of
    // something that does not exist.
    if (action === 'revoke' && typeof graduation.revokes !== 'string') {
      const granted = graduatedBy.get(category);
      if (granted !== undefined) {
        push({
          severity: 'error', code: 'disconnected-revocation', id: recordId(entry), file,
          path: 'graduation.revokes',
          message: `revocation of "${category}" names no graduation, but ${granted} graduates that category — the withdrawal and the thing withdrawn must stay connected in the record, or a reader cannot tell whether ${granted} still stands; name it in "revokes"`,
        });
      }
    }
    // A PRESENT `revokes` must name an actual graduation OF THIS CATEGORY.
    // Existence alone is what the ref graph checks, and existence is not the
    // claim: `revokes` asserts "this entry withdraws that grant", so a
    // revocation pointing at an ordinary ADR, or at a graduation of some other
    // category, records a withdrawal of something that was never granted —
    // clean-looking, and false. The ref graph cannot see this because every id
    // it resolves is equally a real decision.
    //
    // An UNRESOLVED id is skipped: that is the ref graph's `unresolved-ref` to
    // report, and adding a second finding would double-report one typo.
    if (action === 'revoke' && typeof graduation.revokes === 'string') {
      const target = model.decisions.get(graduation.revokes);
      if (target !== undefined) {
        const targetBlock = target.record.graduation;
        const targetIsGraduation = isObject(targetBlock) && targetBlock.action === 'graduate';
        if (!targetIsGraduation) {
          push({
            severity: 'error', code: 'disconnected-revocation', id: recordId(entry), file,
            path: 'graduation.revokes',
            message: `"revokes" names ${graduation.revokes}, which is not a graduation — a revocation withdraws a grant of autonomy, so it must name the entry that granted it; ${graduation.revokes} ${isObject(targetBlock) ? 'is itself a revocation' : 'carries no graduation block at all'}`,
          });
        } else if (targetBlock.category !== category) {
          push({
            severity: 'error', code: 'disconnected-revocation', id: recordId(entry), file,
            path: 'graduation.revokes',
            message: `this entry revokes "${category}" but "revokes" names ${graduation.revokes}, which graduates "${targetBlock.category}" — a revocation must withdraw a grant made for its OWN category, or it records the withdrawal of something that was never granted while leaving the real graduation standing`,
          });
        }
      }
    }
  }
}

function checkDecisionCycles(model, push) {
  const seen = new Set(); // canonical cycle keys — each loop reported once
  const color = new Map(); // 0/undefined = white, 1 = on stack, 2 = done
  const stack = [];

  const visit = (id) => {
    color.set(id, 1);
    stack.push(id);
    const record = model.decisions.get(id)?.record;
    for (const to of strings(record?.supersedes).sort(compare)) {
      if (!model.decisions.has(to)) continue; // unresolved-ref is the loader's
      if (color.get(to) === 1) {
        const cycle = stack.slice(stack.indexOf(to));
        // Canonical rotation: start at the smallest id, attribute to it.
        const start = cycle.indexOf([...cycle].sort(compare)[0]);
        const rotated = [...cycle.slice(start), ...cycle.slice(0, start)];
        const key = rotated.join('>');
        if (!seen.has(key)) {
          seen.add(key);
          const head = rotated[0];
          push({
            severity: 'error', code: 'ref-cycle', id: head,
            file: model.decisions.get(head).file, path: 'supersedes',
            message: `supersedes chain loops: ${[...rotated, head].join(' -> ')} — decision chains must be acyclic (§3.3)`,
          });
        }
      } else if (color.get(to) !== 2) {
        visit(to);
      }
    }
    stack.pop();
    color.set(id, 2);
  };

  for (const id of [...model.decisions.keys()].sort(compare)) {
    if (!color.get(id)) visit(id);
  }
}

/**
 * Run every structural check over a loaded model — the reusable seam
 * preflight (KK-26) consumes, so verdicts and this validator can never
 * disagree. Returns the stable-sorted findings list; loader health gating
 * (exit 2 on an unhealthy store) stays with the callers. `repoRoot` is where
 * source-of-truth paths resolve (the KK-08 two-root convention: pointers are
 * repo-root-relative, §9.1; in the flat dogfood layout it equals model.root).
 */
export function runChecks(model, repoRoot = model.root) {
  const findings = [];
  const push = (f) => findings.push(f);
  checkCatalogs(model, push);
  checkConcepts(model, push, repoRoot);
  checkLeafPaths(model, push, repoRoot);
  checkOrphans(model, push);
  checkRegistryMembership(model, push);
  checkCitations(model, push);
  checkVerifiedDates(model, push);
  checkEditions(model, push);
  checkGraduations(model, push);
  checkDecisionCycles(model, push);
  findings.sort((a, b) =>
    compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code) || compare(a.id, b.id));
  return findings;
}

/**
 * Decision-entry provenance, published so a defect is traceable (UCS-1155).
 *
 * The point of recording an author and a skill version is being able to ask the
 * question backwards. When a graduated category turns out to be producing bad
 * changes, "which entries did that skill revision write?" is the question that
 * bounds the damage — and it is unanswerable if provenance is only ever stored
 * and never surfaced. So the validator publishes it for every entry that
 * carries it, and a bad skill revision becomes traceable like any other defect
 * rather than a thing someone has to remember.
 *
 * Entries WITHOUT provenance are omitted rather than listed as nulls. The field
 * is optional — the whole installed base predates it (D-001: no update channel,
 * so seeded stores keep what they have) — and a list padded with an entry for
 * every un-migrated record would bury the ones that can actually be traced.
 *
 * Stable-sorted by id and free of timestamps, like every other part of this
 * payload, so it stays baseline-diffable (D-012).
 *
 * @param {object} model the loaded store model
 * @returns {Array<{id: string, file: string, author: string|null, 'skill-version': string|null}>}
 */
function decisionProvenance(model) {
  const rows = [];
  for (const entry of model.decisions.values()) {
    const provenance = entry.record?.provenance;
    if (!isObject(provenance)) continue;
    const author = typeof provenance.author === 'string' ? provenance.author : null;
    const skillVersion = typeof provenance['skill-version'] === 'string'
      ? provenance['skill-version']
      : null;
    // A provenance block carrying neither field records nothing; publishing it
    // would advertise traceability the entry does not actually have.
    if (author === null && skillVersion === null) continue;
    rows.push({ id: recordId(entry), file: entry.file, author, 'skill-version': skillVersion });
  }
  rows.sort((a, b) => compare(a.id, b.id));
  return rows;
}

// ------------------------------------------------------------- CLI plumbing

function parseArgs(argv) {
  const { options } = parseFlags(argv, {
    boolean: ['json'],
    value: ['root'],
    repeatable: ['concepts'],
    // `--concepts=` is an empty filter, and an empty filter never ran.
    allowEmpty: ['concepts'],
  });
  const opts = { json: !!options.json, root: options.root ?? process.cwd(), concepts: null };
  if (options.concepts) {
    opts.concepts = normalizeConceptIds(options.concepts.flatMap((v) => v.split(',')));
    if (!opts.concepts.length) {
      throw new UsageError('--concepts must name at least one concept id — a filter that never ran is a failure, never a silent pass');
    }
  }
  return opts;
}

function render(payload) {
  const { counts } = payload;
  const lines = [];
  lines.push(counts.errors + counts.warnings === 0
    ? 'structural validate -> 0 findings — structurally clean'
    : `structural validate -> ${counts.errors + counts.warnings} finding(s) (${counts.errors} error(s), ${counts.warnings} warning(s))`);
  lines.push(`checks run: ${payload.checks.join(', ')}`, '');
  const health = payload['store-health'];
  if (health.warnings) {
    lines.push(`store health: ${health.errors} error(s), ${health.warnings} warning(s) — loader warnings do not block; errors would have (exit 2)`, '');
  }
  if (payload.concepts) lines.push(`filtered to concepts: ${payload.concepts.join(', ')}`, '');
  // Provenance is traceability, so it is printed where a human reading a
  // failing run can see it — not only in the JSON a machine parses.
  if (payload.provenance.length) {
    lines.push('decision provenance (author / skill version):');
    for (const p of payload.provenance) {
      lines.push(`    ${p.id}  ${p.author ?? '—'}  ${p['skill-version'] ?? '—'}`);
    }
    lines.push('');
  }
  for (const f of payload.findings) {
    lines.push(`${f.severity}  ${f.code}  ${f.id}  ${f.file}  ${f.path}`, `    ${f.message}`);
  }
  if (counts.errors) {
    lines.push('', 'fix every error-severity finding before merging — this validator is blocking-grade (PRD §4)');
  }
  return lines;
}

export function main(argv) {
  {
    const opts = parseArgs(argv);

    let model;
    try {
      // KK-08 two-root convention: --root is the REPO root; the stores live
      // at <root>/unknown-knowledge/ when seeded (§9.1) or at the root itself
      // (dogfood layout). Pointers stay repo-root-relative either way.
      model = loadStores(locateKitRoot(opts.root));
    } catch (error) {
      // An EXPECTED refusal from the loader — an unreadable root, an ambiguous
      // kit layout, a Store that will not load. The stores this command would
      // check never loaded, so its checks never ran: exit 2, never 1.
      process.stderr.write(`validate: ${error.message}\n`);
      rethrowIfBug(error); // a bug, or a UsageError raised deep in the loader, is not ours to speak for
      return EXIT_CODES.FAILURE;
    }

    // Single health model (PRD §4): loader errors mean the stores this
    // validator would check never fully loaded — its structural checks never
    // ran, and a check that never ran is a blocking defect (exit 2), never a
    // silent pass or a partial findings list.
    if (!model.ok) {
      const { errors } = storeHealth(model);
      process.stderr.write(`validate: the store loader reported ${errors.length} error(s) — structural checks never ran (a check that never ran is a blocking defect, PRD §5)\n`);
      for (const d of errors) {
        process.stderr.write(`  ${d.code}  ${d.file}${d.path ? `  ${d.path}` : ''}  ${d.message}\n`);
      }
      return EXIT_CODES.FAILURE;
    }

    let findings = runChecks(model, opts.root);
    if (opts.concepts) {
      for (const id of opts.concepts) {
        // Loaded concepts plus catalog-declared ids (a declared-but-missing
        // record is exactly what a mid-session check needs to look at).
        const declared = model.stores.ontology.catalog?.entries?.some?.(
          (row) => isObject(row) && row.id === id);
        if (!model.concepts.has(id) && !declared) {
          process.stderr.write(`validate: unknown concept id "${id}" — filtering on a typo must never read as a clean pass\n`);
          return EXIT_CODES.FAILURE;
        }
      }
      const wanted = new Set(opts.concepts);
      findings = findings.filter((f) => wanted.has(f.id));
    }

    const payload = {
      checks: CHECKS,
      ...(opts.concepts ? { concepts: opts.concepts } : {}),
      provenance: decisionProvenance(model),
      'store-health': healthSummary(storeHealth(model)),
      counts: {
        errors: findings.filter((f) => f.severity === 'error').length,
        warnings: findings.filter((f) => f.severity === 'warning').length,
      },
      findings,
    };

    const lines = opts.json ? [JSON.stringify(payload, null, 2)] : render(payload);
    process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
    return payload.counts.errors ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
  }
}
