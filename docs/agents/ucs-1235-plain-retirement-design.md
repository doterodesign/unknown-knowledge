> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Plain Subject retirement — owner implementation and design history

Status: the fixed retirement owner gate is committed at
`8c9cac77ac154376cc43b4340cb647b0066bb27e`; final focused integration passed 168/168.
The first full run passed 2538/2539: its sole failure was the old closed schema
kind inventory omitting `assignment-retirement-event`. Runtime tests passed;
the expectation correction and subsequent full verification are recorded below.
The corrected full run at `26d785bc5ce963070ce4226bd1824bd85a829e41` passed
2539/2539 in 493856.260375ms, with no failures, cancellations or skips.
P7 publication implementation remains pending. The Decision remains proposed; implementation authorization is
not canonical approval. The existing equivalent-merge contract stays unchanged.
This is bounded UCS-1235 work, not completion of split, union, suppression
reversal or the lifecycle family.

The [prepared retirement DTO guide](ucs-1235-plain-retirement-dto.md) describes
the current request/report contract; this document retains design history and
implementation evidence.

## Historical proposal and review checkpoint

The following proposal-time sections, through Documentation and release
ownership, retain the original rationale, open questions and rejected review
dispatch. Their pre-implementation status statements are historical. The
subsequent agreement and implemented-core checkpoint below record the later
resolution without replacing that history.

Rationale is recorded in
[the proposed Decision](../../decisions/entries/plain-subject-retirement.yaml).
The r3 specification requires a retained tombstone and historical assignments,
new-assignment ineligibility, and complete adjudication of active inbound uses.
P8 reviewed the typed-history seam and P6 reviewed the view/replay seam. P1/P4
review, the graph-retention choice below, exact DTOs and integration source pin
remain required before implementation.

Historical checkpoint: main accepted the retained tombstone, unchanged existing
forest and complete incident-edge/inherited-use adjudication, including required
same-owner source/child and zero-use cases. Implementation worktree starts at
`b7107c9a4b5efd133e3230f4a319f1bcf84635c9`; no runtime changes have started.
P8's local 2026-09-20 seam packet confirms the positive-event and zero-use/history
rules below but explicitly leaves the complete DTO and forest extension open.
P6's earlier view review is incorporated; delivery of the follow-up forest/DTO
review request was rejected by automatic approval review and awaits authorization.
Neither main's scope agreement nor an owner conceptual seam substitutes for the
remaining exact report/limits agreements.

## Exact transition

Retire one existing active allocated canonical Subject. Its candidate state is
the previous state with `status: retired`, `retirement: {kind: retire}` and the
required append-only change witness. Retain definition, labels, aliases, parent,
associations, origin and prior history. Allocate nothing; preserve the complete
identity ledger. No redirect, successor, meaning rewrite or forest rewrite is
part of this action. Require one actual registry event, the complete current
authorizer tuple and captured historical evidence.

Independently inspect actual committed before/candidate K/O/D records, proposals,
registry references and allocations. For every effective canonical direct use,
require exactly one reviewed typed assignment row with a reason and:

```js
after.ids = before.ids.filter(id => id !== retiredSubject)
```

The result stays known, including known `[]`. Unknown or an absent field is not
withdrawal. Preserve other IDs and their order. Existing Knowledge revision-note
rules and grouped O/D subjects-span preservation apply. All rows belong to one
new typed event, with exact previous revisions, capture locators and the same
complete Decision tuple as the registry event.

Retain inactive canonical historical direct uses unchanged, with an exact
reviewed owner/reason set. Prove each actual owner, lifecycle, locator, file mode
and full file unchanged. Preserve old event before/after states and old event
files. A source-bearing proposal or unknown-lifecycle owner refuses this tranche.
Unknown assignment fields retain the existing exact all-absence review set and
whole-file protection. Authorizer files also remain protected. A selected sibling
sharing any protected file refuses; entry-level exemptions need a separate design.

## Retained forest and inherited uses — proposed extension for review

P6 identified that withdrawing a parent's direct assignments does not remove
matches inherited from retained children under historical descendant expansion.
The structural forest permits a retained retired parent; current activation and
promotion rules separately require an active parent for a newly effective child.
Do not change those eligibility rules as part of retirement.

