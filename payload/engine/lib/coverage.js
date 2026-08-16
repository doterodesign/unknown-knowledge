/**
 * Document coverage map (UCS-1156) — a document-sized request made
 * processable, at a context cost that grows with CONTENT RICHNESS rather than
 * with document length.
 *
 * The problem this solves is not "search a big file". It is that an agent
 * handed a 40-page PRD has two bad options: read all of it (the context cost
 * is the document, and most of it is irrelevant) or read none of it and guess.
 * The coverage map is the third option — a bounded artifact that says WHICH
 * governed knowledge the document joined, WHERE in the document each join
 * happened, and WHAT vocabulary the document used that the store does not yet
 * govern. The agent's cost becomes the map plus the sections it chooses to
 * open, and a redundant 40-page document produces a SMALLER map than a dense
 * two-page one because repetition adds no new joins.
 *
 * SIZE- AND FORMAT-INVARIANCE is the load-bearing claim. One entry point takes
 * three input shapes — a query, repo paths, a document — and a query is
 * processed as a ONE-BLOCK DOCUMENT through this same code. That is not a
 * convenience: it is what makes the equivalence testable. If a query and its
 * equivalent one-block document produced different joins, then "the pipeline
 * is size-invariant" would be a slogan rather than a property, and the
 * document path would be free to drift into a second, weaker matcher that
 * nobody compares against the real one.
 *
 * A SECTION'S JOIN IS THE QUERY PIPELINE, RUN OVER THAT SECTION. Nothing here
 * reimplements matching. `sectionJoins` calls the same `decompose`/`scoreLeaves`/
 * `applyScope`/`rankLeaves` functions the resolver's query mode calls, over the
 * section's own tokens. A second matcher tuned for documents is exactly how two
 * surfaces come to disagree about what a store contains, and the disagreement
 * would be invisible: both would return plausible results.
 *
 * SALIENCE IS PINNED, NOT LEARNED. The candidate extractor uses three fixed
 * signatures and subtracts three fixed vocabularies. No tf-idf, no corpus
 * statistics, no thresholds tuned against a sample: a candidate list that
 * changed because the store grew would make "this document introduced new
 * vocabulary" unreproducible, and the candidates are the input to a MINTING
 * decision (literary warrant, §3.5). A steward reading a candidate must be able
 * to re-derive it from the document alone.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not log submissions, and it does not
 * keep a registry of documents it has seen. The idempotence criterion is met by
 * the content hash the adapter already computes travelling into the map, so two
 * byte-identical submissions produce byte-identical maps carrying the same
 * hash — dedupe is a property a consumer can check, not a stateful service this
 * engine runs. A submissions log would be a second source of truth about what
 * was ingested, and D-012 wants the output to be a pure function of the input.
 */
import { compare } from './validate-record.js';
import { STOPWORDS, tokenize } from './decomposition.js';
import { suppressibleBy } from './suppressions.js';

/**
 * SECTIONS
 *
 * A section is a heading block and everything under it until the next heading
 * at the same or a shallower level. Sections are derived from the IR, never
 * from the source bytes: the adapter already decided what a heading is, and a
 * second opinion here would let the map address a structure the IR does not
 * have.
 *
 * PREAMBLE. Content before the first heading is its own section, addressed
 * `(preamble)`. Dropping it would lose the abstract of every document that
 * opens with one, and merging it into the first heading's section would report
 * joins under an address whose text does not cover them — a locator that sends
 * a reader to the wrong lines is worse than no locator.
 *
 * A FORMAT WITH NO HEADINGS (txt@1 emits only paragraphs) yields exactly one
 * section covering the whole document. That is the honest answer: the map's
 * structure degrades with the input's, and the process is identical. It is not
 * a failure and it is not padded out with invented windows — inventing section
 * boundaries the document does not have would address a reader to a "section"
 * no editor shows.
 */
export const PREAMBLE_ADDRESS = '(preamble)';

