/**
 * The `ask` service: index loading, the retrieval tier and the payload each
 * mode returns. Shared by the CLI (commands/ask.js) and the engine API
 * (`record.ask`), so both transports give the same bytes for the same request.
 */
import { watch } from 'node:fs';
import { basename } from 'node:path';
import { healthSummary, loadStores, storeHealth } from './load-stores.js';
import { locateKitRoot } from './kit-root.js';
import { buildIndex, ask, queryTerms } from './ask.js';
import { aggregate, describeFields } from './aggregate.js';

/**
 * Turn the ranking signals into a RETRIEVAL tier the agent acts on.
 *
 *   covered   the top records are about everything the question asks; read
 *             them next.
 *   partial   related records exist but part of the question found nothing;
 *             read them and treat the uncovered part as a likely gap.
 *   none      the stores do not appear to hold this topic; say so, do not
 *             guess, and follow the scoped fallback.
 *
 * This is confidence that the RIGHT RECORDS were found, never that they hold
 * the answer. On the development gold set, questions whose specific fact is
 * missing score the same coverage as answerable ones, because the knowledge
 * base does cover their topic. Whether the records answer the question is the
 * reader's judgment after reading them (protocol/AGENTS.md, RESOLVE).
 *
 * A bare ID lookup (`exact-id`) is covered when every requested ID was found.
 * The command reports `unavailable` instead of calling this when a store did
 * not load cleanly.
 *
 * Signals (lib/ask.js): `topCoverage` and `coverage` are the idf-weighted share
 * of the question's terms matched by the top record and the top three; `unknown`
 * lists terms no record contains; `missed` lists terms some record contains but
 * the top three do not; `margin` is top score / second score; `ties` counts
 * records that each match at least 90% of the question's weight.
 *
 * @param {object} signals from lib/ask.js `ask()`
 * @returns {'covered'|'partial'|'none'}
 */
export function classifyConfidence(signals) {
  if (signals.mode === 'exact-id') {
    return signals.exact.found === signals.exact.requested ? 'covered' : signals.exact.found ? 'partial' : 'none';
  }
  // An agent treats the tier as a verdict. `covered` makes it read the first
  // record or two and answer; `none` makes it stop and report a gap, and it
  // will rarely second-guess either. Both mistakes are silent and expensive,
  // so both tiers are strict and `partial` (read the list, name the gaps) is
  // the default.
  //
  // none: nothing distinctive matched. Every development gold question had
  // relevant records and none scored coverage below 0.26, so 0.2 leaves margin.
  if (!signals.topScore || signals.coverage < NONE_BELOW) return 'none';
  // covered: every question word exists in the stores (no vocabulary gap), the
  // top three cover all of it, one record carries most of it, and at most one
  // record matches nearly everything (the question singles something out).
  if (!signals.unknown.length && !signals.missed.length
    && signals.topCoverage >= COVERED_TOP && signals.ties <= 1) return 'covered';
  return 'partial';
}

/** Tier thresholds; see classifyConfidence for the reasoning. */
export const NONE_BELOW = 0.2;
export const COVERED_TOP = 0.75;

export const NEXT = {
  covered: 'Read the listed records, then judge whether they answer the question; preflight any record you rely on.',
  partial: 'Read the listed records; answer only what they support and name the uncovered terms as a gap.',
  none: 'The stores do not appear to cover this. Say so rather than guessing; follow the scoped fallback in protocol/AGENTS.md.',
  unavailable: 'A store did not load cleanly, so an empty or thin result proves nothing. Run preflight.js for store health and report the failure; do not answer from this result.',
};

const COUNT_NEXT = 'Counts are exact over the selection. Report `missing` (records without the field) and any tie at the cut; read example records before describing what a group means.';
const FIELDS_NEXT = 'Choose a field and value from this list for --where or --count-by; do not invent one.';

