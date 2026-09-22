> Packaging stage 1/7, version `3.0.0-rc.2`. This stacked prerelease is for review and new-installation development. The existing-store migration/cutover workflow arrives in PR4; do not migrate existing installations with this intermediate tree.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Current-query eligibility proof reuse

The private governance evaluation reuses verified immutable Subject evidence for
one exact authentic operation allowance. This is an internal optimization of
`subjectEligibility`, not a new API or a reusable record/model approval.
[The proposed Decision](../../decisions/entries/current-query-eligibility-reuse.yaml)
records its rationale. See also [governance](ucs-1235-subject-governance.md) and
[operation accounting](ucs-1235-operation-budget.md).

## Boundary and result ownership

Only a query-purpose, current-policy call with an explicit authentic operation
budget equal to the evaluation's bound budget can attempt reuse, and the requested
ID must be canonical. Options, budget activity, handle authenticity and operation
binding are checked first. A complete miss enters the memo only when it proves
eligible=true, verification=verified, active status, the same requested/resolved
ID and zero redirects. The allowance is asserted active again before population.

The evaluation owns a cloned deeply frozen Subject document and private registry
and verification maps that do not change after capture. The memo stores only its
frozen Subject value, not a caller-owned outcome. Each hit returns fresh outcome,
resolution and empty-redirect containers. Caller mutation of those containers
cannot alter later results; the Subject JSON remains deeply frozen. No extra deep
copy or document traversal is claimed. Existing native allocation exclusions apply.

A different evaluation, copied handle, fresh/foreign allowance or omitted budget
cannot borrow this proof. Other policies/purposes use the ordinary path. Missing,
unavailable, proposed/suppressed, retired/split and redirecting outcomes never
populate the memo. Valid zero-redirect current success is independent of remaining
redirect capacity, but options and redirect budgets are validated on every call.

Every actual query still performs its full current model, registry, ledger,
identity-index and authorizer binding. Every P3 row still performs its identity,
namespace, options and assignment checks and preserves original target order,
index and diagnostic path. Unknown assignments stay unknown. No record, assignment
list, model, authorizer status, binding result or publication proof is cached.
The public corpus-admission and query APIs retain their existing behavior.

## Actual work and failure accounting

Each canonical query/current attempt under the exact bound allowance pays the
existing `subject-eligibility` validation step and one new
`current-query-eligibility-lookup` step before lookup. Canonical misses pay this
lookup even when the eventual outcome is ineligible or unavailable; those outcomes
remain uncached. A miss then performs the existing two resolutions, Subject
verification and history-event checks without discounts.

For one active current Subject with h inspected history events, a successful miss
costs three Subject visits and `5 + h` validation steps. A subsequent hit costs
zero Subject visits and two validation steps. It removes actual repeated
resolution/history work and does not charge fictional visits. No source, capture,
document, corpus or earlier validation counter is refunded. Initial and partial
failure counters can change, and no fixed-workload fit follows from these units.

The memo cannot hit or populate after any allowance counter latches failure. An
exact subject capacity can permit repeated hits while a later different Subject
miss still exhausts that same cumulative allowance. Successful proof does not
reset a consumed query/context attempt or permit a new operation to reuse history.
Memo cardinality is bounded by successfully visited canonical Subjects in the
private registry; this is not a whole-process memory or CPU bound.

## Evidence and documentation scope

The actual first regression failed because a second call still used three Subject
visits, then passed with the private reuse. Tests cover precise miss/hit accounting,
fresh outcomes/frozen Subject data, same ID at different P3 row indices, malformed
rows and options, missing/unavailable/retired outcomes, historical/equivalent/
inspect/new-assignment isolation, actual redirect capacity changes, authentic
budget/handle boundaries, exact-fit/one-unit-short capacities and sticky failure
before lookup and population. Actual disk-backed query tests prime eligibility
and then change model ledger, identity index, authorizer or assignment metadata;
the unchanged owner validators refuse those changes.

The existing operation-composition regression also preserves foreign/unbounded
governance rejection and checks the revised repeated-call accounting: zero
additional Subject visits, two admission/lookup steps and no document traversal.

No capacity, fixture, controller, public schema, CLI option, protocol workflow or
payload-manifest entry changes. The separate P4 file-to-query composition and
retirement lifecycle work are not implemented by this change. Main owns shared
root README/AGENTS/version/lock/changelog reconciliation for the actual PR;
internal commits do not cause separate version bumps. P10's retained 28 refusals
remain historical evidence, and only an independently authorized unchanged-profile
run can establish a later result.
