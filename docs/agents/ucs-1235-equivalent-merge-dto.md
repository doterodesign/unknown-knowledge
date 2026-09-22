> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# First equivalent-merge gate contract

Status: main-frozen P2 owner input, nested limits, digest preimage and closed result
DTO. The effective canonical K/O/D read-only runtime is implemented; final publication
integration and whole lifecycle acceptance remain separate. P1/P7 transport
consumes this owner contract.

The [material-continuation profile](lifecycle-material-continuation.md) additionally
accepts an own `evidence.materialCaptures` array and returns outer report version 2.
It shares one governance allowance through source checks and assignment rows.
The input and version-1 examples below describe omission of that field in the
positive-use profile. The separate [zero-use extension](ucs-1240-equivalent-merge-zero.md)
uses explicit `assignmentEvent: null`, actual empty direct-use proof, closure
limits and report version 3, with or without retained material.

See the [P2 decision audit](ucs-1235-decisions-and-docs.md) for the proposed
rationale records, implementation evidence and documentation coverage.

## Entry point and input

`runPreparedEquivalentMergeGate(input)` in `lib/subject-equivalent-merge-gate.js`
is read-only and accepts the following exact top-level fields. It assembles both
models from actual immutable committed trees, never caller models or owner reports.

```js
{
  repoRoot,
  before: { commit, tree, kitPath },
  candidate: { commit, tree, kitPath },
  operation: {
    version: 1, id, action: 'merge-equivalent', survivor,
    absorbed: [source],
    registryEvents: [{ id, changeDigest }],
    assignmentEvent: { id, changeDigest },
    retainedUnknowns: [{ ref, reason } /* OR { proposalRef, reason } */]
  },
  reviewNote: { date, author, skill },
  evidence: { decisionCaptures, assessmentCaptures },
  limits: {
    inventory: { maxRecordVisits, maxRegistryReferenceVisits, maxHierarchyNodes, maxHierarchyEdges },
    governance: { maxCaptureBytes, maxDocumentNodes, maxDocumentTextUnits, maxSubjects, maxHistoryRows, maxValidationSteps },
    assignments: { maxRecords, maxCaptureBytes, maxRedirects },
    reach: { maxHierarchyNodes, maxHierarchyEdges, maxRecords },
    views: { version: 1, maxViews },
    tree: { budget: { nodes, edges, rows }, maxBytes },
    replays: { version: 1, maxSubjects, maxEligibilityRedirects, maxCases, maxInventoryBytes },
    query: { version: 1, maxAstNodes, maxAstDepth, maxHierarchyNodes, maxHierarchyEdges,
      maxRedirects, maxRecords, maxPredicateSteps, maxResultsPerStore, maxExplanationNodes }
  },
  impact: { version: 1, policy: 'equivalent-merge-impact-v1', routes: { kind: 'runtime-capability' } }
}
```

No optional top-level fields or defaults. All capacities are explicit safe
nonnegative integers; existing query minimum AST capacities still apply. There is
no unused routes-limit group in this first version because no route assessment
branch is supported. Captured-inventory, null/missing/mixed routes and caller
capability results reject at admission. Caller-selected impact requirements,
inventory, view lists and replay cases are not accepted.

The first operation has exactly one absorbed and one distinct surviving allocated
active canonical Subject, exactly one new registry merge event, and one non-null
assignment event. At least one effective existing canonical Knowledge, Ontology
or Decision source assignment changes. O-only and D-only operations are supported.
The complete actual source-use set must consist of allocated canonical effective
owners, with unchanged lifecycle on both sides. No graph edits, inactive/proposal
source-use editing or fresh identity allocation are supported.
Unknown-retention rows are exact duplicate-free canonical or proposal refs with
nonblank reviewed reasons; explicit empty array is required when there are none.

P8 owns schema-version 2, operation `subject-use-transition`, and scope
`{kind:'subject-use-transition', operation:UUID, action:'merge-equivalent', survivor,
absorbed, 'registry-events':[UUID]}`. Its existing typed-records v2 and v1 branches
are unchanged. The registry event schema has no new cross-link.

## Repeated equivalence with a preserved redirect

The [bounded repeated-merge extension](ucs-1240-repeated-equivalent-merge.md)
permits a reviewed `A→B` followed by `B→C`, preserving A and its exact original
redirect. It reuses this fixed operation and both positive and zero-use branches.
Only a verified unchanged retired equivalence reference receives the narrow
closure exception; other incident graph/use restrictions remain.

## Input digest

The gate computes `inputDigest` using existing `canonicalSha256` over this exact
detached value:

```js
{ version: 1, before, candidate, operation, reviewNote, evidence, limits, impact }
```

