# UCS-1222 — generated wrapper navigation evidence

Requirement: UCS-1222, under UCS-1216. Review fixed point:
`200a01d29388604a4fe8263b633d0fdbb31e9d85`.

## Method

Two independent clients were seeded by the real `cli/init.js init --yes`
with the Codex platform and TS stack. Each already had a client-authored
AGENTS.md instruction to answer concisely and cite the source; init appended
its wrapper. Controlled fixture population added only K-101 and its source
from ts-app, removing cross-references to omitted records. Structural
validation and K-101 preflight passed before each trial. No fixture knowledge
leaf, planted defect, or live company record was introduced.

Each run used a fresh `codex exec` session, CLI 0.153.4, an isolated CODEX_HOME,
`--ignore-user-config --ephemeral --sandbox read-only --json`, and no model
override (runner default; the JSONL events do not expose model identity).
Prior tasks, evaluation reports, expected answers, and navigation coaching
were not supplied. Host skill availability was not removed; run 2 emitted a
skill-description truncation notice, but no skill or external tool was used.

Exact task, identical in both runs:

> Which file formats can this editor export? Answer from the current repository
> and cite the source path. Do not change files.

Reproduction checklist: [A5 wrapper navigation](../../acceptance/A5-wrapper-navigation-walkthrough.md).
Complete setup commands/outputs, generated clients, exact prompts, JSONL
tool/output traces, answers, and runner stderr are retained in the UCS-1222
task artifacts; their absolute locations are included in the task handoff.

## Run 1 — partial

Session: `01a088cd-7d7d-7742-81a8-d7ece1e0ce17`.
The first paragraph initially said to navigate through catalogs and entries,
without explicitly stating that a resolver hit does not replace those reads.

Observed command order, all exit 0:

1. Read `unknown-knowledge/protocol/AGENTS.md`.
2. Resolve `export format`.
3. Preflight K-101 (trusted).
4. Read `src/registry/export-formats.ts` with line numbers.

Correct five-format answer and no recursive source discovery. Catalog, rules,
and entry reads were omitted: **partial**, not a completed catalog-navigation
trial. Wall-clock duration was not instrumented for this run.

## Run 2 — pass

Session: `01a088cf-eea6-7111-92bc-1b4c703e524a`.

The first paragraph now explicitly requires relevant catalog and entry reads
before product-source reads, even when the resolver returns a hit. A new
initializer run produced a new client; the agent session was not resumed.

Observed command order, all exit 0:

1. Read `unknown-knowledge/protocol/AGENTS.md`.
2. Resolve `export format`.
3. Read `unknown-knowledge/ontology/_catalog.yaml` and `_rules.yaml`.
4. Read the catalog-named `ontology/classes/100-product.yaml`.
5. Preflight K-101 (trusted).
6. Read the entry-provided `src/registry/export-formats.ts` with line numbers.

The answer names PNG, SVG, JPG (JPEG), WebP, and PDF and cites the source at
line 5. No recursive filename/content search occurred. No file edits occurred.
Elapsed runner time: **43.61 seconds** (`/usr/bin/time -p`).

This is one passing model-dependent trial on one host and one small covered
catalog, separate from automated delivery coverage across all five platforms.
It makes no claim about a tool firewall, leaf-specific preflight, catalog-miss
fallback, or cross-host reliability. The latter protocol areas belong to
other tickets.

## Raw trace checksums (SHA-256)

- Run 1 `trace.jsonl`: `0d05157a8f1cae81038a2a360fa5228896d0533ddf91e721f2968a308ba210a7`
- Run 2 `run-2/trace.jsonl`: `8c58b9b4722442cbf0a74eabcf1490237f905502b5dabf7fcf9184e559df7f52`
