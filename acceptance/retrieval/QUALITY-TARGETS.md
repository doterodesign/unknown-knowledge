# Prospective quality targets

Status: agreed by the evaluation and integration owners on 2026-09-21, before the corresponding trials. These targets supplement the compact acceptance plan without making aggregate improvement a new prerequisite. This agreement defines evaluation criteria; it does not release trials, publish a Decision or report measured quality. The [operational Decision](../../decisions/entries/retrieval-operational-qualification.yaml) records the rationale. The original evaluator preparation remains preserved.

## Hard gates

- Every deterministic and preservation scenario in the coverage ledger (local historical artifact; original hash/pin retained where recorded) must pass at the applicable final pin, with independently authored expectations and real-interface evidence.
- Zero critical wrong-scope, trust-transfer, silent identity-collision or false-attribution violations in the bounded suite. No new critical held-out regression.
- Every claimed repair target must close: 100% of the explicitly registered claimed targets, each with its positive case, negative controls and required fresh-agent evidence. Do not substitute an aggregate score for target closure or silently drop an unsuccessful target.
- Every emitted strict result must have a valid source-bound witness. Native reference tables and accounting must conform to the actual frozen contract. A valid subset of results does not establish complete delivery.

Integration, P2 and P10 subsequently clarified the originally unqualified phrase
"in the bounded suite": the qualifying current/candidate cohort must contain
zero adjudicated critical events. Baseline and historical events remain reported
separately and are never retroactively cleared. The held-out no-new-critical-
regression condition is additional; it cannot excuse a critical violation still
present in the current system. This is an explicit scope clarification, not a
claim that the original wording already specified treatment-only evaluation.

The specification supplies invariants, not a numerical critical-severity rubric.
Adjudicate actual assertions, reliance and actions against qualified identity,
applicability, evidence provenance and authority boundaries. Record category,
severity rationale, occurrence, source/trace locator and correction status;
independently review ambiguous and critical cases as required by spec section 12.
A correct final answer does not erase an earlier violation. Operational refusal,
inadequacy or a missing bundle alone does not establish a critical semantic
event. Keep uncovered categories/trials unavailable rather than inferring zero.

## Concrete descriptive targets against the actual baseline

Use treatment minus baseline deltas on explicit paired denominators. A zero margin is the prospective descriptive nonregression target; it is not a statistical noninferiority margin.

| Measure | Prospective target | Eligible denominator |
| --- | --- | --- |
| Applicable Recall@10 | Delta >= 0 percentage points | Same answerable task × store × repetition, same judged applicable universe and captured inputs |
| Graded nDCG@10 | Delta >= 0 on the 0–1 scale | Same task × store × repetition with positive ideal DCG and comparable valid rankings |
| Complete acceptable evidence bundle present@10 | Delta >= 0 percentage points | All scheduled paired task trials with a preregistered acceptable bundle or declared nonapplicability |
| Adequate-evidence success | Delta >= 0 percentage points | All scheduled paired task trials |
| Correct abstention | Delta >= 0 percentage points | Preregistered trials requiring abstention |
| False abstention | Delta <= 0 percentage points | Preregistered answerable trials |
| Unsupported answers and scope errors | Delta <= 0 in paired count and rate | All scheduled paired task trials; critical events also trigger the hard gates |
| Steps to adequate evidence | Delta <= 0 mean and median steps | Jointly adequate baseline/treatment pairs only, reported alongside full-cohort success and completion |

An adverse descriptive delta requires explicit adjudication: identify affected tasks, evidence, severity, scope, any accepted tradeoff, corrective action or narrowed claim, and unresolved status. It becomes a release blocker when it violates a hard gate or an expressly claimed repair target; a descriptive aggregate decline alone does not create a new automatic gate. Inconclusive results can establish a capability. A claim of better retrieval requires supporting paired evidence and cannot be inferred from more hits, more proposals or more closed logs.

## Denominators and aggregation

The planned paired full comparison has 24 coverage-selected tasks × 3 repetitions = 72 trial pairs: 54 public pairs and 18 sealed pairs. It compares the real old runtime/resolver plus documented catalog recovery with full current agent planning under equal budgets. The old-runtime baseline is separate from the current identity-only variant.

The four current variants share only the six public sentinels, one per organization: 18 trials per arm. The full agent arm's sentinel trials are reused from the 72 full-treatment trials, not rerun merely for this comparison. Three additional arms add 54 sessions to the 144 paired baseline/treatment sessions, for 198 planned fresh sessions. There is no full-24-task or held-out four-variant claim. Model interpretation consumes the 72 already captured full-treatment traces; it is a separately scored experiment without fresh sessions.

These are registration counts, not successful-outcome denominators. Publish scheduled, attempted, completed, evaluable, excluded/nonapplicable and jointly comparable counts for every metric, by arm, task family/topology, organization and held-out split. Report each repetition and its variation. No statistical significance, population effect or confidence claim follows from three repeats or this selected sample.

Applicable relevance is judged before viewing outcomes and remains separate from exact Boolean candidate eligibility. For each requested store, Recall@10 uses the number of distinct judged applicable relevant records in the first ten returned positions divided by all judged applicable relevant records in that store. Identity includes namespace and kind. Do not merge three store-specific top tens into one invented ranking. For nDCG use DCG = sum((2^grade - 1) / log2(rank + 1)), ranks starting at 1, and the same judged universe sorted ideally for IDCG@10. Preserve the authored grade scale. Fix treatment of any unjudged candidate by source adjudication before scoring, without inspecting which arm benefits. Zero applicable relevance or zero IDCG makes the corresponding ranking metric undefined, not zero.

