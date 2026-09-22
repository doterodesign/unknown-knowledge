> Packaging stage 2/7, version `3.0.0-rc.3`. This stacked prerelease is for review and new-installation development. The existing-store migration/cutover workflow arrives in PR4; do not migrate existing installations with this intermediate tree.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# P2 decision and documentation coverage

These records backfill substantive UCS-1235 implementation choices at the user's
request. They are proposed Decisions, not canonical approval or publication
authority. Main owns each actual PR's version/lock/changelog and shared root
documentation; internal owner commits do not each create a new version.

## Decision map

Each record below has its own file and an additive entry in
[the catalog](../../decisions/_catalog.yaml).

| Proposal key suffix | Choice and reason | Current contract |
| --- | --- | --- |
| [c584ac00-a64a-4fc3-bc61-882e68e96e6d](../../decisions/entries/subject-governance-contracts.yaml) | Shared canonical Subject authority; distinguish labels, graph inspection and effective eligibility | [Governance](ucs-1235-subject-governance.md) |
| [95dfdc46-5a14-4cee-9e35-452b7ee5369a](../../decisions/entries/captured-subject-governance-history.yaml) | Private captured governance, retained historical evidence and explicit refusal-assessment attestation | [Governance](ucs-1235-subject-governance.md) |
| 35fdefd8-f0e3-4b39-aa76-7dcd27442536 (contract arrives in PR3; see delivery availability) | Actual all-owner use closure, typed merge preservation and fixed mandatory impacts before final publication | Inventory (contract arrives in PR3; see delivery availability), merge DTO (contract arrives in PR3; see delivery availability) |
| [a5cd613f-8b58-4822-90a0-5446201d5ca3](../../decisions/entries/subject-logical-operation-budgets.yaml) | Authentic cumulative logical allowances and private reuse of work, with explicit native/host exclusions | [Budget composition](ucs-1235-operation-budget.md) |
| 3d935466-771a-458b-be78-37bec94ec044 (contract arrives in PR3; see delivery availability) | Preserve the exact refused proposal through reviewed reconsideration; verify one fresh Subject allocation with the native planner | History/model (contract arrives in PR3; see delivery availability), [read-only consumers](ucs-1237-reconsideration-consumers.md), actual-Git core (contract arrives in PR3; see delivery availability), prepared impact gate (contract arrives in PR3; see delivery availability), retained publication (contract arrives in PR4; see delivery availability) and clarified remaining scope (contract arrives in PR4; see delivery availability) |

Existing D-000005, D-000010, D-000011, D-000012, D-000014 and D-000022 continue
to cover vendored validators, Git concurrency, mechanical verdicts, whole-store
scope, no client-code execution and the engine language. The existing
[captured-source/runtime proposal](../../decisions/entries/D-024-commit-snapshot-runtime-separation.yaml)
and [layout proposal](../../decisions/entries/D-025-explicit-kit-layout.yaml)
remain intact. P1/P3/P4/P6/P7/P8 retain their own identity, assignment, query,
view, transport and history decision ownership; these records explain P2's
composition rather than redefine those contracts.

P4 separately records incremental topology validation as
`proposal:decision:7e199c03-2618-41ed-97ed-5bee05750a09` and call-local authorizer
reuse as `proposal:decision:5ec051c3-351f-4712-9d53-5c465b7baf2f`. Their owner
release supplies those records and catalog additions; P2's budget rationale does
not replace their detailed optimization decisions.

## Implementation and evidence

- `c116e32`: closed merge admission and actual registry/use core.
- `5441fa8`: fixed all-present-store replay with original Subject operands.
- `d514792`: actual read-only joint gate, fixed tree/reach/replay requirements;
  51 focused tests and lint passed at that release.
- `765aa74`: effective K/O/D extension; 18 new actual joint cases plus 44 existing
  focused regressions passed, lint 352 files/zero failures. P1/P8 reviewed source.
  P8 subsequently ran 34/34 typed merge plus Decision-promotion integration cases
  against its newer shared pipeline. These are bounded checks, not full acceptance.
- `1aafd84`: initial unchanged-topology history reuse. Fixed operational profiles
  still refused; later P4 optimization/measurement remains separately attributable.

P10 owns immutable qualification manifests and API/CLI receipts. This backfill
changes no fixture, runtime profile, query, capacity or retained trial artifact.
The preserved `5bad18d` operational run still has four expected exit-2 outcomes:
joint query preparation exhausts document text during repeated corpus admission;
near-byte loading exhausts it during historical-authorizer work. An earlier
complete corpus snapshot is not query completion. Later releases require their
own fixed-profile measurement; no timings or capacity success are inferred here.

