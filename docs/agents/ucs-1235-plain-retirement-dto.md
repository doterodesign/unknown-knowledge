> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Prepared plain Subject retirement

`runPreparedSubjectRetirementGate(input)` in
[`subject-retirement-gate.js`](../../payload/engine/lib/subject-retirement-gate.js)
checks an actual committed before/candidate pair. It performs no writes and
always reports `publicationReady: false`. The separate [retained publication profile](ucs-1240-final-retirement.md)
adds fresh runtime, source capture, operator review and candidate-ref checks. The [Decision](../../decisions/entries/plain-subject-retirement.yaml)
and [design history](ucs-1235-plain-retirement-design.md) retain the agreed scope
and earlier alternatives.

## Request and actual scope

The closed input has `repoRoot`, `before`, `candidate`, `operation`, `reviewNote`,
`evidence`, `limits` and `impact`. Captured descriptors, evidence bytes and review
notes use the [equivalent-merge input contract](ucs-1235-equivalent-merge-dto.md).
Input admission detaches data and binds it by canonical digest, excluding the
local repository path. No caller contexts, reports, executors or approval flags
are accepted.

An own `evidence.materialCaptures` array selects the
[continued-material profile](lifecycle-material-continuation.md), including when
the array is empty. It preserves reconsideration history through later retirement
and reports outer version 2. Omission preserves the original version-1 path.
Decision, assessment and material evidence are owned once under the existing
governance allowance. All declared supplied sources are checked, including
historical material; source-less and mixed-pair evidence require the established
actual-side correspondence. Missing required material cannot become an eligible
empty classification. Standalone use-inventory material input remains separate
unsupported work.

Declared historical Decision source commit/tree membership is independently
recaptured and compared as a complete locator, with its additional byte cost
charged to governance. Valid supplied bytes alone cannot establish that source.

The operation is exactly:

```js
{
  version: 1, id, action: 'retire', subject,
  registryEvents: [{ id, changeDigest }],
  assignmentEvent: null, // or { id, changeDigest } for actual withdrawals
  retainedUnknowns: [], retainedHistoricalUses: [],
  retainedParents: [], retainedInheritedUses: []
}
```

There is exactly one registry event. The active, allocated source becomes
`retired` with `retirement: {kind: 'retire'}`. Its meaning, aliases, parent and
all other Subject metadata remain unchanged. The complete identity ledger and
old registry history remain unchanged; registry revision increases once and
hierarchy revision stays fixed. An existing effective Decision must authorize
the exact new event and keep its entire original file and mode unchanged.

Review arrays are dense, unique and already sorted by JSON tuple, in code-unit
order: `[namespace,kind,id-or-key]` for unknown/historical owners,
`[child,parent]` for edges, and `[namespace,kind,id,assignedSubject]` for inherited
uses. Each row supplies a nonblank `reason`; no normalization silently repairs
duplicates or order. Actual inspection independently determines each complete
set; these arrays cannot hide an owner or fabricate coverage.

All effective canonical K/O/D direct assignments lose only the retired ID,
preserving remaining order and the known state, including `subjects: []`.
Inactive canonical direct owners remain historical, with exact reviewed
assignments, lifecycle, location, full file bytes and mode. Unknown assignment
owners retain absence and their entire original files. Proposal source uses,
unknown lifecycle, incident associations and inbound redirects/successors refuse
in this implementation.

Incident parent edges remain unchanged and require exact review. Inherited uses
are derived from the union of actual before/candidate witnesses. A candidate
witness is required. A missing before witness is accepted only when the original
record had both the direct source and its unchanged descendant: withdrawing the
direct source exposes the previously suppressed inherited witness. The report
labels this `exposed-by-direct-withdrawal`; other witnesses are `retained`.

## Two assignment branches

| Actual effective direct-use count | Required evidence |
| --- | --- |
| Positive | A fresh nonempty v2 `subject-use-transition` event with closed `retire` scope, exact affected rows and the registry's Decision tuple. The fixed P8 adapter checks complete history, byte preservation and actual candidate membership. |
| Zero | `assignmentEvent: null` and `assignments: null`. Actual governed models, existing history, authority, ledger and use inventory still validate. Raw Git tree comparison must show the registry as the only changed path, including modes. No empty event or fabricated successful P8 report is accepted. |

The zero branch retains `{inputs, operationDigest, registryFile, changedPaths,
inventoryDigest}` as its preservation proof. The proof is attached only after
its row and canonical-byte costs fit. A path mismatch retains an admitted failed
proof; capacity failure does not retain an oversized proof. Only a passing proof
permits this exact `assignmentAssessment`:

```js
{
  status: 'not-applicable', reason: 'zero-effective-direct-use',
  effectiveDirectRefs: [], inventoryDigest, preservationDigest
}
```

The version-1 owner report requires all nine checks to pass, except that this
verified zero branch alone marks `assignments` not applicable. Positive branches
keep `assignmentAssessment` and `preservation` null and retain the actual P8
assignment report. Neither branch grants human approval or publication authority.

## Mandatory impacts and limits

`impact` is exactly `{version: 1, policy: 'plain-retirement-impact-v1',
routes: {kind: 'runtime-capability'}}`. Caller-selected empty inventories cannot
waive reach, the complete whole-registry tree pair, or fixed query assessment.
Every actual present K/O/D store must remain present on both sides; Knowledge
need not exist. Reach may retain incomplete semantic coverage only for the exact
reviewed unchanged unknown owners, with all record and hierarchy work complete.

The fixed `retirement-replay-v1` recipe compares historical queries over every
original canonical operand, plus exact current/equivalent source-refusal probes.
For `m` actual stores, `n` canonical Subjects and `p = max(n - 1, 0)`, it requires
`4*m*(4+2*n+4*p)` historical cases and `16*m` refusal cases, each run on both sides.
The combined count and inventory bytes must fit before any query. Unavailable
operands block the recipe instead of shrinking it. Expected source refusal has
`groups: null`, `counts: null` and the exact `subject-retired` diagnostic path;
before output must be complete. Raw comparison remains incomplete with null
candidate deltas for these refusals. Only the separate retirement assessment can
be complete. This finite recipe does not discover every external query or prove
every Boolean combination.

The eight merge limit groups are retained, plus mandatory
`closure: {maxRows, maxBytes}`. Closure charges actual retained unknown,
historical, parent and inherited rows, assignment expectations, and the zero-use
proof. It reports `used: {rows, bytes}` and a sticky first `failure` with the
limit, used count and request. These logical limits do not globally bound Git
materialization, parsing, canonical serialization, CPU or memory.

Runtime-capability route assessment and exact retained/fresh publication evidence
remain separate work. The entry points and event schema are internal library
support; no new public CLI, MCP tool or agent authoring command is introduced.

The final focused integration passed **168/168 tests** in 108382.8765ms after
review corrections for historical-source membership and cleanup-after-success.
Tests cover actual prior history on both branches, absent Knowledge, mixed
K+O/K+D files, mode and byte preservation, and exact-fit/one-short capacities.
These results establish the tested internal scope, not full lifecycle acceptance
or publication. A snapshot cleanup failure revokes success even after impacts
have completed; raw completed evidence is retained with the failure diagnostic.
