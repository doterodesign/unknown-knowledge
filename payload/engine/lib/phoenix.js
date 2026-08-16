/**
 * Phoenix events — governed bulk re-taxonomy (UCS-1154).
 *
 * A subtree's classification drifts. The material did not change; the shape we
 * file it under did. A phoenix event rewrites that subtree's facets in bulk,
 * bumps the `edition` of every leaf it touches, and lands as an ordinary PR:
 * a reviewable diff, not a migration project.
 *
 * Three properties make that claim true rather than aspirational, and this
 * module exists to enforce all three.
 *
 * CITATIONS ARE UNTOUCHED BY CONSTRUCTION. Identity is the accession id, and a
 * phoenix event never changes one. Nothing that cites a leaf has to chase its
 * reclassification, so a decisions entry written against edition 1 is still
 * valid at edition 2 — it names the leaf, not the shelf. The rewriter below
 * makes this structural rather than careful: it replaces individual frontmatter
 * LINES and copies every other byte of the file through untouched, so the
 * citations block cannot change even if this module has a bug.
 *
 * THE MAPPING IS LEAF-GRANULAR, because a class-level rule cannot express a
 * SPLIT. When `sportsbook/odds-feed` divides into `feeds/ingest` and
 * `feeds/settlement`, no rename rule says which leaf went where — only a
 * per-accession table can, and the `why` on each row is the whole substance of
 * the review.
 *
 * IT IS ALL-OR-NOTHING. Every check runs against the whole mapping BEFORE a
 * single byte is written, and any finding refuses the entire event. A partial
 * apply would leave the store in a state no mapping describes — half
 * re-taxonomized, with editions that agree with nothing — and that state is
 * strictly worse than not having started, because the next run cannot tell
 * which leaves already moved.
 *
 * Findings, not exceptions: a mapping that misses a leaf is a defect its author
 * fixes, which is exit 1 under the engine's contract (PRD §5). Exit 2 stays
 * what it has always been — the run never happened.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compare } from './validate-record.js';
import { PHOENIX_DIR } from './load-stores.js';

/** The frontmatter field a phoenix event bumps — the ONLY thing that bumps it. */
export const EDITION_FIELD = 'edition';

/**
 * The edition every leaf starts at.
 *
 * A leaf is born at edition 1 and stays there until an event moves it. So
 * "edition > 1" and "a phoenix event touched this leaf" are the same claim,
 * which is what lets the validator check the second by reading the first.
 */
export const FIRST_EDITION = 1;

/**
 * Every check class the phoenix gate runs, sorted — reported on every run, so
 * a clean result names what it checked rather than only what it found.
 */
export const CHECKS = Object.freeze([
  'edition-conflict', 'facet-unminted', 'scope-unaccounted',
  'unknown-leaf', 'unreadable-leaf', 'unrewritable-leaf',
]);

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Read a dotted field path out of a record, without inventing intermediates.
 *
 * @param {object} record
 * @param {string} path a dotted path, e.g. `facets.domain`
 * @returns {unknown} the value, or undefined if any segment is missing
 */
export function valueAt(record, path) {
  let node = record;
  for (const segment of path.split('.')) {
    if (!isObject(node)) return undefined;
    node = node[segment];
  }
  return node;
}

/**
 * Does `value` fall inside a scope value?
 *
 * For a hierarchical facet a scope value claims its whole subtree, so
 * `sportsbook` claims `sportsbook/odds-feed`. Segment-wise rather than by
 * prefix string: `sportsbook-legacy` starts with `sportsbook` and is a
 * different class, and claiming it would silently widen the event's blast
 * radius past what the steward wrote down.
 *
 * @param {string} value the leaf's current facet value
 * @param {string} claimed a value listed in the event's scope
 * @returns {boolean}
 */
export function withinScope(value, claimed) {
  return value === claimed || value.startsWith(`${claimed}/`);
}

/**
 * Which leaves does this event's declared scope contain?
 *
 * The scope is stated as facet values, never as a list of ids: an event that
 * enumerated its own membership could not MISS a leaf, and missing a leaf is
 * exactly the defect the completeness gate exists to catch. So the engine
 * derives the membership from the store and holds the mapping against it.
 *
 * @param {object} model a loaded store model
 * @param {{ facet: string, values: string[] }} scope
 * @returns {Array<{ id: string, entry: object, value: string }>} sorted by id
 */
export function leavesInScope(model, scope) {
  const found = [];
  for (const [id, entry] of model.leaves) {
    const value = valueAt(entry.record, scope.facet);
    if (typeof value !== 'string') continue;
    if (scope.values.some((claimed) => withinScope(value, claimed))) {
      found.push({ id, entry, value });
    }
  }
  return found.sort((a, b) => compare(a.id, b.id));
}

