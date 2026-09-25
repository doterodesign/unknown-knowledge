# Retrieval end-to-end: 08066b5 (original) vs HEAD (current)

Date: 2026-09-24. Read-only investigation; no code changed.
HEAD = `d24ab62`. The heldout "current" pin `52a6270` is **not** an ancestor of
HEAD (merge-base is `08066b5`), but `git diff 52a6270 HEAD -- payload/engine payload/protocol`
is empty, so HEAD's engine and protocol are byte-identical to the evaluated current
runtime. All HEAD line numbers below also hold for `52a6270`.

## TL;DR

1. **The resolver algorithm did not change.** `decomposition.js` and `scoring.js`
   are byte-identical; `commands/resolve.js` changed only for identity plumbing
   (`K-/L-` to `O-/K-`, `authoringRecords`, legacy-jurisdiction helper). On the same
   store content (`fixtures/ts-app`) both commits return the same ranking and
   output within about 15 bytes (see Measurements).
2. What changed is **everything around the resolver**: a 2.2x larger mandatory
   onboarding surface, a new Subject/intent-plan retrieval path with **no
   relevance ranking** (`id-v1` = sort by ID), pretty-printed query envelopes of
   20 to 77 KB against a 16 KiB per-result host cap, API/MCP operations that
   **do not expose `resolve` at all**, and a current-arm fixture shape that
   gives the lexical resolver nothing to match on.
3. The measured current-arm fixture (development-v2 materializer) returns
   **zero resolution for every natural-language and keyword question I tried**,
   while the original-arm pilot fixture (materialize.js) returns hits for keyword
   queries because it writes `terms:` from passage slugs. This is a
   fixture-construction asymmetry, and it probably accounts for a large part of the
   gap (see §3, item 1). It is a hypothesis: the sealed heldout fixtures are
   not in the repo.
4. A gold dataset exists: 48 dev-v2 tasks with passage-level qrels (39 answerable),
   plus 6 pilot tasks with record-level qrels. It can be joined to record IDs
   through `materialization.json`.

---

## 1. Retrieval at 08066b5

### Protocol (payload/protocol/AGENTS.md @08066b5, 508 lines, 31,015 B)

- First action: read AGENTS.md, then the relevant catalogs (`AGENTS.md:12-19`).
- Loop `RESOLVE → PREFLIGHT → GATHER → ACT → RECORD` (`:145`).
- RESOLVE (`:147-190`): run `resolve.js "<terms>" --json --root .`, read scored
  `results`, follow `source-of-truth`, `knowledge` entry points and `superseded-by`.
  Zero hits lead to store-health preflight, then catalog recovery and a bounded retry.
  After that comes the scoped fallback through `survey-map.js` (`:192-240`).
- PREFLIGHT (`:241-290`): `preflight.js --concepts K-.. --leaves L-.. --today`.
- GATHER: read concept source-of-truth files and leaf bodies/citations.
- Skills: kb-build, knowledge-audit, knowledge-bootstrap, knowledge-reflect
  (27 KB). None of them is on the read path for an ordinary question.

The typical agent sequence is: read AGENTS.md (2 windows at the 16 KiB cap), catalogs,
1 resolve, 1 preflight, then record and source reads.

### Engine: `payload/engine/commands/resolve.js` @08066b5 (1714 lines)

- Inputs: positional query terms (joined), `--root`, `--today`; also `--paths`,
  `--path`, `--doc` (coverage map).
- Store loading: `lib/load-stores.js` gives `model.concepts`, `model.leaves`,
  `leavesByConcept`, `supersedingLeaves`, and registries.
- Matching (`joinText` @08066b5 ~:933, `decompose` ~:655, `scoreLeaves` ~:788):
  - `tokenize` = `/[a-z0-9./_-]+/g` on the lowercased query (`lib/decomposition.js:92`).
    `sameWord` treats a plural `s` as equal (`:104`).
  - Verb axis: tokens phrase-joined against the `knowledge/operations` registry.
    Place axis: joined against `knowledge/jurisdictions`.
  - Noun axis: the concept **ladder** on the *whole query* (`matchConcept`).
    The highest rung wins: exact-term 100, exact-alias 80, term prefix/all-words 60,
    alias 50, summary all-words 40, and draft/proposed −30 (`lib/scoring.js`
    `CONCEPT_SIGNALS`). A separate token-level phrase test on term plus aliases
    binds concepts with `match:null` (these are not ranked).
  - Leaves are scored additively: operation 3, declared concept 2, `terms` phrase 1
    (`LEAF_SIGNALS`). A leaf with no `terms`, `concepts` or `operations` can never
    appear. `heading`, body and catalog title are **not** matched.
  - Scope: `applies.jurisdictions` excludes leaves (reported in `exclusions`).
  - Rank: demoted (stale/draft) last, then score desc, then id.
  - Residue: unconsumed non-stopword tokens.
