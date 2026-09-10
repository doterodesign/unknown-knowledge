# A5 — repair observed retrieval friction (UCS-1224)

This extends the existing [reflect walkthrough](A5-knowledge-reflect-walkthrough.md).
It exercises diagnosis, approval, kb-build handoff, and retrieval improvement.
It is **model-dependent**: the CLI characterization in
`tests/reflection-retrieval.test.js` does not prove that an agent follows the
protocol. Preserve fresh-agent traces; do not mark boxes from a prompt assertion.
All source documents and steward decisions below are synthetic fixtures, never
approval to change live company knowledge.

## Prepare independent runs

From the kit checkout, after `npm ci`, create two new scratch directories:

```sh
node acceptance/lib/reflection-fixture.js /tmp/reflection-before
node acceptance/lib/reflection-fixture.js /tmp/reflection-after
```

The preparer uses the public init/log-entry/derive CLIs, supplies two cited
leaves and three concepts, installs the seeded pre-commit hook, and commits
the baseline. It does not perform a repair. It links the checkout's installed
dependencies; keep that checkout available during the trial. Date: **2026-09-10**.
The source handbook defines “canvas output” as export format; the resolver has
no corresponding alias. Delivery resolves K-102 but the packaging leaf has no
declared concept edge. Locale is unrelated. No original acceptance plants change.

Give each retrieval agent only its scratch directory, the request below, and
`unknown-knowledge/protocol/AGENTS.md`. Do not preload this checklist, the
generator, intended IDs, expected answers, repair diff, or another agent's trace.
Ask it to preserve actual commands, outputs, reads and its final answer in a
trace **outside** the fixture. Use the same model/settings and request before
and after:

> What canvas output formats are supported, and how should I verify a delivery profile before accepting it?

Give both agents the same verification instruction: before using a knowledge
leaf, run public preflight for that leaf as well as for concepts, with the
injected date. This is a controlled retrieval comparison, not evidence that the
general runtime protocol independently elicits leaf preflight. If an unprompted
baseline omits it, preserve that failure separately rather than correcting its
trace after the fact.

- [ ] Record the baseline answer and actual navigation, including catalog or
  source fallback. The correct source-grounded answer is PNG/SVG (from code)
  and comparing file checksums with the sender's inventory before acceptance
  (from the handbook). Code cannot testify to that independent verification
  guidance. A recovered correct answer still has measurable retrieval cost.
- [ ] Record leaf IDs actually read, separately from resolver entry points and
  concept preflight. Do not award leaf preflight for a concept verdict.
- [ ] Save public resolver JSON for `canvas output`, `delivery profile`, and
  `locale`, using `--json --today 2026-09-10 --root <scratch-repo>`.
  Baseline: no canvas hit; K-102 with no knowledge entry point; K-103 for locale.

## Reflect at the gate

Start a fresh reflect agent in the **after** fixture with only the protocol,
`skills/knowledge-reflect.md`, the date, and the instruction to run reflect.
Have it preserve a trace outside the fixture and stop for per-item review.

- [ ] Six independent findings form two supported clusters: K-101 and K-102
  each have three sessions on three dates. K-103 has three files from the same
  session/date and counts as **one** event; it stays open and ages.
- [ ] The agent reads the handbook and source pointers before proposing.
  Diagnosis distinguishes missing wording (K-101) from a missing leaf
  relationship (K-102). Existing accurate pointers require no repointing.
- [ ] The alias proposal adds only `canvas output`, with one warranted Decisions
  entry citing the three original fragment paths and K-101's `rationale` ref.
  No synonym list, operation or domain expansion is justified.
- [ ] The L-000200 proposal is a **kb-build handoff**, not a direct reflect
  leaf write: `concepts: []` becomes `[K-102]`. Terms already describe packaging;
  adding aliases or duplicating leaf prose would not repair this relationship.
- [ ] Four queue sections appear; the under-corroborated Locale cluster is a
  spot-check, never an item that human approval can force past the threshold.
- [ ] Before approval, `git diff` shows no applied ontology/knowledge change.
  Proposed Decisions drafts and `log-entry` proposal transitions are permitted.

Give controlled decisions **separately**, preserving the exact messages:

1. Approve the exact K-101 alias and its warrant entry; assign D-102 at this
   fixture acceptance gate. Record the actual queue category without double
   counting the alias and its provenance as two approved repairs.
2. Reject the K-102 handoff for this cycle: “Fixture steward defers the
   relationship revision until a separate kb-build review.”

- [ ] The rejection reason is recorded by `log-entry`, all original K-102
  findings become rejected, and L-000200 stays byte-identical.
- [ ] Re-run SWEEP without new evidence: the rejected item is not proposed as a
  new sibling; the three same-session Locale records remain one event.
- [ ] Simulate a later recurrence through `log-entry transition --to open`
  on the original K-102 findings (date 2026-09-10, after their original dates).
  No new fragment replaces them. Preserve the rejected output/reason in the
  review trace before reopening: the helper clears the fragment's current
  `reason`, so renewed review must read the preserved rejection evidence.
- [ ] The steward now approves the same handoff for separate kb-build review.
  The author explicitly invokes kb-build, reads the citation, prepares only the
  edge plus required draft/provenance/revision metadata, and validates the draft.
  Reflect findings remain proposed until the downstream gate lands.
- [ ] A separate fixture-steward review approves that exact draft and its
  promotion. Record the promoted leaf's date and preserve the reviewed diff.
  An accepted handoff alone must not be treated as promotion approval.

## Verify and finish

- [ ] Full structural validation and touched-concept value validation pass.
  Run derive `--write` and `--check` with the same injected date; both exit 0.
  Derived files remain disposable: regeneration changes no authored records.
- [ ] Replay the original resolver commands. `canvas output` exposes K-101 and
  L-000100; `delivery profile` exposes K-102 and L-000200 via a declared edge;
  `locale` still reaches only its original concept. Do not alter ranking code
  or add aliases to unrelated concepts to make this specimen pass.
- [ ] Run the fresh **after retrieval** agent with the identical request and
  no hint about the repair. Preserve its source-grounded answer, actual
  consulted leaves and leaf-specific preflight. Compare its navigation with
  baseline: fewer query reformulations/catalog recovery steps, not merely a
  higher score. Keep the baseline's shortcomings visible.
- [ ] Only now resolve supported findings via the helper; Locale stays open
  until its existing N-cycle archival rule applies. Stamp actual outcomes and
  cycles. Rejection/reopening uses the same files, never additional siblings.
- [ ] Commit the reviewed bundle with installed hooks, preserving stdout and
  commit SHA. No `--no-verify`, hook removal, or ignored engine failure.

Record wall-clock times, model/settings, prompts and gate responses, full
commands/output, fixture commits/diffs, and any failed or pending checks in the
run report. A successful synthetic trial demonstrates this route only; it is
not a production-scale or general agent reliability claim.