/**
 * Rewrite one scalar frontmatter line, in place, byte-for-byte otherwise.
 *
 * This is the whole write strategy, and it is deliberately not "parse the YAML
 * and re-serialize it". Round-tripping through a YAML emitter would rewrite the
 * entire document: it reorders nothing but reformats everything — quoting
 * style, flow vs block sequences, blank lines, comments — so a one-field change
 * would land as a whole-file diff that no reviewer can read, and the claim
 * "citations are byte-identical" would become a thing to verify rather than a
 * thing that is true by construction.
 *
 * Instead: find the one line that declares this field at this indent, replace
 * the text after the colon, and leave every other byte of the file alone.
 * Field order, comments, quoting, spacing and the entire body survive because
 * they are never touched. In exchange this handles only scalar values on their
 * own line, which is what `edition` and every facet value are — anything else
 * is refused by `rewriteFailure` rather than guessed at.
 *
 * @param {string} text the file's full text
 * @param {string[]} path the field's path, e.g. ['facets','domain'] or ['edition']
 * @param {string} value the new scalar, already in its wire spelling
 * @returns {string|null} the rewritten text, or null if the line was not found
 */
export function rewriteScalarLine(text, path, value) {
  const lines = text.split('\n');
  // Frontmatter only: the body may legally contain a line that looks like a
  // field, and rewriting prose would be a corruption wearing a clean diff.
  let end = lines.length;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') { end = i; break; }
  }

  let depth = 0;
  let parentIndent = -1;
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    const match = /^(\s*)([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (!match) continue;
    const [, indent, key, rest] = match;
    if (depth > 0 && indent.length <= parentIndent) return null; // left the parent block
    if (key !== path[depth]) continue;
    if (depth === path.length - 1) {
      // A scalar sits on its own line. A nested block or a value this function
      // cannot see the end of is refused, not overwritten.
      if (rest.trim() === '') return null;
      lines[i] = `${indent}${key}: ${value}`;
      return lines.join('\n');
    }
    // Descend: the next segment must be nested under this key.
    if (rest.trim() !== '') return null; // a scalar where a block was expected
    parentIndent = indent.length;
    depth += 1;
  }
  return null;
}

/**
 * Why can this leaf not be rewritten? Null when it can.
 *
 * Runs during the gate, on every leaf the event would touch, so an unwritable
 * file is a finding BEFORE anything is written rather than a half-applied event
 * discovered partway through.
 *
 * @param {string} text the leaf file's text
 * @param {string} facet the scope facet, e.g. `facets.domain`
 * @returns {string|null} the field path that could not be rewritten
 */
export function rewriteFailure(text, facet) {
  const probe = (path, value) => rewriteScalarLine(text, path, value) === null;
  if (probe([EDITION_FIELD], '1')) return EDITION_FIELD;
  if (probe(facet.split('.'), 'x')) return facet;
  return null;
}

/**
 * Apply one event's rewrites to one leaf's text.
 *
 * @param {string} text the leaf file's text
 * @param {string} facet the scope facet
 * @param {string} to the new facet value
 * @param {number} edition the new edition
 * @returns {string|null} rewritten text, or null if either line was not found
 */
export function rewriteLeaf(text, facet, to, edition) {
  const withFacet = rewriteScalarLine(text, facet.split('.'), to);
  if (withFacet === null) return null;
  return rewriteScalarLine(withFacet, [EDITION_FIELD], String(edition));
}

/**
 * Plan a phoenix event: decide everything, write nothing.
 *
 * The whole all-or-nothing property lives here. This function answers "what
 * would this event do, and is it legal" in one pass over the mapping, and the
 * caller either writes every rewrite it returned or none of them. Nothing below
 * this line touches the filesystem except to READ.
 *
 * @param {object} model a loaded store model
 * @param {object} event a loaded phoenix mapping from `model.phoenix`
 * @returns {{ findings: object[], rewrites: object[], carried: string[] }}
 */
