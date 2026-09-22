# Reconsideration publication continuation

Status: implemented; scoped verification is recorded below. This
extends the [actual reconsideration gate](ucs-1235-reconsideration-gate.md) through
retained execution, fresh review and candidate-ref publication. The
[existing Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml)
records these choices before dependent code. The ordinary assignment integration
baseline is `81520d1`; its tests do not certify this separate profile.

## Operation and wire

Prepared validation and review accept the fixed discriminator
`subject-reconsideration`. Runner input retains its seven fields:

```js
{repoRoot, source, candidate, operation: 'subject-reconsideration',
 operationInputs: {gateInput, captureLimits}, limits, evidenceDirectory}
```

`gateInput` is exactly `{version:1,before,candidate,operation,limits,evidence,impact}`.
Descriptors are `{commit,tree,kitPath}` with prepared layouts `.` or
`unknown-knowledge`. Operation remains the existing closed `reconsider-proposal`
operation, with one registry event and `assignmentEvent:null`. Evidence retains
required Decision, assessment-pair and material arrays, with each capture encoded
as `{capture,bytesBase64,objectFormat}`. No routes input, caller proof or policy
selector is added to the gate. Existing core/impact limits remain unchanged.

Candidate retention limits are exactly `{maxRegistryBytes,maxIdentityBytes}`,
both positive safe integers. They bound the two candidate buffers, not original
history or all work. There is no assignment-event limit or empty event.

Keep three distinct digests:

```js
coreWire = {version,before,candidate,operation,limits,evidence};
coreDigest = canonicalSha256(coreWire);
gateDigest = canonicalSha256({core:coreDigest,impact});
operationInputDigest = canonicalSha256({gateInput,captureLimits});
```

The new publication policy is `subject-reconsideration-publication-v1`, version 1,
with `impactPolicy:'subject-reconsideration-impact-v1'`, required reach, subject
tree, replays and routes, and `routeEvidence:'runtime-capability'`. Existing
policy objects and outer envelopes remain unchanged. This names a final policy;
it does not add a policy DTO to the existing gate or duplicate its query recipe.

## Fixed admission and evidence

Add `decodeReconsiderationCaptureEvidence`, `decodeSubjectReconsiderationInput`
and `inspectSubjectReconsiderationGateFromWire({repoRoot,gateInput})` through fixed
private raw/wire dispatch. Obtain explicit limits safely, create the authentic
core allowance, guard metadata and reserve decoded bytes before one decode.
Reuse `canonicalBase64DecodedLength` and the existing owned-capture mechanics.
Never decode into a temporary bundle and then raw-admit/copy it again. Existing
raw APIs preserve their phases, counters, refusals and semantic digests.

The private core handoff passes those owned captures into the same actual model,
provenance and impact work. Native one-Subject allocation runs once per core.
Before/after query contexts each retain their separate authentic operation and
one-attempt lifetime. Thus each actual owner run has three allowances, not a
single whole-process budget. Native loading/materialization and JSON framing
retain explicit exclusions. Raw and wire usage may legitimately differ; retained
and fresh comparisons must both execute the wire path.

`isPreparedSubjectReconsiderationReport` checks bounded parsed JSON, without Git,
decoding, model loading or allocation. Bind the actual 15-field gate and 16-field
core shapes, original digests, descriptors, operation and reached-check order.
Successful reports require null assignments in both core and gate, identical
core resources and gate `resources.core`, and gate source captures equal to
actual core candidate observations. Check safe bounded counters and justified
capture/closure lower bounds, not guessed exact historical usage. Preserve
qualified unknown reach and expected native refusal results; they are not empty
matches. Complete valid failures retain reached evidence and diagnostics without
inventing unperformed checks. Plausible counters and rehashed content alone do
not prove historical execution; fresh owner equality remains mandatory.

`capturePreparedSubjectReconsideration` verifies actual candidate registry and
identity bytes, locators and Git modes. Use a fixed identity wrapper over the
existing private bounded reader, rather than a generic path reader or split-named
API. Actual candidate mode must be independently checked; retained artifact
mode 0400 is not the source Git mode. No allocator or extra identity reindexing
belongs in candidate capture. A failed owner produces no authority captures;
capture failure after owner success is a typed refusal, not partial success.