/**
 * How many section addresses any one list enumerates before it summarizes.
 *
 * A LIST OF ADDRESSES IS THE ONE PART OF THE MAP THAT GROWS WITH LENGTH. A term
 * repeated in every section of a forty-section document would otherwise
 * enumerate forty addresses, and a handful of such terms is a map that grows
 * linearly with the document — the exact property this ticket exists to deny.
 * Everything else in the map is bounded by richness already: joins are bounded
 * by the store's vocabulary, candidates by how much new language the document
 * introduces, and repeated sections fold.
 *
 * So an address list is capped, and the overflow is reported as a COUNT rather
 * than dropped: `sections: [...8 addresses], "sections-more": 31` says "this
 * term is everywhere" in constant space, which is the fact a reader needs. Eight
 * is enough to see a pattern (a term in eight named sections is localized; one
 * that overflows is pervasive) and small enough that a hundred candidates
 * cannot make the map unbounded.
 *
 * Addresses are sorted before capping, so WHICH eight survive is deterministic
 * rather than dependent on document order.
 */
export const ADDRESS_CAP = 8;

/**
 * Cap an address list, reporting the overflow as a count.
 *
 * @param {string[]} addresses sorted section addresses
 * @returns {{sections: string[], more: number}}
 */
const capAddresses = (addresses) => ({
  sections: addresses.slice(0, ADDRESS_CAP),
  more: Math.max(0, addresses.length - ADDRESS_CAP),
});

/**
 * Group IR blocks into sections.
 *
 * The address is the heading TEXT, and the locator is the line range — together
 * they are what makes a just-in-time read possible: `sed -n '12,40p' doc.md`
 * needs the range, and a human deciding whether to open it needs the text.
 *
 * Heading level opens and closes a section: a deeper heading (`##` under `#`)
 * NESTS, and its content also belongs to the shallower section. This module
 * emits sections at every heading, and a nested section's lines are a subrange
 * of its parent's — that overlap is deliberate. The alternative (flat, sibling
 * sections) would make an `##` subsection's joins invisible in the `#` section
 * that a reader would actually open, and the whole point of the locator is that
 * opening it shows the content the map attributed to it.
 *
 * The end line comes from the LAST BLOCK in the section, not from the next
 * heading's start: trailing blank lines belong to neither, and a range that
 * included them would claim coverage of lines the IR never read.
 *
 * @param {object[]} blocks the IR's ordered blocks
 * @returns {Array<{address, level, line, endLine, blocks}>}
 */
export function sectionsOf(blocks) {
  const sections = [];
  /** Open sections, shallowest first — a block belongs to every one of them. */
  const open = [];
  let preamble = null;

  const extend = (section, block) => {
    const { line, endLine, page } = block.locator;
    // A pdf locator is {page, object} rather than {line, endLine}. Its blocks
    // still group into sections; the RANGE is what the format can express, and
    // for pdf that is the page. Publishing `line: null` rather than inventing a
    // line number keeps the locator honest about the coordinates the source has.
    section.blocks.push(block);
    if (page !== undefined) {
      section.page ??= page;
      section.endPage = page;
      return;
    }
    section.line = Math.min(section.line ?? line, line);
    section.endLine = Math.max(section.endLine ?? endLine, endLine ?? line);
  };

  for (const block of blocks) {
    if (block.kind === 'heading') {
      const level = typeof block.level === 'number' ? block.level : 1;
      // Close every section this heading is not nested inside.
      while (open.length && open[open.length - 1].level >= level) open.pop();
      const section = {
        address: block.text,
        level,
        line: null,
        endLine: null,
        blocks: [],
      };
      extend(section, block);
      sections.push(section);
      // The heading line belongs to every enclosing section too, so an outer
      // section's range covers its subsections.
      for (const ancestor of open) extend(ancestor, block);
      open.push(section);
      continue;
    }
    if (!open.length) {
      // Content before the first heading. Its own section, never merged.
      preamble ??= { address: PREAMBLE_ADDRESS, level: 0, line: null, endLine: null, blocks: [] };
      extend(preamble, block);
      continue;
    }
    for (const section of open) extend(section, block);
  }

  return preamble ? [preamble, ...sections] : sections;
}

/**
 * The text a section's lexicon scan reads.
 *
 * CODE BLOCKS ARE EXCLUDED. A fenced block is content no lexicon should
 * tokenize as prose (the IR kinds exist to make exactly this distinction):
 * a code sample naming a variable `sport` is not the document discussing
 * sports, and counting it would join governed vocabulary to a symbol that
 * happens to share a name. The block is still IN the section — its lines are
 * inside the locator's range, so a reader who opens the section sees it.
 */
const scannableText = (section) => section.blocks
  .filter((b) => b.kind !== 'code')
  .map((b) => b.text)
  .join('\n');

