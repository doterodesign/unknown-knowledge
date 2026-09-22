# unknown-knowledge

A free, open-source CLI that stands up a self-improving knowledge base in any
codebase, and a deterministic engine that keeps it honest.

**The map is never the fact.** The stores hold claims and pointers; your source
files hold the facts. The engine's only job is to diff the two and say exactly
where they disagree — so an agent reading the knowledge base is reading
something that was checked, not something somebody remembered.

Nothing here is a service. There is no runtime, no daemon, no network call, and
no update channel. Everything is YAML and JavaScript files in your repo,
branched and merged by your normal PRs.

## Quickstart

See the [versioned draft delivery stack](docs/pr-delivery/README.md) for current packaging status.

The 3.0 pilot is available explicitly with
`npx unknown-knowledge@3.0.0-rc.1 init`. The stable `latest` channel remains
2.1.0. Existing installations should follow the
[migration guide](https://github.com/doterodesign/unknown-knowledge/blob/main/docs/migration-3.md);
init refuses existing roots and does not overwrite client-owned records.

```bash
cd your-repo
npx unknown-knowledge init          # seeds unknown-knowledge/ and an agent wrapper
npm install --save-dev js-yaml      # the engine's one runtime dependency
```

Then run `/knowledge-bootstrap` in your coding agent. Phase 2 surveys the repo,
proposes Anchor candidates, and you approve each Concept. Nothing is captured
automatically — a fact nobody approved is a fact nobody checked.

## What you get

Three governed YAML stores, split by **truth anchor** — who is allowed to say a
thing is true:

| Store | Holds | Anchored to |
| --- | --- | --- |
| `ontology/` | what the system *is* | your source files |
| `knowledge/` | what the team *knows* | cited evidence |
| `decisions/` | what was *chosen*, and why | the team |

An **Ontology Concept** names a closed set of values and points at the file that
owns them. An **Extractor kind** re-derives that set by reading the file
lexically, and the value validator diffs the two. When someone adds a case to an
enum and forgets the store, the diff says so.

Thirteen extractor kinds ship — across TypeScript, Swift, JSON, YAML,
`.strings`, and newline-delimited lists. Twelve of them the survey map can
propose for you by signature; the thirteenth is reachable only when a human
names it, because "a file of lines" describes every text file ever written.

They **refuse rather than guess**: a kind that meets a spread, a
computed key, or a re-export barrel raises a hard error, because a confident
wrong parse is a false all-clear. What it could not read is recorded in
`logs/misses/` for a human to decide about.

## The engine

Eighteen seeded command-line surfaces. JavaScript with JSDoc types, zero build
step; the seeded engine uses `js-yaml` (D-000022). The npm MCP adapter separately
uses the official MCP SDK and Zod.

| Command | Answers |
| --- | --- |
| `validate.js` | is the store structurally sound? |
| `validate-values.js` | do the Concepts still match the code they point at? |
| `commit-check.js` | do both whole-store validators pass the commit gate? |
| `reverse-staged.js` | what governed each staged path before and after this commit? |
| `preflight.js` | which Concepts may this agent trust, right now? |
| `resolve.js` | what does the store know about these terms or paths? |
| `query-subjects.js` | which captured records satisfy a governed subject query, with explicit counts and coverage? |
| `survey-map.js` | what is in this repo, and what could not be surveyed? |
| `audit.js` | what looks like knowledge but was never written down? |
| `log-entry.js` | append a finding, miss or gap — never by hand-editing YAML |
| `ingest.js` | normalize a document (md, txt, html, pdf) to one intermediate representation |
| `intent-plan.js` | validate declared intent, then optionally validate or execute its captured queries |
| `phoenix.js` | apply a phoenix event: re-file a drifted subtree in bulk, in full or not at all |
| `derive.js` | regenerate the derived layer: plural browse trees, call numbers, resolution index |
| `subject-view.js` | manage the disposable Subject tree, evaluate explicit intersection routes, or count subject contexts |
| `migrate-identity.js` | inventory a pinned pre-cutover commit for offline identity review; does not publish |
| `subject.js` | look up every matching declared subject label or alias, with identity and status |
| `invoke.js` | call the shared versioned API from a bounded JSON request file |

The [shared API, terminal and MCP guide](payload/protocol/engine-interface.md)
documents eleven read-only operations: discovery, subject lookup/tree/query,
intersection routes/context counts, Ontology/Knowledge preflight and four
intent-plan operations.
`unknown-knowledge-engine` calls the request-file CLI;
`unknown-knowledge-mcp` serves the same API over local stdio for an external
agent host. Both require explicit transport capacities. The API's `completed`
envelope means a native report returned, so consumers must still inspect its
native status, coverage and source-review obligations. Tree preview returns
generated text and metadata without writing or checking saved files.
Query output version 2 keeps full assignment outcomes in a query-local
`assignmentEvidence` table; each record's ordered assignments reference it.
Per-operation output versions are available through discovery.
MCP clients can also read the two shipped usage guides through fixed
documentation resources, without IDE access to repository files.

Intent-plan validation checks the declared inventory and its internal references.
The explicit `--validate-queries` mode also validates captured queries and their
intent provenance using the installed registry and retained review evidence.
Use `--inspect-bindings` separately to inspect declared label/alias claims,
homonyms and captured identity outcomes against the installation.
The separate `--execute-queries` mode requires an additional execution admission
policy and preserves each branch's results and limits. None of these modes
establishes semantic completeness, binding proof, or source support. See the
[structural contract](docs/agents/ucs-1238-intent-plan-s1.md) and
[query modes](docs/agents/ucs-1238-intent-query-plan.md#explicit-cli-mode).

`node payload/engine/subject.js lookup <label...> [--locale value] [--context value] [--root repo] [--json]`
reads the selected installation's optional `subjects/registry.yaml`. It returns
all homonyms, including proposed, suppressed and retired metadata, without
granting query or assignment approval. Locale and context filters are exact;
unscoped aliases remain eligible. A valid search with no matches exits 0;
missing authority, invalid installation data and usage errors exit 2 with no
result on stdout. This read-only command never exits 1.

JSON reports `scope: declared-metadata` and `consistency: captured-model`, with
the namespace, identity/schema/normalizer versions and registry revisions.
`registryDigest` hashes the complete captured registry document, including
history. It is a registry-only digest: it does not certify Decision evidence,
the full installation or an atomic filesystem snapshot.

### Exit codes are a contract

Validation surfaces use three codes, and agents ride them:

| Code | Means |
| --- | --- |
| `0` | the check ran and found nothing |
| `1` | the check ran and **found something** |
| `2` | the check **did not run** — an engine failure |

`query-subjects.js` uses 0 for completed evaluation, including zero matches and
output-only truncation, and 2 for refusal, incomplete evaluation or failure. It
never uses findings exit 1. Supply `--query <JSONfile>` with explicit budgets;
`--decision-captures <JSONfile>` provides retained Decision evidence and optional
`--assessment-captures <JSONfile>` supplies retained original registry/identity
pairs. For reconsidered Subjects, `--material-captures <JSONfile>` supplies
their cited retained material. `--counts`
selects counts only, and `--json` preserves the query result and coverage. See the
[subject-query contract](docs/agents/ucs-1237-subject-query.md).
With `--operation-limits-json`, the command loads files and evaluates the query
within one private operation, retaining the initial corpus checks without a
duplicate traversal. The internal
[file-query API](docs/agents/ucs-1237-subject-query.md#fixed-file-to-query-api)
documents that sequence; exposed in-memory contexts still require full
re-admission. This change alone does not establish large-corpus capacity.
Within one captured operation, repeated current-subject checks can reuse verified
immutable governance evidence; record assignments and current model bindings
still receive fresh validation. See the
[eligibility contract](docs/agents/ucs-1235-query-eligibility-reuse.md).
The [assignment contract](docs/agents/ucs-1236-subject-assignments.md) explains
how absent subjects differ from an explicit empty list across K/O/D records.

`subject-view.js --mode route` and `--mode contexts` use that same governed
query evaluator with explicit query budgets and retained Decision evidence.
Their optional `--operation-limits-json` allowance also bounds host input,
validation and output. Tree generation keeps its separate projection limits
and rejects that host flag. See [Subject views](docs/agents/ucs-1239-subject-views.md).

The distinction between `1` and `2` is the load-bearing one. An agent that reads
`1` quarantines the affected Concepts and continues. If a crashed command could
exit `1`, that agent would walk straight past a check that never happened. So a
crash always exits `2`, and a test enumerates every surface, forces a bug into
each, and proves it.

The resolver also accepts repeatable `--path` values for lossless filename
transport, for example `--path 'src/a,b.ts' --path 'src/my file.ts'`. Legacy
comma-separated `--paths` remains supported; mixing the forms fails with
exit 2. See the [complete-filename and safe programmatic invocation guide](payload/docs/README.md#reverse-lookup-for-complete-filenames).
This is an additive MINOR CLI surface change under D-000021.

The reverse audit is advisory: its findings are proposals for human review, and
never a gate. A human may opt in with `--fail-on-findings`, and that is never a
shipped CI default.

## Guarantees

- **The engine never executes your code** (D-000014). No `eval`, no importing your
  modules, no spawning your build. Parsing is lexical; subprocesses invoke
  Git for tracked-file navigation, raw snapshots, and isolated candidate object
  preparation, or Node for fixed checks from the captured trusted installed
  engine. Candidate code is never used as the validation runtime. Preparation
  and validation never advance a ref or change the user's index/worktree;
  retained check evidence does not certify publication.
- **No network, ever.** Nothing is uploaded, and nothing is fetched.
- **Deterministic.** Same tree in, byte-identical output out. Dates are
  injected, never read from the wall clock, so a report is reproducible from
  its inputs.
- **Nothing ships by omission** (D-000007). An explicit manifest lists every file
  `init` seeds; a file it does not name is never copied.

## Hooks — the protocol, enforced mechanically

Two POSIX-sh hooks seed under `hooks/`: `pre-commit` runs both whole-store
validators through `engine/commit-check.js` before a commit exists, and `reverse-lookup` invokes `engine/reverse-staged.js`
over your staged diff, so the knowledge governing the files you touched
surfaces without anyone remembering to ask. Each is a thin wrapper — it invokes
one engine command and exits with its code, unchanged — and neither reads a
bypass variable, because a hook with an off switch enforces nothing.

The gate reports each check by name. It exits 0 only when both checks pass;
findings exit 1, and a failed or never-run check exits 2 even if the other check
is clean or has findings. Both checks always run over the whole store (D-000012).
Reverse lookup is advisory attribution; its results never restrict validation
or prove that the agent updated the store. It reads NUL-delimited Git records
and includes additions, modifications, type changes, deletions and both paths
of detected copies and renames. Detection uses 50% similarity and a fixed
1000-candidate exhaustive-search limit; above it, Git may report additions and
deletions instead of a rename/copy relationship. Local Git limits cannot
change these settings. Each complete path is passed to the resolver
with `--path=value`, preserving spaces, commas, quotes, tabs and newlines.

Attribution prints a `staged attribution: candidate <tree-id>` section followed
by resolver JSON, then a `before <tree-id>` section for HEAD when it exists.
Both sections use the same complete path set; each reports only that snapshot's
own pointers. A staged pointer repair therefore cannot erase the old path's
previous governance. Before evidence is historical navigation, not a current
trust verdict. An empty staged diff produces no output and exits 0, including
an unborn repository with nothing staged. Git, resolver and snapshot failures
exit 2; attribution may be incomplete and must not be treated as a clean lookup.
These lexical checks detect store and vocabulary drift. Application behavior
remains the application's test suite's responsibility.

The gate validates an isolated copy of the Git index. Source, stores and
repo-relative rules come from the same candidate, so unstaged repairs cannot
hide broken staged bytes and unstaged edits cannot introduce findings. It
never stashes, resets or restages local work. Installed engine code, schemas
and runtime dependencies stay on the host; untracked evidence is never copied
into the candidate. Snapshot preparation and cleanup failures block with exit 2.
Real installed-hook tests check partial staging, committed bytes and cleanup.

Git submodules, symlinks that escape the snapshot, and non-UTF-8 path names
or symlink targets are refused explicitly when their evidence cannot be represented faithfully. It reads raw blobs without
checkout filters or archive attributes. Install required runtime dependencies
before committing; keep whole-store checks on the actual merge candidate in CI.

They **seed but do not install**: `init` never writes `.git/`, so wiring them is
your act, not the kit's. Git runs a hook only if it is executable, and the copy
engine seeds bytes rather than modes — so set the bit when you wire it:

```sh
chmod +x unknown-knowledge/hooks/*
ln -s ../../unknown-knowledge/hooks/pre-commit .git/hooks/pre-commit
ln -s ../../unknown-knowledge/hooks/reverse-lookup .git/hooks/prepare-commit-msg
```

Note the second symlink's name. Git runs a hook only if its filename is one of
the events git fires, and `reverse-lookup` is not one of them —
`prepare-commit-msg` runs after the index is staged and before the message
editor opens, which is when attribution is still actionable. (Git passes that
hook the message file and source as arguments; the script ignores them and
reads the staged diff itself.) The same rule bites harder under
`core.hooksPath` pointed at the seeded directory: git looks there for
event-named files only, so `reverse-lookup` would sit beside `pre-commit` and
never fire. Under that wiring, call it explicitly from your `pre-commit`.

## Seeded once, then owned

After `init`, the seeded directory has no relationship to this kit (D-000001).
There is no update channel and there never will be one. You own the engine, you
can read it, and you can change it — it is JavaScript, not a binary.

The seed stamps the kit version into `unknown-knowledge/kit.manifest.yaml`. That
stamp is a **birth certificate, not a dependency pin**: it records the schema
revision, extractor-kind set and fixture vintage the seed was born with. It
never implies an update channel — upgrading an existing seed is deferred by
design.

## Versioning

Semver, with kit-specific semantics (D-000021): **MAJOR** is a store
schema-version bump or a breaking change to the engine CLI contract (commands,
flags, exit codes, output consumed by wrappers); **MINOR** is new extractor
kinds, new engine surfaces, or a new fixture vintage; **PATCH** is fixes and
documentation. Changes are tracked in [CHANGELOG.md](CHANGELOG.md) (Keep a
Changelog form).

## Reading further

- [CONTEXT.md](CONTEXT.md) — the domain glossary. Start here.
- [decisions/](decisions/) — the kit records its own decisions, in the same
  format it asks you to use. It eats its own cooking.
- [Decision and documentation coverage](docs/change-completeness.md) — links
  implementation rationale, current contracts and remaining acceptance work.
- [Required Subject lifecycle scope](docs/agents/subject-lifecycle-required-scope.md) —
  distinguishes specification requirements, implementation limits and the
  explicitly corrected active-canonical suppression interpretation.
- [Subject metadata publication](docs/agents/ucs-1240-subject-metadata-publication.md) —
  reviewed rename, clarification, parent and related-subject changes with stable
  identities, unchanged assignments and actual query-impact checks.
- [Subject creation publication](docs/agents/ucs-1240-subject-creation.md) —
  reviewed fresh activation or proposal promotion with permanent allocation;
  broader subjects receive new IDs while original subjects remain unchanged.
- [Subject proposal suppression](docs/agents/ucs-1240-subject-proposal-suppression-publication.md) —
  reviewed rejection preserves the proposal's meaning and refusal reason while
  leaving canonical subjects, stored records and query memberships unchanged.
- [Retrieval-quality targets](acceptance/retrieval/QUALITY-TARGETS.md) —
  prospective correctness and paired quality criteria for final evaluation;
  these are targets, not measured performance or release qualification.
- [Held-out retrieval results](acceptance/retrieval/HELDOUT-RESULTS.md) —
  all 36 sessions are retained and reviewed; current source-supported task
  completion is lower, with accepted observed critical-error and witness checks.
- [Implementation and evaluation review](acceptance/retrieval/FINAL-RESULTS.md) —
  capabilities, reconciled tests, critical-error and witness checks, adverse
  agent results and the limits of supported performance.
- [Measured query performance](acceptance/retrieval/PERFORMANCE-6605402.md) —
  both named CLI workloads and the joint loaded query meet their targets;
  the near-byte loaded query refuses at its work limit, and context measurements
  cover the recorded partial result. Broader qualification remains open.
- [Measured retrieval pages](acceptance/retrieval/PRIVATE-FILE-RESULTS-V2.md) —
  four fixed-fixture API/CLI checks returned ten records per K/O/D store with
  complete source-verified explanations; broader acceptance remains open.
- [Equivalent-merge publication](docs/agents/ucs-1240-final-equivalent-merge.md) —
  the internal library contract for retained review, fresh validation and an
  atomic candidate-ref update; this is separate from merging or activating it.
  The [zero-use profile](docs/agents/ucs-1240-equivalent-merge-zero.md) proves
  registry-only preservation without creating an empty assignment event.
  [Repeated merges](docs/agents/ucs-1240-repeated-equivalent-merge.md) preserve
  earlier redirects while verifying the extended chain and its assignment history.
- [Lifecycle material continuation](docs/agents/lifecycle-material-continuation.md) —
  retained reconsideration evidence through retirement, merge, split and
  [K/O/D promotion](docs/agents/ucs-1241-typed-promotion-material.md), including
  fresh publication checks and explicit behavior without Subject authority.
- [Plain Subject retirement gate](docs/agents/ucs-1235-plain-retirement-dto.md) —
  committed withdrawal or zero-use validation, preserved history and mandatory
  retrieval impacts, with a separate [retained publication profile](docs/agents/ucs-1240-final-retirement.md)
  and [retained-material continuation](docs/agents/lifecycle-material-continuation.md)
  that verifies fresh evidence before the candidate-ref transaction.
- [Single-Subject allocation](docs/agents/ucs-1235-subject-creation-allocation.md) —
  exact native verification of one fresh Subject and the complete candidate ledger;
  this internal primitive does not perform governance or publish a candidate.
- [Suppressed Subject reconsideration](docs/agents/ucs-1235-subject-reconsideration-creation.md) —
  retain the original refusal, verify captured review evidence and create one fresh
  Subject. The [retrieval consumers](docs/agents/ucs-1237-reconsideration-consumers.md)
  carry its retained evidence through queries, intent plans and route/context views.
  The [actual-Git owner](docs/agents/ucs-1235-reconsideration-git-core.md) verifies
  committed evidence and preserves all stored record assignments. The
  [prepared impact gate](docs/agents/ucs-1235-reconsideration-gate.md) adds mandatory
  reach, whole-registry trees and finite replay checks. The separate retained
  execution/review/publication profile requires fresh proof before applying the
  reviewed candidate.
- [Prepared Subject split gate](docs/agents/ucs-1235-subject-split-gate.md) —
  actual fresh allocation, complete reviewed mappings, typed assignment preservation,
  eventless two-path proof and mandatory retrieval impacts. The [design](docs/agents/ucs-1235-subject-split-design.md)
  records the supported graph profile and verification boundaries.
- [Prepared split transport](docs/agents/ucs-1240-prepared-split-transport.md) —
  original-input/report consistency and bounded raw candidate registry, identity
  and assignment evidence. The [fixed workers and fresh final gate](docs/agents/ucs-1240-prepared-split-validation.md)
  retain that evidence and require actual rerun equality. The [review and publication profile](docs/agents/ucs-1240-split-review-publication.md)
  independently verifies actual Git authorities and allocation, then requires
  fresh owner checks before the existing candidate-ref transaction.
- [Decisions-only promotion publication](docs/agents/ucs-1240-final-promotion.md) —
  the internal library profile for reviewed proposal-to-canonical creation,
  with exact evidence and explicit limits on supported record types and history.
- [Knowledge/Ontology promotion planning](docs/agents/ucs-1234-typed-promotion-planner.md) —
  the internal byte-planning contract for permanent IDs and fixed lifecycle
  transitions; plans still require separate typed validation and publication.
- [K/O/D promotion gate](docs/agents/ucs-1241-typed-promotion-design.md) —
  the internal read-only proof of canonical creation, classification, preflight
  and retrieval impacts, with explicit per-kind preflight applicability.
- [Staged and prepared assignment gates](docs/agents/ucs-1241-prepared-assignment-gate.md) —
  actual snapshot, history and preservation checks; cleanup failure clears
  overall success even after the domain checks finish.
  The [evidence-continuation contract](docs/agents/ucs-1241-assignment-continuation.md)
  carries retained assessment/material evidence through ordinary assignments,
  fixed workers and fresh review/publication checks. The
  [typed K/O/D publication profile](docs/agents/ucs-1241-typed-assignment-publication.md)
  binds the original mixed-record selection and requires fixed all-store replay
  checks while preserving each store's evidence and lifecycle rules.
- [Reconsideration publication](docs/agents/ucs-1240-reconsideration-publication.md) —
  fixed retained workers, independent actual-Git review and fresh proof before
  candidate-ref publication; assignments remain unchanged and no empty event is created.
- [K/O/D promotion publication](docs/agents/ucs-1240-final-record-promotion.md) —
  the distinct internal K/O/D profile for exact retained evidence, fresh
  subject-impact checks, reviewed runtime and atomic candidate-ref publication.
- [Finite migration publication](docs/agents/ucs-1240-final-migration.md) —
  retained retrieval, generated-view, operational-log and Phoenix edition
  evidence for supported pre-Subject sources, including Decisions-only and
  optional stores. [Source profiles](docs/agents/ucs-1240-migration-source-profiles.md)
  distinguish absent, empty and malformed stores and document broader limits.
- [Seeded-installation cutover](docs/agents/ucs-1240-installation-cutover.md) —
  exact committed runtime/consumer conversion and separately observed local
  activation for the supported nested installation; external processes and
  future state require their own operational verification.
- [docs/publishing.md](docs/publishing.md) — release and supply-chain process
  (npm provenance, 2FA).

## License and contributing

Licensed under [Apache-2.0](LICENSE) (D-000020); redistribution carries the
[NOTICE](NOTICE) file. Contributions are welcome — especially new extractor
kinds, and field reports of anchors the extractors could not read. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the gate (parser + fixture + demo run,
D-000005) and PR expectations.

Every PR includes a package version increment, changelog notes, decision
traceability and updates to affected documentation and agent instructions.
Unreleased versions in the repository are not necessarily available on npm;
see [publishing](docs/publishing.md) for the separate release process.
