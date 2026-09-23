> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Ordinary one-Subject creation and publication

This internal fixed profile composes fresh activation or promotion of an exact
unrefused proposal. It implements the bounded scope authorized in the existing
[creation/reconsideration Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml).
It adds no public mutation API, automatic approval or special union engine.
Runtime/customer approval and publication are separate from implementation.

## Fixed operation and invariants

The operation is exactly
`{version:1,id,action,proposal,subject,registryEvent,assignmentEvent:null}`.
`action` is `activate` with `proposal:null`, or `promote-proposal` with the exact
qualified proposal key. `registryEvent` is `{id,changeDigest}`. Exactly one fresh
canonical Subject is allocated by the existing native single-Subject planner.
The allocation publication is `{id:operation.id,review:event.review.reference}`.
The complete candidate ledger must equal the native plan; no occupied ID is reused.

Both actual snapshots require a present, healthy registry. A present empty
registry supports bootstrap; absence is not synthesized. One `activate` event
appends to exact prior history. Its row has null before-state, warranted active
meaning and a current accepted/addressed Decision. The actual full selected
Decision must agree with both models/indexes and reviewed source bytes. Promotion
retains the exact prior unrefused proposal in `promotes`; suppressed proposals
use the separate reconsideration workflow. The complete ordinary refusal
assessment binds the original before registry/identity pair.

Only the registry and identity file may change. Other Subjects remain exact,
except the selected proposal consumed by promotion. Existing K/O/D payloads,
containing file bytes/modes, assignments, assignment history and owner universes
remain unchanged. Unknown assignments stay unknown; explicit empty stays empty.
There is no P8 assignment execution or empty assignment event.

For changed-meaning union, retain “Road transport” and “Rail transport” unchanged
and active, then create “Ground transport” with its own reviewed broader
definition and warrant. Do not rewrite original definitions, transfer their
assignments, rewire their parents or fabricate equivalence redirects. Subsequent
classification uses the existing typed-assignment profile.

## Composition and resources

`validateSubjectOrdinaryCreation(input,{operationBudget})` is the new fixed
composition boundary in `subject-governance.js`. It reuses the native creation
invariants and allocation helper. Existing `validateSubjectActivation` and
`validateSubjectPromotion` exports and standalone behavior remain unchanged.
The composed boundary owns no second allowance: admission, allocation document
guards, evidence, binding and eligibility use one authentic sticky allowance.
Allocation observations count populations per invocation; governance counters
are cumulative. Partial allocation evidence on refusal grants no authority.

The closed raw core has `{repoRoot,before,candidate,operation,evidence,limits}`;
the gate adds `impact`. The canonical wire replaces `repoRoot` with `version:1`.
Evidence has the three existing capture families: `decisionCaptures`,
`assessmentCaptures`, `materialCaptures`. The original before pair occurs exactly
once. Material is retained historical reconsideration evidence, not a new
ordinary creation attestation. Actual sources corroborate complete original
locators/formats/bytes; recapture cannot repair a missing original pair.

Limits reuse `governance` (six existing counters), `allocation:{maxLedgerRows}`,
and `closure:{maxRows,maxBytes}`. The impact phase retains its explicit separate
before/after context, reach, tree, replay and closure capacities. Native Git,
loader and whole-store checking phases remain excluded from logical governance
accounting. No global CPU or memory bound is claimed.

`subject-eventless-source.js` shares actual capture/source and whole-owner
preservation mechanics. Shared helpers retain the prior reconsideration diagnostic
and accounting-phase names for compatibility. Separate creation/reconsideration
domain cores call fixed native validators. Shared eventless gate, retained capture,
final rerun and review mechanics expose only fixed named entrypoints; callers
cannot supply policies, executors or successful reports as authority.

Mandatory actual reach/tree/replay checks reuse the eventless fresh-Subject
recipe. The creation replay descriptor is `subject-creation-replay-v1`.
Original predicate membership/availability is preserved; fresh-before absence
remains its exact native refusal, including under NOT. Raw qualified incomplete
results stay incomplete. No semantic similarity engine or exhaustive-use claim
is introduced.

## Retention, review and publication

Internal operation `subject-creation` uses
`subject-creation-publication-v1`, version 1. Existing shared envelope versions
remain unchanged. Capture limits are positive
`{maxRegistryBytes,maxIdentityBytes}`. Retention contains candidate registry and
identity artifacts and no assignment event. Review retains the nine existing
eventless operation-evidence fields, including the mandatory full Decision tuple.
The operator's authorization reference remains distinct from registry review.

Local review independently reads four actual authority buffers and invokes the
native allocation comparator once under its fresh allowance. Final execution
binds original wire, approved runtime capability, exact candidate capture bytes
and whole fresh owner equality. Review and publication each run fresh proof;
the existing source/output ref transaction and publication-unknown behavior
remain authoritative. Production callers cannot select arbitrary worker paths.

