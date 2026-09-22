> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Equivalent merge with no supported direct source uses

The existing `subject-equivalent-merge` workflow now has an eventless branch for
one reviewed absorbed Subject and one survivor. It extends the
[merge contract](ucs-1235-equivalent-merge-dto.md) and
[retained publication owner](ucs-1240-final-equivalent-merge.md).
The [domain Decision](../../decisions/entries/equivalent-subject-merge-governance.yaml)
and [publication Decision](../../decisions/entries/ucs-1240-equivalent-merge-publication.yaml)
record this extension separately from the original positive-use history.

## Original input and actual proof

Use the existing operation and wire version 1. Set the required own
`operation.assignmentEvent` field to `null`, and provide the zero-only
`limits.closure: {maxRows, maxBytes}`. All other existing fields and capacities
remain required, including positive registry/event capture ceilings. A missing
event field, an empty event object or an assertion of zero use is insufficient.

The actual owner validates committed before/candidate trees, actual installation
paths, structure, governance, assignment history and the existing merge model
contract. It obtains the complete native use inventory from immutable contexts
and invokes the fixed core once. Zero must be derived from that inventory.
Inactive/proposal/unallocated direct source uses, inherited uses and incident
graph cases that the original merge cannot adjudicate still refuse. This is not
completion of every equivalent-merge variant.

The only actual changed tree path must be the registry. This includes mode,
addition and deletion differences. The entire identity ledger, K/O/D files,
assignment history and current authorizer remain unchanged. The native registry
proof still requires the exact selected new event, historical prefix,
participant states, revisions and full reviewed authorizer tuple.

Absent assignment fields retain their original unknown state. Exact reviewed
unknown-owner dispositions and preserved whole-file bytes/modes remain required;
unknown rows do not become explicit empty assignments. Native inventory/reach
may retain their qualified incomplete status for these exact absences.

## Report and resources

Successful zero reports use version 3, with or without material continuation.
The original bound wire still determines the evidence families. Positive-use
reports retain version 1 or continued version 2, their original closed shapes
and accounting.

Zero reports contain `assignments:null`, `sources.assignmentEvent:null`, and
`checks.assignments.status:'not-applicable'`. The additional
`assignmentAssessment` records the reason `zero-effective-direct-use`, an empty
effective-direct ref list, inventory digest and preservation digest. There is
no P8 assignment execution or fabricated assignment result.

The preservation proof has exactly `inputs`, `operationDigest`, `registryFile`,
`changedPaths` and `inventoryDigest`. Its successful changed path list is exactly
the one actual registry file. All remaining mandatory checks must pass.

`resources.closure` records logical retained rows and their canonical JSON bytes:
one row for each retained unknown-owner disposition and one complete preservation
proof. Admission precedes attachment; an exhausted allowance cannot retain a
successful proof. This is not a whole-report, native Git IO, CPU or memory bound.
Actual zero-branch unknown-owner recaptures are charged to the governance capture
allowance. Positive omitted-input accounting is unchanged. Material continuation
reuses its already-owned three evidence families and authentic allowance rather
than decoding/admitting them again. Existing snapshot construction, structural
checks and native impact work keep their documented phase exclusions.

## Native impacts and eventless publication

Reach, the whole-registry tree pair and the finite existing equivalent-merge
replay recipe remain mandatory. Routes still require the actual final runtime
capability. `publicationReady` remains false in the raw owner.

Zero assignment edits do not imply zero query deltas. An original absorbed-ID
query under equivalent policy can gain a record already assigned to the
survivor once the redirect exists. Native query results, uncertainty and rank
changes are retained; there is no new empty-delta policy or substitute query
oracle.

The strict retained predicate uses the original wire, input/source/candidate
bindings, exact zero report and preservation/resource consistency. This is a
shape/consistency check, not authority. Candidate capture retains actual registry
bytes and an explicit null event. The parent refuses an unexpected event file,
including an empty file or broken symlink. Final/review refuse an unexpected
retained event artifact. The fresh capture summary is
`{registry:{size,sha256},event:null}`.

The review request keeps its existing seven merge operation-evidence fields;
`assignmentEvent` is null. Review matches the complete selected raw registry
Decision tuple with the fresh owner, then retains the existing Decision receipt
fields. It does not add a detached approval claim. Fresh actual owner execution
and whole-report/capture equality remain mandatory at final, review and
publication. Final cleanup failure revokes success; snapshot cleanup failure
revokes raw success. The existing candidate-ref compare-and-swap is unchanged.
Policy objects, envelope versions, worker selectors and public exports remain
unchanged. New runtime bytes must be reviewed; this is not a backward-capability
claim for older runtimes or an authorization to publish customer records.

