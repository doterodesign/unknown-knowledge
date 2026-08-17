# UCS-1152 — Query decomposition: structured joins, scope exclusion with reasons, near-miss and residue

Implemented on branch `ucs-1152-query-decomposition-structured-joins-scope-exclusion-with`, base `faceted-store-v2`.

## What shipped

The deterministic core of the resolution pipeline. `resolve` now decomposes the
query itself against the governed vocabularies rather than matching query text
against concepts alone.

### Three axes, three vocabularies, no guessing

| axis | vocabulary | example |
|---|---|---|
| verb | `knowledge/operations` registry (minted values) | "add a token" → `add-token` |
| noun | concept terms and aliases | "token" → `K-101` |
| place | `knowledge/jurisdictions` registry | "eu eaa" → `eu-eaa` |

A verb-shaped ask reaches the leaves that DECLARED the operation, with no noun
guessing. That is what makes "add a token" resolvable at all: before this
ticket a leaf could only surface as an attachment to a concept result, so an
ask that named a verb and no noun had nothing to hang its answer on.

### Payload sections added (all stable keys, may be empty)

- `decomposition` — what each axis resolved to, the tokens it consumed,
  `near-miss`, `residue`, and `resolved-context`.
- `scoring` — the signal→score table the ranking was computed with, so a
  consumer reproducing a ranking never vendors a copy that goes stale.
- `leaves` — leaves as first-class scored results, each carrying `signals`.
- `exclusions` — leaves the query's scope excluded, each with its reason.
- `conduct` — present ONLY on a zero resolution.

## Design decisions

### Scoring table shape (`payload/engine/lib/scoring.js`)

Extracted BEFORE new signals were added, per the survey's prefactor advice.
Two families, deliberately kept apart:

- `CONCEPT_SIGNALS` — the pre-1152 ladder (100/80/60/50/40, −30 draft
  downrank). Highest rung wins; rungs NEVER add. Numbers unchanged and pinned
  by the existing goldens: the extraction moved this arithmetic, it did not
  renegotiate it.
