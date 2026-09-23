# Retained split validation and fresh final checks

This slice extends the [split transport](ucs-1240-prepared-split-transport.md)
under the proposed [publication Decision](../../decisions/entries/ucs-1240-split-publication.yaml).
It provides fixed prepared and final workers, retained artifacts and a fresh
final verification gate. Candidate review, publication and ref transactions are
implemented in the separate [review/publication profile](ucs-1240-split-review-publication.md).
No runtime approval is generated from observed
files; approved runtime configuration remains separately supplied.

For [material continuation](lifecycle-material-continuation.md), both workers
call the fixed wire owner, preserving one capture decode and the original
material-selector/report-version binding. Fresh final execution repeats actual
source checks. Retention of a plausible version-2 report cannot replace them;
the original policy, runtime and capture limits remain unchanged.

## Fixed entrypoints and input

Use the existing `runPreparedCandidateChecks` API with operation `subject-split`:

```js
await runPreparedCandidateChecks({
  repoRoot, source, candidate, operation: 'subject-split',
  operationInputs: { gateInput: originalSplitWire, captureLimits: {
    maxRegistryBytes, maxIdentityBytes, maxEventBytes,
  } },
  limits: { maxRuntimeFiles, maxRuntimeBytes, maxOutputBytesPerCheck, maxCheckMilliseconds },
  evidenceDirectory,
});
```

The runner detaches input before asynchronous work. The fixed decoder admits the
original wire unchanged, including its original before assessment pair; no
recapture repair or deduplication occurs. All three capture capacities are
positive even on zero use; the identity cap applies only to the candidate.
Runtime process limits, owner limits and retained-evidence readback limits are
separate allowances, not one whole-process accounting claim.

The runtime inventory requires the split owner, transport and both real workers.
Literal engine/worker selectors choose
[prepared-subject-split-check.js](../../payload/engine/lib/prepared-subject-split-check.js)
and [final-subject-split-check.js](../../payload/engine/lib/final-subject-split-check.js).
No caller path, callback, executor or serialized successful core selects code.
Existing envelope versions and older operation policy objects are unchanged.

## Retention and refusal

The prepared child runs the actual split gate and emits exactly its JSON plus a
newline, with exit 0 for success or 1 for a completed owner refusal. Retention
binds original input, capture limits and injected digest, stdout/stderr/result,
the actual runtime and structural/value checks. Candidate captures come from a
verified snapshot via stage 1. The worker completes capture before saving owned
0400 authority files.

Both successful branches retain `checks/operation/registry.yaml` and
`checks/operation/identity.yaml`. Positive use also retains `event.yaml`, even
when mapped owners deliberately select empty replacement lists. Zero use forbids
an event artifact, including empty files and broken symlinks; pre-existing
historical assignment files inside the candidate are unaffected.

The split parent validates exact owner stdout/result/exit correspondence and
retains those same verified stream buffers. It does not re-read operation streams
after validation. The split parent uses existing `readOwnedFile` at the three fixed worker artifact
paths. It checks no-follow, regular-file, owner, 0400 mode and size before reading,
and detects growth beyond capacity. Old retirement readback behavior is unchanged.

A completed valid failed owner can be retained diagnostically only: exit 1 must
match the exact failed report bytes, and no registry/identity/event success
artifacts may exist. Malformed, interrupted or contradictory output refuses the
runner. Structural/value failures may coexist with authentic owner success and
its captures, but cannot pass final verification. A successful owner followed
by capture failure is not converted into a diagnostic-only completed result.
All retained reports remain `validationComplete:false` and `publicationReady:false`.

If private runtime cleanup fails for split, the call rejects with `EngineRefusal`
rather than returning an acknowledgement. Already retained evidence is not
removed or retried. The bundle does not attest to previous parent cleanup; no
cleanup DTO, receipt or reordered retention protocol is introduced. Other
operations retain their existing behavior.

## Fresh final gate

[runFinalPreparedSubjectSplitGate](../../payload/engine/lib/final-prepared-subject-split.js)
accepts only:

```js
{
  repoRoot, evidenceDirectory, validationBundleDigest,
  expected: { source, candidate, operation: 'subject-split', runtimeDigest, reportDigest },
  approvedRuntimeProfile,
  limits: { evidence, runtime },
}
```

