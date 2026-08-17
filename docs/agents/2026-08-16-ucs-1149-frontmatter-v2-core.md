# UCS-1149 — Frontmatter v2 core: facets, operations, applies, authority tiers, provenance, draft stage

**Branch** `ucs-1149-frontmatter-v2-core-facets-operations-applies-authority`
**Commits** `d51836c` (implementation), `8c6548e` (review round 2), `df5be95` (review round 3) · **PR** [#54](https://github.com/doterodesign/unknown-knowledge/pull/54) (base `faceted-store-v2`, open, not merged)
**Gates** `npm test` 696 pass / 0 fail (baseline 666) · `npm run lint` 0 failures / 178 files · `npm run acceptance` OK

---

## What landed

The leaf classification layer, built entirely from governed vocabularies. Time facets
(`verified`/`volatility`) and typed edges (`concepts`/`paths`/`relates`) were deliberately
left to later tickets — the clean fixture asserts them absent so it cannot quietly acquire
them ahead of the ticket that owns them.

## Files changed, grouped by concern

### Schema — the record shape
- `payload/schemas/knowledge-leaf.schema.json` — removed `description`; added
  `facets.form`, `facets.anchor`, `facets.stage`, and an optional
  `provenance: { author, skill-version }`. Top-level schema description records the
  sanctioned v2 break.

### Registries — three new governed vocabularies
- `payload/templates/knowledge/_registries/form.yaml` (new, seeds empty)
- `payload/templates/knowledge/_registries/anchor.yaml` (new, seeds empty, header names D-003's vocabulary)
- `payload/templates/knowledge/_registries/stage.yaml` (new, seeds empty, header names the predicate's vocabulary)
- `cli/kit.manifest.yaml` — all three manifest-listed (manifest ⊆ payload guard)

### Engine — membership, predicate, surfaces
- `payload/engine/commands/validate.js` — three rows added to `FACET_REGISTRIES`; new
  `missing-authority` check in `checkCitations` (added to `CHECKS`); blank-value skip in
  `checkOneRecord`.
- `payload/engine/lib/load-stores.js` — new `leafStage`, `selectLeaves`, `leafIdentityOf`,
  `UnknownLeavesError`; docstring on `isPrePromotionStatus` records that leaves now ride it.
- `payload/engine/commands/resolve.js` — new exported `firstSentence`; entry points publish
  `stage`, `excerpt`, `provenance`, `downranked` and sort promoted-first; human renderer shows
  the draft marker and the excerpt.
- `payload/engine/commands/preflight.js` — new `--leaves` flag, `computeLeafVerdicts`,
  `degradeAllLeaves`, `unknown-stage` next action; counts and gating span both verdict lists.

### Fixtures
- `tests/fixtures/structural-validator/frontmatter-v2/` (new) — clean v2 store, two leaves
  (verified + draft), seven registries, validates exit 0 with zero findings.
- `tests/fixtures/structural-validator/frontmatter-v2-findings/` (new) — one leaf violating
  every governed field; exactly seven findings.
- `tests/fixtures/resolver/store/knowledge/payments/410.{1,2}-*.md` — v2 records; 410.2 is now
  `stage: draft`, giving the resolver suite a natural downrank case.
- `tests/fixtures/loader/healthy/.../362.1-*.md` — `description` removed.
- `fixtures/ts-app/unknown-knowledge/knowledge/_registries/*.yaml` (new, 7 files) +
  `product/100.1-*.md` — the reference client fixture now carries the full v2 record.
- `fixtures/ts-app/FIXTURE.md` — planted inventory kept true.

### Tests
- `tests/frontmatter-v2.test.js` (new, 22 tests) — every acceptance criterion, both review-found bugs.
- `tests/validate-record.test.js` — `LEAF_YAML` is now the canonical v2 record; three new tests
  (governed facets, description retirement, provenance).
- `tests/resolve.test.js`, `tests/accession-ids.test.js` — goldens extended to the v2 key set.
- `tests/registries.test.js` — facet declaration roster; template test now reads the directory
  rather than a hardcoded list, so an eighth registry cannot ship unchecked.
- `tests/validate.test.js` — `CHECKS` roster.

### Docs
- `payload/protocol/skills/kb-build.md` — teaches the v2 fields, `stage: draft` as the starting
  point, and the topic-sentence requirement.
- `acceptance/A5-kb-build-walkthrough.md`, `CHANGELOG.md`.

---

## Design decisions and rationale

### 1. form / anchor / stage as registries, extended by declaration
Three new registry files following the `_registries/` pattern, and three rows in
`FACET_REGISTRIES`. The checker learned nothing — that table is the seam UCS-1148 built for
exactly this, so a governed facet costs a declaration rather than a membership branch. Pinned
by a test asserting the three rows exist, are frozen, and declare `hierarchical: false`.

### 2. All three ship EMPTY — including anchor and stage (departs from the ticket's suggestion)
The ticket leaned toward seeding `anchor` and `stage`, since their vocabularies are kit-defined
rather than per-project. That reasoning is right about the *vocabulary* and wrong about the
*file*, and the distinction is load-bearing.

A registry value must cite a Decisions entry that **resolves** (UCS-1148 — the citation rides
the ordinary ref graph). A freshly seeded repo's decisions store is empty by design (D-001: the
kit does not write entries into a repo it just handed over). So seeded values citing the kit's
own D-003 would hand every client a broken `unresolved-ref` on their first validation run.
`tests/load-stores.test.js:255` ("the empty payload templates load healthy with zero
diagnostics") pins exactly that contract, and it failed when I first tried seeding — which is
how the tension surfaced rather than shipping.

Resolution: the values ship as **documentation in each template's header**, naming the exact
values to mint and stating that they are not the project's to invent — for `anchor`, D-003's
three truth anchors; for `stage`, the values `isPrePromotionStatus` reads. The bootstrap
interview mints them with the client's own Decisions entry. A test asserts each header names
its vocabulary and cites its authority, and that `form` (the ordinary case — a project
judgement, like domains) does *not* claim to be fixed.

### 3. stage → the shared pre-promotion predicate
`isPrePromotionStatus` is unchanged and untyped as to what it judges. A new `leafStage(record)`
is the single reader of the `facets.stage` spelling. Both surfaces call
`isPrePromotionStatus(leafStage(record))`; neither spells `facets.stage` nor enumerates
draft/proposed itself. That is what makes divergence structurally impossible rather than merely
tested-against.

Preflight genuinely had **no leaf surface** (verdicts were keyed on `concept`, selected by
`--concepts`). I implemented the minimal honest version: `--leaves <ids>`, accepting either
legal leaf spelling (accession or notation, deduped by identity), emitting `leaf-verdicts`
counted and gated with concept verdicts. Leaf evidence is structural only — a leaf carries no
descriptor, so there is no value-check half, and that is stated rather than silently implied by
an empty list. A `--concepts`-only run is unchanged in shape (`leaf-verdicts` omitted, not
emitted empty), pinned by a test.

### 4. Downrank is a demotion, not a filter
A draft leaf still surfaces, sorted below every promoted entry point and flagged
`downranked: true`. It is the best answer when it is the only answer, and hiding it would send
the reader off to invent one. Ordering is stable by construction (a boolean comparator over an
already-sorted map).

### 5. description retirement — and what it actually cost
Removed from the schema, so `additionalProperties: false` makes it fail as an unknown property.
A pre-implementation survey established that **nothing read it**: no engine code, no protocol
instruction, no test assertion, no rendered output. It was a write-only field.

That reframed the "derived excerpts appear where display prose is needed" criterion.
`resolve.js` `knowledgeEntryPoints` is the single seam publishing leaf prose (heading only,
before this), so the excerpt lands there — making it the *first* time a leaf one-liner is
displayed anywhere, not a restored surface.

`firstSentence` is deliberately literal: skips markdown structure, flattens the first paragraph
(bodies are hard-wrapped, so a sentence routinely spans lines), ends at `.`/`!`/`?` followed by
whitespace (so `§4.2` and `v3.2` do not truncate), and returns an unterminated paragraph whole
rather than null. A clever extractor that guesses wrong is worse than a plain one that
occasionally returns a long line.

### 6. missing-authority is opt-in on the registry existing
A citation with no tier is a finding — but only in a store carrying an authority-tiers registry.
This is UCS-1148's opt-in conduct applied one level up, not a softening of it: a store with no
such registry has no vocabulary to draw a tier from, so demanding one would fail every leaf
twice for a governance layer it never opted into. Adding the registry *is* the opt-in, and it is
the steward's to make. Pinned in both directions.

Kept as a separate code from `unregistered-value` because "you left it out" and "that tier does
not exist" send an author to two different edits.

### 7. provenance is recorded, never judged
`{ author, skill-version }` — the prototype (`faceted-store-prototype.html`) has **no**
provenance block, so the field names come from the ticket. No registry governs it: an author
name is a fact about how the entry came to exist, not a vocabulary. Spelled field-by-field in
the resolver rather than spread, so a later provenance field cannot leak into published output
before anyone decided it should be public.

### 8. Additive-over-baseline
`tests/store-schemas.test.js` "schemas stay inside the keyword subset the engine interprets"
stays green — no new JSON Schema keywords were introduced. The `description` removal is the one
sanctioned break, noted in the PR body and CHANGELOG as the D-021 major release trigger.

---

## Two bugs found in review and fixed

1. **`degradeAllLeaves` did not resolve leaf aliases.** A leaf named by notation would have
   reported under the caller's spelling with a null stage on a broken store, and under its
   accession with its real stage on a healthy one — the same leaf wearing two names for a reason
   unrelated to its name. Extracted `leafIdentityOf` so both paths translate identically. Pinned
   by a test that breaks a store loader-side and compares both paths.
2. **A blank governed value double-reported.** `authority: ""` earned both `missing-authority`
   (from the absence check) and `unregistered-value` (from the membership walk, since `""` is a
   string) at one path. A blank is an omission wearing a string; the membership walk now skips
   it so the check that owns absence reports alone. Pinned.

## Second review round (CodeRabbit CLI, 8 findings → `8c6548e`)

6 fixed, 2 declined (MD041 fixture-heading recycles — standing justification: fixture leaf
bodies carry no H1 because frontmatter `heading` is the title). Each finding was reproduced
against running code before being fixed.

1. **Blank governed facet was a silent pass** (the serious one). My earlier blank-skip — added
   to stop `authority: ""` double-reporting — was too broad: `facets.stage: ""` and
   `facets.form: "   "` yielded **zero findings at exit 0**, a governed field ungoverned by an
   empty string. Fixed by declaration rather than a hardcoded name: rows may carry
   `blankOwnedBy`, naming the check that owns that field's absence. Only `citations[].authority`
   has one, so only it defers; everything else judges blanks itself. A test asserts every
   `blankOwnedBy` names a real check class.
2. **`deprecated` stage minted with no semantics.** Verified a `stage: deprecated` leaf
   validated clean, ranked *above* the draft leaf, and preflight verdicted it `trusted`. The
   report's cited line range was wrong (it pointed at `isPrePromotionStatus`'s docstring, not a
   lifecycle table) — which makes the concern stronger, since there is no leaf lifecycle
   handling at all. **Dropped** the value across template, three fixtures, and CHANGELOG;
   vocabulary is now draft/proposed/verified, the omission is stated in each file, and a guard
   test refuses any stage value no surface acts on. Retiring a leaf lands with its semantics in
   a later ticket.
3. **`firstSentence` skipped structure by block, not by line.** `# Title\nThe real opening.`
   returned null — a heading needs no blank line after it, so heading and prose were one block
   and the block was discarded. Now line by line, with prose stopping *at* the next structural
   line so an excerpt never shows markup. Twelve cases pinned.
4. **`degradeAllLeaves` did not de-duplicate.** One leaf named by both spellings emitted two
   verdict rows on a broken store where the healthy path emitted one. Now dedups by identity
   like `selectLeaves`; distinct unresolved ids stay distinct rows.
5. **Inaccurate fixture comment.** The findings store's `jurisdictions.yaml` had been copied
   from the clean fixture and described leaves "claiming universally" while its own leaf claims
   `[nj-dge]`. Rewritten, and it now draws the distinction the original blurred: an empty
   *registry* means nothing minted; an empty *list on a leaf* means universal.

## Third review round (prose accuracy, 9 findings → `df5be95`)

6 fixed, 3 declined (MD041). Two were framed as wording problems and turned out to be code defects.

1. **Authority tiers claimed ranking nobody implements.** Seven sites — including the
   user-facing `missing-authority` finding message — said the tier "ranks a source against a
   conflicting one" and that an untiered citation "opts out of conflict resolution". Nothing in
   the engine compares tiers; ranking belongs to the resolution pipeline (UCS-1152). Rewritten
   to state what the tier does today (records how far a source can be trusted) and to place
   ranking in the future, noting a tier nobody recorded cannot be ranked retroactively. A guard
   test refuses shipped prose claiming ranking as present behaviour — checked per *paragraph*,
   since these are hard-wrapped comment blocks and a line-based version flagged its own
   disclaimer.
2. **Fenced code leaked into excerpts.** The ask was `~~~` alongside ```` ``` ````; adding it
   exposed the real bug. Fences were matched as *lines*, so markers were skipped and the code
   *between* them read as prose — `~~~\ncode();\n~~~\n\nThe prose.` published `"code();"`.
   Backticks were equally affected. Fences are now tracked as **state** and skipped whole; an
   unclosed fence runs to end of body. 16 cases pinned.
3. **Schema said anchor/stage registries "SEED".** Direct contradiction of the empty-shipping
   decision documented everywhere else. Both descriptions now carry both facts: vocabulary
   fixed by the kit, file ships empty because values need a resolvable Decisions ref (D-001).
4. **`kb-build.md` misdescribed the deriver.** It warned an opening fragment or heading leaves
   "nothing to show"; in fact unterminated prose is returned whole and headings are skipped in
   favour of the prose beneath. Replaced with the actual behaviour and the real failure mode
   (a body that is *entirely* structure).
5. **CHANGELOG preflight wording** tightened — names the `unknown` verdict, both triggering
   stages, and the exit-2 gate.
6. **`FIXTURE.md` warrant claim.** "Every value carries a warrant naming the material that
   needed it" held for only four of seven registries. The fixture carries three rationale kinds
   — material-based, fixed-vocabulary, lifecycle — now documented as such.

## Not done, by design

- Time facets `verified`/`volatility` and typed edges `concepts`/`paths`/`relates` — later tickets.
- A `deprecated` leaf stage — dropped in review (see above); it needs demotion semantics, which
  is a design question this ticket's scope does not cover.
- The legacy ungoverned `domain`/`division` fields still coexist with `facets.domain`; the schema
  already flags this as unresolved, and the ticket did not ask for the retirement.
- PR not merged, per instruction.
