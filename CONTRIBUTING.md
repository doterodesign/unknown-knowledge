# Contributing to unknown-knowledge

Thanks for contributing. The kit is Apache-2.0 (see LICENSE); by submitting
a contribution you agree it is licensed under the same terms (Apache-2.0
§5). The domain glossary is [CONTEXT.md](CONTEXT.md); the kit records its own
decisions in [decisions/](decisions/).

## Community extractor kinds — the gate

New extractor kinds are the main community contribution surface, and they
enter through the **same gate as everything else** (D-000005: validators run
only vendored, versioned, tested code — never code authored in the session
that runs it). A kind PR carries three things, no exceptions:

1. **The parser** — small, deterministic, lexical-only (D-000014: never
   executes client code, no network).
2. **A fixture** — a minimal anchor file plus expected output, wired into
   the test suite.
3. **A demo run** — evidence in the PR that the validator reads the fixture
   through the new kind end to end.

Start from the shipped template at
[payload/templates/new-kind/](payload/templates/new-kind/) and follow the
governed pipeline in
[payload/protocol/new-kind-pipeline.md](payload/protocol/new-kind-pipeline.md)
— it walks a miss-log entry to a merged kind. Before drafting a parser,
weigh reifying the anchor into a standard shape instead; the best fix is
often in the code being described, not a new parser.

Field misses (anchors no shipped kind can read) are welcome even without a
parser: file a **miss-log submission** issue using the template — that is
the demand signal the kind backlog is built from.

## Pull request expectations

- **Tests**: `npm test` green; new behavior comes with tests. Build new tests
  on the shared fixture in `fixtures/canonical` (see its README) rather than
  initializing a repository per test.
- **Lint**: `npm run lint` clean.
- **Acceptance**: `npm run acceptance` green.
- **Structural validation**: `node payload/engine/validate.js --root .`
  exits 0 — the kit dogfoods its own stores, so changes to `decisions/`
  must stay schema-valid.
- **Deterministic output**: engine output must be stable across runs and
  machines — no wall-clock, no randomness, no network, no environment
  leakage. Injected dates only.
- **Version every PR**, including docs-only changes: advance `package.json`
  and both root version fields in `package-lock.json` relative to the current
  target branch. D-000021 defines MAJOR for schema/breaking CLI changes, MINOR
  for additive surfaces/kinds/fixture vintages, and PATCH for fixes/docs.
  During an existing prerelease cycle, advance `rc.N` for changes within that
  planned release; reassess the target version if the release scope changes.
  Reconcile concurrent bumps before merge. Internal commits/cherry-picks within
  one PR do not each need a bump.
- **Changelog**: describe every PR under `## [<version>] - Unreleased` until
  publication; record the real release date when cutting the release. Preserve
  older notes and dates. `node scripts/check-pr-version.js <base-commit-sha>`
  checks version advance, lock consistency and changed versioned notes in CI.
- **Decisions**: capture every substantive choice in `decisions/entries/` and
  its catalog, or link the existing decision that covers it. Include rationale,
  tradeoffs, consequences and implementation/evidence links. Preserve history;
  use proposal keys until governed canonical publication.
- **Documentation**: update all affected READMEs, AGENTS/agents files, protocol
  instructions, API/CLI examples, schemas/manifests and contributor, publishing,
  migration and acceptance guides in the same PR. Explain unchanged surfaces
  in the PR checklist. Do not rewrite frozen historical evidence.
- One logical change per PR. Versioning a PR does not publish a release.

## Reporting bugs

Use the bug issue template. For anchors the extractor library cannot read,
use the miss-log submission template instead — it mirrors the
`logs/misses/` schema so a maintainer can triage it straight into the
backlog.
