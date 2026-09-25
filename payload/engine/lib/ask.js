/**
 * Ranked metadata retrieval with a confidence signal (the `ask` surface).
 *
 * `resolve` joins a question to governed vocabulary phrase by phrase and
 * publishes nothing when no phrase lands. Real questions rarely repeat a
 * record's term verbatim, so on the development gold set it returned zero
 * records for every question. This module answers a different question: given
 * everything the stores already say about each record, which records is this
 * question about, and how sure is that?
 *
 * Deterministic end to end. The same stores and question produce the same
 * bytes; there is no model, no clock and no network. Ranking is BM25F over
 * three weighted field groups, so a word every record shares (fixture
 * boilerplate, a company name) carries almost no weight and a word only one
 * record uses carries the most.
 *
 * What the confidence signal does and does not claim: it measures whether the
 * returned records are the ones the question's vocabulary points at. It cannot
 * say whether a record contains the specific fact asked for; that stays the
 * reader's check against the record body and its sources.
 */
import { authoringRecords, leafConcepts } from './load-stores.js';

// ------------------------------------------------------------------ text

/**
 * Question words that narrow nothing. Kept separate from the resolver's
 * governed STOPWORDS on purpose: those decide what counts as residue, and a
 * ranking stoplist must never make a vocabulary gap look resolved.
 */
const NOISE = new Set([
  'a', 'about', 'actually', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'avoid', 'be',
  'been', 'before', 'being', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'each', 'either',
  'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'may',
  'me', 'might', 'more', 'must', 'my', 'no', 'not', 'of', 'on', 'only', 'or', 'our', 'should', 'so',
  'still', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'to', 'us', 'use', 'using', 'was', 'we', 'were', 'what', 'when', 'where', 'whether', 'which',
  'while', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
  // Instruction verbs a question uses to frame the ask rather than name its subject.
  'answer', 'claim', 'confirm', 'describe', 'distinguish', 'explain', 'give', 'identify', 'list', 'name',
  'report', 'say', 'show', 'state', 'tell',
  // Clarification boilerplate: how to answer, not what the answer is about.
  'ambiguous', 'ask', 'clarification', 'clarify', 'intended', 'meaning', 'need', 'needed', 'provide',
]);

/** Letters NFKD leaves whole because they are not accented base letters. */
const UNDECOMPOSED = { '\u0111': 'd', '\u00f0': 'd', '\u00f8': 'o', '\u0142': 'l', '\u00df': 'ss', '\u00e6': 'ae', '\u0153': 'oe', '\u0131': 'i' };

/** Fold accents so "Éclat" and "eclat", "đỏ" and "do" are one word. */
const fold = (text) => String(text).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u0111\u00f0\u00f8\u0142\u00df\u00e6\u0153\u0131]/g, (c) => UNDECOMPOSED[c]);

/**
 * Suffix stripping, deliberately light: plural, -ing, -ed, -ly. Enough that
 * "exports", "exporting" and "exported" meet "export" without the false
 * merges a full stemmer produces on short product names.
 */
export function stem(word) {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('es') && /(ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) return word.slice(0, -1);
  return word;
}

/**
 * Words of a text, folded and stemmed, in order. Splits on every
 * non-alphanumeric character, so "Source-text assertion:" and "--accent-soft"
 * both break into matchable words. A hyphenated compound also yields its
 * joined form, so "accent-soft" matches "accentsoft" spellings too.
 */
export function words(text) {
  const out = [];
  for (const chunk of fold(text).split(/\s+/)) {
    const parts = chunk.split(/[^a-z0-9]+/).filter(Boolean);
    for (const part of parts) out.push(stem(part));
    if (parts.length > 1 && /[a-z]/.test(chunk)) out.push(parts.join(''));
  }
  return out;
}

/** Content words of a question: no noise words, no duplicates, question order. */
export function queryTerms(question) {
  // Noise is judged on the word as typed, before folding: "do" is an English
  // auxiliary, but "đỏ" (Vietnamese for red) folds to the same letters and is
  // the subject of the question.
  const raw = String(question).toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const seen = new Set();
  const terms = [];
  for (const typed of raw) {
    if (NOISE.has(typed)) continue;
    for (const word of fold(typed).split(/[^a-z0-9]+/).filter(Boolean)) {
      const term = stem(word);
      if (!seen.has(term)) { seen.add(term); terms.push(term); }
    }
  }
  return terms;
}

// ------------------------------------------------------------------ fields

/**
 * Field groups and their BM25F weights. A record's own names (heading, term,
 * title, aliases, terms) are the strongest claim about what it is. Subject
 * labels come next: they are shared by every record filed under the Subject,
 * so they say what area a record is in, not which record it is. Descriptions
 * beat bodies.
 */
