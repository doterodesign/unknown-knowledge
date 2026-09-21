# Licensing documentation correction

The correction retains Apache-2.0 and the studio's service-revenue model.
It corrects licensing explanations without changing software behavior.

## Authority and history

- **User authorization:** Dimitri requested this scoped correction and draft PR
  on 2026-09-21. No merge, package publication, or license change was authorized.
- **Decision status:**
  [D-2026-09-21-licensing-clarification](../../decisions/entries/D-2026-09-21-licensing-clarification.yaml)
  is a proposed addendum. The current schema stores that provisional proposal
  key in `id`; it has no separate `proposal-key` field. No canonical ID or
  acceptance has been assigned. `deciders: [dimitri]` names the steward who
  will review it, not an approval of the resulting text.
- **Verified base:** `main` at `08066b5` uses `D-015` and `D-020`, rather than
  six-digit decision IDs. The base catalog contains no licensing correction.
  The resumed review found and reused the correction already on draft
  [PR #76](https://github.com/doterodesign/unknown-knowledge/pull/76), through
  commit `eb0e843`, on a separate local branch in this isolated worktree.
  A fresh fetch confirmed the same target base and GitHub's public repository
  visibility. D-001, D-015, D-020, D-021 and the protocol's lifecycle and
  authoring rules were read before editing.
- **Historical records:** D-015/D-020 retain every parsed field, including
  reasoning, status and supersession fields. Only navigation comments were
  added. The addendum uses `relates-to`, not a claim of accepted supersession.
  D-001 remains unchanged; current docs clarify its ownership shorthand.
- **Publication status:** package and both root lockfile versions advance from
  `3.0.0-rc.1` to `3.0.0-rc.2`. D-021 classifies documentation as PATCH work;
  this branch advances the existing prerelease sequence, not a stable release.
  The versioned changelog is explicitly unreleased, without a release date.
  Published-pilot instructions continue to name `rc.1`.

## Source verification

Official sources checked on 2026-09-21:

| Source | Scope of the correction |
|---|---|
| [Apache License 2.0 §§1–4](https://www.apache.org/licenses/LICENSE-2.0) | The licensed work, derivative works, permissions and redistribution duties. Section 4(d) makes NOTICE informational and permits specified attribution locations. |
| [Apache licensing FAQ](https://www.apache.org/foundation/license-faq.html) | Commercial redistribution and modifications remain subject to the license; Apache does not require returning modifications upstream. |
| [OSI Open Source Definition §§1, 6, 9](https://opensource.org/osd) | Open source permits commercial activity and does not automatically restrict separate software distributed alongside it. |
| [GNU FAQ: aggregation](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation) and [program output](https://www.gnu.org/licenses/gpl-faq.en.html#WhatCaseIsOutputGPL) | Separate works and program output are not automatically covered by the program's license; copied licensed material and combined works require attention to their specific terms. |

Apache and OSI pages were read directly. The browser timed out on the GNU FAQ;
the resumed review retrieved the official page directly with HTTP and read the
aggregation and output sections. That resolves the initial source-access
limitation. No claim here decides a particular GPL/AGPL combination, customer
record, or distribution arrangement. The unchanged LICENSE governs over this
summary.

## Documentation coverage

The user explicitly authorized review of README, agent, contributor and seeded
documentation. No confirmed `survey-scope.yaml` exists at this base; that
explicit documentation scope governed this review. It did not extend to a
dependency audit or source-code ownership investigation. Searches covered the
tracked Markdown, YAML and HTML documentation for the inaccurate licensing
claims and related ownership, NOTICE and commercial-use language.

| Surface | Result |
|---|---|
| Root `README.md` | Replaces NOTICE-only shorthand; explains deliberate licensing, redistribution, commercial permissions and independent customer records, including the caveat for incorporated licensed material. |
| `CONTEXT.md` | Clarifies ongoing software license duties and separates the studio's business model from downstream permissions. |
| `CONTRIBUTING.md` | Links the redistribution explanation and distinguishes independent customer records from submitted contributions. |
| `payload/docs/README.md` | Corrects blanket ownership wording and supplies licensing guidance that actually reaches future seeds. |
| `decisions/` | Adds the cataloged proposal and historical navigation comments; preserves accepted reasoning and lifecycle fields. |
| `payload/protocol/AGENTS.md`, protocol skills and other protocol docs | Reviewed; no inaccurate license or NOTICE-only claims. Conduct-policy editing instructions need no licensing change. No root `AGENTS.md`, lowercase `agents.md`, or other tracked agent entry file exists at this base. |
| Other READMEs, `payload/docs/`, templates, fixtures and acceptance docs | No additional affected licensing claims. Historical walkthroughs and pinned fixture evidence are preserved. Operational ownership language does not purport to transfer copyright. |
| `docs/publishing.md`, migration docs, `.github/` instructions and prior agent reports | No additional affected licensing claims. Existing Apache/package references and published-release instructions remain accurate for their stated purpose. No PR template exists at this base. |
| `cli/kit.manifest.yaml` | Corrects the zone-map comment's blanket ownership claim. Parsed manifest data and license-file seeding remain unchanged. |
| `LICENSE`, `NOTICE` and package license metadata | Unchanged: Apache-2.0 and informational attribution. |

The remaining inaccurate phrases occur in the explicitly preserved historical
D-015/D-020 reasoning. Their comments and the catalog point to the proposal;
current documentation uses the corrected explanation. No license transition,
commercial restriction, trademark policy, architecture redesign or audit of
third-party rights is introduced.

The resumed review also corrected the manifest's ownership comment, which the
initial coverage report had missed. Its zone map describes provenance; it does
not transfer copyright. Parsed manifest data is identical to the target base.

## Validation

Lint passes (135 files). Acceptance passes A1–A4 and A6. Structural and value
validation pass. Additional checks pass for matching package/lockfile versions,
the candidate tag guard, unchanged parsed historical records, local
documentation links, and packaged documentation (`npm pack --dry-run`). The
acceptance init checks verify seeded documentation against the manifest.
No code tests were added for prose changes.

The existing test `the CHANGELOG carries a heading for the version the manifest
names` in `tests/check-tag-version.test.js` requires a release date even for an
unreleased candidate. This conflicts with D-021's instruction to record dates
at release time. The branch retains an honest unreleased heading and leaves the
test intact. A second repository test, `each entry file declares exactly the
D-NNN id its filename carries`, permits only finalized three-digit filenames,
although the protocol and schema permit date-suffixed proposals. The branch
preserves the proposed record and does not mint a canonical ID to satisfy it.
These are review blockers, not passing release checks.

CI on commit `8a63bce` completed all 1,091 tests: 1,089 passed and only those
two assertions failed. CI acceptance passed. The duplicate local test run was
stopped after the complete CI results arrived. The staged commit gate also
passed both validators. No release or acceptance is inferred from the package
version or structural validation.

The resumed review confirmed the same results in CI run
[35561111163](https://github.com/doterodesign/unknown-knowledge/actions/runs/35561111163)
on `eb0e843`. After the additional README and manifest-comment corrections,
local lint, structural/value validation, store-health preflight, automated
acceptance, package dry-run, local-link, version-consistency and preservation
checks passed. Focused execution of `tests/check-tag-version.test.js` and
`tests/store-dogfood.test.js` passed 22 of 24 tests and reproduced exactly the
two failures above. No executable code or tests changed; the full-suite count
is from the linked CI run, not a claim of a new full local run. Resolving the
test/workflow conflicts remains necessary before the PR can pass required CI.

Store-health preflight passes with the two expected missing ontology/knowledge
warnings in this decision-only repository. Initially the engine could not load
because dependencies were absent; `npm ci --ignore-scripts` restored them and
resolution/preflight were rerun successfully before editing. The correction
finding was created through `log-entry.js` and contains paths only.

Acceptance's A5 agent walkthrough remains a manual check. Licensing prose is
reviewed against the sources above; validator success checks record structure,
not legal interpretation or human acceptance. Existing customer checkouts are
not updated by this change because seeding has no automatic update channel.
