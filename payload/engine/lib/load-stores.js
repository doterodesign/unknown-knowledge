/**
 * Store loader (KK-04) — the engine's single shared substrate (PRD §4).
 *
 * Parses all three stores (ontology, knowledge, decisions) from a kit root
 * directory ONCE into an indexed in-memory model, with diagnostics on one
 * error/warning scale. Every downstream surface — structural validator
 * (KK-05), value validator (KK-07), audit (KK-12), resolver (KK-06),
 * preflight (KK-26) — consumes these same diagnostics: the single-health-model
 * guarantee that validator, audit, and preflight can never disagree.
 *
 * Layout loaded (PRD §9.1):
 *   ontology/   _catalog.yaml  _rules.yaml  classes/*.yaml   (concept records)
 *   knowledge/  _catalog.yaml  _rules.yaml  **\/*.md          (leaf = YAML front
 *                                                             matter + markdown body)
 *   decisions/  _catalog.yaml  entries/*.yaml                (decision records)
 *
 * Model shape (all collections deterministically sorted — PRD §5 diffability):
 *   {
 *     root,                     // absolute root the stores were loaded from
 *     stores: { ontology|knowledge|decisions:
 *       { present, catalog, rules, files } },   // parsed docs (null if absent),
 *                                               // record files root-relative
 *     concepts:  Map id       -> { id, file, record },
 *     leaves:    Map leaf-id  -> { identity, id, notation, file, record, body },
 *                               // `identity` is the neutral id key consumers
 *                               // read (UCS-1142) — the accession when the
 *                               // leaf mints one, the notation otherwise
 *                               // (UCS-1144); `id` and `notation` are the two
 *                               // public wire names, `id` null when unminted
 *     leafAliases: Map spelling -> leaf identity,
 *                               // the OTHER legal spelling of an accessioned
 *                               // leaf: its notation. Cross-references may
 *                               // cite either form while both are legal, and
 *                               // this is what makes the second one resolve
 *                               // (UCS-1144). Ref resolution reads it; nothing
 *                               // that enumerates leaves does, so an aliased
 *                               // leaf is still exactly one record
 *     decisions: Map id       -> { id, file, record },
 *     pointers:  Map source-of-truth path -> [concept ids],  // KK-06 --paths
 *     refs:      [{ from, type, to, file, path, resolved }], // cross-ref graph
 *     diagnostics: [{ severity, code, file, path, message }],
 *     ok,                       // true iff no error-severity diagnostic
 *   }
 *
 * Diagnostics (severity 'error' | 'warning'), stable-sorted by file/path/code:
 *   parse-error        error    unparseable YAML, multi-doc file, or a leaf
 *                               without front matter
 *   <validate-record>  error    every schema/convention code from KK-02
 *                               (missing-required, non-string-enumerates-value,
 *                               …) carried through unchanged — including the
 *                               §3.5 YAML-coercion hard error: files are parsed
 *                               with scalar types intact (js-yaml YAML 1.2 core
 *                               schema), so true/1.0/null enumerates values are
 *                               detected as non-strings, never stringified
 *   duplicate-id       error    same id minted twice across (or within) files
 *   unresolved-ref     error    typed ref to an id that neither loaded as an
 *                               entry nor is declared in the target store's
 *                               catalog (catalog-declared ids with pending
 *                               files resolve — the catalog never implies a
 *                               recorded id is absent; file-pointer resolution
 *                               is KK-05's check)
 *   missing-store      warning  store directory absent (pre-init / partial
 *                               repos load well-defined; post-init repos always
 *                               have all three)
 *   missing-catalog    error    store directory present without _catalog.yaml
 *                               (the navigational entry point, PRD §3)
 *
 * A nonexistent/unreadable root THROWS — an engine failure (exit-code 2
 * territory, PRD §5), never a silent diagnostic.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load, YAMLException } from 'js-yaml';
import { validateStoreFile, ERROR_CODES, compare } from './validate-record.js';
import { UsageError } from './usage-error.js';

export const SEVERITIES = Object.freeze(['error', 'warning']);

/**
 * The record field a knowledge leaf falls back to for its id (UCS-1142).
 *
 * Named ONCE, here. The loader reads the leaf's id through this constant and
 * indexes the result under the neutral `identity` key, so nothing downstream
 * has to know which field the notation lives in — changing the leaf id space
 * is this constant plus the grammar in lib/id-grammars.js, not a rename that
 * fans out through every consumer.
 *
 * It is deliberately NOT the public wire name: the resolver still emits
 * `notation` in its JSON (a published field, §4), and the loader keeps that
 * spelling on the indexed entry alongside `identity` for exactly that reason.
 */
