# fixtures/ts-app — TS/JS acceptance fixture (KK-15)

Synthetic sportsbook-flavored TS/JS codebase with its own three stores.
**Acceptance fixture only — never in the init payload (D-007).** The TS never
needs to typecheck or build (D-002); syntactically plausible is the bar.

The fixture's knowledge store lives at `unknown-knowledge/` (the §9.1 target
layout, same as the Swift fixture) and **loads** clean: `ok: true`, zero
diagnostics, via `payload/engine/lib/load-stores.js`. Loading clean is not the
same as validating clean — the store carries planted findings by design
(`validate.js` exits 1 on it, per the UCS-1159 table below), and that
distinction is load-bearing: a store that failed to LOAD would abort every
check before any planted case could be observed. Descriptor `source` paths and
`source-of-truth` pointers are relative to `fixtures/ts-app/` (the repo the
stores describe), not to the store root.

KK-16's A2/A3 acceptance assertions are written against the tables below.
Every planted case is deliberate; if you "fix" one, you break the harness.
All store files are **schema-valid**: drift is planted in *values*, never in
descriptor shape, so no case hides behind a malformed-descriptor hard error.

Kind coverage (every TS-relevant MVP kind, §5.1): `ts-const-array` (.ts and
.js), `ts-union`, `ts-enum`, `ts-object-keys` (.ts and .tsx), `json-keys`,
`json-map-keys`, `dir-modules` (plain and pattern/strip).

## A2 — clean extractions (expected: descriptor values == extracted values)

| Concept | Kind | Anchor (file:line) | Symbol | Expected value set | Notes |
|---|---|---|---|---|---|
| K-101 (`unknown-knowledge/ontology/classes/100-product.yaml:7`) | ts-const-array | `src/registry/sports.ts:5` | `SUPPORTED_SPORTS` | nfl, nba, mlb, nhl, soccer | Adversarial-but-extractable: multi-line, trailing comma, `//` and `/* */` comments between members, mixed quotes, `as const` |
| K-103 (`:24`) | ts-union | `src/types/bet-status.ts:5` | `BetStatus` | open, settled, voided, cashed-out | Adversarial-but-extractable: leading-pipe multi-line union, interleaved comment |
| K-105 (`:36`) | ts-enum | `src/types/currency.ts:6` | `Currency`, `emit: names` | USD, EUR, GBP, CAD | Adversarial-but-extractable: string initializers, mixed quotes, comment, trailing comma; `emit: names` pins the facet (§3.5 — raw values are lowercase) |
| K-106 (`:49`) | ts-object-keys | `src/registry/promotions.ts:5` | `PROMOTIONS` | welcome-bonus, reload, odds-boost, referral | Adversarial-but-extractable: quoted dashed keys + bare keys, nested objects, nested array (`appliesTo`, line 9) whose members must NOT leak into the key set |
| K-107 (`:61`) | ts-object-keys | `src/components/StatusBadge.tsx:7` | `STATUS_COLORS` | open, settled, voided, cashed-out | **.tsx extension** (§5.1: kinds describe shape, not file type); JSX inline `{{ color: ... }}` at line 16 must not match |
| K-114 (`:121`) | ts-const-array | `src/registry/loyalty-tiers.js:4` | `LOYALTY_TIERS` | bronze, silver, gold, platinum | **plain .js extension** — TS kinds read JS too |
| K-109 (`:74`) | json-keys | `config/features.json:1` | — | live-betting, cash-out, same-game-parlay | Top-level keys; boolean values must not coerce into the set |
| K-112 (`:85`) | json-map-keys | `package.json:10` | `dependencies` | react, react-dom, zod | Keys under a dotted path; `scripts` keys (line 6) must not leak in |
| K-110 (`:97`) | dir-modules | `src/verticals/` | — | sportsbook, casino, poker | Plain directory listing (no pattern: SUBFOLDER facet); folder-identity pointer paired with entry file `src/verticals/sportsbook/index.ts` (§3.1) |
| K-111 (`:108`) | dir-modules | `src/routes/` | `pattern: *.route.ts`, `strip: .route.ts` | home, account, bets | Pattern pins the FILE facet, strip removes the suffix (KK-10); `src/routes/routes.test.ts` is excluded by the pattern |