`repoRoot` is excluded because it is a host coordinate, not semantic evidence.
Each decoded evidence capture is represented by the existing wire transport
`{capture, bytesBase64, objectFormat}`; assessment pairs retain exact `registry`
and `identity` members. Bytes are encoded from the actual detached Buffer, never
copied from a caller digest. Preserve all array order. The same existing canonical
serializer is used; no new cross-owner event serializer is introduced. The retained
input artifact contains this canonical wire value, so its parsed canonical digest
equals `inputDigest`. The host supplies repoRoot separately when rerunning.

Detach input and capture bytes before the first asynchronous snapshot boundary.
Malformed input has a null digest; no caller-supplied digest is accepted as proof.
Input hashing does not grant capture integrity: the actual owners verify bytes,
locators, Git membership and Decision evidence separately.

## Closed result DTO

All fields below are always present. Empty arrays under not-performed checks are
unexamined, never proof of examined-empty scope; every consumer must retain the status.
Null means not reached/unavailable, never zero
work or successful assessment. Nested inventory/assignment/impact reports retain
their existing owner shapes without relabeling their status or completeness.

```js
{
  version: 1,
  kind: 'subject-equivalent-merge-gate',
  mode: 'read-only-prepared-equivalent-merge',
  ok: false,
  publicationReady: false,
  inputDigest: null,
  inputs: null, // OR { before: {commit,tree,kitPath}, candidate: {commit,tree,kitPath} }
  operation: null, // OR complete detached operation from admitted input
  sources: {
    registryCapture: null, // OR whole actual candidate registry locator
    registryEvents: [], // exact actual new ordered [{id,changeDigest}]
    assignmentEvent: null // OR {eventId,eventDigest,eventCapture} from actual candidate
  },
  decision: null, // OR {ref,reference,acceptedStatus,decisionDigest,decisionCapture}
  checks: {
    admission: {status:'not-performed'}, models: {status:'not-performed'},
    registry: {status:'not-performed'}, authoredReferences: {status:'not-performed'},
    assignments: {status:'not-performed'}, decision: {status:'not-performed'},
    preservation: {status:'not-performed'}, impacts: {status:'not-performed'}
  },
  authoredReferenceClosure: {
    status: 'not-performed',
    semanticCompleteness: 'unknown',
    affectedRefs: [],
    retainedUnknowns: [] // exact reasons + actual before/after inventory witnesses
  },
  inventory: null,
  assignments: null,
  impacts: {
    reach: null, subjectTree: null, representativeReplays: null,
    routes: {
      status: 'requires-final-capability',
      scope: 'kit-managed-subject-route-persistence',
      externalInventory: 'unknown'
    }
  },
  resources: { limits: null, governance: null },
  diagnostics: []
}
```

Each check has exactly `{status}` with `not-performed | passed | failed`.
Diagnostics are structured code/path/message and actual owner details where needed;
temporary snapshot paths are normalized. Unexpected implementation exceptions throw.
`ok:true` means all eight read-only gate checks passed; it does not establish route
capability, human approval, publication readiness or semantic equivalence. There is
deliberately no overall `complete` status that could erase the pending publisher
checks. `publicationReady` is always false.

`resources.governance` contains `{used,failure}` from the authentic P2 budget;
other counters stay in the actual owner reports. Units keep existing owner scope:
governance checks share the six capacities across this gate's evaluations; inventory
and reach are cumulative across the pair; query and tree budgets are per call.
Native loading/IO and uninstrumented owner work are not a whole-operation resource
qualification claim. Routes require no fabricated zero-usage report.

The family accepts unchanged readable absent subjects only through exact reviewed
retain-unclassified rows and whole-file/path/mode/occurrence preservation. Raw use
inventory and reach may remain semantically incomplete for those exact absences.
`authoredReferenceClosure` independently requires complete actual authored-field
inspection and rejects any other missing, ambiguous, malformed, budget-unexamined
or unsupported occurrence. No raw generic delta becomes complete because of this
family disposition. Query replays preserve unknown/possible semantics.

Multiple selected O/D entries may share a physical file through the existing typed
assignment pipeline's union of selected subject spans. All other bytes, metadata,
occurrence positions and mode remain exact; only Knowledge receives its existing
exact revision-note suffix. The reviewed authorizer's entire file stays unchanged,
so neither the authorizer nor a sibling in its file can be selected for an edit.
Retained unknown owners also preserve whole-file bytes, so an unknown sibling in
an affected file refuses. Known unselected siblings may remain byte-exact. These
are current staged restrictions, not complete shared-file lifecycle acceptance.

## Final publication boundary

