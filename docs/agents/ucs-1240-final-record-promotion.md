> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Knowledge, Ontology and Decision promotion publication

The internal operation `typed-record-promotion` admits **homogeneous Knowledge,
Ontology or Decision batches**, including classified births and existing history.
It uses the actual [typed owner gate](ucs-1241-typed-promotion-design.md) and fixed
`typed-record-promotion-publication-v3` policy. The existing
[Decisions-only profile](ucs-1240-final-promotion.md) retains its separate contract.

The [reviewed-publication decision](../../decisions/entries/ucs-1240-reviewed-candidate-publication.yaml)
records the transport choice. Two fixed exported wrappers share a private final
implementation, preserving common evidence/runtime checks without caller-selected
executors. The typed worker always invokes `runPreparedRecordPromotionGate`.

## Validation and retained evidence

Use the existing `runPreparedCandidateChecks` input with:

```js
operation: 'typed-record-promotion',
operationInputs: {
  gateInput: /* exact recordPromotionInputWire(input) output */,
  maxEventBytes: /* explicit positive safe integer */
}
```

The closed owner input wire remains version 1 and excludes only `repoRoot`; the
retained typed owner report is version 2 when material is omitted, or version 3
when the original evidence has its own `materialCaptures` field, including `[]`.
The [continued path](ucs-1241-typed-promotion-material.md) decodes each capture
once in the fixed worker and carries the owned input directly into the gate.
Captures use the existing JSON transport.
Admission requires exact round-trip wire equality and its canonical digest;
outer source/candidate descriptors must equal the owner descriptors. The adapter
cannot change the selected kind, injected date, evidence, impact policy or limits.

The bundle retains canonical `checks/operation/input.json`,
`checks/operation/capture-limits.json` containing `{maxEventBytes}`, original
owner result/streams and complete raw `checks/operation/event.yaml`. The domain
`inputDigest` hashes the owner wire; the runner's injected digest hashes the
separate two-field envelope. Neither digest replaces the raw event capture:
semantic event digests exclude review metadata.

The event limit bounds the regular-file retention read, not earlier domain
parsing, snapshot materialization or native memory. Runner output/process limits
and retained-reader artifact limits remain separate. Missing, oversized or
mismatched event evidence refuses; failed checks cannot become a passed proof.

## Fixed final policy

The exact selected descriptor in `engine/policies/candidate-publication.json` is:

```js
{
  id: 'typed-record-promotion-publication-v3', version: 3,
  recordKinds: ['ontology', 'knowledge', 'decision'], promotionPolicy: 'typed-record-promotion-v3',
  finalEvidence: 'actual-result-and-digest',
  requiredImpactWithSubjectAuthority: ['reach', 'subjectTree', 'representativeReplays'],
  routeEvidence: 'runtime-capability'
}
```

`runFinalPreparedRecordPromotionGate` takes the same six fields as the ordinary
final gate, with `expected.operation: 'typed-record-promotion'` and explicit
`limits: {evidence, runtime}`. Its result has the existing final report shape,
with `kind: 'final-prepared-record-promotion'` and the selected policy digest.
The whole policy file and executing implementation are also bound by the runtime
manifest; approving an earlier runtime does not approve this one.

The final gate requires actual selected-store and Decisions presence, unchanged
K/O/D and Subject-registry presence across the pair, candidate assignment history,
kind-specific preflight applicability and the fixed v3 owner impact policy. Knowledge
requires no Ontology store. O uses `status: active` and concept verdicts; K uses
`facets.stage: verified`, leaf verdicts and actual injected-date evaluation.
Static/non-time-governed freshness exemptions remain those of existing preflight;
no verification date, citation or body is rewritten during promotion. With a registry, reach,
tree and representative replays are required. Raw reach may remain incomplete
for unknown assignments only under the owner's complete preservation proof;
unknown-owner enumeration, tree and replays must be complete. Without a registry
on either side, applicability is explicitly absent-both, the required list is
empty and Subject reports remain null. This does not fabricate impact coverage.

The independently approved runtime capability covers kit-managed Subject-route
persistence, with external routes still unknown. After exact retained readback,
the final worker reruns the actual typed gate under the current captured runtime
and recaptures the creation event. The entire fresh owner report and raw event
path, size and hash must match retained evidence. Domain `publicationReady` remains
false and human approval remains not-performed; those are separate obligations.

## Review and candidate ref

The common review request uses `operation: 'typed-record-promotion'`. Its closed
`operationEvidence` has the [ordinary promotion shape](ucs-1240-final-promotion.md#review-and-transaction),
with `kind: 'typed-record-promotion'` and exact homogeneous Ontology `O-*` or
Knowledge `K-*` or Decision `D-*` `createdRefs` in owner order. Publication ID, namespace, original input/report/event captures and final
result/digest must agree with actual evidence. The three-file receipt retains
the exact external authorization and actual effective Decision provenance.

Both review recording and publication rerun the selected final gate. The publisher
checks the unchanged authorizer record and candidate membership before the shared
atomic candidate-ref transaction. A stale source ref refuses. This retains a
reviewed candidate; it does not merge, activate or push it.

[Tests](../../tests/typed-promotion-publication.test.js) use disposable SHA-1 and
nested SHA-256 repositories, classified O/K promotions with existing history, and
an absent-registry genesis case with null Subject reports. They
exercise profile/kind isolation, altered impact declarations, original wire and
envelope binding, raw review-metadata tampering, missing runtime approval, wrong
namespace/ref order, stale refs, successful candidate CAS and an unchanged index.
Operator and runtime approvals are explicitly synthetic fixture inputs.

## Version boundary

Historical v1 admitted Ontology only. The v2 owner and publication policies add
Knowledge explicitly; the owner input/report, final report, review request/receipt
and policy-file container shapes remain version 1. The selected publication
descriptor digest is
`49666fd8e31049317509bfe658537c3fed239ea5b8b648b374c341f498879cc9`.
Old owner-policy inputs and v1 typed publication requests refuse in the current
runtime. Retained v1 artifacts keep their original meaning and bytes. Fresh
validation, runtime approval and exact review are required; even the unchanged
ordinary Decision descriptor cannot make an older whole-runtime bundle current.

The current v3 policy adds Decision admission and preserves those historical v1/v2
boundaries. The typed owner report is now version 2 for all kinds. Its exact D
preflight tuple is `status:not-applicable`, `recordKind:decision`, the promoted
D IDs in row order, and null `today`/`result`; the corresponding check is exactly
not-applicable. No concept, leaf or store-health result substitutes for Decision
proof. Every other required check must pass, and O/K still require actual selected
preflight. The shared fixed predicate is applied by both the owner and retained
report validation; final publication still reruns and compares the complete result.
Selected D IDs bind to original decoded input order. The allocator's created refs
retain their independent proposal-key ordering, with exact unique typed membership
corroborated separately. Retained, fresh and final proof checks receive the original
selection; none may infer it from the report being checked.

D uses the existing Decision planner and typed governance/history/impact path.
Its authorizer must already exist unchanged in the before snapshot; a new D
cannot approve itself. Sharing a file with selected proposals is supported only
through exact planner changes, with original authorizer reasoning/digest and
before-file evidence retained. Registry presence still requires full impacts for
known-empty support Decisions. Mixed-kind batches remain unsupported.

The current v3 publication descriptor digest is
`548d06641ec3ef5c0a4157595978f279f83a501181861316c8696f07eef8a60f`.