/**
 * Attribute each block to exactly ONE section — the innermost that contains it.
 *
 * Sections NEST (a `##` subsection's blocks belong to its `#` parent too), which
 * is right for joins and locators: an agent opening the parent's line range
 * genuinely sees the child's content, and a leaf reached from a subsection is
 * reached from the section containing it.
 *
 * It is WRONG for counting. A salience count is evidence about how often the
 * author said something, so a phrase inside a nested section would be counted
 * once per enclosing level — a `###` under a `##` under a `#` would triple its
 * own count and cross the repetition threshold on nesting depth alone. The
 * document's structure would decide its vocabulary, which is exactly the kind
 * of unreproducible signal the pinned-salience rule exists to forbid.
 *
 * So counting runs over this partition (each block once, attributed to the
 * deepest section that holds it) while joins and locators keep using the nested
 * view. Two readings of one structure, each used where it is the honest one.
 *
 * @param {Array} sections from `sectionsOf`
 * @returns {Array<{address: string, text: string}>} one entry per section, disjoint text
 */
function ownBlocks(sections) {
  // The innermost section owning a block is the LAST one in document order
  // whose block list contains it: `sectionsOf` appends a nested section after
  // its parent, so scanning forward and letting later sections win lands on the
  // deepest. Identity comparison, because the same block object is shared.
  const owner = new Map();
  for (const section of sections) {
    for (const block of section.blocks) owner.set(block, section.address);
  }
  const byAddress = new Map(sections.map((s) => [s.address, []]));
  for (const section of sections) {
    for (const block of section.blocks) {
      if (owner.get(block) === section.address && block.kind !== 'code') {
        byAddress.get(section.address).push(block.text);
      }
    }
  }
  return sections.map((s) => ({ address: s.address, text: byAddress.get(s.address).join('\n') }));
}

/**
 * SALIENCE — the pinned signatures.
 *
 * Three signatures, each a different kind of evidence that the AUTHOR treated
 * a phrase as load-bearing, and each demonstrable from a document alone:
 *
 *   emphasis    the author marked it up (`**bold**`, `*italic*`). The strongest
 *               signal available, because it is an explicit authoring act.
 *   title-case  a multi-word Title-Case phrase is how English marks a proper
 *               noun or a coined term ("Mutual Exclusivity Window").
 *   repetition  a term repeated at least THRESHOLD times, where the threshold
 *               is a step function of document size (see REPETITION_STEPS).
 *
 * Single words are rejected for the first two signatures and accepted only via
 * repetition. A one-word emphasis is usually stress ("this is **not** true"),
 * and minting vocabulary off it would fill the candidate list with adverbs.
 */

/**
 * Emphasis spans, read straight out of the IR.
 *
 * NO ADAPTER CHANGE WAS NEEDED, and that is worth stating because the obvious
 * assumption is the opposite. `md@1`'s `flatten()` collapses WHITESPACE only —
 * it never strips inline markup — so `**Mutual Exclusivity**` arrives in the
 * block text with its markers intact. Extending the adapter to tag emphasis
 * would have forced a version bump (a changed IR for the same input, per the
 * documented bump rule) and invalidated every existing fixture pair, to
 * recover information the IR already carries.
 *
 * The consequence, stated rather than hidden: a `txt` or `pdf` document has no
 * emphasis signature, because those formats have no emphasis to mark. Their
 * candidates come from the other two signatures. That is the same graceful
 * degradation the sectioning has — richer structure yields a richer map, and
 * no format is handed invented signal.
 */
const EMPHASIS = /(\*\*|__)(?=\S)(.+?)(?<=\S)\1|(?<![\w*])(\*|_)(?=\S)([^*_]+?)(?<=\S)\3(?![\w*])/g;

/**
 * A multi-word Title-Case phrase: two or more capitalized words in a row.
 *
 * Deliberately conservative. Words joined by an internal lowercase connector
 * ("Bank of England") are NOT matched, because relaxing that far also matches
 * an ordinary sentence opening followed by a proper noun ("The Malta rule"),
 * and a candidate list padded with sentence openings is one a steward stops
 * reading. Under-matching leaves a term uncaptured, which the repetition
 * signature usually catches anyway; over-matching poisons the whole list.
 */
const TITLE_CASE = /\b([A-Z][a-z]+(?:[ -][A-Z][a-z]+)+)\b/g;