Propose retaining existing parent edges involving the source, with an exact
reviewed set of their actual source/target identities, locators and reasons.
Preserve the whole forest and hierarchy revision when its topology is unchanged.
Account for every actual inherited witness on both sides and preserve descendant
assignments except any separately selected direct source withdrawal. Associations,
inbound redirects/successors and proposal source uses remain explicit refusals in
this first tranche. The source's own unchanged metadata is always retained.

This extends the earlier draft that refused every graph use. It is not frozen:
P1/P4/P6/P8 must review the retained-edge and inherited-use DTO/preservation proof.
A source-with-child positive fixture is required before this extension can ship.
Do not claim an isolated-source implementation supports children.

An inventory detail matters: `inspectSubjectUses` suppresses an inherited witness
when the same owner directly carries that ancestor. Removing the direct source ID
can therefore reveal a candidate inherited witness without changing a child edge
or child assignment. Derive both inventories independently; do not demand equal
inherited-witness counts or treat this expected exposure as a newly authored use.

## Closed admission and zero-effective-use branch

Use a separate `runPreparedSubjectRetirementGate` and separate closed operation
schema. The concrete operation proposed for owner review is:

```js
{
  version: 1,
  id: "<operation UUID>",
  action: "retire",
  subject: "S-NNNNNN",
  registryEvents: [{id: "<event UUID>", changeDigest: "<SHA-256>"}],
  assignmentEvent: null, // or {id, changeDigest} for nonzero withdrawal rows
  retainedUnknowns: [], // existing exact {ref, reason} or {proposalRef, reason}
  retainedHistoricalUses: [], // exact {ref, reason}, inactive canonical direct use
  retainedParents: [], // exact {child, parent, reason}, incident retained edges
  retainedInheritedUses: [] // exact {ref, assignedSubject, reason}
}
```

All records are closed; arrays are dense, duplicate-free and canonically ordered.
Canonical refs retain namespace/kind/id. Parent endpoints and assignedSubject are
canonical Subject IDs; reasons are nonempty reviewed text. The gate derives
captures, locators, lifecycle and paths itself rather than accepting them as proof.
`retainedParents` equals the actual incident parent-edge set on both sides.
`retainedInheritedUses` equals the actual before/candidate union keyed by qualified
owner and original assigned descendant. Require unchanged descendant membership,
forest/path and owner lifecycle; a missing before witness is permitted only when
the same direct source assignment suppressed it before the exact withdrawal.
An inherited proposal owner refuses this tranche. These dispositions do not grant
new assignment eligibility or bypass grouped-file preservation.

This exact spelling and the limits remain proposed until owner agreement. Do not
loosen the existing merge wire or insert fake survivor fields. The outer input
retains repoRoot, before, candidate, operation, reviewNote, evidence, limits and
impact. Actual descriptors, detached capture transport and repoRoot exclusion
from the canonical wire digest follow the existing admission rules. Use a distinct
`plain-retirement-impact-v1` policy. The new report retains raw owner results and
adds explicit retained-historical/parent/inherited closure rows; it never changes
the equivalent-merge report or its policy identifier.

P8 needs a distinct closed retirement scope for `subject-use-transition`, carrying
exactly kind, operation, action=`retire`, subject and `registry-events` IDs. Generic typed assignment
rows allow more transitions than retirement; the retirement core must enforce the
exact known-minus-source rule itself.

`assignmentEvent: null` is admitted only after complete actual inspection proves
zero effective explicit source uses. Retained unknown fields are not evidence of
zero semantic use. Require a dedicated not-applicable assignment assessment with
its actual inventory proof, all old history/file preservation and a registry-only
changed-path proof. Do not invent an empty event, fabricate a successful P8 report
or conflate not-applicable with not-performed. The positive-row branch invokes the
actual typed pipeline. Both branches retain the full Decision and preservation
checks, mandatory impacts and `publicationReady: false`.

## Fixed retirement replay policy

Propose a separate `retirement-replay-v1`; equivalent merge's policy cannot be
reused because plain retirement makes its source ineligible.