export const FIELD_WEIGHTS = Object.freeze({ title: 4, subject: 2, about: 1.5, body: 1 });

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' ? [v] : []);
const texts = (...values) => values.flatMap(strings);

/** Label, aliases and definition of each assigned Subject, plus ancestor labels. */
function subjectText(registry, ids) {
  const name = [];
  const about = [];
  const body = [];
  if (!registry?.subjects) return { name, about, body };
  for (const id of strings(ids)) {
    const subject = registry.subjects.get(id);
    if (!subject) continue;
    name.push(...texts(subject.label, subject.aliases?.map?.((a) => (typeof a === 'string' ? a : a?.label))));
    about.push(...texts(subject.definition?.text, subject.definition?.includes));
    // Ancestors widen recall a little ("engineering" reaches a record filed
    // under a child of Engineering) at body weight, never name weight.
    const visited = new Set([id]);
    let parent = registry.parents?.get(id);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      body.push(...texts(registry.subjects.get(parent)?.label));
      parent = registry.parents.get(parent);
    }
  }
  return { name, about, body };
}

/** One record's searchable text, grouped by field. */
function recordFields(model, kind, entry) {
  const r = entry.record ?? {};
  const subjects = subjectText(model.subjectRegistry, r.subjects);
  if (kind === 'knowledge') {
    return {
      label: r.heading ?? null,
      title: texts(r.heading, r.terms, r.notation),
      subject: subjects.name,
      about: texts(r.summary, r.operations, subjects.about,
        leafConcepts(r).map((id) => model.concepts.get(id)?.record?.term)),
      body: texts(entry.body, subjects.body),
    };
  }
  if (kind === 'ontology') {
    return {
      label: r.term ?? null,
      title: texts(r.term, r.aliases),
      subject: subjects.name,
      about: texts(r.summary, r.definition, subjects.about),
      body: texts((Array.isArray(r.enumerates) ? r.enumerates : []).flatMap((e) => strings(e?.values)), subjects.body),
    };
  }
  return {
    label: r.title ?? null,
    title: texts(r.title),
    subject: subjects.name,
    about: texts(r.decision, r.context, subjects.about),
    body: texts(r.consequences, r.alternatives, r.rationale, subjects.body),
  };
}

// ------------------------------------------------------------------ index

const KINDS = Object.freeze([['knowledge', 'knowledge'], ['ontology', 'ontology'], ['decision', 'decision']]);

/**
 * Build the search index over one or more loaded installations. Document
 * frequencies are pooled across every installation passed in, so a word
 * common to one company's records is still discounted when two companies are
 * searched together.
 *
 * @param {Array<{installation: string, model: object}>} installations
 */
export function buildIndex(installations, { weights = FIELD_WEIGHTS } = {}) {
  const docs = [];
  for (const { installation, model } of installations) {
    for (const [kind, space] of KINDS) {
      for (const entry of authoringRecords(model, space).values()) {
        const id = entry.identity ?? entry.id;
        const r = entry.record ?? {};
        const fields = recordFields(model, kind, entry);
        const bags = {};
        for (const field of Object.keys(weights)) {
          const tokens = fields[field].flatMap(words);
          const bag = new Map();
          for (const t of tokens) bag.set(t, (bag.get(t) ?? 0) + 1);
          bags[field] = { bag, length: tokens.length };
        }
        docs.push({
          installation,
          kind,
          id,
          file: entry.file,
          title: fields.label,
          status: r.status ?? r.facets?.stage ?? null,
          proposal: typeof id === 'string' && id.startsWith('proposal:'),
          supersededBy: strings(r['superseded-by']),
          // Kept for aggregation (lib/aggregate.js): the authored metadata and
          // the installation's Subject registry, read, never copied or edited.
          record: r,
          registry: model.subjectRegistry ?? null,
          bags,
        });
      }
    }
  }
  const df = new Map();
  const titleDf = new Map(); // how many records carry a word in their own title
  const avg = {};
  for (const field of Object.keys(weights)) {
    avg[field] = docs.reduce((sum, d) => sum + d.bags[field].length, 0) / Math.max(1, docs.length) || 1;
  }
  for (const doc of docs) {
    const seen = new Set();
    for (const field of Object.keys(weights)) for (const t of doc.bags[field].bag.keys()) seen.add(t);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
    for (const t of doc.bags.title.bag.keys()) titleDf.set(t, (titleDf.get(t) ?? 0) + 1);
  }
  return { docs, df, titleDf, avg, n: docs.length, weights };
}

const K1 = 1.2;
const B = 0.75;

/** Inverse document frequency; never negative, so a ubiquitous word adds ~0. */
export const idf = (index, term) => {
  const n = index.df.get(term) ?? 0;
  return Math.log(1 + (index.n - n + 0.5) / (n + 0.5));
};

