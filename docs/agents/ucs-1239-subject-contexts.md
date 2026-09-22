> Packaging stage 2/7, version `3.0.0-rc.3`. This stacked prerelease is for review and new-installation development. The existing-store migration/cutover workflow arrives in PR4; do not migrate existing installations with this intermediate tree.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Bounded Subject context counts

Recorded [context enumeration rationale](../../decisions/entries/subject-views-and-contexts.yaml) remains a
proposal; implemented behavior does not imply canonical Decision approval.

`countSubjectContexts({model,subjectGovernance}, query, {budgets})` in
`payload/engine/lib/subject-contexts.js` consumes the actual P4 query evaluator,
P3 assignment validator, and P2 governed registry/ancestry APIs. It never accepts
caller-authored approval flags. Applicability support follows P4; unsupported
query fields refuse rather than disappear.

The supplied context can be assembled with retained Decision, assessment and
material captures through `loadSubjectQueryContext`. The
[read-only consumer contract](ucs-1237-reconsideration-consumers.md) also exposes
those inputs to `subject-view.js --mode contexts`. Context counting itself does
not decode evidence or bypass unavailable Subject/assignment checks.

The shared interface (contract arrives in PR6; see delivery availability) now forwards
`subject.contexts` / MCP `subject_contexts` to this same owner with one original
operation/context. It retains incomplete enumeration, exact zero counts and
native resource accounting; no alternate context algorithm or index is added.

The query is a normal version-1 Subject query with explicit P4 budgets. Context
budgets require version 1 and every nonnegative safe integer below:

- `maxRecords`: selected records visited during candidate enumeration.
- `maxAssignments`: authored assignment slots passed to P3 during enumeration.
- `maxHierarchyNodes`, `maxHierarchyEdges`: shared ancestor traversal limits.
- `maxRedirects`: shared P3/P2 enumeration resolution limit.
- `maxContexts`: number of single-candidate count queries, after one base query.

Candidate discovery selects the same stores and lifecycle view as the base
query. Direct candidates retain assigned IDs. Descendant mode also follows
actual ancestors of the P3-resolved meaning, with one cached traversal per
resolved ID. Related edges are not traversed. IDs already present in the base
predicate are excluded. No subset combinations or recursive suggestions are
materialized.

For each candidate, P4 evaluates `AND(original predicate, assigned(candidate))`
with the same options and explicit per-query budgets. Counts do not depend on
result pages or explanation limits. Candidates come from the selected assignment
universe, so a candidate with zero strict matches is retained explicitly as zero;
it does not claim observed co-assignment. Rows are ordered by Subject ID and
never claim to be globally top contexts.

Each row retains the actual query counts, input fingerprint, completion,
coverage, diagnostics and resources. Canonical records and proposals remain
distinct through P4's qualified identities. Incomplete strict/excluded counts
retain their lower-bound basis; incomplete possible counts remain provisional.
The outer fingerprint binds the base query fingerprint and enumeration limits.

Enumeration completeness and count completeness are separate. Missing assignment
metadata makes the candidate universe incomplete, even if all known-candidate
counts are exact. Exhausted enumeration budgets disclose unvisited/unvalidated
records; invalid assignments and unavailable governance refuse with null
contexts. A base preparation limit can return incomplete with null contexts,
which must not be read as an empty candidate universe.

Resources report enumeration work separately from query work. Query limits are
**per call**, not one shared allowance: `queries.calls` includes the base query
and each counted context. Additive returned counters are summed, AST depth is
reported as a maximum, and calls without returned counters are counted in
`unreportedCalls`. Redirect accounting follows P3/P4's completed-returned-witness
contract and does not claim unobservable work inside a failed resolution.


## Optional shared operation admission

`countSubjectContexts(context, query, {budgets, operation})` accepts the authentic
operation used by `loadSubjectQueryContext({..., operation})`. The same operation
is forwarded to the base query and every extension count. Copied contexts,
replacement operations and omission of a bound context's operation throw.

Query and enumeration limits above remain independent domain limits. The shared
operation additionally accumulates document/proof validation through the actual
P4 evaluator, P2 registry lookup and P3 assignment validation. Enumeration guards
each visited record document; repeated calls debit repeated work. Capture bytes
and source reads are not recharged merely because a context is reused. A latched
host exhaustion throws even if an inner validator returned diagnostics.

Ancestor traversal still uses its explicit enumeration node/edge limits: P2's
ancestry API has no operation-budget parameter. Sorting, set/cache allocation,
native parsing/hashing/serialization and uninstrumented work are not claimed as
shared validation-step measurements. The option alone establishes no runtime,
memory or complete installation profile qualification.


The [operation-adapter proposal](../../decisions/entries/subject-view-operation-admission.yaml)
records why repeated context phases retain one authentic allowance and why
separate ancestry limits do not establish complete host qualification.
