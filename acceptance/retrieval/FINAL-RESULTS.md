> Historical integration report: the original single pending rc.2 description below is retained as provenance. Delivery now uses seven dependent draft PRs, rc.2 through rc.8; see [delivery evidence](../../docs/pr-delivery/README.md). Original evaluated pins and outcomes have not been rerun or relabeled.

# Stable identity, Subjects and retrieval — implementation review

The implemented capabilities are permanent K/O/D identities, governed optional
Subjects, deterministic queries, reviewed migration and lifecycle operations,
agent intent guidance, and shared API/CLI/MCP access. **The evaluation does not
establish better agent retrieval.** Both public and held-out comparisons show
lower current task completion. This is an unpublished `3.0.0-rc.2` review;
deployment, package publication and customer migration are separate actions.

Deterministic reconciliation, critical-category review, emitted-witness
verification, the registered repair target and anonymous repeated-case reporting
are complete. These establish the bounded capabilities and evidence below;
they do not establish quality nonregression or authorize release.

## What changed

- Knowledge, Ontology and Decisions use permanent `K-000001`–`K-999999`,
  `O-000001`–`O-999999` and `D-000001`–`D-999999` identities. Zero is reserved;
  filenames, labels and classification do not allocate or change identity.
- Optional `S-NNNNNN` Subjects have definitions, aliases and governed history.
  Records may have multiple assignments without a primary subject. One semantic
  parent defines ancestry; typed related links provide separate navigation.
- Queries evaluate Boolean predicates over the selected captured records.
  Missing classification is unknown; an explicit empty list is known empty.
  Descendant expansion, scope, coverage, limits and witnesses remain explicit.
- Agents interpret questions, propose plans and inspect sources. Deterministic
  execution does not prove that a plan expresses the question or that matching
  records support an answer. The eleven shared read operations reuse domain
  behavior through API, request-file CLI and local stdio MCP.
- Migration reviews an isolated complete runtime/data candidate. Old IDs have
  no normal-runtime lookup fallback; temporary rewrite correspondence is
  disposable. New identities are never reused. Subject lifecycle history and
  source evidence retain their separate preservation obligations.

