# Subject operation budget composition

For [ordinary assignment continuation](ucs-1241-assignment-continuation.md), one
authentic six-counter allowance covers owned raw admission or bounded wire
decode, metadata checks, both actual governance evaluations and bindings,
supplied-source checks and continued row eligibility. The same owned captures
are reused. This uses native governance composition, not two loads through one
query host whose context lifetime permits only one attempt. Native snapshot
materialization/model loading and existing history/preservation/impact work keep
their documented separate limits or exclusions. Owner exits refresh actual
usage even when input validation or cleanup fails; retained counter bounds are
not proof of historical measurements.

This opt-in seam shares the existing six explicit Subject validation capacities
across actual owner work. It is a resource allowance, never governance approval,
source membership, a production default, or whole-process qualification.

The [P2 decision audit](ucs-1235-decisions-and-docs.md) links the proposed accounting
rationale and distinguishes owner checks from operational qualification.

## Authentic allowance and failure state

`createSubjectValidationBudget(limits)` accepts exactly the existing safe,
nonnegative limits: `maxCaptureBytes`, `maxDocumentNodes`,
`maxDocumentTextUnits`, `maxSubjects`, `maxHistoryRows`, and
`maxValidationSteps`. The returned handle is frozen and privately branded.
`getSubjectValidationBudget(handle)` authenticates it; copying methods, spreading,
or serializing does not create another usable allowance.

The authentic handle exposes:

- `charge(counter, amount, phase)`: pre-admit an explicit logical debit. Document
  counters belong solely to the neutral document visitor, not this method.
- `guard(document, phase)` and authentic `documentBudget`: both use the same
  neutral document-node/UTF-16-text counters.
- `relevant()`: the existing refusal-row validation step and observation count.
- `assertActive()`: reject after the first exhaustion, even when another counter
  still has capacity.
- `used` and `failure`: copied observations, available after failure. Failure is
  null or `{code, message, counter, phase, attempted, remaining}`. There is no
  reset, refund, replenishment, or setter.
- `reserveCaptureBytes(length, phase = 'raw-captures')` and
  `admitCapture(capture, reservation?)`: retained raw admission described below.

`getDocumentBudgetFailure(documentBudget)` exposes a copied first neutral
exhaustion. Neutral guards latch their original exhaustion and reject later guards.
The Subject handle observes that latch even if the failing neutral guard ran in
another owner. Subject exhaustion prevents subsequent Subject work methods; the
outer operation must check its own latch before every dependent phase, including
neutral source reads and output transport. Authentication itself permits reading
failure/usage; it is not permission to continue work.

## Retained raw capture admission

A decoder derives the exact decoded length before allocation and calls
`reserveCaptureBytes`. Its opaque token belongs to one allowance and is consumed
once by `admitCapture(capture, token)` with the same actual Buffer length. Forged,
transferred, reused, or mismatched-length tokens refuse. Reservations cannot be
refunded. The host separately enforces its single-capture ceiling before decoding.

For already decoded API input, `admitCapture(capture)` precharges fresh bytes.
A private per-handle WeakMap records wrapper identity, Buffer identity, byte length,
and SHA-256 content digest. Only an unchanged previously admitted capture skips a
second raw debit. Copied wrappers, replaced buffers and changed bytes debit again.
Content comparison of an existing admission necessarily hashes it before deciding
whether another debit is needed; fresh ownership is charged before hashing.
Admission never substitutes for evidence integrity checks or proof parsing.

Composed governance evaluation admits transported Decision and assessment captures
through this same method. Repeated evaluation of the same unchanged captures does
not re-admit raw bytes, but it does charge every real document/history validation
visit again. Existing independently bounded activation/promotion APIs keep their
aggregate raw-capture debit ownership and do not silently switch to transport dedup.

## Owner composition and lifetime

Owner calls accept optional `operationBudget`:

