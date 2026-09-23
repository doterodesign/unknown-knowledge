> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Prepared Subject split transport

Stage 1 retains the original split input and corroborates candidate bytes. It
implements the transport portion of the proposed
[split publication Decision](../../decisions/entries/ucs-1240-split-publication.yaml).
This transport module does not itself implement workers, runtime evidence,
retained review, publication or final compare-and-swap. The subsequent
[fixed worker/final-gate slice](ucs-1240-prepared-split-validation.md) handles
execution and retention separately. The [review/publication profile](ucs-1240-split-review-publication.md)
performs the separate actual Git/allocation verification and final transaction.
Reports remain `publicationReady:false`.

The [continued material profile](lifecycle-material-continuation.md) retains its
own original material field in the same wire version. The report predicate binds
outer report version 2 to that field; omission still binds version 1. Fixed
workers admit the original wire once instead of decoding it and then re-admitting
a raw request. The public decoder remains a separate utility.

The fixed API in
[prepared-subject-split.js](../../payload/engine/lib/prepared-subject-split.js) is:

```js
validSplitCaptureLimits({ maxRegistryBytes, maxIdentityBytes, maxEventBytes });
decodePreparedSubjectSplit(repoRoot, originalWire);
isPreparedSubjectSplitReport(report, { source, candidate }, originalWire);
capturePreparedSubjectSplit({
  root, source, candidate, gate, gateInput: originalWire, captureLimits,
}); // { registry: Buffer, identity: Buffer, event: Buffer | null }
```

All three capacities are required positive safe integers, including the zero-use
branch. `maxIdentityBytes` bounds only the candidate artifact. Original before
identity bytes remain in the original wire evidence under its aggregate
`limits.governance.maxCaptureBytes`; they are not truncated to the candidate cap.
The decoder checks decoded capacity before allocating capture buffers and uses
the fixed split admission API. The older merge/retirement decoder still rejects
split; no wire flag selects a validator.

The pure predicate consumes parsed JSON plus original wire. It requires exact
source/candidate descriptors, operation and input digest, the designated original
registry/identity evidence pair exactly once, allocation/assessment shapes and
bounded reported resources. Success requires complete owner checks and the
correct positive or zero branch. Positive nested rows retain their actual
`ref`, eligibility and preservation fields: ordered known states must implement
the original mapping. The nested report has no mapping-reason or revision field;
those are checked against the raw event. Split replay kind and closed policy
id/version/hash shape are required, without duplicating the private recipe.
A failed report can be retained diagnostically but cannot produce captures.
None of these checks authenticates a serialized report or proves original Git
membership or native allocation correctness.

Candidate capture receives a caller-verified candidate snapshot `root`, **not**
an original repository coordinate. It reads only root or `unknown-knowledge`
kit paths, rejects symlink files/directories, checks regular-file size before
allocating read buffers, and verifies native Git blob and SHA-256 locators.
The actual identity file mode must match the reported regular mode. Both raw
authorities are mandatory on both branches. Positive use additionally retains
the exact assignment event; zero use returns `event:null`.

Candidate registry parsing reuses the existing schema/domain/history metadata
parser with the strictly decoded candidate ledger. Both selected registry events
must be the exact activation/split suffix and share the report's five-field
Decision tuple. The original assessment locator/digests, successor order and
source are retained. Positive raw events must bind the original before input,
full split scope, ordered mappings, reasons, known states, next revisions and the
same Decision tuple. No allocator or governance evaluation runs here. Parsing,
canonical encoding and filesystem operations are not charged to the completed
owner's operation budget; artifact byte limits are not whole-process CPU or
memory limits.

The [fixed identity reader](../../payload/engine/lib/prepared-assignment-event.js)
shares private byte mechanics with the existing registry/event reader. The old
reader's accepted paths, capacity validation and refusal behavior are unchanged.
The [fixed split decoder](../../payload/engine/lib/prepared-subject-lifecycle-input.js)
shares private decoding mechanics while preserving legacy action dispatch.

Later independent review must corroborate both actual Git inputs, compare the
original wire captures without deduplication or repair, admit the two actual
identity buffers to a fresh review allowance and invoke the native split
allocation helper once. Candidate transport does not discharge those duties.
Fresh worker execution and full report equality are also still required.
Worker artifact retention must reject any zero-use event artifact, including a
broken symlink; this does not prohibit historical assignment files in the kit.
The worker slice includes both real workers because runtime capture requires
both. Its parent uses existing `readOwnedFile` for all three fixed split artifacts,
with cap-before-read, owned 0400 checks; existing retirement parent readback is
unchanged. Independent original Git/allocation review belongs to the separate
review/publication profile; this transport does not establish it.

Tests live in [the owner matrix](../../tests/prepared-subject-split.test.js),
[the independent review matrix](../../tests/prepared-subject-split-review.test.js)
and [the candidate-only cap case](../../tests/prepared-subject-split-candidate-cap.test.js).
They use real temporary SHA-1/SHA-256 Git fixtures, both branches, original wire
round trips, exact and one-short capacities, filesystem refusals, mutation and
resealing attacks. These fixtures do not publish source records or authorize a
release. Main owns shared documentation, Decision and integration receipts.

## Stage 1 validation receipt

The first actual run reached all four real owner cases (SHA-1/SHA-256, positive
and zero), then failed at the absent transport module: 0/4, exit 1,
15009.07775 ms. Subsequent tests exposed and corrected local report field
locations, resealed zero mappings and a null nested impact check. The zero
reseal test first returned an incorrect `true`; the null check first threw a
`TypeError`. Both now refuse without broad error suppression.

The final focused run passed **113/113**, exit 0, 33299.164792 ms:

```sh
node --test tests/prepared-subject-split.test.js \
  tests/prepared-subject-split-review.test.js \
  tests/prepared-subject-split-candidate-cap.test.js
```

The legacy transport regression passed **89/89**, exit 0, 23178.189583 ms:

```sh
node --test tests/prepared-subject-lifecycle-input.test.js \
  tests/prepared-assignment-event.test.js \
  tests/prepared-subject-retirement.test.js \
  tests/prepared-equivalent-merge.test.js
```

These receipts used Node 24.19.0. P2 owns the independent review test file and
main owns the candidate-only capacity test; the focused total includes both.
The final focused receipt is session 37908, exit 0,
`local-history:unknown-knowledge-prepared-split-stage1-freeze.log`; the legacy
receipt is session 97418, exit 0,
`local-history:unknown-knowledge-prepared-split-stage1-legacy.log`.
No full suite, worker, publication or whole-goal acceptance campaign ran for this
slice. Main separately ran automated A1–A4/A6 successfully (session 56209, exit
0); A5 remains manual. Lint checked 534 files with zero failures (session 15652,
exit 0). Structural/value validation found no findings, with the two expected
missing K/O store warnings. Main's ancillary logs use the prefix
`local-history:unknown-knowledge-split-transport-`.
