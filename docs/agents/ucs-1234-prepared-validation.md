> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Trusted prepared validation runner

`runPreparedCandidateChecks` in `payload/engine/lib/prepared-validation.js` runs
actual fixed checks against exact existing source/candidate commits. It does not
modify refs, the user index, or the user worktree. A retained result is evidence
of execution, never publication or human approval.

The rationale and ownership boundaries are recorded in
[the P1 Decision record](../../decisions/entries/retained-runtime-validation-and-publication.yaml).
Its runtime proposal distinguishes integrity, actual execution, independent
runtime approval and final publication. A new operation needs explicit admission
through capture, fixed worker dispatch, artifact retention and readback; an
existing operation branch cannot implicitly certify it.

The [equivalent-merge profile](ucs-1240-final-equivalent-merge.md) now uses its
own fixed operation entrypoint and exact owner wire, with separately bounded raw
registry/event retention. Operation selection accepts literal strings only;
nonstring inputs never invoke caller coercion. Its final review/publication
checks remain separate from this validation runner.

The [plain-retirement profile](ucs-1240-final-retirement.md) uses a distinct fixed
entrypoint with the original owner wire and both explicit capture limits. It
retains the raw registry on both branches and an assignment event only for
positive use. Zero use requires the exact eventless preservation proof, never a
fabricated empty event. Shared validation/evidence envelopes remain version 1.

The [prepared split gate](ucs-1235-subject-split-gate.md) now implements the
internal domain composition, including eventless registry-plus-identity proof.
Its [fixed transport](ucs-1240-prepared-split-transport.md) now validates original
wire/report consistency and bounded raw candidate registry, identity and event
bytes. The [fixed split worker profile](ucs-1240-prepared-split-validation.md)
adds explicit runtime dispatch and retained artifacts, including both raw
registry and identity on success. Completed valid owner refusals retain only
diagnostics with exact emitted-byte/exit association. The separate final gate
requires actual fresh owner/report/capture equality and the runtime capability.
The [split review/publication profile](ucs-1240-split-review-publication.md)
performs the separate actual Git/allocation review, approval recording and
ref-CAS publication. A failed parent cleanup rejects the split call acknowledgement; an
already retained bundle remains evidence, not a parent-cleanup attestation.

The [reconsideration profile](ucs-1240-reconsideration-publication.md) likewise
has fixed prepared/final workers and eventless registry-plus-identity retention.
It accepts the original seven-field gate wire and two positive capture caps;
the core owns one reserved decode per supplied occurrence. Failed owners retain
validated diagnostic bytes only, while successful owners require both actual
candidate artifacts. Review and publication independently verify four actual
authority captures and rerun the complete final proof.

The [ordinary creation profile](ucs-1240-subject-creation.md) adds fixed
`subject-creation` workers for fresh activation and unrefused proposal promotion.
It shares eventless capture, retained-report and fresh-final mechanics with
reconsideration, while keeping a separate domain validator, operation and policy.
Its two retained artifacts are the candidate registry and identity ledger;
the original wire binds one fresh Subject and an explicit null assignment event.

The [metadata profile](ucs-1240-subject-metadata-publication.md) adds the literal
`subject-metadata` operation with the same seven-field gate wire and an explicit
positive `maxRegistryBytes` capture limit. It retains the registry only;
identity and assignment artifacts are forbidden. The shared eventless readback
preserves original reconsideration behavior, while fixed metadata workers and
fresh review prove the actual registry-only transition and native effects.

The [proposal-suppression profile](ucs-1240-subject-proposal-suppression-publication.md)
shares these registry-only mechanics through fixed named entrypoints. Its literal
`subject-proposal-suppression` operation binds a `suppress` event, distinct impact
and publication policies, and the actual before-model proposal state. It retains
no identity or assignment artifact. Suppression and metadata cannot substitute
for each other by changing or rehashing an outer operation label.

The [Decisions-only promotion profile](ucs-1240-final-promotion.md) also has a
fixed entrypoint. It retains the original owner wire/report and raw creation
event, with a separate envelope digest binding the event-retention limit.
Its final gate requires the actual Decisions-only genesis capability; the outer
`ordinary-promotion` spelling does not admit K/O or classified promotion.

The [K/O byte planner](ucs-1234-typed-promotion-planner.md) prepares exact changes
with fixed Knowledge/Ontology lifecycle policies. Its result always has
`publicationReady: false`; it does not add a typed promotion operation to this
runner or substitute for preflight, assignment history or final publication.

