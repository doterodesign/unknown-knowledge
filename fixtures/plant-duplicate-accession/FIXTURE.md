# fixtures/plant-duplicate-accession — isolated plant store (UCS-1159)

A minimal knowledge-only store whose **only** defect is UCS-1159 plant 5:
**a duplicate accession ID**. Acceptance fixture only — never in the init
payload (D-007).

**This store fails to load, by design.** That is the plant, not a bug:

```sh
node payload/engine/validate.js --root fixtures/plant-duplicate-accession --json
# exit 2, exactly one diagnostic:
#   duplicate-id  knowledge/product/100.2-registering-a-new-export-format.md  id
#   id "L-000100" is already minted in knowledge/product/100.1-adding-a-new-export-format.md
```

| Case | Target | Anchor (file:line) | Expected finding |
|---|---|---|---|
| duplicate accession ID | `L-000100`, minted twice | `unknown-knowledge/knowledge/product/100.2-registering-a-new-export-format.md:3` | `duplicate-id` at path `id`, **exit 2**, and nothing else |

## Why this store exists at all

The plant is a *loader-level* defect: it sets `model.ok = false`, and every
engine surface then reports that diagnostic and abandons the run. Any other
planted case sharing this store would be **swallowed** — verified empirically:
adding this plant to `fixtures/ts-app` makes its two `unregistered-value`
findings vanish entirely. No flag scopes past loader health (`validate.js`
takes no `--leaves`; `preflight --leaves` on an unrelated clean leaf still
degrades to `store-verdict: unknown`).

So the plant gets its own root, which is what "no plant masks another" and
"golden per plant" require. The store is kept minimal for the same reason:
**exactly one defect**, so the golden is unambiguous.

## Drift in values, never in shape

Both leaves are well-formed and schema-valid. Neither hides behind a
malformed-descriptor error — the defect is that the accession **value**
`L-000100` is claimed by two leaves, and published ids are immutable. The
first mint wins and keeps the identity; the later one loses, never enters the
index, and its cross-references never enter the ref graph.

## Contents

`unknown-knowledge/knowledge/` — catalog, rules, the seven governed registries,
and the two colliding leaves. `unknown-knowledge/decisions/` — a
**self-contained** `D-101` that mints the registry vocabularies. It is not
copied from `ts-app`: that entry relates to `K-101`/`L-000100`, refs which do
not resolve in a store with no ontology, and the resulting `unresolved-ref`
noise would pollute this store's single tabulated plant.

Asserted in `acceptance/run.js` §A3; inventory table in
`fixtures/ts-app/FIXTURE.md`.
