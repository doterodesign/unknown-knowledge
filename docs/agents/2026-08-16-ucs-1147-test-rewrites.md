# UCS-1147 — test rewrites for the contract phase

Date: 2026-08-16
Branch: `ucs-1147-contract-notation-demoted-to-optional-legacy-field-accession`
Scope: `tests/*.test.js` only. No engine, schema, or fixture file was edited.

## Outcome

- `npm test` — **849 tests, 849 pass, 0 fail, 0 skipped** (exit 0). Was 30 failures across 8 files.
- `npm run lint` — **192 files checked, 0 failures**.
- `npm run acceptance` — OK, all asserted criteria (A1–A4, A6) pass.
- `tests/load-stores.test.js` NUL bytes preserved (2 bytes, now line 295 — the line
  itself was never rewritten; it shifted because edits landed above it).

## Files changed

| File | Insertions / deletions | Nature of change |
| --- | --- | --- |
| `tests/accession-ids.test.js` | +709 / −… | Header rewritten; 5 dual-shape pins deleted or inverted; 5 new contract pins; 2 new sharding tests |
| `tests/citation-migration.test.js` | +245 / −… | Header and scope prose rewritten; EXEMPT shrunk 13 → 1 |
| `tests/frontmatter-v2.test.js` | +59 / −… | 3 `--leaves` selector tests migrated to accessions; one rewritten to the inverted contract |
| `tests/id-grammars.test.js` | +48 / −… | 1 test inverted; 1 new test for the narrowed `leaf-ref` |
| `tests/load-stores.test.js` | +33 / −… | 4 goldens moved to accessions |
| `tests/ref-graph-declaration.test.js` | +24 / −… | Synthesized leaf given `id` + `schema-version: 2`; dangling target respelled |
| `tests/resolve.test.js` | +18 / −… | 2 goldens: `id: null` → real accessions |
| `tests/typed-edges.test.js` | +52 / −… | 1 golden moved; 1 dual-shape pin rewritten |

---

## Retired contracts — full inventory (for the PR's "retired contracts" section)

### DELETED outright

1. **`tests/accession-ids.test.js` — "the leaf-ref grammar accepts either shape, and is
   composed from both"**
   Asserted `leaf-ref` matched both `L-000101` and `362.1`, that the union pattern
   contained each member's anchor-stripped body verbatim, and that the hint named both
   shapes. Nothing survives: `leaf-ref` is a single pattern with no members.
   Replaced by *"the leaf-ref grammar is the accession grammar, and refuses a notation"*.

2. **`tests/accession-ids.test.js` — "the union refuses a member that is not anchored at
   both ends"**
   Existed only to guard the private `union()` / `body()` composition helpers against
   mis-stripping a member's `^`/`$` (including the escaped-literal-dollar case). Those
   helpers were deleted from `id-grammars.js`, so there is no composition left to guard.
   No replacement — the hazard is structurally gone, not merely untested.

3. **`tests/accession-ids.test.js` — "a leaf with no accession is indexed by notation
   exactly as before"**
   Pinned the expand phase's safety property (`model.leaves.keys() === ['362.1','362.2']`,
   `leafAliases.size === 0`, `leaves.get('362.1').id === null`). The property inverted.
   Replaced by the NEW pin *"a leaf with no accession is a missing-required finding naming
   the migration"*.

4. **`tests/accession-ids.test.js` — "a notation-only store resolves identically apart
   from the added field"**
   The golden diff proving `id: null` was a legal published value for an unminted leaf,
   and that stripping the added keys reproduced pre-UCS-1144 output byte for byte. There
   is no unminted leaf any more. Replaced by the NEW pin *"the published leaf id is ALWAYS
   the accession, and notation is never identity"*.

5. **`tests/accession-ids.test.js` — "cross-references, relates-to and catalog rows accept
   either id shape"**
   Read a deliberately MIXED accessioned fixture: `L-000101 → 700.2` by notation,
   `L-000102 → L-000101` by accession, `relates-to.leaves` as
   `[['700.2', true], ['L-000101', true]]`, catalog ids as `['L-000101', '700.2']`.
   Rewritten in place to *"cross-references, relates-to and catalog rows name leaves by
   accession"* — same three sites, now uniformly accession-form.

