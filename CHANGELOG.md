# Changelog

All notable changes to the `unknown-knowledge` kit are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/) with the
kit-specific semantics recorded in decision D-021 (`decisions/entries/`):
MAJOR = store schema-version bump or breaking engine CLI contract change;
MINOR = new extractor kinds, new engine surfaces, or a new fixture vintage;
PATCH = fixes and documentation. Entries accrue under Unreleased as PRs land;
each release moves them under a version heading with the release date —
dates are recorded at release time, never retroactively.

## [Unreleased]

### Added

- Frontmatter v2 core (UCS-1149): the leaf classification layer, built
  entirely from governed vocabularies. `facets.form`, `facets.anchor`, and
  `facets.stage` join `facets.domain` as registry-checked fields — three
  declarations in `FACET_REGISTRIES`, no new membership code path — with
  three new registry templates (`form`, `anchor`, `stage`) seeded into the
  client's knowledge store.
- Optional `provenance` (`author`, `skill-version`) on leaves, recorded but
  never judged: it round-trips untouched through resolver and validator
  output.
- `missing-authority`: a leaf citation with no authority tier is a finding
  in any store that carries an authority-tiers registry. The tier is what
  ranks a source against a conflicting one, so an untiered citation reads as
  complete while opting out of conflict resolution.
- The stage vocabulary is `draft`, `proposed`, `verified` — three values, not
  four. There is deliberately no `deprecated` stage: the concept lifecycle gives
  that word real semantics (§3.5 demotes its findings to warnings) and no leaf
  surface implements the match, so the term would rank a retired leaf above a
  draft one and read as `trusted`. Retiring a leaf lands with its semantics in a
  later ticket.
- `preflight --leaves <ids>`: leaf-facing verdicts, counted and gated
  alongside concept verdicts. A `stage: draft` leaf verdicts `unknown` and
  is downranked in resolver output through the SAME `isPrePromotionStatus`
  predicate, so the two surfaces cannot disagree about which leaves are
  provisional.
- Resolver knowledge entry points publish `stage`, `excerpt`, `provenance`,
  and `downranked`, each a stable key that may be null.

### Changed (BREAKING — major, per D-021)

- The leaf `description` field is RETIRED. Under `additionalProperties:
  false` a leaf still carrying it fails as an unknown property. Display
  prose is now DERIVED from the body's first sentence, so a leaf's one-liner
  cannot drift from the content it summarizes — bodies must open with a
  topic sentence. This is a store schema-version-class break and the reason
  the next release is a major one.

## [1.0.0] - 2026-07-09

The first released version. The kit is seeded once and then owned (D-001):
what a repo receives here is what it keeps, so this release fixes every
exit-code defect found before it, rather than shipping them into client
repos that have no update channel.

### Added

- Open-source launch artifacts: Apache-2.0 LICENSE and NOTICE, version
  policy (D-021), publishing/provenance workflow, CONTRIBUTING.md, and
  issue templates (KK-28).
- Client-facing docs shipped in the payload (KK-24): the seeded-repo README
  (`payload/docs/README.md`, seeded to the kit-dir root), the CI wiring
  guide with the D-012 PR drift-attribution recipe, the steward guide, and
  the guarantees-and-boundaries note (D-008 honest boundary, D-011 conduct
  policy, D-014 no-code-execution) — all manifest-listed and pinned by
  `tests/client-docs.test.js`.
- One flag grammar and one crash epilogue for all nine command-line
  surfaces (`lib/cli.js`), and an entry shim over each so a module-load
  failure cannot be mistaken for findings.
- `lib/iso-date.js` — one definition of an ISO date, calendar-checked.
- `lib/suppressions.js` — the reverse audit's rejection memory behind its
  own seam; each Finding carries the identity that would silence it.
- `scripts/check-tag-version.js` — the publish workflow refuses a release
  tag that disagrees with the package version, before publishing.

### Changed

**The exit-code contract is now enforceable, and several commands changed
exit codes to honour it.** Exit 1 means FINDINGS; exit 2 means the check
did not run. An agent riding those codes quarantines and continues on 1,
so a crash wearing it walks past a check that never happened (PRD §5,
D-011).

- A module-load failure — a corrupt engine file, or an uninstalled
  `js-yaml` — now exits 2 on every surface. It exited **1**.
- `audit --today 2026-02-30` now exits 2. It exited 0 and measured
  staleness from March 2nd, because `Date.parse` rolls the date forward.
- `log-entry --date 2026-13-01` now exits 2. It exited 0 and wrote
  `logs/findings/2026-13-01-<suffix>.yaml` — month thirteen, in a
  permanent audit trail.
- An empty flag value is refused rather than read as a default:
  `survey-map --root ''` surveyed the current directory and exited 0;
  `audit --stale-days=` meant "everything is stale" and exited 0.
- `survey-map` refuses a root named both positionally and by `--root`,
  rather than letting argument order decide.
- Every command accepts `--flag=value` as well as `--flag value`. `init`
  never did.
- The reverse audit stays advisory: findings alone never gate, and
  `--fail-on-findings` is never a shipped CI default (D-013).

### Fixed

- An empty or comment-only `suppressions.yaml` warned "unparseable YAML".
  It has no entries, which is what it says.
- The engine's language is recorded correctly: D-022 supersedes D-002,
  which claimed TypeScript. The engine has always been JavaScript with
  JSDoc types and no build step.
