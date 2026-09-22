> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# P8 decision and documentation completeness

This audit covers UCS-1241's implemented assignment history, existing-record
authoring, replay comparison, merge assignment adapter and first Decisions-only
promotion gate, plus the subsequent Ontology typed promotion gate. It records
current scope and backfilled rationale. It does not
approve a canonical Decision, publish a candidate, complete the whole ticket or
reinterpret any frozen experiment.

## Substantive decision records

All six records are **proposed**, dated when recorded, and listed additively in
the [Decision catalog](../../decisions/_catalog.yaml). No canonical allocation or
accepted status is asserted. Full context, decision, consequences and implementation
evidence are in the individual proposal files linked below.

| Proposal UUID | Decision and rationale | Implementation / evidence |
| --- | --- | --- |
| [ac919c9f-8879-422b-9dce-8b3e04324712](../../decisions/entries/ucs-1241-typed-promotion-design.yaml) | Separate selected activation, strict canonical birth assignments and preserved history from final publication. | [Ontology gate](../../tests/typed-promotion-gate.test.js), [K/O/D source contracts](../../tests/typed-promotion-source-contract.test.js); independent current-code integration 37/37. |
| [ab799c5e-c506-458c-b642-5a6b8fb8b7ba](../../decisions/entries/ucs-1241-assignment-history-and-gates.yaml) | Keep canonical absence, unknown classification and known-empty distinct; immutable per-ref birth ties prevent history reset. | `21a87e9`, `7b35f69`; [genesis tests](../../tests/assignment-genesis.test.js), [history reader tests](../../tests/assignment-history-reader.test.js). |
| [8c9f8f9e-5775-4098-ba5a-f4776c375533](../../decisions/entries/assignment-snapshot-preservation.yaml) | One fixed actual-snapshot pipeline; exact typed occurrences and grouped immutable bytes prevent caller scope/proof substitution. | `21a87e9`, `bdff1af`; [typed gate](../../tests/typed-assignment-gate.test.js), [grouped preservation](../../tests/typed-assignment-preservation.test.js). |
| [f1369103-65d4-4660-b166-f396e918a67d](../../decisions/entries/assignment-finite-replay-evidence.yaml) | Reserve complete finite recipes before execution; retain raw unknown/unavailable results and separate operation policies. | `7443f06`, P2 `5441fa8`; [generic replay](../../tests/subject-replay-impact.test.js), [equivalent replay](../../tests/subject-equivalent-merge-replay.test.js). |
| [a51231ef-db5b-49d4-a3ee-0bdd363fff75](../../decisions/entries/typed-equivalent-merge-assignment-scope.yaml) | Actual complete typed affected-use scope, exact registry/Decision binding and protected whole unknown/authorizer files. | `bdff1af`, P2 `d514792` / `765aa74`; [joint adapter](../../tests/subject-use-assignment-gate.test.js), [typed merge](../../tests/typed-equivalent-merge-gate.test.js). |
| [53e6b70b-75d3-476b-bd2c-1b11ef075ebc](../../decisions/entries/subjectless-decision-promotion-proof.yaml) | First promotion uses actual subjectless Decisions-only capabilities and separate proposal/creation proof; shared authorizer record remains exact. | `3731a4f`; [promotion gate](../../tests/decision-promotion-gate.test.js), [closed admission](../../tests/decision-promotion-input.test.js). |

Existing related records remain unchanged: [D-000003](../../decisions/entries/D-003-three-stores-truth-anchor.yaml)
for typed stores, [D-000005](../../decisions/entries/D-005-validators-vendored-code.yaml)
for runtime trust, [D-000010](../../decisions/entries/D-010-git-native-concurrency.yaml)
for Git-native concurrency, [D-000012](../../decisions/entries/D-012-whole-store-baseline-diff.yaml)
for whole-store scope, [D-000014](../../decisions/entries/D-014-engine-never-executes-client-code.yaml)
for nonexecution of client code, and [the existing snapshot proposal](../../decisions/entries/D-024-commit-snapshot-runtime-separation.yaml).
These links are rationale, not a claim that the new proposals have been accepted.