1. Compare actual original-ID queries under historical policy across every store
   present on either side, requiring each store on both sides. Cover current/all
   record views and direct/self-and-descendants expansion; include all/none,
   subjects-present/NOT subjects-present, each original canonical ID and its NOT,
   and fixed adjacent-ID binary AND/OR/AND-NOT forms. Require verified historical
   eligibility and complete operand accounting. Historical policy resolves within
   each captured registry; it does not reconstruct an earlier forest. Keep actual
   deltas, including retained inactive and descendant matches. Equality is not a
   success requirement. An unrelated unavailable operand blocks the recipe.
2. Run separate assigned(source) and NOT assigned(source) probes under current
   and equivalent policies for both views and expansions in every required store.
   Before must complete; candidate must actually refuse with `subject-retired`.
   Preserve raw owner responses and unavailable/null comparator deltas. Assess
   this expected transition separately; never convert refusal into empty results,
   universal NOT matches or generic comparator completion.
3. Reserve the complete case inventory and its canonical bytes before querying.
   With m stores, n original canonical operands and p fixed pairs, historical
   comparison requires `4*m*(4 + 2*n + 4*p)` paired cases; refusal probes add
   `16*m` paired cases. Actual query calls are twice the combined case count.
   Freeze the explicit recipe/query limits and exact failure DTO before coding.

P4 must confirm executable query/refusal response shapes and the finite recipe;
P6's generic comparator semantics remain unchanged. No caller-chosen probe list,
query omission, report substitution or generic waiver is accepted.

## Mandatory other impacts and resource ownership

Compute actual canonical reach, including retained inactive historical records.
Keep raw incomplete/unknown results and separately justify only exact reviewed
retentions. Complete record coverage is necessary to interpret absence as empty.
Always run the whole-registry tree comparison: one fixed inventory row, two real
factory calls, complete outputs and both fixed artifact paths. This also applies
to zero-effective-use retirement, since the tombstone and history alter views.
Zero row/view/byte capacities refuse; no effect is waived by unchanged ledger IDs.

Use actual unbound loader contexts and honest owner-scoped limits until main
releases operation-budget forwarding through generic P6 APIs. Never clone or
unbind an operation-bound context to avoid its allowance. Native cost exclusions,
runtime capability, authenticated review and final publication remain explicit.
P7 owns any new outer publication operation/manifest dispatch after its own design
and actual final rerun. No outer operation spelling is frozen here.

## Required evidence before release

Positive actual Git fixtures: K-only, O-only, D-only and mixed grouped withdrawals;
known-empty result; retained inactive history; retained child edge with distinct
direct/expanded historical deltas; source plus child assigned on the same record;
zero effective uses with retained historical owners; deterministic full rerun.

Negatives: omitted/extra withdrawal rows, unknown replacing known-empty, proposal
or inactive edits, protected siblings, missing retained-history/unknown/forest
dispositions, graph or definition rewrite, missing or corrupt governance proof,
wrong actual commit/tree, extra changed path, omitted/forged history event, changed
authorizer tuple, unrelated query refusal, unexpected probe result, partial
inventory, any mandatory impact cap exhausted and sticky allowance failure.
Prove exact-fit and one-unit-short capacities with actual captures, not synthetic
owner reports. Obtain meaningful RED before production changes and bounded owner
reviews afterward. Integrated lifecycle acceptance remains main's responsibility.

## Documentation and release ownership

P2 updates this contract, governance/inventory references, decisions and any new
gate DTO. P8 owns typed history schema/docs; P4 owns query semantics; P6 owns view
contracts; P1 owns ledger/captured-source rules; P7 owns final transport/runtime
dispatch. Main reconciles root README/AGENTS/CONTEXT, version/lock/changelog and
the PR. One version bump belongs to each actual PR, not each internal commit.
This design-only change adds no runtime file, public command, payload manifest
entry, protocol instruction or claim that retirement is available.


## Subsequent implementation agreement

The reviewed input keeps the exact operation above and adds only ninth limit
group `closure:{maxRows,maxBytes}` to the merge capacities. Review arrays retain
strict ascending JSON tuple order (qualified owner; child/parent; qualified
owner/assignedSubject), with no normalization. Two fixed interfaces share the
capture envelope. A separately dispatched closed retirement event schema keeps
the existing merge scope and narrow schema-validator vocabulary unchanged.

