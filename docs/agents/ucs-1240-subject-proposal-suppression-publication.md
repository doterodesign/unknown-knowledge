> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Forward proposal suppression publication

Design recorded before implementation RED, under internal code authorization.
This slice is forward `proposed` → `suppressed` for existing Subject proposals.
It does not restore or suppress active canonical Subjects. The
[history Decision](../../decisions/entries/captured-subject-governance-history.yaml)
and [governance Decision](../../decisions/entries/subject-governance-contracts.yaml)
remain proposed; code authorization does not publish them or customer records.

The fixed internal `subject-proposal-suppression` operation reuses the metadata
family's eventless registry-only mechanics through private literal selection and
fixed named exports. Metadata policy identities, phases, reports and semantics
remain unchanged. No public profile resolver, callback pipeline, CLI/MCP workflow,
creation-region change, allocator or replacement action/history validator is
introduced. The only new runtime files are two thin literal worker entrypoints.

Raw input retains the seven fields repoRoot/before/candidate/operation/evidence/
limits/impact; wire version 1 substitutes version for repoRoot. The operation
requires action `suppress`, one registry event, and exact retained-unknown
assignment dispositions. Publication/impact/replay identities are respectively
`subject-proposal-suppression-publication-v1`,
`subject-proposal-suppression-impact-v1`, and
`subject-proposal-suppression-replay-v1`. Profile selection belongs to fixed
internal entrypoints, not request policy strings. Cross-profile requests, even
rehashed/resealed, must refuse through original-input binding and fresh proof.

Native suppression receives the actual BEFORE model and identity index. It
preserves proposed meaning, origin, warrant, parent/related metadata and appends
one native refusal event with its current accepted/addressed Decision and reason.
The selected proposal qualification is explicitly before `subject-proposed` and
after `subject-suppressed`, ineligible on both sides. Native transition/history
proof corroborates the permitted difference; it is not query eligibility.
All canonical subjects and other proposals remain exact, with unchanged ledger,
record files/modes, assignment history and all direct/descendant strict/possible
query memberships. Unknown assignments retain their native possible semantics.

One owned D/A/M admission and authentic core allowance continue into candidate
history evaluation. Separate inventory, closure, reach/tree, query and lookup
capacities keep the existing documented exclusions. The same finite canonical
recipe has C=R*4*(4+2E+4max(E-1,0)) cases and 2C native calls. Selected proposal
outcomes are retained outside canonical operands. Lookup retains full native
before/after results, including the suppression status, under existing 2T limits.

Retention stores only the candidate registry authority artifact, original wire,
caps and raw report. Complete failures retain diagnostics without authority
artifacts. The six-field operationEvidence, full raw Decision tuple, fresh final
at both review and publication, actual runtime capability and source/output CAS
reuse the existing fixed owners. Predicates check consistency, not authority.

Implementation and scoped integration verification are complete. P1 owns runtime/helper/primary tests;
P2 owns one disjoint independent test; main reconciles shared documentation,
version, literal acceptance pins and one relevant generic checkpoint. Work is
isolated from the frozen metadata checkout and creation owner.


## Fixed implementation seams

- [Admission](../../payload/engine/lib/subject-metadata-input.js):
  `admitSubjectProposalSuppressionInput`, `decodeSubjectProposalSuppressionInput`,
  `subjectProposalSuppressionInputWire`; the same owned D/A/M bundle is reused.
- [Native wrapper](../../payload/engine/lib/subject-governance.js):
  `validateSubjectProposalSuppressionTransition` authenticates the allowance,
  guards both documents and calls the unchanged native transition with the actual
  before model. Creation, native action/history rules and allocation are untouched.
- [Actual Git gate](../../payload/engine/lib/subject-metadata-gate.js):
  `runPreparedSubjectProposalSuppressionGate` and its fixed `FromWire` entrypoint.
  One event may suppress multiple existing proposals without rewriting meaning.
- [Native replay](../../payload/engine/lib/subject-metadata-replay.js):
  `compareSubjectProposalSuppressionReplays` retains selected proposal outcomes;
  the existing lookup and canonical recipe supply actual results and uncertainty.