- `evaluateSubjectGovernance(input, {operationBudget})`
- `validateSubjectGovernanceCapture(handle, {model}, {operationBudget})`
- `getGovernedSubjectRegistry(handle, {operationBudget})`
- `getSubjectGovernanceDescriptor(handle, {operationBudget})`
- `validateSubjectRegistryMetadata(registry, {identity, operationBudget})`
- `parseSubjectRegistry({bytes, identity, operationBudget})`
- `readSubjectRegistry({kitDir, identity, operationBudget})`
- `subjectEligibility(handle, id, {purpose, policy, budget: {redirects}, operationBudget})`
- `resolveSubject(registry, id, {policy, budget: {redirects}, operationBudget})`

Existing internal `budget` handles and `operationBudget` cannot both be supplied
where they specify the same six capacities. Eligibility/resolve redirect budgets
remain independent and valid alongside the operation allowance. Numeric limits on
activation/promotion still create their own existing internal operation.

The evaluated governance handle privately retains its exact operation allowance.
Composed eligibility and capture binding reject prior unbudgeted or different-
operation governance. The host additionally binds the actual loaded model/context
to the operation; standalone already-decoded APIs do not establish loader/source
qualification. Returned registry views cannot mutate the private evaluation.

`validateAssignments` forwards the same handle through its existing normalized
options. If it converts a budget error into a diagnostic, the allowance remains
failed and the next phase must not continue. `validateAssignmentChange` does not
yet accept this option; its operation-composed mode is not released by this patch.

## Eligibility debit units

For authentic private evaluated governance, eligibility uses the admitted immutable
capture. It does not invent a whole-registry guard for each assignment:

- `subject-eligibility`: one validation step at the operation entry.
- `resolution-subject`: one Subject visit and validation step for each actual
  original/redirect target lookup and inspected split-successor existence check.
  Both actual `resolveSubject` calls in eligibility count independently.
- `eligibility-subject`: one Subject visit and validation step per actual
  verification-row lookup, after existing lifecycle resolution succeeds.
- `eligibility-event`: one validation step per actual event-verification check.
  Short-circuiting stops further work/debits; repeated calls repeat actual debits.
- `inspect-registry`: caller-owned structural inspection still guards the full
  document and charges its Subject rows before resolution. Structural primitives
  alone cannot certify actual loading, capture ownership, or governance admission.

A normal active subject with one verified event therefore visits three Subject
rows per eligibility call: two resolutions and one verification lookup. Redirect
chains and additional verified events add their real work.
Registry-view copies guard the full private document and charge its subject count
before reindexing (`governed-registry-view`); descriptor copies guard their actual
event descriptor before copying (`governed-descriptor`). Repeated getter calls repeat
these real debits. Retired-subject resolution during composed evaluation also passes
the same allowance to the original resolution primitive. Existing per-query
redirect/traversal limits retain their own units.

## Boundaries and qualification provenance

This patch preserves the numeric operational profile. Unique corpus counts are
not repeated Subject/history visit allowances. Native parsing, allocation, hashing
CPU, serialization memory, Node startup, source input reads, and app output require
their separately named host controls or measurements. A successful owner unit test
does not qualify a whole workload.

During implementation an uncommitted instrumentation proposal guarded the entire
private registry on every eligibility call. Owners rejected that added work before
qualification in favor of the actual touched-work units above. No timed samples or
completed workload baseline existed for that proposal. Its former block is recorded
in task tool output; there was no atomic pre-refinement file snapshot, and none is
claimed retroactively. Existing runtime/performance baselines remain unchanged.

## Local historical graph proof reuse

The measured pre-optimization host `130156f` refused the unchanged joint and
near-byte fixtures during `history-forest`, before query eligibility: 32,628 Subject
visits used, 256 requested, 140 remaining under the unchanged 32,768 capacity.
This is actual observed work, distinct from the earlier three-visits-per-assignment
arithmetic. P10 retains the original runtime, fixtures and raw API/CLI evidence.

Each `checkHistory` walk now retains only a local successful graph-validity proof.
Every row still validates metadata, lifecycle/ID shape, warrant, continuity and
reviewed digest; actions and final current-state correspondence are unchanged.
If no vertex is added and every changed row has its exact previous parent and full
ordered authored association array, the already-validated topology remains valid.
The per-row metadata checks cover the other index constraints; labels and aliases
have no global uniqueness constraint. No old forest index or metadata object is
reused as current data.

