> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Retained material in subject lifecycle and record promotion

Status: retirement, merge, split and typed K/O/D promotion are implemented and
verified below. Standalone material inspection is not exposed; composed owners
use the internal continued inventory.
The implementation and independent review owners agreed this contract against
`293d043`. It extends the
[reconsideration Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml)
and follows [ordinary assignment continuation](ucs-1241-assignment-continuation.md).

## Fixed admission and ownership

An own `evidence.materialCaptures` field selects continued evaluation. An explicit
empty array selects the new profile; omission preserves the existing profile's
input, report and counters. Undefined, null, accessor or inherited selectors,
sparse arrays and malformed rows refuse. There is no second flag or material
location. Continued evidence has the three fixed Decision, assessment and
material capture families.

Fixed raw/wire lifecycle wrappers reuse the private capture-admission mechanics.
Obtain the existing `limits.governance` safely, create one authentic allowance,
reserve capacity and copy or decode each supplied occurrence once. Pass owned
evidence and that allowance through model, owner and assignment checks. A wire
worker must not decode into a raw API that copies the evidence again.

Keep wire version 1 and existing actions, events and publication policies.
Continued outer lifecycle reports use version 2; typed promotion reports use
version 3. Retained predicates bind that choice to the admitted original wire
field presence. Fresh owner execution remains mandatory; report shape alone
does not prove measured work or valid evidence.

## Evidence and actual state

Verify all supplied Decision, assessment and material source declarations,
including unused captures. Historical sources bind complete file bytes and the
declared commit/tree/blob/locator, format and mode. Source-less captures must
correspond to an actual side. Mixed assessment pairs require a common actual
side; fully sourced historical pairs can retain their independent history.

Reuse material on both sides only after actual registry/history preservation
establishes that the retained reconsideration history is the same. Do not hide
unused material with a selector or projection. Missing unrelated history remains
unavailable, not universally required; selected and coassigned subjects retain
their existing eligibility checks. No URL refetch, content-novelty parser,
record-truth assertion or new approval source is added.

Split checks compare the original pair once and run the native multi-successor
allocation comparator once. Merge and retirement preserve the identity ledger.
Typed promotion preserves native K/O/D allocation and genesis semantics.

## Inventory, rows and resource accounting

Only the transition and split owners currently consume the use inventory at
runtime. Add a fixed internal `inspectContinuedSubjectUses(input,
{ operationBudget })` entry over the private body. It receives already owned
evidence and the authentic enclosing allowance. Evaluate and bind actual models
there; do not load an unbounded context and then evaluate it again.

Keep standalone `inspectSubjectUses`, inventory version 1, its four logical
counters and DTO unchanged. New capture/evaluation/binding work debits the
enclosing owner's governance allowance, refreshed on every exit. Standalone
material inspection remains an explicitly unsupported interface; this internal
change must not be advertised as that support. It is not a separate required
endpoint in r3; composed owners still require complete use accounting. No new
public limit group or second Subject operation context is introduced.

Reuse `validateContinuedAssignmentChange` for lifecycle and typed genesis rows
with an actual context handle, including `before: null` and empty targets.
Typed promotion can legitimately have no registry or context handle. Preserve
its existing empty/unknown genesis behavior through the native no-registry path
with guarded, charged row metadata. Never fabricate a handle or silently ignore
nonempty subjects/material when no governed history exists.

Do not reuse the whole ordinary assignment context builder: it requires equal
registry/identity files and would repeat model evaluation. Extract only shared
physical capture/source mechanics if necessary. An already owned admission is
not charged twice; additional actual reads are charged. Existing impact reload
and evaluation exclusions stay explicit. This is not an end-to-end budget or a
new query/replay oracle.

## Complete vertical sequence and evidence

1. Shared admission, model and internal inventory; retirement through raw gate,
   prepared/final workers, review and temporary-ref publication.
