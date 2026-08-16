# UCS-1147 — Fixture data migration to accession-only leaf identity

Date: 2026-08-16
Branch: `ucs-1147-contract-notation-demoted-to-optional-legacy-field-accession`
Scope: fixture DATA only (`tests/fixtures/**`, `fixtures/**`). No `.js` file touched.

## Contract being migrated to

- `id` (accession `L-NNNNNN`) is REQUIRED on every knowledge leaf; `notation` is optional-legacy.
- `$defs/leafRef` is accession-only (`^L-[0-9]{6}$`) in knowledge-leaf, decision-entry, finding, gap.
- The loader keys leaves by accession ONLY. A leaf without `id` does not index; a notation-form
  citation now yields both `pattern-mismatch` (schema) and `unresolved-ref` (loader).

## Accessions minted

| Fixture store | Leaf file | New id |
|---|---|---|
| `tests/fixtures/loader/healthy` | `knowledge/regulation/362.1-ach-settlement-windows.md` | `L-000362` |
| `tests/fixtures/loader/healthy` | `knowledge/regulation/362.2-wire-settlement-windows.md` | `L-000363` |
| `tests/fixtures/loader/unresolved-ref` | `knowledge/regulation/362.1-ach-settlement-windows.md` | `L-000362` |
| `tests/fixtures/resolver/store` | `knowledge/payments/410.1-card-settlement-windows.md` | `L-000410` |
| `tests/fixtures/resolver/store` | `knowledge/payments/410.2-accepted-payment-instruments.md` | `L-000411` |

Numbering follows each store's existing notation family (362.x -> L-000362/363, 410.x -> L-000410/411)
and is unique within its store. No other fixture leaf lacked an `id`.

## Dangling ids used (deliberately unresolvable — these are the planted defects)

| Fixture store | Location | Old value | New dangling accession |
|---|---|---|---|
| `tests/fixtures/loader/unresolved-ref` | leaf `362.1` `cross-references.see-also[0]` | `"999.9"` | **`L-000999`** |
| `tests/fixtures/loader/unresolved-leaf-ref` | leaf `700.1` `cross-references.see-also[0]` | `"700.9"` | **`L-000997`** |
| `tests/fixtures/loader/unresolved-leaf-ref` | leaf `700.1` `cross-references.class-elsewhere[0]` | `L-000999` (unchanged) | `L-000999` |
| `tests/fixtures/loader/unresolved-leaf-ref` | `D-301-dangling.yaml` `relates-to.leaves[1]` | `"700.8"` | **`L-000996`** |
| `tests/fixtures/loader/unresolved-leaf-ref` | `D-301-dangling.yaml` `relates-to.leaves[0]` | `L-000998` (unchanged) | `L-000998` |

**Note for the engine/test owner:** `tests/load-stores.test.js` pins the literal string `"999.9"`
in a message assertion and in a dangling-edge list. The replacement literal is **`L-000999`**.

## Rewritten prose (resolver golden — exact new text)

`tests/fixtures/structural-validator/accessioned/knowledge/widgets/700.1-widget-registry.md` body,
replacing "Cites its sibling by NOTATION while carrying an accession itself — the mixed / state every
store passes through mid-migration.":

```
Cites its sibling by ACCESSION while carrying an accession itself — the clean
state every store lands in once the migration is done.
```

(Line break preserved after "clean", matching the original two-line wrap.)

## Changes grouped by fixture store

### 1. `tests/fixtures/loader/healthy/`
- `knowledge/regulation/362.1-ach-settlement-windows.md` — added `id: L-000362`; `see-also: ["362.2"]` -> `[L-000363]`; schema-version 1 -> 2.
- `knowledge/regulation/362.2-wire-settlement-windows.md` — added `id: L-000363`; schema-version 1 -> 2.
- `knowledge/_catalog.yaml` — both rows: `"362.1"` -> `L-000362`, `"362.2"` -> `L-000363`.
- `decisions/entries/D-004-three-stores.yaml` — `relates-to.leaves: ["362.1"]` -> `[L-000362]`.

### 2. `tests/fixtures/loader/unresolved-ref/`
- `knowledge/regulation/362.1-ach-settlement-windows.md` — added `id: L-000362`; `see-also: ["999.9"]` -> `[L-000999]` (still dangling by design); schema-version 1 -> 2; body sentence "points at a notation that does not exist" -> "points at an accession that does not exist".
- `knowledge/_catalog.yaml` — row `"362.1"` -> `L-000362`.

### 3. `tests/fixtures/resolver/store/`
- `knowledge/payments/410.1-card-settlement-windows.md` — added `id: L-000410`; schema-version 1 -> 2.
- `knowledge/payments/410.2-accepted-payment-instruments.md` — added `id: L-000411`; schema-version 1 -> 2.
- `knowledge/_catalog.yaml` — rows `"410.1"` -> `L-000410`, `"410.2"` -> `L-000411`.

### 4. `tests/fixtures/structural-validator/accessioned/`
- `knowledge/widgets/700.1-widget-registry.md` — `see-also: ["700.2"]` -> `[L-000102]`; body sentence rewritten (see above); schema-version 1 -> 2.
- `knowledge/widgets/700.2-widget-retirement.md` — schema-version 1 -> 2.
- `knowledge/_catalog.yaml` — row `"700.2"` -> `L-000102`; leading comment rewritten from "may name its target by either legal spelling (UCS-1144)" to the accession-only rule (UCS-1147), since the comment asserted the now-dead dual-spelling contract.
- `decisions/entries/D-301-accession-ids.yaml` — `relates-to.leaves: [L-000101, "700.2"]` -> `[L-000101, L-000102]`; the inline comment above it updated to "cites both leaves by accession".

