# fixtures/plant-unresolved-relates — isolated plant store (UCS-1159)

A minimal knowledge-only store whose **only** defect is UCS-1159 plant 3:
**an unresolvable `relates` ref**. Acceptance fixture only — never in the init
payload (D-007).

**This store fails to load, by design.** That is the plant, not a bug:

```sh
node payload/engine/validate.js --root fixtures/plant-unresolved-relates --json
# exit 2, exactly one diagnostic:
#   unresolved-ref  knowledge/product/100.1-adding-a-new-sport.md  relates.see-also[0]
#   relates.see-also ref "L-000999" does not resolve to any knowledge entry or catalog-declared id
```

| Case | Target | Anchor (file:line) | Expected finding |
|---|---|---|---|
| unresolvable relates ref | `L-000100`'s `see-also` edge | `unknown-knowledge/knowledge/product/100.1-adding-a-new-sport.md:21` | `unresolved-ref` at path `relates.see-also[0]`, **exit 2**, and nothing else |

## Why this store exists at all

The plant is a *loader-level* defect: `resolveRefs` runs during load, and a
miss sets `model.ok = false`, after which every engine surface reports that
diagnostic and abandons the run. Any other planted case sharing this store
would be **swallowed**. No flag scopes past loader health, so the plant gets
its own root — which is what "no plant masks another" and "golden per plant"
require. The store is kept minimal so it carries **exactly one defect** and the
golden is unambiguous.

## Drift in values, never in shape

The edge is well-formed: the right typed-edge field (`relates.see-also`),
carrying a syntactically valid `L-NNNNNN` accession. Nothing is malformed and
nothing hides behind a schema error — the defect is that the reference
**value** `L-000999` names no leaf this store mints and no catalog row
declares. A leaf answers to its accession and nothing else, so the edge
resolves to nothing.

## Contents

`unknown-knowledge/knowledge/` — catalog, rules, the seven governed registries,
and the one leaf carrying the dangling edge. `unknown-knowledge/decisions/` — a
**self-contained** `D-101` that mints the registry vocabularies. It is not
copied from `ts-app`: that entry relates to `K-101`/`L-000100`, refs which do
not resolve in a store with no ontology, and the resulting `unresolved-ref`
noise would be indistinguishable from this store's actual plant.

Asserted in `acceptance/run.js` §A3; inventory table in
`fixtures/ts-app/FIXTURE.md`.