## Documentation coverage and remaining work

| Surface | P2 disposition |
| --- | --- |
| Four UCS-1235 owner contracts above | Cross-linked to rationale; stale future-reader and merge-scope wording corrected; exact units point to the current accounting contract |
| Decision entries/catalog | Four unique proposed records added; no canonical IDs allocated and no historical reasoning rewritten |
| Root README, CONTEXT, AGENTS, CONTRIBUTING, changelog/version, PR/CI/publishing files | Main owns reconciliation. Describe shared authority and read-only typed merge without claiming final publication or full lifecycle support; retain one version advance per actual PR |
| Seeded protocol/AGENTS and platform wrappers | P9/main own user authoring workflows. This backfill changes no supported command, authorization rule or wrapper; no automatic merge-publication instructions are introduced |
| Public API/CLI contracts | P11 and respective command owners reconcile their references. P2's merge is a read-only library entry point; no new CLI syntax is introduced by this documentation patch |
| Schemas, payload manifest and initialization | No runtime/schema/payload files are added by this backfill. Existing typed extension changes no wire/event schema; no manifest change is needed for documentation-only files outside payload |
| Acceptance/qualification documents | Main/P10 own integrated results. Preserve historical evidence and disclose current profile refusals; do not relabel bounded tests as whole-family acceptance |

Protected authorizer and retained-unknown whole-file restrictions remain staged
limitations. Inactive/proposal source edits, graph rewrites, other merge/retirement
families, split/union/refusal adjudication, final capability verification and
authenticated publication are not completed by the effective K/O/D tranche.
Future substantive choices require corresponding records and affected docs.

The subsequent [current-query eligibility reuse](ucs-1235-query-eligibility-reuse.md)
has its own [proposed Decision](../../decisions/entries/current-query-eligibility-reuse.yaml).
It removes repeated immutable Subject proof work only, with fresh per-query model
binding and per-record validation. Its focused evidence does not qualify a workload
or complete the remaining lifecycle family.

## Subsequent plain-retirement owner gate

The plain-retirement Decision (contract arrives in PR3; see delivery availability)
and current DTO (contract arrives in PR3; see delivery availability) extend the actual use core
through a fixed entry point. The preserved design history (contract arrives in PR3; see delivery availability)
records alternatives and the later exact agreement. Retirement retains historical
owners, unknown files, parent edges and supported inherited witnesses; effective
direct uses receive exact known-minus-source withdrawals. The zero-use path
requires a charged registry-only raw Git proof, actual existing history and
authority. Replay assesses expected source refusals separately from historical
candidate deltas. At that owner-only snapshot, final retirement publication
remained pending; the subsequent publication integration is recorded below.

The first combined retirement/merge/typed-assignment/schema regression passed
162/162 tests in 96968.189584ms, including exact-fit/one-short closure proof tests.
Later independent review identified historical Decision source membership and
cleanup-after-success failure cases; their corrective evidence is recorded with
the final integration results. Earlier scoped/full-suite results above retain
their exact original runtime scope.

The separate retirement event schema is included by the existing manifest's
schema directory entry; no validator keyword expansion, CLI flag, wrapper or
agent workflow is introduced. Main reconciles root README/changelog and shared
documentation coverage. Internal commits share unreleased rc.2; every actual PR
must advance from its current base with matching lock fields and changelog.

Final focused integration, after both review corrections, passed **168/168** in
108382.8765ms. Lint checked 486 files with zero failures; automated A1–A4/A6,
structural/value validation and 153 changed-document links passed. A5 remains
manual. The version guard confirmed rc.1 to rc.2 with both lock fields aligned.
The full exact-commit run is recorded separately after completion.

The first full run at `8c9cac77ac154376cc43b4340cb647b0066bb27e` passed 2538/2539
in 510701.489167ms. Its sole failure was the existing explicit `KINDS` expectation
omitting the new retirement schema. The expectation was updated; no production
change was needed. A subsequent full run supplies its own result below.

The corrected full suite at `26d785bc5ce963070ce4226bd1824bd85a829e41` passed
**2539/2539 tests** in 493856.260375ms, with no failures, cancellations or skips.
Runtime/test files stayed unchanged during the run. The focused inventory/schema
correction also passed 51/51. Retirement publication, other lifecycle operations
and broader acceptance remain open; this verifies the committed owner slice.

## Subsequent retirement publication integration