/**
 * Determiners stripped from the FRONT of a Title-Case phrase.
 *
 * A sentence that opens "The Quiet Period is unresolved" capitalizes `The` for
 * position, not because it is part of the term. Left in, the same term splits
 * into two candidates — "quiet period" and "the quiet period" — which is worse
 * than either error it replaces: the count that measures salience is halved
 * across the pair, and a steward is asked to mint a phrase with an article
 * bolted on. Stripped only at the START, and only when something survives:
 * "The Hague" is a term whose article is load-bearing, and a phrase that IS a
 * determiner is not a candidate at all.
 */
const LEADING_DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those']);

/** Drop a leading determiner from a folded phrase, if one survives it. */
function stripDeterminer(folded) {
  const words = folded.split(' ');
  if (words.length > 1 && LEADING_DETERMINERS.has(words[0])) return words.slice(1).join(' ');
  return folded;
}

/**
 * The repetition threshold, as a PINNED STEP FUNCTION of document size.
 *
 * A fixed count cannot work across sizes: three occurrences in a one-page brief
 * is the author hammering a point, while three in a forty-page PRD is noise. So
 * the threshold steps up with the document's block count — the IR's own measure
 * of size, which is format-independent in a way that byte length and line count
 * are not (a pdf has no lines; an html file's bytes are mostly markup).
 *
 * A STEP FUNCTION rather than a formula, and spelled as a table, because the
 * candidates feed a minting decision: a steward must be able to say "this
 * document has 60 blocks, so the threshold was 4" by reading one table, without
 * evaluating an expression. Continuous scaling would also make the threshold
 * change on almost every edit, so a candidate could appear and vanish between
 * two near-identical drafts for reasons nobody could see.
 *
 * The steps are the prototype's floor (≥4 doc-wide, its documents sitting in
 * the 24–120 block range) extended in both directions: lower for documents too
 * small for 4 to ever fire, higher for documents long enough that 4 is noise.
 *
 * Read as: the FIRST row whose `maxBlocks` the document does not exceed wins.
 *
 * @type {ReadonlyArray<{maxBlocks: number, threshold: number}>}
 */
export const REPETITION_STEPS = Object.freeze([
  Object.freeze({ maxBlocks: 8, threshold: 2 }),
  Object.freeze({ maxBlocks: 24, threshold: 3 }),
  Object.freeze({ maxBlocks: 120, threshold: 4 }),
  Object.freeze({ maxBlocks: 400, threshold: 6 }),
  Object.freeze({ maxBlocks: Infinity, threshold: 8 }),
]);

/**
 * The repetition threshold for a document of this many blocks.
 *
 * @param {number} blocks the IR's block count
 * @returns {number} occurrences required, doc-wide
 */
export const repetitionThreshold = (blocks) =>
  REPETITION_STEPS.find((step) => blocks <= step.maxBlocks).threshold;

/**
 * CONCENTRATION — repetition must mean emphasis, not merely length.
 *
 * A raw count is not enough, and a long redundant document is what proves it.
 * A weekly status report that says "settlement ran clean, nothing required
 * manual correction" in twenty-four near-identical sections puts `manual`,
 * `clean`, and `nothing` over any doc-wide threshold — not because the author
 * kept returning to them, but because the document kept running. Minting
 * vocabulary from that would fill a steward's queue with the boilerplate of
 * whichever team writes the longest reports.
 *
 * So a repeated term must also be CONCENTRATED: it must occur more often than
 * once per section it appears in. A term the author genuinely leaned on comes
 * up several times where it matters ("the Quiet Period ... the Quiet Period
 * rule"), while boilerplate appears exactly once in each of many sections. The
 * test is `count > sections`, which is the weakest form of that claim and the
 * only one that needs no tuning — it asks whether ANY section used the term
 * twice, and a term that never did is spread, not stressed.
 *
 * This is what makes the map grow with richness rather than length: adding
 * another identical week to the report raises a boilerplate term's count and
 * its section count together, so it never becomes concentrated no matter how
 * long the document gets.
 */
const isConcentrated = (count, sections) => count > sections;

/**
 * The naive singular fold, matching `sameWord` in lib/decomposition.js.
 *
 * Candidates are counted in the SAME morphology the joins use, so "sports" and
 * "sport" are one candidate exactly as they are one join. A candidate list that
 * folded differently from the matcher would report a term as unknown while the
 * matcher was already joining it.
 *
 * `ss` is the one exception, and it is here because the candidates are READ BY
 * A HUMAN in a way the matcher's tokens are not. Trailing-s stripping turns
 * "basis" into "basi" and "status" into "statu", so a steward deciding whether
 * to mint "Refund Basis Register" would be shown "refund basi register" — a
 * misspelling of the thing they are being asked to approve. The matcher can
 * afford the mangling because both sides of a comparison fold identically and
 * nobody reads the result; a minting proposal cannot. Words ending in `ss` are
 * never plurals of a word ending in `s`, so declining to strip them loses no
 * folding that was ever correct.
 */