export function planEvent(model, event) {
  const findings = [];
  const rewrites = [];
  const carried = [];
  const { scope, rows, file } = event;
  const push = (f) => findings.push({ ...f, event: event.event });

  const inScope = leavesInScope(model, scope);
  const scoped = new Set(inScope.map((l) => l.id));

  // A row naming a leaf the store does not carry is a typo or a stale mapping,
  // and either way the event cannot be what its author believed it was.
  for (const [id, row] of rows) {
    if (model.leaves.has(id)) continue;
    push({
      severity: 'error', code: 'unknown-leaf', id, file, path: `leaves[${row.index}].id`,
      message: `event ${event.event} maps "${id}", which no leaf in this store carries — a mapping that names a leaf nobody can open describes an event that cannot be reviewed`,
    });
  }

  // A row naming a real leaf that is OUTSIDE the declared scope reaches past
  // what the event said it would touch. The scope is the reviewable claim; a
  // row beyond it makes the diff larger than the declaration.
  for (const [id, row] of rows) {
    const entry = model.leaves.get(id);
    if (!entry || scoped.has(id)) continue;
    const value = valueAt(entry.record, scope.facet);
    push({
      severity: 'error', code: 'unknown-leaf', id, file, path: `leaves[${row.index}].id`,
      message: `event ${event.event} maps "${id}", whose ${scope.facet} is ${JSON.stringify(value ?? null)} — outside the declared scope (${scope.values.join(', ')}), so the event would touch more than it declares`,
    });
  }

  // THE COMPLETENESS GATE. Every leaf in the declared scope must be accounted
  // for — moved, split, or explicitly carried forward. A leaf the mapping never
  // mentions is the rejection case the ticket names: it would keep a facet
  // value the event has just retired, leaving the store describing its own
  // taxonomy in two incompatible ways with nothing recording the disagreement.
  for (const { id, entry, value } of inScope) {
    if (rows.has(id)) continue;
    push({
      severity: 'error', code: 'scope-unaccounted', id, file: entry.file, path: scope.facet,
      message: `leaf "${id}" is in event ${event.event}'s declared scope (${scope.facet}: ${value}) and the mapping never mentions it — every leaf in scope must be mapped, split, or explicitly carried forward, and a phoenix event that leaves one behind is a partial re-taxonomy nobody reviewed`,
    });
  }

  for (const { id, entry, value } of inScope) {
    const row = rows.get(id);
    if (!row) continue;

    // Carried forward: considered, deliberately unmoved. No rewrite, and so no
    // edition bump — the edition records that a leaf CHANGED, and this one did
    // not. Bumping it anyway would make the edition count reviews, not moves.
    if (row.to === undefined || row.to === value) {
      carried.push(id);
      continue;
    }

    // The new value must already be minted. The registry is the governed
    // vocabulary (UCS-1148) and a phoenix event is not a way around it: an
    // event that could mint by writing would let a bulk rewrite invent
    // vocabulary that no decisions entry ever justified.
    const registryKey = FACET_REGISTRY[scope.facet];
    const registry = registryKey ? model.registries.get(registryKey) : null;
    const verdict = mintingVerdict(registry, registryKey, row.to);
    if (verdict) {
      push({
        severity: 'error', code: 'facet-unminted', id, file, path: `leaves[${row.index}].to`,
        message: `event ${event.event} moves "${id}" to ${scope.facet}: ${row.to}, but ${verdict}`,
      });
      continue;
    }

    const current = entry.record[EDITION_FIELD];
    if (current !== undefined && (!Number.isInteger(current) || current < FIRST_EDITION)) {
      push({
        severity: 'error', code: 'edition-conflict', id, file: entry.file, path: EDITION_FIELD,
        message: `leaf "${id}" carries ${EDITION_FIELD}: ${JSON.stringify(current)}, which is not an edition — a bump has nothing to count from`,
      });
      continue;
    }

    let text;
    try {
      text = readFileSync(join(model.root, entry.file), 'utf8');
    } catch (error) {
      push({
        severity: 'error', code: 'unreadable-leaf', id, file: entry.file, path: '',
        message: `leaf "${id}" could not be read, so the event cannot be applied to it: ${error.message}`,
      });
      continue;
    }

    // Probe the rewrite before committing to it. A leaf whose frontmatter this
    // rewriter cannot edit surgically must fail the GATE — discovering it
    // during the write loop is exactly the partial apply this design refuses.
    const unwritable = rewriteFailure(text, scope.facet);
    if (unwritable !== null) {
      push({
        severity: 'error', code: 'unrewritable-leaf', id, file: entry.file, path: unwritable,
        message: `leaf "${id}" has no plain "${unwritable}:" line in its front matter to rewrite — phoenix edits single scalar lines so every other byte, citations included, is carried through untouched, and it will not reformat a file to make room`,
      });
      continue;
    }

    const edition = (current ?? FIRST_EDITION) + 1;
    const next = rewriteLeaf(text, scope.facet, row.to, edition);
    if (next === null) {
      push({
        severity: 'error', code: 'unrewritable-leaf', id, file: entry.file, path: scope.facet,
        message: `leaf "${id}" could not be rewritten cleanly, so the event is refused rather than half-applied`,
      });
      continue;
    }
    rewrites.push({
      id, file: entry.file, from: value, to: row.to, edition, before: text, after: next,
    });
  }

  findings.sort((a, b) =>
    compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code) || compare(a.id, b.id));
  rewrites.sort((a, b) => compare(a.id, b.id));
  return { findings, rewrites, carried: carried.sort(compare) };
}

