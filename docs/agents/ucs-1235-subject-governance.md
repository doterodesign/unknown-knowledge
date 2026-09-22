# Subject governance and evidence boundaries

P2 provides structural authority reading, captured lifecycle resolution,
review-evidence checks and the bounded domain operations described below. These
operations do not authenticate a human reviewer or publish an installation.
The separate [metadata publication profile](ucs-1240-subject-metadata-publication.md)
now composes actual Git evidence, unchanged assignments, native reach/tree/query
effects, fresh review and publication for rename/clarify/reparent/relate.
The separate [actual equivalent-merge gate](ucs-1235-equivalent-merge-dto.md)
composes registry, assignment and impact owners over committed trees.
The separate [plain-retirement gate](ucs-1235-plain-retirement-dto.md) checks
exact withdrawals or a proven zero-use branch, preserving reviewed historical
and inherited uses. Its separate [final publication profile](ucs-1240-final-retirement.md)
adds retained review, fresh evidence and the candidate-ref transaction.
Rationale and documentation coverage are indexed in the
[P2 decision audit](ucs-1235-decisions-and-docs.md).

The [split foundations](ucs-1235-subject-split-design.md) add evaluated historical
activation/split pairs, dependent assessment verification, a fixed bounded
allocation comparator, actual-model creation validation and closed split request/
assignment-event metadata. A separate actual Git core now proves mapping and
retention scope from original/candidate snapshots. Request shape alone does not
establish that closure. The [prepared split gate](ucs-1235-subject-split-gate.md)
now composes the fixed P8 preservation, eventless proof and mandatory impacts.
The separate [split review/publication profile](ucs-1240-split-review-publication.md)
verifies actual authority and allocation before fresh owner checks and the
candidate-ref transaction. Ordinary transition validation still refuses new splits.

## Domain entry points

`subjects.js` exports `resolveSubject(registry, id, {policy, budget})`.
Policy defaults to `current`; `historical` returns the original identity in the
supplied capture, without reconstructing a past hierarchy. `equivalent` follows
explicit equivalence redirects. Its optional `budget: {redirects: N}` defaults
to the finite canonical subject count. Results preserve the requested ID and
every visited `{from,to}` edge. Exhaustion returns unresolved `redirect-budget`;
split alternatives remain unresolved. Invalid IDs, unknown targets and cycles
are typed `SubjectError` failures.

`subject-governance.js` exports:

| Function | Contract |
| --- | --- |
| `evaluateSubjectGovernance({registry, identity, identityIndex, decisionCaptures})` | Returns `{ok, governance, diagnostics}`. Requires the actual P1 identity ledger/index and indexed subject document. Invalid evidence/history produces no handle; missing retained bytes yields unavailable verification. |
| `subjectEligibility(handleOrRegistry, id, {purpose, policy, budget})` | Returns `{eligible, resolution, verification, code?}`. `eligible` is true, false, or null for unavailable verification. This value is not query membership. |
| `validateSubjectEligibilityOptions(options)` | Validates explicit purpose and shared lifecycle options without a registry or fabricated ID; returns detached normalized options with default current policy. Empty assignment lists use this same contract. |
| `getGovernedSubjectRegistry(handle)` | Returns a fresh index of the privately captured frozen document. Mutating its Maps cannot change the handle or later accessors. |
| `getSubjectGovernanceDescriptor(handle)` | Returns detached JSON describing registry/identity digests, actual current authorizer record digests and evidence availability. Hash it with shared `canonicalSha256` for query provenance. The descriptor cannot be supplied in place of a handle. |
| `assertSubjectGovernanceOperation(handle, {operationBudget})` | Internal void assertion: authentic active allowance, actual private evaluation, exact operation ownership, then one `governance-operation-binding` step. No model binding, traversal, clone or new authority. Split row continuation uses it even with no target IDs. |
| `validateSubjectTransition({before, candidate, model, identityIndex, decisionCaptures, assessmentCaptures})` | Checks ordinary metadata/refusal changes, append-only history, state continuity, revisions and current authorizers. New activation is forbidden; use the bounded actual-model creation/promotion APIs. Retained assessment pairs preserve historical proof. This operation remains unbounded. No writes occur. |
| `validateSubjectMetadataTransition(input, {operationBudget})` | Fixed internal wrapper for exactly one rename/clarify/reparent/relate event. Uses the authentic allowance and native transition rules; actual sources, full owner preservation and publication belong to the separate metadata profile. |
| `validateSubjectGovernanceCapture(handle, {model})` | Corroborates the real evaluated handle against the complete model registry, ledger, authentic identity index and public authorizer records. Returns `{ok, diagnostics}`; this is consistency, not approval. |

