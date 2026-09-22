> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Subject split: implementation design

Status: the internal [prepared split gate](ucs-1235-subject-split-gate.md) now
composes history, allocation, actual-model, request/event metadata, actual Git
scope, positive P8 preservation, eventless proof and mandatory impacts. Focused
integration verification is recorded below. The separate [review/publication profile](ucs-1240-split-review-publication.md)
adds actual authority/allocation verification and fresh final checks before the
candidate-ref transaction. The [domain Decision](../../decisions/entries/plain-subject-split.yaml)
and [publication Decision](../../decisions/entries/ucs-1240-split-publication.yaml)
record the rationale. Earlier receipts below retain their original slice scope;
broader graph dispositions and full-goal acceptance remain separate work.

The [material-continuation profile](lifecycle-material-continuation.md) extends
this composition for reconsidered subjects. It preserves the original allocation,
before-pair proof and zero/positive/all-empty mapping semantics, while carrying
retained material through actual governance and publication checks.

## Agreed composition

One active canonical Subject retains its identity, definition and history as a
split tombstone. At least two fresh canonical successors are allocated through
the existing identity planner. One atomic candidate appends activation of those
successors followed by the source split. Both events and any assignment event
carry the same complete five-field Decision tuple. The authorizer remains an
unchanged effective local Decision; no same-batch self-authorization is implied.

The candidate ledger must equal the entire planned Subject-only ledger, including
old row ordering, states, publication references, namespace and lineage. The
allocation publication is derived from the operation ID and actual registry
review reference. The operation successor list equals planner order. An owner
mapping contains an ordered subset of that list, substituted at the original
source position without changing unrelated assignment order.

## Implemented split request and event metadata

The internal [request interface](../../payload/engine/lib/subject-split-input.js)
exports `admitSubjectSplitInput` and `subjectSplitInputWire`, reusing the existing
version-1 canonical capture transport. Its eight outer fields are `repoRoot`,
`before`, `candidate`, `operation`, `reviewNote`, `evidence`, `limits`, and
`impact`. Only `repoRoot` is excluded from the digest; all authored intent and
original evidence bytes are bound. Accepted input is detached from later caller
mutation. Admission verifies shape, not actual Git membership or approval.

The operation has exactly thirteen fields: `version`, `id`, `action`, `subject`,
`successors`, `registryEvents`, `assignmentEvent`, `mappings`, `retainedUnknowns`,
`retainedHistoricalUses`, `retainedParents`, `retainedInheritedUses`, and
`successorParents`. Version is 1 and action is `split`. The successor list has
at least two distinct canonical IDs excluding source. Two distinct registry
event IDs and their digests occur in activation-then-split order. Actual freshness,
allocator order, event meaning and scope are subsequent model/core obligations.

| Reviewed collection | Exact row and ordering |
| --- | --- |
| `mappings` | `{ref,successors,reason}`; strict qualified `[namespace,kind,id]` order. Each distinct subset follows the operation successor order; empty subsets are valid. |
| `retainedUnknowns` | `{ref,reason}` or `{proposalRef,reason}`; strict `[namespace,kind,id-or-key]` order. |
| `retainedHistoricalUses` | `{ref,reason}`; strict qualified owner order. |
| `retainedParents` | `{child,parent,reason}`; strict `[child,parent]` order, distinct endpoints incident to source. |
| `retainedInheritedUses` | `{ref,assignedSubject,reason}`; strict `[namespace,kind,id,assignedSubject]` order; ancestor is the operation source. |
| `successorParents` | `{subject,parent,reason}`; exactly one row per successor in operation order. Null explicitly selects a root; a canonical parent cannot be self or source. |

Reasons are nonblank. Refs are exact qualified K/O/D identities, except the
explicit unknown-proposal variant. Inputs are dense, closed own-data structures;
accessors, symbols and nonenumerable metadata refuse before wire serialization.
No list is normalized into an apparently valid request. `assignmentEvent` is null
exactly when mappings are empty; otherwise it contains an event ID and digest.
Core must independently prove that this claimed scope equals the actual effective
direct owner set. Even all-empty successor subsets require a nonempty event.

