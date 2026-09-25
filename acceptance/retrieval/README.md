# Retrieval gold data, fixtures and benchmark

Test-only material for measuring retrieval. Nothing here ships in the kit
payload.

| Path | What it is | Used by |
| --- | --- | --- |
| `development-v2/` | 48 development questions with independent source judgments and answer bundles, plus the source and curation reviews behind them | `tests/ask-gold.test.js` (the gold gate), `benchmark.js` |
| `pilot/` | six earlier development tasks with their own reviewed judgments | `tests/migrate.e2e.test.js` (second gold set, after 2.x conversion) |
| `materialize.js` | builds the pilot tasks as 2.x installations with the original 08066b5 runtime | `tests/migrate.e2e.test.js`, `tests/retrieval-acceptance.e2e.test.js` |
| `materialize-development.js` | builds the development-v2 installations; its output is committed as `fixtures/canonical` | regenerating the canonical fixture |
| `materialize-growth.js`, `materialize-scale.js` | grow those installations with reviewed or synthetic records (see [growth construction](GROWTH-CONSTRUCTION.md)) | `tests/retrieval-growth-preparation.test.js`, scale timing |
| `benchmark.js` | ranks each gold task with `ask` or `resolve` and reports bundle depth, output size and latency | `node acceptance/retrieval/benchmark.js ask` |
| `evaluate.js` | per-store recall/nDCG and bundle scorer for reviewed agent traces | `tests/retrieval-acceptance.e2e.test.js` |
| `materialize-corpus.js` | builds the eight development-v2 installations as 2.x stores with the original runtime | `heldout-run.js`, `tests/corpus-arms.e2e.test.js` |
| `arms.js` | makes the current-runtime copy of a 2.x installation: fresh `init`, stores converted by `migrate.js` | `pilot-readers.js`, `heldout-run.js`, `tests/corpus-arms.e2e.test.js` |
| `reader.js` | runs one fresh headless reader session and records its trace | `pilot-readers.js`, `heldout-run.js` |
| `grade.js` | blind grader: one trace and one case in, a closed verdict out | `pilot-grade.js`, `heldout-run.js` |
| `pilot-readers.js`, `pilot-grade.js` | run and grade readers on the public pilot tasks | choosing the reader model |
| `heldout-run.js` | the held-out comparison between the original and current runtime ([latest report](agent-evaluation/HELDOUT-2026-09-24.md)) | `node acceptance/retrieval/heldout-run.js --custody <dir> --model claude-sonnet-5 --summary <file>` |

