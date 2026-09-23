> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Fresh final assignment evaluation and publication

The final phase preserves the original retained validation report. A failed
initial route-required check remains failed. `runFinalPreparedAssignmentGate`
performs a new actual gate run inside the captured trusted runtime; both review
recording and publication rerun it and compare the whole reviewed result.

The [optional ordinary continuation](ucs-1241-assignment-continuation.md) carries
retained assessment/material captures through this same Knowledge-only profile.
Original input presence requires the closed version-2 owner report and matching
continuation digest in both prior readback and fresh output. Each worker uses
one bounded wire admission; source checks and both governance evaluations reuse
its owned evidence. The outer final result, review envelope and publication
policy remain unchanged. Omitted inputs keep their original version-1 path.

The [typed existing-record profile](ucs-1241-typed-assignment-publication.md)
uses this same operation and final entrypoint. Its original retained `selection`
chooses a separate fixed typed policy only after actual input/source/candidate/
runtime binding. It carries mixed K/O/D selection through the existing workers
and requires the fixed all-installed-store replay recipe. Omitting selection
preserves the Knowledge profile described below; event rows cannot select a policy.

A plausible rehashed retained counter can pass structural/bounds validation;
that predicate does not certify historical measurements. The mandatory fresh
owner produces actual measured usage and source/assignment evidence. Review and
publication compare the full reviewed final result, and source loss after
retention or review fails actual revalidation. The legacy parent runner cleanup
diagnostic is not an additional owner/final cleanup attestation.

## Final gate input and execution

```js
{
  repoRoot, evidenceDirectory, validationBundleDigest,
  expected: {source, candidate, operation: 'subject-assignment', runtimeDigest, reportDigest},
  approvedRuntimeProfile,
  limits: {evidence, runtime}
}
```

Evidence limits are the four existing retained-readback limits. Runtime limits
are `maxRuntimeFiles`, `maxRuntimeBytes`, `maxOutputBytesPerCheck`, and
`maxCheckMilliseconds`, all explicit positive integers (check timeout at most
600000ms). The shared worker boundary retains its aggregate process timeout of
three check allowances plus 10000ms, one private process group, combined
stdout/stderr cap, descendant cleanup and fixed environment. Filesystem and
native host trust have the existing P1 boundaries; these are not new whole-host
memory or I/O guarantees.

The parent recovers operation inputs exclusively from the verified fixed input
artifact and corroborates its injected digest. It requires actual completed
structural/value checks and actual retained event provenance. It invokes the
runtime-capability verifier itself using external independently approved
configuration. Unavailable capability cannot establish route applicability.

The parent then captures the current trusted distribution using operation
`subject-assignment`. Its complete manifest must equal the reviewed runtime
digest, including native executable bindings. `final-assignment-check.js` must
be in that exact captured file inventory. The fixed child verifies the actual
runtime before and after running P8's actual prepared gate. No caller can select
its command, entrypoint, models, required-check list, or capability outcome.

Only actual established unsupported kit-managed route persistence permits the
internal required list to omit routes. If the recovered impact object has its
own `routes` property, all three classes remain required, including for null or
malformed values; a supplied incomplete route report cannot become absence.
Views and representative replays always remain required.

A view class marked complete is insufficient when it did no work. Final policy
requires at least one actual complete Subject-tree assessment, two derivation
calls per assessed pair, and the complete distinct `subjects/derived/tree.md`
and `subjects/derived/metadata.json` artifacts on each side. Overall supplied
view coverage must still be complete. The existing factory owns rendering,
hashes and completeness; this consumer does not duplicate them. Empty or
unrelated-only supplied views cannot waive this required surface.

After the fresh gate, the fixed child recaptures the actual candidate event in a
verified tree snapshot using P1's regular-file bounded reader. The parent checks
its whole path/size/SHA256 against retained raw bytes. This matters because the
semantic assignment event digest excludes review metadata. Rehashing a modified
retained review reference does not make it the committed candidate event.

## Closed final result

```js
{
  version: 1, kind: 'final-prepared-assignment',
  policy: {id, version, digest},
  source: null /* or verified descriptor */,
  candidate: null /* or verified descriptor */,
  runtimeDigest: null /* or actual matched digest */,
  capability: null /* or {profileDigest, resultDigest} */,
  routes: {
    scope: 'kit-managed-subject-route-persistence',
    managedPersistence: 'unavailable' /* or 'not-applicable' */,
    suppliedAssessment: null /* or 'not-supplied', 'complete', 'incomplete' */
  },
  gate: null /* or the complete unchanged actual fresh P8 report */,
  status: 'failed' /* or 'passed' */,
  diagnostics: [{code}]
}
```

