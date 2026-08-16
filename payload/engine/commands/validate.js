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
 *   missing-path      a concept source-of-truth path that does not exist in
 *                     the working tree. Deprecated concepts demote to warning
 *                     (§3.5 — the source-deletion escape hatch); draft and
 *                     proposed stay blocking: structural checks always apply
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
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  LEAF_ACCESSION_FIELD, LEAF_ID_FIELD, healthSummary, loadStores, normalizeConceptIds,
  recordId, storeHealth,
} from '../lib/load-stores.js';
import { locateKitRoot } from '../lib/kit-root.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { UsageError, parseArgs as parseFlags, rethrowIfBug } from '../lib/cli.js';
import { compare } from '../lib/validate-record.js';
// Catalog id grammars come from the one module that owns them (UCS-1142), the
// same source the record-level schema patterns bind to — so a catalog row and
// the record it points at can never be judged by two different grammars.
import { ID_GRAMMARS, idPattern } from '../lib/id-grammars.js';

export const USAGE = 'usage: node payload/engine/validate.js [--json] [--root <dir>] [--concepts <ids>]';

/** Every check class this validator runs, sorted — reported on every run. */
export const CHECKS = Object.freeze([
  'id-range', 'id-shape', 'index-drift', 'missing-citation',
  'missing-path', 'missing-registry', 'orphan', 'ref-cycle',
  'registry-shape-mismatch', 'suppressed-value', 'unminted-segment',
  'unregistered-value',
]);

/** The §3 documented mid-import marker a catalog row carries instead of a file. */
const PENDING_MARKER = 'pending-import';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

// -------------------------------------------------------------- the checks

/**
 * The id grammar each store's CATALOG rows are judged by.
 *
 * Usually the store's own space — a catalog row names an id that store mints.
 * Knowledge is the exception while accessions expand (UCS-1144): a row points
 * at a leaf, and a pointer may spell its target either way, so knowledge rows
 * are judged by the citation grammar. Declared here rather than branched on in
 * the loop, so the exception is a table entry that disappears when notation
 * retires, not an `if (store === 'knowledge')` somebody has to find.
 */
const CATALOG_ID_SPACE = Object.freeze({
  decisions: 'decisions',
  knowledge: 'leaf-ref',
  ontology: 'ontology',
});

/** Catalog rows: id grammar (id-shape) + row↔file agreement (index-drift). */
function checkCatalogs(model, push) {
  // What each loaded file actually contains — the fact the index must match.
  // A leaf is recorded under every spelling it answers to, because a row that
  // names an accessioned leaf by its notation points at exactly the right file
  // and must not read as drift (UCS-1144): both forms are legal citations, and
  // the catalog is the store's own citation of its leaves.
  const idsByFile = new Map();
  const addTo = (file, id) => {
    if (typeof file !== 'string' || typeof id !== 'string') return;
    if (!idsByFile.has(file)) idsByFile.set(file, new Set());
    idsByFile.get(file).add(id);
  };
  for (const records of [model.concepts, model.decisions, model.leaves]) {
    for (const entry of records.values()) addTo(entry.file, recordId(entry));
  }
  for (const [alias, identity] of model.leafAliases) {
    addTo(model.leaves.get(identity)?.file, alias);
  }

  for (const store of ['decisions', 'knowledge', 'ontology']) {
    const catalog = model.stores[store].catalog;
    if (!isObject(catalog) || !Array.isArray(catalog.entries)) continue; // absent/invalid: loader diagnosed
    // A catalog row is a POINTER at a leaf, not a leaf, so it is judged by the
    // citation grammar rather than the minting one: a row may name the leaf it
    // points at by accession or by notation, exactly as a cross-reference may
    // (UCS-1144). Agreement with the pointed-at file is checked below, and
    // that check is what actually ties the row to a leaf — the grammar only
    // decides whether the row names something of a shape a leaf could have.
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
      if (!statSync(join(repoRoot, p), { throwIfNoEntry: false })) {
        push({
          severity, code: 'missing-path', id, file, path: `source-of-truth[${i}]`,
          message: `source-of-truth path "${p}" does not exist in the working tree — the truth anchor is the artifact (§3.1)`,
        });
      }
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
  // loop (UCS-1142). A leaf reports whichever field its identity came from, so
  // the author is pointed at the line they would actually edit (UCS-1144).
  const spaces = [
    ['ontology', model.concepts, () => 'id'],
    // `typeof`, not truthiness — the same test the loader used to decide which
    // field the identity came from. A non-string `id` (a YAML-coerced number,
    // say) is not an accession there, so it must not be named as one here: the
    // two must agree about which line an author is pointed at.
    ['knowledge', model.leaves, (e) => (typeof e.id === 'string' ? LEAF_ACCESSION_FIELD : LEAF_ID_FIELD)],
    ['decisions', model.decisions, () => 'id'],
  ];
  // A leaf is declared when the catalog names it by EITHER legal spelling
  // (UCS-1144). The catalog is a citation of the leaf, so a row that still
  // names a since-accessioned leaf by its notation reaches it — which is the
  // whole point of keeping both forms legal while the migrate batches run.
  for (const [alias, identity] of model.leafAliases) {
    if (declared.knowledge.has(alias)) declared.knowledge.add(identity);
  }
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
 *
 * Frozen all the way down: a mutated row would silently redirect a facet at a
 * different vocabulary, which is a governed store quietly ungoverned.
 *
 * @type {Readonly<Record<string, ReadonlyArray<Readonly<object>>>>}
 */
export const FACET_REGISTRIES = Object.freeze({
  'knowledge-leaf': Object.freeze([
    Object.freeze({ field: 'facets.domain', registry: 'knowledge/domains', hierarchical: true }),
    Object.freeze({ field: 'operations', each: true, registry: 'knowledge/operations', hierarchical: false }),
    Object.freeze({ field: 'applies.jurisdictions', each: true, registry: 'knowledge/jurisdictions', hierarchical: false }),
    Object.freeze({ within: 'citations', field: 'authority', registry: 'knowledge/authority-tiers', hierarchical: false }),
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
  for (const { within, field, each, registry: registryKey } of rows) {
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

/** Leaf citations must carry a non-empty source (§3.2). */
function checkCitations(model, push) {
  for (const leaf of model.leaves.values()) {
    const { file, record } = leaf;
    if (!Array.isArray(record.citations)) continue; // presence is a schema check
    record.citations.forEach((c, i) => {
      if (isObject(c) && typeof c.source === 'string' && c.source.trim() === '') {
        push({
          severity: 'error', code: 'missing-citation', id: recordId(leaf), file,
          path: `citations[${i}].source`,
          message: 'citation source is empty — an unsourced claim is not promotable (§3.2)',
        });
      }
    });
  }
}

/** Decision supersedes chains must be acyclic (§3.3). One finding per cycle. */
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
  checkOrphans(model, push);
  checkRegistryMembership(model, push);
  checkCitations(model, push);
  checkDecisionCycles(model, push);
  findings.sort((a, b) =>
    compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code) || compare(a.id, b.id));
  return findings;
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