The [Ontology typed gate](ucs-1241-typed-promotion-design.md) now supplies those
domain checks through `runPreparedRecordPromotionGate`. The distinct
[`typed-record-promotion` transport](ucs-1240-final-record-promotion.md) now retains
its exact wire/report and raw creation event, using the same two-field envelope
as ordinary promotion. The v3 policies select homogeneous K/O/D, retaining the version-2 owner report
and explicit Decision preflight inapplicability. Its separately reviewed final policy requires fresh domain evidence
and current runtime approval before candidate publication.

```js
await runPreparedCandidateChecks({
  repoRoot,
  source: { commit, tree, kitPath },
  candidate: { commit, tree, kitPath },
  operation: 'identity-migration',
  operationInputs: { migrationInputs, limits: migrationLimits },
  limits: {
    maxRuntimeFiles: 1000,
    maxRuntimeBytes: 20_000_000,
    maxOutputBytesPerCheck: 1_000_000,
    maxCheckMilliseconds: 20_000,
  },
  evidenceDirectory,
});
```

Both exact commits must corroborate their own supplied trees and selected kit
layouts. The source can be legacy data; the candidate receives actual active
structural and value validation. No caller commands, runtime paths, models,
callbacks or success flags are accepted. Limits are positive safe integers;
per-check timeout is at most 600000ms. Output limits cover stdout plus stderr;
exhaustion retains the captured prefix as interrupted evidence. Actual exit
codes are retained without remapping, including values outside 0–2. Only a
normal zero exit with expected JSON can pass.

For `subject-assignment`, `operationInputs` is exactly:

```js
{
  eventId, reviewNote, maxEventBytes, // explicit positive one-file retention read cap
  decisionCaptures, // existing JSON transport: {capture,bytesBase64,objectFormat}[]
  limits, // actual assignment gate's maxRecords/maxCaptureBytes/maxRedirects
  impact: { /* optional routes/regeneratedViews/representativeReplays inputs from the real gate */ }
}
```

It also accepts the optional closed
[`continuation`](ucs-1241-assignment-continuation.md) group. Its assessment and
material captures use canonical base64 wire fields; top-level Decision captures
remain the sole Decision location. Both fixed workers use the shared wire owner
to reserve bytes before one decode and reuse the resulting owned evidence.
The version-2 owner report is required only when that original input is present.
The worker and parent check its exact input digest, source descriptors, closed
shape and plausible bounded counters; the parent uses the already verified
bounded output buffer. A malformed supplied group cannot fall back to the old
version-1 report. Outer validation/evidence versions remain unchanged.

Retained counters are not authenticated historical measurements merely because
they pass bounds. The [fresh final gate](ucs-1240-final-publication.md) independently
checks actual sources and assignments and reports fresh measured work. The
[typed assignment branch](ucs-1241-typed-assignment-publication.md) now accepts
an original own-data mixed K/O/D selection in this same operation. Fixed workers
retain that selection; final execution and review bind it before choosing the
typed policy. The original Knowledge policy remains unchanged when omitted.

The actual `runPreparedAssignmentGate` (or its continuation wire entrypoint) is
invoked in a fixed child.
The trusted shim always requires routes, regeneratedViews and
representativeReplays. There is no caller `required` override. Its whole report
is retained, including derived scope, historical exclusions, row outcomes,
resource usage, partial impact coverage and humanApproval:not-performed. Missing
replay support remains a failed required impact check. Empty supplied inventories
cannot establish independently complete installation coverage. The runtime must
include P8's released adapter (`019ab46`, integrated in main `3f31fa4`) and its
dependencies. The runner refuses assignment execution if that gate is absent.

Migration `operationInputs` is exactly `{migrationInputs, limits}` using the
released `runPreparedMigrationGate` contract. The actual gate runs as the third
fixed check, retaining its unchanged safe report and its `validationInputDigest`.
There is no second runner input digest or retained migration input artifact.
Temporary correspondence and replacement adjudications cannot enter this bundle.
The private job file is removed before retention, and the owned input reference
is released; caller-owned inputs are not mutated and this is not secure erasure.

Only the gate's closed safe wire report, emitted exactly as JSON plus LF with
empty stderr and matching exit status, is retainable. Failed mechanical reports
remain retainable failures. Crashes, interrupted output, stderr, malformed or
extra output refuse the entire retention attempt with `unsafe-migration-output`.
Historical migration runtime manifests with unavailable operation entrypoints
remain readable as historical evidence, without upgrading their check status. `validationComplete` and
`publicationReady` remain false in this slice, including when validators pass.