Null fields do not echo expected values as observed proof. Supplied assessment
absence is reported only after actual input recovery. A valid failed fresh gate
is preserved in full. Runtime drift, incomplete evidence, interrupted output,
missing raw event binding, missing actual views/replays, and cleanup failure
cannot produce a passed result. Unexpected child exceptions propagate with
bounded execution diagnostics outside this retained JSON; expected timeout and
output exhaustion remain static failed results.

The report has no request or receipt digest, so embedding it in
`request.operationEvidence.finalGate` is acyclic. Its full canonical bytes must
fit explicit request/artifact limits; there is no truncation or automatic budget
increase. The scoped capability does not assert absence of external saved routes
or complete arbitrary client inventories.

## Publisher

```js
await publishPreparedCandidate({
  repoRoot, evidenceDirectory, validationBundleDigest, reviewBundleDigest,
  expectedRequestDigest, approvedRuntimeProfile,
  migration, approvedInstallationReview, // installation cutover only; otherwise omit as applicable
  limits: {review, execution, transaction}
})
```

Review is the seven-field review budget, execution the four-field final runtime
budget, and transaction the four-field bounded Git CAS budget. The publisher
reopens both exact bundles, reruns actual capability/final evaluation, verifies
the receipt's Decision/reference evidence against the actual committed event,
and requires fresh authorizer and candidate membership checks. P8's actual
fresh gate independently recaptures source and any declared historical Decision
bytes and performs the existing accepted-status/digest/eligibility checks.

Only then does the single bounded Git transaction verify the source and output
pins and update the output candidate ref. Its raw-parent, direct-ref and
worktree checks remain authoritative at the transaction boundary. Source refs,
user index and working files are preserved.

Results are `published`, `not-published`, or `publication-unknown`, with exact
source/output/candidate and validation/review/request/receipt coordinates when
verified. A lost commit acknowledgement never triggers rollback or infers
success from a later equality check. Publication retains a reviewed candidate
ref; it does not merge or activate Knowledge or replace the normal PR approval.

Identity migration v1 mechanical-only review still explicitly refuses
`migration-impact-unavailable`. The [v4 final migration profile](ucs-1240-final-migration.md)
adds actual historical semantic proof and requires a private `migration` input
on the publisher call. The reviewed full result/digest and actual namespace must
match the fresh final run before the same ref transaction can execute. Unexpected
migration worker diagnostics use static refusal, unlike assignment's bounded
diagnostic propagation, because migration inputs can contain private adjudications.

The tests publish only in disposable fixture repositories, using explicitly
synthetic fixture operator approval and approved profile configuration. No real
user candidate, remote ref, human approval, or activation is manufactured.

The [split publication profile](ucs-1240-split-review-publication.md) reruns its
actual Git/allocation review and fresh owner at publication, then binds the
event-independent Decision tuple to both the request and retained receipt.
Positive and zero-use branches use the same existing candidate-ref transaction;
neither a previously successful review nor integrity-valid receipt bytes waive
fresh verification. No source ref, index or working file is changed by that
transaction. This internal profile introduces no public CLI or MCP command.

The [equivalent-merge publication profile](ucs-1240-final-equivalent-merge.md)
uses the same transaction after its own fixed final gate. Its full actual joint
report, registry/event raw captures and Decision tuple must match the retained
review. Qualified unknown classifications remain qualified in the original report.

The [first ordinary promotion profile](ucs-1240-final-promotion.md) supports only
the actual Decisions-only proposal-to-canonical genesis branch. Its fresh owner
gate proves the capability predicate and exact promotion; optional Subject
impacts remain unassessed. It uses the same retained review and final CAS.

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

## Separate reconsideration profile

[Reconsideration publication](ucs-1240-reconsideration-publication.md) adds
`subject-reconsideration` through fixed retained/fresh workers and an independent
actual-Git review adapter. Its nine-field operation evidence binds both registry
and identity captures, one registry event, null assignment evidence and the full
selected Decision tuple. The prior refusal authorizer remains distinct.
Review and publication each recheck actual source provenance and allocation,
then compare the entire fresh final result before the unchanged ref transaction.
Diagnostic-only retained failures, plausible rehashed counters, cleanup failure
or lost historical sources cannot substitute for that fresh proof.

## Separate installation cutover profile

[Installation cutover](ucs-1240-installation-cutover.md) selects its own policy
when the private migration envelope contains installation inputs. Recording and
publication require the independently supplied source/candidate-bound
`approvedInstallationReview` as well as the existing runtime profile. Actual fresh
verification covers the complete file-role inventory, installed distribution,
supported operational consumers and literal launch bindings. The shared ref
transaction still publishes one candidate without touching client work or config.
The separate `verifyMigrationActivation` observes supported local state; publication
alone makes no activation claim. External consumer scope remains an independent
review responsibility and unknown required external consumers block.
