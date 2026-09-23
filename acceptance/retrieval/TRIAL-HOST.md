# Public trial host — pinned-1

This test-only host exposes fixed `read`, text `resolve`, and selected `preflight`
operations. It is intended for the original development runtime and the pinned
S4 historical runtime. It is not a canonical-runtime acceptance adapter, an OS
sandbox, or a replacement for the installed retrieval protocol.

Before a fresh reader starts, the operator prepares a new state file outside the
fixture using `node acceptance/retrieval/prepare-trial-host.js STATE CONFIG.json`.
The configuration names `root`, logical installation `namespace`, injected
`today`, exact root-relative `sourceFiles`, and exact `metadataFiles`. Include
onboarding, scope, rules and registries in metadata; exclude private sources.
The preparer uses that installation's loader and verifies every catalog row
against its actual record inventory, including repair Decisions and support.
It rejects invalid or incomplete inventories. No old/new identity mapping exists.
Runtime/dependency provenance and source authorization remain operator checks.

The state snapshots all declared source, metadata, catalog and record bytes.
Every operation verifies these hashes before and after gathering its result.
Changed files or metadata for an unregistered returned record cause refusal
before delivery. Prepare separate states after each condition is immutable;
never reset a trial's state to continue a run. A lock prevents concurrent
operations from spending the same counters; a crash or unavailable/locked state
requires an incomplete-run report, not a lock deletion and silent continuation.
This boundary assumes the operator-supplied metadata list contains no undeclared
record bodies; setup must classify such files as record files instead.

Reader commands, exactly one per host tool invocation:

```sh
node acceptance/retrieval/trial-host.js STATE read unknown-knowledge/protocol/AGENTS.md 1 80
node acceptance/retrieval/trial-host.js STATE resolve 'public query'
node acceptance/retrieval/trial-host.js STATE preflight '{"concepts":["K-101"],"leaves":["L-000100"]}'
```

Read whole declared catalogs, record files and source files. Optional inclusive
line windows work only for non-record metadata, allowing large onboarding files
to fit the delivery ceiling. Read subsequent windows as needed; every window
and repeat costs an operation and output bytes. Partial source/record reads are
refused, so they cannot be mistaken for complete passage inspection. All source
reads get a qualified `#whole-file` passage plus any Markdown level-two headings.
Those markers describe exposure, not evidence sufficiency for a question.

The development-1 limits apply: 60 operations, 32 inspected records, 32 full
records, 65536 source UTF-8 bytes and 262144 wrapper-result UTF-8 bytes. The
pinned-1 delivery interface additionally caps each return at 16384 UTF-8 bytes,
identically in both conditions. Oversized content is refused, never partially
delivered. A refusal consumes output bytes; if even its fixed message cannot
fit, the host emits nothing and exits 2. The ledger retains the refused attempt.

Catalog and class-file reads charge every contained record. Returned Ontology
results, confusables, decomposition concepts, Knowledge entry points, exclusions,
related leaves, successors and selected verdicts charge their actual qualified
records, including unselected support. Bare identity references do not count as
metadata exposure. Source bytes count repeated source-file reads, while record
body and onboarding bytes belong to output bytes. Source bytes are a subset of
output bytes, not an additional total. Each event records exact emitted bytes
and SHA-256, including the status header. Completed engine failures preserve
their actual exit code and diagnostics; wrapper refusals have their own status.

Use both `functions.exec`'s `max_output_tokens: 20000` pragma and nested
`exec_command`'s `max_output_tokens: 20000`, then `text(result.output)`. Do not
display the entire tool-result object. Set `yield_time_ms: 1000` on the nested
command: if it returns a session ID, the required poll is another outer tool
invocation and its exact output must also be audited. Never re-run the operation
just because the first tool call yielded. Avoid batching operations.

The evaluator audits the actual outer transcript for all tool invocations,
bypasses, setup exposure, retries, truncation, final-answer bytes (8192 maximum),
and selected evidence bundle size (10 distinct records). Match actual displayed
wrapper content to the ledger; wrapper hashes alone cannot prove host-visible
delivery or account for host framing. Missing/truncated transcripts mean total
delivery accounting is unverified. No fresh-agent or quality claim follows from
unit tests. Keep unsupported protocol navigation or logging as a host-surface
limitation/incomplete conduct; do not turn it into product absence or invent
unavailable operations. This host cannot write logs or perform repairs.
