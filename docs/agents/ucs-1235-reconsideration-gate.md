> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Reconsideration impact gate

Status: implemented internal prepared gate. Retained execution and publication
are implemented as separate stages described in the
[publication continuation contract](ucs-1240-reconsideration-publication.md).
The [existing Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml)
records the choices before dependent code. The implemented
[actual-Git core](ucs-1235-reconsideration-git-core.md) remains a separate proof:
it creates one fresh Subject while preserving all stored record assignments.

## Fixed input and result

`payload/engine/lib/subject-reconsideration-gate.js` exports
`inspectSubjectReconsiderationGate`. Its seven own-data input fields are:

```js
await inspectSubjectReconsiderationGate({
  repoRoot, before, candidate, operation, evidence,
  limits: { governance, allocation, closure },
  impact: {
    version: 1,
    contexts: { before: beforeContextLimits, after: afterContextLimits },
    reach: { maxHierarchyNodes, maxHierarchyEdges, maxRecords },
    views: { version: 1, maxViews },
    tree: { budget: { nodes, edges, rows }, maxBytes },
    replays: {
      version: 1, maxSubjects, maxEligibilityRedirects,
      maxQualificationRedirects, maxCases, maxInventoryBytes
    },
    query: {
      version: 1, maxAstNodes, maxAstDepth, maxHierarchyNodes,
      maxHierarchyEdges, maxRedirects, maxRecords, maxPredicateSteps,
      maxResultsPerStore, maxExplanationNodes
    },
    closure: { maxRows, maxBytes }
  }
})
```