## Documentation disposition

| Surface | Disposition |
| --- | --- |
| [Staged assignment gate](ucs-1241-assignment-gate.md) | Updated v1 scope, optional replay input and current cross-links. Original test/advisory evidence stays explicitly historical. |
| [Prepared assignment gate](ucs-1241-prepared-assignment-gate.md) | Updated replay signature and precise Decision-only transport boundary versus the separate merge/promotion APIs. |
| [Typed existing assignments](ucs-1241-typed-assignments.md) | Linked genesis/grouping decisions and the implemented separate creation gate; current typed replay refusal retained. |
| [Assignment replay](ucs-1241-assignment-replays.md) | Clarified legacy input transport versus current shared loader and the separately owned equivalent-merge recipe. |
| [Merge assignment adapter](ucs-1241-subject-use-assignment-gate.md) | Documented effective K/O/D grouping, no O/D notes, protected whole-file conflicts and the stricter merge authorizer boundary. |
| [Decision promotion](ucs-1241-decision-promotion-gate.md) | Linked the capability/creation proposal; exact DTO, actual evidence, admission failure semantics and resource limits retained. |
| [P2 merge contract](ucs-1235-equivalent-merge-dto.md), [P1 planner](ucs-1234-decision-promotion.md), P7 [final publication](ucs-1240-final-publication.md) and [candidate review](ucs-1240-candidate-review.md) | Other owners maintain these contracts; P8 links them and sends scope changes through handoff, without concurrent edits. |
| Root README, version/changelog, CONTRIBUTING, root AGENTS/agent index, PR template, CI and publishing files | Main-owned. Handoff must describe the four read-only gate variants, typed merge limits and subjectless first promotion. No P8 root edits or independent version bump. |
| Installed protocol AGENTS, adapter/extractor READMEs, package payload guide | No new writer protocol, adapter, extractor or executable CLI was introduced by this maintenance change. Broader onboarding/publication changes stay with main/P9/P7. No new AGENTS file is needed merely to restate the API docs. |
| Frozen runtime, benchmark inputs/results, reviewer receipts and experiment artifacts | No modifications, reruns, retuning or retrospective relabeling. Current docs state limitations separately. |

## Evidence and remaining scope

Recorded implementation checks remain scoped to their original source versions:
metadata120/120; joint merge83/83 plus final9/9; first promotion119/119 plus final2/2;
after the reviewed array-index fix, promotion19/19. P3 independently ran50 relevant
promotion tests, and P1 independently verified the admission regression. The later
P8 dependency integration passed34/34 (18typed merge +16promotion), lint415/0.
These are bounded checks, not a full-suite, performance-profile or publication claim.
The immutable logs and original review artifacts remain separate from this audit.

Inactive/proposal merge edits, graph rewrites, relaxed protected shared-file rules
and full lifecycle parity remain outside the released slices. Future work must
record new decisions or explicit amendments, update the affected owner docs and
obtain the appropriate implementation/runtime review. P7's retained input/report,
human review, fresh final checks and CAS publication remain separate obligations.

The [Ontology typed gate](ucs-1241-typed-promotion-design.md) now supports actual
classified and subjectless canonical births with preserved prior history. It
requires the actual present-store union, unchanged registry or absence on both
sides, strict new-assignment eligibility, selected preflight and finite typed
impacts. Unknown reach stays unknown. Its read-only success cannot substitute
for P7's separate [typed retained/publication profile](ucs-1240-final-record-promotion.md), now implemented for Ontology/Knowledge under v2 policies. Four new engine
modules are covered by the existing engine-directory manifest entry. Root
README/changelog, prepared-validation guide and shared coverage describe the
same boundary; no CLI, schema or agent workflow is introduced.

## PR version ownership

[D-000021](../../decisions/entries/D-021-version-policy.yaml) is the existing accepted
version policy. Main also owns the user's per-PR completeness proposal
`proposal:decision:b97239f1-4802-4c2a-a8d5-21eeed73c018` in
`decisions/entries/pr-completeness-and-versioning.yaml`; that main-owned file is
not duplicated by this audit. The current main working `rc.2` is unreleased.
Main applies one version bump per actual PR, not per internal handoff commit.
This maintenance commit opens no PR and performs no release; version/changelog
coordination remains mandatory when main prepares the actual PR.

