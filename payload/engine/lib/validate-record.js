/**
 * Schema validation for store records (KK-02) — the layer the store loader
 * (KK-04) calls before indexing anything.
 *
 * The formal contract lives in ../../schemas/*.schema.json (JSON Schema
 * draft 2020-12, consumable by any external tool). This module interprets
 * those documents directly — no schema library (D-002: js-yaml and little
 * else) — supporting exactly the subset the schemas use: type, required,
 * properties, additionalProperties:false, items, enum, pattern, minItems,
 * minimum, and $ref into #/$defs.
 *
 * On top of the schemas it enforces the PRD §3.5 conventions JSON Schema
 * cannot express record-locally:
 *   - enumerates values are strings, byte-exact, case-sensitive, as sets;
 *     non-string scalars hard-error (`non-string-enumerates-value`) — the
 *     YAML 1.1 coercion trap. Callers must parse YAML with types intact
 *     (js-yaml default schema) and pass the parsed document unchanged.
 *   - multi-entry source-of-truth: the first entry is the primary owner,
 *     additional entries are secondary references; every enumerates
 *     descriptor's source must name a listed entry
 *     (`enumerates-source-not-listed`).
 *   - every store file carries an integer schema-version >= 1; value defects
 *     there are normalized to `invalid-schema-version` (a stray record-level
 *     key stays `unknown-property` — the fix is to remove it, not retype it).
 *     Evolution is additive-only (D-013 generalized).
 *
 * Diagnostics carry a closed set of typed codes (PRD §5: protocol conduct
 * keys on codes, not prose) and are stable-sorted by path then code so
 * run-over-run diffs mean something.
 */
import { readFileSync } from 'node:fs';

/** Record kind → schema document shipped in payload/schemas/. */
const KIND_SCHEMA_FILES = Object.freeze({
  'ontology-concept': 'ontology-concept.schema.json',
  'knowledge-leaf': 'knowledge-leaf.schema.json',
  'decision-entry': 'decision-entry.schema.json',
  'finding': 'finding.schema.json',
  'miss': 'miss.schema.json',
  'gap': 'gap.schema.json',
  'catalog': 'catalog.schema.json',
  'rules': 'rules.schema.json',
});

export const KINDS = Object.freeze(Object.keys(KIND_SCHEMA_FILES));

export const ERROR_CODES = Object.freeze([
  'wrong-type',
  'missing-required',
  'unknown-property',
  'invalid-enum-value',
  'pattern-mismatch',
  'too-few-items',
  'out-of-range',
  'invalid-schema-version',
  'non-string-enumerates-value',
  'duplicate-enumerates-value',
  'enumerates-source-not-listed',
  'lifecycle-field-mismatch',
]);

/**
 * The JSON Schema subset this module interprets. Schemas must not use
 * keywords outside this set — an unenforced keyword is silent contract
 * drift (tests/store-schemas.test.js walks every schema against it).
 */
export const SUPPORTED_KEYWORDS = Object.freeze([
  '$schema', '$id', '$defs', '$ref',
  'title', 'description',
  'type', 'required', 'properties', 'additionalProperties',
  'items', 'enum', 'pattern', 'minItems', 'minimum',
]);

/**
 * Lexicographic comparator shared by every engine surface that emits
 * stable-sorted, diffable output (PRD §5) — one ordering, one copy.
 */
export const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const schemaCache = new Map();

function schemaFor(kind) {
  const file = KIND_SCHEMA_FILES[kind];
  if (!file) {
    throw new TypeError(`unknown record kind "${kind}" (expected one of: ${KINDS.join(', ')})`);
  }
  if (!schemaCache.has(kind)) {
    const url = new URL(`../../schemas/${file}`, import.meta.url);
    schemaCache.set(kind, JSON.parse(readFileSync(url, 'utf8')));
  }
  return schemaCache.get(kind);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date (quote it)';
  return typeof value;
}

function typeMatches(type, value) {
  if (Array.isArray(type)) return type.some((t) => typeMatches(t, value));
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return isPlainObject(value);
    case 'null': return value === null;
    default: throw new Error(`schema uses unsupported type "${type}"`);
  }
}

function joinPath(base, key) {
  return base ? `${base}.${key}` : key;
}

const regexCache = new Map();

function regexFor(pattern) {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern);
    regexCache.set(pattern, re);
  }
  return re;
}

const refCache = new WeakMap();