/** Load each root and index them together. Throws when a root cannot load at all. */
export function loadAskIndex(roots) {
  const installations = roots.map((root) => ({
    installation: basename(String(root).replace(/[\\/]+$/, '')) || root,
    model: loadStores(locateKitRoot(root)),
  }));
  const health = installations.map(({ installation, model }) => ({ installation, ...healthSummary(storeHealth(model)) }));
  return { index: buildIndex(installations), health, multi: installations.length > 1 };
}

/**
 * An in-memory index cache for long-running hosts (the MCP server). Loading a
 * 100,000-record store reads 100,000 files, about 7 s; a warm index answers in
 * milliseconds. The cache watches each kit root and drops its entry on ANY
 * change event, so a result is never computed from a stale index. Where the
 * platform cannot watch a directory recursively, nothing is cached and every
 * call reloads: slower, never wrong.
 */
export function createIndexCache() {
  const entries = new Map();
  return {
    get(roots) {
      const key = JSON.stringify(roots);
      const hit = entries.get(key);
      if (hit && !hit.dirty) return hit.loaded;
      const watchers = [];
      const entry = { dirty: false, loaded: null, watchers };
      try {
        for (const root of roots) {
          const w = watch(locateKitRoot(root), { recursive: true, persistent: false }, () => { entry.dirty = true; });
          w.on('error', () => { entry.dirty = true; });
          watchers.push(w);
        }
      } catch {
        for (const w of watchers) w.close();
        return loadAskIndex(roots);
      }
      hit?.watchers.forEach((w) => w.close());
      entry.loaded = loadAskIndex(roots);
      entries.set(key, entry);
      return entry.loaded;
    },
    close() {
      for (const entry of entries.values()) entry.watchers.forEach((w) => w.close());
      entries.clear();
    },
  };
}

/**
 * Build the payload for one request.
 *
 * @param {ReturnType<typeof loadAskIndex>} loaded
 * @param {{mode: 'search'|'count'|'fields', text: string, where: Array<{field: string, value: string}>,
 *          countBy: string|null, under: string|null, limit: number, top: number}} opts
 */
export function askPayload({ index, health, multi }, opts) {
  // A search over a store that did not load cleanly cannot support any tier:
  // a missing record might be one the loader refused. Report it, never grade it.
  const healthy = health.every((h) => h.ok);
  const storeHealthOut = multi ? health : { ok: health[0].ok, errors: health[0].errors, warnings: health[0].warnings };
  if (opts.mode === 'search') {
    const result = ask(index, opts.text, { limit: opts.limit });
    const tier = healthy ? classifyConfidence(result.signals) : 'unavailable';
    return {
      'store-health': storeHealthOut,
      question: opts.text,
      confidence: { tier, ...result.signals },
      records: result.ranked.map(({ doc, score, matched }) => ({
        ...(multi ? { installation: doc.installation } : {}),
        kind: doc.kind,
        id: doc.id,
        title: doc.title,
        file: doc.file,
        score: score === null ? null : Math.round(score * 100) / 100,
        matched,
        status: doc.status,
        ...(doc.proposal ? { proposal: true } : {}),
        ...(doc.supersededBy.length ? { 'superseded-by': doc.supersededBy } : {}),
      })),
      next: NEXT[tier],
    };
  }
  const request = { where: opts.where, contains: opts.text ? queryTerms(opts.text) : [], countBy: opts.countBy, under: opts.under, top: opts.top };
  const body = opts.mode === 'fields' ? describeFields(index, request) : aggregate(index, request);
  return {
    'store-health': storeHealthOut,
    mode: opts.mode,
    request: { where: opts.where, contains: request.contains, ...(opts.countBy ? { 'count-by': opts.countBy } : {}), ...(opts.under ? { under: opts.under } : {}) },
    ...body,
    next: healthy ? (opts.mode === 'fields' ? FIELDS_NEXT : COUNT_NEXT) : NEXT.unavailable,
  };
}
