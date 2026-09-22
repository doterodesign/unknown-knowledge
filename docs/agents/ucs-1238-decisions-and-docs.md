> Packaging stage 2/7, version `3.0.0-rc.3`. This stacked prerelease is for review and new-installation development. The existing-store migration/cutover workflow arrives in PR4; do not migrate existing installations with this intermediate tree.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# UCS-1238 — decisions, documentation and acceptance boundaries

P5's structural plan, binding inspection, exact query provenance, admitted
execution and optional shared-operation adapter are implemented. Fresh-host
intent/source-review acceptance remains separate and incomplete. This index
records implementation rationale and documentation coverage; it does not
promote Decisions or qualify production limits.

## Decision coverage

The four individually linked entries below are **proposed** backfills,
authored after implementation. Their dates do not
represent historical approval dates. Each contains rationale, tradeoffs,
consequences, implementation paths and test evidence.

| Proposal suffix | Choice and alternatives addressed |
| --- | --- |
| [3636c7da-f47b-490c-a37d-02b0ec639f9c](../../decisions/entries/intent-retrieval-contracts.yaml) | Closed transient inventory, readable typed binding witnesses and exact owner-supplied provenance; avoids treating lexical residue/schema validity as complete interpretation or adding a second evaluator. |
| [a5c52715-cec0-476a-82c6-32e9099e9976](../../decisions/entries/intent-query-execution-contract.yaml) | Conservative whole-plan reservation, separate branch execution, captured-input comparison and cumulative authentic operation; avoids implicit capacities, refunds, merged recovery results and local CLI failure policies. |
| [85820498-82bc-4f84-8e36-67f60ddd1349](../../decisions/entries/intent-host-evidence-conduct.yaml) | Host source dispositions and fresh existing gates; avoids a parallel trust engine or semantic-entailment claim. |
| [b10eac52-921c-485c-bcb8-1820a16d53c3](../../decisions/entries/intent-trial-host-accounting.yaml) | Fixed actual CLI test host, delivered-output accounting and preserved failed attempts; avoids trimming output or retroactive credit after a fix. |

Existing decisions already govern the surrounding choices:

- [D-000003](../../decisions/entries/D-003-three-stores-truth-anchor.yaml): retain the three truth anchors; plans are not another store.
- [D-000007](../../decisions/entries/D-007-payload-allowlist.yaml): explicitly ship the protocol and engine; do not ship acceptance hosts or fixtures.
- [D-000010](../../decisions/entries/D-010-git-native-concurrency.yaml): reviewed files and additive coordination, without a new runtime service.
- [D-000011](../../decisions/entries/D-011-verdicts-engine-conduct-protocol.yaml): deterministic checks and host conduct remain separate.
- [D-000014](../../decisions/entries/D-014-engine-never-executes-client-code.yaml) and [D-000022](../../decisions/entries/D-022-engine-is-javascript-jsdoc.yaml): reuse deterministic JS modules, without client-code execution or network/model interpretation.
- [D-000021](../../decisions/entries/D-021-version-policy.yaml): version semantics. Main applies the user's every-PR version/documentation requirement across the combined PR; internal P5 commits do not each create a release.

## Documentation coverage

