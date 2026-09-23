> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Governed Subject metadata publication

The fixed internal `subject-metadata` family prepares existing, same-meaning
`rename`, `clarify`, `reparent`, and `relate` changes. A publication appends one
native registry event, which may contain multiple atomic rows. Every participant
already has an active canonical Subject ID. It does not create or retire a
Subject, allocate identities, change record assignments, or introduce a public
CLI/MCP workflow.

This implementation follows the recorded
[history decision](../../decisions/entries/captured-subject-governance-history.yaml)
and [governance decision](../../decisions/entries/subject-governance-contracts.yaml).
Internal code authorization is separate from those records' proposed publication
status and from authorization of any actual customer candidate.

The [proposal-suppression profile](ucs-1240-subject-proposal-suppression-publication.md)
reuses the registry-only source, retention, final and review mechanics through
fixed named exports. Its operation, action, impact/replay policies and report
kind are distinct. The existing metadata entrypoints retain their four actions,
policy identities and accounting phases; callers cannot choose a generic profile.

## Fixed inputs and actual proof

The [gate](../../payload/engine/lib/subject-metadata-gate.js) accepts exactly
`repoRoot`, `before`, `candidate`, `operation`, `evidence`, `limits`, and `impact`.
Both descriptors are actual commit/tree/installation-path triples. Operation
version 1 contains `id`, one `action`, one `registryEvent` (`id`, `changeDigest`),
and the exact `retainedUnknowns` dispositions. There is no assignment event,
allocation request, model, executor, or caller-authored expected query result.

[Admission](../../payload/engine/lib/subject-metadata-input.js) owns all supplied
Decision, assessment and material buffers once using the existing capture
admission primitive. The three evidence arrays are explicit, including empty
arrays. Wire version 1 replaces `repoRoot` with `version`; its fixed owner decodes
directly into the owned bundle under the authentic allowance. It never decodes
and then sends those bytes through raw admission again. Metadata and dense arrays
are guarded before substantive traversal. Raw capture reservation precedes the
single owned copy; the existing per-byte Buffer property debit rejects shadowing
accessors and extra properties without invoking their values.

The owner creates both immutable snapshots and checks actual kit paths,
commit/tree identity, regular registry bytes and modes, native structure and
assignment-history chain. The fixed metadata model wrapper delegates native
history, topology, association, authorizer and action validation; the standalone
transition API retains its original behavior. Rename/clarify require the native
unchanged-meaning assertion. Reparent uses the atomic full forest transition;
relate uses native undirected association ownership rules.

Only the registry path may change. The complete ledger, stored K/O/D files,
assignment metadata, history, citations, body text and authorizer file/mode remain
unchanged. Complete native all-store inventory includes proposals and historical
owners. Absent assignments remain unknown, with exact authored retained
dispositions; they are never silently converted to empty lists. The explicit
assignment disposition is `not-applicable` / `registry-only-transition`, including
when many effective records are assigned. It is not a zero-use claim.

All supplied historical Decision/assessment/material source declarations are
checked against actual committed full-file bytes. Source-less captures retain
same-actual-side correspondence, including paired assessment authorities. The
selected current accepted/addressed Decision and full five-field review tuple
must agree. Omitted unrelated historical evidence is not fetched or advertised
as globally approved.

## Qualification and finite native effects

The [fixed recipe](../../payload/engine/lib/subject-metadata-replay.js) qualifies
the full canonical union before selecting operands, and retains proposal outcomes
separately in the same qualification table. Each row retains raw before/after
native eligibility and the exact Subject, referenced history and identity rows.
There are four dispositions: `verified-both`, `stable-ineligible`,
`stable-unavailable-unrelated`, and `blocked`.

Stable unavailable requires native `eligible:null`, unavailable verification,
`governance-unavailable`, current-policy resolution, and unchanged raw bindings.
It must be unassigned and outside relevant participants. Reparent relevance is
conservative: actual changed-edge endpoints plus their before/after ancestor OR
descendant closure, including unchanged ancestors. Relate includes incident
owners/targets. Rename/clarify impose no blanket ancestor/subtree approval.
Selected, asymmetric or changed unavailability blocks. Assigned unavailability
is not excused: native all/none queries validate actual record assignments and
can refuse. Absent assignment fields instead retain native possible matches.
Resource failures and incomplete traversal never become proven negatives.

For R equally installed stores and E canonical IDs verified on both sides:

```
C = R * 4 * (4 + 2E + 4 * max(E - 1, 0))
actual native query calls = 2C
```