`purpose: inspect` permits a structural registry and reports metadata
inspectability, without an approval claim. `purpose: query` requires a real
evaluated handle and verifies the requested meaning and each redirect
participant. Proposed/suppressed meanings remain ineligible; retired meanings
require an explicit historical/equivalent policy. `purpose: new-assignment`
also requires the original authored ID to be active. Following a redirect does
not authorize authoring its retired predecessor.

An opaque frozen handle exposes only namespace and revision counters. Private
state is owned by the evaluator. A copied handle or caller-authored approval
boolean does not confer eligibility. Canonical subject allocations are checked
by P1's shared ledger validator; this module does not allocate IDs.

## Evidence and history

Domain fields use camelCase; the shipped on-disk adapter maps the agreed
kebab-case schema. Each subject has ordered `changes` event UUIDs. Each event
has `id`, `action`, qualified `decision`, full participant `rows` with
`{id,before,after}`, and `review`. State snapshots omit identity and history
fields. Current metadata must equal the final event state. History is immutable
under captured-before/candidate comparison.

Review contains `reference`, `acceptedStatus`, `decisionCapture`,
`decisionDigest`, and `changeDigest`. The latter is shared canonical SHA256 of
the event excluding its review object. Decision digest covers the parsed
review-time Decision record. Captures are supplied as
`{capture, bytes: Buffer, objectFormat: 'sha1'|'sha256'}`. The shared P7 verifier
checks exact SHA256 and native Git blob hashes; P2 parses those bytes and checks
the selected authorizer's ID, accepted/addressed status, and semantic digest.
This establishes supplied-byte integrity, not Git membership or human identity.

An active state includes `originDecision` and a nonempty
`warrant: {records:[{ref,capture}], sources:[{locator,revision}]}`. Material
locators are retained and bound by the event digest. This slice does not read
or authenticate each warrant's external content.

Historical accepted evidence can survive current Decision archival or
supersession. Missing original evidence is explicitly unavailable, never a
synthetic revocation or verified approval. New events require a current loaded
accepted/addressed Decision, matching current model/index/source digests, and
available retained bytes. Bootstrap authorizers need no subject assignments.

Each effective non-no-op event increments registry revision once. An event
changing one or more parent edges increments hierarchy revision once. Unchanged
carry-forward participants require row reasons. Rename and clarification require
`unchangedMeaning: true` and cannot change fields outside their action scope.

## Remaining ticket scope

The ordinary transition slice supports existing active-subject
rename/clarify/reparent/relate metadata changes. New activation uses the bounded
actual-model creation/promotion APIs below. Historical retirement and
equivalent-merge metadata can be inspected and evaluated. The dedicated read-only
gate supports one equivalent merge across effective canonical K/O/D direct uses,
including grouped O/D files under its explicit protected-file restrictions.
Ordinary transition validation still cannot authorize it. The equivalent-merge
publication profile is separate. Plain retirement now has a dedicated read-only
gate and a separate [final publication profile](ucs-1240-final-retirement.md).
Union and proposal refusal require complete creation/refusal composition.
Other retirement/merge variants retain their documented limits and need explicit
scenario-to-spec adjudication under the [required scope](subject-lifecycle-required-scope.md).
Structural split resolution
returns explicit alternatives, and historical split-event governance is now
implemented. The [actual-model and Git scope boundaries](ucs-1235-subject-split-design.md)
are implemented and now feed the dedicated split assignment/preservation and
impact composition and the [retained split publication profile](ucs-1240-split-review-publication.md).
Suppressed-proposal reconsideration has a separate
[history/model validator](ucs-1235-subject-reconsideration-creation.md);
its [query/intent/view consumers](ucs-1237-reconsideration-consumers.md) receive
retained material. The [retained publication profile](ucs-1240-reconsideration-publication.md)
now provides actual-Git review and fresh candidate-ref publication. The
[material-continuation contract](lifecycle-material-continuation.md) carries
that evidence through retirement, positive-use equivalent merge, split and
K/O/D promotion. The [typed existing-record assignment profile](ucs-1241-typed-assignment-publication.md)
now provides retained and fresh publication for mixed K/O/D selections. The
[zero-use equivalent-merge profile](ucs-1240-equivalent-merge-zero.md) also proves
registry-only changes and publishes without an assignment event. Ordinary fresh
creation, union/broadening and complete proposal refusal/reversal acceptance
remain separate required work. Active-canonical suppression/restoration remains
unsupported and is not required by the audited r3 clauses; the linked scope
clarification explicitly supersedes the team's earlier interpretation.
Captured proposal promotion is implemented below. The optional authority loader,
read-only lookup CLI and narrow proposal suppression checks are implemented below.
These pure checks are not a whole-ticket acceptance claim.