- Output (pretty JSON): `query`, `decomposition{tokens, operations, concepts,
  jurisdictions, near-miss, residue, resolved-context}`, `scoring` table,
  `results[]` (concepts with source-of-truth, confusables, full `knowledge` entry
  points), `leaves[]` (all leaves with at least one signal, **no top-N cap**), `exclusions`,
  `conduct` on zero resolution, plus store health and time-check.
- Typical size: **1.2 to 5.4 KB**, latency about 50 to 60 ms (median, warm), measured below.

### Preflight

`lib/preflight.js` (122 lines) gives per-concept/leaf verdicts plus `next-action`.
It is unchanged in substance at HEAD (only the concept-ID regex changed to `parseCanonicalId`).

## 2. Retrieval at HEAD (= 52a6270 engine/protocol)

### Protocol: what the agent is told to do, step by step

Mandatory or near-mandatory reads:

| File | 08066b5 | HEAD |
|---|---:|---:|
| `payload/protocol/AGENTS.md` | 31,015 B | 35,442 B |
| `payload/protocol/intent-retrieval.md` | absent | 18,545 B |
| `payload/protocol/engine-interface.md` | absent | 14,653 B |
| **Onboarding total** | **31.0 KB** | **68.6 KB** (2.2x) |

- `AGENTS.md:149-156`: "For combined subject constraints, scope requirements or
  alternative interpretations, follow intent-retrieval.md. Its intent and source
  obligations apply to ordinary retrieval." Every heldout-style question
  (scope + distinction + abstention) triggers this, so the agent must read another
  18.5 KB (2 windows).
- `AGENTS.md:167-190`: a new "read the complete query envelope" paragraph. The
  agent must inspect residue, resolved-context and exclusions and "keep every
  original requirement". This adds more reasoning but no new tool.
- `AGENTS.md:466-481` (Gate rules): points to `engine-interface.md` (11 API/MCP
  operations).
- `intent-retrieval.md` steps:
  1. Build a transient intent inventory (`:10-25`).
  2. Decide whether the typed Subject path is needed (`:27-55`). Inspect
     `<kit-root>/subjects/registry.yaml` (76,614 B in the engineering dev fixture,
     so it cannot be read whole under a 16 KiB cap).
  3. `subject.js lookup "<label>"` per label (`:57-72`). Output is 0.5 to 1.3 KB
     each, with one call per label.
  4. Author a version-1 plan: units, bindings, constraints with exact JSON-Pointer
     `queryRefs`, requirements, branches (strict/alternative/recovery), and explicit
     budgets for 10 counters (`:74-159`). The object-vs-string pitfall for
     `assigned.subject` is documented at `:108-120`. The public campaign attributes
     6 of 14 inadequate current answers to this contract (REPORT.md).
  5. `intent-plan.js --inspect-bindings` with a lookup-requests file (`:161-185`).
  6. `intent-plan.js` structural, then `--validate-queries`, then `--execute-queries`
     with two admission-policy files, decision/assessment/material capture files
     and optional `--operation-limits-json` (`:187-266`).
  7. Preflight each selected record, read sources, and record a
     supported/limited/unresolved disposition per requirement (`:268-311`).
- The ordinary path is still RESOLVE (the same `resolve.js`), then PREFLIGHT, then GATHER.
  intent-retrieval.md says ordinary retrieval "does not require a Subject registry"
  (`:29-34`). The Subject path is still presented as the way to satisfy
  "combined subject constraints", and the resolver often returns nothing on
  these fixtures (§4). In practice that pushes agents onto steps 2 to 6.

### Engine

- `commands/resolve.js` (HEAD 1694 lines): the same algorithm. `matchConcept` `:341`,
  `decompose` `:635`, `scoreLeaves` `:768`, `applyScope` `:850`,
  `rankLeaves` `:889`, `joinText` `:913`, `resolveQuery` `:938`,
  `ZERO_RESOLUTION_CONDUCT` `:1030`. The diffs are identity helpers only. One behavioral
  side-effect: `authoringRecords` (`lib/load-stores.js:1645`) merges **proposal
  records** into the resolver's concept and leaf sweep. Proposals now surface as
  results (for example `proposal:ontology:<uuid>` at score 30), which adds noise and
  candidates that are not eligible evidence.
