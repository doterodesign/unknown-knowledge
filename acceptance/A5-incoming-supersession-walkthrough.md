# A5 — old-only policy retrieval (UCS-1226)

This is a fresh-agent walkthrough, not a static prompt assertion or a CI test.
The scenario uses synthetic policy evidence. It does not authorize promotion
of live organizational knowledge.

## Setup

Copy `tests/fixtures/resolver-v2` into an isolated flat-layout fixture. Include
the current `payload/engine`, `payload/schemas`, `payload/protocol`, ESM package
marker and installed runtime dependencies. Add an AGENTS.md wrapper explaining
the flat layout and pointing to the shipped protocol.

Give L-000102 the sole term `twilight policy`, and L-000140 the sole term
`retention schedule`. Remove their concepts and operations so the latter cannot
match the old query accidentally. Both leaves are verified, freshly dated and
scoped to `eu-eaa`. Only L-000140 declares `relates.supersedes: [L-000102]`.
The leaf bodies point to separate local synthetic source memos: the earlier
memo says 3 days; the replacement says 14 days and explicitly replaces the
twilight policy effective 2026-08-01. Validate the fixture before dispatch.

## Fresh task

Start an agent without implementation or prior evaluation context. Give it
only the fixture location, instructions to follow AGENTS.md and preserve all
commands/output, and this question:

> Under our twilight policy, how long should EU client evidence be retained
> now? Today is 2026-09-10. Follow the repository protocol and cite the evidence.

## Evidence checklist

- The initial query reaches only L-000102, and exposes L-000140 through derived
  incoming supersession without a supplied alias or successor hint.
- Actual `preflight.js --leaves` includes every consulted leaf, especially
  L-000140, with the injected date before evidence-backed answer selection.
- The agent compares target scope and lifecycle, reads the leaf and cited
  replacement memo, and checks whether the chain continues.
- The answer selects 14 days from the replacement source and distinguishes
  the historical 3-day requirement without inventing additional policy.
- Preserve the exact task, fixture, command/output trace, final answer and
  wall-clock duration. Count resolver calls separately from source reads.

## Recorded run — 2026-09-10

Fresh agent `policy_walkthrough_retry` passed in 106.28 seconds against the
implementation at dcc3beda41f970ab90f4e0e75dbf7ada803d7ee7. It ran three resolver
calls: initial old-only query, the same query with the supplied date, then the
successor's own term to check for further replacement. One actual preflight
covered L-000102 and L-000140; both source memos were read. The answer selected
14 days with the replacement memo cited. No store/source files were changed.

The first setup attempt omitted schemas and correctly stopped on engine exit 2;
its trace is retained separately and is not counted as a pass. The valid run
noted the base fixture's absent Decisions rules file; no Decisions entries were
needed. CLI tests separately cover branching, scoped-out, stale/draft, dangling,
simple and overlapping cyclic successors. The later cycle-membership fix does
not alter this acyclic retrieval path.

Evidence bundle: `ucs-1226-trial/` in this task's local artifact directory,
containing `task.txt`, `fixture/`, `trace.md`, `answer.md`, and `setup-failure/`.
The handoff report supplies the absolute path. This small fixture demonstrates
navigation and source selection, not large-corpus performance.