Consumer tests can use `tests/helpers/subject-governance-fixture.js`, which
constructs literal source bytes and invokes the actual P1 capture builder.
It does not emulate a loader or inject an approval flag.

## Optional authority reader

`subject-registry-reader.js` exports
`readSubjectRegistry({kitDir, identity})`, returning
`{ok, present, subjectRegistry, diagnostics}`. `kitDir` is the already selected
kit root, not a repository-discovery hint. P1 owns the `loadStores` integration;
P6 may use this same reader for structural tree operations.

Only `subjects/registry.yaml` is read. Missing file/directory returns
`ok: true, present: false, subjectRegistry: undefined` without diagnostics.
An empty valid authority is present. Other files, including all of
`subjects/derived`, are ignored. A symbolic-link authority or subjects directory
is refused. Expected read failures and malformed YAML become error diagnostics;
invalid API arguments, missing kit roots and unexpected programmer exceptions
propagate to the engine failure boundary.

The shipped `subject-registry.schema.json` requires exact schema version 1,
closed fields and the supported schema keyword subset. Explicit key mapping
converts kebab-case source fields into the camelCase domain document. The real
subject index checks identities/forest/associations, and the shared metadata validator checks
ledger consistency, history linkage, immutable reviewed digests and active-state
warrant structure. Structural validation does not retrieve Decision source bytes
or evaluate effective approval. Unsupported lifecycle action policy is reserved
for the effective evaluator and publication gate.

`SUBJECT_REGISTRY_DIAGNOSTIC_CODES` lists the closed code set for P1's normal
loader diagnostic integration. The reader leaves record-assignment intent to
explicit query/publication consumers; it cannot infer a new assignment from a
single snapshot or convert retired references into empty assignments.

## Related subject inspection

Each undirected association has exactly one authored
`{type: 'association', target: 'S-000001'}` declaration. The sorted endpoint pair
defines uniqueness; either endpoint can author it. Targets must exist as local
canonical subjects. Self-links, dangling targets, unsupported fields/types and
duplicate declarations (including reciprocal rows) refuse indexing. Current and
every complete reconstructed historical event graph use the same validation.
Captured authored arrays and history digests remain unchanged.

`subjectRelated(registry, id, {budget: {edges: N}})` accepts an exact local S ID or
qualified `proposal:subject:` key. It returns `status`, `requested`, `ids`,
`neighbors`, and `used: {edges}`. Requested and neighbor identities expose `id`,
`identityKind: 'canonical'|'proposal'`, and `declaredStatus`. Each neighbor has a
`witness: {type, source, target, from, to, derivedInverse}`: source/target identify
the single authored declaration; from/to identify the inspection direction.
Neighbor IDs are deterministically sorted. Returned witnesses are detached.

The explicit safe nonnegative integer budget charges one emitted adjacency
visit. Exhaustion returns the sorted prefix with `status: 'incomplete'` and
`reason: 'edge-budget'`; zero with neighbors is incomplete, while zero with no
neighbors is complete. Invalid registry, selector, options or budgets throw typed
`SubjectError` errors instead of an empty result. No implicit budget is supplied.

Proposed/suppressed sources may appear through derived inverses with their exact
proposal identity and declared status. Retired targets remain inspectable without
redirect substitution. Associations imply no transitivity, ancestry, assignments,
eligibility or trust. This helper is subject navigation, not record-link query
expansion. Its adjacency allowance does not bound index construction, historical
validation, raw input parsing, total CPU or serialized output bytes.

## Read-only lookup command

`subject.js lookup <label...> [--locale value] [--context value] [--root repo] [--json]`
uses shared argument/root handling and the actual `loadStores` capture. It
requires a healthy model and a present registry, then returns the unchanged
`lookupSubjects` result. Every homonym and declared status remains inspectable;
no Decision evidence is loaded and no eligibility is granted. Empty matches
succeed with exit 0; usage, unavailable authority and invalid model refuse with
exit 2 and no result stdout. The dynamic-only shim also maps module failures to 2.

