# Ordinary assignment evidence continuation

Status: implemented internal ordinary assignment path; integration evidence is
recorded below. The
[snapshot Decision](../../decisions/entries/assignment-snapshot-preservation.yaml)
records the field, version, accounting and delivery choices agreed before dependent
code. The [reconsideration Git owner](ucs-1235-reconsideration-git-core.md) proves
creation of a fresh Subject; ordinary assignment is the separate path that lets
an existing record subsequently use it.

## Input and reports

Ordinary staged/prepared inputs accept one optional own enumerable data property:

```js
continuation: {
  version: 1,
  assessmentCaptures: [{ registry: RawCapture, identity: RawCapture }],
  materialCaptures: [RawCapture],
  limits: { governance: {
    maxCaptureBytes, maxDocumentNodes, maxDocumentTextUnits,
    maxSubjects, maxHistoryRows, maxValidationSteps
  } }
}
```

All fields and capacities are explicit. Empty arrays are valid transport, not
evidence sufficiency. Existing top-level `decisionCaptures` is the sole Decision
location. Raw captures use `{capture, bytes: Buffer, objectFormat}`; the prepared
wire retains exactly the same grouping with canonical `bytesBase64`. No aliases,
raw registry bytes or new assignment-event fields are introduced.

Only genuine omission selects the exact old version-1 owner report and execution
path. Present null, undefined, inherited/accessor fields, extras and malformed
arrays refuse. The continuation path has a version-2 owner report, adding:

```js
continuation: {
  version: 1,
  inputDigest,
  governance: { used, failure }
}
```

Before admission, digest/usage can be null. Malformed supplied continuation
cannot become a successful version-1 fallback. The digest binds the canonical
wire top-level Decision array and complete continuation, including limits and
order. The existing retained full-operation digest separately binds the ordinary
operation. Reports remain observations, not independent publication credentials.

Outer retained/final/review/event versions and the existing assignment publication
policy remain unchanged. Their validators must derive expected owner version
from original input presence and verify exact digest, usage, bounds and frozen
runtime support. Old runtime refusal is required; silent field stripping is not
compatibility. Omitted old inputs retain their existing result and wire bytes.

The retained report predicate checks the original wire digest, exact report
shape, minimum admitted bytes and plausible usage within supplied capacities.
Those checks do not reconstruct or authenticate historical execution: a plausible
counter mutation can pass a shape/bounds predicate. Captured worker execution
and the mandatory fresh final owner remain separate evidence. The fresh owner
verifies actual source/assignment semantics and reports its own measured usage.

## Ownership and scope

One authentic governance allowance owns raw admission or wire decoding, both
actual governance evaluations and model bindings, new supplied-source checks,
and continued row eligibility. Raw admission reserves intrinsic Buffer length
before its charged property check and one owned copy. Wire admission validates
canonical base64 and reserves decoded length before one decode. The same owned
objects are reused; each supplied occurrence consumes capacity.

Share identical capture mechanics with the reconsideration input through fixed
internal entrypoints, preserving its exact phases, diagnostics and counters.
Keep owner-specific schemas and proofs separate. A fixed ordinary continued-row
entrypoint shares the existing private budgeted validation; no split-named call,
new policy selector or duplicate eligibility engine is needed. Even an empty
target list authenticates the bound operation.

Actual snapshot models use the existing loader; both governance evaluations and
bindings share the one allowance. Loading and materialization retain the explicit
exclusions below.
The bounded query host's one-context lifetime is unchanged; it is not a wrapper
for two assignment snapshots. Ordinary assignment must preserve registry and
identity bytes, so both sides receive the complete same evidence lists without
projection. A changed registry refuses this profile.

Every supplied source-bearing capture must match its declared actual commit and
file. Source-less captures need exact named-file correspondence. Source-less or
mixed assessment pairs must share an actual before or candidate side. When both
members are source-bearing, verify each declared historical source; do not impose
a blanket current-side requirement. For a staged candidate, use its immutable index-tree
snapshot, regular modes and paid materialized reads. Do not invent a candidate
commit. File proof does not establish selected material-record occurrence,
semantic relevance, novelty or human attention.

Existing record, selected-file and redirect limits retain their meanings.
Native materialization/loading, existing scope/history/preservation work and
separately limited impact helpers retain explicit exclusions. No end-to-end
CPU, I/O or memory cap is claimed. Cumulative continuation usage is refreshed
on every owner exit; exhaustion stays sticky and owner cleanup failure clears
owner success. The parent retained runner's existing cleanup diagnostic is not
an owner/final cleanup receipt or a new publication guarantee.