function resolveRef(root, ref) {
  if (ref === '#') return root;
  let refs = refCache.get(root);
  if (!refs) {
    refs = new Map();
    refCache.set(root, refs);
  }
  let target = refs.get(ref);
  if (target === undefined) {
    const match = /^#\/\$defs\/([^/]+)$/.exec(ref);
    target = (match && root.$defs?.[match[1]]) ?? null;
    refs.set(ref, target);
  }
  if (!target) throw new Error(`schema $ref "${ref}" does not resolve`);
  return target;
}

/** Interpret the supported JSON Schema subset against a value. */
function check(root, schema, value, path, errors) {
  if (schema.$ref) {
    check(root, resolveRef(root, schema.$ref), value, path, errors);
    return;
  }
  if (schema.type && !typeMatches(schema.type, value)) {
    errors.push({
      path,
      code: 'wrong-type',
      message: `expected ${schema.type}, got ${describe(value)}`,
    });
    return; // deeper checks are meaningless on the wrong shape
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      path,
      code: 'invalid-enum-value',
      message: `${JSON.stringify(value)} is not one of: ${schema.enum.join(' | ')}`,
    });
  }
  if (schema.pattern && typeof value === 'string' && !regexFor(schema.pattern).test(value)) {
    errors.push({
      path,
      code: 'pattern-mismatch',
      message: `${JSON.stringify(value)} does not match ${schema.pattern}`,
    });
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    errors.push({
      path,
      code: 'out-of-range',
      message: `${value} is below the minimum of ${schema.minimum}`,
    });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path,
        code: 'too-few-items',
        message: `expected at least ${schema.minItems} item(s), got ${value.length}`,
      });
    }
    if (schema.items) {
      value.forEach((item, i) => check(root, schema.items, item, `${path}[${i}]`, errors));
    }
  }
  if (isPlainObject(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push({
          path: joinPath(path, required),
          code: 'missing-required',
          message: `required property "${required}" is missing`,
        });
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, propertyValue] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        check(root, properties[key], propertyValue, joinPath(path, key), errors);
      } else if (schema.additionalProperties === false) {
        errors.push({
          path: joinPath(path, key),
          code: 'unknown-property',
          message: `unknown property "${key}" (additive schema evolution edits the schema; unknown keys are typos)`,
        });
      }
    }
  }
}

/**
 * PRD §3.5 conventions on one ontology concept — the checks JSON Schema
 * cannot express record-locally.
 */
function conceptConventions(record, basePath, errors) {
  if (!isPlainObject(record) || !Array.isArray(record.enumerates)) return;
  const sourceOfTruth = new Set(Array.isArray(record['source-of-truth'])
    ? record['source-of-truth'].filter((entry) => typeof entry === 'string')
    : []);
  record.enumerates.forEach((descriptor, i) => {
    if (!isPlainObject(descriptor)) return;
    const descriptorPath = joinPath(basePath, `enumerates[${i}]`);
    if (Array.isArray(descriptor.values)) {
      const seen = new Set();
      descriptor.values.forEach((value, j) => {
        if (typeof value !== 'string') {
          errors.push({
            path: `${descriptorPath}.values[${j}]`,
            code: 'non-string-enumerates-value',
            message: `enumerates values are strings compared byte-exact and case-sensitive (§3.5); got ${describe(value)} (${JSON.stringify(value)}) — YAML coerces bare scalars like true/1.0/null, so quote the value in the store file`,
          });
        } else if (seen.has(value)) {
          errors.push({
            path: `${descriptorPath}.values[${j}]`,
            code: 'duplicate-enumerates-value',
            message: `duplicate enumerates value ${JSON.stringify(value)} — values are compared as sets (§3.5), so a duplicate is a malformed descriptor, never a bigger set`,
          });
        } else {
          seen.add(value);
        }
      });
    }
    if (typeof descriptor.source === 'string' && !sourceOfTruth.has(descriptor.source)) {
      errors.push({
        path: `${descriptorPath}.source`,
        code: 'enumerates-source-not-listed',
        message: `enumerates source ${JSON.stringify(descriptor.source)} must name a listed source-of-truth entry (§3.5: first entry is the primary owner, the rest are secondary references)`,
      });
    }
  });
}

/**
 * §3.4 lifecycle invariants on one log fragment (finding/miss/gap) — the
 * checks JSON Schema cannot express record-locally. The schema gate matches
 * what the transition helper (log-entry.js) enforces on its write path, so a
 * hand-edited fragment can't carry an inconsistent lifecycle:
 *   - verified ⇔ status resolved (both directions)
 *   - rejected ⇒ non-empty reason; reason travels only with rejected
 */
