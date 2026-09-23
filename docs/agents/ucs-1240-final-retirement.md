> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Plain Subject retirement publication

The internal `subject-retirement` operation retains the actual
[owner gate](ucs-1235-plain-retirement-dto.md), verifies fresh evidence and uses
the shared reviewed candidate-ref transaction. The owner report continues to
say `publicationReady: false`. This is separate from merging or activating a
candidate. The [Decision](../../decisions/entries/ucs-1240-retirement-publication.yaml)
records the rationale and alternatives.

## Input and retained evidence

`runPreparedCandidateChecks` accepts its existing common fields with:

```js
operation: 'subject-retirement',
operationInputs: {
  gateInput: /* subjectRetirementInputWire output */,
  captureLimits: {maxRegistryBytes, maxEventBytes}
}
```

Both limits are explicit positive safe integers, including on zero use. They
bound complete raw retention reads, separately from owner budgets. They do not
bound earlier parsing or native Git allocation. The envelope digest binds both
fields; the owner input digest binds only the original wire.

The [continued-material profile](lifecycle-material-continuation.md) retains the
same wire and policy versions. An own `gateInput.evidence.materialCaptures`
selects outer owner report version 2. Fixed prepared/final workers perform one
owned wire admission and carry its allowance through the owner, rather than
decode into a raw API that copies the captures again. Retained predicates and
review bind the report version to the original input selector; fresh final
execution verifies actual source availability again. The original no-material
version-1 report path remains available.

The fixed runner retains canonical `checks/operation/input.json`, canonical
`capture-limits.json`, the original report and execution streams, and complete
`registry.yaml` bytes. It retains `event.yaml` only for positive use. On zero use
an unexpected event artifact refuses. Captures are independently corroborated
against the actual candidate Git locators, including commit/tree and native
SHA1 or SHA256 object identities. Lifecycle wire decoding shares mechanics with
equivalent merge; each operation retains its own fixed proof policy.

The success predicate requires the original admitted wire, exact nine owner
checks, empty diagnostics, complete authored-reference closure, valid bounded
resource counters and matching input/source/candidate captures. It accepts
parsed JSON, not arbitrary JavaScript objects or accessors; canonicalization
depth exhaustion refuses. A retainable failed owner report cannot authorize raw
success captures or publication.

| Branch | Required evidence |
| --- | --- |
| Zero effective direct uses | Null operation assignment event, null source event and null nested assignment report; empty closure/assessment affected sets; the sole `assignments: not-applicable` exception; recomputed inventory, operation and registry-only preservation proof digests; proof row and bytes charged. |
| Positive effective direct uses | All nine outer checks pass; nonempty unique affected refs equal the nested v1 assignment scope; actual source/history/capture/eligibility/preservation/authorizer/candidate checks pass; exact event and candidate binding. Nested impact policy and human approval remain `not-performed`. |

Raw inventory/reach and expected-refusal comparisons can remain qualified or
incomplete. The owner's fixed retirement assessment must pass; null query deltas
are never rewritten as empty successful results.

## Fresh proof, review and publication

`runFinalPreparedSubjectRetirementGate` takes the same six-field input as other
final gates: `repoRoot`, `evidenceDirectory`, `validationBundleDigest`, `expected`,
`approvedRuntimeProfile`, and `limits:{evidence,runtime}`. Expected operation is
`subject-retirement`. Policy is `subject-retirement-publication-v1`, version 1,
with `plain-retirement-impact-v1`, required reach/subjectTree/representativeReplays/
routes, and runtime-capability route evidence. Its descriptor SHA256 is
`4bf202274987032dfe54ea360d913236e02bf2f3eb2789fe2efefd3a2a49de0c`.

The final gate requires actual passed retained validation, exact policy/runtime
identity and independently approved capability establishing unsupported
`kit-managed-subject-route-persistence`. It captures the current runtime and
requires the fixed retirement entrypoints. Older runtimes remain historical
evidence; a version-1 report alone does not establish compatibility.

