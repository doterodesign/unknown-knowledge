/**
 * Query decomposition (UCS-1152) — turning an ask into joins against the
 * governed vocabularies, and saying what did not join.
 *
 * The deterministic core of the resolution pipeline. A query is decomposed
 * along three axes, each joining a DIFFERENT governed vocabulary, and none of
 * them guessing:
 *
 *   verb  -> the `knowledge/operations` registry   ("add a tool"  -> add-tool)
 *   noun  -> concept terms and aliases             ("tool"        -> K-101)
 *   place -> the `knowledge/jurisdictions` registry ("eu eaa"     -> eu-eaa)
 *
 * What makes this the deterministic core rather than a search box is that every
 * axis lands in a MINTED vocabulary value. The operations registry says which
 * verbs exist; the ontology says which nouns do; the jurisdictions registry
 * says which places do. A token that matches none of them is not silently
 * dropped and not fuzzily coerced into the nearest thing — it is RESIDUE, named
 * as such, with the context that did resolve attached, so the gap is a finding
 * somebody can close rather than a bad answer nobody can trace.
 *
 * Three outputs no search box produces, and each exists because its absence is
 * a specific failure the pipeline had:
 *
 *   exclusions  a leaf whose `applies.jurisdictions` excludes the query's place
 *               is EXCLUDED WITH ITS REASON, never silently absent. Silence
 *               here is indistinguishable from "no such knowledge exists", and
 *               the two demand opposite conduct from the reader.
 *   near-miss   a vocabulary entry that shares tokens with the query but did
 *               not clear the match threshold. The answer that was nearly
 *               right is exactly what a reader needs to see when the right one
 *               is missing — and hiding it is how a store's vocabulary drifts
 *               from its users' without anyone noticing.
 *   residue     the unconsumed non-stopword tokens. The store's own record of
 *               what it does not yet know.
 *
 * MATCH SEMANTICS. A vocabulary entry matches when EVERY word of its phrase is
 * present in the query, each consuming a distinct token. Distinctness matters:
 * "tool tool" must not satisfy a two-word phrase from one token. Words match
 * with a naive singular/plural fold (`tool` ~ `tools`) and nothing else — no
 * stemmer, no edit distance, no synonym expansion. That is a deliberate floor,
 * not an unfinished feature: aliases are the governed, warranted mechanism for
 * "these words mean the same thing", and a stemmer that quietly joined `tooling`
 * to `tool` would be an ungoverned vocabulary decision made by a regex.
 *
 * NEAR-MISS is the same test relaxed from every-word to any-word, over entries
 * that did NOT match. It reports the overlap, so a reader sees which word
 * carried it.
 */

/**
 * The pinned stopword list.
 *
 * PROVENANCE: the list is fixed rather than re-derived per store, because the
 * residue output built on it is what the goldens mirror, and a list that
 * drifted would make the fixtures disagree with the behavior they pin.
 *
 * PINNED AND NOT CONFIGURABLE, for the same reason the volatility thresholds
 * are (UCS-1150): residue is a governance signal — it is what gets logged as a
 * retrieval-miss and eventually minted by literary warrant — and a per-store
 * stopword list would make "unresolved" mean something different in every repo.
 * A token's absence from residue must mean "this word carries no query intent
 * anywhere", not "somebody's config happened to hide it here".
 *
 * MINIMAL on purpose. It holds articles, prepositions, auxiliaries, first-person
 * pronouns, and the handful of process words that appear in asks without
 * narrowing them ("process", "launch"). It deliberately does NOT hold domain
 * words: a store that stopworded its own vocabulary would report clean
 * resolution for asks it never understood, which is precisely the silent miss
 * this ticket exists to make impossible. Over-inclusion is the dangerous
 * direction, so the list errs short — a false residue token is a finding a
 * steward reads and dismisses, while a wrongly stopworded one is a gap nobody
 * ever sees.
 *
 * @type {ReadonlySet<string>}
 */
export const STOPWORDS = Object.freeze(new Set([
  'a', 'an', 'and', 'at', 'do', 'for', 'how', 'i', 'in', 'is', 'launch', 'my',
  'of', 'on', 'our', 'process', 'should', 'the', 'this', 'to', 'we', 'with',
]));

/**
 * Split a query into tokens.
 *
 * The character class keeps `/`, `.`, `_` and `-` INSIDE a token, so
 * `src/registry/export-formats.ts` survives as one token rather than
 * shattering into five. That is what lets the resolver notice a path-shaped
 * ask; splitting it first would destroy the only evidence that it was one.
 *
 * @param {string} query the raw query text
 * @returns {string[]} lowercased tokens, in query order, duplicates kept
 */
export const tokenize = (query) => (String(query).toLowerCase().match(/[a-z0-9./_-]+/g) ?? []);

/**
 * Do a query token and a vocabulary word name the same thing?
 *
 * Exact, or differing by a single trailing `s`. That fold is the whole of the
 * morphology here — see the module header for why it stops there.
 *
 * @param {string} token a query token
 * @param {string} word a word from a vocabulary phrase
 * @returns {boolean}
 */
