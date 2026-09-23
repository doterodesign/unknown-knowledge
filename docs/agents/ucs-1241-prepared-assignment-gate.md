> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# UCS-1241 — prepared assignment evaluation

The proposed [P8 decision records](../../decisions/entries/assignment-snapshot-preservation.yaml) capture the shared snapshot/preservation rationale (`8c9f8f9e-5775-4098-ba5a-f4776c375533`). The [documentation audit](ucs-1241-documentation-audit.md) distinguishes this existing-record API from the merge and creation adapters.

`runPreparedAssignmentGate` checks two actual immutable commits without reading
HEAD or the user's index as its source of truth. It shares the private domain
evaluator with `runAssignmentGate`; there is no second history, scope, canonical
parser, preservation, eligibility or impact engine.

The [continuation contract](ucs-1241-assignment-continuation.md) adds an optional
assessment/material evidence group and version-2 owner report, including fixed
wire workers, retained validation and fresh review/publication checks. The
example below omits continuation and keeps the original owner report contract.

```js
runPreparedAssignmentGate({
  repoRoot,
  before: { commit, tree, kitPath },
  candidate: { commit, tree, kitPath },
  eventId,
  reviewNote: { date, author, skill },
  decisionCaptures,
  limits: { maxRecords, maxCaptureBytes, maxRedirects },
  impact: { required, routes, regeneratedViews, representativeReplays }
})
```

The existing operation fields retain the staged gate's closed contracts; route
and regenerated-view inputs and the fixed v1 representative replay input are optional. P7's candidate preparer calls the
before side `source`; map its commit/tree/kitPath into `before`, then let this
adapter verify it. A serialized preparer result is not proof.

## Actual snapshot evidence

P1's `readCommittedTree` checks each supplied full commit OID against an actual
commit object and derives its tree in the actual repository object format.
Each supplied tree must match its own commit. Both exact trees are materialized
by the existing P1 `withTreeSnapshot`; `changedTreePaths` derives the complete
path set using the same fixed diff parser as staged checks. No caller root,
model, governance handle, callback or changed-path list is accepted.

Each requested kitPath must equal that side's actual layout selection. The
shared domain evaluator loads and binds the actual two models as usual. The
existing first-operation rule still forbids changing installation location or
the ledger. The event's before-input must match the independently verified
before commit/tree/kit path.

For every selected candidate record, P7's actual `captureCommittedFile` verifies
regular-file membership, raw bytes and mode in the candidate commit. Those bytes
must agree with the materialized file and the final event's source-free after
capture. The existing P1 selector still corroborates the canonical owner against
the actual model/private index. Additional captured reads count against the gate
byte budget. The event never receives its own enclosing candidate commit.

Output uses `mode: 'read-only-prepared-assignment'` and both input descriptors
have `kind: 'commit'`. After successful membership checks,
`checks.candidateCommitMembership` is passed for the actual candidate tree and
selected regular files. The staged adapter still reports a tree-only candidate
with that check not-performed.

Both adapters always return `publicationReady:false`; human approval remains
not-performed. This adapter does not create a candidate, modify refs, approve a
reviewer, execute a trusted validation runner or complete detached evidence.
The trusted runner must independently enforce its fixed final impact policy;
the generic read-only `required:[]` cannot waive final publication requirements.

Snapshot cleanup is part of successful completion. If it fails after domain
checks pass, the shared failure handler clears `ok`, fails the source check and
retains `assignment-snapshot-unavailable` alongside the completed check evidence.
A finished callback alone is insufficient for a successful gate report.

## Shared domain and validation boundaries

All independently derived scope, retained history/baseline accounting, exact raw
preservation, deterministic changed-only review notes, actual P3 eligibility and
unmodified P6 coverage semantics are those documented in
`ucs-1241-assignment-gate.md`. With continuation omitted, these inputs accept
Decision captures only. Supplying continuation admits assessment pairs and
material captures under one authentic governance allowance shared across both
actual snapshots and continued row checks. The registry and identity must remain
unchanged; every supplied source is checked without fetching omitted evidence.
See the continuation guide for raw/wire ownership, paired-source correspondence
and accounting exclusions. The separately closed [merge adapter](ucs-1241-subject-use-assignment-gate.md)
accepts both evidence groups, while [Decision promotion](ucs-1241-decision-promotion-gate.md)
admits only its observed subjectless branch and verifies the actual authorizer itself.

Actual Git tests establish matching staged/prepared domain outcomes, independent
own commit/tree and kit checks, refusal of caller proof fields, complete prepared
diff accounting, evidence-byte preservation and required impact/budget refusal.
HEAD, staged changes and unstaged bytes may move after candidate preparation;
prepared validation still checks the supplied immutable commits and preserves
the user's current index, worktree and HEAD. Disposable tree paths are normalized
only in diagnostic display, not in captured evidence bytes.

The ordinary Knowledge [runner](ucs-1234-prepared-validation.md) and
[final review/publication profile](ucs-1240-final-publication.md) provide the
separate retained evidence and ref-CAS boundaries. The
[typed publication profile](ucs-1241-typed-assignment-publication.md) now extends
the same operation with an original bound selection, a separate fixed policy
and all-installed-store replays. This owner report alone does not grant approval.

## Prepared event source identity

The report includes `eventSource:null` until actual source selection and complete
history validation pass. Prepared mode then reports
`{file,eventId,eventDigest,candidate:{commit,tree,kitPath}}`: the actual selected
repo-relative event path, existing semantic event digest (review excluded), and
verified candidate descriptor. Staged mode keeps the field null. It contains no
raw bytes or detached artifact locator and may remain available when a later
eligibility, preservation, authorizer or impact check fails. Source identity does
not imply domain acceptance, retained artifact availability or readiness.