The JSON context names the captured namespace, identity format, subject schema,
normalizer and both registry revisions. `registryDigest` uses shared
`canonicalSha256` over the complete registry document, including history. Its
scope is registry-only, not full-installation or Decision-byte certification;
`captured-model` does not promise an atomic filesystem snapshot.

## Reviewed proposal suppression

A `suppress` event may retain one or several existing subject proposals as
`suppressed`. Every row must start from the exact captured `proposed` state and
preserve its entire metadata, changing only status and adding
`refusal: {decision: event.decision, reason: event.reason}`. The originating
Decision stays unchanged. A nonblank reason, current accepted/addressed Decision,
review digest and verified captured Decision bytes are required for publication.
The proposal key and refusal stay inspectable; no canonical allocation, runtime
alias, redirect or effective assignment/query eligibility is created.

An unreviewed draft may have `changes: []`, so its first suppression history row
retains a nonnull proposed baseline. This exception is restricted to exact
subject proposal keys. Standalone historical inspection retains a declared
baseline; it does not authenticate possession of the original proposal source.
New suppression transitions require `before` to equal the complete
`model.subjectRegistry.document` capture, require every nonnull first participant
to exist in that prior capture, and preserve all existing history and nonparticipants.
The candidate retains the proposal with its new event reference. One event
increments the registry revision once; preserved parents leave the hierarchy
revision unchanged. Canonical carry-forward rows are not accepted in suppression.

The fixed [proposal-suppression publication profile](ucs-1240-subject-proposal-suppression-publication.md)
now composes this native before-model rule with actual Git source capture,
registry-only preservation, unchanged canonical query memberships, retained
validation and fresh review/publication. Its
`validateSubjectProposalSuppressionTransition` wrapper continues one authentic
allowance into candidate history evaluation; it adds no new action/history rules.

Proposal promotion uses its separate bounded API below. The separate
[reconsideration validator](ucs-1235-subject-reconsideration-creation.md)
consumes an exact suppressed proposal through a fresh activation. Active/canonical
suppression, canonical restoration and automatic similarity-based refusal
adjudication remain unsupported. A refusal does not prove
that another homonymous proposal has the same meaning. Full Gate B remains open.

## Candidate governance binding

`validateSubjectGovernanceCapture(handle, {model})` authenticates the handle using
P2's private capture and the identity index using P1's actual
`getIdentityIndexDescriptor`, including when history is empty. It requires a
healthy model, the exact complete captured registry document, coherent namespace
and ledger digest, and each current authorizer's record to agree across the
mutable public Decision map, the private identity index and the evaluated handle.
When history has authorizers, the captured model must also declare the Decisions
store present. An empty history introduces no authorizer-store dependency.
Matching revisions alone, copied descriptors and stale public/private authorizer
captures cannot substitute for these checks.

The only anticipated diagnostic codes are `governance-unavailable` for a missing
or forged evaluated handle and `input-mismatch` for incoherent/unavailable candidate
captures. Unexpected errors propagate. The result contains no replacement handle
and grants no eligibility: unavailable source evidence remains unavailable, and
matching archived-authorizer captures preserve historical semantics. Publication
assembly must call binding and corroborate row ownership even when a record has
absent or empty assignments; a row-local eligibility helper is not that boundary.

## Shared Decision evidence

`decision-evidence.js` exports
`verifyDecisionEvidence({decision, acceptedStatus, decisionDigest, decisionCapture, captures})`.
The result is `{status: 'verified'|'unavailable'|'invalid', diagnostics}`. Verified
and unavailable have empty diagnostics. Invalid input retains typed codes:
`invalid-authorizer`, `invalid-review`, `invalid-evidence`, `ambiguous-evidence`,
`evidence-digest-mismatch`, and `invalid-authorizer-evidence`. Missing matching
source bytes are unavailable; corrupted bytes, invalid UTF-8/YAML, wrong captured
record/status/digest and duplicate evidence are invalid. Unexpected defects throw.

This is the existing P2 captured-source check extracted for P8's actual assignment
event consumer. It verifies raw bytes through P7 and the exact accepted/addressed
Decision record. It does not validate the outer review reference, event change
digest, current authorizer, scope, Knowledge human gate or publication. Each domain
owns those checks. Optional internal budget context guards parsed documents for
bounded operations; it is not part of an authored authorization DTO.

## Bounded fresh activation and bootstrap