2. Existing positive-use equivalent merge and split, including zero-use,
   positive-use and all-empty split mappings. The later
   [zero-use merge extension](ucs-1240-equivalent-merge-zero.md) separately proves
   empty direct scope and registry-only preservation; continuation alone never
   implies that proof.
3. Homogeneous Knowledge, Ontology and Decisions promotion, including optional
   registry/store cases.

Each path must bind the original opt-in and report version at retained and fresh
checks. Existing cleanup, runtime capability and atomic ref transaction behavior
remain mandatory. One owner edits runtime and primary tests; an independent
owner writes disjoint adversarial tests. Freeze the shared fixture/source before
one focused integration checkpoint and relevant generic regressions.

Start with failing actual-Git examples containing a successfully reconsidered
subject, not a planner-generated expected result. Verify missing required
material, source-less/mixed/historical pairs, exact and one-short capacities,
one-copy admission, native allocation count, empty/unknown distinctions and
optional-registry typed behavior. After a review receipt, source loss must refuse
publication; restoring it must permit the unchanged valid ref transaction.

This contract does not complete ordinary creation, union/broadening, proposal
refusal/reversal acceptance or remaining operational qualification. See the
[clarified lifecycle requirements](subject-lifecycle-required-scope.md).
The [zero-use equivalent-merge profile](ucs-1240-equivalent-merge-zero.md) is now
implemented separately. Public mutation interfaces and standalone material
inventory remain unsupported.
The listed standalone inspection and public mutation interfaces are not additional
P1–P11 prerequisites by themselves; actual required domain behavior and the
agreed shared-interface adapter remain the completion criteria.

Typed existing-record assignment publication is now supplied by the separate
[K/O/D assignment profile](ucs-1241-typed-assignment-publication.md), carrying
original selection and retained continuation through the same workers and fresh
review/publication path. Its fixed replay recipe covers every installed store;
it does not alter the lifecycle operations described here.

## Typed K/O/D promotion implementation

The [typed continuation guide](ucs-1241-typed-promotion-material.md) records the
fixed raw/wire handoff, authentic governance allowance, actual source checks and
retained/fresh publication path. An original material field selects outer report
version 3; omission retains version 2. Native allocation, preflight, genesis and
publication policies remain unchanged. Unknown/empty assignments without a
registry remain valid; nonempty material or subjects cannot bypass missing
authority. Completed owner, independent and generic evidence is recorded in that
guide, including distinct initial test-expectation failures and corrected runs.

## Retirement implementation

The fixed `runPreparedSubjectRetirementWireGate` admits the original wire under
one governance allowance. Its raw counterpart admits raw captures once. Both
pass the owned input and allowance through actual source/model checks, the
internal continued inventory and the positive assignment branch. The public
decoder remains available, but fixed workers do not decode and then re-admit a
raw request. Preparation, retained predicates, review and final verification
bind report version 2 to the original material selector. Existing inputs without
material retain report version 1 and their previous path.

The internal lifecycle context checks complete supplied source declarations
against actual commits and actual-side correspondence for detached evidence.
It admits additional physical reads and model work to the enclosing allowance.
Malformed capacities and capture-property work refuse before inspecting buffer
content when admission has exhausted its allowance. Successful and refused
owners report the actual accumulated usage; no repeated operation resets it.