Ten explicit limit groups are required: existing `inventory`, `governance`,
`assignments`, `reach`, `views`, `replays`, `query`, and `tree`, plus
`closure:{maxRows,maxBytes}` and `allocation:{maxLedgerRows,maxSuccessors}`.
Capacities retain their existing safe-nonnegative rules and query AST minima.
Impact is exactly `{version:1,policy:'subject-split-impact-v1',routes:{kind:'runtime-capability'}}`.
Publication's candidate-only `maxIdentityBytes` is not an owner-request capacity.
Outer input admission and serialization do not claim to be bounded by the later
model governance allowance; raw parser, native loading and process memory remain
outside that allowance's documented scope.

The separate [split event schema](../../payload/schemas/assignment-split-event.schema.json)
uses version 2, operation `subject-use-transition`, and exactly six scope fields:
`{kind,operation,action,subject,successors,registry-events}`. Scope action is
`split`; metadata validates two distinct registry events, distinct successors
excluding source, and rows in qualified owner order. The nine existing row fields
are `ref`, `before`, `after`, `before-revision`, `after-revision`, `disposition`,
`reason`, `before-capture`, and `after-capture`. Rows are nonempty, `changed`,
and have known before/after assignments and nonnull original provenance.
Shared schema definitions remain identical; a split-specific state definition
expresses its stricter known-state requirement without changing older formats.

The existing [metadata validator](../../payload/engine/lib/assignment-event.js)
checks declared capture/digest bindings and selects this schema only for split.
It does not establish actual row coverage, current Decision authority or approval.
The shared history reader compares normalized membership; raw event projections
retain authored order. Core/P8 must separately compare each original record and
the exact ordered substitution, mapping rationale and next revision. Existing
merge, retirement, creation and ordinary assignment admission remain distinct.

## Actual core and P8 continuation

The internal [actual core](../../payload/engine/lib/subject-split-core.js) is
implemented and feeds the fixed prepared composition. It consumes original/
candidate models from actual materialized snapshots, selects the exact before
assessment pair once, and calls `validateSubjectSplitCreation` once under one
authentic allowance. It performs no preliminary governance evaluation or semantic
identity binding. After model proof it corroborates actual raw registry/identity
locators, source commits/trees, bytes and regular-file modes. A later recapture
cannot replace omitted or mismatched original evidence. The selected unchanged
Decision and its full source locator require actual whole-file corroboration.
Every supplied Decision or historical assessment capture that declares a source
also receives an independent actual Git locator/object-format/byte comparison.
Integrity of historical evidence bytes alone cannot prove its source tree.

The private core handoff is `{core,candidateGovernance,operationBudget}`; only
`core` is serialized. The positive P8 continuation additionally
evaluate/bind the actual before model under that same allowance and reuse the
candidate handle. A fixed internal
row-validation continuation must forward the allowance into eligibility; the old
public row options remain unchanged. Final usage includes continuation failures.
The agreed fixed entrypoint is `validateSubjectSplitAssignmentChange(input,
{budget,operationBudget})`, with required redirect and authentic operation budgets;
it fixes `new-assignment/current` rather than accepting purpose or policy flags.
Every invocation first verifies the private governance handle belongs to that
active operation, including a zero-successor withdrawal. The implemented void
`assertSubjectGovernanceOperation(handle,{operationBudget})` checks ownership and
charges one `validationSteps` under `governance-operation-binding`, with no
descriptor clone, registry traversal, model reevaluation or authority DTO.
Using the descriptor reader only to check ownership would copy the complete
history for each empty row; the direct assertion avoids that repeated work.
Positive targets still incur the existing eligibility checks and their actual
charges. Both entrypoints are implemented internal primitives, now wired into
the fixed positive adapter. The earlier row-slice focused regression
passes 167/167 in 40362.520458ms (session 76313, exit 0;
`local-history:unknown-knowledge-split-row-final-regression.log`). It covers the new
row checks, legacy assignment change/validation, governance, operation budgets
and actual-model split creation. The retained initial RED has 2 passes and 24
failures. Empty and positive K/O/D targets, forged/wrong/unbounded handles,
one-step exact fit, sticky exhaustion, getter refusal and unchanged legacy
counters are covered; no complete split operation or publication is claimed.
Independent integration additionally passes 105/105 in 64031.558459ms (session
2806, exit 0; `local-history:unknown-knowledge-split-row-integration.log`), including
actual ordinary, retirement and equivalent-merge assignment gates. It overlaps
the owner regression and is not added to that count.
Zero skips P8-only setup and must prove exactly the registry and identity paths
changed. The ledger exception is available only after actual allocation and raw
correspondence proofs, never through caller-supplied flags.

