# A5 — repair observed retrieval friction (UCS-1224)

This extends the existing [reflect walkthrough](A5-knowledge-reflect-walkthrough.md).
It exercises diagnosis, approval, kb-build handoff, and retrieval improvement.
It is **model-dependent**: the CLI characterization in
`tests/reflection-retrieval.e2e.test.js` does not prove that an agent follows the
protocol. Preserve fresh-agent traces; do not mark boxes from a prompt assertion.
All source documents and steward decisions below are synthetic fixtures, never
approval to change live company knowledge.

The [UCS-1242 decision and evidence note](../docs/agents/ucs-1242-retrieval-governance.md)
links the later durable-review, navigation and optional-Subject rationale.
Historical run reports remain evidence for their own frozen runtime and inputs;
later protocol changes do not reclassify them as successful runs.

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
no corresponding alias. Delivery resolves O-000002 but the packaging leaf has no
declared concept edge. Locale is unrelated. No original acceptance plants change.

These are new canonical fixtures: `_identity.yaml` carries a fixed synthetic
namespace and six current allocations (three Ontology, two Knowledge, one
Decision) in one fixture-only publication. Ontology and catalog envelopes are
version 2, Knowledge leaves version 3; findings are created by the installed
helper at version 2. `classes/product.yaml` and `guides/*.md` are placement,
not identity ranges. Never reuse this fixture namespace in a real installation.
A historical trial pinned to an earlier runtime retains its original bytes and
report; this generator change does not migrate or re-score that frozen trial.

Give each retrieval agent only its scratch directory, the request below, and
`unknown-knowledge/protocol/AGENTS.md`. Do not preload this checklist, the
generator, intended IDs, expected answers, repair diff, or another agent's trace.
Ask it to preserve actual commands, outputs, reads and its final answer in a
trace **outside** the fixture. Use the same model/settings and request before
and after:

> What canvas output formats are supported, and how should I verify a delivery profile before accepting it?

Give both agents the same verification instruction: before using a knowledge
leaf, run public preflight for that leaf as well as for concepts, with the
injected date. Supply the public syntax, without target IDs:
`preflight.js --concepts <ids> --leaves <ids> --json --root . --today 2026-09-10`.
The CLIs do not implement `--help`; do not use it for discovery. This is a
controlled retrieval comparison, not evidence that the
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
  Baseline: no canvas hit; O-000002 with no knowledge entry point; O-000003 for locale.

## Reflect at the gate

Start a fresh reflect agent in the **after** fixture with only the protocol,
`skills/knowledge-reflect.md`, the date, and the instruction to run reflect.
Have it preserve a trace outside the fixture and stop for per-item review.

- [ ] Six independent findings form two supported clusters: O-000001 and O-000002
  each have three sessions on three dates. O-000003 has three files from the same
  session/date and counts as **one** event; it stays open and ages.
- [ ] The agent reads the handbook and source pointers before proposing.
  Diagnosis distinguishes missing wording (O-000001) from a missing leaf
  relationship (O-000002). Existing accurate pointers require no repointing.
- [ ] The alias proposal adds only `canvas output`, with one warranted Decisions
  entry citing the three original fragment paths and O-000001's `rationale` ref.
  No synonym list, operation or domain expansion is justified.
- [ ] The K-000002 proposal is a **kb-build handoff**, not a direct reflect
  leaf write: `concepts: []` becomes `[O-000002]`. Terms already describe packaging;
  adding aliases or duplicating leaf prose would not repair this relationship.
- [ ] Four queue sections appear; the under-corroborated Locale cluster is a
  spot-check, never an item that human approval can force past the threshold.
- [ ] Before approval, `git diff` shows no applied ontology/knowledge change.
  Proposed Decisions drafts and `log-entry` proposal transitions are permitted.

Give controlled decisions **separately**, preserving the exact messages:

The preparer supplies session/date hints, not proof of independent occasions.
If reflect holds the clusters as uncertain, preserve that result. The fixture
author may then supply this explicitly labeled **synthetic scenario evidence**:
`canvas-0`, `canvas-1`, `canvas-2` identify separately scripted requester occasions
C0/C1/C2, each independently encountering the wording miss; `delivery-0`,
`delivery-1`, `delivery-2` identify separately scripted occasions D0/D1/D2, each
encountering the missing relationship for its own delivery. They are not retries
or copied reports. All three Locale fragments repeat one occasion E0.
Attach that clarification to review evidence; it is neither a claim about real
historical users nor gate approval. Record it as additional input: this threshold
trial is not an equal-input before/after comparison. Never infer independence
from labels alone or manufacture extra fragments to cross the threshold.