The [latest agent evaluation](agent-evaluation/HELDOUT-2026-09-24.md) (six
new held-out cases, one repeat per runtime) found no regression: both runtimes
completed or correctly declined 4 of 6, with identical verdicts on every case,
and the API refused two cases' sessions in both runtimes. The earlier study
(15/18 original, 10/18 rc.8) and its reports remain at
[2777b9b](https://github.com/doterodesign/unknown-knowledge/tree/2777b9b/acceptance/retrieval).

## Agent evaluation

A reader is a headless Claude Code session (`claude -p`) started in a private
copy of one installation. It gets the question and nothing else: no user
settings, memory, hooks, plugins or MCP servers, and only the Read, Grep, Glob
and Bash tools, with Bash limited to the engine and plain reads. It follows the
installation's own `AGENTS.md`. The trace records every tool call, the bytes
it returned, tokens, cost, time and the answer. The CLI must be signed in
(`claude auth status`).

Both runtimes hold identical content. The original arm is the 2.x store as the
08066b5 runtime built it; the current arm is a fresh 3.0 `init` holding the same
stores after `migrate.js`, which is the documented upgrade path.

Held-out cases are written and reviewed by independent agents and sealed
outside the repository, so whoever tunes retrieval never sees them; the
repository keeps only the
[blinded receipt](../../docs/agents/2026-09-24-heldout-custody-receipt.md).
They use the development-v2 corpus, built for the original runtime by
`materialize-corpus.js`.

The grader (`grade.js`, Sonnet 5, no tools) sees the case and the trace and
returns `completed`, `correct-abstention` or `failed`, plus critical flags
(`unsupported-claim`, `answered-unanswerable`, `scope-violation`,
`fabricated-citation`). The rubric is in the file and was fixed before any
held-out session ran. For held-out cases its reasoning is written only to the
custody directory.

### Reader model

Measured on the six public pilot tasks, current runtime, one session each,
graded by `grade.js` and checked by hand
([results](agent-evaluation/pilot-model-comparison.json)):

| Model | Graded correct | Cost, 6 tasks | Mean time | Mean tool output |
| --- | --- | --- | --- | --- |
| Haiku 4.5 | 5/6 | $0.43 | 33 s | 46 KB |
| Sonnet 5 | 6/6 | $1.32 | 51 s | 61 KB |

Both cited a gold bundle on every task. Haiku failed holding-company-01: it
acknowledged that the two subsidiaries' records must not be merged and then
listed their merged formats anyway, a critical `answered-unanswerable` error.
Half the held-out cases are scoped refusals, so the evaluation uses Sonnet 5:
about three times Haiku's cost, still about $0.22 a session, and a reader that
does not add its own refusal errors to both runtimes. Opus was not tried
because Sonnet missed nothing.

Run the scorer's independent literal examples:

```sh
node --test tests/retrieval-acceptance.e2e.test.js
```

## Agreed rubric

Judge source evidence before observing ranks. Grade 0 is irrelevant, 1 is
background, 2 is useful partial evidence, and 3 is directly answer-bearing.
Applicability is a separate explicit judgment. Applicable Recall@10 counts
grades 2–3 against **all** applicable grade 2–3 judgments for the requested
store. nDCG@10 uses gain `2^grade - 1`; inapplicable records have zero gain but
consume their returned rank position. Each store has its own rank list.
No-answer tasks have undefined recall/nDCG, represented as `null`, not 0 or 1.
They can still have grade 2–3 evidence supporting a scoped abstention or
capability-refusal explanation. Raw relevance counts/DCG remain descriptive
diagnostics; never aggregate their numerator/denominator as defined recall.
`answerable` concerns the requested factual response (including an explicitly
requested conflict explanation), not whether a useful bounded response exists.
Record the exact abstention target and explanation passage evidence separately.

`scoreTask(expected, execution)` takes independent per-store `judgments` and
actual per-store `rankings`. It returns recall numerator/denominator/value and
nDCG actual/ideal DCG/value per store. IDs are opaque qualified identities
(installation, kind, exact ID); the scorer does not parse or coerce record IDs.
Duplicate judgments/ranks, unjudged IDs/stores, or invalid judgment fields
refuse scoring rather than quietly repair the run. An explicitly empty rank
list is a completed empty list; an omitted run/store is explicitly missing.

`bundles` is an array of alternative adequate evidence bundles. Each bundle
contains `{id, passage}` references to independently judged applicable answer
evidence. `execution.inspected` records up to **ten total distinct inspected
records**, each with the source passage locators actually read. One complete
alternative yields bundle numerator/denominator 1/1. A matching record with
the wrong inspected passage yields 0/1. Catalog-recovered evidence may be
inspected without appearing in the initial ranked list. A union of ten hits
per store is a different budget and must be reported separately.

Missing bundle judgments or inspection traces remain missing. No-answer bundle
scores are undefined (0/0, value null); abstention correctness requires its own
independent answer review. Overall `status` reports available **ranking**
scoring (`scored`, `partial`, or missing execution); the separate `bundle`
result can still be missing. These fields are not release/pass statuses.

This scorer consumes reviewed traces. It cannot authenticate that source
reads, fresh preflight, approvals or agent trials actually occurred, and does
not infer answer correctness, scope violations or friction from rank alone.
Those require actual tool/source traces and independent adjudication. Input
schema/runtime/query/registry revisions, date and budgets belong in the run
ledger alongside this score; the scorer adds no snapshot or identity service.

## Pilot and release boundaries

The authorized pilot starts with six different development tasks, one per
organization topology. Final recommendation is 72 tasks: 48 development and
24 held out, eight plus four per topology. Development evidence/judgments
require independent P5 review before freezing. Main holds sealed cases;
held-out intent review uses an independent fresh reviewer so P5's protocol
implementation does not receive hidden answers. No held-out answers belong
in the implementation-owner-visible pilot.

Paired baseline uses the original resolver CLI **and** documented catalog and
source recovery. Actual host trials use three fresh runs per condition; fixed
plans or hand-authored outputs never count as model trials. Record available
model/tool/prompt metadata and label unavailable values. Synthetic steward
responses test handling, not actual human approval. Freeze operational budgets
after the pilot and before comparative runs; freeze numerical supported limits
and performance/quality targets after baseline and before optimization.

Passing these scorer examples proves metric arithmetic and refusal behavior.
It does not establish new runtime acceptance, improved retrieval, completed
agent trials, supported scale, or release readiness.

## Disposable original-runtime installations

`materialize.js` exports `prepareBaselineRuntime(destination)` and
`materializeTask(taskId, destination, runtime)`. Both destinations must be new
scratch paths. Export the original `08066b5f527b9d7d9705a3367bc26dcf080271ad`
commit from this repository; do not substitute the current working tree.
The preparer uses the pinned initializer and verifies the exported file inventory
and bytes against Git blob identities before installing a task. Additional files,
unexpected directories and symlinks in the exported source refuse preparation.
Pinned archive and tree reads disable Git replacement objects, so local
replacement refs cannot substitute another commit's source under the baseline ID.
Its dependency link
uses this checkout's installed lockfile dependencies; run the pinned lockfile's
`npm ci` first and record Node/dependency versions with measurements.
The deliberately shared `node_modules` link is outside that source verification:
this helper does not attest dependency package contents or transitive integrity.
Comparative trials need separately prepared/recorded dependencies and must not
describe this source pin as complete executable-environment attestation.

```js
import { prepareBaselineRuntime, materializeTask } from './acceptance/retrieval/materialize.js';
const runtime = prepareBaselineRuntime('local-history:retrieval-original-runtime');
const fixture = materializeTask('policy-01', 'local-history:retrieval-policy', runtime);
```

The six frozen development organizations create eight roots: the holding
company has three isolated installations. The returned inventory contains
baseline-local record identities, actual source paths, passage locators and
source SHA-256, alongside the separately versioned baseline prompt. No ID
crosswalk is serialized and no compatibility reader enters the target runtime.
The installed CLI is `unknown-knowledge/engine/resolve.js`, whereas the exported
repository CLI is `payload/engine/resolve.js`. Follow each root's generated
`AGENTS.md` before an actual agent trial.

The original format uses class-scoped `K-101` ontology identities and `L-000001`
knowledge identities. The holding source's declared identity spans are adapted
only in scratch copies. Its frozen pilot source remains unchanged. Source
claims otherwise remain verbatim; headings supply catalog wording and source
pointers, with no expected-answer text added to the runtime. Old Decisions
retain their actual status and explicit supersession edges, including both
accepted competing successors in the policy fixture.

Four installations need a synthetic `D-999999` vocabulary warrant for the old
Knowledge registries. This support record is outside the task-answer universe;
count its exposed metadata in inspection overhead. Original `verified` leaves
represent independently reviewed synthetic source snapshots dated 2026-09-18,
including explicit historical-source notes. This is neither live human approval
nor support for the new lifecycle model: the old engine lacks retired leaves
and subject metadata. Ontology retirement uses its original `deprecated`
status. Unknown leaf scope omits `applies`; the old engine's unrestricted
inclusion loses the new unknown/empty distinction. Source scope still governs
what evidence can establish. Non-source Decision dates identify synthetic
snapshot authoring, not invented historical policy approval dates.

The preparer copies the excluded private decoy as fixture setup; trials must
not read it. It stages new scratch files for source mapping but creates no
commit. Never point this helper at an existing owner installation.

For measurement, count every unique qualified record whose metadata/body is
exposed, including catalog rows and unselected resolver/exclusion metadata.
Count full-record details and catalog entries separately. A whole class-file
read exposes all its records. Count source UTF-8 bytes cumulatively, including
repeat reads, and count all exposed source passages; a locator alone cannot
establish passage inspection. Namespace-qualified files remain distinct even
when their bytes match. Keep request, tool-result and final-answer byte counts
separate; source bytes are already part of tool-result bytes. Unknown/truncated
visibility stays incomplete, never silently becomes the full emitted size.
Record command/read operations separately from host tool invocations so batching
cannot conceal work. Internal engine file I/O is not agent inspection.

Materialization and a guided CLI/catalog/source walkthrough characterize the
development baseline only. They cannot stand in for independent fresh agents,
three repetitions, the remaining development/held-out corpus, or paired results.
