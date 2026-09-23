> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Retained candidate review

`await recordApprovedCandidateReview(...)` records an actual trusted operator/platform
approval of exact canonical request bytes. It does not authenticate the person
behind opaque response bytes, infer approval from a PR reference, publish a ref,
or turn incomplete validation into publication readiness.

The closed writer input is:

```js
{repoRoot, evidenceDirectory, request,
 authorization: {outcome: 'approved', requestDigest, reference, bytes: Buffer},
 approvedRuntimeProfile, limits, executionLimits,
 migration /* optional private envelope for final migration only */,
 approvedInstallationReview /* optional trusted configuration for installation cutover */}
```

`approvedRuntimeProfile` is the independently reviewed external configuration
accepted by `verifyRetainedRuntimeCapability`, or explicit null. The writer calls
that actual verifier; caller-created success DTOs are not evidence. Malformed
profiles refuse. A valid profile whose inventory differs may be recorded only
with its actual unavailable result, never a substituted success. The writer also
reopens the actual validation bundle with all four existing readback bounds.

The exact seven positive integer limits are `maxManifestBytes`, `maxArtifacts`,
`maxArtifactBytes`, `maxTotalArtifactBytes`, `maxRequestBytes`,
`maxAuthorizationBytes`, and `maxReceiptBytes`. `maxArtifacts` must be at least
three and also applies to validation readback. Each review file must fit both
its class limit and the common artifact limit; their sum fits the total limit.
Canonical input traversal is separately bounded before encoding.

The request is the frozen common tuple documented in the coordination proposal:
version/operation/namespace/objectFormat/source/candidate/runtimeDigest/policy/
evidence/runtimeCapability/operationEvidence/publish. Source includes the exact
full branch ref, expected commit, tree and kit path. Publish includes the exact
candidate ref and explicit old commit or absence. The common capability member is:

```js
{profileDigest: null /* or configured profile SHA256 */,
 resultDigest, result /* exact actual P1 closed capability result */}
```

The writer compares the full recomputed capability result, its canonical digest
and configured profile digest. The capability applies only to the scope named
by that result, not all migration impact classes.

The [ordinary creation profile](ucs-1240-subject-creation.md) uses fixed
`subject-creation` evidence with the same nine eventless fields as reconsideration:
kind, operationId, registryEvents, registryCapture, identityCapture,
assignmentEvent, decision, validation and finalGate. The assignment event is null.
Independent review checks four actual authority captures, exact native allocation,
the full selected Decision tuple and fresh final equality before publication.
Sharing those checks does not allow ordinary creation to bypass a prior refusal.

The [metadata profile](ucs-1240-subject-metadata-publication.md) uses fixed
`subject-metadata` evidence containing kind, operationId, registryEvent,
registryCapture, validation and finalGate. Its adapter binds the actual raw
registry pair and full selected Decision tuple before comparing a fresh final
result. Identity/assignment artifacts are forbidden, and the receipt retains
the actual authorizer. Existing source/output ref CAS remains unchanged.

The [proposal-suppression profile](ucs-1240-subject-proposal-suppression-publication.md)
uses the same six evidence fields under its distinct
`subject-proposal-suppression` operation. The fixed adapter rechecks actual
registry captures, the complete Decision tuple and fresh final equality; the
original input, report kind and policy must agree. Reusing the metadata review
mechanics grants no metadata-operation authority to a suppression report.

`engine/policies/candidate-publication.json` is exact canonical UTF-8 without LF.
Its container is `{version:1, operations:{...}, reviewOnlyMigration:{...}, installationCutover:{...}}`.
The review-only migration descriptor is
`{id:'identity-migration-publication-v1',version:1}`. The v4 migration descriptor
pins the historical profile, finite recipe, five required semantic surfaces including retained operational history,
two adapters, result/digest binding and private-input disposal. Assignment
names the fixed required routes/views/replays and replay policy. Request
`policy.digest` hashes the selected descriptor. The entire policy file must
match the trusted runtime artifact; the runtime digest separately binds policy
implementation code. The descriptor does not prove those checks ran.

The v1 review-only migration evidence member is exactly
`{kind:'identity-migration',validationInputDigest,validationCapture,scopeCapture}`.
Both captures identify the actual retained operation report. The reader verifies
the released safe report shape, actual source/candidate/object format, non-null
reported scope and gate-produced input digest. Scope is read from `report.scope`.
Namespace remains a reviewed assertion in v1 and that path cannot publish.
The current final profile additionally requires `finalGate:{resultDigest,result}` and calls the actual
fresh final migration gate with the separate private `migration` envelope. The
entire actual result, digest and candidate namespace must agree with the request.
The envelope is never retained. The writer does not assert source-ref freshness;
that is checked by the final Git transaction.

The separate [installation cutover](ucs-1240-installation-cutover.md) descriptor
requires the version-2 mechanical inventory, version-4 semantic result and
version-2 final result. `approvedInstallationReview` is independently supplied
trusted orchestration configuration binding the exact source, candidate, role
inventory and local activation scope; it is not approval inferred from a hash.
Both recording and publication resupply it and the private migration inputs to
the actual fresh final gate. The final result retains its review digest and safe
file-role captures; private reference spans and correspondence are not retained.
The shared review request/receipt format remains unchanged. Ref publication does
not establish observed local activation.

