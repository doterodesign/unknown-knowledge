> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Subject views

Recorded [view/navigation rationale](../../decisions/entries/subject-views-and-contexts.yaml) remains a
proposal; implemented behavior does not imply canonical Decision approval.

`subject-view.js` consumes the actual `loadStores()` identity and Subject registry
capture. It renders declared lifecycle and semantic parent paths; it does not
evaluate approval or certify a subject as eligible for querying or assignment.
The registry remains authority. Files under `subjects/derived/` are disposable.

The [shared interface](../../payload/protocol/engine-interface.md) exposes a
read-only `subject.tree` preview (MCP `subject_tree`) using this same artifact
factory. Input is `{budget:{nodes,edges,rows},maxBytes}` and output is the native
`{status,metadata,artifacts}` result, including complete generated text. It does
not compare or change saved files: a successful preview is not a successful
`--check`. Incomplete generation returns metadata with no artifacts and remains
non-success through shared CLI/MCP. The explicit tree text limit and transport
response limits are separate. Existing check/write/delete behavior below is
unchanged.

```sh
node payload/engine/subject-view.js --root /path/to/repo --write \
  --max-nodes 20 --max-edges 20 --max-rows 10 --max-bytes 10000
```

These numbers are small fixture limits, not supported production thresholds.
Check/write require explicit nonnegative safe integer limits. Nodes and edges
are shared across ancestor traversals; rows limit the projection; bytes limit
`tree.md` including its fingerprint banner, not `metadata.json`. Incomplete
projection or rendering publishes no artifacts and preserves existing files.

- `--check` is the default. It computes fresh artifacts and reports missing,
  stale or unexpected generated files. It never trusts stored metadata.
- `--write` replaces only `subjects/derived/` after complete projection.
- `--delete` removes only that derived directory. Numeric limits are optional
  for deletion. The real installation and registry must still load successfully.
- `--json` emits metadata, loader diagnostics, artifact paths and findings.

Exit 0 means the requested operation completed cleanly. Exit 1 means a completed
comparison found artifact drift. Exit 2 means invalid arguments, unavailable or
invalid authority, incomplete budgets, or engine/filesystem failure. An I/O
failure during replacement can leave incomplete artifacts; regeneration is the
repair. Symlinks and special nodes in the derived tree refuse before file access
or replacement. Deleting generated files does not change the registry or ledger.

`metadata.json` binds the full captured registry document, generator/schema/
normalizer versions, revisions and requested limits. It claims `registry-only`
and `captured-model` consistency, not an atomic filesystem snapshot. No clock
or freshness verdict is used by this structural view.

`executeIntersectionRoute(context, route, queryOptions, {collect})` in
`lib/subject-routes.js` composes an explicit version-1 intersection route with
the real `querySubjects()` evaluator. Query options must omit `where`; the route
provides it. Bare label paths and semantic parent paths cannot masquerade as
intersection routes. Counts use the evaluator's full bounded universe, not its
result page. Refusal, incomplete evaluation, provisional possible counts and
distinct canonical/proposal identities remain intact.

