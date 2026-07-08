# Swift fixture app — planted-case manifest (KK-14)

Synthetic Swift codebase for acceptance criteria **A2** (extraction) and
**A3** (drift), PRD §10. **Never shipped by init** (D-007): nothing under
`fixtures/` appears in any payload manifest. The Swift never needs to compile;
it is syntactically plausible input for the regex-level extractors (§5.1).

The fixture's knowledge store lives at `unknown-knowledge/` (the §9.1 target
layout) and loads clean: `ok: true`, zero diagnostics, via
`payload/engine/lib/load-stores.js`. All paths below are relative to
`fixtures/swift-app/`; line numbers are 1-based. KK-16 writes its A2/A3
assertions against the tables in this file.

## 1. Anchors per Swift-relevant extractor kind (A2)

Every Swift-relevant MVP kind (§5.1 / KK-09) has at least one clean anchor.

| Kind | Anchor | Concept / descriptor | Expected value set |
|---|---|---|---|
| `swift-enum` (emit: `case-name`) | `Sources/Sportsbook/Sport.swift:12-20`, symbol `Sport` | K-110 | `football, basketball, baseball, iceHockey, soccer, tennis` |
| `swift-enum` (emit: `raw-value`) | same anchor | K-120 | `NFL, NBA, MLB, NHL, EPL, ATP` |
| `swift-const-array` | `Sources/Sportsbook/Markets.swift:9-16`, symbol `supportedMarkets` | K-130 | `moneyline, spread, totals, parlay, same_game_parlay, props` |
| `swift-const-array` | `Sources/Settings/Theme.swift:9`, symbol `themeNames` | K-170 (wrong-pointer, §3) | `light, dark, system` |
| `yaml-keys` | `Config/app-config.yaml` (top level: lines 7, 10, 14, 18, 22) | K-140 | `environment, api, regions, telemetry, on` |
| `yaml-map-keys` | `Config/feature-flags.yaml:11-14`, path `flags.betting` | K-150 | `parlay-builder, cash-out, same-game-parlay, 2027-preview` |
| `strings-keys` (.strings) | `Resources/en.lproj/Localizable.strings:7,8,13,14` | K-160 desc 1 | `welcome.title, welcome.subtitle, betslip.add, betslip.confirm` |
| `strings-keys` (.xcstrings) | `Resources/Localizable.xcstrings:4,9,14,20` | K-160 desc 2 | `cta.deposit, cta.withdraw, legal.disclaimer, promo.100-bonus` |

Uncovered-by-design anchors (survey-candidate material, no concept points at
them): `SportGroup` enum (`Sources/Sportsbook/Sport.swift:38-41`),
`retiredMarkets` (`Sources/Sportsbook/Markets.swift:20`), `core`
(`Sources/Payments/Providers.swift:7`), `flags.account`
(`Config/feature-flags.yaml:15-17`).

## 2. Planted drift (A3, bidirectional)

Concept store: `unknown-knowledge/ontology/classes/100-app.yaml`.

| Concept | Descriptor | Planted case | Expected finding |
|---|---|---|---|
| K-110 | `swift-enum` case-name on `Sport` | claims `cricket`; no such case exists | `value-not-in-source`: `cricket` |
| K-110 | same | source case `tennis` (`Sport.swift:20`) is unclaimed | `source-value-missing`: `tennis` |
| K-150 | `yaml-map-keys` on `flags.betting` | source key `2027-preview` (`feature-flags.yaml:14`) is unclaimed | `source-value-missing`: `2027-preview` |
| K-160 | `strings-keys` on `Localizable.xcstrings` | claims `cta.transfer`; no such key exists | `value-not-in-source`: `cta.transfer` |

Both directions are covered twice (value-not-in-source: K-110, K-160;
source-value-missing: K-110, K-150) and K-110 drifts both ways at once.

## 3. Wrong-pointer case (A3, all-values-missing signature)

| Concept | Descriptor | Planted case | Expected finding |
|---|---|---|---|
| K-170 "Layout density" | `swift-const-array`, `Sources/Settings/Theme.swift:9`, symbol `themeNames` | file exists, extraction succeeds (`light, dark, system`) — but ALL claimed values (`compact, comfortable, spacious`) are missing | the wrong-pointer signature: every claimed value `value-not-in-source` (and every source value `source-value-missing`), distinguished from ordinary partial drift |