## A3 — planted drift (expected: exactly these findings, no others)

| Case | Concept | Anchor (file:line) | Expected finding |
|---|---|---|---|
| value-not-in-source | K-102 (`unknown-knowledge/ontology/classes/100-product.yaml:134`) | `src/registry/markets.ts:4` (`MARKET_TYPES`) | Descriptor claims `futures` (`100-product.yaml:146`); source has only moneyline, spread, totals, parlay → **`value-not-in-source`** for `futures`, and only `futures`. The claimed value appears NOWHERE in the source file, comments included — grep-level detectors must not be pacified lexically |
| source-value-missing | K-104 (`:147`) | `src/types/withdrawal.ts:4` (`WithdrawalMethod`) | Source has ach, wire, paypal, **crypto**; descriptor claims only ach, wire, paypal → **`source-value-missing`** for `crypto`, and only `crypto` |
| wrong-pointer | K-108 (`:161`) | descriptor names `src/registry/sports.ts:5`; true home is `src/registry/locales.ts:5` | ALL claimed values (en-US, es-MX, pt-BR) missing from a real, parseable file → the **wrong-pointer (all-values-missing) signature**, distinguished from ordinary drift |

## Frontmatter v2 — the five planted cases (UCS-1159)

The A3 table above is the *ontology-side* drift (concept `enumerates` vs. TS
sources). This table is its knowledge-side counterpart: five deliberate plants
in the **frontmatter v2** record, each producing exactly one tabulated finding
at the engine CLI seam, each asserted as its own golden in `acceptance/run.js`
(§A3). Anchors are `file:line`, 1-based, relative to the listed root.

| # | Case | Target | Anchor (file:line) | Expected finding | Root |
|---|---|---|---|---|---|
| 1 | stale volatile leaf | `L-000200` | `unknown-knowledge/knowledge/product/100.2-cashing-out-a-bet.md:16-17` (`volatility: volatile`, `verified: "2026-01-05"`) | `preflight.js --leaves L-000200 --today 2026-08-16` → leaf verdict **`stale`**, `counts.stale: 1`, **exit 1**. 223 days vs. the 90-day `volatile` limit. At `--today 2026-02-01` the same leaf is `trusted` — the plant is the date arithmetic, never the wall clock | `fixtures/ts-app` |
| 2 | jurisdiction mismatch | `L-000100` | `unknown-knowledge/knowledge/product/100.1-adding-a-new-sport.md:15` (`jurisdictions: [uk-gc]`) | `validate.js` → **`unregistered-value`** at path **`applies.jurisdictions[0]`**, **exit 1**. The registry is deliberately empty (`_registries/jurisdictions.yaml:8`), so no jurisdiction is minted | `fixtures/ts-app` |
| 3 | unresolvable relates ref | `L-000100` (plant store) | `unknown-knowledge/knowledge/product/100.1-adding-a-new-sport.md:21` (`see-also: [L-000999]`) | `validate.js` → **`unresolved-ref`** at path **`relates.see-also[0]`**, **exit 2**, and *nothing else* — a store that fails to load reports its diagnostic alone | `fixtures/plant-unresolved-relates` |
| 4 | unregistered facet value | `L-000100` | `unknown-knowledge/knowledge/product/100.1-adding-a-new-sport.md:10` (`form: walkthrough`) | `validate.js` → **`unregistered-value`** at path **`facets.form`**, **exit 1**. Only `recipe` is minted (`_registries/form.yaml:8`) | `fixtures/ts-app` |
| 5 | duplicate accession ID | `L-000100` (twice) | `unknown-knowledge/knowledge/product/100.2-onboarding-a-new-sport.md:3` (`id: L-000100`) | `validate.js` → **`duplicate-id`** at path **`id`**, **exit 2**, and *nothing else*. The later mint loses: it never enters the index, and its edges never enter the ref graph | `fixtures/plant-duplicate-accession` |