- [Retained consistency and candidate capture](../../payload/engine/lib/prepared-subject-metadata.js):
  `isPreparedSubjectProposalSuppressionReport` and
  `capturePreparedSubjectProposalSuppression`. Candidate bytes are bounded and
  independently checked against actual file mode. A shape predicate is not fresh
  authority; a valid-looking changed proof still requires exact fresh equality.
- [Fresh final](../../payload/engine/lib/final-prepared-subject-metadata.js):
  `runFinalPreparedSubjectProposalSuppressionGate`; completed valid failed owners
  have null captures, and final cleanup failure revokes success.
- [Review](../../payload/engine/lib/candidate-review-metadata.js):
  `verifySubjectProposalSuppressionReviewEvidence` recaptures the actual registry
  pair under a fresh local allowance, binds the full selected raw Decision tuple,
  and requires the real final report at review and again at publication.

The trusted selectors are `subject-proposal-suppression` and
`final-subject-proposal-suppression`; their two worker files are fixed. Shared
mechanical diagnostics intentionally retain the existing `metadata-*` vocabulary.
Operation/report kind, action, impact, replay and publication policy identities
remain distinct. No new caller policy selector or serialized authority is added.
The old publication policy object is structurally identical after removing only
`operations.subject-proposal-suppression` from the new JSON.

## Verification record

All commands use Node 24.19.0 with the explicit Node24 plus `/usr/bin:/bin` PATH.
The isolated implementation base is `7566cd5cc75dea680666110ab7892ae0af4536fb`.
No real customer candidate, release, or Decision publication was performed.

- Initial actual native before-model controls in both object formats passed,
  followed by the missing fixed-export RED: 0/2, session 15756, exit 1,
  4368.798 ms (`local-history:unknown-knowledge-proposal-suppression-initial-red.log`).
- First raw owner GREEN: 2/2, 9099.934583 ms, retained terminal log
  `local-history:unknown-knowledge-proposal-suppression-raw-first.log`.
- Retained boundary RED: 0/1, 264.922875 ms; actual unsupported-operation refusal,
  `local-history:unknown-knowledge-proposal-suppression-retained-red.log`.
- A dispatch-map syntax typo was caught before owner execution; the first retained
  wiring attempt closed session 63683 exit 1, 1357.946917 ms. This is an
  implementation correction, not a native-domain failure.
- Complete retained/final/review/publication control: 1/1, 23118.388458 ms,
  session 64250 closed exit 0, `...-retained-second.log`.
- Expanded actual raw controls: 10/10, 29630.672459 ms, session 72692 closed exit 0,
  `...-expanded-raw.log`; includes multirow suppression, owned raw buffers,
  admission exact-fit/one-short, fixed profile, body/mode/meaning/refusal/canonical
  attacks and distinct closure/replay/lookup limits.
- Existing metadata four-action native controls: 4/4, 13304.148042 ms,
  session 14374 closed exit 0,
  `local-history:unknown-knowledge-proposal-suppression-metadata-regression.log`.

- Frozen owner run: 12/13, session 32574 closed exit 1, 60566.4845 ms,
  `local-history:unknown-knowledge-proposal-suppression-owner-final.log`. The one
  failing test changed report bytes without renewing their detached descriptors,
  so integrity readback correctly refused before the intended fresh-proof check.
  Only the test reseal was corrected to bind report.json and its capture hashes.
- Corrected targeted retained test: 1/1, session 83188 closed exit 0,
  25916.609667 ms, `local-history:unknown-knowledge-proposal-suppression-owner-corrected.log`.
  It proves exact candidate cap/one-short, wrong profile/predicate rejection,
  deep retained JSON refusal, fully resealed proof drift reaching fresh equality,
  and cleanup revoking an otherwise successful final. These two receipts are not
  represented as a single 13/13 run. The other frozen owner cases included actual
  publication and complete failed-owner exit1/exact diagnostic retention without
  any authority artifact.

Owner final command: `node --test tests/subject-proposal-suppression.test.js
 tests/prepared-subject-proposal-suppression.test.js`; targeted correction used
