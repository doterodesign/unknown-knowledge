# Typed record promotion: Knowledge, Ontology and Decisions

Status: **Homogeneous K/O/D gates and separate retained publication implemented; broader lifecycle and acceptance work remains**.
Main authorized the O-first, K-next, classified-D sequence as required slices of
complete K/O/D coverage. Exact P1/P7 wire agreement permits implementation without
another main approval round. `runPreparedRecordPromotionGate` now implements
Ontology proposal-to-active, Knowledge proposal-to-verified and Decision
proposal-to-accepted promotion,
including classified assignments and appending genesis to existing assignment
history. Knowledge uses actual selected leaf evidence and injected-date checks. The
implemented [Decision-only gate](ucs-1241-decision-promotion-gate.md) and P7's
ordinary-promotion v1 profile retain their existing scope. The typed Decision
kind adds classified births and existing history under an explicit v3 policy.
Its source must be `proposed`, its target `accepted`, and selected-record
preflight is explicitly inapplicable; actual creation and governance checks
remain mandatory.

Rationale is recorded as proposed Decision
`proposal:decision:ac919c9f-8879-422b-9dce-8b3e04324712` in
[the decision file](../../decisions/entries/ucs-1241-typed-promotion-design.yaml).
The gate is an internal library operation and always returns
`publicationReady: false`. It does not provide a public CLI/MCP operation or final
publication authority, and it does not complete the broader acceptance scope.

## Owner seams

| Owner | Bounded responsibility |
| --- | --- |
| P1 | Released fixed `planCapturedRecordPromotion({version:1,kind,repoRoot,source,publication,selected,limits})` for K/O in `cf97505`; preserve the existing Decision planner contract through a fixed wrapper. Return the existing actual change-buffer result. |
| P8 | Implemented `runPreparedRecordPromotionGate` for K/O/D: derive actual capabilities, invoke P1, verify identity/bytes/history, run P3, kind-specific selected preflight and the fixed typed-current impact recipe. Its result stays read-only. |
| P2/P3 | Use actual governance evidence and existing strict new-assignment validation; no assignment API change. No registry lifecycle change belongs to promotion. |
| P4/P6 | Reuse actual query validation/execution and generic candidate deltas, reach and generated tree. The new operation recipe belongs to P8; it does not widen the legacy Knowledge or equivalent-merge recipe. |
| P7 | Implemented the distinct [K/O/D publication profile](ucs-1240-final-record-promotion.md): exact input/result, runtime capability, review and fresh final CAS under the explicit v3 policy. |

P1/P3/P4/P6 have confirmed these conceptual seams in owner coordination; P7
requires the distinct operation and exact retained digest binding. Main authorized
implementation after exact peer acknowledgment, including P7's input/result/policy
agreement. The current P7 Decisions-only profile stays
separate. This document itself is neither runtime approval nor publication.

## Closed input and digest

The current v3 policy accepts homogeneous Knowledge, Ontology or Decision rows.
Targets are exactly `verified`, `active` and `accepted`, respectively. The example
below is an Ontology input; change the kind, all ref kinds/IDs and target together
for K or D. Mixed kinds refuse. The input and `impact.version` remain version 1;
the required policy is `typed-record-promotion-v3`. The typed owner report is
version 2 when material evidence is omitted because its preflight status contract includes the
exact Decision-only inapplicability branch. Any added accepted kind requires fresh runtime and
policy review, with policy version disposition agreed with P7.

An own `evidence.materialCaptures`, including `[]`, selects the
[retained-material continuation](ucs-1241-typed-promotion-material.md) and outer
report version 3. It reuses the same input wire and native policy, with one owned
capture admission and governance allowance carried through actual genesis and
fresh publication checks. Nonempty material requires actual Subject authority.