## Knowledge extension under v2 policies

The subsequent domain/publication peer review agreed O/K v2 before code changes.
Knowledge promotion now uses the shared lifecycle classifier's `facets.stage`,
exact selected leaf verdicts and injected-date evaluation. It requires Knowledge
and Decisions, without requiring Ontology, and reuses exact P1 evidence-byte
preservation and strict P3 canonical birth assignments/history. The existing
[domain Decision](../../decisions/entries/ucs-1241-typed-promotion-design.yaml)
records the amendment; its catalog identity remains unchanged.

The first actual K test refused O-only admission. A later fixture failure exposed
unrelated original citations without authority tiers after introducing the
vocabulary; fixing original fixture records before either capture preserved the
production validator. The combined domain run passed 40/41; its sole failure was
a test expecting missing authority vocabulary to reach preflight, whereas actual
source structural validation already refused all three proposals. Correcting that
expectation produced 7/7 K tests in 15104.23325ms; an additional static-age case
passed in 2258.611333ms. No production gate was weakened. Original receipts remain
separate evidence; the final integration run covers the complete updated tests.

The [O/K publication guide](ucs-1240-final-record-promotion.md), P7 audit, current
P8 design, README/changelog and shared coverage describe the same v2 boundary.
Historical O-only evidence remains pinned, and classified D/lifecycle/operational
acceptance remain unfinished. No public CLI/MCP or authoring-protocol change is
introduced by these internal library additions.

The subsequent exact-commit full run at
`71f049d49c6d30434f9cb4a4d96edd410eb53c4e` passed **2422/2422 tests** in
381350.958459ms, including all final K assertions, static freshness exemption,
O/K publication and original Decision regressions. No test was skipped or
cancelled. The domain reviewer reported no unresolved production findings in
its reviewed scope; main retains responsibility for the broader goal and the
unimplemented classified-D/lifecycle/operational work.

## Classified Decision extension under v3 policies

The next peer agreement adds homogeneous D promotion through the existing
Decision planner, preserving O/K and ordinary-D contracts. Typed report v2
records only the exact D preflight inapplicability tuple, under an explicit v3
selectedPreflight policy. The shared fixed predicate cannot waive another check
or admit O/K without actual selected preflight. Input today remains required and
bound, while D preflight today/result remain null. Existing domain/publication
Decisions record this choice and the discarded applicability-field/date-echo
alternative without replacing historical reasoning.

The actual initial classified D case first refused O/K admission, then passed
in 2009.353042ms after implementation. Existing K/O and ordinary-D gate regression
passed 33/33 in 60704.087042ms. The expanded D store/history/shared-file matrix and
retained publication tests provide separate evidence; full integration remains
main's final validation. Unknown and known-empty classifications stay distinct.

The expanded domain/fixture regression passed 48/49. Its one production failure
was a valid reversed D request: the initial fixed predicate assumed input order
equaled P1's proposal-key allocation order. Both reviewers identified the same
issue. The correction preserves both orders, checks exact unique full-ref
membership, and independently binds selected IDs to original input. Missing
original selection refuses. The domain Decision and current guides capture this
choice; corrected-run evidence follows separately.

The corrected Decision domain suite passed **22/22** in 70569.534417ms, including
all four actual store combinations under both Git object formats, prior history,
shared authorizer/unknown/empty owners, reversed input, reference scope, lifecycle,
SID eligibility, exact evidence, and one-short capacities. Publication's corrected
12/12 run corroborates the retained/fresh/final binding separately. Lint checked
469 files with zero failures; structural/value validation, automated A1–A4/A6
acceptance and 153 changed-document local links passed. A5 remains manual.
The version guard confirms rc.1 to unreleased rc.2 with both lock fields aligned.

The subsequent full run at `e19d36067b70a685e23cdb94df7907b430d89e06` passed
**2448/2448 tests** in 483522.858916ms, with no failures, cancellations or skips.
All runtime and test files stayed unchanged during that run. The scoped failures
and fixes above remain historical evidence; further Subject lifecycles,
bootstrap and broader evaluation remain incomplete.