## 4. Unextractable shapes (§5.1 envelope → hard error + miss-log)

| # | Shape | Location | Why out-of-envelope | Expected behavior |
|---|---|---|---|---|
| U1 | `#if DEBUG` conditional compilation inside the enum case span | `Sources/Analytics/Events.swift:11-13`, symbol `AnalyticsEvent` — pointed at by concept **K-180** | Swift `#if` is the declared out-of-envelope sentinel for `swift-enum` (§5.1): a confident parse would silently include or exclude `debugMenuOpened` | extractor HARD-ERRORS (never a value diff); survey logs the shape to `logs/misses/` |
| U2 | computed array — concatenation `core + regional` | `Sources/Payments/Providers.swift:13`, symbol `all` | value set is not a literal; lexical parsing cannot know it | `swift-const-array` pointed here hard-errors; miss-log entry |
| U3 | dynamic derivation — `all.map { $0.capitalized }` | `Sources/Payments/Providers.swift:16`, symbol `checkoutLabels` | same envelope rule, distinct shape (closure) | hard error; miss-log entry |

U2/U3 are deliberately not referenced by any concept (K-180 covers the
descriptor-pointed hard-error path; U2/U3 cover the survey/miss-log path).

## 5. Adversarial-but-extractable shapes (§5.1 — must still parse)

| # | Shape | Location | Trap for a naive parser | Correct result |
|---|---|---|---|---|
| S1 | comment between cases containing the word `case` | `Sport.swift:14-15` | comment counted as a case | ignored |
| S2 | aligned `=` padding | `Sport.swift:17-18` | raw-value regex anchored to `` = " `` exactly | `baseball`/`MLB`, `iceHockey`/`NHL` extracted |
| S3 | trailing comment with a stray `"` quote | `Sport.swift:19` | quote counting breaks | `soccer`/`EPL` extracted |
| S4 | `switch self` arms `case .football:` inside the enum body | `Sport.swift:25-32` | pattern-match `case`s counted as declarations | not values |
| S5 | decoy sibling enum `SportGroup` in the same file | `Sport.swift:38-41` | symbol scoping ignored | `team`/`individual` never bleed into `Sport` |
| S6 | commented-out array entry `// "teaser"` | `Markets.swift:12` | string literal inside a comment extracted | excluded |
| S7 | two values on one line + trailing comma | `Markets.swift:14-15` | one-value-per-line assumption | `parlay` and `same_game_parlay` both extracted |
| S8 | decoy sibling array `retiredMarkets` | `Markets.swift:20` | symbol scoping ignored | `pleaser` never bleeds in |
| S9 | nested maps + YAML anchor/alias (`&api-defaults`, `<<:`) | `app-config.yaml:10-21` | nested keys or merge keys counted as top-level | only the 5 top-level keys |
| S10 | quoted `"on"` top-level key | `app-config.yaml:22` | YAML 1.1 coercion → boolean `true` (§3.5 trap) | string `on`; concept quotes it |
| S11 | sibling map `flags.account` + quoted digit-leading key `"2027-preview"` | `feature-flags.yaml:14-17` | dotted-path scoping ignored; key coerced | only `flags.betting` keys; `2027-preview` as string |
| S12 | `=` inside a .strings value | `Localizable.strings:8` | split-on-`=` grabs the wrong side | key `welcome.subtitle` |
| S13 | commented-out .strings pair | `Localizable.strings:10` | comment extracted | `welcome.legacy` excluded |
| S14 | escaped quotes `\"` inside a .strings value | `Localizable.strings:14` | quote counting breaks | key `betslip.confirm` |
| S15 | `.xcstrings` value containing the token `"strings" :` | `Localizable.xcstrings:14-18` | regex-level key scrape matches inside values | only the 4 top-level `strings` keys |

## 6. Store summary

- Concepts: K-110..K-180 (8), one class file, catalog + rules present.
- Cross-refs: `used-by`, `confusable-with`, `rationale` → D-001 all resolve.
- K-160 exercises multi-entry `source-of-truth` with one descriptor per entry (§3.5).
- Clean concepts (no planted finding): K-120, K-130, K-140, K-160 desc 1.
- Knowledge store is present but empty (A2/A3 are ontology-side).