Newly-effective row rules remain unchanged. Retained historical assignments need
not become newly authored, while required query/replay checks can still refuse
an unavailable coassignment. No missing evidence becomes a negative match.

## Internal delivery

The shared capture-admission prerequisite is implemented in
`payload/engine/lib/subject-capture-admission.js`. Its three fixed internal
entrypoints admit reconsideration raw evidence, admit ordinary assignment raw
evidence, or decode ordinary assignment wire evidence. Each accepts exactly
Decision, assessment-pair and material arrays plus an authentic allowance.
No caller-defined profile or validation callback is exposed. The reconsideration
input now uses these shared mechanics with its original phases and counters.

The new wire decoder checks canonical alphabet and padding with a linear scan
after text admission, then reserves decoded length before one Buffer decode.
An actual four-million-byte within-budget regression exposed native stack
exhaustion in an initial repeated-group regular expression; valid large text
now decodes once, and invalid trailing text refuses before decoding. Existing
wire decoders and the raw capture branch keep their original contracts.
The same pure decoded-length grammar is factored into `canonical-base64.js`
for the new wire admission and retained report's byte accounting. Its callers
retain their own budgets and authority; the primitive neither decodes nor
verifies a source. Earlier frozen capture receipts below remain tied to their
original file hashes; they do not certify subsequent changes.

`runAssignmentGate` and `runPreparedAssignmentGate` admit raw input once.
`runPreparedAssignmentGateFromWire` uses the same private evaluator with one
bounded decode. Both fixed assignment workers select that wire entrypoint when
continuation is present. The parent validates the actual retained operation
output using its already verified bounded buffer; it does not reread an
unbounded copy. `isPreparedAssignmentContinuationReport` checks the original
input-derived report contract in the worker, parent and final readback.
Worker reports retain native JSON output plus a newline; canonical operation
input and final envelopes retain their separate existing encodings.

The complete ordinary Knowledge path includes raw staged/prepared owners, both
real wire workers, exact retained input/report checks, fresh final review and
actual isolated-fixture publication. Supported raw typed selections receive
continuation too. The subsequent [typed publication profile](ucs-1241-typed-assignment-publication.md)
now carries those selections through retained/final review with a separate fixed
all-store replay policy; it preserves the original Knowledge profile. Later lifecycle/promotion continuation
remains separate required work.

Actual tests cover SHA-1/root and SHA-256/nested assignments after reconsideration,
strict presence and budget boundaries, omitted-input parity, source loss,
unknown metadata, real workers, resealed tampering, fresh review and unchanged
CAS. The shared staged/prepared cleanup regression remains part of integration.
An initially failed route-required prepared report stays failed. Only the fresh
final policy's actual runtime-capability check can establish that kit-managed
route persistence is inapplicable; views and replays remain required.
Review compares the whole supplied final result with a fresh result, so rehashing
a modified final counter does not authorize publication. Source loss after
retention or a review receipt also refuses through actual fresh source checks.
Each actual PR still
advances package/lock versions and changelog; internal commits share the pending
PR version. No new CLI flag, runtime approval or customer publication is implied.

## Shared capture prerequisite verification

Initial capture extraction tests passed the existing-input characterization and
failed five missing-module cases (**1/6**, exit 1). Extraction then passed
**45/45**, including the 39 existing actual-Git core tests (47153.056042ms,
session 50026, exit 0). Main's subsequent large-input probe exposed the new wire
regular-expression failure. Its regression failed both large-input subcases and
their parent (**0/3**, exit 1), then the capture/input suites passed **15/15**
(626.249667ms, exit 0) after the linear-scan correction. These overlapping runs
are not separate unique test populations.

Main independently tested an isolated archive of
`1c1d17c698866bac5bacc4c88ee4a644c1d81308` with exactly three overlaid files:
the shared helper, reconsideration input and capture-admission test. This avoids
including concurrent unfinished governance/gate changes. Their SHA-256 hashes
are respectively `80a4fb9c44e3047e0aefc9e8776e6930f3f9b157289dff3695b9763b4fc9d225`,
`fb33aff3250ab4e2af21c4ce11a71232bbec1cb41a785f61e4f5f5ed280a5e78` and
`3bada29834cfb7b86032c7888947827f3b4224279df98cceeb6543059be392ab`.
Node 24.19.0 ran `--test --test-concurrency=2` over
`tests/subject-capture-admission.test.js`,
`tests/subject-reconsideration-core.test.js` and
`tests/subject-reconsideration-core-provenance.test.js`: **60/60** passed in
50363.610083ms (session 49409, exit 0). There were no skips or cancellations.
The exact fixture tests retain source provenance, allocation, preservation and
admission-counter coverage; the wire cases verify reservation before decoding,
malformed padding, large canonical text and invalid tails.

