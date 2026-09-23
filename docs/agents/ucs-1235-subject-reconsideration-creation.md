> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Captured Subject proposal reconsideration

This implements the history/model portion of the proposed
[suppressed Subject reconsideration Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml).
It consumes one exact suppressed proposal and creates one fresh canonical Subject
through a reviewed activation. Ordinary activation/promotion and ordinary
refusal-assessment v1 retain their existing contracts.

The model result is always `publicationReady: false`. The separate
[actual-Git owner](ucs-1235-reconsideration-git-core.md) now verifies supplied
provenance and stored-owner preservation. The
[impact gate](ucs-1235-reconsideration-gate.md) and
[ordinary assignment continuation](ucs-1241-assignment-continuation.md) are also
implemented. Reconsideration's own retained execution/review/publication now
implements the [separate contract](ucs-1240-reconsideration-publication.md).
[Retirement continuation](lifecycle-material-continuation.md) carries that
evidence through later retirement, merge, split and typed promotion. The separate
[query/intent/view consumers](ucs-1237-reconsideration-consumers.md) now carry
retained material to the evaluator. This is not completion of ordinary fresh
creation, union/broadening or all proposal-refusal/reversal acceptance. The
[required-scope clarification](subject-lifecycle-required-scope.md) distinguishes
these requirements from unsupported active-canonical suppression/restoration.

## Fixed model interface

```js
validateSubjectReconsiderationCreation({
  beforeModel, candidateModel,
  beforeCaptures, decisionCaptures, materialCaptures,
  operation: { id, proposal, subject, registryEvent: { id, changeDigest } },
  allocationLimits: { maxLedgerRows },
  assessmentCaptures, // optional; only omission defaults to []
  budget             // exactly one of this or options.operationBudget
}, { operationBudget })
```

The result has exactly `ok`, `governance`, `publicationReady`, `diagnostics`,
`used`, `allocation`, `assessment` and `resources`. The resources object contains
the fixed allocation subreport. A completed allocation may remain observable
after a later failure, but `ok` is false and `governance` is null.

New inputs require closed own-data objects and dense capture arrays. Explicit
null lists, extra array properties, capture getters and ambiguous allowance
sources refuse. The authentic allowance is checked before reading models.
Registry admission and suffix selection precede the one native allocation helper;
the helper runs before wrapper identity expansion, hashing or index binding.
Its actual ledger digests bind both authentic model indexes. Independently parsed
original registry/identity bytes must still equal the actual before model.

The new Decision must differ from the prior refusal Decision, be loaded and
accepted/addressed in both models, match their authentic indexes and the full
reviewed record, and remain unchanged. The pure model does not establish whole
file/mode preservation or membership in a claimed historical Git tree.

## Exact event and consumed history

One `activate` event appends to the unchanged history prefix. It retains the
ordinary required `id`, `action`, `decision`, `review`, `rows` plus exactly:

- `promotes: {key, before}` with the entire actual suppressed proposal;
- `priorRefusal`, its exact current last suppression event;
- `reconsideration: {reason, records, sources}`;
- `reconsiderationAssessment`, the separately closed version-1 assessment.

The wire names are `prior-refusal` and `reconsideration-assessment`. Ordinary
`refusal-assessment` must be absent. Both fields together, or reconsideration
markers on another action, refuse.

```js
reconsiderationAssessment: {
  version: 1,
  scope: { beforeRegistry: { capture, documentDigest }, identityDigest },
  coverage: 'complete-registry',
  attestation: 'all-current-suppressed-meanings-assessed',
  relevantRefusals: [{ subject, refusal, disposition, reason }]
}
```

The selected proposal/refusal appears exactly once with disposition
`same-meaning-reconsidered` and reason equal to `reconsideration.reason`. Other
listed current refusals require `distinct-meaning`. Their semantic relevance
remains a reviewed assertion over the complete captured scope.

The canonical row has null before-state and the sole native allocated ID.
Label, definition/boundaries, aliases and graph meaning remain exact. The new
active origin Decision and warrant are reviewed; the original origin, warrant,
refusal and full ordered changes remain in the consumed snapshot and history.