export const LEAF_ID_FIELD = 'notation';

/**
 * The field a knowledge leaf mints its ACCESSION id in (UCS-1144).
 *
 * An accession is opaque, minted at PR time, never reused, never positional —
 * everything a dotted notation is not. When a leaf carries one it IS the
 * leaf's identity: `leafIdentity` prefers it, so the whole store can migrate
 * leaf by leaf without any consumer learning that two id spaces exist.
 */
export const LEAF_ACCESSION_FIELD = 'id';

/**
 * A leaf's identity, and every spelling a reference may reach it by (UCS-1144).
 *
 * The expand phase's entire contract, in one function. `identity` is what the
 * leaf IS — the accession when it has one, the notation otherwise — and it is
 * what every consumer reads, reports and serializes. `keys` is what the leaf
 * ANSWERS TO, which is a strictly larger set while both citation forms stay
 * legal: a leaf with an accession is still cited by notation from every store
 * and fixture written before it was minted, and those citations must keep
 * resolving unchanged.
 *
 * Keeping the two apart is what lets identity move to accessions immediately
 * while the migrate batches proceed at their own pace. Collapsing them would
 * force the choice the ticket exists to avoid: either no leaf may carry an
 * accession yet, or every notation-form reference breaks the day one does.
 *
 * Non-string ids are dropped rather than coerced — KK-02 already diagnoses the
 * wrong type, and a coerced key would index a leaf under a spelling no author
 * ever wrote.
 *
 * @param {object} record a parsed leaf front matter
 * @returns {{ identity: unknown, keys: string[] }} the leaf's id, and the
 *   distinct keys it is indexed under (identity first)
 */
export function leafIdentity(record) {
  const accession = record[LEAF_ACCESSION_FIELD];
  const notation = record[LEAF_ID_FIELD];
  const identity = typeof accession === 'string' ? accession : notation;
  const keys = [identity, notation].filter(
    (key, i, all) => typeof key === 'string' && all.indexOf(key) === i,
  );
  return { identity, keys };
}

/**
 * The id of one indexed record, whatever store it came from.
 *
 * Concepts and decisions carry `id`, leaves carry `identity` — one accessor,
 * so a consumer that walks all three spaces (catalog checks, orphan checks)
 * never names a store-specific field. The Map key is the same value; this is
 * for the code paths that hold the entry rather than the pair.
 *
 * @param {{ id?: string, identity?: string }} entry an indexed record
 * @returns {string|undefined} the record's id
 */
export const recordId = (entry) => entry.identity ?? entry.id;

export const DIAGNOSTIC_CODES = Object.freeze([
  ...ERROR_CODES,
  'parse-error',
  'read-error',
  'duplicate-id',
  'unresolved-ref',
  'skipped-file',
  'missing-store',
  'missing-catalog',
  'missing-rules',
]);

/**
 * Freeze a ref-field table through every level it has: the table, each kind's
 * row array, each row, and an array-form field path. `Object.freeze` is
 * shallow, so freezing only the outer object would leave every row writable —
 * and a mutated row is a silently rewritten cross-reference graph.
 *
 * @template {Record<string, Array<{ field: string|string[], space: string }>>} T
 * @param {T} table the declaration table
 * @returns {Readonly<T>} the same table, frozen all the way down
 */
function deepFreezeTable(table) {
  for (const rows of Object.values(table)) {
    for (const row of rows) {
      if (Array.isArray(row.field)) Object.freeze(row.field);
      Object.freeze(row);
    }
    Object.freeze(rows);
  }
  return Object.freeze(table);
}

/**
 * Typed cross-references per store record shape (§3.1–3.3): field path → id space.
 *
 * This table IS the cross-reference graph. Every typed edge the engine knows
 * about is a row here, and `collectRefs`/`resolveRefs` are generic over it —
 * so a new edge is a new declaration, never a bespoke check bolted onto the
 * walker. That property is what the rest of the frontmatter-v2 work leans on:
 * `relates.depends-on`, `relates.contradicts` and friends arrive as rows.
 *
 * A `field` is a path of object keys ending at an ARRAY of id strings, spelled
 * either as a dotted string ('relates.depends-on') or as an array of segments
 * (['relates', 'depends-on']). Depth is arbitrary — one level, two, or the
 * three that v2's nested `relates` map needs — because the walker descends the
 * segments rather than destructuring a fixed `[head, tail]` pair, which is all
 * it used to handle. Segments containing a literal dot must use the array form.
 *
 * The declared path doubles as the edge's `type` (a published field on
 * `model.refs`, quoted in the unresolved-ref message), so it always reads as
 * the dotted path an author would find in their own file.
 *
 * Frozen all the way down (rows, and any array-form path): the table is a
 * declaration every surface reads, so a consumer that could mutate a row would
 * be rewriting the cross-reference graph out from under the loader.
 *
 * @type {Readonly<Record<string, ReadonlyArray<{ field: string|string[], space: string }>>>}
 */