```js
{
  version: 1, kind: 'ontology', repoRoot,
  before: { commit, tree, kitPath }, candidate: { commit, tree, kitPath },
  publication: { id, review },
  promotion: { version: 1, rows: [{
    proposalRef, canonicalRef, targetLifecycle: 'active', beforeCapture
  }] },
  eventId, reviewNote: { date, author, skill }, today,
  evidence: { decisionCaptures, assessmentCaptures },
  limits: {
    promotion: { maxFiles, maxFileBytes, maxSourceBytes, maxPromotions },
    assignments: { maxRecords, maxCaptureBytes, maxRedirects },
    governance: { maxCaptureBytes, maxDocumentNodes, maxDocumentTextUnits,
      maxSubjects, maxHistoryRows, maxValidationSteps },
    reach: { maxHierarchyNodes, maxHierarchyEdges, maxRecords },
    views: { version: 1, maxViews },
    tree: { budget: { nodes, edges, rows }, maxBytes },
    replays: { version: 1, maxSubjects, maxEligibilityRedirects,
      maxCases, maxInventoryBytes },
    query: { version: 1, maxAstNodes, maxAstDepth, maxHierarchyNodes,
      maxHierarchyEdges, maxRedirects, maxRecords, maxPredicateSteps,
      maxResultsPerStore, maxExplanationNodes }
  },
  impact: { version: 1, policy: 'typed-record-promotion-v3',
    routes: { kind: 'runtime-capability' } }
}
```

Use existing typed refs, source locators, review note and capture transport;
`today` is an explicit valid calendar date, including for the O-first wire. Admit
closed data-property objects and dense enumerable arrays, then detach all data
and Buffer bytes before awaiting snapshots. Use each owner's existing numeric
constraints: positive promotion limits and bounded file size, nonnegative other
capacities, and positive query AST minima. No callbacks, caller models, impact
lists, passed reports, invented capabilities or supplied result digest.

The canonical digest preimage is exactly the above object excluding
`repoRoot`. Evidence uses existing `{capture,bytesBase64,objectFormat}` transport,
with exact registry/identity assessment pairs. Preserve array order; use existing
canonical serialization. Explicit `today`, operation kind, complete limits,
publication, both sources and evidence all participate. Malformed admission
retains a null digest. A digest binds input; it does not verify the evidence.

## Actual transformation and capabilities

P1 must corroborate the exact committed source, source proposal capture, per-kind
allocator, matching catalog and requested target. Inspect the actual source
lifecycle scalar: K/O `draft` or `proposed` may enter; a proposal key alone always
means unpublished and cannot prove that its payload is eligible. Missing/custom
status, already-effective proposal payload, deprecated O and canonical draft
activation refuse. Require the scalar to exist rather than insert a default.

Only selected ID/lifecycle scalar spans, matching typed references within the
selected batch and matching catalog entries may change. Old ledger declarations
and nonparticipants remain exact. Any other reference to a consumed proposal
outside the admitted owner/catalog spans refuses. Preserve subjects, citations,
authority, verified date, volatility, provenance, body and sibling bytes. Never
stamp today's date, rewrite evidence or broadly serialize YAML. Knowledge uses
root ID/frontmatter `facets.stage`; Ontology uses entry ID/status.

P8 independently verifies the actual candidate, exact newly allocated canonical
set, original proposal presence and consumption, unique effective target
occurrences, every P1 planned file byte/mode and the full changed-path set. Only
those changes and exact assignment-genesis artifacts are permitted. Existing
authorizer record/provenance must remain exact, including when its file contains
selected siblings; promotion does not inherit merge's whole-authorizer-file ban.

Load the actual present-store union on both sides. Preserve existing stores and
installation path; do not manufacture a complete K/O/D installation. The selected
proposal's store already exists. One-side loss, malformed present stores or newly
introduced unrelated stores refuse.