The first six fields follow the core contract. Each context limit group is the
full explicit [Subject operation limit object](ucs-1237-subject-query.md#shared-host-operation-opt-in),
including its validation and corpus limits. All capacities are explicit
nonnegative safe integers; query AST node and depth limits must be positive.
These are not operationally qualified defaults. No caller-selected impact
inventory, output oracle, prior proof or allowance is admitted.

The result contains `version`, `kind`, `mode`, `ok`, `publicationReady`,
`inputDigest`, `inputs`, `operation`, `core`, `sources`, `checks`, `assignments`,
`impacts`, `resources` and `diagnostics`. Its kind is
`subject-reconsideration-gate`; mode is `read-only-prepared-reconsideration`.
Publication readiness is always false and assignments are null.
Checks appear for `core`, `binding`, `reach`, `subjectTree` and `replays` as
reached, each with a `passed` boolean. Admission refusal is represented by the
failed core check and its diagnostics, not a separate admission row. The gate
digest is `canonicalSha256({core: core.inputDigest, impact})`; the nested core
digest retains its original wire meaning. Impact settings therefore change the
gate identity without changing the core input identity.

## Proof and ownership

The fixed prepared gate must run that core once and require successful cleanup
before consuming its private handoff. It then creates fresh actual before and
candidate snapshots, verifies their correspondence to the core evidence and
loads one bounded query context per side. It does not accept a caller model,
prior report, executor, eligibility oracle or supplied query recipe as authority.

| Allowance | Work it owns |
| --- | --- |
| Core governance | Input admission, owned captures, model proof and the documented core source/census work. Native allocation and proof retention also keep their explicit capacities. |
| Before query operation | One actual before context, evidence selection/admission, binding and native query/qualification work on that context. |
| After query operation | One actual candidate context, full evidence admission, binding and native query/qualification work on that context. |

These are three separate allowances, not a combined end-to-end limit. Reach,
tree, replay recipe, qualification reservations and retained impact sections
also have explicit capacities. Native materialization and existing helper work
retain their documented exclusions. A host output limit does not cap the whole
gate report when no host output is written.

The core validates the entire supplied material union before before-state
projection. A fixed selector shares the existing private history-selection
mechanics, preserving the old model's guards, phases and counters. It returns
the same capture objects; omitted historical evidence is never fetched or made
implicitly available. The candidate context receives the complete union.

## Mandatory impacts

Every successful gate must contain complete stored-owner reach, one complete
whole-registry tree comparison and the fixed finite replay assessment. No empty
requested-impact list waives these requirements. All original canonical Subjects
participate regardless of current eligibility; the fresh Subject is additional.
Present K/O/D stores participate, with proposal records retained in the all-record
view and ownership census.

The recipe crosses current/all views, direct/self-and-descendant expansion and
historical/current/equivalent Subject policies. It includes all/none/presence
baselines, each original Subject and its negation, adjacent sorted original
pairs, fresh unary cases and fresh/original Boolean pairs. For `n` original
canonical Subjects and `m` present stores, reserve the complete population of
`C = 12 * m * (6 + 6*n + 4*max(n-1, 0))` cases before execution. There are `2*C`
native full queries, plus separately accounted eligibility and qualification
calls. This is finite representative coverage, not proof over every possible
query, applicability condition or ranking strategy.

The operation-aware comparator reuses the existing private comparison body and
passes each authentic context/operation pair to native preparation and queries.
The legacy comparator's interface and behavior remain unchanged.

The new bounded comparator must preserve failure evidence. Count an attempted
query before invoking it. If it throws, stop, retain completed pairs and any
actual returned side of the failing pair, and use null for unavailable output
and its unavailable candidate comparison. Identify the failed case and side.
`assessedCases` counts fully returned pairs; unassessed IDs include the failing
case and remaining suffix. A pre-query authentication failure has zero attempts.
For this new entrypoint, distinguish attempted, returned and unreported calls
from returned calls with or without usage metrics. Aggregate only reported usage;
a missing usage report is not zero work. These fields do not redefine the
legacy comparator's existing resource report.

## Refusal and resource accounting

The fresh Subject is unknown before creation; native preparation refusal is
expected, including for its negation. It is never represented as an empty match
set. Missing assignments likewise remain unknown under positive and negated
predicates. Original missing lifecycle or unavailable governance may cause an
expected refusal only when native diagnostics corroborate preserved actual
facts. Resource failure, truncation or incomplete traversal always prevents
successful assessment, including mixed semantic/resource diagnostics.

For each refused case-side, perform one native query preparation. Only if it
passes, perform at most one native assignment validation of the actual protected
qualified owner identified by the refusal. These are additional calls, not
reconstructions of the original query's preceding row work. Before each call,
reserve the query's `maxRedirects` from aggregate `maxQualificationRedirects`.
Do not refund reservations; give the row validator that explicit per-call cap.
Insufficient reservation fails before a native call starts.

Report attempted, returned and unreported calls, usage-reporting and
usage-unreported calls, reserved redirects and reported redirect usage separately
for both methods. Native preparation can refuse without returning usage; that
is unknown usage, not zero. A thrown call remains attempted and fails
qualification. Conservative reservation can refuse an episode that would have
used fewer redirects; this tradeoff avoids an invented measured-work claim.

For complete fresh/original Boolean results, compare strict and possible match
sets to already generated native unary baselines. Given the core's zero-use
proof, fresh AND original equals fresh; fresh OR original equals original;
fresh AND NOT original equals fresh; original AND NOT fresh equals original.
First verify fresh unary false/unknown behavior against actual assignment
presence. Do not introduce a second Boolean evaluator or additional baseline
queries. Preserve raw rank/explanation output separately from membership checks.

Keep raw incomplete/unavailable comparison deltas even when the fixed assessment
establishes an expected semantic refusal. Assessment completion, membership
completion and expected-refusal completion describe different evidence.

Original predicates must be complete on both sides, with unchanged membership,
or yield identical qualified semantic refusals on both sides. A change from
complete to refused, or the reverse, fails: original metadata, owner bytes and
relevant evidence are preserved by this operation. The fresh Subject keeps its
intentional asymmetric availability. Require fully returned, nonnull native
pairs before entering qualification; a partial query failure cannot be treated
as a complete recipe or an ordinary semantic refusal.

## Verification and remaining delivery

Success requires fresh snapshot cleanup. Assignment evidence remains null;
creating a Subject does not create an empty assignment event. Retained workers,
fresh final validation, route capability and publication remain required stages.
The separate
[ordinary assignment continuation](ucs-1241-assignment-continuation.md) lets a
later record assignment carry the necessary evidence; this gate does not assign
records. Neither contract adds a public CLI or MCP operation by itself.

The initial actual-Git control passed before the missing gate import failed
(session 72363, exit 1, 1514.327625ms). Review also produced genuine REDs for
lost thrown-query accounting, original availability asymmetry, nonenumerable
locator accessors and missing fresh-before refusal assertions. Targeted fixes
preserve the existing core, model and legacy replay contracts. Literal
characterization retains the model's original counter values and failure phases.
Composition tests observe one native allocation plan, one core model proof and
two fresh query-context loads; the gate does not rerun allocation for impacts.

Final owner verification passed **59/59** in 32765.647167ms (session 82141,
exit 0), including the independent gate matrix and existing ordinary, retirement
and split replay comparisons. All 17 pinned owner source/test hashes remained
unchanged. Owner receipts are in
`local-history:unknown-knowledge-reconsideration-gate-owner-final.log` and its
`.sha256` snapshot.

Main's independent integration used an isolated archive of
`ebdb4cca2722fb9b62e7c8356cf377e053b80816` with exactly six production files and
eight new fixture/test files overlaid. It deliberately excludes concurrent
ordinary-assignment changes and keeps that base's committed raw capture helper.
The six production hashes are pinned in
`local-history:unknown-knowledge-reconsideration-gate-integration-frozen.json`.
Node 24.19.0 ran `--test --test-concurrency=3` across 20 files: all new gate,
projection, operation-replay and replay-fault suites; existing core/provenance,
history/model/schema/query, governance/capture/budget, replay/retirement/split and
capture-admission suites. **242/242** passed in 83776.976125ms (session 60149,
exit 0), with no skipped or cancelled tests.

The independent matrix verifies nested SHA-256 snapshots, unchanged Git state,
owned input mutation protection, impact digest binding, strict admission,
mandatory impact caps, separate context exhaustion, partial retained sections
and cleanup failure after complete checks. Its initial run passed **11/12**;
the sole failure expected raw `EACCES` rather than the existing snapshot wrapper's
error. Correcting that test expectation passed **1/1** (2032.043375ms, session
55833, exit 0), and the complete corrected matrix is included in the 242-test
run. This was an oracle correction, not a runtime fix. Preserve the initial log
`unknown-knowledge-reconsideration-gate-independent-initial.log` and corrected
`unknown-knowledge-reconsideration-gate-independent-cleanup.log` separately.

Installation-copy/wrapper tests passed **35/35** (2578.184667ms, session 70058,
exit 0). Lint checked **575 files with zero failures** (session 91510, exit 0).
Automated A1–A4/A6 passed (session 92561, exit 0); A5 remains manual. Main logs
use `local-history:unknown-knowledge-reconsideration-gate-`. These focused results
are neither whole-suite verification nor operational or publication qualification;
overlapping owner and integration results are not unique-test totals.