export const REF_FIELDS = deepFreezeTable({
  'ontology-concept': [
    { field: 'used-by', space: 'concepts' },
    { field: 'confusable-with', space: 'concepts' },
    { field: 'rationale', space: 'decisions' },
  ],
  'knowledge-leaf': [
    { field: 'cross-references.class-elsewhere', space: 'leaves' },
    { field: 'cross-references.see-also', space: 'leaves' },
  ],
  'decision-entry': [
    { field: 'supersedes', space: 'decisions' },
    { field: 'superseded-by', space: 'decisions' },
    { field: 'relates-to.concepts', space: 'concepts' },
    { field: 'relates-to.leaves', space: 'leaves' },
    { field: 'relates-to.decisions', space: 'decisions' },
  ],
});

/** The id spaces a ref row may target, and the store each one is declared in. */
const SPACE_TO_STORE = Object.freeze({
  concepts: 'ontology',
  leaves: 'knowledge',
  decisions: 'decisions',
});

/**
 * The spaces whose records answer to more than one spelling, and the context
 * key holding those alternate spellings (UCS-1144).
 *
 * Declared rather than branched on, for the same reason REF_FIELDS is: "which
 * spaces accept a second id shape" is a fact about the STORES, and a fact
 * about the stores belongs in a table every consumer reads. `leaves` is the
 * only such space today; when notation retires it leaves this table, and ref
 * resolution narrows without being edited.
 *
 * @type {Readonly<Record<string, string>>}
 */
const SPACE_ALIASES = Object.freeze({
  leaves: 'leafAliases',
});

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function sortedMap(map) {
  return new Map([...map.entries()].sort((a, b) => compare(a[0], b[0])));
}

/** Parse one YAML document with scalar types intact (§3.5 coercion trap). */
function parseYaml(ctx, file, text) {
  try {
    return { doc: load(text, { filename: file }) };
  } catch (error) {
    const reason = error instanceof YAMLException ? error.reason ?? error.message : error.message;
    ctx.diagnostics.push({
      severity: 'error', code: 'parse-error', file, path: '',
      message: `unparseable YAML: ${reason}`,
    });
    return null;
  }
}

/** Validate a store file via KK-02 and map its errors onto the one scale. */
function validateInto(ctx, kind, file, doc) {
  const { ok, errors } = validateStoreFile(kind, doc);
  for (const { path, code, message } of errors) {
    ctx.diagnostics.push({ severity: 'error', code, file, path, message });
  }
  return ok;
}

/**
 * The record already answering to `id` through an alternate spelling, if any.
 *
 * One lookup, used by both indexing paths, so "is this id taken?" has a single
 * answer regardless of which order the two claimants happened to load in.
 * Spaces with no alias index (concepts, decisions) simply never match.
 *
 * @param {object} ctx the loader context
 * @param {string} space the id space being indexed into
 * @param {string} id the id being claimed
 * @returns {object|undefined} the record already holding that spelling
 */
function aliasOwner(ctx, space, id) {
  const identity = ctx[SPACE_ALIASES[space]]?.get(id);
  return identity === undefined ? undefined : ctx[space].get(identity);
}

/**
 * Index one record by id; the second mint of an id is a duplicate-id error.
 *
 * @returns {boolean} whether the record took the id. A caller with further
 *   indexing to do for the same record must check: a record that LOST a
 *   collision owns nothing, and anything else indexed in its name would be
 *   filed under the winner (see loadLeafFiles).
 */
function indexRecord(ctx, space, id, file, path, entry) {
  if (typeof id !== 'string') return false; // shape defects already diagnosed by KK-02
  // An identity collides with an ALIAS as readily as with another identity: a
  // notation already claimed as some accessioned leaf's alternate spelling is
  // taken, whichever file happened to load first. Checking only the identity
  // index would have made the collision order-dependent — caught when the
  // notation-only leaf loads first, silently accepted when it loads second —
  // and a duplicate that depends on readdir order is not a hard error at all.
  const existing = ctx[space].get(id) ?? aliasOwner(ctx, space, id);
  if (existing) {
    ctx.diagnostics.push({
      severity: 'error', code: 'duplicate-id', file, path,
      message: `id "${id}" is already minted in ${existing.file} — published ids are immutable; the later PR renumbers its own entry (§3.5)`,
    });
    return false;
  }
  ctx[space].set(id, entry);
  return true;
}

