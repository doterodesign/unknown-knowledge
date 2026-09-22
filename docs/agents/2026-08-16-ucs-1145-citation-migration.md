# UCS-1145 — Migrate: leaf cross-references and knowledge catalogs to accession IDs

Branch: `ucs-1145-migrate-leaf-cross-references-and-knowledge-catalogs-to`
Commit: `6d911fb`
Base: `faceted-store-v2`

## Outcome

First migrate batch of the expand–contract citation migration. Knowledge-catalog
id rows and leaf-to-leaf references are rewritten from notation form to accession
IDs across the kit's test fixture stores and the TS acceptance store. No engine
code was touched. All three gates green: 841 tests pass (up from 837 — the four
new assertion tests), lint clean over 192 files, acceptance OK.

## The scope correction that matters most

The ticket's enumeration named `loader/healthy`, `resolver/store`, and
`structural-validator/accessioned` as stores to migrate. **Migrating all three was
wrong, and the test suite proved it.** Each is the load-bearing specimen for a
UCS-1144 contract test that pins the dual-shape union — the property that lets
migrate batches proceed a leaf at a time without a flag day:

- `loader/healthy` — `accession-ids.test.js:226` loads it to prove an UNMINTED
  leaf still indexes by notation exactly as pre-UCS-1144. Migrating it deletes
  the only store demonstrating that.
- `resolver/store` — `accession-ids.test.js:399` runs the "resolves identically
  apart from the added field" golden against it, asserting every published
  `entry.id` is null. That requires unminted leaves.
- `structural-validator/accessioned` — deliberately mixed: one leaf cites by
  notation, one by accession; one catalog row each way. It exists to prove
  neither form is second-class.

These were migrated, then reverted, and are now in the exemption allowlist. The
header of `tests/accession-ids.test.js` states the property explicitly: "BOTH
citation forms stay legal ... so the migrate batches can proceed one leaf at a
time without a flag day." That is UCS-1147's to retire, not this batch's.

## Migration inventory

| Store | Leaves assigned accessions | Refs rewritten | Catalog rows rewritten |
|---|---|---|---|
| `tests/fixtures/structural-validator/clean` | 1 (L-000601) | 0 | 1 |
| `tests/fixtures/structural-validator/findings` | 2 (L-000501, L-000503) | 0 | 2 |
| `tests/fixtures/structural-validator/frontmatter-v2-findings` | 1 (L-000901) | 0 | 1 |
| `tests/fixtures/structural-validator/registries-absent` | 2 (L-000601–602) | 0 | 2 |
| `tests/fixtures/structural-validator/registries-clean` | 2 (L-000601–602) | 0 | 2 |
| `tests/fixtures/structural-validator/registries-findings` | 4 (L-000601–604) | 0 | 4 |
| `tests/fixtures/structural-validator/registries-malformed` | 2 (L-000601–602) | 0 | 2 |
| `tests/fixtures/structural-validator/registries-open-top-level` | 3 (L-000601–603) | 0 | 3 |
| `fixtures/ts-app/unknown-knowledge` | 1 (L-000100) | 0 | 1 |
| **Total** | **18** | **0** | **18** |

Note on the ref column: every notation-form `class-elsewhere` / `see-also` value
in the repo turned out to live in a fixture that is a deliberate exemption (see
below). The migratable surface in this batch is therefore entirely catalog rows
plus the leaf `id:` assignments those rows require.

`fixtures/swift-app/unknown-knowledge` — knowledge store is empty by design
(`entries: []`); nothing to migrate. Its FIXTURE.md needed no change.

## Exemption allowlist

Exact-path keys in `EXEMPT` in `tests/citation-migration.test.js`. A new fixture
cannot join by sitting in the right directory.