Each actual dependency comparison charges one `validationSteps` unit in
`history-topology-comparison`. This unit is one participant's prior-parent and
complete-related comparison, not an edge/byte/CPU measurement. Comparison stops
once the atomic event is known to need a rebuild. Initial history and every new
vertex or topology difference still run the full atomic forest check and retain
its existing Subject and validation-step debits. Skipped rebuilds do no indexing
work and incur no fabricated forest visits. A failed check never establishes proof,
and another invocation starts fresh. No cap or existing counter unit changes.

This optimization does not establish that the operational profile fits. P10 must
rerun the exact preserved joint fixtures against a reviewed committed runtime;
the later eligibility lookup optimization remains separate and unimplemented.

## Incremental atomic history topology

The metadata-only optimization above is retained as historical evidence for
`1aafd84`. Its remaining full rebuilds still exhausted the fixed joint profile.
The current implementation validates changed topology incrementally after one
successful full reference check. It seeds local parent and undirected-pair-owner
maps, charging that additional pass; even metadata-only histories therefore pay
the seed cost. This local state cannot be supplied by callers or reused across
history checks. Every row still receives the original metadata, identity/lifecycle,
continuity, warrant, digest, action and final-state checks.

Each event stages all changed parent declarations against the final vertex set.
An explicit undefined parent removes the previous edge. Only new or replaced
parent edges can introduce a cycle into the proven acyclic graph; their chains
are checked against the final overlay, with successful chain proofs cached only
for that event. New vertices are visible to every participant independent of row
order. Vertices are never removed by this history model; lifecycle changes retain
graph membership.

For associations, all old pairs owned by changed participants are removed before
any new declarations are inserted. New declarations use the same internal shape,
self/endpoint predicates and canonical pair keys as the global indexer. Duplicate
pairs, reciprocal declarations and conflicts with unchanged owners refuse. The
full ordered authored array is compared, so reordering still causes a check.
Parent and association predicates live in the small internal
`subject-graph-rules.js`; no new public graph authority handle exists.

An incremental structural rejection runs the existing full indexer to retain its
established diagnostics and charges that real fallback work. A budget exception
immediately propagates its first latch and never requests fallback. If the full
reference accepts a graph rejected by the incremental checker, a TypeError exposes
the implementation disagreement. No partial graph is reusable after failure.

Additional charged units are explicit:

| Phase | subjects | validationSteps | Unit |
| --- | ---: | ---: | --- |
| history-topology-seed | 1 | 1 | One initially validated vertex inspected to seed graph state |
| history-association-seed | 0 | 1 | One proven association inserted into the seed map |
| history-topology-comparison | 0 | 1 | One participant's previous parent/full-related comparison |
| history-topology-stage | 0 | 1 | One changed participant staged |
| history-parent-edge | 0 | 1 | One changed parent declaration checked |
| history-topology-endpoint | 1 | 1 | One target checked in the final vertex set |
| history-cycle-start | 0 | 1 | One changed-parent chain considered, including a memo hit |
| history-cycle-visit | 1 | 1 | One effective parent lookup |
| history-cycle-proof | 0 | 1 | One completed chain node marked safe for this event |
| history-association-remove | 0 | 1 | One old owned pair removed |
| history-association-add | 0 | 1 | One new declaration checked/inserted; target lookup is separate |
| history-parent-commit | 0 | 1 | One parent replacement or removal committed |

Existing row metadata/history and full-reference debits keep their meanings.
Comparisons now inspect every participant to identify all changed declarations,
including after an earlier participant changed topology. These are logical units,
not CPU, allocation, string-byte or individual map-instruction measurements.
Debits precede work; on failure, a successfully admitted first counter may remain
charged when a second counter refuses before the work completes. This is also
true of the existing full-reference debit order. Usage must not be relabeled as
completed work after a refusal.