## Validation evidence

Implementation root: `local-history:unknown-knowledge-equivalent-merge-zero`,
branch `codex/equivalent-merge-zero`, base
`79c3efc0803963c6308ce483235c1d1d1d7f2b24`.

- Actual healthy Git RED: `unknown-knowledge-merge-zero-control-red.log`,
  0/1, exit 1, 498.715416 ms; null-event input refused at the old admission.
  An earlier unavailable-store fixture error is preserved separately in
  `unknown-knowledge-merge-zero-red.log`.
- Raw first GREEN: session 32874 closed 0, 1/1, 3226.854458 ms,
  `unknown-knowledge-merge-zero-first-green.log`.
- Prepared RED: session 55010 closed 1, 0/1, 4954.775084 ms,
  `unknown-knowledge-merge-zero-prepared-red.log`.
- Intermediate full-path receipts preserve the incorrect test expectation
  `recorded` versus native `retained` (67875 closed 1), then the actual missing
  eventless Decision receipt fields (29601 closed 1). The latter received the
  fixed eventless receipt branch.
- First actual runner/final/review/CAS GREEN: session 98829 closed 0, 1/1,
  20993.789417 ms, `unknown-knowledge-merge-zero-prepared-third.log`.
- Expanded raw first run: 79418 closed 1, 8/11, 44588.667875 ms. Three fixture
  corrections used the full existing registry wire mapper, singular `parent`,
  and exact snapshot-root cleanup targeting. Corrected focused 3/3 passed in
  session 34672 closed 0, 14283.833083 ms. No runtime changes were needed for
  those three corrections.

Logs above are retained under `/private/tmp/`. Final owner: **15/15 passed**,
session **3055 closed 0**, **131072.518791 ms**,
`unknown-knowledge-merge-zero-owner-final.log` (SHA256
`3c669b9de9ec493c5a350b7c31d02ebc14dfc13abe029e4c9cff164600d995d0`).
The command used explicit Node 24.19.0 and its pinned PATH, with
`--test --test-concurrency=1 tests/subject-equivalent-merge-zero.test.js tests/prepared-equivalent-merge-zero.test.js`.
Post-run checks matched all 287 tracked engine files and 11 production/helper
paths, zero mismatches. Receipt:
`local-history:unknown-knowledge-merge-zero-owner-receipt.json`.
Independent: **13/13 passed**, session **84595 closed 0**,
**170141.40725 ms**, `local-history:unknown-knowledge-merge-zero-p2-frozen.log`
(SHA256 `8d73206c996e93c6821288ffec4db523b3d2966ab30d34597cd0b5bba01b1dd1`).
Its sole test file hash is
`6d675fb48f1639ff00587c525e39ff037db8574a4afcfe6a0a5936f14f079afd`.
Post-run custody matched 321 actual captured runtime files, 287 tracked engine
files, 11 owned paths, 12 helper/test dependencies and Node/Git, zero mismatches.
Receipt: `local-history:unknown-knowledge-merge-zero-p2-receipt.json`.
Main's six-file combined checkpoint passed **76/76** in **246666.970375 ms**,
session **95099 closed 0**, including the original positive-use publication,
retirement core and merge-input tests. All 2,909 frozen source/dependency files
and executables remained unchanged. The log is
`local-history:unknown-knowledge-zero-merge-integration.log`, SHA256
`02979eda56cb011e44242c6c5bd0410c3660ec41a8632afcd73c33783950f0bf`.
This source includes typed assignment and installation-cutover integration,
before the separately tested loader-environment correction. The frozen owner
runtime manifest is
`local-history:unknown-knowledge-merge-zero-runtime-freeze.json`.

Owner tests:
[raw scope/budget/impacts](../../tests/subject-equivalent-merge-zero.test.js),
[prepared/final/receipt/cleanup](../../tests/prepared-equivalent-merge-zero.test.js).
Independent tests:
[actual publication, provenance and CAS](../../tests/subject-equivalent-merge-zero-review.test.js).
The [new fixture](../../tests/helpers/equivalent-merge-zero-fixture.js) reuses
actual runner/final/request construction from the existing material merge
fixture through an optional test-only source factory; original fixture defaults
remain unchanged. No broad suite or acceptance campaign is claimed by this
owner; main owns the combined integration checkpoint and shared documentation.