Its result is `{version,kind,policy,source,candidate,runtimeDigest,capability,gate,
status,diagnostics}`, with kind `final-prepared-subject-split` and status `passed`
only after all checks complete. It requires verified evidence, exact policy and
runtime correspondence, complete passed structural/value/operation checks,
original input binding, bounded required capture members, and the separately
approved route profile. Capability remains limited to unsupported
`kit-managed-subject-route-persistence`; external inventories stay unknown.

The final child verifies runtime before/after, decodes original wire and reruns
the actual split owner. Successful output is canonical
`{version:1,gate,captures:{registry:{size,sha256},identity:{size,sha256},event}}`,
where event is its summary or null. Failed owner output has `captures:null`.
The parent requires bounded successful child completion, no unexpected stderr,
exact fresh whole-owner equality and exact capture summaries. Raw replay
expected-refusal incompleteness and qualified reach remain unchanged; the owner
still says `publicationReady:false`. Final runtime/snapshot cleanup failure
revokes final success even if the owner passed.

This rerun supplies actual source and allocation checks through the existing
owner. It is not the later independent review allocation invocation, a review
receipt, publication approval or ref CAS. Those remain a separate slice.

## Validation receipt

The actual initial fixed-registration RED was 0/1, exit 1, 32.153042 ms. The
four real SHA-1/root and SHA-256/nested positive/zero fixtures then reproduced
the unsupported-runner boundary (0/4, exit 1, 3063.831042 ms).

The completed owner run is **26/26 PASS**, exit 0, 164058.154625 ms, using
Node 24.19.0:

```sh
node --test tests/prepared-split-validation.test.js \
  tests/final-prepared-subject-split.test.js
```

It covers the four actual runner/retention/fresh-final branches, exact physical
capture capacities, mandatory real worker availability, missing/drifted retained
artifacts, policy/runtime/profile bindings, coherently resealed identity and
resource reports rejected by fresh whole-report comparison, forbidden zero event,
and final cleanup revocation. A real `enumerates` value mismatch also proves
that authentic owner success/captures cannot override an ordinary value failure.

Main's separately owned depth regression reproduced two retained-artifact
canonicalization overflows after an actual passing control, then passed **3/3**,
exit 0, 15951.173458 ms. The fix adapts only canonical encoding failures to
`EngineRefusal`. P2 independently owns
[the parent runtime matrix](../../tests/prepared-split-runtime-review.test.js),
including physical artifact and failed-owner/cleanup boundaries. Its actual REDs
exposed null check-row destructuring and second-read stream replacement; the
fixes enforce the fixed three-check inventory and retain verified stream buffers.
Main owns combined shared/legacy checks and exact acceptance allowlist pins;
no review/publication execution or full acceptance campaign is claimed here.

P2's final independent parent run passed **26/26**, exit 0, 176953.169416 ms:

```sh
node --test tests/prepared-split-runtime-review.test.js
```

Its corrected targeted RED was 8/11 and full pre-fix RED 23/26 (two defects plus
one enclosing failed test). The final run covers exact-cap/oversize-before-read
and growth, regular 0400 files, symlinks, zero forbidden artifacts, exact failed
owner bytes/exit association, and both parent cleanup branches preserving evidence
while refusing acknowledgement. An earlier interception recursion was a test
harness failure, not a production RED; its logs were preserved separately.

The scope audit added one explicit positive **all-empty replacement selections**
case. It uses the existing `beforeChange` hook to set every owner’s successors to
`[]` before mappings and candidate/event bytes are authored; it does not use a
nonexistent `subsets` option or change shared fixtures. Original effective source
assignments remain present, unrelated candidate IDs are preserved, and a non-null
assignment event with nonzero raw rows is still mandatory. Actual runner,
retention and fresh final verification pass.

That named addition passed separately: **1/1**, exit 0, 12185.259708 ms:

```sh
node --test \
  --test-name-pattern='^positive split with all-empty replacement subsets still requires an assignment event$' \
  tests/final-prepared-subject-split.test.js
```

Coverage is the prior **26-test run plus this separate 1-test run**, not a claimed
single 27-test invocation. Runtime and shared fixture files stayed unchanged.