## Workers, retention and final checks

Implement both real prepared and final workers together with dispatch and runtime
capture support. The prepared worker emits exact native JSON plus newline and
exit 0/1 matching owner `ok`. All three structural/value/operation checks remain
required. On owner success retain registry and identity artifacts; always retain
the original wire and caps. `eventSource` stays null. Valid completed owner
failure retains exact diagnostics and no registry, identity or event artifact.
Malformed/interrupted output refuses. Reject even empty unexpected files and
broken symlinks. Parent readers bound allocation before reading, verify owned
regular artifacts, and reuse the exact validated operation buffers in retention.

With all three check streams/results present, successful owner retention has
`R+18` manifest artifact rows, where `R` is the actual runtime file count; valid
owner failure has `R+16`. The bundle manifest is separate and physical blobs may
deduplicate. Native executable bindings are separate from runtime file count.
These are inventory formulas, not future measured runtime counts.

`runFinalPreparedSubjectReconsiderationGate` retains the existing final input
pattern and returns exactly:

```js
{version:1,kind:'final-prepared-subject-reconsideration',policy:{id,version,digest},
 source,candidate,runtimeDigest,capability,gate,status,diagnostics}
```

Require actual retained input/report/artifact bindings, three successful checks
and the independently approved runtime capability. The existing capability must
establish kit-managed route persistence is unsupported; no arbitrary external
saved-route coverage is inferred. Routes remain outside the gate input.

Capture the actual trusted runtime, verify full manifest equality, and run the
fresh wire owner once. Final worker output is `{version:1,gate,captures}`, with
two `{size,sha256}` summaries on success and `captures:null` on owner failure.
Compare the whole fresh gate and candidate summaries with retained evidence.
Actual source loss, changed material or runtime drift must refuse despite intact
retained bytes. Final cleanup failure clears success. Parent cleanup failure
rejects its acknowledgement without deleting retained evidence; the bundle does
not attest to cleanup that occurred after retention.

## Review and publication

Use the existing review envelope with nine operation-evidence fields:

```js
{kind:'subject-reconsideration',operationId,registryEvents:[{id,changeDigest}],
 registryCapture,identityCapture,assignmentEvent:null,decision,
 validation:{inputDigest,inputCapture,reportDigest,reportCapture},
 finalGate:{resultDigest,result}}
```

The Decision is the full `{ref,reference,acceptedStatus,decisionDigest,decisionCapture}`
tuple from the actual core. Preserve its optional source member and the distinct
prior refusal authorizer. No local historical-source requirement may replace
the existing source-less correspondence semantics.

The fixed review adapter independently captures exactly four actual Git buffers:
before registry/identity and candidate registry/identity. Admit each once under
one new review allowance. Guard actual metadata/history visits and compare the
original pair's complete locators, formats and canonical encoded bytes. Do not
decode all supplied evidence locally. Invoke the native one-Subject allocation
comparator once on actual ledgers; preserve original allocations and full planned
candidate equality. No extra Decision capture, generic identity pass or duplicate
query engine is introduced. Fresh final verification supplies full model,
authorizer, source and impact proof.

Review and publication each rerun that fresh final and compare the whole reviewed
result before the existing atomic source/output ref transaction. Preserve CAS,
checked-out-ref protection and `publication-unknown`; no retry or force-update
fallback. A usual prepare, standalone final, review and publish sequence runs
four actual owners plus two independent local review allocation comparisons.
Each is fresh proof with its own allowance, not repeated work within one core.

## Delivery and verification obligations