The four modes are current/all record views × direct/self-and-descendants
expansion. Current Subject policy, id-v1 ranks and possible matches are fixed.
Predicates are all, none, subjects-present, NOT subjects-present; assigned/NOT
assigned per canonical ID; and adjacent-ID AND, OR and both directed AND-NOT
forms. Case count and the complete canonical inventory bytes are reserved before
query calls. The existing comparator retains native full outputs, uncertainty,
rank changes and failures; no second Boolean evaluator computes expected rows.

Direct strict/possible memberships remain invariant for every action. Descendant
memberships also remain invariant for rename, clarify and relate. Actual reparent
descendant deltas remain visible alongside complete native reach and full forest
views. All/none memberships remain invariant. Routes require a separately
established actual retained-runtime capability.

T is the sorted distinct old/new label and alias-label text of changed Subjects.
Exactly 2T native lookups cover both sides. All homonyms and native locale/context
metadata are retained; old labels are not automatically made aliases. The four
lookup capacities bound term count, aggregate UTF-8 term bytes, aggregate native
label-index bucket occurrences reserved before calls, and canonical retained
result bytes admitted before attachment. Reserved occurrences and returned match
groups are separate counters. External vocabulary searches remain outside this
finite coverage.

## Resource boundaries

The core owns one authentic governance/capture allowance throughout admission,
actual capture/provenance checks, contexts, native transition and internal use
inventory. Repeated actual physical reads consume new capture admission; reuse
of the same owned evidence object does not copy or charge its bytes again.
The native transition is invoked once. No allocation is performed.

Inventory, retained closure, reach, tree, replay/query and lookup capacities are
separate phases, not three fabricated Subject operations or an end-to-end budget.
Relevance traversals use an independent aggregate of the explicit reach hierarchy
capacities and expose their actual nodes/edges. Eligibility counts attempted,
returned and unreported calls and actual returned redirects. Query counters are
the existing comparator's native observations.

Closure rows are the selected Decision tuple, registry-only preservation proof,
exact retained-unknown rows, assignment disposition and full qualification rows.
Each row and canonical byte length is charged before attachment. Native inventory
rows have their own visit capacities; reach/tree/query/lookup have their own
reports. This is not a whole-report byte cap. Framing, diagnostics, native Git
materialization, parsing/loading, legacy structural/history checks and native
serialization allocations are not claimed as measured CPU/memory work. Retained
worker output and artifact capacities are separate actual byte boundaries.

## Prepared, final, review and publication

The literal policy is `subject-metadata-publication-v1`, with
`subject-metadata-impact-v1` and `subject-metadata-replay-v1`. Existing operation
policy objects and envelope versions remain unchanged. Fixed entrypoints are
`engine/lib/prepared-subject-metadata-check.js` and
`engine/lib/final-subject-metadata-check.js`.

[Transport](../../payload/engine/lib/prepared-subject-metadata.js) requires a
strictly positive candidate registry-byte cap. Successful retention stores the
original canonical wire, capture limits, exact actual report and candidate
registry bytes. Identity and assignment artifacts are forbidden. Candidate
filesystem mode is independently compared with the owner's actual observation;
retained mode 0400 does not substitute for it. Parent readback reuses bounded
no-follow owned-file bytes after validation. A completed failed owner may retain
exact diagnostic output with matching exit 1, but no authority artifacts.
Malformed/interrupted output refuses. Parent cleanup failure refuses call
acknowledgement while preserving retained evidence; it does not fabricate a
prior-cleanup receipt.

The [fresh final gate](../../payload/engine/lib/final-prepared-subject-metadata.js)
binds retained canonical input, report, source/candidate, injected input,
policy/runtime and actual capability. All structural/value/operation checks must
have passed. The real fixed worker reruns the owner and compares its whole report
and raw capture summary. Failed fresh owners return null captures and refuse;
final cleanup revokes success. A report predicate checks consistency, not
independent publication authority.

The [review adapter](../../payload/engine/lib/candidate-review-metadata.js) receives
only artifacts resolved by the fixed outer owner. Operation evidence has six
fields: kind, operationId, registryEvent, registryCapture, validation, finalGate.
It reads the actual before/candidate registry pair under a fresh review allowance,
guards raw schema, preserves the raw prefix and selected complete Decision tuple,
and compares a fresh final result. It does not decode local evidence again or
repeat native model validation. Review and publication both rerun this proof.
The receipt retains the actual selected Decision binding. Existing source-ref
and output-ref CAS semantics remain unchanged; successful tests publish only
isolated synthetic test refs.