| Surface | Coverage or non-applicability |
| --- | --- |
| [Structural guide](ucs-1238-intent-plan-s1.md) | Documents default-mode boundaries and plan grammar; corrected old wording to identify the added binding-inspection mode. |
| [Binding guide](ucs-1238-intent-bindings.md) | Actual identity/lookup ownership, captured witnesses, ambiguity, unsupported claims and installed CLI. Decision index linked. |
| [Query and operation guide](ucs-1238-intent-query-plan.md) | Provenance, both reservation policies, execution/failure distinctions, capture transports, authentic operation and bounded receipts. Decision index linked. |
| [Shipped intent protocol](../../payload/protocol/intent-retrieval.md) | Inventory, ambiguity, recovery, fresh gates, requirement dispositions and privacy. Added operation-option/receipt limits so installed users see the opt-in boundary. |
| [Shipped AGENTS](../../payload/protocol/AGENTS.md) | Existing RESOLVE/GATHER links and source obligations already cover P5. No additional edit needed for this rationale backfill. Main owns shared routing changes. |
| [Root README](../../README.md), [CONTEXT](../../CONTEXT.md), [CHANGELOG](../../CHANGELOG.md) | Already describe the command and explicit modes. Main reconciles shared current-version notes and README wording; this patch does not change command behavior. |
| [Manifest](../../cli/kit.manifest.yaml) | Already ships the focused protocol and engine directory. Decision backfills and developer guides do not add payload files. |
| Acceptance README (contract arrives in PR7; see delivery availability) | P10-owned rubric, custody and experiment boundaries remain unchanged. P5's host contract is summarized below; frozen fixtures, reader prompts, ledgers and runtime copies are untouched. |
| Root AGENTS, CONTRIBUTING, PR template, CI, package/lock versions, publishing guide | Main-owned PR policy/version integration. No scoped P5 edits or independent bump; no tag/publish authorization. |
| Schemas, templates, IDE wrappers and migration guides | No wire-format, template, wrapper or migration behavior changed by this documentation patch. Existing wrappers continue to point to shipped AGENTS. |

## Actual test-host contract

The acceptance-only intent host (contract arrives in PR7; see delivery availability)
invokes the fixed installed CLI. Reader requests choose Subject lookup or a
plan mode: structural, inspect-bindings, validate-queries or execute-queries.
Executable, root, captures and admission policies remain operator controlled.
Plan transports are temporary files outside the fixture and are cleaned up.
Runtime/input drift refuses before invocation. Unknown output shapes, identities,
malformed JSON and oversized output refuse before delivery accounting.

Delivered Subject metadata is separate from exposed records. Full binding target
entries and every execution row count even when an earlier branch result survives
inside a failed wrapper. Repeated delivered bytes remain cumulative. Explicit
original-source file reads are a separate counter; source quotations inside
records mean that counter is not total source exposure. Private command receipts
retain actual exit/signal/error, captured-buffer sizes and hashes; truncated
capture is not described as full raw output. See
host tests (contract arrives in PR7; see delivery availability).

The original single guided Dirac demonstration at `bf78859` is closed. It used
catalog/source fallback and completed no query execution. A syntax-refusal shape
bug was fixed in `ffba9ee` (integrated as `2e22966`) and checked separately. The
later successful-validation output still exceeded the unchanged host cap. Missing
conduct capabilities and incomplete source-exposure accounting remain explicit.
Neither later code tests nor this documentation maintenance change that attempt,
earn it retroactive credit, or authorize another reader or benchmark.

## Remaining acceptance

Module tests prove declared routing, binding inspection, replay, separate branches
and instrumented allowance composition. They do not prove the host noticed every
material requirement, resolved homonyms appropriately, rejected blue/cultural
decoys, read every relied-upon source, preserved country limits, or obeyed every
gate after failure. Those require independently reviewed fresh-host evidence.
Repeated interpretation, paired retrieval, heldouts and operational qualification
remain main/P10 acceptance work. P5 owns fixes for demonstrated defects in its
module/protocol scope; no unproved outcome is marked complete here.

## Retained reconsideration material

The [consumer contract](ucs-1237-reconsideration-consumers.md), under the
reconsideration Decision (contract arrives in PR3; see delivery availability),
adds `--material-captures` to both intent query modes. Existing assessment and
Decision evidence remain necessary where referenced. The query-plan guide and
installed intent protocol describe the flag, unchanged result shapes and
per-record eligibility. Structural/inspection modes remain independent and
reject query evidence flags. This transport addition does not close agent
interpretation, source review, MCP or operational acceptance.
