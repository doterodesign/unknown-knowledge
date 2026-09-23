> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Positive split assignment adapter

`runPreparedSubjectSplitAssignmentGate(input)` in
[`assignment-gate.js`](../../payload/engine/lib/assignment-gate.js) is a fixed,
read-only P8 composition over the complete closed
[`subject-split-input.js`](../../payload/engine/lib/subject-split-input.js) request.
It returns `{ version: 1, core, assignment }`. It does not accept caller models,
core reports, governance handles, callbacks or alternate policies. Invalid input
and eventless requests return `core: null` and a failed assignment report. The
outer split gate owns the separate zero-use preservation proof and all mandatory
impacts. An empty replacement list for one or every mapped record is still a
positive assignment operation when the actual direct-use scope is nonempty.

With the [material selector](lifecycle-material-continuation.md), the fixed
admitted adapter shares the enclosing governance allowance and uses
`validateContinuedAssignmentChange` for each row, including empty targets.
The omitted-material path keeps the native split row validator described below.
Both paths preserve original scope, allocation and cleanup requirements.

## Actual composition and accounting

The adapter materializes the two immutable Git trees and loads raw stores. It
calls the fixed split core once, before allowing any identity-ledger difference.
That core owns the single model creation/allocation proof, original before-pair
selection and source membership, immutable authorizer, complete actual reference
closure and structural checks. The adapter reuses the returned candidate
governance handle. It evaluates and binds the actual before model once more,
under the same authentic operation allowance. There is no preliminary unbounded
query-context evaluation or second allocation plan in this branch.

Every selected row goes through `validateSubjectSplitAssignmentChange`, including
rows whose target list is empty. This continues the same allowance and checks
its governance ownership. The core's governance resource snapshot is refreshed
in `finally`, after the awaited snapshot callbacks and cleanup, on success and
failure. A cleanup failure revokes assignment `ok`; the shared ordinary-gate
cleanup reset remains in force.

The existing assignment record, capture-byte and redirect limits remain
separate from governance and closure limits. Actual registry and identity
recaptures, and each corresponding materialized-file reread, are charged to the
assignment capture-byte counter before comparison. They repeat real work already
performed by the core; they are not free because the bytes match. Legacy P8 file
capture and history checks retain their existing accounting. This is not a
bound on all filesystem reads, native Git/YAML work or CPU. Core inventory and
later outer reach/tree/replay context setup have their separately documented
phase boundaries; the adapter does not count those as its governance work.

## Binding and preservation

The candidate event must have the exact split scope: operation ID, source,
ordered successors and both ordered registry event IDs. Its digest must equal
the operation declaration. Rows must match the actual core's canonical mapping
order, exact mapped after arrays and reasons, known before/after states, changed
disposition and next revision. Existing history checks additionally corroborate
the raw record arrays, prior revisions, retained events, immutable old baseline
prefix and exact adoption of previously untracked records. The normalized
history membership set does not substitute for raw authored array order.

Before either authority path is allowed to change, actual committed captures
and materialized bytes/modes must match the core's registry and allocation
proofs, including complete source locators. Selected K/O/D records use the
existing whole-file typed preservation evaluator. It protects grouped siblings,
evidence metadata and all bytes outside permitted subject edits and the exact
Knowledge revision-note suffix. The actual changed-path set must be fully
accounted for. The event's complete five-field Decision tuple must equal the
registry review tuple; current authorizer and historical source checks remain
mandatory.

A successful assignment result remains `publicationReady: false`.
`checks.impactPolicy` is `not-performed` with scope
`split-impacts-owned-by-outer-gate`; human attention/approval is not authenticated.
Only the outer gate can combine this result with mandatory impacts. Transport,
publication and route materialization are not implemented by this adapter.

## Fixture and validation evidence

[`subject-split-assignment-fixture.js`](../../tests/helpers/subject-split-assignment-fixture.js)
uses the frozen block-format core fixture. It independently authors exact
Knowledge notes, baselines and split-event rows inside the candidate hook,
before the final candidate commit. It never replaces the original before
capture pair with a synthetic prefix or derives expected records from the
production planner. Optional prior tracking is a real earlier no-op assignment
review whose event/baseline bytes are retained.