Installation-copy/wrapper tests passed **35/35** in 2244.393959ms (session 1284,
exit 0). Lint checked **564 files with zero failures** (session 87961, exit 0).
Main logs and frozen snapshot metadata use
`local-history:unknown-knowledge-capture-`; owner RED/green logs use
`local-history:unknown-knowledge-assignment-capture-`. These are development
prerequisite checks, not whole-suite, operational or publication qualification.

Automated acceptance A1–A4/A6 passed (session 71019, exit 0); A5 remains manual.
The initial archive-only attempt failed because Git-based audit fixtures had no
repository index (session 49459, exit 1). Initializing and populating a local
index in that disposable archive corrected the test setup without changing
runtime files. Preserve both `unknown-knowledge-capture-acceptance.log` and
`unknown-knowledge-capture-acceptance-git.log`; the former is not a runtime
regression or a successful acceptance receipt.


## Ordinary continuation verification

Owner checks progressed from missing-entrypoint RED cases to actual staged,
prepared and wire controls. Independent review reproduced two admission defects:
metadata charges were missing from an early-refusal report, and copying into an
ordinary object silently discarded an unexpected own `__proto__` field. The
common failure path now refreshes usage and a null-prototype accumulator keeps
all fields visible to closed-input validation. Focused corrections passed **1/1**
for early usage and **5/5** for unknown-field/raw-wire controls. Pure base64 grammar
factoring passed **18/18**; earlier prerequisite receipts above remain historical.

Actual retained/final tests passed **9/9** in 54739.764542ms (session 96983,
exit 0). They exercise both Git object formats/layouts, omitted-input controls,
version/digest/shape tampering, plausible counter bounds, bounded parent output
reuse and loss of historical material sources. Actual isolated review/publication
passed **3/3** in 44923.057917ms (session 95710, exit 0), including source/output
CAS and preserved index/worktree, post-receipt source loss and rehashed supplied
final-result counter rejection. These overlap the subsequent integration;
they are not additional unique test populations.

The owner's final 15-file run passed **147/150** in 233366.459875ms (session 50654,
exit 1). Exactly three new typed-replay tests supplied an invalid outer input
`representativeReplays: {}`, so they correctly failed input admission before the
expected typed-replay refusal. Correcting only those test inputs to
`{limits: {}, queryBudgets: {}}` and asserting the authorizer had passed produced
**3/3** in 7269.864ms (session 33339, exit 0). No production file changed.
Preserve both `unknown-knowledge-assignment-continuation-owner-final.log` and
`unknown-knowledge-assignment-continuation-typed-replay-corrected.log`; the first
is not a successful 150-test receipt.

Main's disposable integration archive starts at
`a5a900095d583628e6f94465518e32e9fe725fff` with twelve runtime modules, five tests
and one fixture helper overlaid. The corrected gate test has SHA-256
`6aaeeddb8ce8a356546a33f3438357d836b2f6624d0d2b00ba5c2d1e779105d3`.
All **298** engine/schema/payload-package source hashes were checked in both
workspace and isolated copy before execution. The broader captured runtime
inventory contains **311** files, including dependency files, plus separately
bound Node and Git executables;
its digest is `d1fda9ef8cf848f7b97502de5f500d4940befe0c5e93ed69b3fb809ce2a57229`.
A digest identifies tested bytes; it is not runtime approval.

Installation-copy/wrapper tests passed **35/35** in 12723.3775ms (session 71267,
exit 0); lint checked **585 files with zero failures** (session 10084, exit 0).
Automated A1–A4/A6 passed (session 20487, exit 0); A5 remains manual. This is
scoped implementation verification, not whole-suite or operational qualification.
Main logs and frozen metadata use the
`local-history:unknown-knowledge-assignment-continuation-` prefix.


Main independent integration passed **215/215** in 266107.433875ms (session 64716,
exit 0), with zero skips or cancellations. Node 24.19.0 ran
`--test --test-concurrency=2` over the six capture/continuation suites, nine legacy
assignment/retained/final/review/publication suites and four actual reconsideration
gate/core/provenance suites. The frozen JSON records all eighteen overlay hashes
and the 298-file runtime inventory. The log retains individual cases; this result
does not replace the historical full-suite receipt or close broader P1–P11 work.