6. **`tests/accession-ids.test.js` — the notation half of "a notation collision is caught
   whichever leaf loads first"**
   Two of its three cases (`notation-only first`, `accessioned first`) were about a
   NOTATION being claimed as an identity or as an accessioned leaf's alternate spelling.
   Neither is a collision now. Rewritten to *"an accession collision is caught whichever
   leaf loads first"*, and a NEW control was added asserting two leaves may freely share
   one notation — a fact that would have been a hard error under the old contract.

7. **`tests/typed-edges.test.js` — "neighbors resolve under either legal citation
   spelling"**
   Its subject was fixture 501.2 citing 501.3 by notation while 501.3 carried an
   accession, plus a read of `model.leafAliases.get('501.3') === 'L-000503'`.
   Rewritten to *"a neighbor is published by IDENTITY, and its notation is only a label"* —
   keeps the surviving half (a neighborhood entry publishes identity, carries notation as
   a display label) and now asserts `model.leafAliases === undefined` and
   `model.leaves.has('501.3') === false`.

8. **`tests/frontmatter-v2.test.js` — "--leaves names a leaf by EITHER spelling, and an
   unknown id is exit 2"**
   Asserted `--leaves 213.1` resolved to `L-000213`, and that `213.1,L-000213` collapsed
   to one verdict. Rewritten to *"--leaves names a leaf by its accession; a notation is an
   unknown id (exit 2)"*: the accession path plus its de-duplication survive, and the
   notation selector is now pinned as an **exit 2 unknown id** with the message
   `--leaves names id(s) not in the knowledge store: 213.1`.

9. **`tests/accession-ids.test.js` — "log-fragment leaf refs accept either shape"**
   Asserted `consulted.leaves: ['L-000101', '700.2']` validated clean for `finding` and
   `gap`. Rewritten to *"log-fragment leaf refs take accessions, and only accessions"*:
   the accession pair still validates, and the mixed pair is now a `pattern-mismatch`
   attributed to `consulted.leaves[1]`.

10. **`tests/accession-ids.test.js` — the migration-state half of "minting grammars stay
    strict: a leaf cannot mint an accession into notation"**
    Asserted `leaf({ notation: '700.1' })` (no `id`) validated with zero errors — the
    "migration state" comment said so explicitly. Rewritten to *"the legacy notation
    grammar survives as a LABEL grammar, not an id space"*: the two cross-minting
    refusals survive, the unminted-validates-clean case is deleted, and a new assertion
    pins that a leaf with an `id` and NO notation is well-formed (the notation is now
    optional).

11. **`tests/id-grammars.test.js` — "the engine validates leaves against the module, not
    the schema file copy"** (dual-shape half)
    Built its leaf from a notation ALONE, which validated clean and so doubled as a pin on
    the notation being a leaf's identity. Rewritten: the leaf now carries `id: L-000362`
    and `schema-version: 2`, and a new closing assertion inverts the old implicit claim —
    dropping the accession yields `[['id', 'missing-required']]`.

### REWRITTEN goldens (fixture data moved; the pinned property did not)

- `tests/load-stores.test.js` "healthy store: entries indexed by id in each id space" —
  `['362.1','362.2']` → `['L-000362','L-000363']`; leaf lookup key changed; added an
  assertion that `leaf.notation === '362.1'` still rides along as a published field.
- `tests/load-stores.test.js` "healthy store: cross-ref graph edges are typed and
  resolved" — leaf edge is now `from: 'L-000362' … to: 'L-000363'`, and **moved from the
  first row to the last** because `refs` sorts by `from`. Commented as a real diffability
  consequence, not a cosmetic reshuffle.
- `tests/load-stores.test.js` "unresolved-ref: messages name the missing id and its store"
  — `/"999\.9".*knowledge/` → `/"L-000999".*knowledge/`.
- `tests/load-stores.test.js` "unresolved-ref: the graph still records dangling edges as
  resolved: false" — `['999.9','D-777','K-888','K-999']` → `['D-777','K-888','K-999','L-000999']`
  (also a re-sort).
- `tests/resolve.test.js` "results carry SSOT pointers, confusable-with, and knowledge
  entry points" — `id: null` → `id: 'L-000411'`.
- `tests/resolve.test.js` "v2: a draft-stage leaf is downranked, and provenance
  round-trips untouched (golden)" — `id: null` → `id: 'L-000410'`.