History consumes only the verified tracked proposal state and its exact ordered
changes. Its outgoing parent/association ownership is removed before the new
canonical ownership is added to the atomic event graph. Unrelated participants
remain; consumed keys cannot reappear or be consumed twice. An active parent is
required at the activation event. A later parent retirement does not invalidate
that historical fact. Registry revision increases once; an actual parent-edge
change increases hierarchy revision once.

## Material proof and historical eligibility

Record material reuses `{ref,capture}` from the warrant contract. Source material
uses `{locator,revision,capture}`. Both arrays are explicit and their combined
length must be nonzero. Record citations must appear exactly in the final
warrant; source locator/revision pairs must appear in its source list.

`materialCaptures` uses `{capture,bytes,objectFormat}` wrappers. Exact cited raw
file bytes and declared reference/warrant bindings are verified. This does not
parse a selected K/O record through a Decision parser, certify that a declared
record citation is supported by the content, or establish source freshness,
external authorship or semantic sufficiency. The assessment labels these results
`captured-scope-and-material-bindings-only` and `asserted-in-reviewed-evidence`.

Unchanged material may be newly considered under an explicit reviewed reason.
There is no byte-inequality, novelty-key or new-reference requirement. Merely
moving bytes to another path or commit does not prove novelty. A source URL and
revision are declared metadata, not a substitute for its required captured bytes.
Source-less captures prove supplied-byte correspondence only. No Git lookup,
current-file refetch or synthetic historical source occurs here.

Historical evaluation accepts optional `materialCaptures`, omitted as `[]`.
It retains immutable event bindings and verification status, rather than live
caller-owned buffers. New activation verification depends on the selected prior
refusal, new Decision, exact original assessment pair and material proof. Missing
required evidence yields unavailable eligibility; corrupt/ambiguous proof
refuses. Archived earlier Decisions can retain valid historical approval evidence.

Supplied material captures must be unique members of the union cited by retained
reconsideration events. Multiple citation rows can reuse one captured file. The
model checks the candidate union and projects only prior-history captures into
before evaluation, reusing admitted objects. This prevents candidate-only
material being mistaken for unrelated before evidence.

Success is scoped to the selected transition. Missing material only for an
unrelated earlier Subject can leave that Subject unavailable while a fully
evidenced new Subject is eligible. The two-reconsideration test covers both full
evidence and that distinction. This model does not certify universal historical
evidence completeness or publication readiness.

## Accounting

The same authentic governance allowance covers guards, actual capture admission,
history, reference matching and binding. Raw evidence is admitted before its
verification. A physically separate capture object/read is charged separately;
the same already admitted object can be reused. Original-scope parsing and
correspondence have their own actual document/validation charges and do not
replace the native allocation proof.

`reconsideration-material-row` pre-admits logical material rows; it is not a count
of every physical loop pass. Warrant, refusal-history, participant, material-match
and before-projection visits have named validation phases. Every performed
material-history union scan charges every inspected event, including ordinary
events skipped as non-reconsideration rows. The evaluator omits that union scan
when the supplied material list is empty: there is no unused-member lookup to
perform. Density checks, history verification and missing-proof behavior still
run. The ordinary empty-list control preserves its prior five validation steps;
nonempty material paths and model projection scans pay for their actual work.

These are logical bounds, not native Git, YAML allocation, total CPU or memory
measurements. The native fixed-one comparator remains the sole planning call and
reports admitted B+C ledger rows and one Subject. Native slot-scan bounds are
mathematical rather than observed counters.

## Required subsequent integration

The [read-only consumer continuation](ucs-1237-reconsideration-consumers.md)
forwards material through `loadSubjectQueryContext`, bounded file queries,
query/intent commands and route/context views. Those views also receive their
assessment evidence; tree rendering stays independent. Its named raw material
decoder shares byte mechanics without using a Decision record parser.
The [ordinary assignment envelope](ucs-1241-assignment-continuation.md) now carries
this evidence through raw owners, fixed workers and fresh review/publication.
Later lifecycle and typed-promotion envelopes still need explicit extension.
Do not put raw material bytes in the registry or silently drop new fields from
a closed envelope. Read-only query success does not complete affected-use or
publication delivery.