function lifecycleConventions(record, basePath, errors) {
  if (!isPlainObject(record) || typeof record.status !== 'string') return;
  const { status } = record;
  if (Object.hasOwn(record, 'verified') !== (status === 'resolved')) {
    errors.push({
      path: joinPath(basePath, 'verified'),
      code: 'lifecycle-field-mismatch',
      message: status === 'resolved'
        ? 'a resolved entry carries the verified date the validator re-run stamped (§8)'
        : `verified travels only with status "resolved", not ${JSON.stringify(status)} — re-opening drops it (§8)`,
    });
  }
  const hasReason = typeof record.reason === 'string' && record.reason !== '';
  if (status === 'rejected' ? !hasReason : Object.hasOwn(record, 'reason')) {
    errors.push({
      path: joinPath(basePath, 'reason'),
      code: 'lifecycle-field-mismatch',
      message: status === 'rejected'
        ? 'rejecting requires a non-empty reason — rejections record the reason (§8)'
        : `reason travels only with status "rejected", not ${JSON.stringify(status)} — re-opening drops it (§8)`,
    });
  }
}

/** Record-local convention checks, keyed by kind (one lookup, both entry points). */
const CONVENTIONS = Object.freeze({
  'ontology-concept': conceptConventions,
  finding: lifecycleConventions,
  miss: lifecycleConventions,
  gap: lifecycleConventions,
});

/**
 * schema-version defects where the envelope legitimately carries the key are
 * normalized to `invalid-schema-version`. Only value defects qualify — an
 * `unknown-property` at that path means the key is misplaced (it belongs on
 * the store-file envelope), which is the opposite remediation.
 */
const SCHEMA_VERSION_VALUE_DEFECTS = new Set(['wrong-type', 'missing-required', 'out-of-range']);

/**
 * Dedupe (convention codes own their paths over generic schema codes),
 * normalize schema-version value defects to one code, and stable-sort.
 */
function finish(errors, { fileEnvelope }) {
  const conventionPaths = new Set(
    errors
      .filter((e) => e.code === 'non-string-enumerates-value')
      .map((e) => e.path),
  );
  const cleaned = errors
    .filter((e) => e.code === 'non-string-enumerates-value' || !conventionPaths.has(e.path))
    .map((e) => (fileEnvelope && e.path === 'schema-version' && SCHEMA_VERSION_VALUE_DEFECTS.has(e.code)
      ? { ...e, code: 'invalid-schema-version', message: `${e.message} — every store file carries an integer schema-version >= 1 (§3.5)` }
      : e));
  cleaned.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
  return { ok: cleaned.length === 0, errors: cleaned };
}

function runConventions(kind, record, basePath, errors) {
  CONVENTIONS[kind]?.(record, basePath, errors);
}

/**
 * Validate a single record of the given kind against its shipped schema.
 * For one-record-per-file kinds (knowledge-leaf, finding, catalog, rules)
 * the record is the whole store file, schema-version included.
 *
 * @param {string} kind one of KINDS
 * @param {unknown} record the YAML document (or entry), parsed with types intact
 * @returns {{ ok: boolean, errors: Array<{path: string, code: string, message: string}> }}
 */
export function validateRecord(kind, record) {
  const schema = schemaFor(kind);
  const errors = [];
  check(schema, schema, record, '', errors);
  runConventions(kind, record, '', errors);
  // One-record-per-file kinds ARE the store file (schema-version at the root);
  // multi-entry kinds carry it on the envelope, not the record.
  return finish(errors, { fileEnvelope: !schema.$defs?.storeFile });
}

/**
 * Validate a whole store file of the given kind. Multi-entry kinds
 * (ontology-concept, decision-entry) are wrapped in the $defs/storeFile
 * envelope ({ schema-version, entries: [...] }); one-record-per-file kinds
 * validate as the record itself.
 *
 * @param {string} kind one of KINDS
 * @param {unknown} doc the parsed store file
 * @returns {{ ok: boolean, errors: Array<{path: string, code: string, message: string}> }}
 */
export function validateStoreFile(kind, doc) {
  const schema = schemaFor(kind);
  const fileSchema = schema.$defs?.storeFile;
  if (!fileSchema) return validateRecord(kind, doc);
  const errors = [];
  check(schema, fileSchema, doc, '', errors);
  if (isPlainObject(doc) && Array.isArray(doc.entries)) {
    doc.entries.forEach((entry, i) => runConventions(kind, entry, `entries[${i}]`, errors));
  }
  return finish(errors, { fileEnvelope: true });
}
