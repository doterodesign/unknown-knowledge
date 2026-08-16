# UCS-1156 — Document coverage map: lexicon scan, pinned salience, suppressions, section locators, idempotence

Branch: `ucs-1156-document-coverage-map-lexicon-scan-pinned-salience`
Base: `faceted-store-v2`

## What landed

`resolve --doc <document>` — the third input shape behind the one entry point.
A document is adapted to IR by the UCS-1153 seam, sectioned, and joined section
by section using the SAME query pipeline, producing a coverage map bounded by
content richness rather than document length.

## Files changed, by concern

**New — the coverage engine**
- `payload/engine/lib/coverage.js` — sectioning, pinned salience, candidate
  suppression, section folding, address capping, the gather rollup.

**Modified — the one entry point**
- `payload/engine/commands/resolve.js` — extracted `joinText` (the join core
  both query mode and document mode call), added `--doc` parsing/dispatch/human
  renderer, adapter-refusal handling on the exit contract.

**New — fixtures**
- `tests/fixtures/coverage-docs/launch-plan.md` — the shape/salience/scope
  golden. Exercises all three signatures and the scope-mismatch flag.
- `tests/fixtures/coverage-docs/long-redundant.md` — 50 blocks, 25 sections,
  all saying one thing.
- `tests/fixtures/coverage-docs/short-rich.md` — 12 blocks, many distinct joins.

**New — tests**
- `tests/document-coverage.test.js` — 27 tests, one per acceptance criterion
  plus determinism, exit-contract, and review-round regression coverage.

**Docs**
- `CHANGELOG.md` — Unreleased/Added.

## Design decisions

**Entry point.** Extended `resolve.js` with `--doc`, per the spec's "one entry
point, three input shapes". The decisive move was extracting `joinText` from
`resolveQuery`: query mode calls it with the whole query, `--doc` calls it once
per section. Criterion 1 is therefore true *by construction* — there is one
matcher, so a query and its one-block document cannot disagree. Verified: same
operations, concepts, jurisdictions, leaves, and identical scores.

**Section addressing.** Section = heading text; locator = line range from the
IR's own locators. Sections NEST (a `##`'s range sits inside its `#`'s) so a
parent's locator is honest about what opening it shows. Preamble is its own
section. A format with no headings yields one section — degraded structure,
identical process, no invented boundaries.

Counting uses a *disjoint* partition (`ownBlocks`) while joins/locators use the
nested view. Without this, a nested phrase is counted once per enclosing level
and nesting depth alone pushes terms over the repetition threshold.

**Salience table.** Steps: ≤8→2, ≤24→3, ≤120→4, ≤400→6, else 8. Published in
the map so the candidate list is re-derivable. Two additions the criterion
forced:
- *Concentration* (`count > sections`): boilerplate repeated once per section
  clears any doc-wide threshold in a long document. This is what actually makes
  the richness-not-length criterion hold on substance rather than fixture
  tuning.
- *Determiner stripping*: "The Quiet Period" and "Quiet Period" were
  fragmenting into two candidates, halving the salience count and proposing a
  term with an article bolted on.

Also: `ss` is exempt from the singular fold — candidates are read by a human
deciding whether to mint, and "Refund Basis" must not display as "refund basi".

**Suppression identity.** `{ term, sourcePath }` via `suppressibleBy`, the same
grammar `audit.js` uses, with `sourcePath` = the submitted document (mirroring
`unmatched-anchor`, where it is the path the finding is about). One grammar, so
a steward writes one kind of entry. Consequence, deliberate: suppressing a term
in one document does not suppress it in another — the weaker claim is the right
default, and repetition across documents is itself evidence for a real decision.
Fails open, warnings surface in the payload.

**Dedupe mechanism.** The adapter's content hash travels into the map; nothing
stateful. Byte-identical content produces a byte-identical map under any
filename. A submissions log would be a second source of truth about what was
ingested, against D-012. Read the prototype as not demanding one.

**Emphasis handling — no adapter change.** `md@1`'s `flatten()` collapses
whitespace only, never inline markup, so `**bold**` arrives in block text with
markers intact. No version bump, no invalidated fixture pairs. Stated
consequence: txt/pdf have no emphasis signature and rely on the other two.

**Richness, not length.** Three mechanisms: sections with no signal are
dropped; sections with *identical* coverage fold (keeping every address
openable, exact count retained); address lists cap at 8 with exact overflow
counts — that last one was the only part of the map still growing linearly with
document length.

Measured: redundant (50 blocks) → 2511 bytes, 2 candidates. Rich (12 blocks)
→ 4260 bytes, 5 candidates.

## Acceptance criteria

All six demonstrated by golden tests. Notably: the equivalence pair asserts
identical scores (not just overlapping leaves); the suppression test asserts
the term is both absent from candidates and present in `suppressed`; the
richness test first asserts the redundant doc really is longer, so the
comparison proves something.

## Gates

- `npm test` — 837 pass, 0 fail (baseline 810; +27 new)
- `npm run lint` — 191 files, 0 failures
- `npm run acceptance` — OK

Reordered-store determinism holds: the map is byte-identical against
`resolver-v2-reordered`.

## Review round 1 (CodeRabbit, 5 findings)

All five verified against the code and reproduced before fixing. All five valid,
all fixed, each with a regression test proven to fail against the pre-fix code.

**1. Section address used as identity (major).** `ownBlocks` keyed `owner` and
`byAddress` by `section.address`, a string. Two sections with the same heading
("## Details" under two parents is ordinary authoring) collided. Reproduced:
their prose pooled, so `appear`/`term`/`detail` each cleared the repetition
threshold on *combined* counts they never reach individually; the second section
vanished from the map entirely; both terms were attributed to one ambiguous
address. Same bug in the gather rollup (`entry.sections` de-duplicated by
address) and in candidate tracking. Fixed by keying on the section OBJECT
throughout; the address is now strictly a display label.

**2. Address cap leaking into semantics (major).** `capAddresses` replaced
`candidate.sections` with the capped list, and section membership was then
tested against it. Reproduced with a term spanning 12 sections: sections 9–12
published empty candidate lists and, being otherwise identical, folded into a
*different* group than 1–8 — so the published repeat count measured the display
cap rather than the document. Fixed by carrying the uncapped set on a Symbol key
(`IN_SECTIONS`, same non-enumerable pattern as `SUPPRESSION_IDENTITY`) and
testing membership against it. Capping is now display-only.

**3. One span counted once per signature (minor).** An emphasized Title-Case
phrase matched both patterns and incremented the count twice, inflating salience
selectively for phrases that happen to be both — so ranking partly measured
markup rather than use. Fixed by deduplicating spans by start offset and
recording one occurrence carrying both signature labels.

**4. `suppression-warnings` conditionally present (trivial).** Now a stable key,
empty when clean, like every other field in the payload.

**5. Temp dirs leaked in tests (trivial).** `tempDir(t)` registers `t.after`
cleanup at all eight call sites; runs on failure too.

Side effect worth noting: fixing (1) and (3) removed spurious candidates, so the
redundant fixture's map shrank from 3090 to 2511 bytes — the richness-not-length
margin widened.

## Notes for review

The `joinText` extraction touches the existing query path. It is
behavior-preserving — `tests/resolve.test.js` and
`tests/query-decomposition.test.js` (76 tests) passed unchanged immediately
after the refactor and before `--doc` existed.