One production owner edits shared runtime files. A separate test owner writes
disjoint adversarial tests against an agreed shared fixture API; integration owns
Decisions, documentation and versions. Preserve raw-counter regressions, then
test actual SHA-1/root and SHA-256/nested prepared/final/review/publication flows.
Cover prior reconsideration, unknown/unavailable records, exact/one-short limits,
single decode, malformed metadata, source loss after retention/review, actual
modes, artifact absence, rehashed plausible reports, cleanup and stale-ref CAS.
Use native query/allocation outcomes as the oracle. A pure predicate's success
does not establish final semantic acceptance. No stub worker may satisfy runtime
capture. Record closed exits, exact tested hashes and scoped receipts.

Transport or workers alone do not complete this vertical outcome. This profile
adds internal prepared, final, review and publication support, not a public
mutation API/MCP/CLI, runtime approval, customer publication or package release.
Ordinary fresh creation and changed-meaning union/broadening use the separate
[creation profile](ucs-1240-subject-creation.md). Forward refusal uses the
[proposal-suppression profile](ucs-1240-subject-proposal-suppression-publication.md).
Remaining acceptance stays required under the
[clarified lifecycle scope](subject-lifecycle-required-scope.md). Active-canonical
suppression/restoration is an unsupported extension, not an r3 completion gate.

## Implementation and verification

The fixed worker modules are
[`prepared-subject-reconsideration-check.js`](../../payload/engine/lib/prepared-subject-reconsideration-check.js)
and [`final-subject-reconsideration-check.js`](../../payload/engine/lib/final-subject-reconsideration-check.js).
[`prepared-subject-reconsideration.js`](../../payload/engine/lib/prepared-subject-reconsideration.js)
owns retained report/input consistency and bounded candidate capture;
[`final-prepared-subject-reconsideration.js`](../../payload/engine/lib/final-prepared-subject-reconsideration.js)
requires fresh runtime/owner equality. The
[review adapter](../../payload/engine/lib/candidate-review-reconsideration.js)
performs the independent actual-Git and allocation checks before fresh final
verification. Shared review/publication dispatch retains the existing transaction.

The named reconsideration entrypoints now delegate shared eventless source,
retention, final and review mechanics to fixed internal helpers also used by
ordinary creation. Reconsideration keeps its own domain core, refusal/material
requirements, policies and original diagnostics/accounting phases. Ordinary
creation has separate fixed exports; neither accepts a caller-selected executor.

The independent two-file suite passed **36/36** in **278643.41775 ms** using
Node 24.19.0. It exercised actual SHA-1/root and SHA-256/nested publication,
Decision tuple tampering, missing historical refusal/current-authorizer/material
sources after review, stale refs, unchanged index/worktree, bounded artifacts,
diagnostic-only failed owners, verified-buffer reuse and cleanup failures.
The source snapshot contained 307 distribution files; all hashes and both test
files/shared helper matched after the run. See
[`prepared-reconsideration-runtime-review.test.js`](../../tests/prepared-reconsideration-runtime-review.test.js)
and [`subject-reconsideration-publication.test.js`](../../tests/subject-reconsideration-publication.test.js).
Local receipts are `local-history:unknown-knowledge-reconsideration-p2-independent-first.log`
and `local-history:unknown-knowledge-reconsideration-p2-independent-receipt.json`.

The owner's four-file final group passed **48/48** in **221469.038917 ms** with
`node --test --test-concurrency=1`, covering `prepared-subject-reconsideration`,
`prepared-reconsideration-validation`, `final-prepared-subject-reconsideration`
and `subject-reconsideration-review` test files. The 320 captured runtime files,
native executable bindings, shared helper and four tests matched their frozen
hashes after the run. Its log is
`local-history:unknown-knowledge-reconsideration-owner-final.log`.
The source-less positive case exercises the actual wire owner and candidate
capture; the two-format publication matrix uses source-bearing evidence.

Independent generic regressions passed **72/72** in **536487.584041 ms** across
fourteen existing prepared/final/review/publication suites. The 307 runtime and
27 overlay hashes match both the isolated archive and integration worktree.
The log is `local-history:unknown-knowledge-reconsideration-generic-integration.log`;
the [completeness audit](../change-completeness.md#reconsideration-retained-publication-integration)
records the checked surfaces. These scoped passes do not establish whole-goal
acceptance or supported production scale.