A completed development fixture with 32 Subjects and 12 local reparent events uses
144 Subject debits: 32 metadata + 32 initial full-reference + 32 seed, then 12 times
(one metadata + one endpoint + two chain visits). The previous full-rebuild version
refused its 160-visit allowance. This does not establish fixed-profile support:
P10 must rerun the preserved joint fixtures against the final committed runtime.
No capacity, fixture, or eligibility lookup optimization is included here.

## Call-local historical authorizer resolution

Each governance evaluation and capture-binding invocation creates its own private
authorizer resolver over one actual identity index and selected allowance. A
successful loaded result is a detached copy from the index's private capture;
the resolver retains that copy and its current record digest only for this call.
The memo is neither caller-supplied nor returned in a governance handle. Fresh
invocations, different indexes and different allowances cannot reuse it.

Every lookup asserts the allowance remains active and charges one validation
step before work: `historical-authorizer-lookup` during evaluation, or
`binding-index-authorizer-lookup` during binding. This is a logical lookup unit,
including exact reference admission and memo lookup, not an individual map
instruction or CPU-time measurement. Only exact namespace/kind/id data-property
references can hit. Malformed references follow ordinary resolution, and only
loaded successes are retained; failed, missing, ambiguous and retired outcomes
never establish reusable proof. Exhaustion stays latched even on a would-be hit.

A miss calls the identity resolver, which now performs one complete result walk
with strict authored descendants, then a detached copy (see below). A hit performs
neither that walk nor the copy and reuses the prior digest, so it incurs no
fabricated document visits. Direct identity-resolver calls still perform their
own actual walk every time; they do not use the call-local governance memo.

Every event still checks its own historical evidence, assessment and expected
status/digest. Binding still guards and hashes the actual mutable model-side
authorizer on every event and compares both it and the index-side digest against
that event's expected descriptor. A repeated reference never caches approval or
a successful binding verdict. Replacing the model's identity index during binding
refuses rather than borrowing an earlier lookup from the original index.
Parsed-evidence reuse remains unimplemented. Initial corpus admission now uses
the private loader composition described below; later public admission remains full.

At Stage A release `221c769`, the focused four-event regression enlarged only the
current Decision title by 4,096 UTF-16 units. Evaluation's added document debit
fell from 32,768 to 8,192; binding's fell from 49,152 to 24,576 because all four
model-side visits remained. These are retained historical unit-test deltas; the
single-result walk below further changes the current first-miss accounting.
The preserved joint fixtures must be measured separately against the reviewed
immutable release; no profile or fixture change accompanies this optimization.

## Single-pass record result admission

`guardCapturedRecordResult(result, documentBudget, {phase})` is a neutral resource
and JSON-shape guard, not identity resolution or evidence approval. It uses the
same private iterative visitor and authentic allowance as `guardCapturedDocument`;
the ordinary guard's API and policy are unchanged. No callback, exemption map or
caller proof selects the policy.

An entry-bearing result requires own enumerable data slots for `entry` and
`entry.record`. Missing/hidden/accessor slots and null, nonobject or array entries
refuse without executing property getters. Undefined authored records refuse.
The wrapper's data fields allow undefined bookkeeping, but the exact
`root.entry.record` occurrence and every descendant are strict finite JSON data.
Results with no entry slot stay strict. This supports both loaded and retired
identity results without changing their status or approval meaning.

The visitor follows the actual tree once. Strictness propagates by occurrence
path, so an alias reached outside the record and again within it cannot carry
a permissive exemption into authored data. Every actual key, string and node
occurrence pays its existing debit; ancestor cycles still refuse and aliases are
not globally deduplicated. Prototype, symbol, accessor and array-shape checks
remain in force. There is no projected copy or hidden record pre-pass.

The authentic allowance is checked before constant-size wrapper-slot inspection;
that check admits zero document nodes and does not represent a document visit.
Slot inspection does not enumerate or traverse the record. An already-latched
budget failure precedes malformed-wrapper handling. The traversal then prepays
each actual node/key/string as before. Unsupported wrapper shape can refuse before
traversal debits. Shape errors are not relabeled as budget exhaustion.

