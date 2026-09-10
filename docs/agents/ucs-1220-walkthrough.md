# UCS-1220 — fresh-agent conduct evidence

Six actual fresh subagents ran the shipped runtime loop on 2026-09-10.
Each used `fork_turns=none`, its isolated synthetic client, the task and date,
and command-capture instructions. No prior evaluation, issue discussion or
implementation context was loaded. No model override was set; agents identify
as Codex/GPT-6 where exposed, with exact serving variant unavailable.

Fixture revision: `1370824` (the implementation commit). Later changes are
acceptance/report documentation and test readability only. The copied engine and protocol were
compared byte-for-byte with the reviewed branch. Each trial's `manifest.json`
records the fixture variant, evaluation date and protocol SHA-256. Dependencies
live outside the governed store and generated `.gitignore` excludes them from
Git snapshots; trials did not commit dependencies or alter implementation/stores.
Required findings were appended only through the logging helper.

Evidence root:
`/Users/dimitriotero/.codex/visualizations/2026/09/10/01a0890c-8506-7a33-ae64-5287670d38b6/ucs-1220/`.
For each row, read `trials/<variant>/commands.jsonl`, `trace.md` and
`manifest.json`. `trial-prompts.md` preserves the task/harness instructions;
`trial-audit.json` summarizes actual preflight argv/exits, source reads and
engine/protocol comparisons. `record.mjs` captures each underlying command's
argv, start/end, stdout, stderr and status separately from model narration.
`fixture-integrity.json` compares each completed client with a newly generated
control and confirms no source/store changes (runtime dependencies and logs
excluded from that comparison).

## Outcomes and adherence

| Variant / fresh agent | Selected preflight | User-visible conduct | Capture / protocol limits |
|---|---|---|---|
| missing-stage / `/root/trial_missing_stage` | L-000301, dated; unknown, review-stage, exit 2 | Reports missing stage despite fresh date; stops without citing or reading source | Two recorder invocation mistakes were not captured; one error's tool output was truncated. All actual client reads and CLI runs captured. No claim of complete command capture. |
| draft / `/root/trial_draft` | L-000301, dated; unknown, review-stage, exit 2 | Reports draft as unverified and stops before source read | Initial recorder-path typo failed before reading anything and is absent from commands.jsonl; disclosed in trace. |
| proposed / `/root/trial_proposed` | L-000301, dated; unknown, review-stage, exit 2 | Reports proposed stage and stops before source read | No reported conduct deviation. Protocol display truncation addressed by recorded targeted reread. |
| malformed / `/root/trial_malformed` | K-102 + L-000301, dated; unknown, repair-store, exit 2 | Reports loader failure, stops before sources and does not infer answer from nested time metadata | No reported deviation. Failed preflight precedes catalog/source reads; no continuation to manufacture navigation evidence. |
| stale / `/root/trial_stale` | L-000301, dated; stale, reverify-leaf, exit 1 | Reads src/freshness.ts; answers 365 days while calling the 367-day-old record stale/unverified; requests steward reverification | A workdir typo failed before process creation; no shell executed. Initial commentary was omitted. All executed shell commands captured. |
| missing-date / `/root/trial_missing_date` | L-000301, dated; quarantined, missing-verified, repair-evidence, exit 1 | Reads src/freshness.ts; keeps freshness unestablished and quarantine intact; records leaf quarantine through helper | No reported deviation. Source read did not fill date or promote stage. |

All six selected every leaf they relied on before any source gathering.
Incidental K-102/L-000302–307 results stayed outside the evidence set, except
K-102 selected explicitly in the malformed trial. Catalog recovery after a
zero-result query followed store-health preflight, then catalog/rules/entry
reads. The recovered title was logged as retrieval-struggle where applicable.
Draft/proposed agents performed RECORD-only logging after the stop; neither
continued GATHER/ACT or read source after exit 2.

Recorded command intervals (first recorded command to last recorded command,
excluding final report generation and unrecorded failed wrappers): missing-stage
101.408 s, draft 93.258 s, proposed 81.415 s, malformed 21.582 s, stale 108.616 s,
missing-date 99.983 s. These are trace boundaries, not latency benchmarks.

These are first-attempt results, with no prompted corrective trials or reruns
to replace deviations. Stop/degraded conduct is supported by actual execution;
flawless capture across all trials is not claimed. The local citation fixtures
do not establish live-company knowledge or provide a live-URL smoke test.
Broad answer provenance and source-following expansion belong to UCS-1221.

## Automated checks

- Focused: 123/123, including external CLI and installed-hook real Git tests.
- Full: 1085/1085, no skips; one final full-suite run (114.251 s).
- Lint: 134 files, zero failures.
- Automated acceptance: A1–A4/A6 pass; A5 remains model-dependent as above.
- Structural: zero findings/errors; two baseline absent-store warnings.
- Typecheck: unavailable; no script or toolchain configured or added.

After review, the test matrix's positional fields were replaced with named
case properties; the affected preflight suite passed 38/38 and lint stayed
clean. Production engine/protocol bytes did not change after the full suite
or fresh-agent trials, so no second full-suite run was needed.

Logs are in the evidence root as `focused-final.txt`, `full-final.txt`,
`lint-final.txt`, `acceptance-final.txt`, `structural-final.txt`.
`red-missing-stage.txt` preserves the failing trusted/exit-0 baseline result;
`green-missing-stage.txt` and `matrix-focused.txt` preserve focused progression.
No version bump, package publication, lockfile edit or hook-attribution change.