A fixed worker reruns the actual owner and recaptures the source files. Its
successful closed output is `{version:1, gate, captures:{registry:{size,sha256}, event}}`,
where `event` is an actual `{size,sha256}` pair or explicit null. A failed owner
emits `captures: null` and cannot pass final validation. The whole fresh
owner result and raw captures must exactly equal retained evidence. Cleanup
failure fails the final gate.

The review request's closed `operationEvidence` is:

```js
{kind: 'subject-retirement', operationId,
 registryEvents: [{id, changeDigest}], registryCapture,
 assignmentEvent: null /* or {eventId, eventDigest, eventCapture} */,
 decision: {ref, reference, acceptedStatus, decisionDigest, decisionCapture},
 validation: {inputDigest, inputCapture, reportDigest, reportCapture},
 finalGate: {resultDigest, result}}
```

The five-field Decision tuple is mandatory even on zero use. Review compares it
with the actual last selected retire event in the retained raw registry, the
retained/fresh owner, and the positive assignment event when present. Historical
source commit/tree in the Decision capture remain intact. Operator authorization
reference is separate from the registry's review reference. The receipt retains
the existing `decision`, `decisionCapture` and `decisionDigest` fields from this
verified tuple, without dereferencing an absent assignment event.

Review recording and publication each perform fresh verification. Publication
then uses the existing single atomic source-ref verification and candidate-ref
compare-and-swap transaction. No new CLI, MCP tool or installed agent workflow is
introduced. This code adds no first-authorizer bootstrap or other lifecycle
operations.

## Verification

Initial owner transport checks passed 75/75. Independent review then reproduced
resource-counter, nested-version and deep-JSON boundary defects: 67/79 passed,
12 failed including enclosing tests. This failed run is retained as evidence;
correction verification is recorded separately.

The initial publication integration passed 7/7 in 95942.265042ms, including
actual nested SHA256 zero-use review/receipt/CAS, SHA1 Decision withdrawal,
history, cleanup and tampered evidence. A follow-up capacity/object-format run
passed 5/5 in 87890.205042ms. These results precede transport-review corrections
and do not establish the final integrated snapshot. No real candidate or runtime
was approved or published; tests operate on isolated fixtures.

After correction, transport/decoder checks passed **85/85** in 22090.530542ms
(`local-history:retirement-transport-review-green.log`). The corrected dedicated
prepared/final/publication run passed **7/7** in 104455.00475ms
(`local-history:p7-retirement-publication-corrected-green.log`). Independent
review confirmed the corrections with no blocking finding. The preceding
shared/legacy publication run passed 34/34 in 294868.506ms; its snapshot preceded
the retirement-only predicate corrections. Existing publication descriptors
and the review-only migration descriptor remain exactly unchanged.

Lint checked 498 files with zero failures. Structural/value checks found zero
findings; 188 checked local documentation links resolved. The first automated
acceptance run failed A6 because its exact worker allowlist pin lacked the new
retirement entrypoints. Updating that explicit pin, without relaxing admission,
produced passing A1–A4/A6; A5 remains manual. The PR version guard passed
rc.1→rc.2 with matching package and both lockfile versions. This is an internal
integration commit under 3.0.0-rc.2 Unreleased. Full-suite verification is a
separate result, not inferred from these focused checks.

Full-suite verification at `83c86d21120c6ab4c6e5bad8eeac0f17e6afad57` passed
**2640/2640 tests** in 1061286.050333ms, with zero failures, cancellations or
skips. The runtime/test snapshot and repository remained unchanged throughout
the run. Evidence: `local-history:unknown-knowledge-full-retirement-publication.log`.
This establishes the integrated retirement publication regression result, not
completion of all P1–P11 work. Split, union, suppression/reversal, broader
migration and operational/agent acceptance remain tracked separately. No actual
PR, tag, release, runtime approval or customer publication occurred.
