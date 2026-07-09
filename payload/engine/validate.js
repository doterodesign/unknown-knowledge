#!/usr/bin/env node
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
import { loadStores, locateKitRoot, storeHealth } from './lib/load-stores.js';
import { EXIT_CODES } from './lib/exit-codes.js';
import { compare } from './lib/validate-record.js';

const USAGE = 'usage: node payload/engine/validate.js [--json] [--root <dir>] [--concepts <ids>]';

/** Every check class this validator runs, sorted — reported on every run. */
export const CHECKS = Object.freeze([
  'id-range', 'id-shape', 'index-drift', 'missing-citation',
  'missing-path', 'orphan', 'ref-cycle',
]);

/** Store → catalog id grammar (§3.5; record-level ids are schema-checked). */
const ID_GRAMMARS = Object.freeze({
  ontology: { pattern: /^K-[0-9]+$/, hint: 'K-NNN' },
  knowledge: { pattern: /^[0-9]+(\.[0-9]+)*$/, hint: 'dotted notation, e.g. "362.1"' },
  decisions: {
    pattern: /^D-([0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)$/,
    hint: 'D-NNN or provisional D-YYYY-MM-DD-slug',
  },
});

/** The §3 documented mid-import marker a catalog row carries instead of a file. */
const PENDING_MARKER = 'pending-import';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

class UsageError extends Error {}

// -------------------------------------------------------------- the checks

/** Catalog rows: id grammar (id-shape) + row↔file agreement (index-drift). */
function checkCatalogs(model, push) {
  // What each loaded file actually contains — the fact the index must match.
  const idsByFile = new Map();
  const addTo = (file, id) => {
    if (!idsByFile.has(file)) idsByFile.set(file, new Set());
    idsByFile.get(file).add(id);
  };
  for (const { id, file } of model.concepts.values()) addTo(file, id);
  for (const { notation, file } of model.leaves.values()) addTo(file, notation);
  for (const { id, file } of model.decisions.values()) addTo(file, id);

  for (const store of ['decisions', 'knowledge', 'ontology']) {
    const catalog = model.stores[store].catalog;
    if (!isObject(catalog) || !Array.isArray(catalog.entries)) continue; // absent/invalid: loader diagnosed
    const grammar = ID_GRAMMARS[store];
    catalog.entries.forEach((row, i) => {
      if (!isObject(row) || typeof row.id !== 'string' || typeof row.file !== 'string') return;
      if (!grammar.pattern.test(row.id)) {
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
  const spaces = [
    ['ontology', model.concepts, 'id'],
    ['knowledge', model.leaves, 'notation'],
    ['decisions', model.decisions, 'id'],
  ];
  for (const [store, records, idPath] of spaces) {
    if (!model.stores[store].catalog) continue; // no catalog loaded: loader diagnosed
    for (const [id, { file }] of records) {
      if (!declared[store].has(id)) {
        push({
          severity: 'error', code: 'orphan', id, file, path: idPath,
          message: `"${id}" is not declared in ${store}/_catalog.yaml — unreachable through the store's navigational entry point (§3)`,
        });
      }
    }
  }
}

/** Leaf citations must carry a non-empty source (§3.2). */
function checkCitations(model, push) {
  for (const { notation, file, record } of model.leaves.values()) {
    if (!Array.isArray(record.citations)) continue; // presence is a schema check
    record.citations.forEach((c, i) => {
      if (isObject(c) && typeof c.source === 'string' && c.source.trim() === '') {
        push({
          severity: 'error', code: 'missing-citation', id: notation, file,
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
  checkCitations(model, push);
  checkDecisionCycles(model, push);
  findings.sort((a, b) =>
    compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code) || compare(a.id, b.id));
  return findings;
}

// ------------------------------------------------------------- CLI plumbing

function parseArgs(argv) {
  const opts = { json: false, root: process.cwd(), concepts: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // Both conventional flag spellings: `--flag value` and `--flag=value`.
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (flag === '--json') {
      if (eq !== -1) throw new UsageError('--json takes no value');
      opts.json = true;
    } else if (flag === '--root' || flag === '--concepts') {
      let value;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new UsageError(`${flag} requires a value`);
        }
        i += 1;
      }
      if (flag === '--root') opts.root = value;
      else opts.concepts = [...(opts.concepts ?? []), ...value.split(',')];
    } else if (arg.startsWith('--')) {
      throw new UsageError(`unknown flag ${arg}`);
    } else {
      throw new UsageError(`unexpected argument "${arg}" — validate takes flags only`);
    }
  }
  if (opts.concepts) {
    opts.concepts = [...new Set(opts.concepts.map((s) => s.trim()).filter(Boolean))].sort(compare);
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

function main(argv) {
  try {
    const opts = parseArgs(argv);

    let model;
    try {
      // KK-08 two-root convention: --root is the REPO root; the stores live
      // at <root>/unknown-knowledge/ when seeded (§9.1) or at the root itself
      // (dogfood layout). Pointers stay repo-root-relative either way.
      model = loadStores(locateKitRoot(opts.root));
    } catch (error) {
      process.stderr.write(`validate: ${error.message}\n`);
      return EXIT_CODES.FAILURE;
    }

    // Single health model (PRD §4): loader errors mean the stores this
    // validator would check never fully loaded — its structural checks never
    // ran, and a check that never ran is a blocking defect (exit 2), never a
    // silent pass or a partial findings list.
    if (!model.ok) {
      const errors = model.diagnostics.filter((d) => d.severity === 'error');
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
      'store-health': storeHealth(model),
      counts: {
        errors: findings.filter((f) => f.severity === 'error').length,
        warnings: findings.filter((f) => f.severity === 'warning').length,
      },
      findings,
    };

    const lines = opts.json ? [JSON.stringify(payload, null, 2)] : render(payload);
    process.stdout.write(`${lines.join('\n').replace(/\n+$/, '')}\n`);
    return payload.counts.errors ? EXIT_CODES.FINDINGS : EXIT_CODES.CLEAN;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`validate: ${error.message}\n${USAGE}\n`);
      return EXIT_CODES.FAILURE;
    }
    // A crash mid-check means the checks never finished. An uncaught throw
    // would exit 1 — the FINDINGS code — so a broken run would read as
    // "findings present" instead of "check never ran" (blocking defect, PRD §5).
    process.stderr.write(`validate: internal failure — checks did not complete\n${error.stack || error.message}\n`);
    return EXIT_CODES.FAILURE;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // exitCode, never process.exit(): exit() drops queued async stdout writes,
  // so piped --json output would truncate at the ~64KB pipe buffer (corrupt
  // JSON with exit 0). Node exits on its own once stdout drains.
  process.exitCode = main(process.argv.slice(2));
}