With a registry on both sides, require identical actual registry bytes/mode,
graph and history, and verify both actual governance bindings against their own
identity models. Fresh allocation for the selected kind is the only ledger change. With a registry
absent on both sides, only actual unknown/known-empty assignments are eligible;
report Subject impacts as capability-inapplicable with evidence of actual absence.
One-side absence or malformed present registry refuses. No synthetic empty
registry, governance, reach or tree is supplied.

## Classification, genesis and authorizer

For every new canonical owner, call the existing P3 seam:

```js
validateAssignmentChange({
  before: null,
  candidate: { ref: actualCanonicalRef, entry: actualCandidateEntry },
  governance: actualCandidateGovernance
}, { purpose: 'new-assignment', budget: { redirects } });
```

Every after SID is newly effective, even if already present verbatim in the
proposal. Retired IDs, including equivalent redirects, refuse. Unknown,
suppressed, proposed, unreviewed, corrupt or stale evidence and any one invalid
member of a multi-ID list block the operation. Proposal source capture never
becomes canonical before capture. Unknown field and `[]` remain distinct; neither
waives allocation, history, actual capture, authorizer or context checks.

Reuse v2 `canonical-creation` metadata: null before state/capture/revision,
created disposition, revision zero and exact candidate assignment state. Append
only the new refs' baselines with `{kind:'creation',event:eventId}` origins.
Preserve the literal ordered old baseline prefix and every old event byte. Each
new ref has exactly one matching birth row and origin; no prior allocation in any
state, previous canonical occurrence, history reset, adoption fallback or extra
event row is allowed. Existing history cannot establish prior-effective retention
for a fresh ID. Detached birth captures describe candidate content; proposal
before captures remain separate.

Retain the common actual existing effective Decision authorizer check and full
Decision tuple. Bind `publication.review` to the actual event's review reference.
Retained human review receipt and actor assertions remain separate. Candidate
event evidence must be recaptured from its actual commit and exposed with its
event ID/digest/capture for P7's final check.

## Selected preflight and explicit Decision inapplicability

Invoke actual `runPreflight(candidateModel, {repoRoot: actualSnapshotRoot,
concepts: exactNewOntologyIds, today, log:false})` for O. Require concepts mode,
trusted store, and exactly the selected IDs with trusted verdicts. Candidate
activation can enable pointer/extractor checks skipped while the source was
draft or proposed; source store health is insufficient.

For K the implemented gate uses `leaves: exactNewKnowledgeIds`, leaves mode, exact
trusted leaf verdict set and an actually performed time check under digest-bound
`today`. Stale, unknown, quarantined, missing or extra verdicts refuse. Do not
substitute store-health-only mode or require the unpublished source to already
have the candidate's trusted verdict. Preserve raw preflight evidence. Source
checks use the actual committed snapshot and existing lexical extractors.

## Fixed typed-current impact recipe

The exact current K/O/D policy digest preimage is:

```js
{
  id: 'typed-record-promotion-v3', version: 3,
  recordKinds: ['ontology', 'knowledge', 'decision'],
  selectedPreflight: { ontology: 'concepts', knowledge: 'leaves',
    decision: 'not-applicable-no-selected-decision-api' },
  subjectAuthority: 'unchanged-or-absent-both',
  absentAuthorityAssignments: ['unknown', 'known-empty'],
  presentAuthorityRequired: ['reach', 'subjectTree', 'representativeReplays'],
  stores: 'actual-present-union-preserved', subjectPolicy: 'current',
  views: ['current', 'all'], expansions: ['direct', 'self-and-descendants'],
  ranking: { profile: 'id-v1' }, possibleMatches: true,
  baseline: ['all', 'none', 'subjects-present', 'not-subjects-present'],
  unary: ['assigned', 'not-assigned'],
  pairs: { selection: 'adjacent-canonical-ids-no-wrap',
    forms: ['and', 'or', 'and-not-right', 'and-not-left'] },
  scope: 'finite-representative-queries-not-exhaustive-use-discovery'
}
```