| Path | Why exempt |
|---|---|
| `tests/fixtures/loader/unresolved-ref/knowledge/engineering/362.1-preview-deploy-windows.md` | Plants a see-also at `"999.9"`, which no leaf carries. `load-stores.test.js` pins the literal `"999.9"` in the unresolved-ref message and dangling-edge list. |
| `tests/fixtures/loader/unresolved-ref/knowledge/_catalog.yaml` | Catalog of the above; migrating the row alone makes the store internally inconsistent. |
| `tests/fixtures/loader/unresolved-leaf-ref/knowledge/widgets/700.1-widget-registry.md` | Cites one dangling accession and one dangling notation. `accession-ids.test.js` asserts BOTH shapes dangle. |
| `tests/fixtures/structural-validator/typed-edges/knowledge/library/501.2-score-computation.md` | `relates.depends-on` cites 501.3 by notation while 501.3 carries an accession — pins the leaf-ref union (UCS-1151). |
| `tests/fixtures/loader/healthy/knowledge/engineering/362.1-preview-deploy-windows.md` | The notation-only specimen (see scope correction). |
| `tests/fixtures/loader/healthy/knowledge/_catalog.yaml` | Catalog of the notation-only specimen. |
| `tests/fixtures/resolver/store/knowledge/_catalog.yaml` | Catalog of the notation-only resolver store; the `id: null` golden requires unminted leaves. |
| `tests/fixtures/structural-validator/accessioned/knowledge/widgets/700.1-widget-registry.md` | Cites its sibling by notation while carrying an accession — the mixed-store proof. |
| `tests/fixtures/structural-validator/accessioned/knowledge/_catalog.yaml` | One row accession, one row notation — the catalog half of the same proof. |
| `tests/fixtures/structural-validator/bad-accession/knowledge/_catalog.yaml` | Row id is `L-42`, an id of NO legal shape. The malformed value is the id-shape specimen; it reads as non-accession because that IS the planted defect. |

## The assertion test

`tests/citation-migration.test.js`, four tests:

1. No notation-form leaf-to-leaf reference in the migrated scope. Reads
   `cross-references.class-elsewhere` / `see-also` and the typed `relates.*`
   kinds, skipping exact-path exemptions.
2. No notation-form id row in a migrated knowledge catalog.
3. Every exemption names a file that exists AND really cites by notation — so an
   allowlist entry that outlives its fixture fails loudly rather than silently
   hiding the next file that lands on that path.
4. The exemptions are exact paths — no globs, no prefixes, no directories.

The accession pattern is read from `idPattern('accessions')` rather than
restated, so a grammar change reaches the assertion. Verified to bite: planting a
notation see-also in migrated territory fails test 1 naming the file and field.

## Bug found and fixed (mine, not the engine's)

During a regression check I reverted
`structural-validator/clean/knowledge/widgets/600.1-gadget-registry.md` while its
catalog kept the accession, leaving the row pointing at a leaf that did not carry
it — index-drift plus orphan. Caught by `frontmatter-v2.test.js`, which uses that
store as its "no tiers registry" case. Fixed by restoring the leaf `id:`. A
cross-check across all knowledge catalogs confirmed only one other
catalog/leaf accession mismatch, and that one is the deliberate index-drift plant
(`findings` / `L-000502`, which correctly no leaf carries).

**No engine bug was found.** The engine accepted both shapes throughout, exactly
as UCS-1144's expand promised. The acceptance fixture's `D-101` decision still
references leaf `100.1` by notation via `relates-to.leaves` (UCS-1146's batch),
and it resolves cleanly through `leafAliases` after the leaf was accessioned —
direct evidence the expand contract holds.

## Golden-change audit

Fixture diffs contain only added `id:` lines and `id:` rewrites — verified by
counting the distinct changed-line shapes:

```sh
git diff 1463b0a..HEAD -- tests/fixtures fixtures \
  | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
  | sort | uniq -c | sort -rn
```

Every line in that output is either `+id: L-NNNNNN` (a minted accession) or a
catalog row moving from `- id: "<notation>"` to `- id: L-NNNNNN`. No other line
shape appears.

Test-golden changes, all traceable to an identifier rewrite:

- `tests/registries.test.js` — leaf-key list, membership-finding triples, and two
  `.find()` lookups by id.
- `tests/validate.test.js` — findings sort golden, index-drift lookup,
  missing-citation id, and the orphan list. The orphan list also reorders
  (`['500.3','K-320']` → `['K-320','L-000503']`) because `.sort()` runs on the
  new strings; that is mechanical, not behavioral.

## Template change

`payload/protocol/skills/kb-build.md` — the `cross-references` guidance said refs
"must resolve to notations the catalog declares." Updated to direct authors to
the target's accession id while noting a notation still resolves for stores
mid-migration. Kept the "standing room" phrase intact on one line; the kb-build
test pins several phrases verbatim and my first wrapping broke that match.

## Not touched (UCS-1146's batch)

Decisions `relates-to` and log-fragment `consulted-leaves` were left alone, per
the ticket's batch separation.