The first actual RED was 0/1: the independently valid split core passed, while
the ordinary P8 adapter refused the ledger delta with
`assignment-installation-changed`. Receipt:
`local-history:unknown-knowledge-split-assignment-red.log` (session 65860, exit 1).
The first fixed-branch GREEN was 1/1, 3567.716333 ms, in
`local-history:unknown-knowledge-split-assignment-first-green.log`
(session 99475, exit 0). Expanded and legacy regression receipts follow below.

## Recorded composition decision

The [existing split Decision](../../decisions/entries/plain-subject-split.yaml)
records this positive-only P8 composition: reuse the actual core's private
governance/allowance handoff, rather than reload
unbounded contexts before proving the allocation exception or introduce a public
caller-proof API. Charge the additional before setup and fixed row continuation
truthfully; keep zero-use proof and mandatory-impact setup with the outer owner.
Preserve ordinary merge, retirement and promotion execution and counters. User
authorization to implement this adapter is not approval of source records or
permission to publish. The integration owner records the amendment, shared
coverage and versioned PR notes with final test evidence.

Additional focused receipts:

- Initial expanded matrix: 21/24, 66295.479542 ms,
  `local-history:unknown-knowledge-split-assignment-expanded.log` (session 67702,
  exit 1). Three expectations assumed later P8 checks, but actual malformed
  event ordering/source and an invalid metadata field refused during structural
  loading. Expectations were corrected; the evidence-preservation case now
  changes a valid citation field. No production check was relaxed.
- Model-status review RED: 0/1, 1517.65325 ms,
  `local-history:unknown-knowledge-split-assignment-model-status-red.log`
  (session 11596, exit 1). The adapter had reported structural models passed
  before a split core allocation-cap refusal. The split-only passed status now
  occurs after successful actual core and before-model binding; legacy status
  behavior is unchanged.
- Corrected expanded matrix: 35/35, 73791.621333 ms,
  `local-history:unknown-knowledge-split-assignment-expanded-2.log`
  (session 20485, exit 0). Includes SHA1/nested SHA256, K/O/D and no-K stores,
  literal prior history, ordered mapping/event refusals, evidence/note protection,
  exact-fit/one-short governance counters, empty-target ownership, independent
  assignment capture-byte summation and cleanup revocation.
- Additional physical preservation: 3/3, 11632.514458 ms,
  `local-history:unknown-knowledge-split-assignment-preservation.log`
  (session 76689, exit 0). Covers unselected grouped known-empty siblings,
  retained event bytes and retained baseline bytes.


Final scoped regression: **194/194 passed**, 279739.241042 ms,
`local-history:unknown-knowledge-split-assignment-regression.log`
(session 47132, terminal exit 0). This includes the complete new 38-test adapter
matrix and the relevant ordinary, typed, merge, retirement and K/O/D promotion
gates. Runtime/tests were frozen for this run. It is scoped regression evidence,
not a new full-suite or publication receipt.

Exact command (stdout/stderr redirected to the log above):

```sh
PATH=/usr/bin:$PATH local-history:node --test --test-concurrency=2 \
  tests/subject-split-assignment-gate.test.js \
  tests/subject-split-assignment-gate-budget.test.js \
  tests/assignment-gate.test.js tests/prepared-assignment-gate.test.js \
  tests/assignment-gate-cleanup.test.js tests/typed-assignment-gate.test.js \
  tests/subject-use-assignment-gate.test.js \
  tests/subject-retirement-assignment-gate.test.js tests/subject-retirement-gate.test.js \
  tests/subject-equivalent-merge-gate.test.js tests/typed-equivalent-merge-gate.test.js \
  tests/decision-promotion-gate.test.js tests/typed-promotion-gate.test.js \
  tests/knowledge-promotion-gate.test.js tests/classified-decision-promotion-gate.test.js
```

The independent read-only review of the outer split gate and its impact dispatch
found no concrete blocker in zero proof attachment, resource separation, actual
pair binding or cleanup revocation. Outer/replay/transport/publication test
results belong to their respective owners; they are not inferred from this P8
regression. No commit, shared Decision edit or runtime publication was performed
by this adapter owner. Subsequent main integration evidence is recorded in the
[split design](ucs-1235-subject-split-design.md#prepared-split-and-replay-verification).