Assignment evidence is exactly `{kind:'subject-assignment',event,eventCapture,
eventDigest,finalGate:{resultDigest,result}}`. The event capture must resolve to
the actual runner's `checks/operation/event.yaml`, match its source hint, validate
with the shared event parser, and agree with the requested namespace. The writer
runs the actual final gate and compares its whole result and canonical digest;
it does not accept a caller-generated success report. `executionLimits` is the
existing four-field runtime/check budget for assignment and v4 migration, and
explicit null for v1 review-only migration. The seven review limits remain unchanged.

The assignment receipt additionally retains `decision`, `decisionCapture`, and
`decisionDigest` from the actual event. The Decision locator remains typed Git
evidence, including its original optional historical source; it is never
relabeled as a detached review artifact. Actual final execution recaptures the
candidate event bytes and the source/historical authorizing Decision through
shared domain checks.

Equivalent merge uses the [closed merge evidence tuple](ucs-1240-final-equivalent-merge.md)
and the same receipt Decision fields. Its writer independently binds the raw
registry/event artifacts, owner input/report digests, exact registry event suffix,
namespace and full Decision tuple, then reruns the actual final merge gate.
Execution limits and the three-artifact review format remain unchanged.

The [Decisions-only ordinary promotion profile](ucs-1240-final-promotion.md)
uses exact owner input/report captures, actual publication ID and created refs,
raw creation-event evidence, and a fresh final result. It reuses the receipt's
Decision fields. Its existing effective authorizer record may share a changed
promotion file; the original before-file review capture remains authoritative.

The separate completion manifest has exactly three UTF-8-sorted artifacts:
`authorization.txt`, `receipt.json`, and `request.json`. Authorization preserves
the exact nonempty supplied response bytes; the extension imposes no parser.
Request and receipt are canonical JSON without LF. The migration receipt is:

```js
{version:1, requestDigest, requestCapture,
 review:{kind:'identity-migration',reference,authorizationCapture}}
```

The completion manifest binds the validation bundle, request and receipt digests.
It never modifies the prior validation bundle. Owned-file primitives are shared
with P1: closed mode-0400 files, no-replace hardlinks, synchronization and actual
readback. Marker-attempt uncertainty returns `retention-unknown` with exact
reconciliation coordinates; final bytes are never rolled back during cleanup.

`readRetainedCandidateReview` takes exactly
`{evidenceDirectory,reviewBundleDigest,expectedRequestDigest,validationBundleDigest,limits}`.
It verifies the manifest hash/canonical encoding, all three file hashes and sizes,
closed receipt/capture bindings, and durability. It cannot certify human identity
or operation success. The final publisher must also call the actual evidence and
capability verification again and enforce all domain checks.

Tests use actual temporary Git migrations and P1 retained runner output. Any
approval text in tests is explicitly fixture operator data, not an approval of
this repository or a real user candidate. Unavailable impact remains unavailable
after successful review retention.

The current migration handoff is publication-v4: its version-3 semantic report
retains actual operational-history validation and adds optional-store presence
and authored payload counts under recipe-v2. Earlier v2/v3 policy/runtime
evidence cannot authorize this profile. Empty Knowledge views stay in memory.
See [finite migration scope](ucs-1240-final-migration.md). Mechanical v1 input
digests and the three review files remain unchanged.

The distinct [K/O/D promotion profile](ucs-1240-final-record-promotion.md)
uses `typed-record-promotion`, the original typed owner report and exact homogeneous created
Ontology, Knowledge or Decision refs. It reuses the promotion evidence/Decision receipt shape and final
transaction after its own fixed fresh gate. With Subject authority present,
actual reach/tree/replay evidence is mandatory; unknown reach remains incomplete.
Its v3 K/O/D policy retains the separate `ordinary-promotion` contract.

## Separate plain-retirement profile

[Plain retirement publication](ucs-1240-final-retirement.md) adds the fixed
`subject-retirement` operation without changing the existing shared envelopes.
Its mandatory five-field Decision tuple is verified against the raw registry
event and fresh owner independently of assignment-event presence. Zero use
requires explicit null assignment evidence; positive use also binds the actual
assignment event. Receipts retain the verified Decision on both branches.
Review and publication rerun the actual final retirement gate before the shared
source verification and candidate-ref transaction. Existing assignment/merge/
promotion proof policies remain separate.

## Separate split profile

[Split review and publication](ucs-1240-split-review-publication.md) adds the fixed
`subject-split` branch. Its nine-field operation evidence includes detached raw
identity evidence as well as registry, original input, owner report, optional
assignment event, full Decision tuple and final result. The shared dispatcher
resolves those artifacts and rejects any retained zero-use event before calling
the fixed split adapter. The three-file review envelope remains unchanged.

The adapter captures the actual before/candidate registry and identity, plus the
actual assignment event for positive use. One fresh allowance covers those reads
and raw document inspection; the native allocation helper owns the single local
ledger comparison. Fresh owner execution separately establishes normalized
registry semantics, current authorizer validity and declared historical Decision
provenance. Source-less tuples remain source-less. The receipt retains the same
Decision ref, capture and digest on both branches; operator authorization stays
distinct from the governance review reference used for allocation.