- `tests/typed-edges.test.js` "the hop is exactly ONE — a neighbor's neighbors are absent"
  — `model.leaves.get('L-000502').record.relates['depends-on']` golden `['501.3']` →
  `['L-000503']`.
- `tests/accession-ids.test.js` "resolver knowledge entry points publish the accession as
  the leaf id" — excerpt golden updated to the migrated fixture body ("Cites its sibling
  by ACCESSION…"); stale "v1 leaf" / "predates v2" comments corrected.
- `tests/accession-ids.test.js` "a dangling accession in relates-to.leaves surfaces at the
  validator seam" — second dangling target `"700.8"` → `"L-000996"`.
- `tests/accession-ids.test.js` "an unresolvable target of EITHER shape…" → *"a dangling
  accession is an unresolved-ref finding from every record kind"*; golden
  `['700.8','700.9','L-000998','L-000999']` → `['L-000996','L-000997','L-000998','L-000999']`,
  plus a new loop asserting every dangling target is itself well-formed.
- `tests/accession-ids.test.js` "a leaf that loses its identity contributes nothing to the
  ref graph" — synthesized `seeAlso` changed from `"999.9"` to `L-000999` so the schema
  does not fire a second, unrelated finding.
- `tests/accession-ids.test.js` "a non-string accession publishes null, never the raw
  value" → *"…and indexes the leaf nowhere"*. First half unchanged (`typeof` guard keeps
  `id` string-or-null); second half **inverted** — used to assert the leaf stayed findable
  under `leaves.keys() === ['700.1']`, now asserts `leaves.keys() === []` and that both
  resolver leaf lists are empty.
- `tests/frontmatter-v2.test.js` "a leaf with a quarantined-grade finding verdicts
  quarantined, not unknown" — `--leaves 900.1` → `--leaves L-000901`.
- `tests/frontmatter-v2.test.js` "a degraded store reports the SAME leaf name and stage a
  healthy one would" — all three `--leaves` invocations moved to `L-000213`; the
  de-duplication case became `L-000213,L-000213`; comment updated to note the hazard is
  now weaker (`leafIdentityOf` no longer translates) but the two paths must still agree.
- `tests/ref-graph-declaration.test.js` — the synthesized leaf gained `schema-version: 2`
  and `id: L-000362`, its `see-also` became `[L-000363]`, and the dangling
  `meta.relates.depends-on` target became `[L-000999]`. Both assertions on the literal
  `999.9` updated. This mattered specifically for the CONTROL run, whose whole claim is a
  clean exit 0 — a missing `id` or notation-form citation would have failed it for reasons
  unrelated to whether the edge was declared.

### Helper changes

- `tests/accession-ids.test.js` `leafFile()` — emits `schema-version: 2`; `accession`
  stays a parameter (rather than becoming a constant) precisely so the cases about its
  absence (`accession: null`) or wrong type (`'12345'`) can still be written.
- `tests/accession-ids.test.js` imports — added `ACCESSION_MIGRATION_HINT`, and
  `cpSync` / `readFileSync` / `renameSync` from `node:fs` for the new sharding tests.

---

## New tests added

All in `tests/accession-ids.test.js` (they belong beside the identity contract they prove;
a separate `prefix-sharding.test.js` would have split one argument across two files).

**Contract pins (replacing deleted dual-shape ones):**

1. **"a leaf with no accession is a missing-required finding naming the migration"** —
   record-level: `[{path:'id', code:'missing-required', …}]`. CLI seam: the leaf does not
   enter the index at all (`leaves.keys() === []`), the validator exits **2**, and stderr
   carries `missing-required  knowledge/w/a.md  id`.
2. **"a notation-form value FAILS in every position a leaf citation is legal"** — all three
   citation sites at the schema seam: leaf `cross-references.see-also[0]`, decision
   `relates-to.leaves[0]`, log-fragment `consulted.leaves[0]`. Each yields exactly one
   `pattern-mismatch` quoting `ID_GRAMMARS['leaf-ref'].pattern`. Then asserts the catalog
   `id-shape` finding's message includes `ACCESSION_MIGRATION_HINT` verbatim — the one
   place the engine tells an author what to do instead of only what is wrong.