Traversal is now wrapper order, instead of strict record first and then wrapper.
Partial counts and which defect or budget boundary appears first can change.
Tests explicitly cover a wrapper prefix exhausting before a later malformed
authored field. No clone begins after failed admission. On success the complete
detached clone remains; its native allocation/CPU is not removed or newly bounded.

The minimal real resolver fixture now costs 10 nodes/111 text units per call,
formerly 12/121. The four-event 4,096-unit title regression now adds 4,096 text
units in evaluation and 20,480 in binding; the four actual mutable model guards
still run. First-miss tests cover loaded and retired records with exact full-result
allowances. No source/capture/corpus capacity or fixture is changed, and none of
these unit deltas qualifies an operational workload. Parsed-evidence and
governed-registry-view reuse remain deferred; initial corpus admission is described below.

Rationale: [single-pass record result proposal](../../decisions/entries/single-pass-record-result-admission.yaml).


## Private initial corpus admission

[The proposed ownership decision](../../decisions/entries/private-initial-corpus-admission.yaml)
limits payload admission reuse to `loadAndAdmitSubjectOperationModel(operation,
kitRoot)` in `subject-operation.js`. This synchronous composition accepts an
actual operation and primitive kit-root string, obtains its authentic frozen
resources and calls the fixed loader. It admits a healthy registry-bearing model
before returning it. Unhealthy or authority-absent models retain the context
factory's existing diagnostics and do not create a completed corpus snapshot.

The actual parser already guards each complete YAML document and normalized
Knowledge body with this same document allowance. The audited loader consumers
read these payloads and construct derived indexes/diagnostics; they do not mutate
or replace the original record/body values or expose them to caller code before
initial admission. This is a trusted-runtime lifetime contract. A future payload
mutation, replacement, external exposure, asynchronous boundary or caller callback
must re-guard changed data or disable the optimization. Wrapper shape alone does
not prove that lifetime. No proof, token, cache, callback or caller-selected mode
survives the composition. Public `admitSubjectOperationCorpus` always visits the
full current entries, even for the same returned model or a fresh operation.

For each initial entry, whole-operation activity is asserted and one logical
`validationSteps` debit at `initial-corpus-wrapper` precedes classification and
construction, including fallback attempts. Only the exact own enumerable data
wrappers `{id,file,record}` and `{identity,id,notation,file,record,body}` on ordinary
or null prototypes qualify. Any unfamiliar key, symbol, hidden/accessor slot or
prototype falls back to the existing full `corpus-entry` guard and its policy.

A recognized wrapper produces a real null-prototype metadata shell in actual key
order. Every key and nonpayload value is retained; only record/body values become
null markers. Its guard, `initial-corpus-entry-metadata`, charges the shell root,
all key text, all metadata values and marker nodes (one node, zero text each).
These are actual shell visits, not claimed visits to omitted payloads. No counter
is discounted or refunded. Both parse and corpus entry policy retain existing
`allowUndefined:true` bookkeeping; this does not replace the separate strict
identity-result authored-record guard.

The existing corpus-record step, original record/body shape checks, assignment
counts, actual UTF-8 body scan, canonical/proposal counts, registry guard,
Subject/assignment history and baseline counts, and hierarchy traversal remain.
The new step/shell traversal changes partial counters and first-failure order.
An exhausted step or guard prevents later work, preserves the first latch and
cannot certify corpus completion or governance/query success. The context factory
still reserves one capture attempt before loading and binds only after governance.

The focused actual-context regression enlarges one Knowledge body by 4,096 text
units: initial loading now charges 4,096 additional document-text units rather
than 8,192 while retaining the full UTF-8 body count. Tests cover every canonical
and proposal kind, grouped YAML aliases, exact shell/marker deltas, one-unit-short
limits, test-only unfamiliar wrapper injection, and public mutation/re-admission.
This is development evidence only. All 24 retained operational refusals, including
the four exit-2 outcomes at `4401ce5`, remain unchanged evidence. No operational
fit, timing result, new capacity, fixture reduction or eligibility change follows.


## Fixed file-query sequencing

