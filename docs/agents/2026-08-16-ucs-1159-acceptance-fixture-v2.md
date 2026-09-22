# UCS-1159 — Acceptance fixture v2: the five planted cases

**Status: IMPLEMENTED via option B (isolated plant stores).**

This document was first written as a STOP: probing the engine showed that two of
the five demanded plants are loader-level hard errors which degrade the whole
store to exit 2, so all five could not live in one store without masking each
other. That empirical finding stands unchanged and is recorded in full below —
it is the reason the final shape looks the way it does.

The ticket owner resolved the apparent contradiction rather than re-scoping it,
and the resolution is worth recording because it turns on reading the invariant
precisely:

> The standing invariant's letter is "no case hides behind a **malformed-descriptor**
> hard error". Both hard plants are **well-formed values whose meaning is
> defective** — two well-formed leaves claiming one accession; a well-formed
> typed edge citing an accession nothing mints. Nothing is malformed, and
> nothing hides: the loader diagnostic IS the tabulated expected finding,
> asserted in isolation. "Golden per plant" and "no plant masks another" already
> point at per-plant isolation, so option B delivers the five named plants with
> their expected outputs rather than changing scope. Options A (drop to three)
> and C (amend the invariant) would have been the real scope changes.

So: three finding-level plants in the main `fixtures/ts-app` store, and the two
loader-fatal plants in their own minimal roots, one defect apiece. §7 records
what was built.

## 1. What the ticket asked for

Upgrade the TS acceptance fixture store (`fixtures/ts-app/unknown-knowledge/`)
to frontmatter v2 with exactly five deliberate plants, each producing exactly
its tabulated expected finding at the engine CLI seam, under the standing
invariant that **drift is planted in VALUES, never in SHAPE, so no case hides
behind a malformed-descriptor hard error** and **no plant masks another**.

The five plants:

| # | Plant | Demanded observation |
|---|---|---|
| 1 | stale volatile leaf | preflight stale verdict, exit 1, `--today` injected |
| 2 | jurisdiction mismatch | validate registry-membership finding |
| 3 | unresolvable `relates` ref | validate unresolved-ref finding |
| 4 | unregistered facet value | validate registry-membership finding |
| 5 | duplicate accession ID | loader duplicate-accession finding |

## 2. Empirical results — every plant probed at the CLI seam

All probes run against throwaway copies of `fixtures/ts-app` in `$TMPDIR`.
Plants 1, 2, 4 behave as the ticket assumes. Plants 3 and 5 do not.

### Plants 2 + 4 — registry membership (WORKS, exit 1)

Planting `applies.jurisdictions: [eu-eaa]` (empty registry) and
`facets.form: walkthrough` (unminted) on leaf `L-000100`:

```
node payload/engine/validate.js --root <copy> --json   →   EXIT 1
findings: [
  { code: "unregistered-value", id: "L-000100", path: "applies.jurisdictions[0]" },
  { code: "unregistered-value", id: "L-000100", path: "facets.form" }
]
"store-health": { "ok": true, "errors": 0 }
```

Both are ordinary error-severity findings. They coexist in one run and neither
masks the other. Note both carry the **same code** (`unregistered-value`) — they
are distinguished only by `path`, not by a distinct finding kind.

### Plant 1 — stale volatile leaf (WORKS, exit 1)

Adding `volatility: volatile` + `verified: "2026-01-05"` to `L-000100`:

```
node payload/engine/preflight.js --root <copy> --json --leaves L-000100 --today 2026-08-16
→ EXIT 1
"counts": { "trusted": 0, "quarantined": 0, "unknown": 0, "stale": 1 }
leaf-verdicts[0].verdict = "stale"
  reason: "verified 223 day(s) ago, past the 90-day limit for volatile knowledge …"
```

Thresholds are pinned in `payload/engine/lib/time-verdicts.js:76-80`
(`static: Infinity, stable: 365, volatile: 90`). `--today` is required and
never read from the wall clock. This plant is observed at `preflight.js`, a
**different command** from plants 2/4 (`validate.js`), which already implies
per-plant invocations.

### Plant 3 — unresolvable `relates` ref (BREAKS THE PREMISE, exit 2)

Adding `relates: { see-also: [L-000999] }` to `L-000100`:

```
node payload/engine/validate.js --root <copy> --json   →   EXIT 2
validate: the store loader reported 1 error(s) — structural checks never ran
  unresolved-ref  …/100.1-adding-a-new-export-format.md  relates.see-also[0]
```

`unresolved-ref` is emitted by the **loader**, not the validator —
`payload/engine/lib/load-stores.js:1336-1354` (`resolveRefs`). It is
`severity: 'error'`, which sets `model.ok = false`
(`load-stores.js:1427`), and every downstream command treats an unhealthy
store as a store-wide failure. **No JSON `findings` array is produced at all.**

### Plant 5 — duplicate accession ID (BREAKS THE PREMISE, exit 2)

Adding a second leaf re-minting `L-000100`:

```
node payload/engine/validate.js --root <copy> --json   →   EXIT 2
validate: the store loader reported 1 error(s) — structural checks never ran
  duplicate-id  …/100.2-dupe.md  id  id "L-000100" is already minted in …
```

Detected in `load-stores.js:566-578` (`indexRecord`), called for leaves at
`load-stores.js:1238`. Same store-wide exit-2 degradation.

### The masking proof

With the duplicate accession AND the jurisdiction/facet plants in one store:

```
node payload/engine/validate.js --root <copy> --json   →   EXIT 2
  duplicate-id  …  (the ONLY thing reported)
```

The two `unregistered-value` findings **vanish entirely**. This is precisely
the "no plant masks another" violation the ticket anticipated — and it is not
avoidable by scoping.

### Scoping cannot rescue it

- `validate.js` usage is `[--json] [--root <dir>] [--concepts <ids>]`. There is
  **no `--leaves` / no per-leaf scoping flag**. `--concepts` is ontology-side.
- `node payload/engine/validate.js --root <dup-copy> --concepts K-101` still
  exits 2 with the loader error; the knowledge-store defect is not scopable away.
- `node payload/engine/preflight.js --root <dup-copy> --leaves L-000100 --today …`
  returns `"store-verdict": "unknown"`, `"store-health": { ok: false }` — the
  clean leaf's own verdict is destroyed by the unrelated duplicate elsewhere in
  the store.

## 3. Why "separate invocations per plant" does not solve it

The ticket suggests solving masking with separate invocations ("golden per
plant"). Separate *invocations* are necessary but **not sufficient**, because
the masking here is not per-invocation — it is per-**store-on-disk**.

Plants 3 and 5 are properties of the committed fixture store itself. As long as
either lives in `fixtures/ts-app/unknown-knowledge/`, *every* invocation against
that root — including the ones meant to observe plants 1, 2 and 4 — exits 2 with
the loader error and produces no findings. Separate invocations would only help
if each plant lived in a separate store.

## 4. The three hard constraints that collide

1. **Ticket AC-1 / AC-4:** the TS acceptance store must be fully v2 and —
   plants aside — "loads and validates clean"; the fixture-store pin test
   (store loads, every pointer resolves) must stay green.
   `tests/fixture-ts-store.test.js:19-22` asserts
   `model.diagnostics == []` and `model.ok === true`.
   Plants 3 and 5 each put an error-severity diagnostic in `model.diagnostics`
   and force `model.ok === false`. **AC-1/AC-4 and plants 3+5 are mutually
   exclusive in one store.**

2. **The standing invariant:** "drift planted in VALUES never in SHAPE, so no
   case hides behind a malformed-descriptor hard error." Plants 3 and 5 *are*
   hard errors — at first reading, the exact failure mode the invariant exists
   to forbid.

   **Resolved (see the header):** the invariant governs *malformed descriptors*,
   and neither plant is malformed. Both are well-formed records carrying a
   defective **value** — which is what the invariant asks for. What plants 3 and
   5 additionally have is loader-fatal *severity*, and that severity is not a
   reason to reject them; it is the reason they need isolated roots, since a
   loader-fatal defect masks anything sharing its store. Constraint 1 below is
   then satisfied too: the main store keeps only the value-level plants, so it
   loads clean and the pin test is untouched.

3. **"No plant masks another"** — empirically violated above, and unfixable by
   flags because the engine exposes no seam that scopes past loader health.

## 5. Options considered (B was chosen — see the header for the reasoning)

- **(A) Drop plants 3 and 5 to three plants.** Keeps one store, keeps the pin
  test green, keeps the invariant honest. Loses the two cases the ticket most
  wanted. Contradicts "EXACTLY five plants".
- **(B) Separate sibling fixture stores, one per hard plant** (e.g. a
  `fixtures/ts-app-dup-accession/` and `fixtures/ts-app-unresolved-ref/` whose
  only defect is that plant). Preserves five plants and per-plant goldens at
  exit 2. Costs: new fixture roots, new pin-test posture (these stores load
  *dirty* by design), and A1's byte-for-byte/D-007 sweeps plus the
  `FIXTURES = ['swift-app','ts-app']` list in `acceptance/run.js:45` all need
  to learn about them. This is the option the ticket's "golden per plant" hint
  gestures at, but it is a fixture-topology change, not an extension of the
  existing idiom — hence a re-spec, not an improvisation I should make alone.
- **(C) Tabulate plants 3 and 5 as exit-2 loader goldens and accept that they
  are asserted in isolation**, explicitly amending the "values not shape"
  invariant to admit two named identity-level exceptions. Honest, but it edits
  a standing invariant — a governance decision, not an implementation one.

**Chosen: (B).** The cost estimate above was accurate — the new roots, the
`FIXTURES` list and the D-007 sweep all needed to learn about the plant stores —
but the framing was not: with the invariant read precisely (header), B is the
ticket's own design rather than a re-spec of it. One correction to the estimate:
no new pin-test posture was needed. The plant stores are asserted directly by
the acceptance harness at exit 2, so nothing pins them as "loads dirty"; the
existing `tests/fixture-ts-store.test.js` stays green **unchanged**, because the
main store keeps only value-level plants.

## 7. What was built

**Main store — `fixtures/ts-app` (three value-level plants, still loads clean):**
- `L-000100` (`knowledge/product/100.1-adding-a-new-export-format.md`) carries plant 2
  (`applies.jurisdictions: [eu-eaa]`, line 15) and plant 4
  (`facets.form: walkthrough`, line 10). Both emit `unregistered-value` at
  exit 1, distinguished only by `path`.
- `L-000200` (`knowledge/product/100.2-deprecating-a-library-release.md`, NEW) carries
  plant 1: `volatility: volatile` + `verified: "2026-01-05"` (lines 16-17),
  which at `--today 2026-08-16` is 223 days past the 90-day limit → preflight
  `stale`, exit 1. It also carries a *resolving* `relates.see-also` edge to
  `L-000100`, so the store exercises typed edges in their healthy form.
  The stale plant sits on its own leaf deliberately: one preflight run then
  shows `L-000100` quarantined AND `L-000200` stale, which is the positive
  demonstration that neither masks the other.
- `_registries/operations.yaml` mints `deprecate-release` for the new leaf.
  `jurisdictions` stays empty and `form` mints only `recipe` — minting either
  claimed value would silence a plant.

**Isolated plant stores (one defect apiece, exit 2):**
- `fixtures/plant-duplicate-accession/` — two well-formed leaves both mint
  `L-000100`; the later mint loses. Exactly one `duplicate-id`.
- `fixtures/plant-unresolved-relates/` — a well-formed `relates.see-also` cites
  `L-000999`, which nothing mints. Exactly one `unresolved-ref`.
- Each is knowledge-only (catalog, rules, seven registries, leaves) plus a
  **self-contained** `D-101`. That decision is deliberately NOT the `ts-app`
  one: `ts-app`'s `D-101` relates to `K-101`/`L-000100`, refs that do not
  resolve in a store with no ontology, and the resulting 11 `unresolved-ref`
  diagnostics would have polluted each store's single tabulated plant. This was
  caught empirically — the first build of these stores reported 12 errors.

**Harness (`acceptance/run.js`):**
- `PLANT_STORES` added alongside `FIXTURES`; the plant stores are deliberately
  NOT in `FIXTURES`, whose loops assume a whole app fixture that loads clean and
  is cold-run by A1.
- A1's seed-leakage regex now also refuses the plant-store names (it previously
  matched only `(swift|ts)-app`, so a `plant-*` leak would have passed).