3. **"a notation-form citation is refused at the CLI seam, in every store position"** —
   copies the sharded fixture, rewrites exactly one accession-form citation back to the
   notation its target still carries as a label (once in a leaf, once in a decision), and
   asserts exit 2 with both a `pattern-mismatch` at the exact array element and an
   `unresolved-ref`. The target EXISTS; only the spelling is retired — which is what makes
   the finding about the contract rather than about a typo.
4. **"the published leaf id is ALWAYS the accession, and notation is never identity"** —
   sweeps three fixture stores (`accessioned`, `sharded`, `resolver/store`), across both
   concept entry points and direct leaf hits, asserting every published `id` matches
   `idPattern('accessions')` and `id !== notation`.
5. **"the citation grammar and the minting grammar are separately declared"** (in
   `tests/id-grammars.test.js`) — `leaf-ref` and `accessions` share a pattern but not a
   hint; `knowledge` keeps its own pattern and a hint containing "legacy"; `SCHEMA_DEFS`
   still names three leaf-side defs.

**Prefix-sharding tests (the payoff — identity that carries no position):**

6. **"a store sharded by accession prefix loads, validates and resolves clean"** —
   `loadStores` reports zero diagnostics and `ok: true`; leaves key as
   `['L-000101','L-000102','L-001501']`; the three cross-references (including two that
   cross shards) all resolve; `validate.js` exits 0 with zero findings and zero counts;
   `resolve.js Widget` exits 0, reports healthy, and reaches all three leaves.
   This is the precondition for (7) — a layout the loader merely tolerated would make
   "unchanged" meaningless.

7. **"moving a leaf between shards changes its file field and nothing else"** — the
   move-a-file golden. Copies the fixture, `renameSync`s
   `knowledge/L-00/L-000102-widget-retirement.md` → `knowledge/L-01/`, edits **only** that
   row's `file:` in `_catalog.yaml`, then asserts:
   - the two leaves that CITE the moved one are byte-identical to the originals (asserted,
     not merely intended — a test that silently rewrote a citation would prove the
     opposite of its claim);
   - `validate.js` exits 0 with **zero findings** — a leaf in the "wrong" shard is not a
     finding, because the prefix classifies nothing;
   - `resolve.js Widget --json` output is `deepEqual` before/after **with every `file` key
     stripped** (via a `JSON.stringify` replacer);
   - restated at the level a reader cares about: the `[id, notation, heading]` triples are
     identical and match a literal golden — because the deep-equal above would also pass if
     the resolver had published nothing;
   - the `file` field DID move (`knowledge/L-00/…` → `knowledge/L-01/…`), so "unchanged
     apart from `file`" is not a claim about a field nobody updates.

   The move deliberately puts L-000102 in a shard its own prefix disagrees with. A layout
   that only worked while every leaf sat in its "correct" shard would be a coordinate
   system wearing a fanout device's name; this is what tells the two apart.

---

## Exemption allowlist (`tests/citation-migration.test.js`)

The list went from **13 entries to 1**. The file's own exemption-verifier is what forced
this: it requires every exempt path to really carry a non-accession value, so each of the
twelve migrated fixtures made its own exemption fail. That is a completed migration
collecting its allowlist entries automatically, and worth naming in the PR.

### REMOVED (12) — all migrated by UCS-1147, all dual-shape specimens

