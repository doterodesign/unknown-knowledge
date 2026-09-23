# UCS-1241 — read-only assignment gate

The optional [ordinary continuation](ucs-1241-assignment-continuation.md) adds
assessment/material evidence and one shared governance allowance to staged and
prepared existing-record checks. Supplied continuation requires a version-2
owner report; genuine omission retains this page's original report contract.
It preserves the registry/identity and verifies every supplied capture against
actual sources. Typed event versions remain separate from owner report versions.

Decision rationale is recorded as proposed in [the P8 decision records](../../decisions/entries/assignment-snapshot-preservation.yaml), especially `8c9f8f9e-5775-4098-ba5a-f4776c375533`. See the [scope and documentation audit](ucs-1241-documentation-audit.md) for the implemented variants and remaining boundaries. This page describes the original v1 domain operation; [typed existing-record selection](ucs-1241-typed-assignments.md) is a separate additive mode.

`runAssignmentGate` in `payload/engine/lib/assignment-gate.js` inspects an actual
Git before commit and staged candidate tree. It does not write records, commit,
publish a ref, authenticate a reviewer, or accept caller-supplied loaded models.
Every result has `publicationReady: false`. Main owns integration and final
publication release.

Overall success includes completion of snapshot cleanup. A cleanup failure after
the checks finish returns `ok:false`, a failed source check and
`assignment-snapshot-unavailable`; earlier completed checks remain as evidence.
The shared failure handler enforces this for staged and prepared adapters.

## Input and provenance

The closed input is:

```js
{
  repoRoot, eventId,
  reviewNote: { date, author, skill },
  decisionCaptures: [{ capture, bytes, objectFormat }],
  limits: { maxRecords, maxCaptureBytes, maxRedirects },
  impact: {
    required: [], // routes | regeneratedViews | representativeReplays
    routes: { inventory, limits },             // optional actual P6 input
    regeneratedViews: { inventory, limits },  // optional actual P6 input
    representativeReplays: { limits, queryBudgets } // optional fixed v1 recipe
  }
}
```

Limits are explicit nonnegative safe integers. The injected review date must
be a real calendar date; author and skill are trimmed nonblank strings of at
most 160 UTF-16 code units with no control characters. They record assertions,
not authenticated identities. Retained Decision captures are real P2 byte
evidence, never an `approved` flag. Historical registry evidence can be absent;
newly effective subjects still require the actual P3/P2 eligibility result.

The actual P1 `withCommitSnapshot` pins the before commit once and materializes
raw immutable trees through its existing private-index machinery. Both sides
load through the actual shared query-context/model/governance assembly and
structural validator. Their actual selected kit paths and full ledgers must
agree. Every side authenticates its own governance handle against its own model.

Output provenance is explicitly tagged:

```js
before:    { kind: 'commit', commit, tree, kitPath }
candidate: { kind: 'tree', tree, kitPath }
```

The staged candidate has no commit property. `candidateCommitMembership` and
`humanApproval` remain `not-performed` even when all implemented checks pass.
Temporary materialization paths are replaced by stable diagnostic side labels.

## Scope, history and records

The first operation only changes existing allocated canonical Knowledge selected
by the final event's recorded `facets.domain` exact/subtree selector. Subtree
matches segment boundaries. The gate enumerates the before ledger and corroborates
every allocated Knowledge identity against the real private index, exact retained
occurrence and strict current-record iterator. A declared-only or missing payload
is a refusal, not an empty result. Every allocated record needs a valid recorded
domain, including records outside the selected scope. Matched records must already
have known effective lifecycle. Retired/cancelled refs are reported separately.

Event rows must equal that independently derived typed set. The actual source
reader validates final v1 metadata and full history through the shared chain
engine. The gate retains all old events, allows exactly the requested new event,
preserves ordered baseline declarations and adopts exactly previously untracked
affected records from their verified before bytes at revision zero. It compares
each event snapshot/revision to the original actual record and retained chain.
Baseline adoption never bypasses eligibility. Retained baseline file bytes and
mode must also remain exact. Adding declarations to an existing manifest requires
a literal YAML suffix; formats needing whole-file reserialization are refused by
this first implementation. The shared schema/chain checks must still validate
the resulting complete document.

