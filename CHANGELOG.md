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

- Open-source launch artifacts: Apache-2.0 LICENSE and NOTICE, version
  policy (D-021), publishing/provenance workflow, CONTRIBUTING.md, and
  issue templates (KK-28).
- Client-facing docs shipped in the payload (KK-24): the seeded-repo README
  (`payload/docs/README.md`, seeded to the kit-dir root), the CI wiring
  guide with the D-012 PR drift-attribution recipe, the steward guide, and
  the guarantees-and-boundaries note (D-008 honest boundary, D-011 conduct
  policy, D-014 no-code-execution) — all manifest-listed and pinned by
  `tests/client-docs.test.js`.
