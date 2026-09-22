> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Fixed Subject split replay consistency

The internal `compareSubjectSplitReplays` recipe runs one fixed inventory against
both actual captures through the existing query engine and paired comparator.
It assesses the frozen four-class split recipe. It does not independently
compute expected query results, approve mapping meaning, or authorize publication.

Implementation: [subject-split-replay.js](../../payload/engine/lib/subject-split-replay.js).
Tests: [actual captures](../../tests/subject-split-replay.test.js) and
[owner-output faults](../../tests/subject-split-replay-faults.test.js), using the
[replay fixture](../../tests/helpers/subject-split-replay-fixture.js) over the
[committed core/block fixture](../../tests/helpers/subject-split-core-fixture.js).

## Fixed internal boundary

```js
compareSubjectSplitReplays({
  version: 1,
  before: { capturedInputRef, context },
  after: { capturedInputRef, context },
  core,
  limits,
  queryBudgets,
})
```

Only fixed engine composition supplies `core`, directly from a fresh successful
same-pair `inspectSubjectSplitAssignmentScope` call. That report is an ordinary
mutable object, **not branded authority**. A decoded, retained or public caller
report must never reach this argument. This module does not provide standalone
forged-report rejection. No new public owner input is introduced by this slice.

The fixed caller establishes provenance. This recipe checks consistency:

- Both governance handles bind to their actual models.
- `before.capturedInputRef` equals `canonicalSha256(core.inputs.before)`;
  `after.capturedInputRef` equals `canonicalSha256(core.inputs.candidate)`.
- Core inventory descriptors, namespace, registry digest and identity digest
  agree with those descriptors and actual contexts. Matching hashes do not
  authenticate an arbitrary core report.
- The operation is a split, the core succeeded and authored closure completed.
  Its source/successors are canonical; successors are distinct, in allocator
  order, and exactly equal `core.allocation.allocatedIds`.
- Qualified unique `affectedRefs` equal the refs in both `core.assignments` and
  `core.operation.mappings`. The allowlist comes from independently proved
  actual closure, never from submitted mappings alone.

Core success does not replace P8 selected-file, unselected-sibling and assignment
event preservation. Final integration must independently require those proofs.
The tests here intentionally use actual **core-only** fixtures. They establish
this recipe's behavior, not complete P8 or publication success. Zero-use still
requires the outer exact registry/identity two-path preservation proof.

The input is closed: no caller inventory, executor, expected-result set,
mapped-ref override or policy switch. The existing retirement recipe, query
engine and comparator are unchanged.

## Scope and eligibility

The original universe is every canonical Subject in the actual before registry,
sorted by ID. Successors retain native allocator order. Candidate canonical IDs
must be exactly the originals plus fresh successors, each absent before.
Reserve that entire union against `maxSubjects` before eligibility. Do not prune
an unavailable original or require a fresh successor to have existed before.
Proposed Subjects are reported separately in `scope.outsideCanonical`.

Every original needs verified historical resolution to itself, without redirect,
on both sides. The source additionally needs verified before current/equivalent
resolution and actual after `subject-split` resolutions whose sorted alternatives
equal the successor set. Historical verification is still required; structural
split refusal is not approval. Every successor needs verified candidate
historical/current/equivalent resolution to itself without redirect. Its before
absence is corroborated by the registry and core allocation observation.

Use actual present stores in `knowledge`, `ontology`, `decisions` order. Every
store present on either side must be present on both. All cases use both
`current`/`all` views, `direct`/`self-and-descendants` expansion, `id-v1` ranking,
possible matches enabled, and explicit query capacities.

## Four case classes

| Assessment kind / case prefix | Fixed cases | Required actual behavior |
| --- | --- | --- |
| `historical` | Four baselines; positive/NOT every original; four adjacent-original pair forms without wrap | Exact strict and possible deltas; baseline membership unchanged; other membership changes confined to proven mapped refs |
| `source-refusal` | Current/equivalent, positive/NOT source | Complete before; exact after `subject-split`; after-only unavailable deltas |
| `successor-unary` | Historical/current/equivalent, positive/NOT each successor | Exact before `unknown-subject`; complete after; before-only unavailable deltas |
| `introduced-pair` | Historical source × each successor, then adjacent successors without wrap; four forms per pair | Exact before `unknown-subject` at actual preparation path; complete after; before-only unavailable deltas |

Baselines are `all`, `none`, `subjects-present`, `not-subjects-present`.
Pair forms are `a AND b`, `a OR b`, `a AND NOT b`, `b AND NOT a`.
Every historical comparison requires the comparator's exact status. For both
strict and possible categories, baseline `added`/`removed` arrays must be empty.
Other historical changes must be canonical `{ref}` wrappers in the proven
mapped-ref set; `{proposalRef}` changes refuse. Zero mapped refs therefore
requires empty membership deltas throughout the original historical class.

All actual `rankChanges` remain intact, including shifts of unaffected records
when preceding matches enter or leave a result. Even baselines impose no extra
rank-equality condition. Exact deltas mean exact computation, not unchanged
membership, unchanged ranks, or independently verified query truth.