export const sameWord = (token, word) => token === word || token === `${word}s` || `${token}s` === word;

/** Split a vocabulary phrase ("eu eaa", "Blend mode") into its words. */
export const phraseWords = (phrase) => String(phrase).toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Which query tokens satisfy this phrase, or null when it is not satisfied.
 *
 * Every word must find a DISTINCT OCCURRENCE — the returned array is the tokens
 * consumed, which is what makes residue computable: a token that satisfied some
 * phrase is by definition not unresolved.
 *
 * Distinctness is tracked by INDEX, not by token text, and that is the whole
 * subtlety. A query can legitimately repeat a word, and two occurrences of
 * "tool" are two things the user typed — matching them by value would let the
 * first occurrence be found again and rejected as already-used, so a phrase
 * needing two would fail against a query that actually supplied two. Indexing
 * also forecloses the opposite error: one occurrence can never satisfy two
 * words, because its index is consumed the first time it is taken.
 *
 * Greedy first-fit, which is sound because vocabulary phrases are short. Where
 * it cannot satisfy a phrase it returns null rather than backtracking, and that
 * conservative direction is deliberate: under-matching leaves residue a steward
 * can see, while over-matching silently swallows tokens nothing resolved.
 *
 * @param {string[]} phrase the vocabulary phrase's words
 * @param {string[]} tokens the query's tokens
 * @returns {string[]|null} the tokens consumed, in phrase order, or null
 */
export function phraseHit(phrase, tokens) {
  if (!phrase.length) return null; // an empty phrase matches nothing, never everything
  const takenIndexes = new Set();
  const used = [];
  for (const word of phrase) {
    const index = tokens.findIndex((t, i) => !takenIndexes.has(i) && sameWord(t, word));
    if (index === -1) return null;
    takenIndexes.add(index);
    used.push(tokens[index]);
  }
  return used;
}

/**
 * The tokens a phrase OVERLAPS, for near-miss reporting.
 *
 * The match test relaxed from every-word to any-word. An entry with overlap but
 * no match is the near-miss: it shares vocabulary with the ask and still did not
 * clear the threshold, which is exactly the case a reader needs to see when the
 * right answer is missing.
 *
 * @param {string[]} phrase the vocabulary phrase's words
 * @param {string[]} tokens the query's tokens
 * @returns {string[]} the overlapping tokens, de-duplicated, in query order
 */
export function phraseOverlap(phrase, tokens) {
  const overlap = [];
  for (const token of tokens) {
    if (!overlap.includes(token) && phrase.some((word) => sameWord(token, word))) overlap.push(token);
  }
  return overlap;
}

/**
 * The minted values of one registry, sorted (UCS-1148).
 *
 * SUPPRESSED VALUES ARE NOT JOINED. A suppressed value is one a steward
 * explicitly refused, and joining an ask to it would resolve a query through
 * vocabulary the store has disowned. It is not treated as unknown either: the
 * registry accounted for it, which is a different fact from never having heard
 * of it, and a near-miss is where that distinction can be shown without acting
 * on it.
 *
 * A registry the store does not carry yields an empty list rather than throwing.
 * Registry absence is the whole installed base (UCS-1148) — a store that governs
 * no operations simply resolves no verbs, and demanding the file would fail
 * every store written before this ticket.
 *
 * @param {object} model the loaded store model
 * @param {string} key the registry key, e.g. 'knowledge/operations'
 * @returns {string[]} minted values, lexicographically sorted
 */
export function mintedValues(model, key) {
  const registry = model.registries?.get(key);
  return registry ? [...registry.minted].sort() : [];
}

/**
 * Suppressed values of one registry, sorted — the disowned vocabulary.
 *
 * @param {object} model the loaded store model
 * @param {string} key the registry key
 * @returns {string[]}
 */
export function suppressedValues(model, key) {
  const registry = model.registries?.get(key);
  return registry ? [...registry.suppressed].sort() : [];
}

/**
 * The phrases a registry value answers to.
 *
 * A minted value is an identifier, and identifiers are written for machines:
 * `add-tool`, `eu-eaa`. So a value contributes TWO phrases — the value itself
 * as one word, and the value with its separators opened into spaces, which is
 * what a human types. "add tool" reaching `add-tool` is not fuzzy matching;
 * it is reading the identifier's own internal structure, which the author put
 * there precisely to be legible.
 *
 * Both are returned so the caller can report WHICH spelling matched.
 *
 * @param {string} value a registry value
 * @returns {Array<{spelling: string, words: string[]}>}
 */
export function valuePhrases(value) {
  const lower = String(value).toLowerCase();
  const opened = lower.split(/[-_/.]+/).filter(Boolean);
  const phrases = [{ spelling: lower, words: [lower] }];
  if (opened.length > 1 || opened[0] !== lower) {
    phrases.push({ spelling: opened.join(' '), words: opened });
  }
  return phrases;
}