The fixed implementation hashes this descriptor with existing canonicalSha256.
The current v3 digest is
`a2bca79dff49f861b2632062eb0c977e647854d70348d1dfb9d021ad43ba6965`.
The P7/domain reviewers agreed the v2 change: only the policy identity, version
and admitted kind list advance from historical O-only v1. The input/report shapes
and all other impact rules remain unchanged. The current owner descriptor digest
is `f2f6581541a60cc8ef4085506118e98b5e2eda3e39256e1db6cdaa289affa638`.
That v2 digest remains historical evidence. The subsequently agreed v3 policy
adds Decision admission and the explicit selectedPreflight map above; its owner
report advances to version 2. Older policy/report combinations and runtime
approvals cannot transfer to the current profile.

When Subject authority exists, enumerate original canonical operands from both
actual registries, preserving their full declarations and eligibility outcomes.
Use `subjectPolicy:'current'` on both actual contexts. Canonical S-ID entries with
proposed status are invalid registry data and refuse. Stable suppressed/retired
operands may be excluded only with identical complete original declarations and
outcomes on both sides: `eligible:false`, `verification:'not-required'`, zero
redirects, including exact split alternatives where present. Unknown/null
eligibility, missing proof or budget failures refuse. Operand exclusion never
waives actual record assignment validation.

For each actual store use current/all views, direct/descendant expansion,
`id-v1` ranking and possible matches. Predicates are all, none, subjects-present,
NOT subjects-present; assigned and NOT assigned for every eligible original ID;
and AND, OR, left-AND-NOT-right, right-AND-NOT-left for each adjacent pair in
bytewise ID order. There is no merge participant pair. For m stores, n eligible
IDs and p=max(n-1,0), reserve m*4*(4+2n+4p) cases and twice that many query calls.
Reserve the entire case count and canonical inventory bytes before executing
queries. Never take a fitting prefix. This is finite representative coverage.

Retain raw queries and generic P6 deltas. All-view promotion removes a
proposalRef and adds a canonical ref; current-view promotion adds the canonical
ref because the proposal was excluded before. Candidate identity includes kind,
namespace and record/proposal discriminator; no alias or continuity projection.
Exact deltas require complete evaluations, ranking, pages, explanations and every
requested group. Refused/partial results never become exact empty changes.

Reach remains canonical-only. New-owner before absence requires complete actual
coverage. Unknown old/new assignment states retain raw incompleteness; accept
only after independently proving complete structural owner coverage, exact
unchanged old owners and exact new genesis. Do not relabel semantic unknown as
complete or import merge's whole-file retention policy for selected siblings.
Generate the actual tree pair through P6's fixed whole-registry factory with the
same options and exact two paths. Unchanged registry requires identical actual
artifact bytes; outer identity/input fingerprints may differ.

Create one authentic P2 validation budget from `limits.governance` for explicit
owner governance evaluation across both sides. Impact contexts use current actual
`loadSubjectQueryContext({root,...evidence})` without an operation handle. Its
internal evaluation does not accept that standalone budget; record this separate
work honestly. Do not clone/unbind an operation context or reset an exhausted
allowance. Reach/tree/query/recipe limits retain their existing scopes. No shared
host-operation, complete parser allocation, preflight resource or CPU/memory bound
is claimed. P7 retention byte caps are separate from these domain budgets.

## Result and publication boundary

The result below is the implemented owner wire agreed with P7. All fields are always
present; the shown nulls and not-performed statuses are initial values.