/**
 * Which registry governs each facet a phoenix event may re-taxonomize.
 *
 * Restated from the validator's FACET_REGISTRIES rather than imported, because
 * a command must not import another command (the engine's modules are the
 * shared layer). `tests/phoenix.test.js` pins the two against each other, so a
 * facet that gains a registry there cannot silently keep an old one here.
 */
export const FACET_REGISTRY = Object.freeze({
  'facets.domain': 'knowledge/domains',
  'facets.form': 'knowledge/form',
  'facets.anchor': 'knowledge/anchor',
  'facets.stage': 'knowledge/stage',
});

/**
 * Why can this value not be a phoenix target? Null when it can.
 *
 * Hierarchical registries mint each segment, so a target under an unminted
 * parent is refused segment-wise — the same judgment the structural validator
 * makes, so an applied event can never leave a store the validator rejects.
 *
 * @param {object|null} registry the loaded registry, or null if absent
 * @param {string} key the registry's `<store>/<name>` key
 * @param {string} value the proposed new facet value
 * @returns {string|null} the reason, phrased to complete "…but <reason>"
 */
function mintingVerdict(registry, key, value) {
  if (!registry) {
    return `the "${key}" registry is not in this store — a phoenix event moves leaves between governed values, it does not invent the vocabulary`;
  }
  const segments = registry.hierarchical ? value.split('/') : [value];
  for (let i = 0; i < segments.length; i += 1) {
    const path = registry.hierarchical ? segments.slice(0, i + 1).join('/') : value;
    if (registry.suppressed.has(path)) {
      return `"${path}" is SUPPRESSED in ${registry.file} — a refused value is not a destination`;
    }
    if (!registry.minted.has(path)) {
      return `"${path}" is not minted in ${registry.file} — mint it with its warrant and decisions entry in the same PR as the event`;
    }
  }
  return null;
}

/**
 * Write a planned event's rewrites. Called only after the gate found nothing.
 *
 * Separate from `planEvent` on purpose: the two halves of "validate everything,
 * then write" are two functions, so no future edit can interleave a write into
 * the checking loop without deleting this seam first.
 *
 * @param {string} root the store root the rewrites are relative to
 * @param {Array<{ file: string, after: string }>} rewrites
 */
export function applyRewrites(root, rewrites) {
  for (const rewrite of rewrites) {
    writeFileSync(join(root, rewrite.file), rewrite.after);
  }
}

/**
 * Every edition in the store that the retained phoenix mappings do not account
 * for (UCS-1154) — the check the structural validator runs.
 *
 * A leaf's edition is not a number an author may pick. It COUNTS the phoenix
 * events that moved this leaf, starting at 1, and a phoenix event is the only
 * thing that bumps it. So the store states the same fact twice — once in each
 * leaf's `edition`, once in the retained mappings — and this holds the two
 * against each other:
 *
 *   edition === 1 + (retained events that moved this leaf)
 *
 * An equality rather than a floor, deliberately. "At least one event mentions
 * this leaf" would accept `edition: 4` on a leaf one event moved once, which is
 * precisely the hand-typed number the rule exists to refuse — the check would
 * pass while the field it checks means nothing.
 *
 * Checkable from the WORKING TREE ALONE, which is why the mappings are retained
 * in `knowledge/_phoenix/` rather than living only in the PRs that applied them.
 * The validator sees a fresh clone with no history, and a governance rule it
 * could only verify by reading commits is a rule it does not verify.
 *
 * A carried-forward row does not count: it records that a leaf was considered
 * and deliberately left alone, so it cannot also be the warrant for an edition
 * that says the leaf changed.
 *
 * @param {object} model a loaded store model
 * @returns {Array<{ id: string, file: string, edition: number, events: string[], expected: number }>}
 *   sorted by id
 */
export function unaccountedEditions(model) {
  const movedBy = new Map();
  for (const [, event] of [...model.phoenix].sort((a, b) => compare(a[0], b[0]))) {
    for (const [id, row] of event.rows) {
      if (row.to === undefined) continue;
      if (!movedBy.has(id)) movedBy.set(id, []);
      movedBy.get(id).push(event.event);
    }
  }
  const unaccounted = [];
  for (const [id, entry] of model.leaves) {
    const edition = entry.record[EDITION_FIELD];
    // A missing or malformed edition is the schema's finding (KK-02), not this
    // check's — do not double-report.
    if (!Number.isInteger(edition)) continue;
    const events = movedBy.get(id) ?? [];
    const expected = FIRST_EDITION + events.length;
    if (edition === expected) continue;
    unaccounted.push({ id, file: entry.file, edition, events, expected });
  }
  return unaccounted.sort((a, b) => compare(a.id, b.id));
}

/**
 * The store-relative path an event's mapping lives at.
 *
 * @param {string} store the store carrying the event
 * @param {string} event the event id
 * @returns {string}
 */
export const phoenixPath = (store, event) => `${store}/${PHOENIX_DIR}/${event}.yaml`;