Inherited review is intentionally source-centric. Core derives one of `retained`,
`exposed-by-direct-substitution`, or `introduced-by-successor-assignment`; the
caller supplies no enum. Introduction requires an existing mapped owner, a fresh
selected successor and an actual candidate parent chain reaching source. Raw
inventory paths start at the matched ancestor, so they cannot alone prove the
descendant-to-source prefix: core must check that chain with charged visits.
Other ancestors remain in complete inventory and fixed impacts. Missing witness
coverage, arbitrary null-before exemptions and disappearing inherited uses refuse
under this preserved-edge profile. New successor associations and source-incident
associations/inbound old redirects or split alternatives remain unsupported
until a separate complete adjudication contract exists.

### Actual core coverage and evidence

The core proves the complete effective direct owner set and each literal
zero/one/several substitution at the original source position. It preserves the
owner universe, lifecycle and occurrence; checks exact unknown, historical,
parent, source-inherited and successor-parent scope; and refuses unexplained
fresh-successor uses. Protected unknown/inactive and authorizer files remain
whole-file obligations. Present assignment histories must replay; complete
positive event provenance, revisions, rationale and selected-file editing remain
P8 work. Native model allocation runs once; charged authenticated index lookups
replace repeated owner-by-owner allocation-ledger scans. Actual Git captures and
materialized correspondence rereads are separately admitted. Closure rows/bytes
are reserved before attachment; failure returns no candidate handle.

The final core matrix passes **106/106** in 115293.805458ms (session 81401, exit 0;
`local-history:unknown-knowledge-split-core-complete-green.log`). It covers SHA1
and nested SHA256, K/O/D and absent-K layouts, positive/zero scope, grouped
protection, prior history, inherited dispositions, supported parent choices and
explicit graph refusals, source/mode/byte correspondence, exact-fit/one-short
governance/allocation/closure capacities and inventory exhaustion. Main's separate
same-tree/different-commit checks pass 2/2 in 2540.761208ms (session 57488, exit 0;
`local-history:unknown-knowledge-split-provenance-review.log`): identical bytes do
not replace the required original source commit.

Two actual failing cases changed the implementation. A historical Decision with
intact bytes and a false source tree initially passed; every declared retained
source is now corroborated. An independent raw-byte sum found 30,999 reported
bytes versus 53,908 expected because materialized rereads were omitted; those
fresh buffers are now charged separately. The retained REDs are
`local-history:unknown-knowledge-split-core-historical-source-red.log` (session
94029, exit 1) and `local-history:unknown-knowledge-split-core-materialized-bytes-red.log`
(session 51535, exit 1). Corrected focused runs pass 16/16 and 1/1 respectively,
before the complete matrix above. Earlier fixture key, blob-field and baseline/
history setup failures are retained separately; they are not product defects or
grounds to bypass runtime obligations.

The core does not prove outer zero-use two-path preservation, positive P8
completion, mandatory impacts/replays, outer cleanup-failure revocation or
publication. Successful disposable cleanup is tested; the outer failure behavior
remains outstanding. Native Git/materialization, loading/parsing/serialization
CPU and process memory remain outside a global resource-bound claim.

Independent combined integration passes **330/330** in 155211.066917ms (session
37141, exit 0; `local-history:unknown-knowledge-split-core-integration.log`). It
includes every `subject-split*.test.js` file: core, provenance, model creation,
history, allocation, request/event metadata and row-budget continuation. Counts
overlap earlier receipts and are not added to them. Runtime and fixture files
remained frozen during this run; broader P1–P11 acceptance remains outstanding.

### Request and schema verification

The frozen admission/schema slice passes **204/204** focused tests in
79540.089291ms, with no failures, cancellations or skips. This includes the new
input/event cases, existing merge/retirement inputs, typed metadata and history,
schema-definition consistency, and actual ordinary/merge/retirement assignment
gates. It does not include the parallel, incomplete actual split core or establish
complete split publication. The retained run is
`local-history:unknown-knowledge-split-admission-frozen-regression.log`
(session 61765, exit 0).