```js
{
  version: 2, kind: 'typed-record-promotion-gate',
  mode: 'read-only-prepared-record-promotion',
  ok: false, publicationReady: false, inputDigest: null,
  inputs: null, recordKind: null,
  capabilities: { before: null, candidate: null },
  checks: {
    admission: { status: 'not-performed' },
    models: { status: 'not-performed' },
    source: { status: 'not-performed' },
    promotion: { status: 'not-performed' },
    governance: { status: 'not-performed' },
    assignments: { status: 'not-performed' },
    preflight: { status: 'not-performed' },
    preservation: { status: 'not-performed' },
    authorizer: { status: 'not-performed' },
    impacts: { status: 'not-performed' }
  },
  promotion: { status: 'not-performed', createdRefs: [], files: [],
    resources: null, diagnostics: [] },
  assignment: null,
  preflight: { status: 'not-performed', recordKind: null, selectedIds: [],
    today: null, result: null },
  sources: { assignmentEvent: null },
  impacts: {
    status: 'not-performed', policy: null, applicability: null,
    required: null, reach: null, subjectTree: null,
    representativeReplays: null, unknownOwners: null,
    routes: { status: 'requires-final-capability',
      scope: 'kit-managed-subject-route-persistence' },
    diagnostics: []
  },
  resources: { limits: null, governance: null },
  diagnostics: []
}
```

`inputs` becomes exactly `{before,candidate}` from admitted input and recordKind
becomes its admitted kind. Each capabilities side becomes the existing five
actual booleans for knowledge, ontology, decisions, subjectRegistry and
assignmentHistory. History presence is observed, not forced absent before.
Each check contains only status, normally `not-performed|failed|passed`; the
Decision preflight exception is defined below. Failures carry
diagnostics separately. The governance check passes only after actual proof,
including corroborated absent-registry applicability where appropriate. It does
not imply a synthetic governance handle or successful Subject report.

Promotion reuses the existing status/files/resources/diagnostics shape; each file
is `{file,before:{mode,capture},after:{mode,capture}}`. Assignment is the original
common P8 report with scope basis `actual-typed-proposal-promotion`. Its
impactPolicy check is not-performed with scope
`typed-promotion-impacts-owned-by-outer-gate`; assignment success remains limited
to assignment obligations. Human approval remains unperformed. No caller can set
this private adapter mode. `sources.assignmentEvent` becomes exactly
`{eventId,eventDigest,eventCapture}` from actual committed candidate bytes; the
raw assignment eventSource hint is separately retained and is not a capture.

For O/K, preflight status is `not-performed|failed|passed`; selectedIds preserves
promotion row order. Result is the exact raw `{payload,exitCode}` from runPreflight.
O uses concepts and K uses leaves. After actual D creation checks, derive exactly:

```js
checks.preflight = { status: 'not-applicable' };
preflight = {
  status: 'not-applicable', recordKind: 'decision',
  selectedIds: /* exact promoted D IDs, in promotion-row order */,
  today: null, result: null
};
```

The D IDs identify the promotion selection, not executed preflight queries.
Their order is bound to the original admitted input. The fixed predicate requires
that independently supplied selection and corroborates nonempty, unique complete
`{namespace, kind, id}` membership against the planner's created refs. The planner
retains its own proposal-key sort order. Missing selection or report-only order
changes refuse; a legitimately reordered input remains valid.
Input `today` remains required and digest-bound, but the D preflight report carries
no evaluation date or invented verdict. The shared fixed policy predicate permits
only this exact D tuple; every other required check must pass. O/K cannot use
this exception and `not-performed` never qualifies. D dispatches to the existing
Decision planner; its actual proposed/accepted lifecycle, fresh allocation,
strict assignments, history, unchanged authorizer and impacts supply the domain
proof before separate human publication review.

Impacts status is `not-performed|failed|passed`. Policy becomes
`{id:'typed-record-promotion-v3',version:3,digest}` over the fixed implementation
descriptor. Applicability is exactly `{kind:'subject-registry-present'}` or
`{kind:'subject-registry-absent-both'}`, after actual capability proof. Required is
respectively `['reach','subjectTree','representativeReplays']` or `[]`. In the
absent branch the three raw reports and unknownOwners stay null; the passed
outer assessment means actual inapplicability was proved.

