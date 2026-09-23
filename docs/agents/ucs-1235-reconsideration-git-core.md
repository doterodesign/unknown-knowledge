> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Reconsideration against actual Git snapshots

Status: implemented and verified as an internal actual-Git owner.
This document does not establish publication readiness.
The [Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml)
records the choices; the existing
[model validator](ucs-1235-subject-reconsideration-creation.md) and
[read-only consumers](ucs-1237-reconsideration-consumers.md) are completed
dependencies. Actual Git verification is a separate proof.

## Fixed interface

The [core](../../payload/engine/lib/subject-reconsideration-core.js)
`inspectSubjectReconsiderationCore` entrypoint accepts repository location,
exact before/candidate `{commit, tree, kitPath}` descriptors, a version-1
`reconsider-proposal` operation, raw Decision/assessment/material captures, and
explicit governance, allocation and retained-closure capacities. The operation
identifies the refused proposal, fresh Subject and registry event, and requires
`assignmentEvent: null`. Input is closed own-data; capture arrays are dense.
Its fixed wire projection carries canonical base64 rather than raw buffers.
The [input module](../../payload/engine/lib/subject-reconsideration-input.js)
exports `admitSubjectReconsiderationInput(input, {operationBudget})` and
`subjectReconsiderationInputWire(admittedInput)`; the latter projects an already
admitted request and is not an independent admission or proof function.

```js
await inspectSubjectReconsiderationCore({
  repoRoot,
  before: { commit, tree, kitPath },
  candidate: { commit, tree, kitPath },
  operation: {
    version: 1, id, action: 'reconsider-proposal', proposal, subject,
    registryEvent: { id, changeDigest }, assignmentEvent: null
  },
  evidence: { decisionCaptures, assessmentCaptures, materialCaptures },
  limits: {
    governance: {
      maxCaptureBytes, maxDocumentNodes, maxDocumentTextUnits,
      maxSubjects, maxHistoryRows, maxValidationSteps
    },
    allocation: { maxLedgerRows },
    closure: { maxRows, maxBytes }
  }
})
```

Each snapshot descriptor uses its own commit and tree. Raw captures have
`{capture, bytes: Buffer, objectFormat}`; assessment rows have `registry` and
`identity` captures. The original pair belongs in `assessmentCaptures` exactly
once. Limits are explicit nonnegative safe integers; this contract supplies no
operationally qualified defaults.

The core creates its one allowance from safely admitted explicit limits. Fixed
input admission requires that authentic allowance, reserves each capture's byte
length before making one owned Buffer copy, then admits the owned object with
that reservation. Metadata and dense-array work are bounded even for zero-byte
captures. Model and source verification reuse these same owned objects. This
prevents later caller-buffer mutation from changing asynchronous snapshot proof;
the top-level core input does not accept a caller allowance or return its handle.
The new input also requires ordinary Buffer byte-index properties only. It reads
length through the TypedArray intrinsic, reserves bytes, and charges the logical
byte-property population before inspecting keys or copying. Extra own properties,
including a shadowing `length` getter, refuse without invoking their values.
This is a new-input rule; existing capture decoders retain their contracts.

The capture mechanics now live in the fixed internal
`subject-capture-admission.js` module, shared with the
[ordinary continuation](ucs-1241-assignment-continuation.md).
This extraction preserves the core input, wire digest, refusal diagnostics,
admission phases and counters. It does not extend the core's evidence authority
or by itself establish ordinary assignment publication support. The subsequent
complete ordinary implementation and its independent receipts are recorded in
that guide.

The [prepared impact gate](ucs-1235-reconsideration-gate.md) now obtains a fixed
internal handoff from the same core implementation after successful cleanup.
It adds guarded impact metadata under the core allowance, then creates separate
before/after query operations and verifies fresh snapshot correspondence. The
public core input, report, digest, counters and one-allocation proof retain
their original contract; it accepts no supplied handoff or previous proof.

The owner materializes the actual trees. Caller models, supplied snapshot roots,
governance handles and prior reports cannot substitute for them. One invocation
of the model validator owns one native allocation comparison on the same
governance allowance. The report always has `publicationReady: false`; successful
cleanup is required before `ok` can be true. This interface does not accept a
general validator, operation selector or policy callback.

The closed version-1 result has `kind: 'subject-reconsideration-core'`, `ok`,
`publicationReady`, `inputDigest`, `inputs`, `operation`, `registry`, `decision`,
`allocation`, `assessment`, `sourceMembership`, `ownerPreservation`, `assignments`,
`resources` and `diagnostics`. `assignments` is null because this operation
performs no assignment transition. Source membership labels its exact scope as
`supplied-captures-and-selected-transition`. Completed sections can survive a
later refusal; callers must use the overall `ok`, which includes cleanup.

