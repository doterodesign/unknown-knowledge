# UCS-1146 — Migrate: decisions relates-to and log-fragment leaf references to accession IDs

Branch: `ucs-1146-migrate-decisions-relates-to-and-log-fragment-leaf` (base `faceted-store-v2` @ 2abae19)

Second migrate batch of the one-time citation migration (parallel to UCS-1145's
leaf/catalog batch). Data migration only — no engine change.

## Migration inventory

| File | Field | Rewrite |
|---|---|---|
| `fixtures/ts-app/unknown-knowledge/decisions/entries/D-101-sports-registry-const-array.yaml` | `relates-to.leaves[0]` | `"100.1"` → `L-000100` (existing accession) |
| `payload/protocol/skills/kb-build.md` | gap example `consulted.leaves` | `"100.1"` → `"L-000100"` |
| `acceptance/A5-kb-build-walkthrough.md` | gap command + pasted output `consulted.leaves` | `"100.1"` → `"L-000100"` |

`L-000100` is the accession UCS-1145 already minted on
`fixtures/ts-app/unknown-knowledge/knowledge/product/100.1-adding-a-new-sport.md`
(`id: L-000100`, `notation: "100.1"`), and the row the ts-app knowledge catalog
already carries. **No new id was minted anywhere in this batch.**

The A5 walkthrough documents byte-honest output, so the updated command was
actually executed against a copy of `fixtures/ts-app`: exit 0, and the printed
fragment matches the pasted block exactly apart from the documented-as-varying
hex suffix.

### Verified as nothing-to-do

- The 22 kit decisions entries in `decisions/entries/` all carry `leaves: []`.
- No `consulted:` block exists in any YAML fixture in the repo — the
  log-fragment citation surface is docs/examples only, narrower than the ticket
  anticipated. There are no log-fragment templates under `payload/templates/`.
- `payload/engine/commands/log-entry.js` help/examples contain no leaf refs.

## Exemption additions (`tests/citation-migration.test.js`)

Three decision entries joined the existing exact-path allowlist. Each is a
deliberate dual-shape specimen pinned by another test; migrating any of them
would delete the property it exists to demonstrate.

| Exempt path | Why |
|---|---|
| `tests/fixtures/structural-validator/accessioned/decisions/entries/D-301-accession-ids.yaml` | Cites `L-000101` by accession and `"700.2"` by notation in one edge list. `accession-ids.test.js:449` pins the resulting edges as `[["700.2", true], ["L-000101", true]]`. |
| `tests/fixtures/loader/unresolved-leaf-ref/decisions/entries/D-301-dangling.yaml` | Dangles one accession (`L-000998`) and one notation (`"700.8"`) from a decision. `accession-ids.test.js:465` pins all four dangling refs to prove both shapes refuse from decisions as well as leaves. |
| `tests/fixtures/loader/healthy/decisions/entries/D-004-three-stores.yaml` | The decision half of the notation-only specimen store. Its `"362.1"` target is deliberately UNMINTED so `accession-ids.test.js:230-232` can prove an unaccessioned leaf still indexes by notation; rewriting the ref would require minting an id the contract forbids. `load-stores.test.js:71` also pins this edge resolving to `362.1`. |

This confirms the team lead's read on D-004: loader/healthy joins the allowlist
rather than migrating.

## Assertion: extended, not duplicated

`tests/citation-migration.test.js` header explicitly instructs future batches to
widen its helpers rather than add a parallel assertion, so that is what was done:

- New `recordLeafRefs(doc)` reads the two record-YAML citation sites —
  `relates-to.leaves` and `consulted.leaves` — handling both single-record and
  `entries:`-list documents.
- New test: *"no notation-form leaf reference survives in a migrated decision
  entry or log fragment"*.
- `RECORD_ROOTS = [...SCOPE_ROOTS, 'decisions', 'logs']` — deliberately wider
  than `SCOPE_ROOTS`, because decision entries and log fragments cite leaves
  from outside any knowledge store, so the kit's own real records are migrated
  territory too.
- The exemption verifier was refactored from a two-way branch into a three-way
  dispatcher (catalog rows / record leaf-refs / leaf frontmatter) so record-YAML
  exemptions are really checked for carrying a notation, not silently skipped.

**Failure verified, not assumed.** Reverting D-101 to `"100.1"` makes the new
assertion fail, naming the file and field path
(`... D-101-...yaml entries[0].relates-to.leaves[0]: "100.1"`). It was then
restored.

## Goldens

- **Criterion 1** (`tests/accession-ids.test.js`): new test *"a dangling
  accession in relates-to.leaves surfaces at the validator seam"*. The
  pre-existing pin was at the loader seam (`loadStores`) only; this pins the
  structural-validator CLI seam a client actually observes.
- **Criterion 2** (`tests/log-entry.test.js`): two new tests — accession
  `consulted.leaves` round-trip verbatim through the CLI (exit 0, in both the
  printed report and the on-disk fragment, neither reordered nor re-spelled),
  and content byte-stability across two runs.

## Findings worth flagging (no engine bug found)

1. **`validate.js` reports loader errors on stderr and exits 2, emitting no
   JSON**, even under `--json`. An unresolved ref is a loader error, so
   structural checks never run — "a check that never ran is a blocking defect"
   (PRD §5). My first draft of the golden assumed a JSON payload and failed;
   the test now pins the real contract. This is correct existing behavior, not
   a defect.
2. **The `miss` schema defines no `consulted` property** (`finding` and `gap`
   do). The ticket described migrating "finding, gap, miss — their
   consulted-leaves lists", but a miss records an anchor the store could not
   explain (`path` + `shape`) and has no consulted list. `accession-ids.test.js`
   already loops over only `['finding', 'gap']`. The criterion-2 golden is
   scoped to the two kinds that carry the field, with a comment saying why.

No engine edits were made.

## Gates

- `npm test` — 845 pass, 0 fail (baseline 841 + 4 new tests)
- `npm run lint` — 192 files, 0 failures
- `npm run acceptance` — OK, all asserted criteria (A1–A4, A6) pass; A5 manual by design

## Diff audit

6 files, +199 / −15. Data and docs contain only identifier rewrites
(`"100.1"` → `L-000100`) plus one clarifying sentence in `kb-build.md` about
which spelling goes in `consulted.leaves`. No engine file was touched.