- §A3 gains six checks: one golden per plant, a `--today` control proving
  plant 1 is date arithmetic rather than a broken record, and an explicit
  "no plant masks another" assertion.

**Collateral, and why:**
- `tests/module-load.test.js` used `fixtures/ts-app` as a convenient healthy
  store to prove the entry shim costs nothing on a clean run; the plants made it
  exit 1. Repointed to `fixtures/swift-app`, whose planted cases are value-side
  (`validate-values.js`) leaving it structurally clean — the only property that
  test needs. The shared `fixture` constant is untouched; a second named
  constant was added so the intent is explicit.
- Three A5 walkthroughs run against copies of `fixtures/ts-app` and capture real
  output; every affected block was **re-captured by running the commands**, never
  hand-edited. Note two of them now end on a truthful exit 1 with the plants
  documented, rather than on a green validator. That is honest to the fixture:
  A5 is the manual criterion, and forcing green by suppressing a plant would
  defeat the point of planting it.

**Gates:** `npm test` 976/976, `npm run lint` 204 files 0 failures,
`npm run acceptance` A1-A4 + A6 PASS (A3 now 9/9), A5 MANUAL by design.
`lint` skips `fixtures/` by existing design (`scripts/lint.js:16`), because
acceptance fixtures deliberately contain malformed shapes. D-007 verified
empirically: a seeded scaffold contains no `plant-*`, `FIXTURE.md`, or
fixture-app artifact.

## 6. Verified reference points

- Loader duplicate detection: `payload/engine/lib/load-stores.js:566-578`, leaf
  call site `:1238`.
- Loader ref resolution: `payload/engine/lib/load-stores.js:1336-1354`.
- Store health verdict: `payload/engine/lib/load-stores.js:1427`.
- Volatility thresholds: `payload/engine/lib/time-verdicts.js:76-80`.
- Registry membership table for leaves: `payload/engine/commands/validate.js:472-492`.
- TS fixture pin test: `tests/fixture-ts-store.test.js:19-22`, `:36-50`.
- Acceptance fixture list: `acceptance/run.js:45`.
- Current TS fixture inventory / planted-drift idiom: `fixtures/ts-app/FIXTURE.md`.
- Swift fixture knowledge store is **empty by design**
  (`fixtures/swift-app/unknown-knowledge/knowledge/_catalog.yaml`) — the TS
  fixture is the only one with leaves, confirming it is the right target.