The separate [final migration profile](ucs-1240-final-migration.md) now requires
version-3 publication evidence, including actual historical/current operational
document validation and unchanged Phoenix edition accounting. Its closed semantic
report is version 2. This adds no fields to the mechanical runner input or report;
the final worker receives the private choices again and verifies their binding.

## Execution trust boundary

The runner copies its own installed engine, schemas, package.json and actual
resolved js-yaml package. Every copied regular file is bounded, hashed, verified,
and retained; symlinks/special files refuse. The unused js-yaml CLI is captured
but never executed; its argparse dependency is not used by the fixed checks.
New executed dependencies need reviewed packaging.

POSIX macOS/Linux use trusted `process.execPath` and `/usr/bin/git`, resolved to
realpaths outside the repository. Their exact file hashes, versions and Git
exec-path are recorded and rechecked before child checks and report completion.
Native libraries, Git runtime support and concurrent host administration remain
an explicit trusted-host boundary; this is not a hermetic OS sandbox.

A private runtime under the resolved system `/tmp` ignores ambient TMPDIR. Child
environments are constructed from empty: private node/git-only PATH, HOME,
XDG_CONFIG_HOME and temporary paths, C locale, UTC timezone, disabled Git global/
system config, no replacements/lazy fetch/prompts/optional locks, and the pinned
Git exec-path. No NODE_OPTIONS/NODE_PATH, preload or ambient Git routing settings
are inherited. Worker descendants occupy a private process group which is killed
before runtime cleanup. Unexpected worker bugs retain their original stack in
execution stderr; they do not become successful checks.

## Persistent evidence

The caller supplies an existing runner-owned mode-0700 managed directory outside
the repository and disposable runtime, and owns its persistent lifetime. Its
root cannot be a symlink or special file. Normal system ancestor aliases are
resolved once. Cooperative writers use this protocol; administrator/owner
mutation behind it is outside the trust boundary. Local filesystem hardlinks,
exclusive creation and directory fsync are required; no weaker fallback exists.

Artifacts are finalized mode0400/fsynced staging files, installed without
replacement at `blobs/sha256/<digest>`. Existing content must match exactly.
The canonical manifest lists unique logical artifact paths, byte lengths and
hashes plus exact source/candidate, operation, runtimeDigest and reportDigest.
Its no-replace hardlink at `bundles/<bundleDigest>.json` is the completion marker.
Referenced blobs are read back before and after completion; directories are
fsynced before returning `retention.status:'retained'`.

A possibly linked marker with uncertain durability returns `retention-unknown`
and its bundleDigest. Never treat that status as retained. Final blobs/markers
are never automatically deleted or replaced. Staging cleanup failures are
reported separately without changing known completion status. There is no GC,
publication receipt or ref dispatch in this module.

Raw artifacts use `{kind:'detached-artifact',file,size,sha256}`. `file` is a logical
bundle path, not a filesystem authority or Git membership claim. Canonical JSON
uses the same exact UTF-8/no-newline bytes as `canonicalSha256`; raw stdout/stderr
and result bytes are never normalized. Runtime files, manifests, operation input,
actual outputs and canonical report are retained. The bundle excludes itself
and any later human receipt, preventing recursive hashes.

## Bounded retained readback

`readRetainedPreparedEvidence` in `prepared-evidence.js` reopens an existing
validation bundle, including a previously uncertain completion:

```js
readRetainedPreparedEvidence({
  evidenceDirectory, bundleDigest,
  expected: { source, candidate, operation, runtimeDigest, reportDigest },
  limits: { maxManifestBytes, maxArtifacts, maxArtifactBytes, maxTotalArtifactBytes },
});
```

The closed positive limits bound the manifest before parsing, the entire artifact
inventory before blob reads, each actual file read and the aggregate returned
artifact bytes. Managed root/file ownership, modes, regular files, canonical
manifest bytes and all expected bindings must agree. Every raw blob is checked
against its exact size/hash. Missing, corrupt, oversized or substituted symlink
objects refuse without repair or deletion.

The runtime manifest and report must have their exact canonical digests and
matching bundle bindings. Runtime file paths are unique and map to exact retained
runtime artifacts; fixed entrypoint rows use the same immutable inventory as
runtime capture. Every detached report capture matches exactly one manifest
artifact by logical file/size/hash. Git capture locators and domain references
are never treated as detached artifact paths. Raw output remains unmodified.

