# Whole-record subject assignments

UCS-1236 supplies shared, read-only assignment state, a disposable direct index
and eligibility composition for Knowledge, Ontology and Decisions. These are
internal engine interfaces, not publication operations or a public SDK promise.

The substantive choices are recorded as proposals in
[optional assignment state and indexing](../../decisions/entries/whole-record-subject-assignments.yaml)
and [newly effective assignment eligibility](../../decisions/entries/newly-effective-subject-assignments.yaml).
Their proposed status is independent of the implemented behavior and completed
ticket. They preserve the existing
[three truth anchors](../../decisions/entries/D-003-three-stores-truth-anchor.yaml)
and [Git review infrastructure](../../decisions/entries/D-010-git-native-concurrency.yaml).

## Authored state and ownership

Each record may carry `subjects: SubjectId[]`, using exact canonical
`S-000001` through `S-999999` IDs. No primary subject is selected by list order.

| Authored metadata | Shared accessor result |
| --- | --- |
| No own `subjects` field | `{state:'unknown', reason:'absent'}`; no `ids` field |
| `subjects: []` | `{state:'known', ids:[]}` |
| Valid nonempty list | Known IDs in authored order |
| Null, malformed or duplicate IDs | Invalid state with attributed diagnostics |

The accessor checks local shape. Actual registry existence and governance are
separate checks. A missing index posting never proves an explicit empty list,
negative membership or complete coverage. Unknown metadata remains unknown in
query semantics; unsupported capabilities and invalid data remain refusals.

P1's typed iterator preserves original loader entries:
`{ref:{namespace,kind,id},entry}` for canonical owners and
`{proposalRef:{namespace,kind,key},entry}` for proposals. Proposal keys never
become canonical IDs or permanent canonical history owners. K/O/D retain their
existing schemas, truth anchors, source fields and gates.

## Shared interfaces

| Interface | Guarantee and boundary |
| --- | --- |
| `readAssignments(entry)` | Reads `entry.record`; preserves absent/empty/order; performs no I/O or governance lookup. |
| `buildAssignmentIndex(canonicalRows)` | Derives deterministic direct postings plus separate unknown refs. Invalid, duplicate-owner or mixed-namespace inputs refuse usable postings. No ancestry or related membership is authored by this index. |
| `validateAssignments(row, context, options)` | Delegates explicit inspect/query/new-assignment eligibility to real P2 semantics; preserves original target positions and typed failures. |
| `validateAssignmentChange({before,candidate,governance}, options)` | Checks one owner transition using the shared lifecycle and eligibility contracts; always reports row-local scope and publicationReady false. |
| `validateSubjectSplitAssignmentChange(input, {budget,operationBudget})` | Fixed internal continuation using the same row implementation, required redirect/operation allowances and `new-assignment/current` semantics. Checks handle ownership even with no targets; it supplies no split scope or publication proof. |

Implementation: [assignment state/index](../../payload/engine/lib/subject-assignments.js),
[eligibility composition](../../payload/engine/lib/assignment-validation.js),
[record lifecycle](../../payload/engine/lib/record-lifecycle.js).

Change options accept only explicit `inspect` or `new-assignment` purpose and
an optional redirect budget. Historical/current policy is fixed by purpose.
The change helper does not accept `operationBudget`. The general assignment
validator forwards P2-normalized options, including an authentic operation
budget where supported; it does not create a replacement allowance. Redirect
accounting records completed returned witnesses. On typed failure the target
loop stops; callers must stop the failed operation, not restart its budget.

For continued effective records, only added IDs are newly effective. At first
effectiveness every candidate ID requires eligibility, even if a draft already
carried it. Knowledge verified, Ontology active, and Decision accepted/addressed
are effective under the shared lifecycle table. Unknown lifecycle refuses new
assignment validation; proposals remain unpublished. Retired IDs can remain
historically authored but cannot gain new approval through a redirect.

Before-null means the caller supplied no prior canonical row. P1 must separately
prove fresh identity and exact captured occurrence. Absent or empty assignments
require no subject lookup; that is not permission to skip actual model,
identity, capture, history, evidence or human gates. A specifically admitted
no-Subject-authority operation must establish its capability boundary itself.

The [split request and metadata contract](ucs-1235-subject-split-design.md#implemented-split-request-and-event-metadata)
now defines ordered zero/one/several successor choices per existing owner and a
separate version-2 [assignment split event schema](../../payload/schemas/assignment-split-event.schema.json).
Its rows are nonempty, have known before/after assignments and retain nonnull
existing-record provenance; they are not canonical births. The shared history
reader normalizes membership for comparisons, while event projections preserve
authored order. Actual split composition must check that order against original
records and the exact per-owner mapping separately. Metadata admission does not
establish current eligibility, whole-file preservation, complete mapping scope
or publication readiness. The existing change helper's options above are
unchanged. The split-specific continuation now verifies an authentic active
allowance before reading rows, then charges one `governance-operation-binding`
step for the actual private handle. It forwards that allowance to every positive
eligibility check. Empty withdrawals do no target traversal but still require
matching operation ownership; failure cannot replenish the allowance. It does
not copy governance descriptors or reevaluate the model. Full core/P8 wiring
remains implementation work in the linked design.
The actual Git core now independently proves the mapping and retention sets and
raw substitution order. That core and the row-local checks remain separate from
P8's complete event/revision/rationale and physical-file preservation proof.

## Retrieval and authoring boundaries

P4 evaluates conjunction within one record: both `[A,B]` and `[A,B,C]` satisfy
`A AND B`; A-only and B-only records do not join. Whole-record co-assignment is
discovery, not evidence that unrelated source sections establish a joint claim.
See the [retrieval protocol](../../payload/protocol/intent-retrieval.md) and
[Knowledge authoring path](../../payload/protocol/skills/kb-build.md).

P8/P1 own typed authoring scope, grouped physical-file preservation, genesis and
history, fresh allocation/consumption and publication assembly. P3 completion
does not claim those operations or broader K/O/D publication parity. Preserve
original bodies, citations, reasoning, evidence dates and provenance; a subject
edit does not establish new source verification. P3 continues bounded consumer
review when a concrete integration change needs it.

## Evidence and documentation maintenance

Acceptance was checked on immutable main `929890a`: 179/179 targeted tests
passed, including actual schema/loader/CLI behavior, unknown/suppression
diagnostics and independent query oracles. This is a dated implementation
observation, not a cached verdict for later revisions. Re-run relevant checks
for changed behavior; do not retune frozen trials to maintain the claim.

Primary tests are `subject-assignments`, `assignment-schema`,
`assignment-validation`, `assignment-change`, `identity-reader`,
`record-identity`, `record-lifecycle`, `subject-query-record` and the actual
query execution/CLI suites under `tests/`.

This note and the two proposed decision records backfill P3's repository
documentation. Existing runtime agent guidance and authoring/retrieval protocol
already state whole-record scope and source/human gates; this maintenance adds
no new runtime conduct, command, flag or template behavior. Root README/AGENTS,
CONTRIBUTING, version/lockfiles, changelog and PR/CI files are integrated by the
main owner. No per-internal-commit version bump is required; every actual PR
follows the [version policy](../../decisions/entries/D-021-version-policy.yaml)
and [PR completeness proposal](../../decisions/entries/pr-completeness-and-versioning.yaml).
Decision catalog rows must be inserted additively during integration. Frozen
experiment/runtime/evidence artifacts are unchanged by this backfill.