README, changelog, current P7/P8 guides and shared coverage now describe typed D.
No new public CLI/MCP, wrapper, schema, manifest shape or agent authoring workflow
is introduced. Broader Subject lifecycles, bootstrap and acceptance obligations
remain separate, and prior exact-commit results retain their original scope.

## Plain-retirement assignment adapter

The fixed retirement adapter uses actual committed K/O/D scope, source captures,
existing chain validation and exact Knowledge/grouped O/D byte preservation.
Its nonempty event carries the distinct closed `retire` scope described in the
[typed assignment guide](ucs-1241-typed-assignments.md). The outer
[retirement gate](ucs-1235-plain-retirement-dto.md) independently determines whether
the operation has zero effective direct uses; that branch retains no event and
no fabricated P8 success. Existing assignment and merge gates retain their own
contracts. Rationale is captured in the
[retirement Decision](../../decisions/entries/plain-subject-retirement.yaml).

First integration passed 162/162 retirement/merge/typed/schema checks. A valid
earlier no-op classification event was independently validated before testing
retirement against retained history; both withdrawal and eventless paths retain
that history literally. Actual absent-K O+D and D-only installations pass both
branches. Subsequent review corrections and full-run evidence are recorded
separately rather than retroactively changing that first result.

README/changelog, P2 contracts and P8 event/replay documentation describe the
scope. A new schema is covered by the existing directory manifest; the supported
schema keyword subset and old transition schemas remain unchanged. No public
CLI/MCP or agent-wrapper workflow was introduced in that owner-only slice; final
retirement publication remained pending then. See its subsequent integration below. Root decision/version/documentation obligations still apply.

After source-membership and cleanup-success corrections, the final focused
integration passed **168/168** in 108382.8765ms. Mixed Knowledge/grouped O and
Knowledge/grouped D operations each pass through one actual gate. Lint checked
486 files with no failures; automated A1–A4/A6, structural/value checks and 153
local documentation links passed. A5 remains manual. The subsequent full run
must retain its own exact commit and result.

Full verification at `8c9cac77ac154376cc43b4340cb647b0066bb27e` passed 2538/2539
in 510701.489167ms. The sole failure was an old explicit schema-kind list missing
`assignment-retirement-event`; runtime checks passed. The test expectation was
corrected without a production change, retaining the failed run as evidence.

The corrected full run at `26d785bc5ce963070ce4226bd1824bd85a829e41` passed
**2539/2539 tests** in 493856.260375ms, with no failures, cancellations or skips.
Runtime and test files remained unchanged throughout. The 51/51 focused schema
checks and earlier failed run retain their separate evidence. This closes the
tested retirement owner/assignment integration, not its final publication path
or the remaining P1–P11 acceptance scope.

## Subsequent retirement publication integration

The [retained retirement profile](ucs-1240-final-retirement.md) and its
[Decision](../../decisions/entries/ucs-1240-retirement-publication.yaml) now add
the event-independent authorizer, exact original-input proof, separate raw
capture caps, fixed workers, fresh owner equality and shared ref transaction.
The earlier owner-only evidence above remains tied to its original snapshot.
No actual runtime/candidate approval or customer publication is inferred.

README, changelog, prepared-validation, owner/governance, review/final guides
and shared coverage are updated together. The existing manifest directory
entries include the added engine modules; no schema, CLI, MCP, wrapper or
installed authoring workflow changes. Root AGENTS, protocol AGENTS, contribution
and publishing rules continue to apply unchanged. Package and both lock fields
remain 3.0.0-rc.2 Unreleased for this internal integration; each actual PR must
advance its version against its target base, including documentation-only PRs.
Verification and remaining limits are recorded in the linked publication guide.

## Subsequent snapshot cleanup correction

Actual staged and prepared fixtures completed their authorizer and impact checks
before a one-shot cleanup failure. Both originally returned `ok:true` alongside
a failed source check. The shared failure handler now resets overall success;
adapter-specific masking was rejected because all adapters use the same failure
invariant. The existing snapshot/preservation Decision records the correction.