### 5. `tests/fixtures/loader/unresolved-leaf-ref/`
- `knowledge/widgets/700.1-widget-registry.md` — `see-also: ["700.9"]` -> `[L-000997]`; `class-elsewhere: [L-000999]` left as-is; body updated to "Cites two dangling accessions."; schema-version 1 -> 2.
- `knowledge/_catalog.yaml` — comment rewritten (previously asserted "both leaf-ref shapes"); the `id: L-000101` row was already an accession.
- `decisions/entries/D-301-dangling.yaml` — `relates-to.leaves: [L-000998, "700.8"]` -> `[L-000998, L-000996]`; title "Dangling leaf refs of both shapes" -> "Dangling leaf refs"; decision text "either shape" -> "accession target".

The store still plants exactly two distinct dangling leaf refs on the leaf (`L-000999`, `L-000997`)
and two on the decision entry (`L-000998`, `L-000996`) — four `unresolved-ref` diagnostics, same count
as before the migration.

### 6. `tests/fixtures/structural-validator/typed-edges/`
- `knowledge/library/501.2-score-computation.md` — `relates.depends-on: ["501.3"]` -> `[L-000503]`; the trailing paragraph explaining the deliberate notation citation rewritten to describe accession-only citation; schema-version 1 -> 2.
- All other leaves in the store: schema-version 1 -> 2 only.

### 7. `tests/fixtures/structural-validator/bad-accession/` — UNTOUCHED defect
- `knowledge/_catalog.yaml` row `id: L-42` LEFT ALONE, as instructed. It is the planted malformed-id
  defect pinning id-shape checking.
- The store's leaf `.md` did get its schema-version bump (it carries a valid `id: L-000101`); the
  catalog defect is unrelated to that.

### 9. schema-version bump (all stores)
Bumped `schema-version: 1` -> `2` in the frontmatter of every knowledge leaf `.md` under
`tests/fixtures/` and `fixtures/` — 59 leaves total (54 in a scripted pass, 5 already set to 2 during
the edits above). Catalogs, `_rules.yaml`, registries, decisions, ontology and log files were NOT
bumped.

## Found in the sweep and deliberately NOT migrated

| Item | Reason |
|---|---|
| `tests/fixtures/structural-validator/bad-accession/knowledge/_catalog.yaml` `id: L-42` | Planted malformed-id defect; explicitly out of scope. |
| `tests/fixtures/loader/malformed/knowledge/regulation/no-front-matter.md` | Deliberately has NO YAML front matter at all — it is the "not a leaf" fixture. Adding an `id` or a schema-version would destroy the defect it pins. Only leaf without an `id` remaining, by design. |
| `tests/fixtures/structural-validator/findings/ontology/_catalog.yaml` `id: BAD` | ONTOLOGY catalog (concept id), not a leaf ref. Planted defect for concept-id shape. Out of scope. |
| `supersedes: [D-101]` / `[D-102]` in `structural-validator/findings/decisions/entries/*` | Decision-to-decision edges (`D-` ids), not leaf refs. The accession-only `leafRef` contract does not govern them. |
| Prose mentions of `501.1` / `501.3` etc. in `typed-edges` leaf bodies (`501.4`, `501.5`) | Narrative references to leaves by their notation inside body text, not machine-read citation fields. Notation remains a legal optional-legacy field, so prose naming is still accurate. |
| `fixtures/swift-app/unknown-knowledge/knowledge/_catalog.yaml` | `entries: []` — knowledge store intentionally empty (fixture proves ontology-side extraction/drift). Nothing to migrate. |
| `fixtures/ts-app/unknown-knowledge` | Already fully accessioned (`L-000100` on leaf and catalog row). Only the schema-version bump applied. |
| `resolver-v2` / `resolver-v2-reordered` | Already accession-only (`see-also: ["L-000133"]`). Only the schema-version bump applied. |
| `typed-edges-findings` | Already accession-only (`depends-on: ["L-000999"]`, a deliberate dangling accession). Untouched apart from the bump. |

## Verification

Sweep 1 (notation-form leaf citations outside the plant) — clean. Only residue is prose text and
decision-to-decision `supersedes`:

```
grep -rn "see-also\|class-elsewhere\|depends-on\|contradicts\|supersedes\|leaves:" \
  tests/fixtures fixtures --include='*.md' --include='*.yaml' | grep -vE "L-[0-9]{6}|\[\]|_catalog"
```

Sweep 2 (catalog id rows) — only the intentional `id: BAD` ontology plant remains:

```
grep -rn "^\s*- id:" tests/fixtures fixtures --include='_catalog.yaml' | grep -v "K-\|D-\|L-"
```

Sweep 3 (leaves missing `id`) — only `loader/malformed/.../no-front-matter.md`.
Sweep 4 (leaf `schema-version` != 2) — no hits.

Loader smoke test (`loadStores`) after migration:

| Store | ok | leaf keys indexed |
|---|---|---|
| `loader/healthy` | true | `L-000362, L-000363` |
| `resolver/store` | true | `L-000410, L-000411` |
| `structural-validator/accessioned` | true | `L-000101, L-000102` |
| `structural-validator/typed-edges` | true | `L-000501..L-000505, L-000510, L-000511` |
| `structural-validator/bad-accession` | true | `L-000101` |
| `fixtures/ts-app/unknown-knowledge` | true | `L-000100` |
| `loader/unresolved-ref` | false | `L-000362` + intended unresolved-refs |
| `loader/unresolved-leaf-ref` | false | `L-000101` + 4 intended unresolved-refs |

67 fixture data files changed; no `.js` file modified by this task.