The separate [ordinary creation publication profile](ucs-1240-subject-creation.md)
composes one fresh activation or unrefused-proposal promotion over actual Git
sources, the native one-Subject allocation, eventless owner preservation and
fresh retained review. Its scoped verification is recorded there. The legacy
model APIs below keep their standalone behavior and do not become publication
authority by themselves.

`validateSubjectActivation({beforeModel, candidateModel, beforeCaptures,
decisionCaptures, assessmentCaptures = [], budget})` shares the promotion preflight,
six explicit limits, raw-evidence verification and final actual-model binding.
Its result uses the same `{ok, governance, diagnostics, publicationReady, used,
assessment}` envelope; assessment is present on success. Publication readiness is
always false. No filesystem writes or human-approval authentication occur.

Exactly one appended `activate` event creates one or more fresh canonical
null-before rows with explicit complete-scope `refusalAssessment`. An own `promotes`
property is forbidden, even when null; promotion uses the separate strict API.
All old subjects and history remain unchanged. Every prior subject allocation,
including allocated-but-unloaded, retired and cancelled IDs, excludes reuse.
The complete atomic forest can reference other newly activated rows or existing
active canonical parents. This checks parent status, not parent approval evidence.

Genuine bootstrap requires a **present actual empty registry** with zero revisions,
empty history and a coherent before ledger containing no subject allocations.
Prepare and capture that empty authority before allocating the candidate IDs.
An absent registry is unavailable, never an invented empty capture. The P1 caller
separately verifies committed source/tree membership, ledger continuity and
publication; P2 does not assert those properties from raw hashes alone.

The general detached `validateSubjectTransition` refuses every new activation,
including bootstrap. Existing unassessed historical activations remain inspectable
and retain their original evidence semantics; historical evaluation is not a new
activation publication gate. Existing baseline fixture results keep their original
runtime provenance and do not become evidence that this new gate passed.

Creation and promotion add the current `beforeCaptures` pair exactly once to the
caller-supplied historical `assessmentCaptures`, which must be a dense array of
pair objects. The new event is verified
against the designated `beforeCaptures` only; a historical pair cannot substitute.
Historical replay uses the combined collection. All supplied current/historical
raw bytes share the cumulative byte limit before decoding. Every supplied pair
must have intact raw evidence; duplicate complete registry locators refuse even
when unreferenced. Distinct historical blobs at the same path are allowed. No
silent deduplication or parsing of unused graphs occurs. Omitted historical pairs
remain visibly unavailable in the governance descriptor and dependent eligibility.

Ordinary rename/clarify/reparent/relate transitions also accept historical
`assessmentCaptures` and forward them to evaluation. That existing general API
remains unbounded; it does not acquire the six-limit guarantee by forwarding proof.

## Bounded captured proposal promotion

`validateSubjectPromotion({beforeModel, candidateModel, beforeCaptures,
decisionCaptures, assessmentCaptures = [], budget})` checks one new canonical activation consuming one
existing unrefused proposal. Both models must be healthy independently loaded
captures with authentic identity indexes. `beforeCaptures` contains `registry`
and `identity`, each `{capture, bytes: Buffer, objectFormat}`. Exact raw bytes
are verified before strict UTF-8 decoding. The shared `parseSubjectRegistry`
parser follows the same schema, field mapping, index and history checks as the
disk reader. Complete parsed registry and ledger documents must match the before
model. Claimed source commit/tree strings do not establish repository membership.

The new event retains `promotes: {key, before}` with the complete prior proposal,
including its ID and empty changes list. Exactly one canonical null-before row
becomes active. The proposal disappears once; existing subjects, history and
refusals remain unchanged. A canonical ID already occupied in the before ledger
is refused. An effective child requires an active canonical parent. P1 still owns
fresh-allocation planning, complete ledger continuity, pinned tree membership and
publication assembly. Every result has `publicationReady: false`.

The separate [single-Subject allocation comparator](ucs-1235-subject-creation-allocation.md)
proves the exact native one-ID ledger plan. It does not itself upgrade this
promotion validator to an actual Git or publication gate. The
[reconsideration Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml)
defines the separate [fixed model profile](ucs-1235-subject-reconsideration-creation.md)
consuming a retained suppressed proposal with prior-refusal and captured-material
review. Ordinary promotion still requires
an unrefused proposal; allocation verification alone does not enable reversal.
The [actual-Git owner](ucs-1235-reconsideration-git-core.md)
adds supplied-capture provenance and complete stored-owner
preservation. Its file-level material proof does not judge semantic support.