First persist a schema-1 review artifact and immutable proposals under
`reviews/reflect/`, following the single Review state contract in
`protocol/skills/knowledge-reflect.md`. Every gate response must bind the exact
reviewed proposal bytes by SHA256. Preserve any valid old heartbeat bytes before
publishing schema 2. Label all steward responses here as simulated fixture gates.

1. Approve the exact O-000001 alias and its warrant entry; assign D-000002 at this
   fixture acceptance gate. Include the new decision allocation in the exact
   reviewed publication with its catalog row, record and rationale reference;
   retain all six baseline allocations. Plan against the current ledger with a
   fresh publication UUID and fixture-review provenance. An unpublished
   Decision uses `proposal:decision:<lowercase-v4-uuid>` and has no allocation;
   a draft or approval alone must not consume a canonical slot. The reviewed
   final bundle names `D-000002`, the next free decision identity here.
   Record the actual queue category without double
   counting the alias and its provenance as two approved repairs.
2. Reject the O-000002 handoff for this cycle: “Fixture steward defers the
   relationship revision until a separate kb-build review.”

- [ ] The rejection reason is recorded by `log-entry`, all original O-000002
  findings become rejected, and K-000002 stays byte-identical.
- [ ] Re-run SWEEP without new evidence: the rejected item is not proposed as a
  new sibling; the three same-session Locale records remain one event.
- [ ] Simulate a later recurrence through `log-entry transition --to open`
  on the original O-000002 findings (date 2026-09-10, after their original dates).
  No new fragment replaces them. Preserve the rejected output/reason in the
  review trace before reopening: the helper clears the fragment's current
  `reason` and appends its rejected snapshot to `prior-outcomes` with the
  injected `reopened-on` date. Verify the snapshot after reloading the fragment;
  renewed review must read that reason alongside the changed evidence.
- [ ] The steward now approves the same handoff for separate kb-build review.
  Record a new item with `replaces` pointing at the earlier rejected item, even
  if the diff is unchanged: reconsideration preserves the original gate outcome.
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
- [ ] Replay the original resolver commands. `canvas output` exposes O-000001 and
  K-000001; `delivery profile` exposes O-000002 and K-000002 via a declared edge;
  `locale` still reaches only its original concept. Do not alter ranking code
  or add aliases to unrelated concepts to make this specimen pass.
- [ ] Run the fresh **after retrieval** agent with the identical request and
  no hint about the repair. Preserve its source-grounded answer, actual
  consulted leaves and leaf-specific preflight. Compare its navigation with
  baseline: fewer unnecessary query reformulations, while allowing recovery
  for unresolved requirements. A higher score alone is insufficient. Required
  catalog, rules and entry reads are ordinary navigation, not failures by
  themselves. Keep the baseline's shortcomings visible.
- [ ] Only now resolve supported findings via the helper; Locale stays open
  until N distinct validated completed-review dates strictly postdate its latest
  occurrence. Stamp actual current-cycle gates and cumulative approved work;
  same-day reruns add no aging day. Rejection/reopening uses the same fragment
  files, never additional siblings.
- [ ] Commit the reviewed bundle with installed hooks, preserving stdout and
  commit SHA. No `--no-verify`, hook removal, or ignored engine failure.

Record wall-clock times, model/settings, prompts and gate responses, full
commands/output, fixture commits/diffs, and any failed or pending checks in the
run report. A successful synthetic trial demonstrates this route only; it is
not a production-scale or general agent reliability claim.

## Interrupt and resume the review

Run this separately from the successful repair specimen above, using fresh
fixture roots and fresh agents with no prior conversation. Preserve exact
prompts, actual tool output, review/evidence bytes and file diffs.

- [ ] Have reflect present its queue. Simulate separate steward decisions:
  reject the wording repair with a reason; approve only the Knowledge handoff,
  with downstream work explicitly not started. Interrupt after bound outcomes
  and pending work are durable, before final STAMP.
- [ ] Give a fresh agent only the fixture root, injected date and instruction
  to resume the installed reflect workflow. It reads the saved gate evidence,
  preserves the rejection, never re-asks a recorded gate and never treats the
  handoff as implemented or promoted. Proposed findings remain unresolved.
- [ ] Complete review accounting and stamp; inspect `work.pending: 1` and
  `work.completed: 0`, with one rejection and one approval in the actual categories.
  Resume again on the same day. No duplicate outcomes, work rows or aging dates.
- [ ] A fresh audit reads this retained chain without writes, reporting review
  completion separately from the pending repair. Include malformed or incomplete
  state specimens; failures must remain visible rather than invented totals.

An independent reviewer freezes held-out relevance, scope and abstention cases
before repair. Keep their answers outside the repair agent's context; report
regressions and raw denominators. Any case revealed or tuned against becomes
development evidence, never a held-out success.