The corrected regression test first failed **0/2**, then passed **2/2** in
1440.578417ms. The broader assignment, prepared-event, retirement, merge and
promotion regression TAP log completed **71/71** in 88884.157333ms with no failures,
skips or cancellations. Receipts are
`local-history:unknown-knowledge-assignment-cleanup-corrected-red.log`,
`local-history:unknown-knowledge-assignment-cleanup-green.log` and
`local-history:unknown-knowledge-assignment-cleanup-regression.log`.
These scoped checks do not replace the earlier full-suite evidence. The injected
failure occurs after real removal and leaves no temporary snapshots; it proves
report semantics, not recovery from every possible filesystem cleanup failure.
Lint checked 520 files with zero failures. Structural validation reported zero
findings and the two expected absent Knowledge/Ontology store warnings.

The staged/prepared API guides, root README, changelog and existing Decision were
updated together. Root and installed AGENTS rules, contributor/publishing guides,
other READMEs, CLI/MCP commands, wrappers, schemas and manifest remain applicable
unchanged: this corrects internal failure reporting without changing their
interfaces or workflow. The Decision identity and catalog row remain unchanged.
Package and both lock versions stay `3.0.0-rc.2` for this pending PR; an internal
fix commit is not another PR. No historical evidence is rewritten.

## Subsequent positive split integration

The [fixed split assignment adapter](ucs-1241-subject-split-assignment-gate.md)
now continues actual core governance, with separately charged before setup and
row eligibility, exact mapping/event correspondence, both authority recaptures
and full existing typed preservation. A reproduced early models-passed claim was
corrected so the report waits for actual structural and binding checks. The
shared cleanup reset above remains in effect.

The [outer split gate](ucs-1235-subject-split-gate.md) owns the eventless proof
and mandatory impacts. The [split replay](ucs-1235-subject-split-replays.md)
retains raw expected refusals and uses the unchanged actual paired comparator.
The existing split Decision records the choices and rejected alternatives.
Current owner guides, README/changelog, resource documentation and shared coverage
are updated together. Existing installed AGENTS, wrappers, CLI/MCP commands,
schemas and manifest directory entries remain applicable; no retained split
worker/publication profile is claimed. Per-PR version obligations are unchanged.

The subsequent [split review/publication profile](ucs-1240-split-review-publication.md)
uses the existing P8 preservation proof and actual fresh owner at both boundaries.
Positive use retains its event even when every selected successor subset is
empty; zero use retains no event and still verifies both authorities. The new
review adapter does not introduce another assignment interpretation or change
P8's counters. Current shared documentation and the publication Decision record
this integration separately from the historical owner-only receipt above.

## Ordinary assignment continuation

The [continuation contract](ucs-1241-assignment-continuation.md) and existing
[snapshot/preservation Decision](../../decisions/entries/assignment-snapshot-preservation.yaml)
cover an optional evidence group, one actual governance allowance and the new
version-2 owner report. Ordinary staged/prepared contexts, fixed row validation,
real wire workers, retained checks and fresh final review/publication are
implemented, with scoped evidence in the continuation guide. The omitted-input contract
remains unchanged. Actual K/O/D typed selection is distinct from the retained
Knowledge-only publication profile; continuation does not broaden that profile.

Review reproduced stale usage on an early input refusal. The owner now refreshes
continuation usage through the common failure path, including metadata admitted
before snapshot work. This implements the existing all-exits accounting rule;
it neither changes refusal into success nor invents budget exhaustion. A second
actual probe found ordinary-object metadata copying silently discarded an own
`__proto__` field. A null-prototype accumulator now preserves that field for
the existing closed-input rejection. Raw staged/prepared and wire regressions
cover the correction without changing omitted-input semantics.

The retained predicate only validates plausible bounded usage. Actual final
execution and whole-result equality remain mandatory; source loss after review
cannot be repaired by rehashing retained bytes. Typed K/O/D raw controls do not
establish typed retained publication. Later lifecycle/typed-promotion propagation
and reconsideration's own publication profile remain separate work.