## What must be proved

1. Both commits resolve to their declared trees and the same valid kit location.
   Actual registry/identity captures equal materialized regular-file bytes and
   modes. The original assessment pair appears exactly once and matches the
   original authorities, including its commit/tree source.
2. The candidate consumes exactly the current suppressed proposal, preserves its
   refusal history, appends one reviewed activation and allocates one fresh
   Subject. Unrelated registry metadata, state, history and order remain exact.
   Parent and related-subject edges use the model's event-time semantics.
3. The distinct new authorizing Decision is effective on both sides. Its entire
   actual file remains unchanged, including grouped siblings; its occurrence,
   bytes and mode agree with the selected review. Historical approval is not
   substituted for the required current authorizer.
4. Only registry and identity paths change. All stored canonical and proposed
   K/O/D owners are inspected, including inactive records. Unknown assignment
   or lifecycle metadata stays unknown; explicit empty assignments stay empty.
   No owner may use the fresh Subject. Missing or ambiguous required payloads
   cannot be silently counted as empty. Occupied IDs with neither payload nor
   catalog declaration are reported as unresolved, including allocated IDs;
   they are retained facts, not invented live records or freed slots. Missing
   declared payloads refuse even for retired/cancelled allocations. No assignment
   event is generated, even an empty one.
5. Every supplied evidence capture has the provenance described below. Completed
   partial checks can remain observable on refusal; a partial report never
   establishes successful scope or publication authority.

## Evidence scope and meaning

Source-bearing captures must equal their actual declared commit/tree file,
object format, full locator and bytes, with a regular file mode. Source-less
captures must correspond to the exact file in an actual before or candidate
snapshot. Source-less registry/identity assessment pairs must correspond to
the same side, not a mixture. Corroboration preserves the source-less locator:
current correspondence is not historical membership.
Raw capture locators contain no retained mode field. The owner observes the
actual regular Git mode and compares current committed/materialized modes where
available; it does not claim comparison against an absent historical mode value.

This covers every **supplied** Decision, assessment and material capture, plus
the required actual original authorities and current authorizer. It does not
fetch omitted unrelated historical witnesses or insert recaptured bytes into
evaluation to repair missing evidence. Selected required evidence must be
present; unrelated unavailable history remains unavailable per event. That
preserves the model's eligibility contract without claiming approval of all
retained history.

For material, typed reference/warrant binding plus actual **file provenance**
does not prove that the selected record occurs in those bytes, or that its
content supports reconsideration. Those are not advertised owner checks.
Semantic support and changed assessment remain reviewed assertions. Unchanged
material is permitted; byte inequality, new references or changed paths are
not novelty tests. No new selected-record parser is introduced for this claim.

## Accounting and implementation scope

One governance allowance accounts for supplied captures, actual Git captures,
additional materialized reads, parsed documents and performed owner/evidence
visits. Reuse an already admitted object for the same physical capture; charge
separate reads separately. Initial Git buffering and native model loading are
not claimed to have pre-read caps. Existing structural, value and assignment-
history validators still run on the actual snapshots; their internal visits and
I/O lack shared-budget interfaces and are explicitly excluded. These logical
counters do not claim to measure native property enumeration, CPU, serialization
or end-to-end work. Allocation retains its complete-ledger population admission.

Closure capacity covers each fixed inputs, operation, registry, allocation,
assessment and Decision proof section; each source, owner, unavailable-resolution
and unknown-assignment-reference row; and the changed-path section. Admit each
before retention, with sticky exhaustion. Result framing, resources and
diagnostics are excluded: this is the sum of admitted proof rows/bytes, not a
whole-report size cap. A reservation retained on later refusal measures consumed
capacity, not proof that a byte copy or subsequent validation completed.

The existing public use-inventory module cannot simply be called here: its
closed evidence input lacks material, and it would reload/evaluate under
separate accounting. Reuse concrete lower-level record iteration, parsing,
occurrence and assignment-reading mechanics instead. Do not create a general
census framework or widen other lifecycle contracts as a side effect.
For canonical owners, compare the unique whole-file parsed occurrence with both
the actual iterator row and the already budgeted private-index resolution entry.
Their complete entries, including file, must match; this avoids a redundant
unbudgeted occurrence lookup/clone. Proposed owners still require unique parsed
occurrence and loader agreement. Existing warning-only value findings retain
their advisory severity; errors and hard failures refuse the owner.

