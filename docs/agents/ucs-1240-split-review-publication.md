> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Split review and candidate publication

The fixed split review profile corroborates retained split evidence against actual
Git objects before recording a review receipt or attempting candidate publication.
It implements the proposed [split publication Decision](../../decisions/entries/ucs-1240-split-publication.yaml).
Prepared transport and final execution remain described in
[split transport](ucs-1240-prepared-split-transport.md) and
[prepared split validation](ucs-1240-prepared-split-validation.md).

The [continued material profile](lifecycle-material-continuation.md) retains the
same review envelope and independent allocation check. Review compares actual
original authority bytes with their canonical wire base64 without a second local
decode. Mandatory fresh final execution verifies all supplied historical material
sources; neither this byte comparison nor a retained report establishes that proof.

## Request and receipt

The existing version-1 candidate-review envelope accepts `operation: 'subject-split'`.
Its `operationEvidence` has exactly nine fields:

```js
{
  kind: 'subject-split', operationId,
  registryEvents: [{ id, changeDigest }, { id, changeDigest }],
  registryCapture, identityCapture,
  assignmentEvent: null, // positive: { eventId, eventDigest, eventCapture }
  decision: { ref, reference, acceptedStatus, decisionDigest, decisionCapture },
  validation: { inputDigest, inputCapture, reportDigest, reportCapture },
  finalGate: { resultDigest, result }
}
```

The registry, identity, input, report and optional event captures are detached
artifact descriptors, not repository capture locators. They bind the fixed
`checks/operation/registry.yaml`, `identity.yaml`, `input.json`, `result` and
`event.yaml` artifacts. The Decision capture retains its original repository
locator, including a source commit/tree only when supplied. Source-less Decision
locators remain supported.

The existing `recordApprovedCandidateReview` path resolves actual retained members
and calls the fixed internal `verifySubjectSplitReviewEvidence` adapter. No
caller-selected executor, callback, policy or allocation budget is accepted by
that adapter. Serialized owner reports carry evidence, not branded authority.
The receipt records the common Decision ref/capture/digest on both zero-use and
positive branches. The trusted operator's exact-request authorization reference
is separate from the raw registry `review.reference` used for allocation.

## Independent source and allocation checks

Review preserves the original wire and selects its before registry/identity pair
exactly once. A missing, duplicated or contradictory pair is refused, never
reconstructed. Four actual committed captures establish before/candidate registry
and identity membership, full locators, raw bytes, object format and regular-file
modes. The candidate artifacts must contain those exact bytes. Positive use adds
one actual candidate assignment-event capture. Zero use forbids an event artifact;
all-empty replacement choices with effective owners still require the positive
branch and its nonempty event.

One new authentic governance allowance uses the original admitted governance
limits. Each of the four/five actual capture objects is admitted once and reused;
additional physical reads would require separate admission. Raw registry/event
schema checks follow document guards. Named validation steps account for original
pair selection, raw history, registry tuples and assignment rows. These are local
logical limits: retained-file caps and aggregate original wire decoding remain
separate, and they do not claim to bound native Git buffering or YAML allocation.
The identity artifact cap continues to cover the candidate only.

`validateSubjectSplitAllocation` runs exactly once per independent review
invocation, using original allocation limits and that same allowance. Its
publication tuple comes from the original operation ID and the actual common raw
registry review reference. The helper alone guards identities, successors and
publication, admits ledger/successor populations, invokes the native planner and
computes identity digests. Review compares its full proof and resource observation
with the retained owner evidence. It adds no identity index, wrapper occupancy
recount, generic transition pass or second planner. Completed owner resource
reports remain unchanged; no new public budget DTO is produced.

Raw registry checks establish an unchanged history prefix and selected final
activate/split suffix, assessment source bindings and common five-field Decision
tuple. Positive raw event checks bind ordered qualified mappings, reasons,
revisions and before/after states. Existing P8 rows have no `reason` field; the
raw event and original mapping carry that binding.

There is no local Decision recapture. The full tuple, including any source
locator, is preserved. Mandatory actual fresh final execution establishes current
authorizer semantics and declared historical Decision provenance, as well as
normalized registry and complete domain semantics. Review requires passed status,
exact final digest and whole-result equality. Local source checks do not claim
independent historical Decision verification.

## Publication boundary

Both review recording and `publishPreparedCandidate` rerun independent split
verification and the actual final gate. A retained receipt cannot substitute for
fresh proof. Publication binds its Decision tuple to the receipt before reaching
the unchanged atomic source/output candidate-ref transaction. Source movement,
output collisions and uncertain transactions retain their existing behavior;
index/worktree preservation remains required. Fresh final cleanup failure refuses
publication. The profile introduces no runtime approval, canonical Decision
promotion, actual operator authorization, release or customer-publication grant.
Older review operation objects and version-1 envelopes remain unchanged.

## Validation evidence

The initial actual SHA-1 zero-use runner/final control passed, followed by the
missing split review dispatch RED: 0/1, 10743.757208 ms, session74575 closed1,
`local-history:unknown-knowledge-split-review-red.log`. Basic zero review GREEN:
1/1, 17272.609458 ms, session73392 closed0. The subsequent actual four-case matrix
exposed use of the generic assignment schema for the two positive cases (2/4);
the split adapter now selects the existing fixed split schema.

Final owner GREEN: 23/23, 149830.379459 ms, session2171 closed0,
`local-history:unknown-knowledge-split-review-owner-final.log`. Exact command:

```sh
PATH=local-history:bin node --test tests/subject-split-review.test.js
```

This run includes all four format/branch review controls; original pair and actual
source/allocation/mode/raw tuple attacks; independently reached named budget
refusals and exact four/five-capture admissions; and nine mixed K/O/D owners with
all-empty replacements and a source-less Decision through actual review and
publication to the exact temporary candidate ref. Resealed negative reports first
pass the pure predicate where the asserted local proof requires it. Test fixture
corrections for mapping admission/event-source digest resealing were test-only,
not production bug fixes. Owner resource reports remain unchanged.

Independent publication GREEN: 12/12, 317706.151625 ms, session45370 closed0,
`local-history:unknown-knowledge-split-publication-independent-first.log`.
Exact command:

```sh
PATH=/usr/bin:$PATH local-history:node --test tests/subject-split-publication.test.js
```

Each of the four actual SHA-1/root and SHA-256/nested, positive/zero cases first
establishes successful publication. Integrity-valid resealed receipt Decision
digests/source locators then fail authorizer binding; stale source/output refs
fail CAS. Removing an actual declared Decision-source commit after review, while
the source/candidate commits and retained receipt remain available, makes both
rereview and publication refuse `review-split-fresh-final`. Restoring it permits
publication with source/index/worktree unchanged. The same-tree source-ref case
proves exact commit CAS, not a resealed original-wire attack. Four top-level cases
and eight receipt subtests constitute this twelve-test run.

Main's shared legacy review/publication/CAS/version regression: 40/40,
374972.80925 ms, session63240 closed0,
`local-history:unknown-knowledge-split-review-integration.log`. Three production
and nine legacy-test file hashes remained unchanged through that run. This is a
separate integration receipt, not part of either focused owner count.

Owner coverage is in `tests/subject-split-review.test.js`; independent publication
coverage is in `tests/subject-split-publication.test.js`. Both reuse the actual
`tests/helpers/subject-split-review-fixture.js`, whose runtime profile and operator
authorization are explicitly synthetic test inputs. No real publication is
performed by these isolated fixture tests.