- `lib/subject-query.js` (746 lines), the new retrieval primitive:
  - The query envelope requires `version`, `stores`, a `where` predicate
    (`all/none/subjects-present/assigned/not/and/or`) and **explicit budgets** (`:329-332`).
  - `ranking` defaults to and **only supports `{profile:'id-v1'}`** (`:350`, `:357-358`).
    Rows are sorted by identity (`:563-566`), and every row carries
    `rank:{profile:'id-v1', signals:[], position}` (`:661`). There is **no relevance
    signal**, so a subject query is a boolean filter and its page is the first N IDs.
  - `maxResultsPerStore` pages with a `pageTruncated` flag (`:624-633`).
  - Records with a missing `subjects` field evaluate `U` and go to `possible`,
    which is hidden by default (`possibleMatches:false`).
  - Each row has ref, label, file, sourcePointers, lifecycle, truth, witness[], unknowns,
    assignments and rank. The envelope adds echoed `query`, `input`, `resources`,
    `coverage`, `assignmentEvidence` and `contextDiagnostics` (`:670-677`).
- `lib/intent-query-plan.js` (269 lines) and `commands/intent-plan.js` (190 lines)
  validate a plan, run admission, then execute each branch through subject-query.
  The JSON output echoes the full validation next to the execution (`intent-plan.js:57`).
- `commands/query-subjects.js` (81 lines) runs one subject query from a JSON file.
  Without `--decision-captures` it refuses (`governance-unavailable`, exit 2), which
  is one more discovery step for agents.
- `api/index.js` registers **eleven** operations (`:145-163`): `engine.capabilities`,
  `subject.lookup|tree|query|route|contexts`, `record.preflight`,
  `intent.validate|inspectBindings|validateQueries|executeQueries`.
  **There is no `resolve`/text-search operation.** API/MCP (`cli/mcp.js` via
  `cli/commands/mcp.js`) clients cannot do ranked free-text retrieval. `resolve`
  is CLI-only.
- All CLIs pretty-print JSON (`JSON.stringify(x, null, 2)`: `resolve.js:1689`,
  `query-subjects.js:79`, `intent-plan.js:31,57,73`). That adds about 40 to 110% more bytes
  than compact output.

## 3. Differences that plausibly explain 15/18 to 10/18

Listed in rough order of likely impact. REPORT.md's own dispositions are 4 host-delivery
(budget) failures, 2 incomplete source bundles and 1 incomplete absence refusal.

1. **The lexical resolver has nothing to match in current-arm fixtures.**
   `acceptance/retrieval/materialize.js:117` (original arm) sets concept
   `term: <passage slug>` and `:139` sets leaf `terms: row.passage.split('-')`. The
   development materializer (`materialize-development.js:128`) instead writes headings
   and terms like `Source-text assertion: css export` / `Source report: ...` and
   **no `terms`, `concepts` or `operations` on any Knowledge record** (0/86 records).
   The resolver ignores headings, bodies and catalog titles, so Knowledge is
   unreachable by `resolve`. Also `phraseWords` splits on whitespace only
   (`lib/decomposition.js:107`), so the token `assertion:` (with its colon) can never
   phrase-join, and concept terms with a `Label: ...` prefix only match through the
   whole-query ladder. Result: zero resolution on every realistic question (§4). The
   agent falls back to catalog, then Subject, then plan navigation, which costs more calls and bytes.
   *Caveat: the sealed heldout fixture recipe is not in the repo. Verify that it
   used these materializer conventions before treating this as established.*
2. **Oversized single results against a 16 KiB per-result cap and a 256 KiB
   cumulative cap** (`DEVELOPMENT-BUDGETS.md`, `TRIAL-HOST.md`). A one-subject
   `query-subjects` call returning 5 records = **20,756 B** (12.3 KB compact, with
   about 8 KB of fixed envelope). A 2-branch `intent-plan --execute-queries` =
   **77,291 B** (36 KB compact, with 17.5 KB of it being the echoed validation). Any such
   result is refused whole by the host, and the bytes still count against the
   budget. This matches the Report-A x3 and Report-E/2 "host withheld a successful native
   result after the tool-result budget was exhausted".
3. **Onboarding bytes more than doubled** (31 KB to 68.6 KB, plus a 76 KB subject registry
   if the agent opens it). That is about 15% of the 256 KiB budget spent before any
   retrieval, and 2 to 3 extra windowed read operations.
