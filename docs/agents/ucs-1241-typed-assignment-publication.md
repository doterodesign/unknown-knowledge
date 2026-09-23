> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Existing-record K/O/D assignment publication

This completes retained transport and fresh publication for the existing typed
assignment owner. It follows the
[snapshot Decision](../../decisions/entries/assignment-snapshot-preservation.yaml)
and [ordinary continuation](ucs-1241-assignment-continuation.md). The operation
remains `subject-assignment`; there is no new worker family, caller policy resolver
or public mutation adapter. The isolated implementation base is
`6166a6a638181e99114c2dd6f8852f805bd27357`.

## Original input selects the fixed policy

The prepared input has the original `eventId`, `reviewNote`, `decisionCaptures`,
`limits`, `impact` and `maxEventBytes`, plus an own `selection` for typed authoring:

```js
selection: { kind: 'typed-records', refs: [{ namespace, kind, id }] }
```

The nonempty dense array contains unique exact canonical K/O/D references; mixed
store selections are allowed. Accessors, sparse arrays and malformed/inherited
selectors refuse. Omission retains the original Knowledge-domain path. Optional
`continuation` retains its existing sole assessment/material location and explicit
governance capacities. Omitted continuation uses owner report version 1; present
continuation uses version 2, its original digest and actual cumulative allowance.
Event schema version 2 and `operation: existing-subjects` remain unchanged.

The fixed workers carry the original selection into the existing owner. At final
execution and review, [prepared-assignment-binding.js](../../payload/engine/lib/prepared-assignment-binding.js)
first verifies canonical retained input bytes, the actual source/candidate/runtime
bindings and the completed operation's injected-input digest. Only then does own
selection presence choose the top-level `typedSubjectAssignment` descriptor:
`typed-subject-assignment-publication-v1` with `typed-assignment-replay-v1`.
The existing `operations.subject-assignment` object and digest are unchanged.
Caller policy claims and event rows cannot select this profile.

The binder accepts native retained readback at fixed internal call sites; it is
not a branded authority object or an independent public publication gate. Parsed
report predicates prove shape and binding plausibility. Fresh owner execution at
both review and publication supplies the actual source and semantic proof.

## Preserved record and source obligations

Every selected record must exist with the same effective lifecycle on both sides.
The owner independently matches the reviewed selection to the complete event row
set, reasons, revisions and captures. Native report rows follow selection order;
the retained event preserves its own authored order. Grouped O/D edits compare the
union of selected subject spans and preserve unselected siblings. Knowledge keeps
its exact permitted review-note suffix. Bodies, citations, source pointers,
evidence dates, applicability, Decision reasoning and lifecycle remain unchanged.
Identity and registry bytes are unchanged; this path performs no allocation.

Structural and value gates remain required. Classification does not establish
fresh world/artifact truth, so no new `today` or promotion-style trusted-preflight
contract is added. Current effective authorizer checks and existing protected-file
restrictions remain native. There is no fabricated Decisions preflight.

Continuation reuses its single owned three-family admission and authentic
governance allowance. Source-bearing captures bind actual historical files;
source-less/mixed pairs retain actual-side correspondence. All supplied declarations
are checked; omitted unrelated history is not fetched. Additional physical reads
are charged by the existing continuation owner. Native loading, history/preservation
and independent impact work keep their documented exclusions: this increment
does not claim one end-to-end CPU, I/O or report-byte budget.

## Fixed typed replay and final capability

The new fixed `compareTypedAssignmentReplays` shares private recipe mechanics and
the native query comparator with the unchanged Knowledge entrypoint. It includes
every actually installed store, requiring the same store availability on both
sides, current/all views and direct/descendant expansion. The complete canonical
Subject union is assessed before forming operands; unavailable evidence cannot
silently reduce the inventory. Identical allowed inactive outcomes remain explicit.

For `R` stores and `E` verified eligible Subjects, reserve
`C = R * 4 * (4 + 2E + 4 * max(E - 1, 0))` cases, each with two native queries.
The four baselines are all, none, subjects-present and its negation. Unary cases
are assigned and negated assigned. Adjacent eligible IDs supply AND, OR and both
directional AND-NOT cases. Limits reserve the full case/byte inventory; native
query capacities remain per-call. Reported counters are observed native results,
not a whole-process measurement or an independent expected-result evaluator.

Complete strict and possible membership deltas must stay within actual changed
assignment owners. All/none membership is invariant. Rank/explanation outputs and
unaffected ordinal shifts remain visible. Unknown metadata stays unknown; explicit
empty stays known empty. Incomplete query/explanation or comparison output cannot
satisfy the mandatory replay obligation. This finite recipe is a consistency
check, not exhaustive semantic coverage.

Preparation cannot waive route assessment. Fresh final verifies the actual runtime
capability before treating unsupported managed route persistence as not applicable;
supplied routes still require complete assessment. Complete subject-tree evidence,
actual event capture, fresh final equality, retained review authorization and
unchanged atomic source/output ref transactions remain mandatory. Cleanup failure
cannot return success. Tests publish only disposable fixture refs.

## Verification and scope

