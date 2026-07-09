# fixtures/ts-app — TS/JS acceptance fixture (KK-15)

Synthetic sportsbook-flavored TS/JS codebase with its own three stores.
**Acceptance fixture only — never in the init payload (D-007).** The TS never
needs to typecheck or build (D-002); syntactically plausible is the bar.

The fixture's knowledge store lives at `unknown-knowledge/` (the §9.1 target
layout, same as the Swift fixture) and loads clean: `ok: true`, zero
diagnostics, via `payload/engine/lib/load-stores.js`. Descriptor `source`
paths and `source-of-truth` pointers are relative to `fixtures/ts-app/` (the
repo the stores describe), not to the store root.

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
- `unknown-knowledge/knowledge/product/100.1-adding-a-new-sport.md` — one
  cited leaf.
- `unknown-knowledge/decisions/entries/D-101-sports-registry-const-array.yaml`
  — referenced by K-101's `rationale` and relating back to K-101 / leaf 100.1.

## Non-anchor scenery

`src/verticals/*/index.ts`, `src/routes/*.route.ts` are minimal one-liner
modules that exist to be listed by dir-modules; `src/routes/routes.test.ts`
exists to be excluded by K-111's `*.route.ts` pattern;
`src/registry/locales.ts` exists so K-108's wrong pointer has a true home an
audit could rediscover.