Zero-use preservation retains `{inputs:{before,candidate},operationDigest,
registryFile,changedPaths,inventoryDigest}` from actual healthy contexts and
committed trees. `changedPaths` must equal the sole registry path. Its canonical
digest and inventory digest bind the exact not-applicable assignment assessment;
all other checks, including candidate commit membership, must pass. Old history,
identity, protected files and modes remain unchanged. No fake event or successful
P8 report is produced. Positive withdrawals reuse the fixed actual P8 pipeline.

Inherited closure records original before/candidate records and witnesses, with
`retained` or `exposed-by-direct-withdrawal` disposition. A null before witness
requires actual source-plus-descendant assignments, unchanged forest/descendant
and exact direct withdrawal; a candidate witness is mandatory. Closure row and
canonical-byte capacity is charged before complete results are claimed.

The fixed replay uses one combined reserved inventory through the existing
comparator. Expected candidate refusals must identify `subject-retired` at the
exact source predicate path; any other error fails. Historical deltas remain
real, and the generic comparator remains incomplete for refused candidate
outputs. Only the separate retirement assessment can complete. Native work
exclusions and unreported query work remain explicit.

## Implemented core checkpoint — 2026-09-20

The reusable entrypoint is
[`inspectSubjectRetirementAssignmentScope(input)`](../../payload/engine/lib/subject-retirement-core.js).
It and the unchanged
[`inspectEquivalentMergeAssignmentScope(input)`](../../payload/engine/lib/subject-equivalent-merge-core.js)
delegate to two fixed entrypoints in
[`subject-transition-core.js`](../../payload/engine/lib/subject-transition-core.js).
Registry, actual capture, old-history, authorizer, inventory and unknown-owner
verification remain private common implementation. Retirement has explicit
transition/retention branches, with no caller callbacks or policy injection.
Existing merge DTOs, diagnostics and allowance behavior remain unchanged.

Retirement accepts one fresh plain-retire event over an existing active allocated
source, preserving its meaning, identity ledger, prior registry history, forest
and hierarchy revision. Actual committed registry bytes/mode and capture
bindings must agree. Source query eligibility is verified as current before and
historical afterward, without a redirect. The complete effective authorizer
Decision tuple and its whole file/mode remain unchanged. Registry checks and
retention recaptures use the existing governance allowance.

Independently derived effective canonical K/O/D direct rows must have exactly
known-minus-source candidate assignments, preserving other IDs and their order,
lifecycle and owner resolution. Known empty arrays stay known. The assignment
event is null if and only if that actual derived row set is empty. For positive
rows the core establishes scope; the fixed P8 adapter validates actual assignment
event/history bytes and grouped-file preservation. It does not accept caller
assignment rows as evidence of actual scope.

Inactive canonical source uses require exact reviewed retentions and unchanged
whole owner files/modes. The exact all-absence unknown-owner set is protected on
both sides, including otherwise eligible unchanged proposals. A selected sibling
sharing an authorizer, historical or unknown protected file refuses. Source-bearing
proposals, inherited proposal owners and unknown source-owner lifecycles refuse.
Actual incident parent edges are retained with exact reviewed closure. Associations
and inbound redirects/successors refuse. Raw inventory incompleteness from unknown
assignments remains visible; reviewed closure does not rewrite that raw result.

The result keeps the merge base envelope, version 1:

```js
{
  version: 1, ok, inputs, operation, registry, decision,
  authoredReferenceClosure, inventory, assignments, resources, diagnostics
}
```

The retirement-only additions to `authoredReferenceClosure` are exact rows:

```js
retainedHistoricalUses: [{ref, reason, beforeRecord, candidateRecord}]
retainedParents: [{child, parent, reason, beforeWitness, candidateWitness}]
retainedInheritedUses: [{
  ref, assignedSubject, reason, beforeRecord, candidateRecord,
  beforeWitness, candidateWitness, disposition
}]
```