The registry schema admits `reconsideration` with a reviewed `reason`, `records`
and `sources`, and a separate `reconsideration-assessment` version 1. Each
record item carries `{ref, capture}`; each source item carries
`{locator, revision, capture}`. Both lists are required. These closed shapes
reject unknown fields and missing captures. Ordinary `refusal-assessment`
continues to allow only `distinct-meaning`; the new assessment additionally
admits `same-meaning-reconsidered`. The reader maps the new field to
`reconsiderationAssessment` in the domain model. Schema admission does not prove
nonempty combined material, correct action, exclusive assessment selection,
the exact prior refusal, approval or source integrity; the fixed governance
profile establishes those conditions against supplied captured evidence. It does
not authenticate reviewers or establish actual repository membership.

The event's `refusalAssessment` has version 1, `coverage: 'complete-registry'`,
`attestation: 'all-current-suppressed-meanings-assessed'`, and scope containing
`beforeRegistry: {capture, documentDigest}` plus `identityDigest`. Its
`relevantRefusals` list contains only reviewed relevant rows, each
`{subject, refusal, disposition: 'distinct-meaning', reason}`. Rows must name a
unique current suppressed identity and its exact current suppression event.
The existing outer review change digest binds this entire assessment and the
promotion; no self-referential digest is embedded in the assessment.

The validator proves captured scope and listed-row validity. Semantic completeness
is an explicit reviewed attestation, including when a nonempty refusal universe
has an empty relevance list. It does not prove human attention or infer semantic
irrelevance. Compact rows reduce authored assessment repetition; changing full
registry snapshots can still retain O(N × R) bytes. There is no total storage,
runtime or human-work reduction claim. Same-meaning reconsideration uses its
separate event and validator; it is not an ordinary promotion disposition.

Historical evaluation accepts `assessmentCaptures`, a list of the same retained
registry/ledger pairs. Missing either raw document produces unavailable assessment
proof and unavailable eligibility, not fabricated approval or automatic revocation.
For promotion, available proof must also retain the exact consumed proposal;
fresh creation instead checks the captured scope and allocation freshness.
Normal transition validation refuses every new activation event; callers must use
the bounded creation or promotion operation.

All six budget fields are required safe nonnegative integers with no unknown
keys or defaults: `maxCaptureBytes`, `maxDocumentNodes`, `maxDocumentTextUnits`,
`maxSubjects`, `maxHistoryRows`, and `maxValidationSteps`. One operation shares
all counters across every actual validation pass. Capture bytes are summed before
decoding, including duplicates. Expanded document values and own keys are visited
iteratively; aliases pay per occurrence and cycles refuse. Text units mean UTF-16
code units. Subject counts include entries passed to index/metadata validation;
history rows count actual repeated replay. Logical validation steps name actual
history, topology, consistency, refusal and lookup work. Private reuse may remove
work only under the documented ownership proof; see the current
[operation accounting contract](ucs-1235-operation-budget.md) for exact units.
These are workload counters, not CPU instructions.

Results report actual usage plus `relevantRefusalRows`; budget refusals include the
counter and phase and no governance handle. Debits happen before work using
remaining-limit comparisons. Native YAML parser allocation and CPU are bounded
only indirectly by input bytes; logical visits do not meter parser internals or
promise latency. Full publication and live installation activation remain separate.

The identity-neutral `document-budget.js` owns an opaque authenticated document
handle. P2 uses one such handle throughout the operation, including P1's optional
bounded `resolveRecord` path. That path now guards the full result once, keeping
the actual private `entry.record` descendants strict while allowing undefined
loader bookkeeping outside them, immediately before copying. Every actual
occurrence in that single walk is charged.
The wrapper allowance never permits undefined authored record data. Dense arrays
are required; extra enumerable array properties, sparse arrays, symbol properties
and accessors are rejected without invoking source iterators or getters.

Already completed loader/index construction is outside this operation's counters.
The operation meters its own subsequent guarded private copies. Parsing, native
enumeration, forest sorting and hashing are not CPU-step measurements. The logical
budgets do not promise maximum process memory, native stack depth or latency.

Bounded current-query eligibility also supports
[private immutable proof reuse](ucs-1235-query-eligibility-reuse.md) within the
exact governance capture and authentic operation. Every query model/authorizer
binding and every record assignment check remains fresh; only completed verified
same-ID active Subject resolution/history work can be reused. The owner contract
defines miss/hit steps, exclusions, result ownership and sticky failure behavior.