/** Score one record against the question's terms; also report which terms hit. */
function scoreDoc(index, doc, terms) {
  let score = 0;
  const matched = [];
  const titled = [];
  for (const term of terms) {
    let tf = 0;
    for (const [field, weight] of Object.entries(index.weights)) {
      const { bag, length } = doc.bags[field];
      const count = bag.get(term);
      if (count) tf += (weight * count) / (1 - B + (B * length) / index.avg[field]);
    }
    if (!tf) continue;
    matched.push(term);
    if (doc.bags.title.bag.has(term)) titled.push(term);
    score += idf(index, term) * ((tf * (K1 + 1)) / (tf + K1));
  }
  return { score, matched, titled };
}

/**
 * A question names a record when it uses a word that only a few records carry
 * in their own title: "Rouge" naming "Source report: rouge project". Those
 * records are what the question is about even when longer records mention
 * more of its other words, so they are guaranteed a place in the results.
 */
export const NAMED_MAX = 3;


// ------------------------------------------------------------------ ask

const EXACT_ID = /\b([KOD])-(\d{6})\b/g;

/**
 * Rank records for a question and measure how well the top of the ranking
 * covers it.
 *
 * @param {ReturnType<typeof buildIndex>} index
 * @param {string} question
 * @param {{limit?: number}} [options]
 */
export function ask(index, question, { limit = 8, namedMax = NAMED_MAX } = {}) {
  // An accession ID in the question is a lookup: those records lead, exactly.
  // The rest of the question is still searched, because "O-000001's export
  // formats" also needs whatever records talk about export formats.
  const exact = [...new Set([...String(question).matchAll(EXACT_ID)].map((m) => m[0]))];
  const exactHits = index.docs.filter((d) => exact.includes(d.id));
  const terms = queryTerms(String(question).replace(EXACT_ID, ' '));
  const candidates = index.docs
    .filter((doc) => !exactHits.includes(doc))
    .map((doc) => ({ doc, ...scoreDoc(index, doc, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || compareIds(a.doc, b.doc));
  const searched = candidates.slice(0, Math.max(0, limit - exactHits.length));
  // Named records displace the weakest picks, never each other.
  const named = candidates.filter((r) => r.titled.some((t) => (index.titleDf.get(t) ?? 0) <= namedMax));
  for (const r of named) {
    if (searched.includes(r)) continue;
    const drop = searched.findLastIndex((p) => !named.includes(p));
    if (drop < 0) break;
    searched.splice(drop, 1);
    searched.push(r);
  }
  searched.sort((a, b) => b.score - a.score || compareIds(a.doc, b.doc));
  for (const r of searched) r.named = named.includes(r);
  const ranked = [
    ...exactHits.map((doc) => ({ doc, score: null, matched: [doc.id] })),
    ...searched,
  ].slice(0, Math.max(limit, exactHits.length));
  const exactSignals = exact.length ? { exact: { requested: exact.length, found: new Set(exactHits.map((d) => d.id)).size } } : {};
  if (exact.length && !terms.length) {
    return { terms: exact, ranked, signals: { mode: 'exact-id', ...exactSignals } };
  }

  // Coverage is weighted by idf so that matching "aurora" (on every record)
  // counts for little and matching "accent" (on one) counts for a lot.
  const weight = new Map(terms.map((t) => [t, idf(index, t)]));
  const total = [...weight.values()].reduce((a, b) => a + b, 0);
  const covered = (set) => [...set].reduce((sum, t) => sum + (weight.get(t) ?? 0), 0) / (total || 1);
  const topSet = new Set(searched[0]?.matched ?? []);
  // Ambiguity: many records each matching nearly the whole question means the
  // question does not single anything out ("which seal specification?").
  const ties = candidates.filter((r) => covered(new Set(r.matched)) >= 0.9).length;

  const unionTop3 = new Set(searched.slice(0, 3).flatMap((r) => r.matched));
  // Terms no record in the whole index contains: vocabulary the store lacks.
  const unknown = terms.filter((t) => !index.df.has(t));
  // Terms the index has but the top results missed: coverage gaps in the answer.
  const missed = terms.filter((t) => index.df.has(t) && !unionTop3.has(t));

  return {
    terms,
    ranked,
    signals: {
      mode: exact.length ? 'exact-id+search' : 'search',
      ...exactSignals,
      terms: terms.length,
      topCoverage: round(covered(topSet)),
      coverage: round(covered(unionTop3)),
      margin: searched.length > 1 ? round(searched[0].score / searched[1].score) : searched.length ? null : 0,
      topScore: round(searched[0]?.score ?? 0),
      unknown,
      missed,
      ties,
    },
  };
}

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const compareIds = (a, b) => (a.installation + a.id < b.installation + b.id ? -1 : a.installation + a.id > b.installation + b.id ? 1 : 0);