The retained retirement profile (contract arrives in PR4; see delivery availability) and its
Decision (contract arrives in PR4; see delivery availability) now add
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

## Split design and peer agreement

The split Decision (contract arrives in PR3; see delivery availability) and
design (contract arrives in PR3; see delivery availability) record the next required lifecycle
composition. Exact allocation, activation/split evidence dependencies, complete
reasoned mappings and retained ledger review differ from retirement. Their
implementation and test claims are recorded separately as work lands. Structural
lookup alternatives alone are not a completed split gate or publication path.

The implemented first split foundations now include evaluated pair history with
activation-assessment dependency and a fixed exact Subject allocation comparator.
README/changelog, P2 design/governance/accounting/audit and shared coverage are
updated together. The manifest already includes new engine modules by directory.
No schema, public CLI/MCP, wrapper or installed authoring workflow changed; root
and protocol AGENTS, contribution and publishing instructions remain applicable.
The complete model/core/P8/replay/publication composition remains unfinished.

The combined split-foundation regression passed **342/342** in 187086.865334ms,
with no failures, cancellations or skips. Lint checked 502 files, structural/
value validation and local documentation links passed, and automated A1–A4/A6
passed (A5 remains manual). Independent review found no remaining blocker after
the documented allocation corrections. This focused result does not relabel the
previous full-suite snapshot or complete the remaining split composition.

The implemented model-validator contract is recorded in the same Decision and
design:
one shared authentic allowance, one exact allocation comparison, unchanged
effective authorizer records in both actual models/indexes, and one mandatory
original before assessment pair. The fixed eight-field result distinguishes a
completed allocation subproof from overall refusal. Focused verification passes
73/73 tests; combined integration is recorded in the design. No new publication,
installed command or workflow is implied. The subsequent Git adapter must preserve original source evidence
and avoid preliminary identity evaluation before allocation admission.

Independent review produced actual failing tests for malformed null input,
selected/historical entry getters, unrelated store access and native capture
depth. The fixed split path now refuses these cases, preserves historical
archival semantics and avoids inspecting unrelated entries. Common serialization
is unchanged; private evaluation/binding dispatch cannot be selected through
public options. Runtime/test files stayed frozen during combined regression. The root
README/changelog, governance/design/accounting and shared coverage are updated
together; existing AGENTS, manifest, CLI/MCP, schema and PR version instructions
continue to apply without a new installed workflow.

Combined lifecycle verification passes 415/415 in 219759.441583ms, plus 65/65
non-overlapping operation/budget/query checks in 3496.220292ms. Both runs have no
failures, cancellations or skips. Lint checked 504 files; A1–A4/A6 and 115 local
links passed, with A5 manual. Detailed receipts and prior failing cases are in
the design; the earlier full-suite snapshot retains its original scope.

## Split request and event contract

The existing split Decision (contract arrives in PR3; see delivery availability)
now captures the agreed thirteen-field operation, explicit roots and ordered
mapping choices, source-centric inherited review, separate known-state event
schema and the planned same-budget core/P8 handoff. Its original proposal ID,
title and single catalog row are unchanged; it has not been promoted or approved.
The design (contract arrives in PR3; see delivery availability)
distinguishes implemented request/metadata checks from outstanding actual core,
mapping closure, impact/replay and publication checks.

The admission/schema slice passes 204/204 focused tests, including actual legacy
assignment gates. Initial failures, corrected schema/test assumptions and the
retracted review finding are retained in the design. Root README, changelog,
assignment/governance guides and completeness coverage are updated together.
Existing AGENTS and PR version instructions remain applicable: internal commits
share unreleased rc.2, and each actual PR must still advance its base version.

The fixed row continuation and void governance-ownership assertion are now
implemented. The same Decision records why empty rows need ownership checks and
why copying the whole descriptor for that purpose was rejected. The focused
regression passes 167/167; an independent 105/105 integration run includes actual
ordinary, retirement and equivalent-merge assignment gates. These runs overlap
and are not additive. The complete split core/P8 composition remains outstanding.

## Actual split scope core

The actual Git core now implements the agreed mapping/retention profile. The same
split Decision records actual source corroboration, separate materialized reread
charging and authenticated owner lookup choices. Its 106-test matrix and main's
same-tree/different-commit checks are covered by a combined **330/330** split run
in 155211.066917ms (session 37141, exit 0). This includes model, input, schema,
history, allocation and row-budget checks; counts overlap earlier receipts.
Positive P8 wiring, outer preservation/impacts/replay and publication remain open.