The initial preimplementation run had 16 passes and 42 failures across 58 tests
in 48.396042ms (`unknown-knowledge-split-admission-red.log`, exit 1). The first
implementation run had 56 passes and two failures: the test incorrectly expected
the history reader to preserve authored ordering. The corrected checks now
separately assert normalized history membership and unchanged event projection.
An intermediate regression found a shared `$defs` inconsistency and two Git
fixture failures caused by the wrong Git executable. The split-specific state
definition resolved the former; the documented `/usr/bin` Git PATH resolved the
latter. The corrected 137-test run passed before the final expanded run above.

Independent review's proposed trailing-newline tree-ID counterexample was
disproved: all four cases already passed before a proposed adjustment. The
reviewer retracted that finding; no redundant regex change remains. The file
`unknown-knowledge-split-tree-id-red.log` contains that passing run despite its
initial filename. These are retained counterexample tests, not a claimed bug fix.
Runtime/schema files stayed fixed for the final 204-test run. Earlier full-suite
and actual-model receipts below retain their original revision and scope.

Two subsequent tests cover the dedicated split export/complete typed retention
wire and multi-store event ordering. The expanded dedicated suite passes 64/64
in 51.195958ms (`unknown-knowledge-split-admission-export-order.log`, exit 0);
it overlaps the earlier regression and is not added wholesale to its count.
Lint, structural/value validation, automated A1–A4/A6 and 129 local links across
seven changed Markdown files pass; A5 remains manual. Reverse-path attribution
covers all 17 slice paths and finds no live K/O records requiring updates, with
the expected absent-store warnings. The PR version guard confirms rc.1→rc.2,
with package and both lockfile fields aligned. These checks do not certify the
parallel incomplete core or authorize a release.

## Assignment and graph obligations

### Assignment fixture preparation

The actual Git core fixture now accepts `recordFormat:'json'|'block'`, defaulting
to its original JSON bytes. Block mode writes Knowledge frontmatter with literal
note sequences and grouped O/D entries with separately addressable field spans.
Both sides use the same fixed serializer, established before the final original
commit and assessment captures. `editKnowledge` and `editEntries` hooks preserve
bodies and unrelated fields; this is test construction, not a production writer.
Reformatting the original after capture would invalidate its provenance, so the
fixture explicitly avoids that shortcut.

The fixture and core regression passes **116/116** in 140464.032458ms (session
5505, exit 0; `local-history:unknown-knowledge-split-block-fixture-regression.log`).
Checks cover actual K/O/D preservation spans, literal body/note retention,
unselected grouped siblings, unchanged default JSON bytes, exact original
assessment bindings, nested SHA256 and eventless two-path candidates. This proves
fixture readiness only; the positive P8 adapter and full split remain unfinished.
No runtime contract, public command, schema, manifest or agent instruction changes
with this test helper. Existing README scope and PR version rules still apply.

Each actual effective canonical K/O/D direct owner needs exactly one mapping
and a reason. Zero, one or several successors are legitimate choices. An empty
subset is known withdrawal; absent classification remains unknown. Historical
inactive owners, unknown owners, authorizer files and unselected grouped siblings
retain their existing protection rules. No source-to-all-successors redirect is
created. Structural old lookup exposes alternatives; current query refusal must
remain explicit, including under NOT.

The initial graph profile preserves existing parent edges and reviews complete
before/candidate inherited witnesses. New successor parent choices must be valid
and explicit. Arbitrary redistribution of existing children, associations or
inbound references is not established by this profile; unresolved affected uses
must refuse, and broader disposition work remains visible.

An assignment event is required whenever effective direct owners change, even
when every mapping chooses zero successors. With no effective direct owners,
assignment evidence is explicitly null. Its separate preservation proof must
verify exact registry **and identity-ledger** changes; retirement's registry-only
proof cannot establish split preservation.

## Publication and replay direction

The new split profile will retain raw candidate `identity.yaml` evidence in
addition to registry and optional assignment event artifacts, with an explicit
`maxIdentityBytes` limit for the candidate artifact only. The complete before
registry/identity pair is mandatory exactly once in the original retained wire,
under the governance capture allowance. Review corroborates actual source
membership and verifies the complete planner result; a later reread cannot
repair omitted original evidence. Existing merge/retirement capacities
and shared outer evidence envelopes remain unchanged. Exact fresh runtime,
source capture, operator review and final candidate-ref checks remain required.