After successful content verification, files/directories are re-fsynced and read
back. Success returns `{status:'verified',bundleDigest,manifest,runtimeManifest,
report,artifacts:[{file,size,sha256,bytes}]}` with detached bounded actual bytes.
A durability failure returns retention-unknown and the bundleDigest; corruption
remains a refusal. This proves integrity/durability only. It does not authenticate
an author, establish that native executables still match this host, reevaluate
Git/domain checks, or convert failed/null/incomplete results into acceptance.
The future publisher retains those independent duties. Separate review bundles
are outside this function's version1 validation-bundle contract.

## Approved runtime capability correspondence

`verifyRetainedRuntimeCapability(readbackInput, approvedProfile)` in
`engine/lib/runtime-capability.js` performs the existing bounded readback itself.
It accepts no caller-created verified object. `approvedProfile` is null or trusted
orchestration configuration, independently reviewed before the operation:

```js
{ digest, profile: {
  version: 1, id: 'subject-route-persistence-unsupported-v1',
  scope: 'kit-managed-subject-route-persistence', persistence: 'unsupported',
  managedPaths: [],
  exclusions: ['caller-request-files', 'external-client-saved-routes', 'arbitrary-repository-json'],
  files: [{path, mode, size, sha256}],
} }
```

The digest is `canonicalSha256(profile)` over every claim and the complete
independently approved application inventory. Files use the exact retained
`runtime.files` shape, mode 0400 and unique UTF-8 path order. Added, removed or
changed files invalidate correspondence. The external approved profile lives
outside the captured application, avoiding self-reference. Observing runtime
bytes never automatically approves them. This helper authenticates neither the
person nor the procedure that adopted the trusted configuration.

The closed result has `version:1`, `kind:'runtime-capability-evidence'`, the scope
above, `externalInventory:'unknown'`, the same exclusions as `excludedScopes`,
and `captures:{source,candidate}` from the actual verified manifest. Established
results contain `status:'established'`, `persistence:'unsupported'`,
`supportedAuthorityPaths:[]`, `runtimeProfile:{id,version,digest}`, the verified
`runtimeDigest`, and `diagnostics:[]`.

Unavailable results contain `status:'unavailable'`, null persistence, authority
paths, runtimeProfile and runtimeDigest, and `diagnostics:[{code}]`. Codes are
`runtime-profile-unavailable`, `runtime-profile-mismatch`,
`runtime-inventory-mismatch`, or `retained-evidence-unavailable`. The last is
reserved for uncertain durability and has `captures:null`; expected descriptors
are never echoed as proof. Corrupt evidence retains the existing typed refusal.

This evidence concerns only the executing runtime's kit-managed Subject-route
persistence. It establishes neither external absence nor historical runtime
capability, and cannot replace actual Subject-tree generation/comparison or
approve publication. Post-readback review/publisher orchestration must bind and
recompute the result; this helper never mutates the completed validation bundle.

The optional assignment `impact.representativeReplays` field passes the exact
reviewed `{limits, queryBudgets}` request to the actual P8 fixed Knowledge replay
recipe. Its limits are `{version:1,maxSubjects,maxEligibilityRedirects,maxCases,
maxInventoryBytes}` and queryBudgets is the complete P4 budget DTO. The runner
adds no defaults, caller cases or store overrides. Combined check stdout/stderr
remains bounded by `maxOutputBytesPerCheck`; interruptions cannot become complete
operation results. Successful raw reports retain all actual query outputs/deltas.

## Exact assignment event artifact

Assignment inputs require positive safe integer `maxEventBytes`. After a complete
actual gate result, the worker corroborates its prepared-only `eventSource` hint
against source/history checks, actual source/candidate descriptors and the fixed
UUID path. Inside the independently verified candidate snapshot it opens one
regular event file with O_NOFOLLOW, admits its size before reading, reads bounded
chunks, and verifies strict UTF-8 plus shared event metadata and semantic digest.
This cap applies to retention reads only, not earlier parsing or materialization.

The exact raw file is retained as `checks/operation/event.yaml`. The outer report's
`eventSource` is `{file,eventId,eventDigest,candidate:{commit,tree,kitPath},capture}`
with a detached artifact capture. The raw P8 gate result remains unchanged. A
missing/mismatched/over-limit source yields null and static diagnostic
`assignment-event-unavailable`, with no partial event artifact. Earlier worker
failures also yield null. Retained failed domain checks are never upgraded.

Historical bundles need not contain the new artifact. A publisher requiring event
evidence must reject its absence; existing recursive readback verifies the new
detached capture's actual membership and bytes. Review bundles keep three files.