/**
 * Index one leaf under a spelling that is not its identity (UCS-1144) — the
 * notation of a leaf whose identity is an accession.
 *
 * An alias collides on exactly the same terms an identity does, and says so
 * with the same code: two leaves claiming one notation is the duplicate-id
 * defect whether or not either has since been accessioned. Aliases are checked
 * against the identity index too, so a notation that is already some other
 * leaf's identity cannot be quietly shadowed by an alias — the second claim
 * loses, and the first mint stands (§3.5: published ids are immutable).
 *
 * @param {object} ctx the loader context
 * @param {string} alias the alternate spelling to index
 * @param {string} identity the leaf this spelling resolves to
 * @param {string} file the leaf's file, for the diagnostic
 */
function indexAlias(ctx, alias, identity, file) {
  const owner = ctx.leaves.get(alias) ?? aliasOwner(ctx, 'leaves', alias);
  if (owner) {
    if (owner.identity !== identity) {
      ctx.diagnostics.push({
        severity: 'error', code: 'duplicate-id', file, path: LEAF_ID_FIELD,
        message: `id "${alias}" is already minted in ${owner.file} — published ids are immutable; the later PR renumbers its own entry (§3.5)`,
      });
    }
    return;
  }
  ctx.leafAliases.set(alias, identity);
}

/**
 * The segments of a declared ref field path. Dotted strings are the ordinary
 * spelling; the array form exists for a segment that contains a literal dot.
 *
 * @param {string|string[]} field as declared in REF_FIELDS
 * @returns {string[]} the object keys to descend, outermost first
 */
const fieldSegments = (field) => (Array.isArray(field) ? field : field.split('.'));

/**
 * The author-facing spelling of a declared path — the edge's `type`, and the
 * stem of the `path` a finding quotes.
 *
 * Deliberately a plain dotted join, with NO escaping. This string's whole job
 * is to be findable: an author reading `cross-references.see-also[0]` searches
 * their own file for exactly that. An escaped rendering (`v1\.2.refs[0]`)
 * would match nothing they wrote, so escaping would trade a real, everyday
 * cost against a collision that only two DECLARATIONS can create.
 *
 * That collision is instead refused at the source (assertDistinctPaths): two
 * rows like ['a.b','c'] and ['a','b.c'] would render identically, and the fix
 * is to reject the ambiguous TABLE, not to disfigure every finding message.
 *
 * @param {string[]} segments the declared segments
 * @returns {string} the dotted path as an author would find it in their file
 */
const pathLabel = (segments) => segments.join('.');

/**
 * Refuse a ref-field table in which two rows render the same author-facing
 * path — an engine failure at load, never a silent diagnostic.
 *
 * Only the array form can cause this (a segment carrying a literal dot), and
 * only against another row of the same record kind. Two indistinguishable
 * edges would make a finding ambiguous about which declaration it came from,
 * so the table is refused rather than believed: shipping it would be a check
 * whose output cannot be acted on (PRD §5).
 *
 * @param {Record<string, ReadonlyArray<{ field: string|string[] }>>} table
 * @throws {Error} if any record kind declares two rows with the same rendering
 */
export function assertDistinctPaths(table) {
  for (const [kind, rows] of Object.entries(table)) {
    const seen = new Map();
    for (const { field } of rows) {
      const label = pathLabel(fieldSegments(field));
      const previous = seen.get(label);
      if (previous !== undefined) {
        throw new Error(
          `ref-field table for "${kind}" declares two edges that render the same path "${label}" `
          + `(${JSON.stringify(previous)} and ${JSON.stringify(field)}) — findings could not say which edge they came from; `
          + 'spell one of them so the rendered paths differ',
        );
      }
      seen.set(label, field);
    }
  }
}

// The shipped table is checked as this module loads: an ambiguous declaration
// is a defect in the kit itself, and must surface the moment it is introduced
// rather than as a confusing finding in somebody's repo.
assertDistinctPaths(REF_FIELDS);

