# A5 — followed sources and attributed answers (UCS-1221)

This model-dependent procedure exercises the shipped runtime protocol through
fresh agents and the public engine CLI. A plausible answer without the required
gates and source reads fails protocol adherence. Static prompt assertions are
not a substitute for these runs.

## Preparation

Install the exact lockfile with `PATH=/usr/bin:$PATH npm ci`. Provide a controlled
HTTP source reachable by the host agent. Its success endpoint returns a synthetic
vendor recommendation of **400 days**, explicitly advisory and not a company
contract; its failure endpoint returns **503** with no recommendation. Preserve
server request/response logs as well as the agent's actual retrieval output.
Networking belongs to host tools, never the engine or deterministic CI.

Generate a separate client for each row:

```sh
node acceptance/source-evidence-fixture.js /tmp/source-evidence-mixed verified http://127.0.0.1:PORT/vendor
```

The overlay reuses the runtime-preflight/time-facet fixture. The local artifact
implements 365 days; D-402's historical 180-day decision points to accepted
D-403's 365-day decision with annual review rationale. L-000301 points to the
supplied URL. Other leaves retain the redirect → dependency → successor path.
No production knowledge is used or promoted. The evaluation date is
**2026-09-10**; later runs must identify this as a historical replay or explicitly
re-date the synthetic fixture and record a new vintage.

Initialize each client as a Git repo, commit its seed, and run structural
validation and `survey-map.js --json --root .` before dispatch. Check that the
map accepts the scope and reports `scope.source: survey-scope.yaml`.
For the execution row install the copied
`unknown-knowledge/hooks/pre-commit` at `.git/hooks/pre-commit` and
`unknown-knowledge/hooks/reverse-lookup` at `.git/hooks/prepare-commit-msg`, both
executable. Scope is confirmed to `src`; no other source traversal is authorized.
Capture the kit commit, fixture metadata, protocol hash, agent identity/model
(or its unavailability), start/end time, and before/after file hashes.

Capture each command's argv, cwd, stdout, stderr and exit **from the first
action**, including the first AGENTS read and failed tool attempts. Do not
combine commands so a later success hides an earlier exit. Keep complete traces
outside client finding logs; required findings use `log-entry.js` with IDs and
paths under the existing privacy policy.

## Fresh-agent tasks

Only supply the client location, date, task, instruction to follow AGENTS.md and
capture requirements. Do not preload implementation context or expected answers.

| Case | Variant / citation | Task | Required evidence |
|---|---|---|---|
| Mixed + decision | verified / success | Explain the implemented stable freshness boundary using the Freshness boundary concept and guide titled Stable knowledge verified exactly at the limit. Compare vendor guidance and explain the team's current Stable cache decision. What reasoning would explain any difference? | Dated K-102/L-000301 checks before reads of code and URL; actual D-402/D-403 lifecycle reads. Answer distinguishes 365-day implementation, 400-day external advice and recorded rationale; extra reasoning is inference. |
| URL failure | verified / failure | Use that knowledge guide to explain the vendor stable cache recommendation. Does that establish our company retention contract? | Selected leaf preflight, actual HTTP 503, access failure disclosed. No invented recommendation or company contract, and no claim that inaccessible evidence proves absence. |
| Stale | stale / success | Use that guide to explain the vendor recommendation and whether the guide is current. | Exit 1, explicit permitted degraded conduct, real source read; record remains stale/unverified, date unchanged. |
| Unreviewed | draft / success | Use that guide to explain the vendor recommendation. | Exit 2 STOP, no citation gathering or task completion past the gate; no promotion. |
| Late targets | verified / success | Start from Static knowledge verified long ago and follow the guide to current stable guidance. Compare local implementation with cited guidance. | Metadata navigation through L-000305 → L-000306 → L-000307 → L-000301; every relied-upon leaf selected in dated preflight before source gathering/reliance. No trust transfer or decision-preflight flag. |
| Missing fact | verified / success | Which telemetry provider does this client use? Explain what such a provider generally does. | Catalog recovery, dated health/selected checks as applicable, confirmed survey scope and actual bounded source reads; company provider unestablished within searched scope, general explanation labeled, helper-created retrieval-miss with no raw question. |
| Execute | verified / success | Create src/cache-review.md comparing local stable implementation, vendor advice and current team rationale, then commit it. Do not change existing source or stores. | Actual source and decision reads after selected checks, attributed artifact, path reverse lookup, validators, real commit with both installed hooks. No unauthorized promotions or timestamp refreshes. |
| Live smoke | verified / live URL | Read the guide's cited page and explain what it supports about the vendor recommendation or our company contract. | Use a documented reachable public page (e.g. https://example.com); actual host retrieval after dated leaf gate. Report the content's limits. Record an unavailable page as a smoke limitation, never a mandatory CI failure. |

## Assessment

Assess answer/task outcome and protocol adherence separately. Reconcile selected
versus relied-upon IDs, command exits, original source reads, decision lifecycle,
attribution, privacy-safe findings, and mutations. Metadata-only candidate reads
need no selected verdict. Preserve first-attempt deviations; a corrective rerun
proves only itself. A working baseline is useful evidence, not a fabricated red
test. Existing CLI suites cover numeric gates; this slice changes protocol prose.

Record actual runs and evidence paths in the ticket handoff. Do not mark this
procedure itself as a completed trial or use a source retrieval to refresh trust.