const singular = (word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')
  ? word.slice(0, -1)
  : word);

/** Fold a phrase to its canonical, comparable form. */
const foldPhrase = (phrase) => String(phrase)
  .toLowerCase()
  .split(/[\s-]+/)
  .filter(Boolean)
  .map(singular)
  .join(' ');

/**
 * KNOWN VOCABULARY — every word of every governed vocabulary in the store.
 *
 * This is the "known" filter the ticket demands be subtracted from candidates,
 * and it is deliberately WORD-level rather than phrase-level. A candidate is
 * only interesting if the store cannot already express it, and a phrase built
 * entirely from words the store governs ("sport registry") is a recombination
 * of known vocabulary rather than new vocabulary — the store can already reach
 * it, and proposing it for minting would ask a steward to approve a synonym for
 * something already minted.
 *
 * Every governed vocabulary streams in: concept terms and aliases, leaf terms,
 * and every registry's minted AND suppressed values. Suppressed values are
 * included on purpose — a suppressed value is one the store has ACCOUNTED FOR,
 * and re-proposing it as a novel candidate would ask a steward to re-decide a
 * question they already answered.
 *
 * @param {object} model the loaded store model
 * @returns {Set<string>} folded single words
 */
export function knownVocabulary(model) {
  const words = new Set();
  const add = (text) => {
    if (typeof text !== 'string') return;
    for (const word of foldPhrase(text).split(' ')) if (word) words.add(word);
  };
  for (const { record } of model.concepts.values()) {
    add(record.term);
    for (const alias of record.aliases ?? []) add(alias);
  }
  for (const entry of model.leaves.values()) {
    for (const term of entry.record?.terms ?? []) add(term);
  }
  for (const registry of model.registries?.values() ?? []) {
    for (const value of registry.minted) add(String(value).replace(/[-_/.]+/g, ' '));
    for (const value of registry.suppressed) add(String(value).replace(/[-_/.]+/g, ' '));
  }
  return words;
}

/**
 * Extract salience candidates from the sections of one document.
 *
 * The three pinned signatures, then the three subtractions. Every candidate
 * carries the sections it appeared in (its ADDRESSES, so a reader can open it),
 * its occurrence count, and the signature that produced it — a candidate whose
 * provenance is unstated is one a steward cannot weigh.
 *
 * @param {Array} sections from `sectionsOf`
 * @param {Set<string>} known the folded known-vocabulary words
 * @param {number} threshold the repetition threshold for this document's size
 * @returns {Map<string, {term, count, signatures: Set, sections: string[]}>}
 */