Required tests use actual SHA-1 and SHA-256 commits, root/nested kits, ordinary
and grouped records, unknown metadata, parent/association positives, incorrect
sources and modes, exact/one-short capacities, dirty checkout preservation and
cleanup failure. The receipts below identify the tested implementation and limits.

Ordinary assignment evidence continuation and full reach/tree/replay composition
are implemented in their separate guides. Reconsideration's retained workers,
review, fresh-final validation and publication are now implemented as separate
stages under the [publication contract](ucs-1240-reconsideration-publication.md).
This module adds no public CLI/MCP command and does not qualify a runtime or
authorize a release. Package versioning follows the existing pending PR; every
actual PR must still advance its target base and update versioned notes.

## Verification evidence

The [owner tests](../../tests/subject-reconsideration-core.test.js) use an
[actual immutable fixture](../../tests/helpers/subject-reconsideration-core-fixture.js)
whose stored corpus precedes the original assessment capture. The candidate's
only changes are the registry and identity files. Expected allocation and event
data are authored literally, not produced by the implementation under test.
The [independent provenance tests](../../tests/subject-reconsideration-core-provenance.test.js)
separately verify SHA-256 nested kits, parent/association positives, missing
historical sources, source-less same-side correspondence, grouped Decision
preservation and per-event evidence availability. Their explicit material test
preserves the file-level claim; it does not assert selected-record occurrence.

| Receipt | Observed result |
| --- | --- |
| Initial owner control | Actual model and two-path control passed; new export failed as absent, 1/2 total, 940.606834ms. Log retained; original tool completion metadata unavailable, so no exit/session is asserted. |
| Independent initial RED | 1/3, 1378.338375ms, session 47182, exit 1; actual model control passed, two new-core calls failed as absent. |
| Buffer getter RED | 0/1, 549.331084ms, inline exit 1; genuine Buffer metadata executed before the targeted admission fix. |
| Value-warning RED | 0/1, 1514.322792ms, session 51409, exit 1; ordinary warning-only control passed before the new core incorrectly refused it. |
| Coverage RED | 3/7, 8291.303333ms, session 25644, exit 1; three core-policy failures and one unhealthy missing-proposal fixture, distinguished before correction. |
| Scalar metadata RED | 0/1, 1462.248459ms, session 31685, exit 1; hidden commit-length getter reached before the primitive-type guard. |
| Final owner | **39/39**, 48059.205042ms, session 56817, exit 0. |
| Final independent provenance | **12/12**, 26598.185375ms, session 55481, exit 0. |
| Main integration | **253/253**, 78433.808792ms, session 95492, exit 0. |
| Installation copy/wrappers | **35/35**, 2614.755042ms, session 80354, exit 0. |

Owner logs use `local-history:unknown-knowledge-reconsideration-core-`: final
`owner-green.log` and `provenance-final.log`; earlier `buffer-red.log`,
`warning-red.log`, `coverage-red.log` and `scalar-red.log` retain the actual REDs.
`input-red.log` also records a scalar-capacity Reflect failure (0/1, 568.22225ms,
inline exit 1). The 23/24 `expanded.log` and 37/38 `owner-final.log` failed on
fixture construction: an empty Decision-only commit and a proposal missing draft
stage, respectively. Those fixtures were corrected without weakening runtime
checks. `hash-red.log` is misnamed: its initial 1/1 run passed, and no hash-regex
fix is claimed. Negative shape tests retain genuine Buffers and an unmutated
positive control, so unrelated clone defects cannot make them falsely pass.

Main's exact integration command:

```sh
PATH=local-history:bin node --test --test-concurrency=2 tests/subject-reconsideration-core.test.js tests/subject-reconsideration-core-provenance.test.js tests/subject-reconsideration-history.test.js tests/subject-reconsideration-creation.test.js tests/subject-reconsideration-schema.test.js tests/subject-reconsideration-query.test.js tests/subject-creation-allocation.test.js tests/subject-split-allocation.test.js tests/subject-validation-budget.test.js tests/subject-use-inventory.test.js tests/record-identity-index.test.js tests/captured-source.test.js tests/tree-snapshot.test.js tests/validate-values.test.js
```

Main logs and the five-file unchanged hash snapshot use
`local-history:unknown-knowledge-reconsideration-git-core-`. Lint checked 562 files
with zero failures (session 96632, exit 0). Automated A1–A4/A6 passed (session
25801, exit 0); A5 remains manual. These overlapping runs establish the internal
slice and relevant regressions, not a full-suite, MCP or operational qualification.
