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
 *     leaves:    Map notation -> { notation, file, record, body },
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

export const SEVERITIES = Object.freeze(['error', 'warning']);

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

/** Typed cross-references per store record shape (§3.1–3.3): field → id space. */
const REF_FIELDS = {
  'ontology-concept': [
    { field: 'used-by', space: 'concepts' },
    { field: 'confusable-with', space: 'concepts' },
    { field: 'rationale', space: 'decisions' },
  ],
  'knowledge-leaf': [
    { field: ['cross-references', 'class-elsewhere'], space: 'leaves' },
    { field: ['cross-references', 'see-also'], space: 'leaves' },
  ],
  'decision-entry': [
    { field: 'supersedes', space: 'decisions' },
    { field: 'superseded-by', space: 'decisions' },
    { field: ['relates-to', 'concepts'], space: 'concepts' },
    { field: ['relates-to', 'leaves'], space: 'leaves' },
    { field: ['relates-to', 'decisions'], space: 'decisions' },
  ],
};

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

/** Index one record by id; the second mint of an id is a duplicate-id error. */
function indexRecord(ctx, space, id, file, path, entry) {
  if (typeof id !== 'string') return; // shape defects already diagnosed by KK-02
  const existing = ctx[space].get(id);
  if (existing) {
    ctx.diagnostics.push({
      severity: 'error', code: 'duplicate-id', file, path,
      message: `id "${id}" is already minted in ${existing.file} — published ids are immutable; the later PR renumbers its own entry (§3.5)`,
    });
    return;
  }
  ctx[space].set(id, entry);
}

/** Collect the typed ref edges of one record (strings only; resolution later). */
function collectRefs(ctx, kind, from, file, basePath, record) {
  for (const { field, space } of REF_FIELDS[kind]) {
    const [head, tail] = Array.isArray(field) ? field : [field, null];
    const list = tail ? (isObject(record[head]) ? record[head][tail] : null) : record[head];
    if (!Array.isArray(list)) continue;
    const type = tail ? `${head}.${tail}` : head;
    list.forEach((to, i) => {
      if (typeof to !== 'string') return; // wrong-type already diagnosed
      const path = basePath ? `${basePath}.${type}[${i}]` : `${type}[${i}]`;
      ctx.refs.push({ from, type, to, file, path, space });
    });
  }
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
    indexRecord(ctx, 'leaves', record.notation, file, 'notation', {
      notation: record.notation, file, record, body: match[2],
    });
    if (typeof record.notation === 'string') {
      collectRefs(ctx, 'knowledge-leaf', record.notation, file, '', record);
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
  const spaceToStore = { concepts: 'ontology', leaves: 'knowledge', decisions: 'decisions' };
  for (const ref of ctx.refs) {
    const store = spaceToStore[ref.space];
    ref.resolved = ctx[ref.space].has(ref.to) || ctx.declared[store].has(ref.to);
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
export function storeHealth(model) {
  return {
    ok: model.ok,
    errors: model.diagnostics.filter((d) => d.severity === 'error').length,
    warnings: model.diagnostics.filter((d) => d.severity === 'warning').length,
  };
}

/** A --concepts id the ontology does not carry — a check that never ran. */
export class UnknownConceptsError extends Error {}

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