The existing comparator's `exact` status means complete computed deltas; it does
not mean empty added/removed sets. Representative split replays reuse actual
queries. Historical membership changes must stay within the independently proven
effective mapped-record set; baseline all/none/classification-presence results
stay unchanged. Preserve all actual rank changes, including unaffected records
whose positions shift. Newly introduced successors require explicit before-side
unknown-subject refusals and actual candidate results. Old-source current and
equivalent probes require exact split refusals and separately verified lookup
alternatives. Refused queries never become fabricated empty result sets.

## Frozen representative replay recipe

Let `m` be the number of present stores, `n` original canonical subjects,
`p = max(n - 1, 0)`, and `s >= 2` fresh successors. Each case runs on both actual
snapshots with both current/all views and direct/descendant expansion:

| Class | Cases |
| --- | ---: |
| Historical original baseline, unary/NOT and four adjacent-original pair forms | `H = 4m(4 + 2n + 4p)` |
| Source current/equivalent positive and NOT refusals | `16m` |
| Each successor positive/NOT under historical/current/equivalent policies | `24ms` |
| Historical source-by-successor and adjacent-successor pairs, four Boolean forms | `16m(2s - 1)` |

Reserve `H + 56ms` cases and twice that many query calls, plus the whole inventory
byte allowance, before executing any query. This is a finite representative
recipe, not every possible Boolean combination. Expected missing-subject errors
follow the actual query validator: sorted required IDs, then the first AST
occurrence of the failing ID. Preserve one real diagnostic and its exact path.
Membership confinement to proven mapped records is a consistency check; it is
not an independent truth oracle or proof of the human mapping's meaning.

## Implemented history and allocation foundations

Evaluated history now admits the fixed adjacent activation/split pair described
above. It checks parent eligibility at the pair's historical completion, so a
later legitimate parent or successor retirement does not invalidate that pair.
The split event's verification depends on the preceding activation's Decision
and refusal-assessment verification. Missing assessment bytes therefore keep
historical source eligibility unavailable, even when the source's own Decision
bytes are intact. Malformed evidence still refuses governance. The existing
per-event descriptor shape is unchanged; no synthetic intermediate commit or
public dependency graph is introduced.

The ordinary transition API still refuses new split publication. Historical
source integrity and pair grammar are not actual before/candidate Git membership,
complete affected-use validation or approval to publish.

The internal fixed allocation helper is:

```js
validateSubjectSplitAllocation(
  {beforeIdentity, candidateIdentity, successors, publication},
  {limits: {maxLedgerRows, maxSuccessors}, operationBudget}
)
```

It requires an authentic shared governance allowance. Before processing nested
ledger data, it authenticates that allowance and admits own enumerable data
allocation arrays without invoking getters. Both limits are safe nonnegative
integers. It atomically reserves the sum of before/candidate allocation rows and
the complete successor count, then applies the shared document guards and calls
the existing Subject allocator once. Failed reservation admits neither population
and produces no allocation proof. Native planner refusal codes and exhaustion
counts are retained. Exact candidate-ledger and ordered-successor equality are
mandatory; no second allocator or generic identity API change is introduced.

The result is `{ok, publicationReady:false, allocation, resources, diagnostics}`.
On success, `allocation` contains `publication`, `ids`, both semantic identity
digests and native post-allocation Subject `occupied`/`remaining` counts. On any
failure it is null. `resources` names `per-invocation-admitted-populations`, the
limits, `{ledgerRows, successors}` admitted usage and an allocation-reservation
failure or null. Governance failure is reported through diagnostics and the
original shared allowance; it is not an allocation-reservation failure.

A valid planner scans at most `min(999999, N + K)` slots for `N` before ledger
rows and `K` successors, and checks exhaustion itself. This is a mathematical
bound, not measured slot usage or a CPU/memory guarantee. The new counters
represent one fixed comparison's admitted populations, not every internal
array pass. Shared governance document charges remain cumulative. The helper's
returned observations never substitute for actual source capture, an operation's
authorizer, or the future composed split owner.

## Implemented actual-model boundary

The internal entry point composes these foundations against the two actual
loaded models. Its signature is:

```js
validateSubjectSplitCreation({
  beforeModel, candidateModel,
  beforeCaptures: {registry, identity},
  decisionCaptures, assessmentCaptures = [],
  operation: {id, subject, successors, registryEvents},
  allocationLimits: {maxLedgerRows, maxSuccessors},
  budget // standalone calls only
}, {operationBudget} = {})
```

Supply exactly one allowance: a standalone numeric budget or the authentic
shared operation budget. The same handle must own every governance evaluation,
model binding and eligibility check; nested checks cannot replenish it. Allocation
population admission precedes identity hashing or traversal. The helper runs
once, with publication derived from the operation ID and selected activation's
review reference. Existing activation/promotion behavior remains unchanged.
The new wrapper admits and verifies raw evidence after that allocation check.
This deliberately permits a completed allocation observation on a later capture
capacity or integrity refusal; it never permits governance success without the
original evidence. Allocation and capture failures retain their own diagnostics.

The selected Decision must be loaded and accepted/addressed in **both** actual
models and their authentic indexes. Each model record must equal its own indexed
record, both sides must retain the complete same record, and its status/digest
must match the common event review tuple. An allocated but unloaded before
Decision cannot appear only in the candidate and authorize itself. Historical
accepted evidence alone does not establish current authorization. The later Git
owner additionally protects the whole authorizer file, mode and source membership.

Before calling existing model-binding code, inspect only public Decision entry
fields referenced by the two guarded histories: own data `record` and optional
`id`/`identity`, using native Map lookup and a native Map without an overridden
`get`. Charge these history-reference visits under the shared allowance. This
prevents getters from running during validation without scanning unrelated
records or imposing current approval on historical authorizers. Existing record
guards and index corroboration still perform their checks; historical archival
semantics remain unchanged.

The fixed split path also adapts native depth failures at already guarded
canonical comparison and registry-capture operations. An iterative document
guard does not guarantee a recursive serializer or native clone can finish.
Private dispatch preserves public legacy entrypoints and shared serialization;
there is no caller-selected serializer, extra full-document hash, new arbitrary
depth limit or catch around a whole validator. This does not promise arbitrary
raw-parser recovery or whole-process memory/stack qualification.

The supplied before registry/identity pair must match the actual before model
and the selected activation assessment. It is included exactly once; historical
assessment inputs must exclude that pair. Missing or mismatched bytes cannot be
reconstructed from model objects. Require verified current-before source,
historical-candidate source and current/new-assignment successor eligibility.
Only the selected split in the exact two-event suffix receives the private
historical-action admission; ordinary transition calls still refuse new splits.

The fixed result has eight fields: `ok`, `governance`, `publicationReady`,
`diagnostics`, cumulative `used`, `allocation`, `assessment` and `resources`.
`publicationReady` is always false; `resources` is exactly
`{allocation: null | helperResources}`. A completed allocation subproof may remain
after a later failure, but `ok` is false and `governance` is null. Native allocator
refusal details remain intact. These observations do not establish affected-use
closure, actual Git membership, replay or publication. Verification is recorded
separately below; no full split operation is implied.

The fixed Git adapter loads actual models without first evaluating or
binding their governance: those checks hash identities and would precede the new
allocation admission. One model-validator call replaces the existing lifecycle
adapter's preliminary evaluation, unchanged-ledger comparison and repeated
suffix/eligibility checks. It does not relax merge or retirement's ledger rules.
Original supplied before wrappers remain distinct from actual Git rereads; the
adapter must compare complete locators including commit/tree, bytes, format and
file modes. Recapture cannot repair absent original evidence. Independent
inventory/replay loading retains its separately documented accounting scope;
the model validator's cumulative usage does not claim to include those phases.

## Remaining split integration boundaries

The fixed input, actual core, positive assignment adapter, eventless proof and
four-class replay recipe are now implemented. Their contracts are described in
the [outer gate](ucs-1235-subject-split-gate.md),
[assignment adapter](ucs-1241-subject-split-assignment-gate.md) and
[replay guide](ucs-1235-subject-split-replays.md).

- The [fixed transport](ucs-1240-prepared-split-transport.md) now checks original
  wire/report consistency and captures bounded raw candidate registry, identity
  and optional event bytes. Its [publication Decision](../../decisions/entries/ucs-1240-split-publication.yaml)
  separates that evidence from actual source verification and fresh authority.