The [fixed file-to-query API](ucs-1237-subject-query.md#fixed-file-to-query-api)
keeps the actual model private from file loading through one query. It accepts
only an authentic operation and closed primitive path/options data. Source JSON
reads, document guards, raw transport admission and initial unique corpus checks
retain their original order and actual counters. All governance/model/index
binding, fingerprints, per-record assignment validation and query work remain.

Only within that audited synchronous unchanged/unexposed lifetime, preparation
omits the complete redundant second corpus pass. Consequently no second entry or
registry guard, corpus-record/hierarchy step, assignment/body scan or unique-count
recheck is performed or charged. The existing initial completed corpus snapshot
reflects the actual unique-limit checks; it does not promise subsequent query
completion. There is no refund, fictional debit, public receipt or object-identity
cache. Public exposed-context queries/validation always run full admission.

The new function asserts the operation in finally, so an underlying failure
converted to a domain result still leaves the operation terminal. Existing
one-context-attempt and first-failure rules remain, including failed context
loads. A successful new invocation requires a fresh operation, not a reset.

Results transfer terminally without inventing a deep-copy visit: nested mutable
result data has no retained mutable alias for later internal work; shared P2
Subjects are actually deeply immutable. Native allocation/hash/serialization
exclusions remain. The API does not serialize or admit caller output; the bounded
CLI still performs its whole UTF-8 output check through the same harness.

The actual CLI regression first refused corpus-registry at the old operation
usage minus one actual complete corpus pass; with private sequencing it completes
at that allowance and matches the unbounded result. Tests compare every remaining
host counter, counts/results/nested layouts, sticky one-unit-short capacities,
public mutation guards, input/error order and terminal result isolation. No such
development result qualifies the preserved workloads. All 28 prior operational
refusals remain; the new single-call file profile needs its own frozen named
controller and review before any operational run. Existing two-step bounded
behavior remains separately documented and supported.

## Current-query immutable eligibility reuse

[The eligibility reuse contract](ucs-1235-query-eligibility-reuse.md) documents
private capture-and-operation proof reuse for verified active current-query
Subjects. Each qualified attempt pays `subject-eligibility` and
`current-query-eligibility-lookup`; a miss retains actual resolution/history work,
while a hit omits those visits. All model binding and per-record checks remain.
This changes actual logical work, never refunds earlier debits, and does not
qualify the retained operational workloads.

## Reconsideration history/model accounting

The [reconsideration history/model profile](ucs-1235-subject-reconsideration-creation.md)
shares one authentic allowance across native allocation, original evidence,
both model evaluations and final eligibility. It admits raw capture objects
before verification and reuses those objects when projecting before-history
material; projection grants no fresh capacity. Its allocation subreport counts
admitted ledger populations, while `used` reports the cumulative logical work.

Material rows are admitted before their comparisons; warrant and refusal rows,
history-index construction, evidence matching and parent checks have named
charges. These counters are logical units, not measurements of every JavaScript
loop or native hash operation. Every performed material-union scan charges all
visited history events, including those without reconsideration. The historical
evaluator skips that unused-material membership scan for an empty supplied list;
history validation and unavailable-evidence outcomes still run. Normal empty-list
histories gain no union-scan charge. This change does not qualify an operational
workload or change earlier snapshot-bound measurements.

The [read-only material transport](ucs-1237-reconsideration-consumers.md) reserves
decoded bytes before allocation and reuses each admitted capture object through
context loading and governance. Its bounded raw-list path reserves the logical
row population at `material-context-rows`, then guards Buffer-free metadata at
`material-context-metadata`. Shape/cycle failures use the new material refusal;
budget failures retain the existing sticky operation failure. A failed material
input still consumes the one context-loading attempt. Omitted CLI material flags
add no synthetic transport-document pass; explicitly supplied empty files do.

The [actual-Git owner](ucs-1235-reconsideration-git-core.md) shares one allowance
through owned input admission, its one model invocation, actual evidence
captures, materialized reads and owner census. Intrinsic Buffer length establishes
the byte reservation before its separately charged byte-property walk and copy;
the same owned objects are reused thereafter. Explicit catalog coverage prevents
pending declarations from hiding behind retired resolutions. Already budgeted
resolved entries establish owner agreement without a second occurrence lookup.
Separate closure capacities bound the documented retained proof rows/bytes,
excluding result framing and diagnostics. Existing structural/value/history
validators, native materialization/loading and serialization retain explicit
exclusions. These are logical counters, not an end-to-end CPU or I/O cap.
Owner exact-fit/one-short tests and main's 253-test integration passed; exact
receipts and the independently summed capture/closure basis are in the guide.

Fixed shared capture admission now supplies the core's same raw mechanics and
the [ordinary continuation prerequisite](ucs-1241-assignment-continuation.md).
Its new wire path admits base64 text before a linear canonical-alphabet/padding
check and reserves decoded byte length before one decode. It does not decode
unbounded and then charge a second raw copy. Raw admission retains the original
phases and counters. These internal helpers prove owned-byte admission only;
governance, source membership and eventual publication remain owner checks.

The [prepared reconsideration gate](ucs-1235-reconsideration-gate.md) keeps that
core allowance distinct from two fresh Subject operations, one per actual
context. Before-material projection guards only the new selector path while
sharing the old private selection mechanics and preserving model counters.
Fixed native replay qualification has an additional aggregate reservation:
reserve one query redirect cap before each preparation/row call, never refund,
and report reservations separately from returned usage. Missing usage is not
zero work. The new operation-aware comparator retains attempted/unreported
queries and actual partial results on failure; legacy replay accounting stays
unchanged. Separate reach/tree/recipe/retention capacities retain their scopes,
and the gate claims no combined end-to-end memory, CPU or I/O bound.

## Split foundation accounting

The [single-Subject creation comparator](ucs-1235-subject-creation-allocation.md)
uses the same private native-comparison mechanics with a fixed count of one.
Its sole population limit is `maxLedgerRows`; the complete before/candidate row
sum is admitted atomically before document guards or planning. Successful
admission records `{ledgerRows: beforeRows + candidateRows, subjects: 1}` even if
later verification fails. These are admitted populations, not successful work
or measured slot visits. The shared authentic governance allowance still covers
document guards. The split entrypoint retains its separate minimum of two,
successor limit, field names, diagnostics and accounting contract.

The [split allocation helper](ucs-1235-subject-split-design.md#implemented-history-and-allocation-foundations)
adds per-invocation ledger/successor population admission before one fixed native
planner comparison. It reuses the authentic shared governance document allowance;
its admitted counts are not cumulative internal visits or measured slot probes.
History pair binding, successor comparisons, historical parent lookups and the
activation-verification dependency charge named validation steps under the same
existing allowance. Parent lookups also charge Subject visits. Exhaustion remains
sticky and never grants a fresh allowance to the dependent event. Existing
activation, merge and retirement accounting retains its contracts.

## Split actual-model composition

`validateSubjectSplitCreation` accepts either standalone numeric limits or one
authentic `operationBudget`, never both. It calls the allocation helper once
before identity hashing/index corroboration, then admits original capture
wrappers through `admitCapture`. Before/candidate evaluation, binding and
eligibility retain that same handle. `used` is cumulative, including earlier
composed work; the helper's ledger/successor populations remain per-invocation.

The wrapper charges operation/document guards, evidence-list/pair inspection and
referenced-authorizer shell visits under named phases. Only the two histories'
Decision references and selected authorizer are visited; unrelated K/O store
presence and unrelated Decision entries are not inspected. Raw capture reuse
preserves wrapper/Buffer/content admission rules and never skips verification.
Historical current-status rules remain distinct from the selected authorizer's
unchanged accepted/addressed requirement.

Allocation admission deliberately precedes evidence admission. A later refusal
can retain a completed allocation observation, but no overall success or
governance handle. Sticky failures prevent subsequent work and a repeated call
cannot replenish the allowance. Fixed private native-depth adapters replace
existing canonical/index calls without extra hashes, guards or refunds. They
do not change public legacy error behavior, arbitrary raw-parser handling or
the existing whole-process exclusions. Exact-fit and one-short tests cover all
six governance capacities and both allocation populations.

## Split row continuation

`validateSubjectSplitAssignmentChange` requires the existing redirect allowance
and the core's authentic operation allowance. Its private shared row path fixes
new-assignment/current semantics; legacy `validateAssignmentChange` options,
results and counters remain unchanged. Every admitted split-row invocation
checks private governance ownership through `assertSubjectGovernanceOperation`
and charges one `validationSteps` under `governance-operation-binding` before
row work. Positive targets retain their actual eligibility visits and redirect
accounting. Empty targets still require the matching active operation.

The assertion neither guards/copies the governance descriptor nor reevaluates
or traverses the registry. Exact-fit/one-short tests exhaust document capacity
at the prior model work and verify that an empty row needs only its one remaining
step. Failure stays sticky, including a retry with no targets. This primitive
does not claim complete actual split scope, preserved files or publication.

## Actual split scope accounting

The split core creates the shared governance allowance and invokes model creation
once. Original evidence, actual Git authority/authorizer/protected-owner captures,
historical source recaptures and materialized correspondence rereads each incur
their actual capture admission. Identical bytes in a newly read buffer do not
reuse an earlier wrapper's debit. A literal byte-total regression covers those
separate populations; it does not infer expected bytes from reported usage.

Authenticated per-side owner-index lookups charge `split-owner-identity-lookup`
and actual guarded record copying. Descendant-to-source walks charge subjects and
validation steps. Closure counts each attached allocation/assessment summary,
assignment expectation and retained/parent witness row plus its canonical bytes
before attachment. Inventory retains its separate phase limits. These counters
do not bound native Git/materialization, loader/parser/serialization CPU or total
process memory. The fixed P8 continuation now refreshes shared final usage
after all continuation and cleanup outcomes. Its actual before-model evaluation
and binding and every row's eligibility use that same allowance; the candidate
handle is reused. P8 separately charges each actual authority recapture and
materialized reread to its assignment capture allowance.

The [outer split gate](ucs-1235-subject-split-gate.md) additionally reserves one
complete eventless two-path proof against the remaining closure rows and bytes
before retaining it. The zero branch performs no positive P8 setup. Both branches
independently reload actual contexts for mandatory impacts; that context work,
binding/hashing and positive event recapture are outside the earlier core counters.
Reach/tree/replay retain their separate counters and explicit phase limits. No
global workload, CPU or process-memory bound is inferred from these reports.
## Continued retirement accounting

The [retirement material profile](lifecycle-material-continuation.md) uses the
existing governance capacities for one raw/wire capture admission and the actual
source, model, internal inventory and assignment-row work. Malformed capacities
or exhausted property work refuse before inspecting capture buffers. Existing
native Git, loading and impact-phase exclusions remain explicit; the new profile
does not claim a whole-process bound. It creates no second Subject operation or
public inventory allowance. Usage is refreshed on all owner exits, including
refusal and cleanup paths.

## Native query output version 2

The [lossless query output contract](ucs-1237-subject-query.md#lossless-output-version-2)
counts the actual serialized assignment-evidence table once plus every emitted
row-local explanation value/container. It preserves the numeric query limit and
all source, capture, corpus, binding, P3/P2 and traversal validation charges.
A prior successful output entry cannot replace a later eligibility check or
redirect allowance. Atomic row/table admission emits no orphan evidence.

This is a versioned output representation change, not a discounted validation
unit or a claim about CPU/allocation work. Equality checks, failed output-size
checks and temporary witness construction are not emitted-node usage. Source
pointers and wrapper metadata remain outside that named counter and inside the
real serialized byte limit. Native CLI whole-output admission is unchanged; the
shared API returns objects, invoke CLI admits its full envelope, and MCP admits
both text and structuredContent copies. No transport capacity is enlarged.

Version-1 receipts remain historical evidence. New evaluator version 2
fingerprints cannot be relabeled as old results. Counts and page truncation
remain separate from explanation completion and operational qualification.