In the present branch retain all three raw owner reports. UnknownOwners becomes
`{status,retained,created}`, with status `incomplete|complete`, and arrays of
`{ref,beforeCapture,afterCapture}` for retained old unknown owners and
`{ref,afterCapture,eventId}` for new unknown owners. Derive exact sets from actual
complete canonical enumeration and the verified P1 transformation; captures are
detached content locators. Retained captures may differ for selected siblings
sharing a file, but each old owner's own bytes must remain exact. Require exact
matching sets with raw reach unknown assignments/unknownImpact, complete
structural and hierarchy work and zero unvalidated records. Raw reach remains
incomplete where classification is unknown.

Resources retain exact admitted limits, with governance null until evaluated,
then `{used,failure}` from the authentic shared owner budget. Other work keeps
its existing raw owner counters. Diagnostics use `{code,path,message}` and
optional owner details, with snapshot paths normalized to stable placeholders.
Unexpected implementation errors continue to throw. No planned buffers belong
in this public report. The [P7 transport](ucs-1240-final-record-promotion.md) retains this exact envelope without replacing it with the assignment report.

A passed gate cannot supply human attention,
retained runtime approval, managed-route capability or publication. P7 requires
the exact fresh result/input digest in review and actual final CAS. External
route knowledge remains unknown. Existing Decision and merge reports cannot
substitute for this operation's proof.

## Acceptance and release order

1. Freeze P1 fixed core, P8 input/result/policy and P7 retained wire together.
   Preserve all existing Decision and equivalent-merge contract tests.
2. O-first positives: actual draft and proposed sources, U/[], positive and
   multiple SIDs, real existing history, several selected siblings, unchanged
   authorizer sibling, nested kit, SHA-1/SHA-256, exact catalog/reference changes,
   valid active source pointers and actual classified impact reports.
3. Refuse wrong tree/capture/mode, old allocation in any state, missing proposal,
   wrong/custom/already-effective source lifecycle, duplicate/new-ID mismatch,
   outside references, extra candidate paths, changed evidence/authorizer,
   changed registry, one-side capability loss and malformed present stores.
4. Refuse each invalid assigned SID even if proposal text is unchanged; preserve
   U versus []. Reject tampered old history, reset origins, fabricated canonical
   before, extra genesis and missing birth ties. Exercise existing tracked
   unrelated revisions alongside new births.
5. Preflight negatives: broken pointer/extractor, unknown/quarantined selected
   result, omitted/extra selected verdicts and store-health-only substitution.
   Budget boundaries: exact capacity and one-short for each enforced domain,
   complete recipe reservation before calls, partial page/explanation/tree/reach
   failure and raw unknown retention. No invented zero-capability success.
6. K-next: fresh explicit release with exact verified target, evidence/authority,
   volatility and digest-bound date cases; stale and absent-time-check refusals;
   preserve frontmatter/body/BOM/CRLF and actual selected leaf verdicts.
7. D coverage under the reviewed v3 typed kind: actual proposed-to-accepted transition, strict positive-SID new assignment,
   existing-history genesis and the same actual all-store impacts. Preserve the
   original subjectless Decision API/profile. Define its evidence applicability
   explicitly before enabling the kind; O/K fixtures cannot certify it.

Direct absent-payload-to-canonical creation, mixed-kind batches, canonical draft
activation, Subject lifecycle/graph edits, arbitrary patch execution, wider
publication claims and shared operation forwarding remain future work. Ordinary
authoring first commits a valid proposal, then promotes it through this gate.

## Documentation and evidence disposition

This slice adds one proposed Decision and one additive catalog entry. Existing
gate contracts remain authoritative for their own profiles. The P8 audit links
this Ontology gate separately. Main reconciles root docs, AGENTS, changelog and
one version bump per actual PR; internal integration opens no PR or release.
The four new library modules ship through the existing engine-directory manifest
entry. No CLI flag, schema, installed writer protocol, adapter or extractor changes;
existing agent instructions remain applicable. Frozen runtime, benchmark, review
and experimental evidence stays intact.