Route results retain native query `outputVersion:2` and the complete query-local
`assignmentEvidence` table. Read row IDs against that table as described in the
[query contract](ucs-1237-subject-query.md#lossless-output-version-2). Counts-only
context queries emit no assignment table and use zero explanation nodes. Their
base query fingerprints use evaluator version 2. The shared `subject.route` and
`subject.contexts` API operation outputs are version 2; input versions and
structural tree artifact/generator versions are unchanged.

## Governed route and context modes

The [shared API/CLI/MCP interface](../../payload/protocol/engine-interface.md)
also exposes these owners as `subject.route` and `subject.contexts`. Its input
contains the same request below, all three wire evidence arrays and explicit
operation limits. It preserves the native CLI result envelope and requires
complete status for transport success. The specialized CLI remains available.

The default mode is `tree`. Read-only modes use the shared P4 context loader,
the actual installation identity/registry, and supplied retained evidence:

```sh
node payload/engine/subject-view.js --mode route --root /path/to/repo \
  --request route-request.json --decision-captures decision-captures.json --json
node payload/engine/subject-view.js --mode contexts --root /path/to/repo \
  --request contexts-request.json --decision-captures decision-captures.json --json
```

Each request is a closed JSON object with `version: 1`. Route requests contain
`route` (the explicit intersection object), `query` (P4 query options without
`where`), and optional `collect: "results" | "counts"`. Context requests contain
`query` (the full P4 query including `where`) and `contextBudgets` (the complete
version-1 limits documented in [context counts](ucs-1239-subject-contexts.md)).
Query budgets are always explicit; see the [query contract](ucs-1237-subject-query.md).

`--decision-captures` accepts P4's strict JSON array of
`{capture, bytesBase64, objectFormat}` rows. The shared decoder checks transport;
P2 checks actual bytes and governance. Omitting this input supplies no retained
evidence. Current authorizer files never substitute for historical bytes.

Both query modes also accept `--assessment-captures` and `--material-captures`.
Assessment files contain original `{registry,identity}` pairs using the same
capture transport; material files contain arrays of raw capture rows. A promoted
Subject needs its assessment pair, while reconsideration also needs its cited
material. The actual query loader receives all three lists on the same operation.
The [consumer contract](ucs-1237-reconsideration-consumers.md) describes admission,
reuse and missing-evidence behavior. Tree mode rejects all query evidence flags;
it does not acquire governance authority from a capture file.

Query modes reject tree mutation/check flags and generation limits before any
file or model I/O. Tree mode rejects query input flags. Request paths resolve
from the current directory, independently of `--root`. Positional arguments are
unsupported.

JSON output is `{mode, result, contextDiagnostics}`; `result` is the unchanged
domain response. Loader failure instead returns `{mode, status: "refused",
diagnostics}` with no fabricated result. Input/transport failures print the
actual refusal to stderr. Complete domain execution exits 0; refused or
incomplete execution exits 2. Exit 1 remains exclusive to tree artifact drift.
Missing assignment metadata can make context enumeration incomplete even when
known-candidate counts are exact.

Both modes reread actual authority and reevaluate supplied captures on each
invocation. Root and nested installation tests demonstrate identical identities,
registry/history, route results, context counts and fingerprints before tree
generation, after generation, and after deletion and fresh loading.


## Optional route/context host allowance

Route and contexts modes accept `--operation-limits-json <inlineJSON>` using the
closed version-1 policy in the [query contract](ucs-1237-subject-query.md). One
operation admits actual request/Decision transport file reads, parsed documents,
predecode capture bytes, the real context loader, and all query/count phases.
`executeIntersectionRoute(..., {collect, operation})` checks the original context
binding and guards route/query documents before compiling even an invalid route.
Context enumeration details and exclusions are documented in
[context counts](ucs-1239-subject-contexts.md#optional-shared-operation-admission).

Successful domain output and fingerprints retain their existing shape. Complete
UTF-8 output, including its final newline, must fit before any bytes are written.
Post-admission host failures exit 2 with the same bounded version-1 `host-failed`
receipt as query-subjects: anticipated admission/usage refusals have a typed code;
programming bugs retain a distinct `internal-error` name/message/stack. API
`main(argv)` callers receive the original exception; only the executable opts
into receipts. If no valid allowance exists or a whole receipt cannot fit, the
executable exits 2 silently, with no unbounded stderr fallback. Domain partial
results still retain their usual `incomplete` status when the host remains active.

Tree mode rejects this flag before reads or mutations and keeps its existing
explicit projection/render limits. It does not load the operation or Boolean
query modules. No retained assessment transport is added by this adapter.
Native parser/hash/serialization allocation, directory enumeration and runtime
module/dependency loading retain P4's exclusions. These are forwarding and
boundary tests, not production resource measurements or profile qualification.


The [operation-adapter rationale](../../decisions/entries/subject-view-operation-admission.yaml)
records this boundary as a proposal. The executable uses shared bounded `boot`;
its command dynamically imports `reportSubjectOperationFailure` from
`subject-operation-cli.js`. Usage and programming-error classification belong
to that shared reporter. See the [documentation coverage audit](ucs-1239-decisions-and-docs.md)
for related records, unchanged surfaces and integration-owner follow-ups.
