# Phoenix fixture cluster — design-studio vintage

Scope: `tests/fixtures/phoenix/{split,split-after,incomplete,unknown-leaf}`,
`tests/phoenix.test.js`, and the phoenix engine comments
(`payload/engine/lib/phoenix.js`). Part of the Phase 2 fixture-vintage rewrite
to a product-design / design-system world.

## The new phoenix story

The phoenix demo preserves its exact semantic role: **one class splits into two,
and one leaf goes the OTHER way because it was misfiled.**

- Predecessor class: `design-system/components`
- Successors: `design-system/primitives` and `design-system/patterns`
- The parent `design-system` already exists (minted by D-401); the two
  successors are minted by D-420, exactly as the split requires an unminted
  destination to be minted before the mapping may move a leaf to it.

### Leaf mapping (accession ids unchanged; edition 1 -> 2 on apply)

| leaf | heading | successor | why |
| --- | --- | --- | --- |
| L-000117 | Icon button focus-ring spec | `design-system/primitives` | a focus-ring spec is single-control (primitive) material |
| L-000213 | Primitive render budget | `design-system/primitives` | the render budget is spent mounting one primitive; goes WITH 117 |
| L-000133 | Empty-state pattern guidance | `design-system/patterns` | **the misfiled leaf** — composition guidance that shipped alongside a component, so it landed under `components`, but it is really a pattern. This is the leaf that goes the OTHER way and the drift the event fixes. |

## Domain / vocabulary mapping

- `sportsbook` -> `design-system`
- `sportsbook/odds-feed` (predecessor) -> `design-system/components`
- `feeds/ingest` (successor) -> `design-system/primitives`
- `feeds/settlement` (successor) -> `design-system/patterns`
- operations: `onboard-provider` -> `add-primitive`; `settle-bet` -> `compose-pattern`
- concept K-102 "Odds feed" -> "Component"
- src export `LATENCY_BUDGET_MS` -> `RENDER_BUDGET_MS` (path `src/feed/latency.ts`
  and file `ontology/classes/100-feed.yaml` kept as topic-neutral structural
  names, consistent with the parent's handling of the sibling `derived/` cluster)
- citation sources reworded: `OddsCo API v3 §4.2` -> `Component Kit API v3 §4.2`;
  `Finance controls handbook §7.1` -> `Accessibility spec §7.1`;
  `Trading team interview` -> `Platform team interview`

## The four fixture variants (distinguishing defects preserved)

Only the P-001 `leaves:` section differs across the three "before" variants; all
other files are identical (verified against the original git HEAD):

- **split**: complete, correct mapping — all three leaves mapped. Applies clean
  (exit 0) and produces the `split-after/` golden.
- **incomplete**: L-000213's mapping row is OMITTED — the `scope-unaccounted`
  defect (a leaf in scope with no row).
- **unknown-leaf**: an extra L-000999 row for a leaf the store does not carry —
  the `unknown-leaf` defect.
- **split-after**: the golden "after" state (edition 2, successors), regenerated
  byte-for-byte by a real `phoenix.js P-001 --apply` run — verified identical.

## Verification

- `node --test tests/phoenix.test.js` -> 49 pass, 0 fail.
- The golden `split-after/` leaves are byte-identical to a fresh
  `node payload/engine/phoenix.js P-001 --root <copy-of-split> --apply` run.
- Scoped confidentiality sweep over the phoenix cluster + phoenix engine files:
  zero matches for the banned-word family.

## Semantic role — fully preserved

Every semantic role survived exactly: the split-not-rename shape (one
predecessor, two successors), the misfiled leaf going the other way, the
per-row `why` prose carrying the reviewer-facing rationale, the leaf-granular
mapping, the three distinguishing defect variants, and the byte-level
"citations untouched" golden pair. No compromises were required.