The [P1–P11 documentation map](../../docs/change-completeness.md#p1p11-coverage)
and [shared interface guide](../../payload/protocol/engine-interface.md) describe
the implemented contracts. Public lifecycle mutation tools and a general
Decision search API belong to separately scoped work; they are not implied by
the eleven read operations.

## Verification and bounded acceptance

| Requirement | Evidence and disposition |
| --- | --- |
| Deterministic and preservation cases | Frozen `6605402`: 3,906 tests, 3,878 original passes and 28 failures subsequently reconciled by targeted checks (19 Git-fixture corrections, nine obsolete expectations). No runtime fix or unresolved deterministic failure. This is not a single all-green rerun. One additional independently reviewed E01 test proves eligibility beyond the lexical evaluation top ten. See the [70-cell mapping](FINAL-DETERMINISTIC-COVERAGE.md). |
| Representative interfaces and installation | Native/API/request-CLI/official MCP SDK and copied installation assertions are bound in that mapping. Repository acceptance passed automated A1–A4/A6; A5 remains an unrun manual walkthrough, not an automated pass. |
| Critical errors | Public review covers 162 retained attempts; held-out review covers all 36 observed outer action sequences, expressed evidence reliance and final answers. Both report zero observed critical wrong-scope, trust-transfer, silent identity-collision and false-attribution events, separately by arm. Unseen context and model attention remain unavailable. See [public](PUBLIC-CAMPAIGN-RESULTS.md) and [held-out](HELDOUT-RESULTS.md) reports. |
| Every emitted strict result has a witness | Public 123/123 and held-out 59/59 strict occurrences accepted. Six public and five held-out missing native bodies were recovered with exact original full stdout length/hash and independently reviewed. Recovery supplies no original delivery, accounting, attention or reader-success credit. Possible/unknown rows remain separate. |
| Claimed repair | The one registered corrected-condition target has 1/1 accepted closure, with publication, positive and negative evidence and the actual fresh reader binding. Earlier failed trials and the original pending governed-work row are preserved. See [repair disposition](DECISIONS-AND-EVIDENCE.md). |
| Reflection history | Existing conduct receipts and the independently reviewed positive archival trial establish repeated-day behavior, pending handoff preservation and archive readback before deletion. Synthetic injected dates are disclosed. See [archival result](FINAL-DETERMINISTIC-COVERAGE.md#positive-archival-boundary--accepted-result). |
| Growth and fixed plans | Original varied baseline: 39/60 passes plus a separately accepted 21/21 store-selection correction. Matched growth: 60/60 fixed-query checks. Original failures remain recorded; these are not agent-quality gains. |
| Performance | Named M4 Pro/Node 24.19 conditions qualify both CLI workloads and the joint loaded query. Near-byte exposed queries refuse; complete context enumeration and P8 assignment-history capacity remain unqualified. See [measurements](PERFORMANCE-6605402.md). |

Engine and CLI bytes remain unchanged from the final deterministic runtime.
The held-out current pin is `52a6270`, including the separately tested guide
clarifications; later changes are evidence/documentation only. Public current
results remain at `79c3efc`; the original comparison runtime is `08066b5`.
Do not pool these pins or instruction versions as one experiment.

## Agent outcomes and limits

| Measure | Original | Current |
| --- | ---: | ---: |
| Public eligible v3 paired adequate responses | 30/32 | 18/32 |
| Public registered evidence bundles completed | 21/32 | 16/32 |
| Held-out source-supported task completion | 15/18 | 10/18 |
| Held-out answerable task completion | 9/9 | 3/9 |
| Held-out not-fully-answerable task completion | 6/9 | 7/9 |
| Held-out demonstrated applicable evidence bundles at ten | 9/9 | 3/9 |
| Held-out correct source-grounded scoped abstention | 6/9 | 7/9 |
| Held-out operational nonanswers on answerable tasks | 0/9 | 4/9 |
| Held-out complete accounting | 18/18 | 12/18 |
| Held-out task completion with complete accounting | 15/18 | 8/18 |

The held-out 18 pairs contain seven current regressions, two improvements and
nine ties. Of the six current applicable bundles without demonstrated success,
two are verified incomplete and four unobservable. Do not convert the latter
into observed empty bundles. Five current operational refusals have unavailable
semantic correctness; they are not correct abstentions. The primary false-
abstention rate is null because inclusion of operational inability was not
frozen; the concrete operational nonanswer counts above remain visible.

The independently accepted anonymous detail report (local historical artifact; original hash/pin retained where recorded)
retains all 36 arm/repetition outcomes, six case summaries, 114 ranking cells and
19 owner/store groups, with missing values and reasons. Its SHA256 is
`0a32c5773611daea69a2bd1a584545c96e975f5f114d245225df266396421740`.
Main verified its six-file safe manifest, case/arm sums, paired deltas and step
subsets without opening private questions, answers or source judgments.

| Anonymous case | Topology | Original repeats | Current repeats | Observed disposition |
| --- | --- | --- | --- | --- |
| Report-A | Single installation | 1, 1, 1 | 0, 0, 0 | Three successful native results were withheld after the host output budget was exhausted; adequate source bundles were not obtained. |
| Report-B | Single installation | 1, 1, 1 | 1, 1, 0 | The third current refusal lacked complete source-absence coverage. |
| Report-C | Single installation | 0, 0, 0 | 0, 1, 1 | Two current scoped abstentions gained sufficient source coverage; the first current attempt stopped at native validation. |
| Report-D | Single installation | 1, 1, 1 | 1, 1, 1 | Both arms supported the scoped abstention in every repeat. |
| Report-E | Three separately qualified installations | 1, 1, 1 | 0, 0, 0 | Two current answers lacked the complete separately owned source bundle; the other attempt lost a native result to the host output limit. |
| Report-F | Single installation | 1, 1, 1 | 1, 1, 1 | Both arms obtained the complete source-supported answer in every repeat. |

Here 1 means source-supported task completion and 0 means it was not established;
0 does not imply a fabricated answer. The seven regressions comprise four host-
delivery failures, two incomplete source bundles and one incomplete source-
absence refusal. Their usability impact remains unresolved. No incorrect admitted
native query result or critical semantic error was established by this review.
The report preserves qualitative reasons and observed failures; it does not infer
that a budget increase, a different host or another guide edit would fix them.

Held-out ranking evidence contains 30 available ordered owner/store cells out
of 114 requested, with 24 numeric Recall@10/nDCG cells and nine common-valid
paired cells. Whole-cohort ranking deltas remain null. Available-list eligibility
is a disclosed post-observation mathematical clarification; recovered forensic
bodies receive no ranking credit. Narrow available subsets cannot overturn the
full scheduled task-completion result.

For eight jointly source-adequate held-out pairs, current steps increase by a
mean four and median 4.5 charged outer actions. The six-pair subset with complete
accounting has a mean increase of 3.8333 and median 4.5. These are paired deltas,
reported alongside success; an incomplete or failed task is not a speedup.
The public ten-pair ordinary-answer subset separately increases by a mean 4.6
actions. Engine latency, agent actions, human review time and model cost are
different measures; unavailable measurements remain null.

| Additional required measure | Value | Reason |
| --- | --- | --- |
| Human review time/effort | null | The accepted evidence does not establish an independently measured human-effort denominator. Agent/tool elapsed time is not human review time. |
| Agent monetary cost | null | No accepted model billing or cost measurement establishes it. Action counts are not a cost estimate. |
| Longitudinal recurrence after repair | null | The bounded repair target and replays do not establish a later recurrence rate or observation period. More proposals or closed log rows do not establish improvement. |

These are three-repeat task-level holdouts on existing public synthetic sources,
not proof on unseen organizations or corpora. Exact submitted prompt equality,
backend model version, exhaustive prior exposure and latent attention are
unavailable. Shared OS custody is not full isolation. Six truncated current
deliveries leave accounting incomplete without establishing a budget violation.

## Review scope

The [prospective targets](QUALITY-TARGETS.md) require explicit adjudication of
adverse quality deltas. Aggregate improvement was not an additional hard gate.
The supported conclusion is implemented capability with observed usability and
task-completion regressions, not nonregression, general conduct certification or
proven better retrieval. Documentation clarifications address observed operand
and stop-rule confusion; no causal improvement is inferred from those edits.
No additional reader study or speculative runtime change is needed merely to
replace an unfavorable result.

Substantive choices and evidence dispositions remain in the existing proposed
[operational Decision](../../decisions/entries/retrieval-operational-qualification.yaml)
and [evaluation Decisions](DECISIONS-AND-EVIDENCE.md). Implementation authority
does not publish those records. The [documentation audit](../../docs/change-completeness.md)
explains affected and unchanged surfaces. Package and both lockfile versions
match the single pending `3.0.0-rc.2` PR, with Unreleased changelog notes; the
actual target base must be rechecked before merge.

Reporting provenance: the user authorized internal coordination and evaluation-
report review. Main specified fresh report-only aliases and allowed reporting
fields under that implementation authority; the user did not personally design
the serialization. The main final-report acceptance (local historical artifact; original hash/pin retained where recorded)
records this clarification alongside the unchanged original exports, SHA256
`ec7bc0ad060210d6324f94ab1c81d6529ea34067ef19d9ebc6bbf084c5a5b746`.

The evaluator's [final combined report](review-packet/REPORT.md)
is sealed with report SHA256
`81d402bf651a018563e9121902297ce03c7fc7dacc922d5ea4af418e560db881` and
manifest SHA256
`189f6b9982c4aacbc213b0fe65792eb43c982a26b381d48ac6ee00d40a1a95ee`.
Main verified all fourteen report files and twenty source bindings, read all
seven adverse-pair dispositions, and reconciled the final conclusions with the
accepted reports and specification. This repository review supplies the explicit
unavailable human-effort, cost and recurrence dispositions above. Local evidence
attachments must accompany any later review handoff; private source judgments
remain outside the implementation context.

Final documentation checks passed: structural validation has zero findings/errors
and the two expected absent-store warnings; value validation has zero findings
with no live Ontology concepts in this Decisions-only repository. All 454 local
link occurrences checked resolve, the diff is clean, and engine/CLI bytes still
match `6605402`. Package/lock/changelog validation passes against the rc.1 base.
These checks supplement the retained runtime evidence; they are not new product
tests or a claim that the original full-suite failures never occurred.
