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
 *   - every store file carries an integer schema-version >= 1; any defect
 *     there is normalized to `invalid-schema-version`. Evolution is
 *     additive-only (D-013 generalized).
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
  'enumerates-source-not-listed',
]);

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

function resolveRef(root, ref) {
  if (ref === '#') return root;
  const match = /^#\/\$defs\/([^/]+)$/.exec(ref);
  const target = match && root.$defs?.[match[1]];
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
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
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
      if (!(required in value)) {
        errors.push({
          path: joinPath(path, required),
          code: 'missing-required',
          message: `required property "${required}" is missing`,
        });
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, propertyValue] of Object.entries(value)) {
      if (key in properties) {
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
  const sourceOfTruth = Array.isArray(record['source-of-truth'])
    ? record['source-of-truth'].filter((entry) => typeof entry === 'string')
    : [];
  record.enumerates.forEach((descriptor, i) => {
    if (!isPlainObject(descriptor)) return;
    const descriptorPath = joinPath(basePath, `enumerates[${i}]`);
    if (Array.isArray(descriptor.values)) {
      descriptor.values.forEach((value, j) => {
        if (typeof value !== 'string') {
          errors.push({
            path: `${descriptorPath}.values[${j}]`,
            code: 'non-string-enumerates-value',
            message: `enumerates values are strings compared byte-exact and case-sensitive (§3.5); got ${describe(value)} (${JSON.stringify(value)}) — YAML coerces bare scalars like true/1.0/null, so quote the value in the store file`,
          });
        }
      });
    }
    if (typeof descriptor.source === 'string' && !sourceOfTruth.includes(descriptor.source)) {
      errors.push({
        path: `${descriptorPath}.source`,
        code: 'enumerates-source-not-listed',
        message: `enumerates source ${JSON.stringify(descriptor.source)} must name a listed source-of-truth entry (§3.5: first entry is the primary owner, the rest are secondary references)`,
      });
    }
  });
}

/**
 * Dedupe (convention codes own their paths over generic schema codes),
 * normalize schema-version defects to one code, and stable-sort.
 */
function finish(errors) {
  const conventionPaths = new Set(
    errors
      .filter((e) => e.code === 'non-string-enumerates-value')
      .map((e) => e.path),
  );
  const cleaned = errors
    .filter((e) => e.code === 'non-string-enumerates-value' || !conventionPaths.has(e.path))
    .map((e) => (e.path === 'schema-version'
      ? { ...e, code: 'invalid-schema-version', message: `${e.message} — every store file carries an integer schema-version >= 1 (§3.5)` }
      : e));
  cleaned.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  return { ok: cleaned.length === 0, errors: cleaned };
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
  if (kind === 'ontology-concept') conceptConventions(record, '', errors);
  return finish(errors);
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
  if (kind === 'ontology-concept' && isPlainObject(doc) && Array.isArray(doc.entries)) {
    doc.entries.forEach((entry, i) => conceptConventions(entry, `entries[${i}]`, errors));
  }
  return finish(errors);
}