Independent review passed 9/9 Ontology gate tests on the owner snapshot and
37/37 gate, source-contract, Decision gate and Decision publication tests on an
isolated overlay of integration revision `46e12d2`. The nine overlay source/test
files retained their recorded hashes after execution. These checks establish
the tested internal gate behavior, not typed publication or operational capacity.

After copying those exact tested source/test bytes into the integration tree,
the shared assignment/equivalent-merge regression passed 38/38 and installation,
wrapper, template and documentation checks passed 66/66. Lint checked 463 files
with no failures; structural/value validation and automated A1–A4/A6 acceptance
passed. A5 remains manual. None of these checks publishes a candidate or qualifies
the retained large-corpus workloads.

The following design-stage evidence remains historical:

Design handoff checks: structural validation, value validation and store-health
preflight exit 0; lint checks 415 files with 0 failures; 32 local Markdown links
in this document and the updated audit resolve; `git diff --check` passes. JSON
logs are `local-history:ucs-1241-typed-promotion-design-{validate,values,preflight}.json`.
No runtime tests or frozen experiments were rerun for this documentation change.

## Independent source-contract fixtures

The subsequent [typed source fixture](../../tests/helpers/typed-promotion-fixture.js)
builds actual committed K/O/D proposal/candidate pairs with reviewed Subject
authority, unknown/empty/multiple assignments, existing assignment history,
canonical genesis and SHA-1/SHA-256 captures. SHA-256 cases use a nested kit.
Candidate bytes are independently authored test inputs, not a supplied planner
success report. This helper is distinct from P1's transformation-focused source
fixture because it supplies governed classification and real prior history.

The [source-contract tests](../../tests/typed-promotion-source-contract.test.js)
pass 10/10. They validate all six kind/format pairs, exact unchanged registry and
prior event bytes, new-assignment P3 semantics, birth baselines, actual prior
history through the existing prepared assignment gate, and Decision candidate
bytes against the existing actual planner. Negative cases cover activated broken
Ontology source pointers, stale or undated Knowledge checks, missing Subject
approval evidence and absent Knowledge authority vocabulary despite fresh dates.
The missing vocabulary was first exposed by the initial fixture run; supplying
its real registry fixed the valid case, and the refusal remains a dedicated test.

Final source-contract log:
`local-history:ucs-1241-typed-promotion-source-history.tap`; lint 417/0 and diff
check pass. These are checks of existing source obligations, not RED/GREEN
acceptance of the unreleased typed gate. No production engine file changed.

An additional advisory exercise passed the four K/O kind/format combinations
through P1's working common planner, comparing every planned candidate byte and
mode against these actual candidates. The inspected planner SHA256 was
`bacafb93fdaaef467b273454c7030294dd8694d3f39e9bc8602176fe59879259`;
log `local-history:ucs-1241-p1-typed-planner-advisory.json`. This checks the proposed
low-level seam but does not replace an immutable P1 release, P7 wire/policy
acknowledgment, actual typed gate tests or final publication proof.

Immutable P1 release `cf97505fd74eab9ba0bd05a39f3de11da5dfd09e` is now integrated
locally as `348f0e2`. Its eight-file dependency applied with only an additive
catalog-row and API-note conflict reconciliation; production and test bytes are
the released bytes. The [planner contract](ucs-1234-typed-promotion-planner.md)
is compatible with the proposed P8 low-level call. New public kinds remain K/O;
the existing Decision wrapper stays separate. P8 found no consumer-seam blocker.

The actual consumer regression now invokes the released planner for all six
K/O/D kind/format pairs and compares every planned byte/mode with actual
candidates carrying classified assignments and prior history. Result: 10/10,
lint419/0, diff check clean. Log `local-history:ucs-1241-cf97505-consumer.tap`.
No duplicate large owner suite was run. Selected preflight, new SID eligibility,
genesis/history, actual impacts and P7 publication remain distinct obligations.