/**
 * Follow a declared field path into one record, at any depth.
 *
 * Returns the value at the end of the path, or undefined if any intermediate
 * segment is missing or is not an object — a record that simply does not carry
 * the edge is the common case, not a defect, and shape defects at the leaf are
 * already diagnosed by KK-02. The caller decides what a non-array end means.
 *
 * @param {object} record the parsed record
 * @param {string[]} segments object keys to descend, outermost first
 * @returns {unknown} the value at the path's end, or undefined
 */
function valueAtPath(record, segments) {
  let node = record;
  for (const segment of segments) {
    if (!isObject(node)) return undefined;
    node = node[segment];
  }
  return node;
}

/**
 * The typed ref edges one record declares — the whole ref-graph walker.
 *
 * Generic over the DECLARATION at any depth: it descends the declared segments,
 * so a nested map of typed arrays (frontmatter v2's `relates`) walks the same
 * code path as a top-level array. Both the edge's `type` and its `path` are
 * built from the declaration, which is why introducing an edge is adding a row
 * to REF_FIELDS and nothing else — there is no per-edge branch to extend.
 *
 * Pure: it takes the rows rather than reaching for REF_FIELDS, and returns
 * edges rather than pushing into the loader's context. That is what lets a
 * test drive a synthetic record kind through the real walker without a fake
 * edge being added to the shipped table (tests/load-stores.test.js).
 *
 * Non-string members are skipped: KK-02 already diagnoses the wrong type, and
 * a second complaint from the ref graph would double-report one defect.
 *
 * @param {ReadonlyArray<{ field: string|string[], space: string }>} rows the
 *   declared edges for this record kind
 * @param {object} record the parsed record to read edges out of
 * @param {{ from: string, file: string, basePath?: string }} origin what the
 *   edges are attributed to — the record's id, its file, and the path prefix
 *   the record sits at within that file ('' for a one-record file)
 * @returns {Array<{ from, type, to, file, path, space }>} edges in declaration
 *   order, then array order
 */
export function refEdges(rows, record, { from, file, basePath = '' }) {
  const edges = [];
  for (const { field, space } of rows) {
    const segments = fieldSegments(field);
    const list = valueAtPath(record, segments);
    if (!Array.isArray(list)) continue;
    const type = pathLabel(segments);
    list.forEach((to, i) => {
      if (typeof to !== 'string') return; // wrong-type already diagnosed
      const path = basePath ? `${basePath}.${type}[${i}]` : `${type}[${i}]`;
      edges.push({ from, type, to, file, path, space });
    });
  }
  return edges;
}

/** Collect one record's declared edges into the loader's graph. */
function collectRefs(ctx, kind, from, file, basePath, record) {
  ctx.refs.push(...refEdges(REF_FIELDS[kind], record, { from, file, basePath }));
}

/**
 * Read one store file. Only a genuinely absent file returns null; any other
 * failure (permissions, I/O) is an engine-visible read-error — an unread
 * file must never masquerade as a missing or malformed one (PRD §5).
 */
function readText(ctx, file) {
  try {
    return readFileSync(join(ctx.root, file), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      ctx.diagnostics.push({
        severity: 'error', code: 'read-error', file, path: '',
        message: `cannot read file: ${error.message}`,
      });
    }
    return null;
  }
}

/** One pipeline for every store meta file: read → parse → validate → assign. */
function loadMetaFile(ctx, file, kind, { onMissing, onParsed } = {}) {
  const text = readText(ctx, file);
  if (text === null) {
    onMissing?.();
    return null;
  }
  const parsed = parseYaml(ctx, file, text);
  if (!parsed) return null;
  const valid = validateInto(ctx, kind, file, parsed.doc);
  onParsed?.(parsed.doc, valid);
  return valid ? parsed.doc : null;
}

function loadCatalogAndRules(ctx, store, hasRules) {
  const meta = ctx.stores[store];
  meta.catalog = loadMetaFile(ctx, `${store}/_catalog.yaml`, 'catalog', {
    onMissing: () => ctx.diagnostics.push({
      severity: 'error', code: 'missing-catalog', file: `${store}/_catalog.yaml`, path: '',
      message: `store "${store}" has no _catalog.yaml — the navigational entry point every store shares (PRD §3)`,
    }),
    // Harvest declared ids from every id-bearing row even when the catalog
    // has schema defects elsewhere: one bad row must not turn every ref to a
    // validly declared pending id into a spurious unresolved-ref cascade.
    onParsed: (doc) => {
      if (!isObject(doc) || !Array.isArray(doc.entries)) return;
      for (const entry of doc.entries) {
        if (isObject(entry) && typeof entry.id === 'string') ctx.declared[store].add(entry.id);
      }
    },
  });
  if (hasRules) {
    meta.rules = loadMetaFile(ctx, `${store}/_rules.yaml`, 'rules', {
      onMissing: () => ctx.diagnostics.push({
        severity: 'warning', code: 'missing-rules', file: `${store}/_rules.yaml`, path: '',
        message: `store "${store}" has no _rules.yaml (§9.1) — rules-dependent surfaces have no input`,
      }),
    });
  }
}

