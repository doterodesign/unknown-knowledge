# UCS-954 — next-action code migration

Preflight's existing `next-action` field now contains a stable machine code.
Human output prints the same code as `next: <code>`. The client-owned table in
`payload/protocol/AGENTS.md` supplies the conduct wording; the engine does not
read that table or emit its instructions. In a seeded repository the table is
at `unknown-knowledge/protocol/AGENTS.md`.

## Release classification and migration

This replaces prose in an existing public output field and is a **breaking
CLI contract change: MAJOR under D-021**. This ticket changes no package version
and publishes nothing. Release coordination must include this classification.
The seeded-once ownership model remains unchanged; there is no automatic update.

Consumers that display or match `next-action` prose must switch to matching
codes and supply their own wording, using the client protocol as the default.
Apply the process exit code before interpreting any per-record action. Unknown
codes should report a contract mismatch and stop, never imply checked success.

| Previous next-action case | Code |
|---|---|
| Trusted, fresh per-run verdict | `proceed` |
| Attributable error evidence, concept or leaf | `repair-evidence` |
| Draft/proposed concept status | `review-status` |
| Draft/proposed leaf stage | `review-stage` |
| Store-wide degradation | `repair-store` |
| Stale leaf | `reverify-leaf` |
| Undated time-governed leaf fallback | `supply-verified-date` |
| Skipped freshness check | `supply-evaluation-date` |

The undated fallback remains defensive: current structural missing/malformed
verification-date findings take precedence and produce `repair-evidence`.
It is not a new path around those findings. Missing review-stage behavior is
unchanged and belongs to UCS-1220.

Factual `reason`, `time.reason`, and evidence remain human-readable. The shared
time diagnostics now describe the missing evaluation date or measured age and
limit without instructing the reader to supply a flag or reverify. Resolver
and derived-layer output also inherit these factual time strings. Consumers
should use existing verdict/evidence fields rather than parse diagnostic prose.
The standalone audit's older advisory notice is outside this per-Verdict change.

The numeric exit contract, verdict/staleness/lifecycle computation, field names,
ordering, and logging are unchanged. Exit 2 still stops the governed task,
including unknown-class results; no row permits continuing source gathering
through that gate. Exit 1 retains default quarantine-and-continue and visibly
unverified stale conduct. `--log` covers selected quarantined concepts only;
leaf findings use the existing helper. No caching, automatic promotion, or
verification-date refresh is introduced.

## Reading earlier A5 traces

The acceptance harness and its historical pasted command evidence are unchanged.
In `acceptance/A5-agents-md-walkthrough.md`, the historical trusted `next:` line
now reads `next: proceed`, and the quarantined line reads
`next: repair-evidence`. Their conduct is read from the protocol table above,
subject to the command exit gate. Old time-skip and stale prose in historical
traces is historical output, not the current output contract.

The [UCS-954 fresh-agent walkthrough report](ucs-954-a5-walkthrough.md) records actual tool execution and
checks the source reads and exit handling separately from answer correctness.