4. **Loss of ranking on the new path.** `id-v1` identity order (`subject-query.js:350,357,661`)
   replaces the resolver's scored order. `maxResultsPerStore` truncation takes the
   lowest IDs, not the most relevant. The REPORT says ranking deltas are "null" and that only
   30/114 ranking cells were available, which fits a path that emits no ranking.
5. **The agent must author a complex, strict JSON plan.** That means 10 budget counters,
   JSON-Pointer coverage of every predicate node, an object-vs-string subject rule,
   and admission and execution policy files (`intent-retrieval.md:74-159`,
   `:187-214`). Each validation failure is exit 2, so the agent reports, reproposes and
   reruns. This is consistent with "+4 charged outer actions" (REPORT.md) and the public
   "6/14 qualified-object/string contract errors".
6. **Subject-assignment coverage gaps.** 16/86 dev-fixture records have no
   `subjects` field. They evaluate `U` and are excluded by default
   (`possibleMatches:false`), so a subject query silently omits them from `strict`.
   This could explain the "incomplete source bundle" and "incomplete absence
   coverage" dispositions (Report-B/3, Report-E/1,3). The multi-installation case (Report-E)
   needs one query per installation, and each pays the full envelope.
7. **No text retrieval over API/MCP** (`api/index.js:145-163`). An MCP-driven host
   cannot call `resolve` and must use subject queries only.
8. **Proposal records are mixed into resolver results** (`load-stores.js:1645`).
   The noise is minor, but these results consume the "inspected record" budget (32).
9. **Latency is not a factor.** HEAD resolve is about 20 to 30 ms slower (load-stores),
   and all commands finish in under 120 ms.

## 4. Measurements (this machine, Node v24.19.0)

Setup, all in `$TMPDIR` and removed afterwards:
- Original: `materialize.js` `prepareBaselineRuntime`/`materializeTask` for all 6
  pilot tasks (exact 08066b5 archive). Run with `08066b5` `resolve.js`.
- Current: `materialize-development.js` with a `d5b2d37` runtime export gives 8 installations
  and 82 records. Run with HEAD `resolve.js`, `subject.js`, `query-subjects.js`
  and `intent-plan.js`.
- Also `fixtures/ts-app` at each commit (same content, different ID grammar).

Single wall-clock runs (bytes = pretty JSON stdout):

| Commit / fixture | Query | exit | bytes | ms | Top results |
|---|---|---|---:|---:|---|
| orig pilot engineering | full NL prompt | 0 | 2,345 | 85 | zero resolution (conduct) |
| orig pilot engineering | `css export` | 0 | 1,584 | 82 | K-101 exact-term 100 (correct) |
| orig pilot cultural | full NL prompt | 0 | 3,452 | 94 | leaf L-000001 score 2 (red-attention, correct) |
| orig pilot cultural | `red attention` | 0 | 2,002 | 90 | L-000001 (correct) |
| orig pilot manufacturing | full NL prompt | 0 | 5,078 | 100 | L-000001, L-000002 (north/south seal, correct) |
| orig pilot manufacturing | `north seal` | 0 | 5,423 | 97 | L-000001 score 2 first, plus 3 weaker (correct first) |
| orig pilot prof-services | full NL prompt | 0 | 2,135 | 87 | zero resolution |
| orig pilot policy | retention question | 0 | 1,590 | 82 | zero resolution (decisions-only store) |
| HEAD dev engineering | full NL prompt | 0 | 2,348 | 119 | zero resolution |
| HEAD dev engineering | `css export` | 0 | 1,599 | 112 | O-000001 term-match 60 (correct, residue still lists both tokens) |
| HEAD dev cultural | full NL prompt | 0 | 2,391 | 115 | zero resolution |
| HEAD dev cultural | `red attention` | 0 | 1,234 | 106 | zero resolution |
| HEAD dev manufacturing | full NL prompt | 0 | 2,193 | 120 | zero resolution |
| HEAD dev manufacturing | `north seal` | 0 | 1,225 | 111 | zero resolution |
| HEAD dev prof-services | `refund deadline` | 0 | 1,240 | 117 | zero resolution |
| HEAD dev policy | `retention period support tickets` | 0 | 1,327 | 112 | zero resolution |
| HEAD dev engineering | `web5 proposal` | 0 | 1,682 | 115 | only a `proposal:ontology:<uuid>` (score 30) |

Like-for-like (`fixtures/ts-app`, same content at both commits):

| Query | orig bytes / top | HEAD bytes / top |
|---|---|---|
| `export format` | 4,019 / K-101 exact 100 plus leaf L-000100 | 4,034 / O-000001 exact 100 plus leaf K-000001 |
| `color space` | 1,473 / K-105 | 1,485 / O-000005 |
| `how do I add a new export format` | 2,728 / leaf L-000100 score 4 | 2,737 / leaf K-000001 score 4 |