## Validation status

The frozen implementation and owner/independent checks are integrated. Main's
eight-suite shared-code checkpoint passed **68/68** in **116872.788916 ms**,
exit 0, with 2,921 source/dependency files and Node/Git executable hashes unchanged.
Log: `local-history:unknown-knowledge-metadata-integration.log`, SHA256
`85c70ef9a10f039390583232495d6b7020ae46007cceaec3ab08b43823bf923b`.
It covers prepared runtime/validation, candidate review/publication, original
reconsideration validation/review and standalone governance/promotion.
Lint checked 657 files with zero failures. Repository acceptance passed asserted
A1–A4/A6 checks; A5 remains manual. Exact fixed-worker acceptance pins include
the two metadata workers. No release or customer approval is implied.

Initial actual four-action RED: 0/4, exit 1, 719.127875ms, each healthy native
control reaching the missing fixed gate. Raw first GREEN: 4/4, 10751.818625ms,
session 88150 closed 0. Expanded raw GREEN: 13/13, 47644.907667ms, session 13213
closed 0. Prepared/fresh-final control GREEN: 1/1, 11097.530292ms, session 27430
closed 0. Review/publication RED reached `invalid-review-request`: 0/1,
11431.044708ms, session 5871 closed 1; first real review/publication GREEN: 1/1,
22224.81175ms, session 58096 closed 0. Initial fixture wire-key and transient
worker-map syntax failures remain in separate logs; neither is represented as a
native domain defect.

Owner tests are [raw/gate](../../tests/subject-metadata-gate.test.js) and
[prepared/final/publication](../../tests/prepared-subject-metadata.test.js).
P2 independently owns
[publication review](../../tests/subject-metadata-publication-review.test.js).
The [shared fixture](../../tests/helpers/subject-metadata-fixture.js) uses actual
Git stores, native model controls and actual workers/capability/receipts.

Final owner focused run: 19/20, 121253.171208ms, session 10220 closed exit 1.
The sole failure expected the wrong shared capture phase spelling. The test-only
correction uses the actual `reconsideration-input-owned-copy`; its targeted rerun
passed 1/1 in 244.736792ms, direct execution exit 0 with no persistent session.
This is 19 passing cases plus one corrected passing case, not a claimed single
20-test GREEN. No production bytes changed for that correction.

The focused command was:

```
PATH=local-history:bin local-history:node --test --test-concurrency=1 tests/subject-metadata-gate.test.js tests/prepared-subject-metadata.test.js
```

The correction ran the same Node/PATH with `--test --test-name-pattern='raw evidence reservation exact fit' tests/subject-metadata-gate.test.js`.
Logs are `local-history:unknown-knowledge-subject-metadata-owner-first.log` and
`local-history:unknown-knowledge-subject-metadata-owner-corrected.log`.
The 301 engine files and shared helper matched the frozen manifest afterward.

P2 independent run: 6/6, 105164.073709ms, session 93736 closed exit 0. Its
SHA1/root rename and SHA256/nested material reparent cases executed real final,
review and publication. Independently authored K2=S2 produces an actual new-parent
descendant gain while every direct query membership remains unchanged. Checks
also cover complete Decision receipts, source/output CAS, index/worktree
preservation, historical Decision/material source loss after receipt, restored
publication, a resealed preservation claim and an unexpected assignment artifact.
Post-run 1,430 engine/helper/dependency/executable/test hashes had zero mismatches.
The initial import-only failure was a test's default js-yaml import; the corrected
named import preceded any product call. Both logs are preserved.

P2 log `local-history:unknown-knowledge-metadata-p2-corrected.log` has SHA-256
`d2fce387d5105af7f589ab9a648d7b46b1baaf2cf4062b520d51ca190e6ea569`.
Its receipt is `local-history:unknown-knowledge-metadata-p2-receipt.json`.
The owner handoff inventory is
`local-history:unknown-knowledge-subject-metadata-handoff.json`; the runtime freeze
is `local-history:unknown-knowledge-subject-metadata-runtime-freeze.json`.

Existing operation policy objects compare exactly with base
`a3187dd153fccf0b2301273dbe72a6ede4395fbf` after removing the one new metadata
entry. No full suite was run by this owner. Proposal suppression publication,
ordinary new Subject creation/union and remaining acceptance are separate work.
Active-canonical suppression/restoration remains unsupported and is not an r3
completion requirement under the [clarified scope](subject-lifecycle-required-scope.md).
No customer cutover is authorized or implied by this implementation.
