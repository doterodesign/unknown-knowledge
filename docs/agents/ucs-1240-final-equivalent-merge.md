> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Equivalent-merge retained publication

The outer operation `subject-equivalent-merge` composes the unchanged actual
P2/P8 merge gate with detached evidence, a fresh final gate, retained operator
review and the shared candidate-ref transaction. Domain reports continue to say
`publicationReady: false`; publication is a separate orchestration outcome.

For [retained material](lifecycle-material-continuation.md), fixed prepared/final
workers admit original wire directly, retaining one owned capture decode and
binding report version 2 to its material selector. Review and publication require
the same fresh evidence checks. Omission keeps the original version-1 profile;
event formats, capture limits and publication policy remain unchanged.

The [zero-use extension](ucs-1240-equivalent-merge-zero.md) uses this same
operation with report version 3 and a null assignment event. It retains only
the actual registry capture, requires registry-only preservation, binds the full
registry authorizer tuple and rejects any unexpected event artifact. The examples
below continue to describe the original positive-use profile.

## Runner input and captures

`runPreparedCandidateChecks` accepts the existing common fields with:

```js
operation: 'subject-equivalent-merge',
operationInputs: {
  gateInput: /* exact equivalentMergeInputWire output */,
  captureLimits: {maxRegistryBytes, maxEventBytes}
}
```

Both capture limits are explicit positive safe integers. They bound only the
complete raw retention reads, not earlier owner parsing, materialization or
native Git allocations. The original governance capture allowance also bounds
the aggregate decoded wire evidence before base64 allocation.

The fixed runner retains `checks/operation/input.json` as the exact canonical
owner wire, `capture-limits.json` separately, the original operation report and
streams, and complete `registry.yaml` and `event.yaml` bytes. Its injected input
digest hashes the whole two-field envelope; the domain input digest hashes only
the owner wire. Both remain independently verifiable.

Raw captures come from the actual candidate snapshot. The shared reader admits
only the fixed registry/event paths, rejects nonregular files and symlink
parents, uses O_NOFOLLOW, and reads within the explicit cap. The owner Git
locators retain their original types and are independently checked against the
raw bytes and candidate commit/tree. Missing or over-budget captures refuse
retention rather than produce a partial source file.

## Fresh final proof

`runFinalPreparedEquivalentMergeGate` takes the same closed six-field input as
the final assignment gate: `repoRoot`, `evidenceDirectory`,
`validationBundleDigest`, `expected`, `approvedRuntimeProfile`, and
`limits:{evidence,runtime}`. Expected operation is `subject-equivalent-merge`.
There is no caller-supplied success report, impact waiver or command.

The policy descriptor is `subject-equivalent-merge-publication-v1`, version 1,
with `impactPolicy: equivalent-merge-impact-v1`, required impact classes reach,
Subject tree, representative replays and routes, and runtime-capability route
evidence. The only admitted route input is `{kind:'runtime-capability'}`.
The actual retained capability verifier must establish unsupported persistence
for exactly `kit-managed-subject-route-persistence` under externally approved
configuration. This says nothing about external client routes.

The parent checks all actual runner checks passed, recovers both input artifacts,
verifies both digests and complete raw captures, then captures the current full
runtime. Its manifest must match the reviewed runtime exactly. The fixed child
reruns the actual joint owner gate and independently recaptures registry/event
bytes. The entire fresh report and both raw hashes/sizes must equal the retained
evidence. The owner enforces all eight checks, authored closure, actual whole
Subject-tree artifact pair, and the fixed representative replay recipe.

Explicitly retained unknown assignments may leave inventory/reach incomplete.
The original qualifications and `requires-final-capability` route report remain
unchanged. The outer result is:

```js
{version:1, kind:'final-prepared-equivalent-merge', policy:{id,version,digest},
 source, candidate, runtimeDigest, capability:{profileDigest,resultDigest},
 gate, status:'passed' /* or failed */, diagnostics:[{code}]}
```

Unobserved fields are null. Worker interruption, runtime drift, unavailable
capability, changed evidence and cleanup failure refuse. Process limits and host
trust are the same bounded worker assumptions documented for assignment.

## Review and final transaction

The common review request uses exactly:

```js
operationEvidence: {
  kind:'subject-equivalent-merge', operationId,
  registryEvents:[{id,changeDigest}], registryCapture,
  assignmentEvent:{eventId,eventDigest,eventCapture},
  validation:{inputDigest,inputCapture,reportDigest,reportCapture},
  finalGate:{resultDigest,result}
}
```

All capture fields above are direct detached artifacts. `reportDigest` hashes
the parsed canonical domain report; `reportCapture.sha256` hashes its original
bytes including LF. The writer corroborates operation/event IDs, exact registry
event suffix, full Decision review tuple and namespace against the actual event.
It reruns the final gate and compares its entire result and digest.

The same three review artifacts remain: request, receipt and original operator
authorization bytes. Receipt Decision fields preserve original Git evidence.
The publisher reopens both bundles, recomputes capability/final proof, checks the
actual authorizer and candidate membership, and only then invokes the shared
single ref CAS. This does not merge, activate, push or manufacture approval.

Tests use disposable root and nested Git repositories, actual K/O/D owner gates
and synthetic external operator/profile inputs. The transport and policy are
covered by the proposed [merge publication decision](../../decisions/entries/ucs-1240-equivalent-merge-publication.yaml).


The [repeated-equivalence extension](ucs-1240-repeated-equivalent-merge.md) uses
these same retained/final/review/CAS boundaries. Two actual publications preserve
both operations' source/candidate bindings and evidence; a passing first owner
report alone is not evidence of the first publication. No transport or policy
version changes are introduced; newly captured runtime bytes require review.
