/**
 * Exact selection and counting over record metadata (the `ask --count-by` mode).
 *
 * Search answers "which few records is this about". Some decisions need the
 * shape of many records instead: "the five most common complaint themes"
 * across 100,000 complaints. Reading them is impossible and ranking the top
 * eight is wrong, because a count over a relevance cutoff depends on where the
 * cutoff fell. So aggregation never ranks by relevance. It selects records by
 * exact metadata predicates, groups them by one metadata field, counts, and
 * orders groups by count then value. Same stores, same arguments, same bytes.
 *
 * Records that lack the grouped field are counted as `missing`, never dropped:
 * an absent field is unknown, not zero, and hiding it would make a partly
 * classified store look fully counted.
 */
import { words } from './ask.js';

/** A --where or --count-by field the engine does not define: a usage error. */
export class UnknownFieldError extends Error {}

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' ? [v] : []);
const norm = (v) => words(v).join(' ');

/**
 * The metadata fields a record can be selected or grouped by, each returning
 * the record's values for that field (possibly several, possibly none).
 * `facet:<name>` reads Knowledge facets; `subject` reads assignments.
 */
export const FIELDS = Object.freeze({
  kind: (d) => [d.kind],
  status: (d) => (d.status ? [d.status] : []),
  subject: (d) => strings(d.record.subjects),
  term: (d) => strings(d.record.terms),
  domain: (d) => strings(d.record.domain),
  operation: (d) => strings(d.record.operations),
  category: (d) => strings(d.record.category),
  class: (d) => strings(d.record.class),
  jurisdiction: (d) => strings(d.record.applies?.jurisdictions),
  month: (d) => {
    const date = d.record.date ?? d.record.verified ?? d.record['last-verified'];
    return typeof date === 'string' && /^\d{4}-\d{2}/.test(date) ? [date.slice(0, 7)] : [];
  },
});

function fieldValues(doc, field) {
  if (field.startsWith('facet:')) return strings(doc.record.facets?.[field.slice(6)]);
  const read = FIELDS[field];
  if (!read) throw new UnknownFieldError(`unknown field "${field}" — use one of ${[...Object.keys(FIELDS), 'facet:<name>'].join(', ')}`);
  return read(doc);
}

/** A Subject and all of its ancestors, nearest first. */
function lineage(registry, id) {
  const out = [];
  const seen = new Set();
  for (let at = id; at && !seen.has(at); at = registry?.parents?.get(at)) { seen.add(at); out.push(at); }
  return out;
}

/**
 * Does a record satisfy `field=value`? Subjects match by descendant: a record
 * filed under "Late delivery" satisfies `subject=S-<Complaints>` when Late
 * delivery sits under Complaints. Other values match after case and accent
 * folding, exactly, never by substring.
 */
function satisfies(doc, { field, value }) {
  if (field === 'subject') return fieldValues(doc, 'subject').some((s) => lineage(doc.registry, s).includes(value));
  const wanted = norm(value);
  return fieldValues(doc, field).some((v) => norm(v) === wanted);
}

/** Every query word appears somewhere in the record's indexed text. */
function containsAll(doc, terms) {
  return terms.every((t) => Object.values(doc.bags).some(({ bag }) => bag.has(t)));
}

/**
 * The group keys a record contributes. With `under`, subjects roll up to the
 * child of `under` they descend from, so `--count-by subject --under
 * S-<Themes>` counts themes even when records are filed on sub-themes.
 */
function groupKeys(doc, field, under) {
  if (field !== 'subject' || !under) return [...new Set(fieldValues(doc, field))];
  const keys = new Set();
  for (const s of fieldValues(doc, 'subject')) {
    const chain = lineage(doc.registry, s);
    const at = chain.indexOf(under);
    if (at > 0) keys.add(chain[at - 1]);
  }
  return [...keys];
}

function labelOf(doc, field, key) {
  return field === 'subject' ? doc.registry?.subjects?.get(key)?.label ?? null : null;
}

/**
 * @param {{docs: object[]}} index from lib/ask.js buildIndex
 * @param {{where?: Array<{field: string, value: string}>, contains?: string[],
 *          countBy: string, under?: string|null, top?: number, examples?: number}} request
 */
export function aggregate(index, { where = [], contains = [], countBy, under = null, top = 10, examples = 3 }) {
  fieldValues(index.docs[0] ?? { record: {}, kind: '' }, countBy); // refuse an unknown field before scanning
  for (const clause of where) fieldValues({ record: {}, kind: '' }, clause.field);
  const selected = index.docs.filter((d) => where.every((c) => satisfies(d, c)) && containsAll(d, contains));
  const qualify = new Set(index.docs.map((d) => d.installation)).size > 1;
  const groups = new Map();
  let missing = 0;
  let multiValued = false;
  // Grouping by the field a --where already fixed would report the filter
  // value as the biggest group; it is the selection, not a finding.
  const fixed = new Set(where.filter((c) => c.field === countBy).map((c) => (countBy === 'subject' ? c.value : norm(c.value))));
  for (const doc of selected) {
    const keys = groupKeys(doc, countBy, under).filter((k) => !fixed.has(countBy === 'subject' ? k : norm(k)));
    if (!keys.length) { missing += 1; continue; }
    if (keys.length > 1) multiValued = true;
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, { value: key, label: labelOf(doc, countBy, key), count: 0, examples: [] });
      const g = groups.get(key);
      g.count += 1;
      if (g.examples.length < examples) g.examples.push(qualify ? `${doc.installation}/${doc.id}` : doc.id);
    }
  }
  const ordered = [...groups.values()].sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  const shown = ordered.slice(0, top);
  // A tie across the cut means "top N" is not well defined; say so rather
  // than let value order silently pick the winner.
  const cutTie = ordered.length > top && ordered[top].count === ordered[top - 1].count;
  return {
    selected: selected.length,
    grouped: selected.length - missing,
    missing,
    groups: ordered.length,
    multiValued,
    tieAtCut: cutTie,
    top: shown.map((g) => ({ ...g, share: selected.length ? Math.round((g.count / selected.length) * 1000) / 1000 : 0 })),
  };
}

/**
 * The field card: which fields exist in the selection and their most common
 * values. This is what an agent chooses from when it maps "trends" or
 * "complaint themes" onto metadata: a closed list, so it cannot invent a field.
 */
export function describeFields(index, { where = [], contains = [], values = 5 } = {}) {
  const selected = index.docs.filter((d) => where.every((c) => satisfies(d, c)) && containsAll(d, contains));
  const facetNames = new Set(selected.flatMap((d) => Object.keys(d.record.facets ?? {})));
  const fields = [...Object.keys(FIELDS), ...[...facetNames].sort().map((n) => `facet:${n}`)];
  const card = [];
  for (const field of fields) {
    const result = aggregate({ docs: selected }, { countBy: field, top: values, examples: 0 });
    if (!result.grouped) continue;
    card.push({
      field,
      present: result.grouped,
      distinct: result.groups,
      values: result.top.map(({ value, label, count }) => (label ? { value, label, count } : { value, count })),
    });
  }
  return { selected: selected.length, fields: card };
}