function extractCandidates(sections, known, threshold) {
  const found = new Map();
  const record = (raw, signature, address) => {
    // A sentence-initial determiner is capitalization for position, not part of
    // the term — stripping it keeps one term from splitting into two candidates.
    const term = stripDeterminer(foldPhrase(raw));
    if (!term) return;
    const words = term.split(' ');
    // A phrase that was only a determiner plus one word is a sentence opening
    // ("The Malta rule"), not a multi-word term. The two-word floor is applied
    // AFTER stripping, so it means two words of actual term.
    if (words.length < 2) return;
    // Fully-known phrases are recombinations, not new vocabulary.
    if (words.every((w) => known.has(w) || STOPWORDS.has(w))) return;
    if (!found.has(term)) found.set(term, { term, count: 0, signatures: new Set(), sections: [] });
    const entry = found.get(term);
    entry.count += 1;
    entry.signatures.add(signature);
    if (!entry.sections.includes(address)) entry.sections.push(address);
  };

  // Counted over the DISJOINT partition — each block once, attributed to the
  // innermost section holding it. See `ownBlocks`: counting over the nested
  // view would let nesting depth inflate a count past the threshold.
  const owned = ownBlocks(sections);

  for (const { address, text } of owned) {
    for (const match of text.matchAll(EMPHASIS)) {
      const span = match[2] ?? match[4] ?? '';
      // Single words are stress, not vocabulary — see the salience header.
      if (foldPhrase(span).split(' ').length < 2) continue;
      record(span, 'emphasis', address);
    }
    for (const match of text.matchAll(TITLE_CASE)) record(match[1], 'title-case', address);
  }

  // Repetition is counted DOC-WIDE, over single tokens, and only promoted to a
  // candidate once the size-stepped threshold is cleared. Counted separately
  // from the phrase signatures because it answers a different question — not
  // "did the author mark this up" but "did the document keep coming back to
  // it" — and a term can legitimately earn both.
  const repeats = new Map();
  for (const { address, text } of owned) {
    for (const token of tokenize(text)) {
      const word = singular(token);
      // Stopwords, known vocabulary, short tokens, and anything path- or
      // version-shaped (a dot inside) are never candidates: none of them is a
      // term a steward would mint.
      if (STOPWORDS.has(token) || STOPWORDS.has(word) || known.has(word)) continue;
      if (word.length < 4 || word.includes('.') || word.includes('/')) continue;
      if (!repeats.has(word)) repeats.set(word, { count: 0, sections: [] });
      const entry = repeats.get(word);
      entry.count += 1;
      if (!entry.sections.includes(address)) entry.sections.push(address);
    }
  }
  for (const [word, entry] of repeats) {
    if (entry.count < threshold) continue;
    // Frequent AND concentrated — see `isConcentrated`. Boilerplate clears the
    // count threshold in any long document and must not clear this one.
    if (!isConcentrated(entry.count, entry.sections.length)) continue;
    if (!found.has(word)) found.set(word, { term: word, count: 0, signatures: new Set(), sections: [] });
    const candidate = found.get(word);
    candidate.count += entry.count;
    candidate.signatures.add('repetition');
    for (const address of entry.sections) {
      if (!candidate.sections.includes(address)) candidate.sections.push(address);
    }
  }

  return found;
}

/**
 * The identity a document candidate is suppressed by.
 *
 * IT IS THE SAME ENTRY GRAMMAR THE REVERSE AUDIT USES — `{ term, sourcePath }`,
 * exact match, stamped by `suppressibleBy` where the candidate is built. The
 * ticket's requirement is that a suppressed term is excluded from document
 * candidates EXACTLY as it is from reverse-audit terms, and "exactly" has to
 * mean one grammar rather than two that happen to look alike: `suppressions.js`
 * commits to one strict shape and no second entry grammar, so a steward writes
 * one entry and it works on both surfaces.
 *
 * `sourcePath` is the SUBMITTED DOCUMENT'S PATH, which mirrors the audit's
 * `unmatched-anchor` reading of the field — there, it is the path of the file
 * the finding is about. A candidate is about the document it was extracted
 * from, so its path is the document's. The consequence is deliberate and worth
 * stating: suppressing a candidate in one document does NOT suppress it in
 * another, which is right, because "this phrase is not vocabulary in THIS
 * document" is a weaker claim than "this phrase is never vocabulary". A
 * steward who means the stronger thing writes one entry per document and the
 * repetition is itself evidence the term deserves a real decision.
 */
const candidateIdentity = (term, documentPath) => ({ term, sourcePath: documentPath });

/**
 * Rank candidates and split them by suppression.
 *
 * Suppressed candidates are REPORTED AS SUPPRESSED, never silently absent —
 * the same contract the audit's `suppressions.suppressed` list carries, and for
 * the same reason: a term missing from a list is indistinguishable from a term
 * the extractor never found, and the two demand opposite conduct (one is
 * settled, the other is a gap).
 *
 * Sorted by count descending then term ascending, so the ranking is total and
 * byte-stable. Signatures are sorted for the same reason.
 */
function rankCandidates(found, documentPath, suppressionEntries) {
  const all = [...found.values()]
    .map((candidate) => {
      // A candidate's section addresses ARE its locators: the ticket requires
      // every ranked candidate to carry a section address usable for a
      // just-in-time read, and this is that address in the map's own
      // vocabulary. Capped, so a term that appears everywhere costs the map a
      // constant rather than one entry per section (see ADDRESS_CAP).
      const { sections, more } = capAddresses([...candidate.sections].sort(compare));
      return suppressibleBy({
        term: candidate.term,
        count: candidate.count,
        signatures: [...candidate.signatures].sort(compare),
        sections,
        'sections-more': more,
      }, candidateIdentity(candidate.term, documentPath));
    })
    .sort((a, b) => b.count - a.count || compare(a.term, b.term));

  const kept = [];
  const suppressed = [];
  for (const candidate of all) {
    const identity = candidateIdentity(candidate.term, documentPath);
    const match = suppressionEntries.some((e) => e.term === identity.term && e.sourcePath === identity.sourcePath);
    (match ? suppressed : kept).push(candidate);
  }
  return { kept, suppressed };
}

