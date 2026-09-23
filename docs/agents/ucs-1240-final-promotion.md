> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# First ordinary promotion publication profile

The outer operation is `ordinary-promotion`, but its sole current descriptor is
`ordinary-decision-promotion-publication-v1`. It selects only the released
`runPreparedDecisionPromotionGate`; the generic outer spelling grants no K/O,
classified-record or existing-history promotion capability.

The descriptor is exactly:

```js
{id:'ordinary-decision-promotion-publication-v1', version:1,
 promotionPolicy:'decisions-only-v1', requiredImpact:[],
 finalEvidence:'actual-result-and-digest'}
```

## Actual runner and evidence

`runPreparedCandidateChecks` uses its existing common input with:

```js
operation: 'ordinary-promotion',
operationInputs: {
  gateInput: /* exact decisionPromotionInputWire output */,
  maxEventBytes: /* explicit positive safe integer */
}
```

The wire is version 1 and excludes repoRoot. The fixed adapter removes only its
transport version, injects the actual repository root, and invokes the original
closed gate. Its before/candidate descriptors must equal the outer descriptors.
No caller callback, planner result, event serializer or success report is used.

The exact canonical wire is retained at `checks/operation/input.json`, alongside
`capture-limits.json` containing `{maxEventBytes}`, the original owner report and
streams, and complete candidate `event.yaml` bytes. The domain inputDigest hashes
only the canonical owner wire. The runner injected digest hashes the original
two-field envelope reconstructed from both retained input artifacts.

The event cap bounds the later regular-file raw retention read, not earlier
owner parsing, snapshot materialization or native allocations. Missing or
over-budget raw event capture refuses retention. The existing bounded reader,
actual prepared assignment source hint and event metadata validator are reused.

## Final policy

`runFinalPreparedPromotionGate` accepts the same six common final fields as
assignment/merge, with expected operation `ordinary-promotion` and explicit
`limits:{evidence,runtime}`. The result is closed:

```js
{version:1, kind:'final-prepared-promotion', policy:{id,version,digest},
 source, candidate, runtimeDigest, capability:{profileDigest,resultDigest},
 gate, status:'passed' /* or failed */, diagnostics:[{code}]}
```

Unobserved fields remain null. The parent verifies the actual complete retained
checks, both input bindings and policy bytes. It establishes the existing scoped
runtime capability under independent external configuration, then captures the
current full runtime and requires its manifest to equal the reviewed runtime.
The fixed final worker reruns the actual P1/P8 Decision promotion proof and
recaptures complete creation-event bytes. The whole fresh report and raw event
path, size and SHA256 must equal retained evidence.

The final gate independently requires exact actual capabilities: Knowledge,
Ontology and Subject registry absent on both sides; Decisions present on both;
assignment history absent before and present after. The owner requires exact
genesis, unknown/known-empty assignments, no SID references, complete transformed
files, proposal consumption and canonical identity creation. Its required Subject
impact list is empty only for this actual predicate. Raw optional reports stay
`not-assessed`, human approval stays `not-performed`, and publicationReady stays
false. No successful Subject-tree or replay report is fabricated.

The existing effective authorizer **record** may share a physical file with
promoted proposals. Its unchanged record/digest/provenance is checked through
the actual owner gate; this profile must not import equivalent merge's unchanged
whole-authorizer-file rule. The event's review capture retains the original
before-file evidence, including historical source coordinates when supplied.

## Review and transaction

The common request's closed operation evidence is:

```js
{kind:'ordinary-promotion', publicationId, createdRefs,
 promotion:{inputDigest,inputCapture,reportDigest,reportCapture},
 assignmentEvent:{eventId,eventDigest,eventCapture},
 finalGate:{resultDigest,result}}
```

All three capture members are direct detached artifacts. The report digest is
canonical parsed JSON; the report capture hashes original raw bytes including
LF. Publication ID is checked against actual gate-bound publication input and
ledger proof, createdRefs against the exact actual owner result, and event
identity/source/review reference/namespace against the actual retained event.
The semantic event digest alone is insufficient because it excludes review
metadata. Full raw recapture closes that gap.

Both review recording and publication recompute the final result and compare its
whole value and canonical digest. The three-file receipt preserves original
operator authorization bytes plus the actual Decision ref/capture/digest. The
publisher checks the fresh authorizer and candidate membership before the shared
single CAS; stale refs refuse and unknown acknowledgement retains coordinates.
Source refs, user index and working files remain unchanged.

Tests exercise actual SHA-1/SHA-256 repositories and synthetic external operator
and runtime-profile inputs. This path retains a reviewed candidate ref; it does
not merge, activate, push, or manufacture human approval. Broader K/O promotion
requires a separately reviewed domain gate, explicit profile and transport.

Decision rationale is covered by existing proposals
`1c8d9b0f-38a9-4f86-a571-3ed7d14add75` (exact ordinary Decision promotion),
`53e6b70b-75d3-476b-bd2c-1b11ef075ebc` (actual subjectless capability branch), and
the [retained publication proposal](../../decisions/entries/ucs-1240-reviewed-candidate-publication.yaml).

The subsequent [K/O/D transport](ucs-1240-final-record-promotion.md) now supplies
that separately reviewed profile under `typed-record-promotion`. It shares private
final transport machinery through fixed wrappers; this Decisions-only descriptor,
wire, capability predicate and final result remain unchanged.