Inherited rows equal the actual before/candidate union by qualified owner and
assigned descendant. Candidate witnesses are mandatory. Null `beforeWitness`
requires actual before source-plus-descendant membership, exact selected direct
withdrawal and unchanged descendant membership/forest. Disposition is `retained`
or `exposed-by-direct-withdrawal`. The core retains actual captures and witnesses;
P8 independently checks allowed edits when a selected owner shares that file.

Input review arrays require strict ascending complete JSON tuple keys, without
sorting or digest normalization: unknown/historical `[namespace,kind,id-or-key]`,
parents `[child,parent]`, inherited `[namespace,kind,id,assignedSubject]`. The nine
limit groups are inventory, governance, assignments, reach, views, tree, replays,
query and closure. Retirement adds:

```js
resources.closure = {
  used: {rows, bytes},
  failure: null // or {code, limit, used, requested}
}
```

Each actual retained unknown, historical, parent, inherited and assignment
expectation row consumes one row and its complete canonical serialized byte
length before attachment. Admission is atomic with sticky
`retirement-closure-budget` failure. Main's gate charges one additional zero-proof
row and its canonical bytes to the returned usage before retaining that proof,
including a failed proof. Capture bytes remain charged to the existing owning
allowances. These limits do not claim a global bound on native Git I/O,
materialization, parsing or serialization allocation.

The zero branch retains the five-field proof from the agreement above, with
actual raw Git changed paths exactly `[registryFile]`. Its assessment is exactly
`{status:'not-applicable',reason:'zero-effective-direct-use',effectiveDirectRefs:[],
inventoryDigest,preservationDigest}`. It requires actual healthy models and parsed
before/candidate assignment history, alongside the core governance checks. It
never emits a fake assignment event or successful P8 report. The positive branch
retains the actual fixed P8 report. Other mandatory checks and impacts apply to
both branches; publication remains a separate acceptance step.

### Actual core fixture and validation evidence

[`subject-retirement-core-fixture.js`](../../tests/helpers/subject-retirement-core-fixture.js)
exports `subjectRetirementCoreFixture(t, options)` returning the actual Git
fixture hooks, `input`, `document`, `event` and `withCoreInput`. Candidate bytes are
hand-authored. Options retain the default Knowledge fixture and support grouped
Ontology/Decision, nested roots, zero scope, child edges, same-owner exposure and
inactive Knowledge history. `knowledgePresent:false` is limited to O/D and
removes the Knowledge store/catalog/allocations before capture; O then has O+D,
and D has D-only. The historical option currently selects a Knowledge owner and
requires that store. Main composes full P8 baseline/event history independently.

The following are retained actual runs with Node 24.19.0 and `PATH=/usr/bin:$PATH`.
They are separate runs; their counts are not one combined final suite.

| Evidence log | Actual outcome |
| --- | --- |
| `local-history:subject-retirement-core-red.log` | Initial pre-production RED: 0/1 pass, 566.583334 ms; actual committed plain-retire event refused by existing merge core with `merge-event-mismatch`. |
| `local-history:subject-retirement-core-first.log` | 10/10 pass, 14246.796541 ms: first retirement positive and nine existing merge-core cases. |
| `local-history:subject-retirement-core-regression.log` | 16/20 pass, 55900.699667 ms; four fixture failures retained. |
| `local-history:subject-retirement-core-corrected.log` | 5/5 pass, 15999.05025 ms: affected inherited/closure cases after fixture correction. |
| `local-history:subject-retirement-core-negative.log` | 7/7 pass, 14267.344583 ms: actual graph, protected sibling, event and capture refusals. |
| `local-history:subject-retirement-core-final.log` | 63/63 pass, 84430.540792 ms: 27 retirement-core, nine merge-core and 27 assignment/typed-merge regression cases. |
| `local-history:subject-retirement-core-no-knowledge.log` | 4/4 pass, 4473.228083 ms: O+D without Knowledge and D-only, each positive and zero. |
| `local-history:subject-retirement-core-defaults.log` | 4/4 pass, 9327.230292 ms: default K, grouped O/D and nested historical zero rechecks after the helper option. |

The 63-case command was:

```sh
PATH=/usr/bin:$PATH local-history:node --test tests/subject-retirement-core.test.js tests/subject-equivalent-merge-core.test.js tests/subject-use-assignment-gate.test.js tests/typed-equivalent-merge-gate.test.js
```

That run preceded the four no-K cases; production core did not change afterward.
The four earlier regression failures exposed a missing review of preexisting K6's
inherited S3 membership. The core correctly refused
`retirement-retained-inherited-scope`; the fixture added the missing reviewed row
without changing K6 bytes or relaxing production. That initial bounded review reported no unresolved production-core
finding; the subsequent independent provenance finding is recorded below. Scoped syntax and whitespace checks passed.

### Owner integration checkpoint and remaining scope

Main reported expanded full-gate/P8 results in
`local-history:unknown-knowledge-retirement-gate-expanded-red.log`: 14/15 pass, with
the intended RED showing an oversized zero preservation proof attached before
closure admission. Main reports moving attachment after the actual capacity
charge. The correction's combined retirement/merge/typed/schema regression subsequently
passed 162/162, 96968.189584 ms, in
`local-history:unknown-knowledge-retirement-domain-regression.log`. This main-owned
run preceded the independent source-provenance finding and correction below.

Main also reports actual tracked prior no-op classification followed by literal
old-history retention, O+D without Knowledge and D-only positive/zero full
impacts, and refusal for extra paths/modes or insufficient replay capacity.
These are owner-reported integration findings, distinct from the independently
run core logs above. Main owns the exact-fit/one-short zero-proof attachment
checks and final combined acceptance; P7 owns replay/publication integration.
Runtime source pin, authenticated review, final publication rerun, release
metadata and integrated lifecycle acceptance remain pending. Nothing here
promotes the proposed Decision, authorizes publication or declares the broader
lifecycle family complete.

### Subsequent historical-source provenance correction

Dewey's independent review found that the core's current-authorizer comparison
removed `source` from locators. Matching valid bytes and supplied evidence could
therefore carry a real commit with a false tree in the new retirement review.
Positive P8 already verifies such declared historical membership; zero retirement
has no P8 assignment event, so that comparison alone left a provenance bypass.
This finding supersedes the initial bounded no-finding checkpoint above.

The retirement core now independently calls `captureCommittedFile` for the new
review's declared source commit/file when `decisionCapture.source` is present,
charges the returned capture to governance and compares its complete locator,
including source commit/tree. A mismatch refuses with
`retirement-authorizer-source` before Decision or inventory attachment. Source-less
locators keep their existing current-byte verification; the merge branch is
unchanged. This fixed retirement check applies to both positive and zero scope.
No new input field, public DTO, scope waiver or generic source policy is added.

The new actual Git tests change only the new retirement review and append matching
supplied evidence, preserving original registry history. They use valid captured
Decision bytes and an existing commit, with a different real subtree as the false
tree. The valid source counterpart passes. They also assert the independent
historical capture's exact byte charge, refusal one byte before admission, and
full valid-source exact-fit/one-short governance boundaries.

| Evidence log | Actual outcome |
| --- | --- |
| `local-history:subject-retirement-core-provenance-red.log` | 1/2 pass, 7309.633708 ms: false-tree case incorrectly returned `ok:true`; valid-source counterpart passed. |
| `local-history:subject-retirement-core-provenance-green.log` | 2/2 pass, 6105.745 ms after the retirement-only source check. |
| `local-history:subject-retirement-core-provenance-budget-green.log` | 2/2 pass, 6768.695792 ms with explicit historical-byte debit and admission-boundary assertions. |

The post-correction core/merge/assignment regression passed 69/69,
96092.662791 ms, in
`local-history:subject-retirement-core-provenance-regression.log`, using the same
four-file command above. This includes the four added no-K cases and the two
provenance cases. No unresolved core finding remains after this correction.
Main subsequently reports the outer-gate cleanup-failure `ok` reset reproduced
RED, then passed 3/3 cleanup and prior positive/zero history cases; actual mixed
K+O and K+D grouped cases passed 2/2. These are owner-reported results, not added
to the independent 69-case count. Final integrated regression and lint remain
main-owned and pending at this checkpoint. Core code is stable. Earlier logs
remain historical evidence, not proof of this subsequent correction.