/**
 * Build the coverage map for one adapted document.
 *
 * `joinSection` is injected rather than imported, and that indirection is the
 * point of the whole module: the resolver owns the query pipeline, so it passes
 * its own joiner in, and this module cannot grow a second matcher even by
 * accident. A section's join IS the query pipeline over that section's text.
 *
 * @param {object} args
 * @param {string} args.document the submitted document's path (provenance + suppression identity)
 * @param {object} args.ir the adapter's output: {adapter, hash, blocks}
 * @param {object} args.model the loaded store model
 * @param {(text: string) => object} args.joinSection runs the query pipeline over one section
 * @param {object[]} args.suppressionEntries well-formed suppression entries
 * @returns {object} the coverage map
 */
export function buildCoverageMap({ document, ir, model, joinSection, suppressionEntries }) {
  const sections = sectionsOf(ir.blocks);
  const threshold = repetitionThreshold(ir.blocks.length);
  const known = knownVocabulary(model);
  const candidates = extractCandidates(sections, known, threshold);
  const ranked = rankCandidates(candidates, document, suppressionEntries);

  const joined = sections.map((section) => ({ section, join: joinSection(scannableText(section)) }));

  // Per-section entries. ONLY sections with signal are published, and a section
  // whose signal exactly REPEATS one already published is folded into it.
  //
  // This is the richness bound made concrete, and both halves are needed. The
  // first (drop sections with no signal) keeps boilerplate out. The second
  // (fold exact repeats) is what makes the map grow with richness rather than
  // length: a status report with twenty-four "Week N" sections that each join
  // the same leaf and introduce no vocabulary has told the reader ONE thing,
  // and publishing it twenty-four times would make the map a function of how
  // long the document ran. A folded section is not lost — its address and
  // locator join the entry it repeats, so every occurrence stays openable, and
  // `repeats` counts them. What is dropped is the redundancy, not the evidence.
  //
  // Exact-match folding only, deliberately. A section that joins a DIFFERENT
  // set, or introduces one new candidate, is new information and is published
  // in full. Anything looser would be a similarity threshold, and a map that
  // silently merged two sections a reader would consider distinct is one that
  // hides content — the failure this whole pipeline exists to prevent.
  const perSection = [];
  const bySignal = new Map();
  for (const { section, join } of joined) {
    const sectionCandidates = ranked.kept
      .filter((c) => c.sections.includes(section.address))
      .map((c) => c.term);
    const hasJoin = join.operations.length || join.concepts.length
      || join.jurisdictions.length || join.leaves.length;
    if (!hasJoin && !sectionCandidates.length) continue;
    const joins = {
      operations: join.operations.map((o) => o.value),
      concepts: join.concepts.map((c) => c.id),
      jurisdictions: join.jurisdictions.map((j) => j.value),
      leaves: join.leaves.map((l) => l.id ?? l.notation),
    };
    const locator = section.page === undefined
      ? { line: section.line, endLine: section.endLine }
      : { page: section.page, endPage: section.endPage };
    const signature = JSON.stringify([joins, sectionCandidates]);
    const already = bySignal.get(signature);
    if (already) {
      // Capped like every other address list: a section repeated forty times is
      // one fact, and enumerating forty locators would reintroduce the
      // length-dependence the folding just removed. The count is always exact.
      if (already.repeats.length < ADDRESS_CAP) already.repeats.push({ section: section.address, locator });
      already['repeats-count'] += 1;
      continue;
    }
    const entry = {
      section: section.address,
      // The LOCATOR, in the coordinates the source actually has — the whole
      // point of the map is that an agent can open this range and read only it.
      locator,
      joins,
      candidates: sectionCandidates,
      // Every OTHER section with identical signal, addressed and locatable —
      // capped, with the exact total alongside. Stable keys that may be empty
      // or zero: a consumer must never need a presence check to tell "nothing
      // repeated this" from "this engine predates folding".
      repeats: [],
      'repeats-count': 0,
    };
    bySignal.set(signature, entry);
    perSection.push(entry);
  }

  return {
    document,
    // The adapter's provenance and the content hash, carried straight through.
    // The hash is what makes RESUBMISSION IDEMPOTENT and machine-visible: two
    // byte-identical submissions produce byte-identical maps carrying the same
    // hash, so a consumer dedupes by comparing one field rather than diffing.
    adapter: ir.adapter,
    hash: ir.hash,
    ir: {
      blocks: ir.blocks.length,
      sections: sections.length,
      // The threshold that WAS APPLIED, published rather than left implicit:
      // a candidate list a reader cannot re-derive is one they cannot check,
      // and the threshold is the one input to it that is not in the document.
      'repetition-threshold': threshold,
    },
    sections: perSection,
    gather: gatherRollup(joined),
    'candidates-ranked': ranked.kept,
    // Reported as suppressed, never silently absent — the audit's contract.
    suppressed: ranked.suppressed,
  };
}

