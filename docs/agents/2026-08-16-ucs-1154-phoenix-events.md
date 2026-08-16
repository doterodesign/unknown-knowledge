# UCS-1154 — Phoenix events: edition bump with leaf-granular mapping, applied by the engine

Branch `ucs-1154-phoenix-events-edition-bump-with-leaf-granular-mapping` ·
commit `bfac053` · PR [#63](https://github.com/doterodesign/unknown-knowledge/pull/63)
(base `faceted-store-v2`) · gates: `npm test` 884 pass / 0 fail, `npm run lint`
196 files 0 failures, `npm run acceptance` OK.

## What landed

`phoenix.js` — the ninth engine surface and the first that **mutates** a store.
It applies a governed bulk re-taxonomy: a drifted subtree's facets are rewritten
from a leaf-granular mapping, every moved leaf's `edition` is bumped, and the
whole thing lands as an ordinary PR carrying a Decisions entry.

## Files by concern

**The command** (two-file shim pattern)
- `payload/engine/phoenix.js` — entry shim, statically imports nothing
- `payload/engine/commands/phoenix.js` — CLI, arg grammar, output, exit codes
- `payload/engine/lib/phoenix.js` — the gate, the rewriter, the cross-check rule

**The record kind**
- `payload/schemas/phoenix-event.schema.json` — mapping shape
- `payload/engine/lib/validate-record.js` — registers the `phoenix-event` kind
- `payload/engine/lib/load-stores.js` — `PHOENIX_DIR`, `loadPhoenixFiles`,
  `model.phoenix`, the `phoenix: true` descriptor flag on the knowledge store,
  and two diagnostic codes (`phoenix-name-mismatch`, `duplicate-phoenix-row`)

**The validator cross-check**
- `payload/engine/commands/validate.js` — `checkEditions`, the
  `unaccounted-edition` code, added to `CHECKS`

**Governance surface**
- `payload/templates/decisions/phoenix-event.yaml` — the Decisions-entry template
- `cli/kit.manifest.yaml` — ships it (payload-coverage test requires the entry)
- `payload/docs/steward-guide.md` — a review checklist for a phoenix PR

**Fixtures and tests**
- `tests/fixtures/phoenix/split/` — the pre-event store (the prototype's demo)
- `tests/fixtures/phoenix/split-after/` — the golden after-state, plus a README
  walking the diff
- `tests/fixtures/phoenix/incomplete/` — mapping misses a leaf in scope
- `tests/fixtures/phoenix/unknown-leaf/` — mapping names an absent accession
- `tests/phoenix.test.js` — 34 tests

**Docs / pinned lists** — `README.md` (Eight → Nine + table row), `CONTEXT.md`
glossary prose, `CHANGELOG.md`, and four test-side pins:
`tests/context-glossary.test.js`, `tests/exit-code-contract.test.js` (ARGV +
EMITS_FINDINGS), `tests/validate-record.test.js` (KINDS),
`tests/validate.test.js` (CHECKS).

## Design decisions

**Verbs.** `--check` (default, read-only) and `--apply`. The safe reading of a
bare `phoenix` is the one that cannot damage a store; naming both verbs is a
usage error rather than a silent pick of the destructive one.

**Exit contract.** A refused mapping is **1 (findings)**. Precedent: exit 1 means
the run happened and the input has defects its author fixes — exactly what a
mapping that misses a leaf is. Exit 2 stays "never ran": unreadable store, no
such event, or a store the loader rejects (which also refuses to run, because
every scope verdict would be computed from a model already known to be wrong).

**All-or-nothing.** `planEvent()` decides and reads; `applyRewrites()` writes.
Two functions, so an interleaved write cannot be introduced without deleting the
seam. Every check runs against the whole mapping before any byte is written.
Tests assert byte-equality of all three leaves after a refused `--apply` — the
valid rows in those fixtures would each have applied cleanly alone.

**Write strategy — surgical line rewriting.** `rewriteScalarLine` finds the one
frontmatter line declaring a field at its indent and replaces the text after the
colon; every other byte is copied through. Chosen over YAML round-tripping
because re-serializing reformats the entire document (quoting, flow vs block,
blank lines, comments), which would make "citations byte-identical" a property
to verify rather than one that holds by construction, and would turn a two-line
change into an unreadable diff. Bounded to the frontmatter (stops at the closing
fence, so a body line that looks like a field is prose) and refuses shapes it
cannot edit surgically — a flow mapping or a missing field is an
`unrewritable-leaf` finding **at the gate**, never a reformat.

**Mapping shape.** Per-accession rows. `to:` moves; absent `to:` is
**carried forward** — considered, deliberately unmoved, and explicitly *not* an
edition bump, because the edition records that a leaf changed, not that it was
reviewed. A split is two rows from one predecessor to different successors.
Successors are existing leaves re-filed; the mapping carries no frontmatter or
bodies. New facet values must already be minted in the registry (with warrant
and decision), so an event cannot invent vocabulary — `facet-unminted` otherwise.

**Scope completeness.** Scope is declared as facet values, not ids: an event
enumerating its own membership could not *miss* a leaf. Membership is derived
from the store and the mapping held against it. Hierarchical values claim their
subtree segment-wise, so `sportsbook` claims `sportsbook/odds-feed` but not
`sportsbook-legacy`.

**Phoenix-record cross-check.** Mappings are retained at
`knowledge/_phoenix/<event>.yaml` so the rule is checkable from the working tree
with no git history. The rule is an **equality**:

    edition === 1 + (retained events that moved this leaf)

A floor ("some event mentions this leaf") would accept `edition: 4` on a leaf one
event moved once — the check would pass while the field means nothing. This was
found by a failing test mid-implementation and the rule was tightened; it now
also catches an edition that *lags* its event, and a mapping landed in a PR that
forgot to run `--apply`.

## Consequence worth knowing

A store holding a retained mapping whose event has **not** been applied is now a
validator finding. That is intended — it is the state a phoenix PR is in before
the engine runs, and it means such a PR cannot merge green. The fixture
`tests/fixtures/phoenix/split/` is deliberately in that state, and a test pins
it.

## Review round — CodeRabbit on PR #63

14 findings; 10 accepted and fixed, 3 declined (standing MD041 decline: no
markdownlint in the repo, frontmatter `heading` is the title, and a body H1
would change firstSentence excerpts), 1 partial. Gates after: **895 pass / 0
fail**, lint 196 files 0 failures, acceptance OK.

**CRITICAL — the rewriter matched on key name without checking indentation.**
Reproduced both corruptions before fixing. Depth 0 accepted a key at any indent,
so frontmatter containing `citations:\n  edition: 3\nedition: 1` rewrote the
CITATION's line and left the leaf's real `edition` untouched — editing exactly
the bytes the module's headline claim says can never change. Descent only
checked `indent > parentIndent`, so a grandchild (`facets.meta.domain`) stood in
for the direct child (`facets.domain`). Fixed by making indentation part of the
match at every level: top-level fields must sit at column 0, and each nested
level's indent is learned from the first key line inside its parent block (so
the rewriter reads the document's own step rather than assuming two spaces).
Deeper lines are grandchildren and are skipped; shallower means the block ended
without the field, which is a refusal. Four regression tests, including the
citations-shadow case asserting the shadowed line is byte-identical.

**MAJOR — predicate mismatch between applier and validator.** `planEvent`
treated a no-op row (`to` equal to the leaf's current value) as carried-forward,
while `unaccountedEditions` counted every `to`-bearing row as a move: applying
such an event succeeded and the validator then declared the store broken.
Verified by reproduction. Fixed upstream rather than by teaching one predicate
about the other — a no-op row is now refused (`noop-row`), which makes "`to`
present ⇔ moved" true by construction. Rows carry no `from`, so after the fact a
no-op row is genuinely indistinguishable from a move that already applied; the
honest fix is to make the steward write the intent they meant. Added a
two-event case pinning edition 3 = 1 + two moves.

**MAJOR — `why` was optional on a move.** Now an `unexplained-move` finding.
Enforced at the gate, not in the schema: `dependentRequired` is not in
`SUPPORTED_KEYWORDS`, and per instruction the validator was not grown for it —
a rule stated in a keyword nothing interprets would be contract drift wearing
the appearance of a check. The schema description says where the rule lives.

**MAJOR — `--apply` write failure escaped with no output.** `applyRewrites` now
takes a caller-owned array it pushes each written file into, so the list
survives the exception. The command catches, prints the files in write order
with a revert instruction, and returns exit 2 (the event did not finish; exit 1
would claim a clean refusal with nothing written). Tested with a read-only leaf
that sorts last, guarded by a `W_OK` probe so it self-skips under root. Note the
first attempt (swapping the file for a directory) was caught by the gate as
`unknown-leaf` — the file has to be readable at probe time and unwritable at
write time to reach the path at all.

**PARTIAL — re-running an applied event.** Kept the refusal (a second `--apply`
must never bump an edition twice for one move), improved the message: when the
leaf already sits at the row's target, it now says the event appears already
applied rather than the generic out-of-scope text, which read like a broken
mapping.

**MINOR** — facet values now go through a YAML round-trip check and are quoted
only when they would not survive bare; a round-trip is the honest test because
the hazard is wider than digits (`1e5`, `0o7` drift too) and no hand-written
list of YAML's traps can fall behind. Parity test gained the reverse assertion
(a validator facet phoenix cannot move is a silent gap). Steward guide switched
to the seeded `node unknown-knowledge/engine/...` path used elsewhere in the
file; fences left untagged to match. Fixture `stage.yaml` warrants no longer
state a falsehood about the store they sit in (all three leaves are `verified`,
not draft), and the jurisdictions comment says "Every leaf" rather than "Both" —
fixed in all three fixture copies.

## Review round 2 — CodeRabbit on 415d051

12 findings; 6 accepted and fixed, 3 declined (MD041 again), the rest folded in.
Gates after: **898 pass / 0 fail**, lint 196 files 0 failures, acceptance OK.

**MAJOR — the flagship fixture was not a split.** The most valuable finding of
either round, and correct. P-001 sent BOTH `sportsbook/odds-feed` leaves to
`feeds/ingest` and the lone `sportsbook/settlement` leaf to `feeds/settlement`:
two renames wearing the word "split". No predecessor branched to two successors,
so the fixture never exercised the one property that justifies leaf-granular
mapping at all — and the header comment narrated a split its own rows did not
perform. Fixed by making L-000133 (banker's rounding) MISFILED under
`sportsbook/odds-feed` in the before-state, which is both the honest story and a
better one: settlement material filed under odds-feed because it arrived with a
feed integration is exactly the drift a phoenix event exists to fix. Now one
predecessor branches to two successors and a class-level rule would be right
about two leaves and wrong about the third. Scope narrowed to `odds-feed` alone;
`sportsbook/settlement` dropped from the registry (no leaf left to warrant it);
D-420 and D-401 narratives rewritten in all three fixture copies; README rewritten
with the predecessor/successor table. The golden pair was REGENERATED by running
`--apply`, never hand-edited, and re-verified byte-identical against a fresh run.
The split test now asserts the branching property directly (one `from`, two `to`)
so the fixture cannot quietly stop being a split again.

**MAJOR — the in-flight file was omitted from the revert list.** `writeFileSync`
is not atomic: it can truncate a file and then fail partway through the contents,
so the file whose write threw may be damaged. It was recorded only on success,
leaving the one file most likely to need reverting off the list. Now recorded
BEFORE the write and flagged in the output (`<- the write failed here; this file
may be truncated`). Over-reporting an untouched file costs a reviewer one
`git checkout`; under-reporting a truncated leaf costs them the leaf.

**MINOR — trailing comments were deleted.** The rewrite replaced everything after
the colon, so a steward's `# ∈ registry (Personality)` — which the prototype's own
leaf carries on these exact lines — vanished inside a diff advertising itself as
two lines. Carried through now, alignment included. A line whose value could hide
a `#` inside quotes is refused at the gate rather than guessed at, since telling
a comment from a quoted hash needs a YAML scanner and every value this engine
writes is a plain registry term.

**TRIVIAL** — a real leaf outside the declared scope now gets its own
`out-of-scope-row` code instead of reusing `unknown-leaf` (an overreach and a
typo are different defects, and a consumer filtering on codes should not have to
read prose); the test's `citationBlock` helper is bounded at the closing fence;
the root-privilege case calls `t.skip` with a message rather than returning
silently.

## Review round 3 — CodeRabbit on 7a05815

No majors. 3 small accepts, 3 recycled MD041 declines. Gates after: **899 pass /
0 fail**, lint 196 files 0 failures, acceptance OK.

- **Orphaned JSDoc.** Round 2 inserted `trailingComment` directly beneath
  `yamlScalar`'s doc block, leaving both docs stacked above the wrong function.
  Reordered so each precedes its own. Self-inflicted in the previous round —
  worth noting as the kind of thing that only shows up when someone reads the
  file top to bottom rather than diffing it.
- **Hardcoded store prefix.** The command named `knowledge/` for event lookup
  and in two messages, while the loader derives phoenix capability from
  `STORE_DESCRIPTORS[store].phoenix`. A second store gaining the flag would have
  its events loaded into `model.phoenix` and unreachable from the CLI — present
  in the model, absent from every lookup. Added `PHOENIX_STORES`, derived from
  the descriptors, and the command now searches all of them; the missing-event
  and usage messages name the derived path. User-facing output is byte-identical
  today (one capable store), so this is pure decoupling. Pinned by a test that
  also asserts each entry is a real store the loader walks.
- **`halves()` precondition.** Asserts the closing fence was found before
  slicing, matching what `citationBlock` already did, so a malformed fixture
  fails loudly instead of comparing two equally nonsensical halves.

## Not done

Not merged, per instructions. `--apply` still writes in place rather than
write-to-temp-then-rename; the failure is now *reported* precisely rather than
prevented, which is the smaller change and keeps the write path minimal.
