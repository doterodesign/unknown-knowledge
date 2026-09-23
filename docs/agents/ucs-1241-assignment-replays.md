> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Representative assignment replay

Proposed rationale `f1369103-65d4-4660-b166-f396e918a67d` is in [the P8 decision records](../../decisions/entries/assignment-finite-replay-evidence.yaml). The [documentation audit](ucs-1241-documentation-audit.md) records the distinct operation coverage and preserved evidence limits.

`subject-replay-impact.js` separates supplied query comparison from the fixed
`assignment-replay-v1` policy. Neither API discovers saved queries, publishes
changes, authenticates human approval, or establishes exhaustive use coverage.

## Supplied comparison

`compareSubjectReplays({version:1,before,after,inventory,limits})` uses sides
`{capturedInputRef,context}` and the actual P2 model/governance binding on both.
Namespaces must agree. The reference is descriptive, never proof by itself.
An inventory is `{version:1,coverage:'complete'|'partial',cases:[{id,query}]}`.
Unique case IDs sort by the existing JavaScript UTF-16 code-unit comparator;
query AST/array order is retained. Queries run unchanged through P4's actual
`querySubjects` in results mode. Both raw responses are retained unchanged.

Limits are `{version:1,maxCases,maxInventoryBytes}`, with nonnegative safe integer
capacities. The entire sorted inventory count and exact canonical UTF-8 byte
size must fit before any query runs. Over-limit means incomplete, zero calls,
all cases unassessed and no exact deltas. Null/absent inventory is not-assessed;
complete empty is complete only within the caller's assertion. Partial inventory
remains incomplete even if its individual query deltas are exact.

Candidate comparison uses P6's shared `compareSubjectQueryCandidates` unchanged.
Exact strict/requested-possible membership and rank deltas require complete
evaluation, ranking and explanations, no page truncation, and exact emitted row
counts. Refused/counts-only/partial responses retain unavailable deltas with null
arrays. An unrequested possible category stays not-requested, never empty.

The input fingerprint binds actual registry/governance digests, versions and
revisions, captured input references, sorted inventory digest, exact limits and
every executed query's actual fingerprint (null when unavailable). An over-limit
report has authenticated captures and the full inventory digest but no executed
query fingerprints. Missing inventory keeps input null.

## Fixed assignment policy

`compareAssignmentReplays({version:1,before,after,limits,queryBudgets})` generates
the fixed recipe. Its limits are exactly
`{version:1,maxSubjects,maxEligibilityRedirects,maxCases,maxInventoryBytes}`;
`queryBudgets` is the complete existing version-1 P4 budget object. Every capacity
is explicit in the operation request and retained in the report. There are no
production defaults or automatic increases to make a run succeed.

The full canonical Subject union is reserved before eligibility calls. Each ID
is checked on both actual handles under query/current policy. Only two verified,
resolved outcomes for that exact ID enter the query universe. Stable outside
outcomes require complete canonical-JSON equality, eligible false, verification
not-required, unresolved/current, exact requested ID and zero redirects. Allowed
code/status pairs are proposed/proposed, suppressed/suppressed, retired/non-split
retired and split/split-retired, using the actual `subject-*` codes. Canonical
proposed identity is distinct from proposal keys, which are listed separately.
Unavailable, asymmetric, unequal, unknown or thrown outcomes block completion.
Actual calls/returned calls/unreported calls and returned redirect edges are
reported; a thrown call does not establish zero unreported work.

For Knowledge, both current/all views and direct/self-and-descendants expansion
run all, none, subjects-present and NOT subjects-present; assigned and NOT
assigned for every eligible canonical ID; and AND, OR, A AND NOT B, B AND NOT A
for each adjacent pair of sorted IDs (no wraparound). Every query explicitly uses
current Subject policy, id-v1 ranking, possible matches and the supplied budgets,
with no applicability filter. The recipe has 24n cases for n>=1 and 16 for n=0.
It includes IDs absent from changed authored lists because unknown-to-empty can
remove their possible matches. It does not cover all Boolean interactions,
equivalent/historical Subject policies or external applicability/saved queries.

The complete case count is checked before case construction; the complete
canonical inventory bytes are admitted before execution. No prefix is chosen to
fit. Retained policy descriptor/digest, full outcomes, generated inventory,
comparison and capacities are bound by a report fingerprint. Stable excluded
operands do not waive actual record/proposal assignment validation: P4 query
refusals still leave the policy incomplete.

## Gate and resource boundaries

Both staged and prepared assignment gates accept optional
`impact.representativeReplays={limits,queryBudgets}`. They provide their own
authenticated snapshots and input references; callers cannot supply recipe cases,
stores, contexts or waivers through this field. Required replay only passes when
the fixed policy returns complete. Existing final policy still requires routes,
regenerated views and representative replay independently. A replay result never
establishes complete route inventory or substitutes for the other classes.

Inventory capacities are admission limits, not bounds on already-resident model
memory or canonicalization cost. P4 budgets apply per call and observed additive
counters are summed; maximum AST depth and calls lacking counters are separate.
The trusted runner's existing `maxOutputBytesPerCheck` bounds combined stdout and
stderr per check, with `maxCheckMilliseconds` per check. Overflow interrupts and
fails the check; diagnostic prefixes cannot become complete operation results.
No whole-process CPU/memory claim, silent output truncation or page enlargement.

The staged/prepared existing-record gate inputs still carry Decision captures
only. Their missing historical assessment evidence remains unavailable. The
shared context loader and the separately closed [merge gate](ucs-1235-equivalent-merge-dto.md)
support assessment captures; that does not widen these older input contracts.
Equivalent merges use their own all-store equivalent-policy recipe. Neither that
recipe nor the subjectless Decision promotion branch makes `assignment-replay-v1`
valid as typed K/O/D authoring coverage.

Plain retirement uses a separate fixed all-store `retirement-replay-v1` recipe,
defined in the [retirement contract](ucs-1235-plain-retirement-dto.md). It reserves
one combined historical-query and source-refusal inventory. Expected current and
equivalent `subject-retired` refusals remain raw incomplete comparison evidence;
only the separate retirement assessment can accept them. This does not relax the
ordinary comparator or convert unavailable candidate deltas into empty arrays.

The [split recipe](ucs-1235-subject-split-replays.md) adds four fixed classes:
original historical queries, current/equivalent source refusals, successor unary
queries and introduced historical pairs. It reserves the complete combined
inventory before any query. Expected `subject-split` and absent-before
`unknown-subject` results retain null deltas and their actual diagnostic paths.
The [prepared split gate](ucs-1235-subject-split-gate.md) requires independent
scope and preservation proofs as well as these finite consistency checks.