function listFiles(ctx, dir, extension, recursive) {
  const out = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(join(ctx.root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const relPath = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (recursive) walk(relPath);
      } else if (entry.name.endsWith(extension)) {
        // Symlinked record files load like regular ones (isFile() is false
        // for symlinks; the readFileSync that follows resolves them).
        out.push(relPath);
      } else {
        // A file the loader will not read must never be a silent pass
        // (PRD §5): its ids simply wouldn't exist, with nothing recorded.
        ctx.diagnostics.push({
          severity: 'warning', code: 'skipped-file', file: relPath, path: '',
          message: `not a ${extension} file — the loader only reads ${extension} records here; rename it or move it out of the store`,
        });
      }
    }
  };
  walk(dir);
  return out.sort(compare);
}

/** Ontology class files / decision entries files: the storeFile envelope. */
function loadEntriesFiles(ctx, store, subdir, kind, space) {
  for (const file of listFiles(ctx, `${store}/${subdir}`, '.yaml', false)) {
    ctx.stores[store].files.push(file);
    const text = readText(ctx, file);
    if (text === null) continue; // read-error already diagnosed
    const parsed = parseYaml(ctx, file, text);
    if (!parsed) continue;
    validateInto(ctx, kind, file, parsed.doc);
    if (!isObject(parsed.doc) || !Array.isArray(parsed.doc.entries)) continue;
    parsed.doc.entries.forEach((record, i) => {
      if (!isObject(record)) return;
      const basePath = `entries[${i}]`;
      indexRecord(ctx, space, record.id, file, `${basePath}.id`, { id: record.id, file, record });
      if (typeof record.id === 'string') collectRefs(ctx, kind, record.id, file, basePath, record);
    });
  }
}

/** Knowledge leaves: YAML front matter + markdown body, one leaf per file. */
function loadLeafFiles(ctx) {
  for (const file of listFiles(ctx, 'knowledge', '.md', true)) {
    ctx.stores.knowledge.files.push(file);
    const raw = readText(ctx, file);
    if (raw === null) continue; // read-error already diagnosed
    // Editors and autocrlf produce BOMs and CRLF; both are well-formed input.
    const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const match = /^---\n([^]*?\n)?---(?:\n|$)([^]*)$/.exec(text);
    if (!match) {
      ctx.diagnostics.push({
        severity: 'error', code: 'parse-error', file, path: '',
        message: 'knowledge leaf must open with YAML front matter fenced by "---" lines (§3.2)',
      });
      continue;
    }
    const parsed = parseYaml(ctx, file, match[1] ?? '');
    if (!parsed) continue;
    validateInto(ctx, 'knowledge-leaf', file, parsed.doc);
    const record = parsed.doc;
    if (!isObject(record)) continue;
    // The leaf's identity is read through leafIdentity(), never by naming a
    // field here: that function is the whole seam an id-space change moves
    // through (UCS-1142, UCS-1144). `identity` is the neutral key consumers
    // read; `notation` stays alongside it because it is a PUBLIC resolver
    // field, and `id` because the resolver publishes the accession too.
    const { identity, keys } = leafIdentity(record);
    const entry = {
      identity,
      [LEAF_ACCESSION_FIELD]: record[LEAF_ACCESSION_FIELD] ?? null,
      [LEAF_ID_FIELD]: record[LEAF_ID_FIELD],
      file,
      record,
      body: match[2],
    };
    // `leaves` is keyed by IDENTITY alone — one entry per leaf, exactly as
    // before. Every consumer that walks the index (orphan checks, citation
    // checks, the resolver's entry points) therefore still sees each leaf
    // once; indexing the aliases here instead would have turned one
    // accessioned leaf into two orphan findings and two resolver results.
    //
    // The alternate spelling goes to `leafAliases`, a lookup consulted by ref
    // resolution and nothing else. Separating them is what keeps "answers to
    // two names" from becoming "is two records": identity is a property of the
    // leaf, an alias is a property of the citation.
    const idPath = typeof record[LEAF_ACCESSION_FIELD] === 'string'
      ? LEAF_ACCESSION_FIELD
      : LEAF_ID_FIELD;
    // Everything downstream is indexed under this leaf's identity, so it all
    // hangs on the leaf actually TAKING that identity. A leaf that lost the id
    // to an earlier file owns nothing, and anything filed in its name would be
    // filed under the WINNER: its notation would point a legitimate citation
    // at a different leaf in a different file, and its cross-references would
    // enter the graph as edges the winner never declared. Both are worse than
    // the leaf simply not being there, which is what a losing mint means.
    if (indexRecord(ctx, 'leaves', identity, file, idPath, entry)) {
      for (const alias of keys.slice(1)) indexAlias(ctx, alias, identity, file);
      collectRefs(ctx, 'knowledge-leaf', identity, file, '', record);
    }
  }
}