| Path | Why it was exempt | Now |
| --- | --- | --- |
| `tests/fixtures/loader/unresolved-ref/knowledge/regulation/362.1-…md` | dangling NOTATION `"999.9"` specimen | `see-also: [L-000999]` |
| `tests/fixtures/loader/unresolved-ref/knowledge/_catalog.yaml` | catalog of the above, notation row | `id: L-000362` |
| `tests/fixtures/loader/unresolved-leaf-ref/knowledge/widgets/700.1-…md` | one dangling accession + one dangling notation `"700.9"` | `[L-000999]`, `[L-000997]` |
| `tests/fixtures/loader/unresolved-leaf-ref/decisions/entries/D-301-dangling.yaml` | dangling accession + dangling notation `"700.8"` | `[L-000998, L-000996]` |
| `tests/fixtures/loader/healthy/knowledge/regulation/362.1-…md` | THE notation-only (unminted) specimen | `id: L-000362`, `see-also: [L-000363]` |
| `tests/fixtures/loader/healthy/knowledge/_catalog.yaml` | catalog of the notation-only specimen | `L-000362`, `L-000363` |
| `tests/fixtures/loader/healthy/decisions/entries/D-004-three-stores.yaml` | `relates-to.leaves: ["362.1"]` into the unminted leaf | `[L-000362]` |
| `tests/fixtures/resolver/store/knowledge/_catalog.yaml` | notation-only resolver store (the `id: null` golden) | `L-000410`, `L-000411` |
| `tests/fixtures/structural-validator/accessioned/knowledge/widgets/700.1-…md` | cited its sibling by NOTATION while accessioned | `see-also: [L-000102]` |
| `tests/fixtures/structural-validator/accessioned/knowledge/_catalog.yaml` | one accession row, one notation row | both accessions |
| `tests/fixtures/structural-validator/accessioned/decisions/entries/D-301-accession-ids.yaml` | `relates-to.leaves: [L-000101, "700.2"]` | `[L-000101, L-000102]` |
| `tests/fixtures/structural-validator/typed-edges/knowledge/library/501.2-…md` | `relates.depends-on` cited 501.3 by NOTATION | `[L-000503]` |

### SURVIVED (1) — and its reason was reworded

`tests/fixtures/structural-validator/bad-accession/knowledge/_catalog.yaml` — row `id: L-42`.

The old reason leaned on the dual-shape framing ("neither accession nor notation… reads as
notation-form here only because it is not an accession"). Reworded to state it without any
appeal to the retired contract: `L-42` is an id of **no legal shape under any contract this
kit has ever had** — too short for an accession, not dotted enough for a notation, a defect
before UCS-1147 and a defect after it. It appears in this allowlist only because
`isNotationForm` recognises a notation as "not an accession", and a malformed id trips the
same predicate. It is a malformed-id specimen, not a dual-shape one.

### Prose changes in the same file

- Header rewritten from "the migrate batches, a migration in progress with deliberate
  specimens" to "the migration is COMPLETE — notation-form leaf citation is illegal",
  including an explicit argument for why the file still earns its place: the engine can
  only refuse what it *loads*, and this pins that the repo's DATA carries no notation-form
  citation anywhere — including in fixtures no CI run validates.
- `EXEMPT` doc comment now records that twelve dual-shape specimens were removed and why.
- Test titles: "…survives in the migrated scope" → "…survives anywhere in scope";
  "…in a migrated decision entry" → "…in a decision entry"; "…in a migrated knowledge
  catalog" → "…in a knowledge catalog"; the verifier's title "really cites by notation" →
  "really carries a non-accession".
- Failure messages no longer offer "add an EXEMPT entry" as a fix for the leaf-to-leaf
  case — an exemption is not the remedy when the contract it protected is gone.
- `isNotationForm`, `leafRefs`, `recordLeafRefs` doc comments de-batched (no longer
  "what UCS-1145 rewrote" but "the finished-state invariant").

---

## Notes / things checked but not changed

- **No engine defect found.** Every failure was a test asserting the retired contract.
  Behaviour verified by hand at each seam before rewriting: missing `id` →
  `missing-required` (loader error, exit 2); notation in leaf `cross-references`, decision
  `relates-to.leaves`, and log-fragment `consulted.leaves` → `pattern-mismatch` against
  `^L-[0-9]{6}$`, plus `unresolved-ref` for the two that reach the ref graph; `--leaves`
  with a notation → exit 2 `UnknownLeavesError`.
- **The schema `pattern-mismatch` message quotes the pattern, not the hint.**
  `ACCESSION_MIGRATION_HINT` reaches an author through exactly one surface — the catalog
  `id-shape` finding in `validate.js`, via `ID_GRAMMARS['leaf-ref'].hint`. The new tests
  pin it there and assert the pattern (which does name the accession shape) at the schema
  seam. Flagged rather than "fixed", since widening the hint into schema messages would be
  an engine change and this task is tests-only.
- The `sharded` fixture already validated (exit 0, zero findings) and resolved cleanly on
  arrival; no fixture edit was needed for the two new tests.
- `tests/ref-graph-declaration.test.js` patches a sandboxed copy of
  `knowledge-leaf.schema.json` to open the `meta` property in both runs — that is why an
  otherwise-unknown property does not fail the control. Left as is.
