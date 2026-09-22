> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Supplied Subject route comparison

Recorded [impact comparison rationale](../../decisions/entries/subject-view-impact-boundaries.yaml) remains a
proposal; implemented behavior does not imply canonical Decision approval.

`compareSubjectRoutes(input)` in `lib/subject-route-impact.js` compares an
explicit caller inventory across two actual governed captures. It performs no
filesystem I/O, route persistence, inventory discovery or publication. P8 may
compose its unchanged result into `optionalImpact.routes`; that adapter and
required-inventory publication policy remain separate work.

The closed request has `version:1`, `before`, `after`, optional `inventory`, and
`limits`. Each side is `{capturedInputRef, context:{model, subjectGovernance}}`.
The opaque reference is a caller label, not authenticated snapshot proof. P2's
actual `validateSubjectGovernanceCapture` binds each handle to its own healthy
model, registry, ledger, authentic identity index and authorizer capture. Both
sides are checked even for semantic-path-only or explicit empty inventories.
Different installation namespaces refuse.

The inventory is `{version:1, coverage:'complete'|'partial', routes:[...]}`.
Each entry has a unique nonblank caller `id` and an explicit route:

- An intersection entry also requires `queryOptions`, the ordinary P4 query
  options with explicit query budgets and no `where`. The existing P6 compiler
  supplies the predicate. Exactly the same specification is executed on both
  sides with the real P4 evaluator in result mode.
- A semantic-path entry prohibits `queryOptions`. Its route is
  `{version:1, kind:'semantic-path', subjects:[root,...,target]}` with exact unique
  canonical/proposal Subject identities. P2's actual ancestor traversal checks
  the complete path. This is declared structural inspection, not eligibility.

Limits require `{version:1, maxRoutes, maxPathNodes, maxPathEdges}` with explicit
nonnegative safe integers. Route IDs determine assessment order; authored path
and operand order remain intact. `maxRoutes` bounds assessed pairs. Path node
and edge allowances are shared across before/after and all assessed paths.
Envelope parsing, JSON hashing and registry indexing are outside these limits.
Query budgets apply per invocation. Resource output sums returned additive query
counters, reports maximum AST depth, and counts calls without returned counters;
unreported work is never implied to be zero.

The result separates preferred-label/path changes from candidate membership and
rank changes. Intersection side results remain unchanged P4 responses. An exact
candidate delta requires both actual statuses complete, evaluation/rank complete,
no page truncation, complete explanations, present result groups, exact counts
for every selected store, and equality of emitted rows to reported counts for
strict and requested-possible categories. Otherwise added/removed/retained/rank
deltas are null and explicitly unavailable. No page enlargement is performed.
Refused, unverified or incomplete query sides never become zero-match sides.

Exact strict and requested-possible deltas retain separate `ref`/`proposalRef`
identities. Rank changes are separate from membership changes. Unrequested
possible deltas say `not-requested`; semantic paths say candidates
`not-applicable`. Unknown path targets are inspectable invalid structural sides,
not empty queries. Partial ancestry cannot prove path equality or inequality.

Missing/null inventory returns `not-assessed` with null routes and no evaluated
input claim. Explicit complete empty inventory is complete only within that
caller assertion. Partial inventory, unassessed route pairs, partial paths or
unavailable candidate deltas make the overall assessment incomplete. Coverage
retains the caller's declaration, remaining route IDs and separate semantic-path
and candidate-delta completion. All candidate exactness is scoped to the query's
selected stores/view, never the whole installation or undiscovered saved routes.

The report fingerprint binds actual registry/governance digests, versions,
revisions, sorted inventory, limits and each executed query input fingerprint.
Consistency is `captured-model`, not an atomic filesystem snapshot. Full record
content changes can change the comparison fingerprint without membership changes.

`regeneratedViews` remains `not-assessed` in this slice. A required inventory or
view-impact requirement cannot be waived because input is absent or an adapter
has not been implemented. No new snapshot, saved-route or history authority is
created by this helper.
