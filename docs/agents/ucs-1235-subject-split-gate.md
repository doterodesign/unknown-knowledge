> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Prepared Subject split gate

`runPreparedSubjectSplitGate(input)` in
[`subject-split-gate.js`](../../payload/engine/lib/subject-split-gate.js) composes
the closed [split request](ucs-1235-subject-split-design.md), actual Git core,
positive assignment preservation and mandatory retrieval impacts. This is an
internal read-only library API. It does not approve or publish a candidate.
The [split Decision](../../decisions/entries/plain-subject-split.yaml) records
the rationale and rejected alternatives.

An own `evidence.materialCaptures` array selects the
[continued profile](lifecycle-material-continuation.md), with outer report
version 2 and one authentic governance allowance from capture admission through
the core, inventory and assignment rows. Omission retains the version-1 profile
described below. Both profiles preserve the native allocation and impact policies.

## Fixed composition

Both input descriptors must identify actual commits with their exact trees and
installation paths. Admission detaches and digests the complete original request
except `repoRoot`. A caller cannot supply a model, core report, executor, allocation
proof or impact waiver. The core and its results arise only from the fixed actual
snapshot composition. An ordinary serialized core report is not an authenticated
capability and is never accepted through this API.

When direct assignments change, the fixed positive P8 adapter runs once. It must
prove complete typed owner scope, actual history and captures, exact ordered
substitution and rationale, full Decision correspondence, Knowledge revision notes,
grouped O/D preservation and all changed paths. Its actual event and candidate
must equal the original request. The outer gate requires this success before
running its mandatory impacts; core success alone is insufficient.

With no direct uses, the gate loads actual raw models and runs the core once,
without positive P8 setup. It independently requires empty actual assignments,
empty mappings and null assignment intent. The only changed paths must be exactly
the actual `_identity.yaml` and `subjects/registry.yaml`, in Git's path order.
Extra files, modes, deletion, renames and assignment-history additions refuse.
Actual allocation, authority bytes and modes have already been proven by core.

Before attachment, the remaining closure capacity must admit one complete proof:

```js
{
  inputs: { before, candidate }, operationDigest,
  registryFile, identityFile, changedPaths, inventoryDigest
}
```

Its digest binds the exact actual candidate through the input commit/tree and
allocation proof. No second allocator or ledger hash substitutes for those
proofs. A capacity failure retains no oversized proof. Only a passed proof permits
the separate `zero-effective-direct-use` assessment. There is no fabricated
assignment report or empty event. Empty successor choices on existing owners are
still positive assignments and require their real nonempty event.

## Mandatory impacts and resource boundaries

Both branches independently reload the same immutable pair for impact evaluation.
Each actual governance handle binds its own reloaded model, and its registry and
identity digests must match the core inventory. The positive event is independently
reloaded and captured from the exact candidate commit.

The fixed `assessSubjectSplitImpacts` composition reuses the same reach and
whole-registry tree comparators as merge and retirement, with the split-specific
replay recipe. Reach must finish all record/hierarchy work; only the exact
retained absent-subject owners may remain unknown. Both complete tree artifacts
must be compared. Every required finite split replay must be assessed. Missing
capacity refuses the operation rather than shrinking this inventory.

The raw reach report may remain incomplete because unknown classification is
retained. Raw replay comparison may remain incomplete because exact split and
absent-before refusals are expected. The fixed assessment checks these explicit
cases; it never rewrites missing results into empty membership. This finite
consistency check is conditional on independent scope and preservation proofs,
not an independent truth oracle or semantic approval of the authored mappings.

Positive governance usage includes core work, actual before-model evaluation and
binding, and each P8 row continuation under the same authentic allowance. Zero
has no positive P8 continuation. The zero proof adds its row and canonical bytes
to core closure usage. Allocation resources describe the single native model
composition; there is no second planning pass.

Independent impact context loading, binding and hashing are separate phase work.
Positive event recapture also occurs in that separate phase. Reach, tree and
replay reports retain their own counters and limits. Their work
is not attributed to the earlier core governance allowance. Native Git,
materialization, loader/parser work, serialization CPU and process memory are
not claimed to have a global bound. Cleanup must finish before success returns;
a later cleanup failure clears overall success and preserves completed evidence.

## Report and remaining boundary

Version 1 reports `kind:'subject-split-gate'`,
`mode:'read-only-prepared-split'` and always `publicationReady:false`. It retains
the input digest, exact operation, core inventory/closure, allocation and
assessment, both candidate authority captures, registry events, optional actual
assignment-event capture, impact reports and diagnostics. No private governance
handle or budget object is serialized.

The ten checks are admission, models, registry, allocation, authoredReferences,
assignments, decision, preservation, candidateCommitMembership and impacts.
Positive success requires all ten passed, with zero-only preservation and
assignment-assessment fields null. Zero success permits only assignments to be
not-applicable, backed by the complete two-path proof and empty actual scope;
`assignments` and the assignment-event source remain null.

Persisted runtime route capability remains `requires-final-capability`; external
inventory is unknown. Retained split artifacts, runtime authorization, human
review binding, fresh final verification and ref-CAS publication remain separate
unfinished work. This API adds no CLI, MCP tool, schema, installed agent workflow
or customer migration. Existing root/protocol AGENTS and per-PR version rules
remain applicable. Focused integration evidence is recorded in the split design;
historical full-suite receipts retain their original commit scope.

The [eventless tests](../../tests/subject-split-gate.test.js) and
[positive integration tests](../../tests/subject-split-gate-positive.test.js)
exercise actual immutable Git pairs, preservation and mandatory-impact failures.
Final combined split integration passed 425/425, as recorded in the
[design verification](ucs-1235-subject-split-design.md#prepared-split-and-replay-verification).