`--test-name-pattern='^actual SHA256 nested suppression retained caps'` with the
second file only.

P2's independent first run closed session 76337 exit 1: 4/6, 100673.097167 ms,
`local-history:unknown-knowledge-suppression-p2-frozen.log`. One cross-profile
subtest and its parent failed because the test expected a later outer error code.
The actual SHA1 publication/CAS/restore and unwanted-artifact controls and the
complete SHA256 nested/material/source-loss/restore controls passed. A focused
diagnostic run (session 24663 exit 1, 37043.677625 ms) established the exact earlier
`EngineRefusal: prepared evidence: invalid or mismatched retained manifest`.
That refusal preserves original operation binding; no runtime change was needed.
P2 corrected only its assertion to the actual class and exact message. The
focused SHA1 run closed session 81968 exit 0: 3/3, 37219.614416 ms,
`local-history:unknown-knowledge-suppression-p2-profile-corrected.log` (SHA256
`5ef2f2a54f0a17119b28dc1a4eeb667d718002ff5d0a599f025fc64138353e2d`).
All planned independent cases pass across the original and corrected runs; this
is not a single 6/6 rerun. Original failures remain retained. Independent receipt:
`local-history:unknown-knowledge-suppression-p2-receipt.json`. The final test hash is
`9d7d2a0094eb796e9f7ac7cddff5091c4fb26149366505cb807761370ca15914`.
P2 checked 1435 runtime/helper/dependency/executable/test files after execution:
zero mismatches, no product finding, no live process.

 Freeze manifest:
`local-history:unknown-knowledge-proposal-suppression-runtime-freeze.json` contains
303 engine paths and both fixture helpers. Main owns the disjoint generic
checkpoint, shared documentation, acceptance pins and version reconciliation.

The final handoff lists 27 paths at
`local-history:unknown-knowledge-proposal-suppression-handoff.json`: 19 runtime
paths (17 existing plus two thin workers), two existing Decisions, this scoped
guide, two fixture helpers and three new tests (including P2's sole file).
Owner production/helper postchecks matched all 305 frozen hashes. No main or
previous frozen metadata checkout edits, commits, shared-root edits, or new
public tools were made. The old metadata native controls and policy-object
comparison supplement the new profile tests; main's generic integration remains
a separate receipt. Active canonical suppression/restoration is still outside
this forward proposal-refusal slice.

## Main integration checkpoint

Main verified all 27 handoff hashes and merged the fixed suppression selectors
with the already integrated creation and metadata profiles at
`29cc9e9746f6158cfe63689440b7506c3f184061`. The publication descriptor comparison
preserved every existing operation. Exact acceptance allowlists name both new
workers without widening their grammar. An initial lint check caught a stray
object-map token introduced during conflict resolution; main removed it before
the integration freeze. The corrected lint checked 684 files with no failures.

One frozen nine-suite checkpoint passed **60/60**, exit 0, in
**213461.417542 ms**. It covers prepared runtime and validation dispatch, native
governance, retained metadata and its independent publication review, raw and
retained suppression, independent suppression publication, and final creation.
All 2,954 source, dependency and executable hashes remained unchanged. Evidence:
`local-history:unknown-knowledge-suppression-integration.json`,
`local-history:unknown-knowledge-suppression-integration-result.json`, and
`local-history:unknown-knowledge-suppression-integration.log` (SHA256
`b6d289b55ac344b4629bf0f12bfa147affe43eb97a39cf50457717f343ab5658`).
Automated A1–A4/A6 acceptance passed; A5 remains manual.

Root README, changelog, required lifecycle scope, governance, prepared validation,
candidate review, metadata and reconsideration guides are synchronized. Existing
payload directory inclusion ships the new workers. Dependencies, stored schemas,
public API/MCP/CLI methods, wrappers and root/protocol AGENTS requirements did not
change. Package and both lock versions remain `3.0.0-rc.2` for this pending PR.
This checkpoint does not certify the remaining repeated-merge or retrieval
evaluation work and does not publish a release, Decision or customer candidate.