Cases 2 and 4 share the code `unregistered-value` and are distinguished **only
by `path`** — the acceptance assertions pin the path for exactly that reason.

### Harness invariants

- **Every plant is deliberate.** Fixing one breaks the harness. Each has a
  golden in `acceptance/run.js` §A3.
- **Drift is planted in VALUES, never in SHAPE.** Every record above is
  schema-valid and well-formed, so no case hides behind a malformed-descriptor
  hard error. This holds for the two loader-fatal plants too, and that is the
  subtle part: two *well-formed* leaves claiming one accession (case 5), and a
  *well-formed* typed edge carrying a syntactically valid accession that names
  no leaf (case 3), are defects of **meaning**, not of shape. Nothing is
  malformed; nothing hides. The loader diagnostic IS the expected finding.
- **No plant masks another.** Cases 3 and 5 are loader-fatal: they set
  `model.ok = false`, and every engine surface then reports that diagnostic and
  abandons the run, so any plant sharing their store would be swallowed
  (verified empirically — the two `unregistered-value` findings vanish entirely
  when a `duplicate-id` is added to the same store). No engine flag scopes past
  loader health: `validate.js` takes no `--leaves`, and `preflight --leaves` on
  an unrelated clean leaf still degrades to `store-verdict: unknown`. **That is
  why cases 3 and 5 live in their own minimal roots** — one planted defect
  apiece, observed in isolation, which is what "golden per plant" requires.
- **The main store stays loadable.** Cases 1, 2 and 4 are value-level, so
  `fixtures/ts-app` keeps `store-health: { ok: true, errors: 0 }` and the
  fixture-store pin test (`tests/fixture-ts-store.test.js` — store loads with
  zero diagnostics, every pointer resolves) stays green **unchanged** around
  the plants. A store that failed to load would abort every check before any
  drift was observed.
- **Dates are injected, never read.** Case 1 is the only date-sensitive plant
  and is always exercised with an explicit `--today` (D-012).

### The plant stores

`fixtures/plant-duplicate-accession/` and `fixtures/plant-unresolved-relates/`
are minimal knowledge-only stores: catalog, rules, the seven registries, one
self-contained `D-101` that mints them, and the one or two leaves the plant
needs. They are **not** app fixtures — they carry no source tree, are not in
`acceptance/run.js`'s `FIXTURES` list (whose loops assume a whole app that
loads clean and is cold-run by A1), and each **fails to load by design**. Their
`D-101` is self-contained rather than copied from `ts-app`: the `ts-app` entry
relates to `K-101`/`L-000100`, and those refs would not resolve in a store with
no ontology, adding `unresolved-ref` noise that would pollute the single
tabulated plant. They appear in `PLANT_STORES` so the D-007 leakage sweep
covers their names — a client repo must never be seeded with a store that is
planted to fail.

## §5.1 — out-of-envelope anchors (expected: extractor HARD-ERRORS, exit 2 semantics — never a partial value set)

| Case | Concept | Anchor (file:line) | Sentinel | Wrong-parse trap |
|---|---|---|---|---|
| spread in const array | K-113 (`:174`) | `src/registry/leagues.ts:7` (`ALL_LEAGUES`) | `...US_LEAGUES` spread | Naively extracting the literals yields epl, laliga and silently misses 4 leagues — must hard-error instead |
| computed object key | K-115 (`:187`) | `src/registry/experiments.ts:7` (`EXPERIMENTS`) | `` [`${NS}-new-bet-slip`] `` (line 8) | Key set is lexically unknowable; extracting only `quick-bet` is a confident wrong parse — must hard-error |
| re-export barrel | K-116 (`:199`) | `src/types/index.ts:5-6` | `export *` / `export { ... } from` | `BetStatus` is not declared here; parsing is lexical and single-file — must hard-error, never follow the chain |

These three double as miss-log material (unextractable anchors → extractor
backlog, §6): finding kinds are per KK-07's dispatch, but the invariant KK-16
asserts is *hard error, never a silently wrong value set*.