Each expected refusal is exactly `{status:'refused',groups:null,counts:null,
diagnostics:[{code,path,message}]}`, with one diagnostic and nonblank actual
message. Source unary paths are `/where/subject` or `/where/arg/subject`.
Fresh unary paths are the same. Actual query preparation sorts required IDs,
then locates the first AST occurrence of the first failing ID:

| Form | Source/successor pair | Adjacent fresh pair `a < b` |
| --- | --- | --- |
| `a AND b` | `/where/args/1/subject` | `/where/args/0/subject` |
| `a OR b` | `/where/args/1/subject` | `/where/args/0/subject` |
| `a AND NOT b` | `/where/args/1/arg/subject` | `/where/args/0/subject` |
| `b AND NOT a` | `/where/args/0/subject` | `/where/args/1/arg/subject` |

It is not the first missing AST operand. Resolution alternatives come from actual
governance resolution, not from the query diagnostic.

For expected refusals, strict and possible candidate deltas must both retain
`status:'unavailable'`, null `added`, `removed`, `retained`, `rankChanges`, and
exactly one reason `{side,code:'full-query-output-unavailable'}` for the specified
side. The unchanged comparator also enforces complete output on the opposite
side. There is no invented empty before set or inferred fresh-target addition.

## Counts and accounting

`limits` has exactly `version:1`, `maxSubjects`, `maxEligibilityRedirects`,
`maxCases`, `maxInventoryBytes`. Capacities are nonnegative safe integers.
`queryBudgets` retains the existing version 1 fields: `maxAstNodes`, `maxAstDepth`,
`maxHierarchyNodes`, `maxHierarchyEdges`, `maxRedirects`, `maxRecords`,
`maxPredicateSteps`, `maxResultsPerStore`, `maxExplanationNodes`. AST node/depth
capacities must be positive; insufficient positive capacities cannot waive cases.

With `m` present stores, `n` original canonical Subjects, `s >= 2` fresh successors:

```text
historicalCases     = H = 4*m*(4 + 2*n + 4*max(n-1,0))
sourceRefusalCases  = 16*m
successorUnaryCases = 24*m*s
introducedPairCases= 16*m*(s + (s-1))
requiredCases      = H + 56*m*s
requiredQueryCalls = 2*requiredCases
```

All four counts remain in the result. BigInt arithmetic checks the full paired
workload before conversion to safe numbers. Case capacity is checked before
inventory construction. Exactly one combined canonical inventory is passed to
`compareSubjectReplays`; its atomic case/byte reservation precedes every query.
An undersized case or byte capacity executes zero queries, not a partial recipe.

Eligibility reports attempted calls, returned calls, unreported calls and
returned redirect counts against the cumulative recipe redirect allowance.
Native eligibility throws do not invent zero work; the first such failure ends
the recipe with remaining operands visible. Other ineligible outcomes remain
visible and cannot reduce the required universe.

The raw comparator retains its actual query-call totals, unreported calls,
returned observed counters and maximum observed AST depth. Preparation refusals
can have no returned query counters. Required calls are reservation mathematics;
actual calls are reported separately by the comparator.

These are invocation-local recipe/query allowances. Fresh impact context loads,
governance evaluation, binding, copies and canonical hashing are separate phase
work, not work charged to the earlier core governance allowance. The comparator
binds/hashes contexts again and query preparation performs its own actual
binding. Those costs are not free or represented as a global memory/CPU bound.
Inventory canonicalization also precedes its byte-capacity comparison.

## Result contract

Top-level fields are exactly `version`, `kind`, `status`, `policy`, `scope`,
`subjects`, `inventory`, `inventoryDigest`, `comparison`, `assessments`,
`coverage`, `resources`, `diagnostics`. Kind is `subject-split-replay`; policy is
`{id:'split-replay-v1',version:1,digest}` over the fixed policy document.
Status is `refused`, `incomplete` or `complete`.

`scope` has `stores`, `originalSubjects`, `source`, `successors`, `mappedRefs`,
`outsideCanonical`. Each Subject row has `id`, `kind` (`original` or `fresh`),
`before`, `after`, `disposition` (`blocked` or `queryable`). Before/after outcomes
are keyed by selected policy; a fresh before is `{status:'absent'}`. Source
`queryable` disposition means the complete mixed eligibility/refusal contract
passed, not that current source queries succeed.

Each assessment has `id`, one fixed `kind` from the table, `status`
(`not-performed`, `passed`, `failed`), and `diagnostics`.
Coverage has `subjectsComplete`, `unassessedSubjectIds`, `reservationComplete`,
`historicalComplete`, `sourceRefusalsComplete`, `successorUnaryComplete`,
`introducedPairsComplete`. `subjectsComplete` records completed assessment work;
blocked outcomes still prevent success. Resources have `limits`, `queryBudgets`,
`eligibility` and `inventory` (the six counts above plus canonical `bytes`).

The raw `comparison` is retained unchanged. Expected refusals make it
`incomplete` with unavailable deltas even when the separate fixed assessment is
`complete`. All four classes, subject checks and reservation must pass. This
finite recipe does not cover every mixed old/new pair, nonadjacent fresh pair,
or arbitrary higher-arity expression. Independent full mapping, forest,
retention, P8 preservation and publication proofs remain mandatory.