- [Fixed split workers and the final retained gate](ucs-1240-prepared-split-validation.md)
  now dispatch the actual owner, persist original wire/report/artifacts, and
  require fresh owner/capture equality. Parent authority-artifact reads use
  existing owned bounded readback. Their focused/adversarial verification is
  recorded separately from the earlier transport receipts.
- Runtime authorization, review binding, fresh final evidence and ref-CAS
  publication require the separate split profile; a domain success is insufficient.
- Broader graph redistribution remains outside this preserved-edge profile.
  Union, suppression/reversal and whole-goal acceptance remain separate obligations.

Tests must cover actual allocations/nonreuse, complete zero/one/several K/O/D
mappings, unknown versus empty, grouped records, prior history, inherited uses,
fresh successor lookup, original split alternatives, raw source provenance,
tampering, exact capacity boundaries and both Git object formats. Existing
activation, assignment, merge, retirement and publication behavior must retain
its regression coverage. The receipts below and in the owner guides identify
which checks actually ran; these requirements alone are not passing evidence.

No public CLI, MCP tool or installed workflow is introduced by this design.
Root/protocol AGENTS, README release guidance and PR version rules remain
applicable. This internal work stays in 3.0.0-rc.2 Unreleased; every actual PR
still advances its version against its target base.

## Foundation verification

History tests first passed 23/37 with 14 failures demonstrating the existing
split rejection, then passed 37/37 in 9675.678166ms. Their owner regression passed 214/214 in
99603.922541ms. Allocation tests first failed 4/16, then passed 16/16. Independent
review reproduced two adapter defects (nested getter execution before guard and
lost native exhaustion counts): 0/2 passed. After correction, 18/18 passed in
364.660792ms, including a real full-capacity successor request. Independent
review found no remaining blocker in either foundation. Combined integration
verification is recorded separately; these results do not prove a full split.

Combined foundation integration passed **342/342 tests** in 187086.865334ms
(`local-history:unknown-knowledge-split-foundation-regression.log`) with zero
failures, cancellations or skips. Runtime and test files stayed unchanged during
that run. It covered new split foundations, the native identity ledger, governed
history/activation/promotion/suppression, equivalent merge, retirement and its
publication. Lint checked 502 files with zero failures; structural/value checks
and 112 local documentation links passed. Automated A1–A4/A6 passed; A5 remains
manual. The PR guard confirms rc.1→rc.2 with both lockfile versions matching.
This is focused foundation verification, not a new whole-suite or full-split
acceptance claim; the previous 2640-test full result remains pinned to its prior
retirement-publication snapshot.

## Actual-model verification

The first actual SHA1/nested SHA256 candidates were refused by the existing
single-activation API: 1/3 tests passed and two failed with `invalid-promotion`.
The new boundary then passed those three tests. Independent review reproduced
malformed-input, accessor and native-depth defects before correction:

| Permanent regression group before correction | Passed / total |
| --- | ---: |
| Null shapes and selected-entry own-data admission | 0 / 8 |
| Historical-entry/Map access and null registry documents | 3 / 15 |
| Unrelated K/O store presence access | 0 / 2 |
| Native capture depth, including clone-success/hash-failure | 5 / 13 |

The corrected focused suite passes **73/73** in 38923.823917ms, with no failures,
cancellations or skips (session 69936, exit 0;
`local-history:unknown-knowledge-split-creation-depth-final-green.log`). It covers
actual loaded models, literal allocator expectations, both-model authorizers,
exact supplied evidence, shared-handle ownership, all six exact-fit/one-short
governance capacities, atomic allocation populations, historical archival and
unrelated-entry preservation. Native exhaustion uses 999998 occupied Subject
slots and a request for two, preserving the real remaining count of one; this
is rejection evidence, not a qualified production workload.

The additional operation/budget/query-eligibility regression passes **65/65** in
3496.220292ms (session 58511, exit 0;
`local-history:unknown-knowledge-split-model-operation-regression.log`). It checks
the unchanged public composition, accounting and exception behavior after the
private evaluation/binding extraction. The shared canonical serializer remains
unchanged.

Combined lifecycle integration passes **415/415** in 219759.441583ms (session
71135, exit 0; `local-history:unknown-knowledge-split-model-regression.log`), with
zero failures, cancellations or skips. Runtime/test files stayed unchanged
throughout. Coverage includes the new model/history/allocation checks and
existing identity, governance, activation, promotion, suppression, equivalent
merge, retirement and retirement publication. Together with the separate 65-test
operation regression, **480 tests passed across these two non-overlapping runs**.
This is focused integration, not a new full-suite or whole-goal acceptance claim.