The owner suite passed **8/8** in **74677.960875 ms**, including raw zero/positive
retirement, raw/wire ownership and capacities, strict selectors, source-less
correspondence, retained report negatives and a complete prepared/final/review/
temporary-ref publication. The independent raw matrix passed **12/12** in
**81048.289541 ms** across SHA-1/root and SHA-256/nested zero/positive cases,
including source loss, restoration and unchanged index/worktree.
Logs are `local-history:unknown-knowledge-retirement-material-owner-final.log`
and `local-history:unknown-knowledge-retirement-material-review-raw-first.log`.
The independent frozen suite passed **24/24** in **394935.012292 ms**. It combines
the actual zero/positive raw matrix with prepared/final/review/publication in both
object formats. After a review receipt, losing a declared Decision or material
source refuses publication; restored evidence permits the unchanged valid
transaction. Its log is
`local-history:unknown-knowledge-retirement-material-p2-frozen.log`.
Isolated generic regressions passed **275/275** in **574328.395958 ms** across
seventeen existing retirement, merge, split, assignment, inventory and prepared
validation suites. The exact `dd92900` archive plus seventeen changed runtime/
test files matched all 321 captured runtime/dependency hashes and overlay hashes
in both the archive and integration worktree. Lint checked 610 files with zero
failures. The generic log and manifest are
`local-history:unknown-knowledge-retirement-material-integration.log` and
`local-history:unknown-knowledge-retirement-material-integration.json`.
These receipts verify retirement integration, not the remaining lifecycle
operations, complete P1–P11 acceptance or supported production scale.

## Merge and split implementation

The fixed merge and split wire workers now enter their admitted owner directly.
Raw calls use the same three-family admission, one owned copy per occurrence
and one authentic governance allowance. Retained predicates bind outer version 2
to the original material field; omitted material retains version 1. Neither
operation changes stored event versions, publication policies or ref transactions.

Continued merge reuses actual lifecycle contexts and the internal use inventory,
then validates changed rows with the continued assignment owner. Extra committed
before/candidate captures of retained unknown owners debit the same allowance.
An actual control exposed a missing 5,432-byte debit before this correction;
omitted-input positive-use merge accounting remains unchanged. The subsequent
[eventless profile](ucs-1240-equivalent-merge-zero.md) supports proven zero
effective direct use with report version 3 and an explicit closure allowance;
it preserves the original positive-use version-1/version-2 contracts.

Continued split passes the same owned material list into both governance
evaluations. It preserves the single native multi-successor allocation and its
ordering. The original before pair is selected and proven once; the source
verifier checks every other supplied declaration without repeating that proof.
Zero-use, positive-use and all-empty mappings retain their existing distinctions.
Split review retains its separate native allocation check and compares original
actual bytes with canonical wire base64 without decoding those bytes again.
Fresh final execution still proves source semantics before publication.

Both final paths refuse a null impact report instead of throwing while accessing
its routes. Actual valid final controls preceded the malformed-input RED. This
is a narrow guard, not a broad exception handler. Independent impact reload and
evaluation, native Git/materialization and parser exclusions remain unchanged.

The frozen owner suite passed **11/11** in **110164.653375 ms**, with all 321
runtime/dependency files, 25 owner overlays and both executables unchanged.
Its log is `local-history:unknown-knowledge-merge-split-material-owner-final.log`;
the source manifest is
`local-history:unknown-knowledge-merge-split-material-freeze.json`.
The independent suite passed **24/24** in **1029103.622125 ms**, covering
SHA-1/root and SHA-256/nested operation paths, declared Decision/material source
loss after review, restored publication, source-ref drift and unchanged
index/worktree. Both native 321-file operation manifests and all eight independent
test/helper hashes matched after execution. Its log and receipt are
`local-history:unknown-knowledge-merge-split-material-p2-frozen.log` and
`local-history:unknown-knowledge-merge-split-material-p2-receipt.json`.

The isolated generic checkpoint passed **414/414** in **980765.02975 ms** across
21 existing suites, including original merge, typed merge, split creation/core/
allocation, assignment, retained/final validation and retirement material
regressions. No tests failed, skipped or were cancelled. All 321 runtime/dependency
files, 25 owner overlays, 21 selected test files and both executables matched the
freeze in the isolated copy and main worktree after execution. Lint checked 615
files with zero failures. The log and manifest are
`local-history:unknown-knowledge-merge-split-material-integration.log` and
`local-history:unknown-knowledge-merge-split-material-integration.json`.
This verifies the merge/split continuation, not the remaining lifecycle scope
or complete P1–P11 acceptance.
