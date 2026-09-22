# Repeated equivalent merge with preserved redirects

The existing fixed merge profile permits reviewed `A→B`, then `B→C`, with
original A retained as `A→B`. This bounded completion follows the existing
[merge Decision](../../decisions/entries/equivalent-subject-merge-governance.yaml)
and [operation contract](ucs-1235-equivalent-merge-dto.md). It adds no public DTO,
policy override, generic graph engine or automatic equivalence decision.

## Exact preserved history and current operation

B and C must be distinct active allocated canonical meanings before the second
operation. B retires to the explicit C survivor; C carries its unchanged meaning
with the existing reviewed reason. The full identity ledger, all prior registry
events, A's definition, change references and exact retirement redirect remain
unchanged. No chain flattening or rewritten earlier approval is admitted.

The actual use inventory may retain an inbound reference to B only when it is
an unchanged retired `equivalent-merge` redirect. The existing governance resolver
must verify that reference as exactly `A→B` before and `A→B→C` afterward. Both
calls use the core's authentic governance allowance; their redirect ceilings are
one and two respectively. Actual inventory/replay budgets remain separately
explicit, and the existing documented excluded phases remain excluded. There is
no new global CPU/memory accounting claim or caller-supplied successful proof.

Parent edges, incident associations, split alternatives, inherited uses and
unsupported direct uses keep their existing refusals. The exception does not
waive a different reference appearing alongside the valid redirect. The
candidate must still equal the exact ordinary one-event registry transformation.

Positive K/O/D uses of B undergo the existing exact substitution into C, preserving
unrelated order and an already assigned C's position. Earlier P8 baselines/events
remain valid and original event bytes remain unchanged; affected tracked owners
advance their actual revisions. New baseline adoption follows the existing P8
rules. The [zero-use branch](ucs-1240-equivalent-merge-zero.md) still requires
actual zero direct uses, null assignment event and a registry-only raw diff.
Unknown assignments never become explicit empty lists.

## Native query and publication behavior

Historical lookup of A returns A's meaning. Current lookup of retired A or B
reports `subject-retired`; equivalent lookup of A retains both exact hops to C.
New assignments to A/B remain forbidden. Insufficient redirect capacity reports
an unresolved/incomplete result, never an empty set or fabricated successful NOT.
The existing fixed replay includes original A and the actual native query deltas;
no independent query engine or empty-delta requirement is added.

The [retained publication contract](ucs-1240-final-equivalent-merge.md), public
exports, closed operation/wire/report shapes and policy descriptors are unchanged.
Fresh proof and runtime identity remain mandatory. Test-only sequential publication
uses the first exact candidate as the second exact source and uses compare-and-swap
against the first published commit for the same output ref. An owner report alone
is not a receipt or first publication.

## Scoped evidence

Implementation checkout `local-history:unknown-knowledge-repeated-merge`, branch
`codex/repeated-equivalent-merge`, base
`29cc9e9746f6158cfe63689440b7506c3f184061`.

Both original first-merge fixture controls passed before the second operations
failed at `merge-graph-use-unsupported`: actual RED 2/2 in
`local-history:repeated-equivalent-merge-red3.log` (18039.605833ms, exit 1).
The narrow core change then passed both controls: 2/2 in
`local-history:repeated-equivalent-merge-first-green.log` (19436.732709ms, exit 0).
Expanded focused evidence passed 11/11 in
`local-history:repeated-equivalent-merge-focused.log` (50571.267167ms): positive
K/O/D, zero-use, nested exact lookup, retained P8 history, omitted-owner refusal,
redirect capacity, resealed flattening/history tampering, split/active/cycle
substitutions and valid parent/association incidence refusal. This run's terminal
summary is retained; its process handle was unavailable after the usage reset.

Targeted existing merge-core, zero-use and lifecycle checks passed 27/27
(69191.710833ms, session 25625 exit 0) in
`local-history:repeated-equivalent-merge-legacy.log`. Lint checked 681 files with
zero failures (session 37270 exit 0), recorded in
`local-history:repeated-equivalent-merge-lint.log`.

Independent sequential publication passed 1/1 (78759.130458ms, session 58897
exit 0) in `local-history:unknown-knowledge-repeated-merge-p2-frozen.log`.
The exact receipt is `local-history:unknown-knowledge-repeated-merge-p2-receipt.json`;
its 1449-file before/after manifest recorded zero drift. The independently owned
`tests/repeated-equivalent-merge-publication-review.test.js` performs two actual
review/publication sequences in one nested repository on the same output ref,
with the first candidate as the second source and expected old output commit.
It checks retained A/history/P8/ledger, receipt authority, unchanged index/worktree
and the actual original-A query after both publications.

No passed tests were restarted for handoff. These are bounded implementation
receipts, not whole-goal acceptance, runtime authorization or customer publication.
Main owns sequential integration and shared root version/changelog reconciliation.

## Main integration

Main verified all nine handoff hashes and imported them without conflict over
completed proposal suppression at `20c4bd6`. One frozen five-suite checkpoint
passed **43/43**, exit 0, in **137358.007666 ms**. It covers repeated-merge
controls, actual sequential publication and shared suppression, creation and
metadata gates. All 2,960 source/dependency/executable hashes remained unchanged.
Log: `local-history:unknown-knowledge-repeated-merge-integration.log`, SHA256
`fd800892228cf39efd572bf39abcb7d0ccb9fa88a5cbda0e65a0956a2620701f`.
The adjacent manifest and result JSON retain the exact command and freeze.

Lint checked 689 files with zero failures; automated A1–A4/A6 acceptance passed
(A5 manual), and structural/value validation found no errors. Root README,
changelog, required lifecycle scope and change-completeness documentation are
synchronized. Public DTOs, policies, worker selectors, schemas, dependencies,
payload inclusion, wrappers and AGENTS requirements are unchanged. Existing
catalog identity/status remains exact. The pending PR remains `3.0.0-rc.2` in
package and both lock versions; this internal checkpoint creates no release or
customer publication and does not complete the remaining retrieval evaluation.