For each selected record, P7's committed-file reader proves before membership.
The actual P1 captured-record parser validates the whole file and corroborates
the exact owner/entry/locator on each side. Explicit object format comes from
the real Git capture. Event after-captures contain only file/blob/SHA-256;
they never include a fabricated enclosing candidate commit. The candidate digest
is canonical SHA-256 of qualified-ref-sorted `{ref, 'after-capture'}` rows.

P3's actual change helper checks newly effective assignments with the remaining
global redirect budget. Unknown-to-known-empty changes once; unchanged unknown
remains unknown. Unchanged carry and set reorder do not increment a revision or
manufacture a note. This bounded implementation refuses a changed known-to-unknown
classification rather than describing unknown as empty.

## Exact preservation and review note

A changed classification requires exactly one appended existing-schema note:

```js
{
  type: 'revision', date,
  text: 'Classification review by <author> using <skill>: subjects <authored IDs joined with comma-space, or explicit empty>. Existing evidence metadata retained.'
}
```

Existing notes retain their exact parsed prefix and raw bytes. Original provenance,
body, citations, evidence dates, stage, Phoenix edition and every other field stay
unchanged. The complete changed-path set allows only selected leaf files, the
baseline manifest and this one new event. Old events, unselected records, registry,
ledger, runtime and authorizer bytes cannot change. Selected leaf modes also stay
unchanged. The current authorizing Decision must remain identical and its exact
review status/digest/raw capture must pass the actual shared P2 evidence helper;
any declared historical commit membership is verified independently by P7.

`validateAssignmentPreservation` calls the canonical P1 parser first, then uses
the installed YAML dependency's event offsets only to identify permitted source
regions. It converts character offsets to UTF-8 byte offsets and compares all
other bytes, preserving BOM, CRLF/LF, Unicode, fences, comments and body. It does
not reserialize files or implement a second semantic parser.

This first lexical verifier deliberately refuses aliases, anchors, tags, flow
root mappings, quoted/ambiguous root keys, comments inside edited fields and
nonempty flow-style prior notes. Existing nonempty notes require a block sequence
whose exact bytes remain a prefix. Trailing comments/blank lines belong to the
immutable surrounding bytes. Unsupported valid YAML is a typed refusal, never
a weaker preservation claim. The helper alone is not a resource-budget boundary;
the gate enforces its captured-byte budget before invoking it.

## Impact and resource limits

Both actual P6 comparators receive the two actual bound contexts and return their
results unchanged. Required impact classes are explicit and separate from supplied
inventory availability. Missing/partial/truncated required assessments refuse;
null deltas stay null. Complete empty inventories cover only that declared supplied
inventory. The optional fixed [assignment replay recipe](ucs-1241-assignment-replays.md)
must complete when required; absent or incomplete required replay refuses. It
does not provide typed authoring or equivalent-merge coverage.

Counters describe this gate's allocated Knowledge traversal, captured record and
Decision bytes, and P3 redirect work. Existing snapshot materialization/model loading
retain their own bounds; these counters do not claim to measure all parser/Git work.
P6 reports its own actual per-call resources and remaining inventory IDs.

## Verification and remaining release boundary

The original gate-slice owner focused run covered 108 tests across the gate, byte preservation,
source reader, actual P1 parser, P2 Decision evidence, P3 changes and both P6
comparators. Actual Git controls cover root/nested layouts, retained second-event
history, scope omissions, missing allocated payloads, unknown/empty/reordered
assignments, stale adoption/captures, body/BOM/newline/note/evidence tampering,
unselected paths/modes, dirty worktree and index preservation, required impact,
budget refusal and deterministic diagnostic paths. Structural/value validation,
preflight and lint passed on the owner branch. Main owns full regression.
The reverse audit completed in unscoped advisory mode with 819 findings; the
repository has no live Ontology store or confirmed survey scope. This is not a
claim that reverse coverage is clean, and no draft findings were published.

Candidate preparation, trusted runtime/report artifacts, human review binding
and ref-CAS publication are separate owner surfaces; see [prepared evaluation](ucs-1241-prepared-assignment-gate.md)
and [P7 final publication](ucs-1240-final-publication.md). Successful read-only
checks do not substitute for them or establish publication of a real candidate.