/** Pointer index: source-of-truth path → concept ids (KK-06 reverse lookup). */
function buildPointers(ctx) {
  const pointers = new Map();
  for (const { id, record } of ctx.concepts.values()) {
    if (!Array.isArray(record['source-of-truth'])) continue;
    for (const path of record['source-of-truth']) {
      if (typeof path !== 'string') continue;
      if (!pointers.has(path)) pointers.set(path, []);
      const ids = pointers.get(path);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  for (const ids of pointers.values()) ids.sort(compare);
  return sortedMap(pointers);
}

/** Resolve every collected edge; a miss is an unresolved-ref error. */
function resolveRefs(ctx) {
  for (const ref of ctx.refs) {
    const store = SPACE_TO_STORE[ref.space];
    // An alias resolves exactly as an identity does: both citation forms are
    // legal, so neither is a second-class lookup (UCS-1144). The alias index
    // is reached through SPACE_ALIASES, so this line never names a space.
    const aliases = ctx[SPACE_ALIASES[ref.space]];
    ref.resolved = ctx[ref.space].has(ref.to)
      || !!aliases?.has(ref.to)
      || ctx.declared[store].has(ref.to);
    if (!ref.resolved) {
      ctx.diagnostics.push({
        severity: 'error', code: 'unresolved-ref', file: ref.file, path: ref.path,
        message: `${ref.type} ref "${ref.to}" does not resolve to any ${store} entry or catalog-declared id`,
      });
    }
    delete ref.space;
  }
  ctx.refs.sort((a, b) =>
    compare(a.from, b.from) || compare(a.type, b.type) || compare(a.to, b.to) || compare(a.path, b.path));
}

/**
 * Load the three stores under `root` into the indexed model described above.
 * @param {string} root kit root directory (the dir containing ontology/,
 *   knowledge/, decisions/ — absent stores yield missing-store warnings)
 * @returns the model; `model.ok` is the single health verdict every
 *   downstream surface shares
 */
export function loadStores(root) {
  const absRoot = resolve(root);
  if (!statSync(absRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`store root is not a readable directory: ${absRoot}`);
  }
  const ctx = {
    root: absRoot,
    stores: {
      ontology: { present: false, catalog: null, rules: null, files: [] },
      knowledge: { present: false, catalog: null, rules: null, files: [] },
      decisions: { present: false, catalog: null, rules: null, files: [] },
    },
    declared: { ontology: new Set(), knowledge: new Set(), decisions: new Set() },
    concepts: new Map(),
    leaves: new Map(),
    leafAliases: new Map(),
    decisions: new Map(),
    refs: [],
    diagnostics: [],
  };

  for (const store of Object.keys(ctx.stores)) {
    const meta = ctx.stores[store];
    meta.present = !!statSync(join(absRoot, store), { throwIfNoEntry: false })?.isDirectory();
    if (!meta.present) {
      ctx.diagnostics.push({
        severity: 'warning', code: 'missing-store', file: store, path: '',
        message: `store directory "${store}/" is absent — loading proceeds; refs into it cannot resolve`,
      });
      continue;
    }
    loadCatalogAndRules(ctx, store, store !== 'decisions'); // decisions has no _rules.yaml (§9.1)
  }
  if (ctx.stores.ontology.present) loadEntriesFiles(ctx, 'ontology', 'classes', 'ontology-concept', 'concepts');
  if (ctx.stores.knowledge.present) loadLeafFiles(ctx);
  if (ctx.stores.decisions.present) loadEntriesFiles(ctx, 'decisions', 'entries', 'decision-entry', 'decisions');

  const pointers = buildPointers(ctx);
  resolveRefs(ctx);
  ctx.diagnostics.sort((a, b) =>
    compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code));

  return {
    root: absRoot,
    stores: ctx.stores,
    concepts: sortedMap(ctx.concepts),
    leaves: sortedMap(ctx.leaves),
    leafAliases: sortedMap(ctx.leafAliases),
    decisions: sortedMap(ctx.decisions),
    pointers,
    refs: ctx.refs,
    diagnostics: ctx.diagnostics,
    ok: ctx.diagnostics.every((d) => d.severity !== 'error'),
  };
}

/**
 * Loader diagnostics summarized on the one scale every downstream surface
 * shares — validator, value check, and preflight report store health from
 * this single shape, so they can never disagree about it (PRD §4).
 */


/**
 * Store health — the ONE authority (UCS-939/945/951).
 *
 * The validator, the reverse audit and preflight can never disagree about a
 * Store, because they all ask this function rather than each filtering
 * `model.diagnostics` themselves. It once reported only counts, which is not
 * what any caller needed, so seven sites reached past it and the resolver
 * re-declared its own copy. A seam too narrow to be used is a seam that gets
 * walked around.
 *
 * Derived from `model.ok` and `model.diagnostics` — the single health model —
 * and from nothing else. `ok` is the loader's verdict, never recomputed from
 * the counts: a surface that recomputed it would BE a second health model.
 *
 * @param {object} model a loaded store model
 * @returns {{ ok: boolean, errors: object[], warnings: object[], errorCount: number, warningCount: number }}
 */
export function storeHealth(model) {
  const errors = model.diagnostics.filter((d) => d.severity === 'error');
  const warnings = model.diagnostics.filter((d) => d.severity === 'warning');
  return {
    ok: model.ok,
    errors,
    warnings,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}

/**
 * The wire shape of store health: counts, not Diagnostics. Every surface's
 * `store-health` JSON key is this, and it has looked like this since KK-04.
 *
 * It takes the HEALTH, never the model — so it is a projection of the one
 * authority and cannot become a second derivation of it. That is the whole
 * point: `healthSummary(storeHealth(model))` reads as what it is.
 *
 * @param {{ ok: boolean, errorCount: number, warningCount: number }} health
 * @returns {{ ok: boolean, errors: number, warnings: number }}
 */
export function healthSummary(health) {
  return { ok: health.ok, errors: health.errorCount, warnings: health.warningCount };
}

/**
 * A --concepts id the ontology does not carry — a check that never ran.
 * A usage error: the caller named something that does not exist, so the command
 * refused its arguments rather than failing mid-run. Exit 2, never 1.
 */
export class UnknownConceptsError extends UsageError {
  name = 'UnknownConceptsError';
}

/**
 * The `--concepts` grammar, settled in one place (UCS-935).
 *
 * Ids are trimmed, empties dropped, duplicates collapsed, order stable. Every
 * surface taking the flag reads it the same way, because a filter that means
 * two different things is worse than no filter: the structural validator used
 * to accept `" K-101 "` while the value validator rejected the same argument
 * as a check that never ran, so a CI pipeline that padded its arguments got a
 * clean pass from one gate and a blocking defect from the other.
 *
 * Returns the normalized ids. Whether an EMPTY result is an error is the
 * caller's policy, not the grammar's: the validators refuse it (a filter that
 * names nothing never ran), while preflight reads it as store-health-only.
 *
 * @param {string[]} raw ids as spelled on the command line, pre-split on commas
 * @returns {string[]} trimmed, de-duplicated, stably sorted ids
 */
export function normalizeConceptIds(raw) {
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))].sort(compare);
}

/**
 * Select concepts by id (null/undefined = every concept). An unknown id
 * throws UnknownConceptsError: a verdict or finding set "filtered" to a typo
 * would be a check that never ran reading as a silent pass (PRD §5). Every
 * --concepts consumer shares this contract from here.
 */
export function selectConcepts(model, ids) {
  if (!ids) return [...model.concepts.values()];
  const unknown = ids.filter((id) => !model.concepts.has(id));
  if (unknown.length) {
    throw new UnknownConceptsError(`--concepts names id(s) not in the ontology: ${unknown.join(', ')} — a check that never ran is a blocking defect, never a silent pass (PRD §5)`);
  }
  return ids.map((id) => model.concepts.get(id));
}


/**
 * §3.5: draft/proposed concepts get structural checks only — the value check
 * skips them and preflight verdicts them unknown. One predicate, so the two
 * surfaces can never diverge on which statuses that means.
 */
export const isPrePromotionStatus = (status) => status === 'draft' || status === 'proposed';