The first actual RED closed session 93032 with exit 1: **0/3**, **4720.174958 ms**.
Each native typed raw control passed before the parent rejected the new retained
selection. The initial retained/final controls closed session 10869 with exit 0:
**3/3**, **28484.701916 ms**. An intermediate test incorrectly expected preparation
to waive routes; only that assertion changed. The expanded actual controls closed
session 31633 with exit 0: **7/7**, **106762.203416 ms**, including mixed K/O/D,
SHA-256/nested continuation, Decisions-only publication and literal T/F/U outputs.

A new selector-accessor test reproduced getter execution before rejection. The
parent now validates the own data descriptor before canonicalization. Its targeted
GREEN closed session 73941, **2/2**, **2559.676625 ms**. The other initial failure
was a test oracle correction: native report row order follows selection, while
the event retains authored order. It was not a production ordering bug.

The focused new-boundary/existing-typed run closed session 75880 with exit 1:
**15/16**, **36372.055 ms**. Its sole failure pinned the old unsupported-replay
diagnostic. That existing test now requires the new fixed recipe and checks
invalid-capacity refusal; its named rerun closed session 58339 with exit 0,
**1/1**, **1205.68525 ms**.
Original failed logs are retained. Fixture-only note wording and an incorrect test
import were also corrected before the expanded GREEN; neither was a runtime fix.

The final owner suite closed session 32964 with exit 0: **12/12** in
**114552.389833 ms**, with no failures, skips or cancellations. The exact command
was `PATH=local-history:bin local-history:node --test --test-concurrency=1 tests/typed-assignment-publication.test.js tests/typed-assignment-retained-binding.test.js`.
Its log is `local-history:unknown-knowledge-typed-assignment-owner-final.log`.
Post-run custody matched all frozen runtime files, overlays and both executables
with zero mismatches; the result is
`local-history:unknown-knowledge-typed-assignment-owner-custody.json`.
The independent suite closed session 44922 with exit 0: **13/13** in
**130983.130625 ms**, with zero pre/post mismatches across all 322 runtime files,
15 owner overlays, both executables and its own test file. Actual mixed continued
SHA-1/root and SHA-256/nested controls exercised receipt/publication, historical
Decision/material source loss at fresh review and publication, restored publication,
same-tree/different-commit source CAS, output CAS and unchanged index/worktree.
The noncontinued mixed control refused old-policy substitution, a rehashed supplied
final policy, and resealed removed/narrowed/null selection or different source.
Those artifact attacks prove original injected binding, not historical measured
execution. The log is `local-history:unknown-knowledge-typed-assignment-p2-frozen.log`,
SHA256 `125081e6a5d52adadb6cf4be9174dc202db2545c8aa28634584f94ec3a9023d5`;
the receipt is `local-history:unknown-knowledge-typed-assignment-p2-receipt.json`.
A mistyped version-probe path exited 127 before tests; it did not run or restart
the independent suite. The actual test used the required Node 24 and PATH.

Main's 18-file generic checkpoint completed with **125/126 passing** in
**779297.320083 ms**, exit 1, and zero frozen-source mismatches. All actual typed
publication, retained-binding, independent review and promotion controls passed.
The sole failure was the old assertion that retained typed selection must be
unsupported. Since that input is now accepted, it reached the test's nonexistent
`unused-evidence` directory. The original failed log is
`local-history:unknown-knowledge-typed-assignment-integration.log`, SHA256
`87abe9429f14ca9217e9aee0db3ba009476a1c42aaa555de9b6aa01bd2d99450`.

The narrow replacement keeps a valid-descriptor control and requires actual
parent rejection of an extra field, empty references and duplicate references
before evidence access. Existing actual mixed-store continued publication tests
supply positive execution coverage. The focused correction passed **1/1** in
**965.208167 ms**, exit 0, against runtime bytes matching main; its log is
`local-history:unknown-knowledge-typed-assignment-expectation-corrected.log`.
The first replacement run retained an obsolete diagnostic regex and failed;
that log remains `unknown-knowledge-typed-assignment-expectation-green.log`
despite its misleading filename. No production change or full rerun was needed,
and the original 125/126 receipt is not relabeled as an all-green batch.

The freeze
at `local-history:unknown-knowledge-typed-assignment-freeze.json` pins 322 native
runtime/dependency files, 15 source/helper/test overlays and Node/Git executables.
Owner tests are [typed-assignment-publication.test.js](../../tests/typed-assignment-publication.test.js)
and [typed-assignment-retained-binding.test.js](../../tests/typed-assignment-retained-binding.test.js);
the independent file is [typed-assignment-publication-review.test.js](../../tests/typed-assignment-publication-review.test.js).

Fresh-identity union/broadening, proposal refusal/reversal acceptance and remaining
registry-transition publication remain separate required work under the
[clarified lifecycle scope](subject-lifecycle-required-scope.md). The separate
[zero-use equivalent-merge profile](ucs-1240-equivalent-merge-zero.md) is now implemented.
Standalone material inventory is not an additional public
completion gate. This evidence grants no runtime/customer approval or release.