- `LEAF_SIGNALS` — structured joins that DO add up: `operation: 3`,
  `concept: 2`, `term: 1` (the prototype's weights, carried over).

That the two families disagree about adding is the substantive modelling claim.
A concept match is one question asked five ways ("is this the term the user
typed"), so the best answer wins. A leaf's joins are INDEPENDENT questions
(does it declare this operation, this concept, does its term text match), and
independent evidence accumulates.

`leafScore()` returns both the number and the signals that made it, so
`sum(signals[].score) === score` is an invariant a test asserts rather than a
claim a comment makes. An unknown signal scores 0 rather than NaN — a NaN
sorts unpredictably AND serializes to JSON as `null`.

### Threshold and near-miss semantics

Match = every word of a vocabulary phrase is present in the query, each
consuming a DISTINCT token (so "token token" cannot satisfy a two-word phrase
from one token). Word equality is exact or a single trailing `s`
(`token` ~ `tokens`) and nothing else — no stemmer, no edit distance, no
synonym expansion. Deliberate floor: aliases are the governed, warranted
mechanism for "these words mean the same thing", and a stemmer joining
`tooling` to `tool` would be an ungoverned vocabulary decision made by a regex.

Near-miss = the same test relaxed from every-word to any-word, over entries
that did NOT match, reported with the overlapping tokens. Swept across all
three axes, not just concepts — a verb or place can near-miss exactly as a noun
can. Suppressed registry values are never swept: a suppressed value is
accounted for, which is a different fact from never having heard of it.

Registry values contribute two spellings — the identifier as written
(`add-token`) and with separators opened into spaces (`add token`). That is
reading the identifier's own internal structure, which the author put there to
be legible, not fuzzy matching.

### Stopword list provenance

Copied verbatim from the `STOP` set in `search-experience-prototype.html`, this
ticket's executable intent — reproduced rather than re-derived, so the fixtures
cannot disagree with the artifact they were written from. Lives in
`payload/engine/lib/decomposition.js` as `STOPWORDS`.

PINNED and NOT configurable, for the same reason the volatility thresholds are:
residue is a governance signal (it is what gets logged as a retrieval-miss and
eventually minted by literary warrant), and a per-store list would make
"unresolved" mean something different in every repo.

MINIMAL — articles, prepositions, auxiliaries, first-person pronouns, and the
handful of process words that appear in asks without narrowing them
("process", "launch"). It holds NO domain vocabulary: a store that stopworded
its own vocabulary would report clean resolution for asks it never understood.
Over-inclusion is the dangerous direction, so the list errs short. A test
asserts no domain word (`token`, `theme`, `export`, `eaa`, `stencil`,
`registry`, `withdrawal`) is ever in it.

### Exclusion output shape

Fields: `id`, `notation`, `heading`, `file`, `applies`, `asked`, `reason`.

A leaf is excluded when it declares jurisdictions and the query named a
jurisdiction not among them. Published in its own `exclusions` section, never
dropped: "no knowledge about theming tokens for us-ca" and "the knowledge about
theming tokens is eu-eaa-only" demand opposite conduct from a reader, and a
filtered-away leaf makes them indistinguishable.

- Empty `applies` = UNIVERSAL, never excluded. The distinction between
  "applies nowhere" and "applies everywhere" is exactly what an empty array has
  to carry, and it reads as universal because that is what an author who wrote
  no jurisdiction meant.
- A query naming no jurisdiction excludes nothing — with no scope asserted
  there is nothing to be outside of.
- Symmetric: scoping to `eu-eaa` excludes the CA leaf, proving the rule
  is a join and not a pinned special case.

### How leaves became first-class while keeping compat

Extension, never replacement:

- `results` and its concept-attached `knowledge` lists are UNTOUCHED. All 749
  baseline tests pass with no golden edits.
- Concept scores are exactly what they were — the ladder still decides them.
- The noun axis runs TWO joins that answer different questions: the pre-1152
  whole-query ladder (`matchConcept`, which produces the published `score`) and
  a token-level phrase test (does the concept's name appear in the ask at all).
  Only LADDER matches become `results` entries; a concept reached only by the
  phrase test appears in `decomposition.concepts` with `match: null` and gets
  no invented rung. Before this ticket only the ladder existed, so a concept
  the ask genuinely named went unjoined whenever the ask said anything else as
  well — which is every real query.

### Ranking

`rankLeaves` sorts on `downranked` (already the UNION of the stage and time
demotions from UCS-1150) first, then score desc, then id asc. Demotion before
score is deliberate: a high-scoring stale leaf is one whose claims nobody has
re-verified, and ranking it above a fresh lower-scoring answer would put
confidence over currency. Always a demotion, never a filter — the leaf is still
published, still scored, still explains itself.

## Files changed

### New engine modules
- `payload/engine/lib/scoring.js` — the signal→score table, `conceptScore`,
  `leafScore`, `scoringTable`.
- `payload/engine/lib/decomposition.js` — `STOPWORDS`, `tokenize`, `sameWord`,
  `phraseWords`, `phraseHit`, `phraseOverlap`, `mintedValues`,
  `suppressedValues`, `valuePhrases`.

### Resolver
- `payload/engine/commands/resolve.js` — `decompose`, `nearMisses`,
  `scoreLeaves`, `applyScope`, `rankLeaves`, `leafOperations`,
  `leafJurisdictions`, `ZERO_RESOLUTION_CONDUCT`; renderers
  `renderDecomposition`, `renderExclusions`, `renderLeaves`. Local
  `MATCH_SCORES`/`score` replaced by the extracted table.

### Fixture (new scenario store, no pinned scenario mutated)
- `tests/fixtures/resolver-v2/` — a design-system token/theming scenario. 7 registries (operations with a suppressed `archive-theme` and an
  undeclared `retire-token`; jurisdictions `eu-eaa`/`us-ca`; domains, form,
  anchor, stage, authority-tiers), 2 concepts (K-101 Token, K-103 Theme status),
  5 leaves, 1 decision, 2 `src/` files. Passes the structural validator with
  0 findings.

### Tests
- `tests/query-decomposition.test.js` — 35 tests, goldens for all five
  acceptance criteria plus determinism, backward compatibility, and the pure
  functions.

### Docs
- `CHANGELOG.md` — Unreleased/Added entry.

## Gate results

| gate | result |
|---|---|
| `npm run lint` | 184 files, 0 failures |
| `npm test` | 784 pass, 0 fail (749 baseline + 35 new) |
| `npm run acceptance` | OK — all asserted criteria (A1-A4, A6) pass |

## Review round (CodeRabbit on PR #57)

Nine findings. Six fixed, three declined.

### Fixed — two real bugs

**`phraseHit` distinctness was by VALUE, not by occurrence.** `used.includes(token)`
compared token text, so `tokens.find` kept returning the same first occurrence and
rejecting it as already-used. A query genuinely supplying two occurrences of a word
failed to satisfy a phrase needing two: `phraseHit(['token','token'], ['token','token'])`
returned `null`. Now tracked by index with a `Set`, which fixes both directions at once —
two occurrences satisfy two words, and one occurrence can never satisfy two.

**Published output depended on AUTHORING order.** Found by building the reordered twin
fixture the reviewer asked for. Two leaks: `signals` followed the leaf's `terms` array
order, and the published `operations` array passed through unsorted. Both now sorted —
signals within each weight class by `via`, and the declared arrays as sorted copies (never
in place, which would reorder the model every other surface reads). This is a genuine
D-012 violation that no single-store test could have caught: a field published in
authoring order looks perfectly sorted as long as the author typed it in order.

### Fixed — fixture honesty

- `operations.yaml`: three warrants cited `600.1` for operations it has nothing to do
  with. `export-theme` now cites `610.1`/`600.2`/`600.3`, `archive-theme` cites `600.2`, and
  `retire-token` cites `600.4` (which now declares it).
- `100-design-system.yaml`: K-103 ("the lifecycle state a published theme is in") pointed at
  `src/theming/rounding.ts`, a rounding helper with no theme lifecycle in it. Added
  `src/types/theme-status.ts` defining the status union and repointed.
- `600.1`: the body instructed updating "the K-101 concept's enumerated values", but
  K-101 has no `enumerates` descriptor — the leaf told a reader to edit a field that does
  not exist. Reworded to what the fixture actually supports.
- Stale `NJ-DGE`/`MGA` doc examples contradicting the place-not-regulator decision:
  four occurrences across `decomposition.js` and `resolve.js`, all corrected.

### Declined

- **Two MD041 body-H1 findings on fixture leaves.** Fixture leaf bodies carry no H1 by
  design — frontmatter `heading` is the title. Adding one would break the convention every
  other fixture in the repo follows and would change what `firstSentence` reads back as the
  excerpt.
- **`600.1` paths should include the ontology class file.** Declined: `paths` names the
  REPO TREE, and the ontology class file is a store file, not a repo-tree path. Declaring
  it would make `missing-path` validation meaningless and conflate two different pointer
  families. The prose was corrected instead.

## Note for follow-up

Jurisdiction registry values are spelled as the PLACE (`eu-eaa`, `us-ca`)
rather than the regulator acronym (`nj-dge`, `mga`), because a registry value is
joined by its own text and its opened-out spelling. A vocabulary meant to be
joined against human asks has to be spelled in the words humans use. If
acronym-spelled values are wanted, registries need per-value alias lists — a
registry feature this ticket did not introduce.