The [actual-Git owner](ucs-1235-reconsideration-git-core.md) establishes supplied
historical membership or explicitly labelled source-less current correspondence,
preserves required files/modes and verifies no stored assignments change. It
calls this model once on one allowance. The implemented impact gate uses its own
fixed core handoff and fresh before/after query operations. Reconsideration's
final execution, review and publication must still retain and freshly supply
that proof; the history/model result alone is insufficient.

## Owner evidence

Focused command, with Node 24.19.0:

```sh
PATH=/usr/bin:$PATH local-history:node --test tests/subject-reconsideration-history.test.js tests/subject-reconsideration-creation.test.js
```

Actual receipts, preserved rather than replaced by later successes:

- Initial loader/export RED: 1/3 passed, 804.875042 ms, exit 1;
  `local-history:unknown-knowledge-reconsideration-model-first-red.log`.
- First implementation GREEN: 3/3, 822.007583 ms, exit 0;
  `local-history:unknown-knowledge-reconsideration-model-first-run.log`.
- Independent-review RED: 8/10, 2873.846334 ms, session 11809 exit 1;
  `local-history:unknown-knowledge-reconsideration-history-review-red.log`.
  Unused/duplicate historical material and uncharged material/warrant checks
  were corrected; 13/13 passed in 2908.015958 ms, session 34382 exit 0,
  `local-history:unknown-knowledge-reconsideration-review-corrected-green.log`.
- Union-scan RED: 1/2, 386.618 ms, exit 1;
  `local-history:unknown-knowledge-reconsideration-union-scan-red.log`.
  The independent valid-but-different original raw pair reached `input-mismatch`;
  the missing named ordinary-history visit was corrected.
- Parent-time RED: 23/24, 6568.176167 ms, session 81063 exit 1;
  `local-history:unknown-knowledge-reconsideration-history-expanded-red.log`.
  Already-retired parent admission was corrected; later retirement stays valid.
- Expanded GREEN: 48/48, 7802.942583 ms, session 15764 exit 0;
  `local-history:unknown-knowledge-reconsideration-model-final-green.log`.
- Two-reconsideration test initially failed its overbroad expectation of global
  historical approval after its complete positive passed: 0/1, 462.419417 ms,
  `local-history:unknown-knowledge-reconsideration-second-history.log`.
  Main confirmed the per-Subject expectation; no runtime relaxation was made.
- Formatting regression: 4/51 passed and 47 failed, 8383.292917 ms, session 5647
  exit 1; `local-history:unknown-knowledge-reconsideration-model-final-formatted-green.log`.
  Despite its filename, this is a failed receipt. A spacing transform altered
  the digest regex. The exact literal was manually restored, and the scoped
  literal audit found no further altered regex/string/template literals.
- Final corrected focused GREEN: **51/51**, **8306.558208 ms**, session **36388**
  closed exit **0**; `local-history:unknown-knowledge-reconsideration-model-literal-restored.log`.
  This includes two actual reconsiderations, per-Subject evidence availability,
  mutually exclusive assessment fields and wrong-action rejection.

Runtime and tests were frozen after that final corrected receipt. Main owns the
broader integration regression, lint, acceptance and shared documentation/version
reconciliation; no duplicate broad owner run is claimed. Earlier receipts describe
their own exact source snapshots. No owner commit, PR, release or customer
publication is performed by this slice.

Main's frozen integration subsequently passed **368/368** in **44047.301042 ms**,
session **88268**, closed exit **0**:
`local-history:unknown-knowledge-reconsideration-integration.log`. Its 20 files
include the three new reconsideration test files, split creation/history and
legacy governance/query coverage. Main reported lint with zero failures (session
79151, exit 0), automated acceptance A1–A4/A6 passing (session 73178, exit 0),
and structural/value/version checks clean. A5 remains manual. Documentation
coverage checked 16 paths, seven Markdown files and 166 links with none missing.
These are integration-owner receipts; this owner ran no duplicate broad suite.
