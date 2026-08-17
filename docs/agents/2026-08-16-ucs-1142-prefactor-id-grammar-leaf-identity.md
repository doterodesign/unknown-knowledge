# UCS-1142 — Prefactor: one ID-grammar module and a neutral leaf identity seam

**Date:** 2026-08-16
**Branch:** `ucs-1142-prefactor-one-id-grammar-module-and-a-neutral-leaf-identity` (cut from `faceted-store-v2`)
**Commit:** `7ca9984` — `KK: Prefactor — one ID-grammar module and a neutral leaf identity seam (UCS-1142)`
**PR:** [#50](https://github.com/doterodesign/unknown-knowledge/pull/50) → base `faceted-store-v2`, open, not merged
**Linear:** UCS-1142 — https://linear.app/unknown-creatives-studio/issue/UCS-1142

## Outcome

Behavior-preserving prefactor. All three gates green; every CLI surface byte-identical to before.

## Files changed

| File | Rationale |
| --- | --- |
| `payload/engine/lib/id-grammars.js` (new) | The one module owning `{pattern, hint}` per id space, plus `SCHEMA_DEFS` (which `$defs` name each space owns) and a cached `idPattern(space)` compiler. |
| `payload/engine/lib/validate-record.js` | `schemaFor()` now runs parsed schemas through `bindIdGrammars()`, overwriting each named `$defs` pattern with the module's — so the engine validates against the module, not the JSON copy. |
| `payload/engine/commands/validate.js` | Deleted its local `ID_GRAMMARS` literal; imports the shared module and uses `idPattern(store)` for the id-shape check. Catalog/orphan/citation checks read identity via `recordId()` / `LEAF_ID_FIELD`. |
| `payload/engine/lib/load-stores.js` | Added `LEAF_ID_FIELD` and `recordId()`; `loadLeafFiles` reads the leaf id through `LEAF_ID_FIELD` and indexes it under the neutral `identity` key (keeping `notation` alongside as the public wire name). |
| `payload/engine/commands/resolve.js` | `knowledgeEntryPoints` reads the id via `recordId(entry)` while still emitting the published `notation` JSON field. |
| `tests/id-grammars.test.js` (new) | Five tests pinning the single-module property, schema-copy agreement, engine-binds-the-module, and the acceptance criterion that a new id space touches only the grammar module. |

## Design decision: single-sourcing the grammar into the schemas

Constraint: `validate-record.js` is a hand-rolled JSON Schema subset with no cross-file `$ref`, and `tests/store-schemas.test.js` fails any schema using an unsupported keyword. It also asserts shared `$defs` stay byte-identical across schema files. Schemas ship as standalone documents (`$id`, draft 2020-12) for external consumers, so a schema that `$ref`s a sibling file would break anyone reading one schema alone.

**Chosen:** the grammar module is the runtime source of truth, and `schemaFor()` **binds** (overwrites) the module's pattern onto each named `$defs` as schema documents load. The JSON files keep their self-contained copies for external consumers, but the engine can only ever enforce the live grammar — a drifted copy is corrected at load rather than silently believed. `tests/id-grammars.test.js` then pins that the shipped copies agree, which keeps the *published* documents honest without making them a second runtime authority.

Overwrite rather than assert-only was deliberate: asserting would leave a window where the engine enforces a stale JSON pattern if a test is skipped; binding makes the module structurally authoritative.

Rejected alternatives: cross-file `$ref` (unsupported keyword subset, breaks external single-schema consumers); generating the schema files from the module at build time (D-002 — zero build); assert-only equality (leaves the JSON file as the thing actually enforced).

## Proof of pure refactor

Captured stdout+stderr+exit code for all six CLI surfaces (`validate`, `resolve`, `audit`, `preflight`, `validate-values`, `survey-map`), in both text and `--json` mode, across the repo root, both acceptance fixtures, and all 21 test fixture store trees, plus resolver term queries. **14,290 lines, diff empty before vs after.** No fixture or expected output touched.

Both new guards mutation-tested and confirmed to bite:
- Re-adding the notation regex to `validate.js` → "declared in exactly one module" fails.
- Drifting `finding.schema.json`'s `$defs/notation` → "shipped schema copies agree" fails.

## Test / lint / acceptance results

- `npm test` — 598 tests, **597 pass, 1 fail**.
- `npm run lint` — 174 files, 0 failures.
- `npm run acceptance` — OK, all asserted criteria (A1–A4, A6) pass.

### The one failing test is pre-existing and environmental

`tests/log-entry.test.js` → *"two simulated branches appending concurrently merge without conflict"* fails with git exit 129. Cause: this machine resolves `git` to version **2.23.0**, which predates `git init -b` (added in git 2.28). The test calls `git('init', '-b', 'main')`.

Confirmed failing identically on the baseline before any change was made. **Not caused by this ticket.** Fix is environmental (upgrade git, or the test could use `git init` + `git symbolic-ref`), and is out of scope here.

## Notes for the follow-up accession-ID inversion

The inversion should now be:
1. Change `ID_GRAMMARS.knowledge.pattern` + `.hint` in `payload/engine/lib/id-grammars.js`.
2. If the field name changes too, change `LEAF_ID_FIELD` in `payload/engine/lib/load-stores.js`.

No consumer names the notation field to *get* an id any more — they go through `recordId()`. The one place `notation` is still spelled as a wire name is `resolve.js`'s emitted JSON, which is a published field and intentionally decoupled from storage.
