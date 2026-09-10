# A5 — complete runtime evidence preflight (UCS-1219)

This is a model-dependent acceptance procedure, not an automated prompt-text
assertion. A correct answer without the selected-leaf commands fails protocol
adherence. Run each row in a fresh agent context with only the generated client
repo, its runtime protocol, the task below, and the evaluation date.

## Preparation

Install the kit's locked dependencies, then generate a new scratch client:

```sh
node acceptance/runtime-preflight-fixture.js /tmp/runtime-preflight-mixed verified
```

The destination must not exist. The script overlays the existing time-facet
fixture, copies the current engine and protocol, and supplies synthetic local
citations. `fixture-version.json` records its overlay version, upstream fixture,
kit version, variant, and evaluation date. Preserve the kit commit and SHA-256
of the copied protocol alongside the transcript. The pinned current evaluation
date is **2026-09-10**; this is a historical replay when run on another day.
For a present-day trial, deliberately re-date the synthetic fixture and record
that new vintage rather than silently reusing the old freshness expectations.

These are controlled fixtures, never approved company knowledge. No production
user text belongs in logs. Keep complete test transcripts outside `logs/`;
protocol-required findings still use the helper and its content restrictions.

## Fresh-agent tasks and checks

| Run | Variant | Task given to the agent | Required observations |
|---|---|---|---|
| Mixed | verified | Explain the implemented stable freshness boundary using the Freshness boundary concept and the guide titled Stable knowledge verified exactly at the limit. No edits to implementation/stores. | Selected K-102 and L-000301, explicit date, exit 0, then read `src/freshness.ts`; answer stable limit 365 days. |
| Leaf only | verified | Starting from the knowledge catalog only, use the guide titled Stable knowledge verified exactly at the limit to explain the stable limit. Do not use ontology concepts. No edits to implementation/stores. | `--leaves L-000301`, no concept required, explicit date, exit 0, cited source read. Store-health-only is insufficient. |
| Late targets | verified | Starting from the knowledge catalog entry titled Static knowledge verified long ago, follow the guide to the current stable freshness limit. Do not use ontology concepts. No edits to implementation/stores. | Follow L-000305 redirect to L-000306, its L-000307 prerequisite, then the replacement L-000301. Each relied-upon leaf gets its own selected verdict before reliance, possibly in incremental batches. L-000307 is time-exempt, not freshness-certified. L-000302/303/304 are incidental candidates and need not be selected. |
| Stale | stale | Use the knowledge guide titled Stable knowledge verified exactly at the limit to explain the stable limit and whether that guide is current. No edits to implementation/stores. | L-000301 stale, exit 1; disclose unverified claim, read source if continuing; no silent timestamp refresh or promotion. |
| Draft | draft | Use the knowledge guide titled Stable knowledge verified exactly at the limit to explain the stable limit. No edits to implementation/stores. | L-000301 unknown, exit 2; stop governed task without presenting a checked answer or proceeding to source gathering after the stop. |
| Proposed | proposed | Same task as Draft, in a separate fresh context. | L-000301 unknown, exit 2; same stop. |
| Malformed | malformed | Same task as Mixed, in a separate fresh context. | Loader parse error, exit 2; stop. If resolver fails first, do not continue simply to manufacture selected-leaf evidence. Deterministic CLI checks separately prove all requested verdicts degrade to unknown. |

Metadata may be read before preflight to discover the next target; that is
navigation, not checked reliance. Before accepting the answer, reconcile the
actual relied-upon ID set with `verdicts` and `leaf-verdicts` from this run.
Resolver time/stage metadata never substitutes for those verdicts. A declared
verified stage is eligibility metadata, not authenticated evidence of approval;
a source read is separate again.

## Evidence record

For each run preserve: fresh agent/session identity, reported model (or explicit
unavailability), start/end and elapsed time, fixture metadata, protocol hash,
actual command text, stdout/stderr and exits, source reads, final response, and
any changes. Record **answer outcome** separately from **protocol adherence**,
including selected versus relied-upon leaves and any exit-2 continuation.
Never label this checklist alone a completed agent trial.

The deterministic companion checks are the existing public CLI suites:

```sh
node --test tests/preflight.test.js tests/frontmatter-v2.test.js tests/time-facet.test.js
```

They cover trusted, stale, draft, skipped dates, time exemption, malformed
stores, per-run verdicts, and current exits. The fixture variants can also be
queried directly with `preflight.js --concepts K-102 --leaves L-000301 --today
2026-09-10 --json --root <scratch-client>`: expected exits are 0, 1, 2, 2, 2
for verified, stale, draft, proposed, malformed respectively. A no-selector
health check yields no selected verdicts; omitting the date for the governed
L-000301 gives unknown/exit 2. These CLI runs do not replace the agent trials.