Duplicates and ineligible records do not gain relevance credit or improve later ranks by being silently removed. Preserve native positions, record the violation, and declare an invalid ranking where the contract requires uniqueness. Valid empty output on an answerable task has zero recall and nDCG. A refused, failed, exhausted, truncated-with-unknown-accounting or missing observation remains in the full attempted/completion ledger; do not silently turn an unavailable ranking into zero or remove the trial. Report rank deltas on explicit common-valid pairs, with missing-pair counts and reasons. A valid-pair subset cannot support a whole-cohort nonregression claim.

For ranking summaries, first report each store and task. Average valid paired repetition deltas within each task, then task means within each organization, then equally across represented organizations. Publish the exact contributing tasks and paired repetition counts. Do not pool relevance denominators across organizations or treat missing task/organization cells as zero. Complete-pair summaries and incomplete-pair summaries must be distinguishable. Raw per-task numerators, denominators, grades and ranks remain available.

Evidence bundle@10 uses at most ten total distinct qualified records selected for the answer, across all stores, against source-adjudicated acceptable bundles. It is a different metric from each store's Recall@10. For no-answer tasks, bundle adequacy is nonapplicable unless a source-based refusal bundle was explicitly registered; report correct abstention separately. Operational failure is not correct abstention. A verified absence of an adequate bundle is failure; an unobservable bundle remains missing, with adequate-evidence success counting no demonstrated success in the scheduled denominator.

Freeze answerability, appropriate clarification, exclusions and abstention labels before outcomes. Report false-abstention counts among explicit abstentions as a secondary diagnostic as well as the required answerable-trial rate. Report unsupported answers/scope errors as event counts and affected-trial counts. Track operational failures separately so they cannot appear as quality improvements.

For steps, the unit is charged host/tool action; also report command/read operations and source exposure. Use the first step at which the sealed adequacy rule is met. Publish jointly adequate-pair step deltas alongside each arm's adequate count over all scheduled trials, timeouts and exhausted budgets. Fewer steps caused by failure do not count as reduced friction. Human review time, engine latency and model/tool cost remain separate measures.

## Repair and growth

Main must declare the approved repair, its claimed targets, expected positive changes and previously passing controls before execution. Plan at most six cases × two states × three repetitions = 36 sessions. Reuse up to 18 pre-repair treatment trials only when task, snapshot, injected date, model/prompt/tool versions, budget and scoring contract match exactly. Show closed targets / claimed targets, newly failing / previously passing controls, and sealed critical regression counts with actual raw denominators.

Growth includes both distractors and relevant evidence. Source-adjudicate affected selected-task truth before ranking; preserve unaffected judgments only with an explicit unchanged-evidence basis. Baseline and growth use the same frozen runtime and matched plans. Do not treat growth as merely a larger negative corpus or imply that every old development task needs a fresh agent trial.

The existing repair has one canvas-output alias target and two controls, locale
and canvas-locale, on its original fixture. The case maximum is not a requirement
for one repair per organization. A prospective three-case comparison was prepared
with eighteen slots across two states and three repetitions, including possible
historical reuse under the criteria above. This is a proposed design, not a
required reader quota. Prior failed acceptance and pending status remain;
no new repair, execution or successful reuse is implied. See the
[repair Decision](../../decisions/entries/retrieval-repair-evidence.yaml).

A subsequent public-evidence audit separates the literal `canvas locale` probe
from a prospective two-part reader question about formats and locales. It also
permits consideration of the original target pair, including its after trace,
as historical r1 evidence only under explicit matching and failed-outcome
retention. No reuse or additional reader execution is yet approved. The original
navigation failure remains, with the invalid zero-resolution allegation
withdrawn; later protocol studies do not become paired alias-effect evidence.

Main and both owners subsequently declined additional historical-runtime readers
merely to fill that matrix. Publication, fixed replays and the failed original
pair already exist. The deferred literal-probe source/scope interpretation was
completed by read-only review of its retained responses and original sources.
This adds bounded no-cross-attribution evidence without repeating a query or
waiving failed navigation, repair completion or separate held-out requirements.

## Existing numeric limits and performance targets remain unchanged

Development-1 charges at most 60 host tool actions and 60 command/read operations, 32 unique qualified records exposed in metadata or full text, 65,536 cumulative source bytes including rereads, 262,144 tool-result bytes including onboarding, 8,192 final-answer bytes and ten total selected bundle records. Catalog rows, exclusions and support records count as exposure. Source bytes already within tool-result bytes are not added twice. Every arm uses the same limits; failed/truncated calls and unknown accounting stay recorded without resets.

Operational query and validation caps stay exactly as registered in the preserved operation inputs (local historical artifact; original hash/pin retained where recorded) and the unchanged query SHA. No new output, explanation or workload allowance is introduced to make v2 fit.

The historical named performance target is Apple M4 Pro, 14 logical CPUs, Darwin 25.4 arm64, Node 24.19.0: CLI median <= 2,000 ms and every observation <= 5,000 ms; warm query median <= 500 ms and every observation <= 2,000 ms; context median <= 1,000 ms and every observation <= 3,000 ms; CLI peak RSS <= 512 MiB excluding fixture generation. Use five fresh observations per condition, separate cold parse/query/context/memory, and no invented percentile estimate. These remain unqualified until the named final runtime, hardware, corpus and actual measurements meet them. The next four correctness calls are not timing samples.

Subsequent [6605402 measurements](PERFORMANCE-6605402.md) qualify the two named
CLI conditions and the joint loaded-query operation. They preserve the near-byte
loaded-query refusal and partial context outcome; neither qualifies successful
near-byte loaded retrieval or complete enumeration. The original targets above
are unchanged, and fourteen failed instrumentation attempts remain recorded.