Warm median latency (10 runs): orig ts-app 58 ms, HEAD ts-app 77 ms, orig
pilot 52 ms, HEAD dev 83 ms, HEAD `query-subjects` 92 ms.

New-path commands (HEAD, dev engineering):
- `subject.js lookup`: 516 to 1,324 B, about 70 ms per label.
- `query-subjects` with `assigned S-000008`, self-and-descendants, 10/store:
  without captures, **exit 2 refused (784 B)**. With `--decision-captures`,
  **20,756 B** pretty / 12,329 B compact, 5 strict rows. Components (compact):
  assignmentEvidence 5.1 KB, groups 4.3 KB, input 1.2 KB, coverage 0.7 KB, and so on.
  `--counts` = 4,834 B.
- `intent-plan --execute-queries`, 2 branches (strict AND with 2 subjects, plus recovery):
  the first attempt was **refused** (`unrelated-relaxation`). After fixing the
  constraint refs it gave **77,291 B** pretty / 36 KB compact, and the strict branch had 0 rows.

Ranking quality: where the original resolver hit, its top result was the
gold-relevant record (engineering O-000001/K-101, cultural red-attention, manufacturing
north/south seal). Subject queries return all assigned records in ID order,
including irrelevant ones (for example K-000001 "opaque export" is graded 0 for engineering-01)
before relevant ones.

## 5. Retrieval tests, harness and gold data

- `acceptance/retrieval/evaluate.js` (78 lines): `scoreTask(expected, execution)`
  gives per-store Recall@10 over applicable grade 2 to 3 records and nDCG@10 with gain
  2^g−1. Separately, a bundle score checks whether one alternative adequate bundle was
  inspected at the exact passages, with ≤10 inspected records. It scores recorded
  traces; it does not run retrieval.
- `tests/retrieval-acceptance.test.js` (288 lines): scorer semantics (missing vs empty,
  top-10, no-answer nulls, duplicates, bundles), plus loading the pilot into
  original-runtime installations. It does not measure retrieval quality.
- `tests/retrieval-trial-host.test.js`, `tests/retrieval-intent-host.test.js`: byte and
  record accounting and refusal behavior of the evaluation hosts (per-result 16 KiB, cumulative
  caps, oversize refusals). They check accounting, not accuracy.
- `tests/retrieval-growth-preparation.test.js`: fixture container byte preservation.
- `tests/reflection-retrieval.test.js`: one alias/relationship recovery case.
- No test runs `resolve` or subject queries against gold qrels and asserts
  recall or nDCG.

Gold-labelled question-to-expected-record data in the repo:

| Location | Tasks | Labels | Size |
|---|---:|---|---:|
| `acceptance/retrieval/pilot/judgments.json` (+ `tasks.json` 10 KB) | 6 | Record-level qrels (grade 0 to 3 plus applicability, qualified IDs), bundles, `candidateExpectations` strict/possible, answer text | 15.6 KB |
| `acceptance/retrieval/development-v2/source-judgments/{engineering-culture,policy-manufacturing,services-holding}.json` | 48 (16 each). Answerable: 15/14/10 = 39 | **Passage-level** grades/applicability (68+46+82 = 196 judgments), bundles, answerSummary, requiredDetails | 42 + 34 + 42 KB |
| `development-v2/tasks.json` | 48 prompts | - | 18.6 KB |
| `development-v2/record-inventory.json` + generated `materialization.json` | 82 records | Maps source#passage (excerpt) to the canonical record ID per installation | 16.7 KB |

To get record-level qrels for dev-v2, join `passageJudgments[].{source,passage}`
to `materialization.json` `installations[].records[].{source,excerpt}`.
The 6 heldout tasks and the growth plan (16 extra records) are sealed or private and
not in the repo. `development-v2/README.md` warns that record-level grades and exact
candidate sets were "pending independent review", so the source-level judgments are the
reviewed layer.

## Reproduction notes

- HEAD resolves `js-yaml` through the parent repo `node_modules`. The worktree has none,
  and `npm ci` was not needed.
- The original runtime was built with `prepareBaselineRuntime`, after re-pointing its
  `node_modules` symlink to the parent repo's.
- The dev fixture was built with `node acceptance/retrieval/materialize-development.js $TMPDIR/uk-dev-data $TMPDIR/uk-dev-runtime`
  (`git archive d5b2d37 payload cli package.json package-lock.json`).