## Adversarial-but-extractable inventory (§5.1 "not just unextractable ones")

- `src/registry/sports.ts:5-11` — comments between array members, mixed
  quotes, trailing comma, `as const`.
- `src/types/bet-status.ts:5-10` — leading-pipe multi-line union with an
  interleaved `//` comment.
- `src/types/currency.ts:6-11` — enum members with string initializers,
  mixed quotes, comment, trailing comma (`emit: names`).
- `src/registry/promotions.ts:5-12` — dashed quoted keys, nested object and
  nested array values that must not pollute the top-level key set.
- `src/components/StatusBadge.tsx:15-19` — JSX with inline object literals
  outside the anchored symbol's span.

## Store contents (all load clean)

- `unknown-knowledge/ontology/classes/100-product.yaml` — 16 concepts
  K-101..K-116, every `enumerates.source` names a listed `source-of-truth`
  entry (§3.5).
- `unknown-knowledge/knowledge/product/100.1-adding-a-new-sport.md` — a cited
  leaf carrying the full frontmatter v2 record (UCS-1149): all four governed
  facets, a registry-minted operation, a tiered citation, and `provenance`. It
  hosts UCS-1159 plants **2** (`applies.jurisdictions: [uk-gc]`) and **4**
  (`facets.form: walkthrough`). Its body opens with a topic sentence, which is
  what display surfaces derive a one-liner from now that `description` is
  retired.
- `unknown-knowledge/knowledge/product/100.2-cashing-out-a-bet.md` — a second
  v2 leaf (`L-000200`) carrying the Time facet (UCS-1150) and a resolving
  `relates.see-also` edge back to `L-000100`. It hosts UCS-1159 plant **1**
  (stale volatile). It sits on its own leaf deliberately: the stale plant and
  the registry plants must be separately observable in one preflight run
  (`L-000100` quarantined, `L-000200` stale), which is what proves neither
  masks the other.
- `unknown-knowledge/knowledge/_registries/*.yaml` — the seven governed
  vocabularies (domains, form, anchor, stage, operations, jurisdictions,
  authority-tiers). Every minted value cites D-101, and the warrants show the
  three kinds of rationale a real store carries:
  - **material-based** (domains, form, operations, authority-tiers, plus
    `anchor: artifact` and `stage: verified`) — the warrant names leaf 100.1,
    which exists and needs the value. This is the ordinary case and the only
    one literary warrant strictly demands.
  - **fixed-vocabulary** (`anchor: world`, `anchor: team`) — minted with no
    leaf using them yet, because the three truth anchors are D-003's store
    model rather than a per-project choice; a store carrying only one of them
    would still not be free to invent a fourth.
  - **lifecycle** (`stage: draft`, `stage: proposed`) — minted because the
    shared pre-promotion predicate reads exactly these spellings, so they are
    load-bearing on engine behaviour rather than on any one leaf.

  `jurisdictions` is deliberately EMPTY, and stays that way: `L-000200` claims
  universally (`applies.jurisdictions: []`), and `L-000100`'s `uk-gc` is
  UCS-1159 plant 2 — a claim with no minted vocabulary behind it, which is
  precisely the finding that plant exists to raise. Minting `uk-gc` here would
  silence it. No `deprecated` stage is minted — no leaf surface implements the
  demotion that word carries in the concept lifecycle. `form` mints only
  `recipe` for the same reason: `walkthrough` is plant 4, not an omission.
  `operations` mints `add-sport` and `cash-out-bet`, one per leaf.
- `unknown-knowledge/decisions/entries/D-101-sports-registry-const-array.yaml`
  — referenced by K-101's `rationale` and relating back to K-101 / leaf 100.1,
  and cited by every registry value as the minting decision.

## Non-anchor scenery

`src/verticals/*/index.ts`, `src/routes/*.route.ts` are minimal one-liner
modules that exist to be listed by dir-modules; `src/routes/routes.test.ts`
exists to be excluded by K-111's `*.route.ts` pattern;
`src/registry/locales.ts` exists so K-108's wrong pointer has a true home an
audit could rediscover.