## Scoped evidence and limits

Initial actual native controls passed 5/5 (4842.660083ms), including promotion,
fresh activation, union preserving originals, nested SHA-256 and present-empty
bootstrap: `local-history:subject-creation-native-control.log`.
Actual missing-core RED: `local-history:subject-creation-core-red.log`.
Core/native first GREEN passed 8/8 (8442.651792ms):
`local-history:subject-creation-first-green.log`.
Actual gate controls passed 3/3 (8918.06575ms):
`local-history:subject-creation-gate-first.log`.
Unsupported-runner RED: `local-history:subject-creation-prepared-red.log`.
Prepared worker GREEN passed 1/1 (7009.3125ms):
`local-history:subject-creation-prepared-second.log`.

The completed creation native/core/gate and existing reconsideration core/gate,
activation and promotion regression passed 94/94 (69691.6255ms), process exit 0:
`local-history:subject-creation-domain-regression.log`. This includes the corrected
union fixture isolation; the earlier combined final/core run retained its genuine
9/10 result in `local-history:subject-creation-final-core-green.log` (the final
promotion proof passed; the union fixture shared a mutable original row).

Independent actual publication verification passed 6/6 (123721.934792ms), process
exit 0, over the frozen implementation. Fresh activation, proposal promotion and
nested SHA-256 union exercise actual retained review/publication; negative cases
cover historical authorizer loss, source/output CAS and resealed allocation proof.
The independent receipt is `local-history:unknown-knowledge-creation-p2-receipt.json`,
and the execution log is `local-history:unknown-knowledge-creation-p2-frozen.log`.
Its 1438-file before/after manifest had zero drift. The publication test remains
independently owned in `tests/subject-creation-publication-review.test.js`.

Repository acceptance passed A1–A4/A6, exit 0, in
`local-history:subject-creation-acceptance.log`; A5 is manual by design. Scoped lint
reported 666 files and zero failures in `local-history:subject-creation-lint.log`.
These results describe the isolated creation base `2e61f69`, not an integrated
metadata-plus-creation snapshot or whole-goal acceptance. Main integrates shared
metadata dispatch sequentially, preserves both composition options and owns root
version/changelog reconciliation and integrated verification. No runtime approval,
customer publication, release or broader lifecycle completion is claimed.

## Integrated checkpoint

Main combined the creation handoff with metadata base `7566cd5`, preserving both
fixed operation profiles and the authentic metadata/creation budget selectors.
The 45-path owner handoff was verified against manifest SHA256
`f497ef2f1860ab8622faa2fa2d928fee5f4a221479c836fbef63968ad6af802f`.

One ten-suite integration run passed **89/89**, exit 0, in **361773.296125 ms**:

```sh
node --test --test-concurrency=2 tests/prepared-runtime.test.js tests/prepared-validation.test.js tests/prepared-subject-reconsideration.test.js tests/final-prepared-subject-reconsideration.test.js tests/subject-reconsideration-publication.test.js tests/subject-creation-native.test.js tests/final-prepared-subject-creation.test.js tests/subject-creation-publication-review.test.js tests/subject-metadata-gate.test.js tests/subject-metadata-publication-review.test.js
```

The isolated root was `local-history:uk-creation-integration-389k2izz`, running
Node 24.19.0 with `/usr/bin/git`. All 2,947 captured source/dependency files and
both executable hashes remained unchanged. Manifest and terminal result:
`local-history:unknown-knowledge-creation-integration.json` and
`local-history:unknown-knowledge-creation-integration-result.json`.
Execution log: `local-history:unknown-knowledge-creation-integration.log`, SHA256
`a6878b2ac92ba980c024898245677ae71ca37a16e6b8adb2ba793658e4fefe53`.
This verifies the integrated shared dispatch and selected native, retained,
review and publication paths; it does not turn earlier isolated receipts into
a whole-goal result. Repository lint checked 678 files without failure and
automated acceptance passed A1–A4/A6; A5 remains manual.

A focused post-integration review distinguished a missing historical Decision
record from missing historical capture evidence. Removing an unrelated historical
Decision from both actual loaded models also makes the legacy activation validator
refuse (`invalid-authorizer`); ordinary creation refuses earlier at its own-data
guard. Restoring that record while withholding its historical capture allows both
validators to create an independent Subject: the old Subject remains unavailable
and the new one is eligible. The isolated control passed 1/1 in 1601.884084 ms
(`local-history:subject-creation-authorizer-distinction-control.log`). The initial
0/1 hypothesis probe is preserved in
`local-history:subject-creation-missing-authorizer-probe.log`; it established that
the assumed legacy success did not occur. No repository runtime or test files
changed, and no additional creation requirement was introduced.