## Subsequent prepared split composition

The same split Decision (contract arrives in PR3; see delivery availability) now
records the implemented positive P8 continuation, eventless two-path proof and
fixed four-class replay. The outer gate (contract arrives in PR3; see delivery availability) composes
their independent obligations. Earlier core-only evidence remains historical;
it is not relabeled as proof of this composition.

Shared reach/tree checks use fixed internal dispatch. The replay recipe retains
actual expected refusals and raw incompleteness; it does not independently infer
query truth or validate mapping meaning. Ordinary core reports remain internal
data, never accepted public proof. Resource guides distinguish cumulative positive
P8 governance from separately reloaded impact work. Retained final split
publication, broader graph operations and operational acceptance remain unfinished.

README, changelog, design, governance/accounting, P8/replay and prepared-runner
guides are updated together. Existing AGENTS, supported CLI/MCP, schemas,
manifest directory coverage and installed workflows retain their scope. Version
remains rc.2 Unreleased for the same pending PR; no release or approval is implied.

## Subsequent split review and publication

The publication profile (contract arrives in PR4; see delivery availability) now adds actual
before/candidate authority verification, independent native allocation and fresh
owner checks at both review and publication. Its separate Decision (contract arrives in PR4; see delivery availability)
records the agreed four/five capture boundary and one local allowance. Normalized
registry semantics and authorizer/provenance checks remain with the fresh owner;
the adapter neither reloads the full model nor requires a new Decision source.
The domain and publication guides, shared README/changelog and
[coverage](../change-completeness.md#split-review-and-publication) distinguish this
implemented internal profile from remaining graph and operational acceptance work.
No ordinary assignment policy, public command or installed AGENTS workflow changes.

## Suppressed-proposal reconsideration history/model

The fixed validator (contract arrives in PR3; see delivery availability) implements
the recorded reconsideration design (contract arrives in PR3; see delivery availability).
It consumes exact retained suppression history, verifies native fresh allocation,
binds the original registry/ledger pair and requires a distinct effective current
Decision plus captured material. Parent eligibility is checked at activation time.
Its evidence result covers declared bindings and raw-file integrity; it does not
parse a cited record out of arbitrary material bytes or judge semantic relevance.

Shared schema/reader, README, changelog, governance/accounting and
[coverage](../change-completeness.md) describe the same boundary and test evidence.
The existing Decision keeps its exact catalog row. Root/installed AGENTS, other
READMEs, contributor/version rules, manifest directory entries, public CLI/MCP
contracts and platform wrappers remain applicable: this slice adds an internal
validator, not a new supported authoring or publication workflow. The subsequent
[read-only consumer continuation](ucs-1237-reconsideration-consumers.md) now
forwards material through query, intent and route/context view paths. Its CLI
flags and installed protocol instructions are updated together. The subsequent
actual Git, impact and ordinary assignment implementations are recorded below.
Later lifecycle evidence propagation and reconsideration's own retained review
and publication remain required.

The implemented actual-Git contract (contract arrives in PR3; see delivery availability) limits
provenance claims to supplied witnesses and mandatory selected dependencies;
it preserves per-event unavailability for unrelated omitted evidence. It also
requires source-less current correspondence and a complete stored K/O/D owner
census with no inherited assignments. The Decision records these choices before
dependent implementation. Owner tests passed 39/39, independent provenance tests
12/12, and main's combined integration 253/253; the guide records exact receipts
and review corrections. These overlapping runs are not unique-test totals.

The impact gate contract (contract arrives in PR3; see delivery availability) now records mandatory
reach, whole-registry trees and finite native replay composition. Independent
review requires preserving attempted queries and partial output on operation
failure, distinguishing missing usage reports from zero usage, and preserving
original-predicate availability as well as membership. Fresh-Subject predicates
remain intentionally asymmetric. The existing Decision records these choices.
The implemented gate passed 59 owner checks and 242 independent integration
checks; its guide records frozen snapshots, the independent test-oracle
correction and scope limits. Retained execution and publication remain required.

The ordinary assignment continuation (contract arrives in PR3; see delivery availability),
integrated in `81520d1`, now carries assessment/material evidence through staged
and prepared owners, both fixed wire workers and fresh review/publication. Main
integration passed 215/215 with the exact snapshot and limitations recorded in
that guide. The next reconsideration publication contract (contract arrives in PR4; see delivery availability)
is agreed, not delivered. Earlier receipts above remain scoped to their original
implementations; they do not verify later lifecycle/typed-promotion propagation.