/**
 * The GATHER ROLLUP — every governed leaf the document reached, once, with the
 * verdict it carries and the scope mismatches flagged.
 *
 * De-duplicated across sections because a leaf reached from four sections is
 * ONE thing to read, and the rollup is what an agent works from: the per-section
 * entries say where, the rollup says what. Each entry keeps the union of the
 * sections that reached it, so "where" is never lost — it moves to a field.
 *
 * SCOPE MISMATCH is flagged rather than filtered. A leaf whose declared
 * jurisdictions do not include any jurisdiction the DOCUMENT named is still
 * published, carrying a flag that says so: a document about a Malta launch that
 * joins a New-Jersey-only constraint has found something its author needs to
 * see — either the constraint travels or the document has a gap — and silently
 * dropping it would answer both questions with the same silence. This is the
 * document-scale reading of the same rule `applyScope` applies to a query, and
 * it is a FLAG here rather than an exclusion because a document names many
 * scopes across many sections, so "out of scope" is a weaker claim than it is
 * for a single-scoped query.
 *
 * TIME VERDICTS are whatever the leaf carries — the shared `timeVerdict` the
 * resolver already computed, never recomputed here. A run without `--today`
 * carries `skipped` verdicts and the map says so, exactly as the resolver's
 * `time-check` line does: a run that computed no freshness verdicts must never
 * read like one that checked and found everything fresh.
 */
function gatherRollup(joined) {
  const documentScopes = new Set();
  for (const { join } of joined) {
    for (const j of join.jurisdictions) documentScopes.add(j.value);
  }

  const byLeaf = new Map();
  for (const { section, join } of joined) {
    for (const leaf of join.leaves) {
      const key = leaf.id ?? leaf.notation;
      if (!byLeaf.has(key)) byLeaf.set(key, { leaf, sections: [], signals: new Set() });
      const entry = byLeaf.get(key);
      if (!entry.sections.includes(section.address)) entry.sections.push(section.address);
      for (const signal of leaf.signals) entry.signals.add(`${signal.signal}:${signal.via}`);
      // The highest score any section gave this leaf. A leaf is as strongly
      // reached as its best section reached it — averaging would let a long
      // document dilute a strong single join into nothing.
      if (leaf.score > entry.leaf.score) entry.leaf = leaf;
    }
  }

  const rollup = [];
  for (const { leaf, sections, signals } of byLeaf.values()) {
    const scopes = [...documentScopes].sort(compare);
    const mismatch = leaf.applies.length && scopes.length
      && !leaf.applies.some((j) => scopes.includes(j));
    // Capped for the same reason a candidate's are: a leaf joined from every
    // section of a long document must not cost one line per section.
    const reached = capAddresses([...sections].sort(compare));
    rollup.push({
      id: leaf.id,
      notation: leaf.notation,
      heading: leaf.heading,
      file: leaf.file,
      score: leaf.score,
      signals: [...signals].sort(compare),
      sections: reached.sections,
      'sections-more': reached.more,
      verdict: leaf.time.verdict,
      // Stable keys that may be null, like every other v2 field: a consumer
      // must never need a presence check to tell "no scope mismatch" from "this
      // engine predates the flag".
      'scope-mismatch': mismatch
        ? `declares applies.jurisdictions [${leaf.applies.join(', ')}] — the document is scoped to [${scopes.join(', ')}], which this leaf does not cover; verify applicability (UCS-1156)`
        : null,
      demotions: leaf.demotions,
    });
  }
  return rollup.sort((a, b) =>
    b.score - a.score || compare(a.id ?? a.notation, b.id ?? b.notation));
}