P1/P7 transport binds the exact operation UUID/event set, whole registry capture,
assignment evidence, input artifact and full actual result artifact. Nested
`validation.reportDigest` is canonicalSha256 of this parsed result; the report
capture SHA-256 hashes exact raw retained bytes. Outer prepared report digest
remains separate. The final parent verifies the actual external approved runtime
capability, full retained packet and actual pair, reruns this gate, authenticates
the human review, then performs compare-and-swap publication. No candidate-resident
final tree/report self hash or registry approval pointer is introduced.

## Fixed internal assignment seam

The agreed P8 adapter `runPreparedSubjectUseAssignmentGate(fullInput)` admits the
frozen external DTO, detaches it with `admitEquivalentMergeInput`, and uses P8's
existing actual-snapshot evaluator. It invokes the fixed P2 import
`inspectEquivalentMergeAssignmentScope` with internally constructed
`{repoRoot,before:{descriptor,root,context},candidate:{descriptor,root,context},
operation,reviewNote,evidence,limits:{inventory,governance}}`. Caller models,
callbacks, successful reports and preapproved handles are never public inputs.
The internal checker imports no P8 gate and grants no publication authority.

The core returns `{version:1,ok,inputs,operation,registry,decision,
authoredReferenceClosure,inventory,assignments,resources,diagnostics}`. Registry
evidence is `{file,beforeCapture,candidateCapture,events:[{id,changeDigest}]}`;
assignment expectations are `{ref,after:{state:'known',ids}}`; resources contains
the actual governance `{used,failure}`. P8 compares these actual results with its
own sources, runs its shared history/baseline/row/capture/authorizer/preservation
pipeline and allows only the corroborated registry file exception. Its wrapper
returns `{version:1,core,assignment}` with unchanged raw owner results. P2's top
gate consumes this result and performs the mandatory actual impact comparisons.

The current core calls the existing actual-pair inventory API, which independently
loads the pair again. That loader work retains the inventory owner's explicit
accounting exclusions; it is not silently counted as covered by core governance
limits. Likewise the top impact phase may reload actual contexts. These owner
budgets do not claim a whole-operation IO/CPU/native-allocation bound.

Implementation milestone: closed input admission, internal core, P8 lifecycle
adapter and the top read-only gate have behavioral coverage using actual committed
pairs. The top gate composes the fixed P8 adapter, verifies its actual operation
and event binding, reloads the actual committed pair for mandatory impacts and
captures the candidate assignment event independently. The final publication
integration is not provided by this read-only slice.

The mandatory reach assessment accepts incomplete semantics only when its exact
unknown-owner set equals the core's reviewed retained canonical owners, all
coverage/record/hierarchy work finished, and those owners retain absent direct
fields on both sides. The mandatory tree assessment always builds one internal
whole-registry view using identical explicit options and requires both complete
`subjects/derived/tree.md` and `subjects/derived/metadata.json` artifact pairs.
The fixed representative replay recipe must then complete. All raw reports retain
their original statuses; no caller inventory can waive these checks.

## Fixed lifecycle replay implementation

`compareEquivalentMergeReplays` composes the existing actual generic comparator;
it does not alter query or delta semantics. It retains the full actual canonical
Subject union and both equivalent-policy outcomes, requires the exact one-step
source-to-survivor mapping, and generates same-AST cases across both sides. The
fixed repertoire is four baseline forms, two unary forms per queryable original
ID, and four Boolean forms per adjacent pair plus the source/survivor pair when
not adjacent. Original IDs are never deduplicated by resolved survivor.

Store selection is the union of actual present Knowledge/Ontology/Decisions stores;
any selected store unavailable on one side refuses. Each store uses current/all
views and direct/self-and-descendants expansion, equivalent policy, id-v1 ranking
and possibleMatches. For m stores, n queryable original IDs and p unique pairs,
`m*4*(4+2*n+4*p)` is the paired case count and twice that many actual query calls.
Checked arithmetic and the existing comparator reserve the entire case and
canonical byte inventory before running queries.

Only unrelated unchanged canonical suppressed or non-equivalent retired/split
Subjects with exactly identical full declarations and unresolved/ineligible/
not-required/zero-redirect outcomes can be explicitly excluded as operands. Their
full outcomes remain reported. Existing full-assignment query validation still
refuses records assigned to those ineligible Subjects. A complete replay is a
finite assessment, not exhaustive discovery, saved-route coverage or approval.

Actual typed merge coverage includes O-only, D-only and mixed K/O/D committed
pairs, grouped O/D files, accepted/addressed Decisions, nested kit paths and prior
assignment revisions with new sibling baseline adoption. The fixed replay still
executes every present K/O/D store in every specified view/expansion and retains
actual typed candidate deltas. The widened core does not change the wire/event or
replay-policy shape; publication requires newly reviewed complete runtime bytes
and cannot borrow approval from the earlier Knowledge-only implementation.