Lint checked 504 files with zero failures; automated A1–A4/A6 passed and A5 remains
manual. All 115 local links in seven changed Markdown files resolve. Structural/
value validation reports zero findings; attribution covers all 11 changed/new
paths with no live K/O records to update. The PR guard confirms rc.1→rc.2 and
matching package/lockfile versions. These checks are also recorded in the final
change audit.
No runtime approval, actual PR, release or customer publication occurred.

## Prepared split and replay verification

The positive P8 fixture first established a valid actual core while the ordinary
gate refused the new ledger delta (`assignment-installation-changed`): **0/1**,
session 65860, exit 1, `unknown-knowledge-split-assignment-red.log`. The dedicated
adapter then passed **1/1** in 3567.716333ms (session 99475, exit 0). Independent
review reproduced an early models-passed reporting claim before core structural
checks: **0/1**, session 11596, exit 1,
`unknown-knowledge-split-assignment-model-status-red.log`. The adapter now defers
that claim until actual core and before-model binding success. Expanded owner
verification and legacy regression are recorded in the
[assignment guide](ucs-1241-subject-split-assignment-gate.md).

The replay absence RED passed the native query probe and failed three calls to
the not-yet-created module: **1/4** in 12146.232375ms (session 86907, exit 1).
This is missing-functionality evidence, not a claimed existing query-engine bug.
Its first implementation passed **4/4**; final focused actual-context, retirement,
paired-comparator and delta regression passed **39/39** in 36253.994416ms
(session 31751, exit 0; `unknown-knowledge-split-replay-final-regression.log`).
The isolated actual-output fault child passed **26/26** separately, including its
enclosing test; those child assertions are not added to the parent total.
An earlier child wrapper failed only because inherited test-runner context
selected binary reporting; all child assertions passed, and clearing that test
environment corrected the wrapper. No production change was needed for it.
See the [replay guide](ucs-1235-subject-split-replays.md) for exact scope.

The outer gate's initial RED was a module-absence failure before its test cases
could execute (`unknown-knowledge-split-gate-initial-red.log`, exit 1). Actual
eventless SHA1/root and SHA256/nested composition then passed **2/2** in
8471.608042ms (session 64811, exit 0). Expanded eventless checks passed **12/12**
in 44463.42175ms (session 93690, exit 0;
`unknown-knowledge-split-gate-zero-matrix.log`), including absent-K installations,
added/deleted/renamed/mode-only paths, added history, exact-fit/one-short closure
proof attachment, caller proof rejection and cleanup after completed impacts.
Positive outer integration passed **8/8** in 32660.98175ms (session 27584, exit 0;
`unknown-knowledge-split-gate-positive-matrix.log`): mixed K/O/D, absent-K nested
SHA256, independently validated prior history, all-empty successor choices,
reason mismatch and mandatory reach/tree/replay capacity refusals.

All named receipts above are retained under `/private/tmp/`. The initial 2-test
run overlaps the 12-test matrix. Both peers found no concrete outer integration
blocker in read-only review; those reviews did not rerun tests. Combined frozen
integration is recorded separately and does not imply retained split publication
or complete P1–P11 acceptance.

Final combined integration passed **425/425** in 344734.714667ms (session 58753,
terminal exit 0; `local-history:unknown-knowledge-split-gate-integration.log`),
with no failures, cancellations or skips. It covers all `subject-split*.test.js`
files, the actual retirement outer gate and shared assignment cleanup. Runtime
and test files remained frozen during the run. The assignment owner's separate
**194/194** run includes ordinary/typed assignments, merge, retirement and K/O/D
promotion; these runs overlap and are not additive. Isolated replay child
assertions retain their separate reported count.

Lint checked 530 files with zero failures. Structural/value validation reports
zero findings and the expected two absent-K/O store warnings. Automated A1–A4/A6
passed (session 13845, exit 0); A5 remains manual. Documentation links, changed-path
attribution and per-PR version agreement are recorded in shared coverage. The
previous full-suite result remains tied to its earlier retirement-publication
commit; no new whole-suite, operational qualification, actual PR or publication
is claimed by this focused integration.
