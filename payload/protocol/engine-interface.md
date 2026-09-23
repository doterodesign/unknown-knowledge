# Shared engine API, terminal and MCP

The agent interprets the request, proposes a plan, chooses explicit capacities,
calls deterministic operations and reads the original sources. The engine
validates and executes that plan. Neither an MCP connection nor a returned
report makes the agent's interpretation correct or supplies human approval.

## Operations available now

All operations are read-only. Interface and input versions are 1. Output versions
are per operation: `subject.query`, `subject.route`, `subject.contexts`,
`intent.validateQueries` and `intent.executeQueries` return version 2; the other
listed operations return version 1. Read discovery and the response's
`outputVersion` rather than assuming one version for all operations. The MCP
tool arguments are the API operation's `input` object; the MCP server supplies
the version and its fixed repository root. Every operation can also be called
through the request-file CLI.

| API operation | MCP tool | Required input; optional fields in parentheses |
| --- | --- | --- |
| `engine.capabilities` | `engine_capabilities` | `{}` |
| `subject.lookup` | `subject_lookup` | `text`, (`options`: `locale`, `context`) |
| `subject.tree` | `subject_tree` | `budget`: `nodes`, `edges`, `rows`; `maxBytes` |
| `subject.query` | `subject_query` | `query`, `collect`, `evidence`, `operationLimits` |
| `subject.route` | `subject_route` | `request`, `evidence`, `operationLimits` |
| `subject.contexts` | `subject_contexts` | `request`, `evidence`, `operationLimits` |
| `record.preflight` | `record_preflight` | `concepts`, `leaves`, `today` |
| `intent.validate` | `intent_validate` | `plan` |
| `intent.inspectBindings` | `intent_inspectBindings` | `plan`, (`lookupRequests`) |
| `intent.validateQueries` | `intent_validateQueries` | `plan`, `admission`, `evidence`, `operationLimits` |
| `intent.executeQueries` | `intent_executeQueries` | `plan`, `admission`, `executionAdmission`, `evidence`, `operationLimits` |

Extra outer fields and operation input fields refuse. Capabilities list actual
registered handlers; authority availability is evaluated when an operation
reads the selected installation. Lookup returns every matching label/alias
with IDs, definitions, status and captured registry attribution. Lookup does
not establish governed assignment or query eligibility.

`subject.tree` returns a read-only preview from the same native derivation used
by the specialized Subject tree CLI: `{status, metadata, artifacts}`. Supply
explicit nonnegative safe-integer `budget.nodes`, `budget.edges`, `budget.rows`
and `maxBytes`. The preview includes every declared lifecycle state and proposal
within those limits; it does not evaluate approval or query eligibility.
Complete previews contain the generated `subjects/derived/tree.md` and
`subjects/derived/metadata.json` paths and text. Incomplete projection or rendering
returns metadata with completion, coverage and diagnostics, and `artifacts: []`.
A valid empty registry produces a complete empty tree; absent or invalid
authority refuses rather than returning that result.

The operation never writes, deletes or checks saved artifacts. Its complete
preview can coexist with stale generated files. Use the specialized
`subject-view.js --check` for drift, and its explicit `--write` or `--delete`
for filesystem changes; those verbs are not MCP tools. Registry fingerprints
describe captured parsed input, not atomic snapshots or source approval.
The tree's `maxBytes` bounds `tree.md` including its fingerprint banner, not
metadata or the API envelope. Request-CLI and MCP output capacities apply
separately to their full serialized responses. Structural preview does not
claim governed Subject operation accounting.

`record.preflight` performs the existing Ontology/Knowledge preflight on a fresh
load. Supply `concepts` and `leaves` as arrays of individual record IDs; whitespace
is trimmed and duplicates removed. Supply `today` as a real `YYYY-MM-DD` calendar
date or explicit `null`. With null, time-dependent Knowledge checks report that
freshness was skipped. Both empty arrays request store health only, which does
not establish any individual record's trust. Decisions verdicts are outside this
operation's scope.

Read the native `ok`, each verdict and its `next-action`, including degraded
store errors, unknown, stale and quarantined results. A missing selected ID can
cause a native refusal with no report; an existing unverified proposal instead
receives its native unknown verdict. This operation never enables logging. It
does not replace the agent's required source review or the client's conduct
rules. It uses the existing preflight owner's costs, not Subject operation
accounting; transport capacities still bound serialized input/output.

`collect` is `results` or `counts`. Use the native subject query and intent
formats in [intent retrieval](intent-retrieval.md), including their explicit
query budgets, branch admission, applicability and evidence obligations.
An assigned predicate uses `{"op":"assigned","subject":"S-000003"}`:
`subject` is a canonical ID string scoped to the loaded installation, while an
intent binding's `target` is a qualified object. Keep those shapes distinct.
`lookupRequests` is an object keyed by the plan binding's `sourceRef`, with
each value containing `text`, `options` and `expected` captured registry
metadata as described there. It is not a list of labels.

Route `request` has `version: 1`, `route`, `query` and optional `collect`
(default `results`). The route is `{version: 1, kind: "intersection", subjects:
["S-000001", "S-000002"]}`. Supply ordinary query options and budgets without
`where`; the route supplies the conjunction. Reversing display order preserves
matching record IDs. Semantic parent paths cannot substitute for intersections.

Context `request` has `version: 1`, a full `query` and `contextBudgets`. The latter
has `version: 1` and explicit nonnegative safe integer `maxRecords`,
`maxAssignments`, `maxHierarchyNodes`, `maxHierarchyEdges`, `maxRedirects` and
`maxContexts`. It counts one additional subject at a time while preserving the
base query's scope. Candidates come from the selected assignment universe;
zero counts remain visible. Rows use subject-ID order, not a top-context ranking.
Read enumeration and count completeness separately: missing classifications
leave the candidate universe incomplete. Co-assignment is not evidence of a
joint source claim or a new parent relation.

`evidence` has exactly three arrays: `decisionCaptures`, `assessmentCaptures`,
`materialCaptures`. Supply empty arrays when evidence is unavailable; the
engine will preserve that uncertainty. Decision and material rows contain
exactly `capture`, `bytesBase64`, `objectFormat`. Assessment rows contain
`registry` and `identity`, each in that same capture format. Bytes use canonical
base64, and `objectFormat` is `sha1` or `sha256`. A locator is not the bytes;
current files do not substitute for historical retained evidence. The owning
governance checks verify content, references and applicability. Do not invent
approval flags or copy internal model/operation handles into these inputs.

## Calling the API and terminal

Import `invoke` from the installed `engine/api/index.js` (the kit repository
uses `payload/engine/api/index.js`):

```js
const result = await invoke({
  interfaceVersion: 1,
  operation: 'subject.lookup',
  inputVersion: 1,
  root: '/absolute/path/to/repository',
  input: { text: 'color' }
});
```

Store that request object as JSON to call the identical API from bash:

```sh
unknown-knowledge-engine --request request.json \
  --max-request-bytes 1048576 --max-output-bytes 1048576
```

The installed equivalent is `node unknown-knowledge/engine/invoke.js` with
the same arguments. Existing specialized CLI flags and output formats remain
available. These byte numbers are example host capacities, not qualified
production defaults. The request-file CLI requires explicit capacities and
rejects an oversized request before parsing or an oversized result before
writing it to stdout.

## Connecting an MCP client

Configure a local stdio server in a compatible MCP host:

```json
{
  "command": "unknown-knowledge-mcp",
  "args": [
    "--root", "/absolute/path/to/repository",
    "--max-message-bytes", "1048576",
    "--max-result-bytes", "1048576"
  ]
}
```

Install the npm package to make the executable available, or run
`node /absolute/path/to/package/cli/mcp.js` with those arguments. The npm
adapter uses its packaged engine version to read the chosen repository; it
does not import executable code from that repository. Pin the npm version
appropriate for the repository's format. The seeded engine has no dependency
on the MCP SDK and remains independently owned after initialization.

This is a local stdio integration usable outside an IDE. It does not provide
a remote HTTP service or an embedded model. The client hosts the agent.
The official SDK handles protocol transport. Diagnostics use stderr, leaving
stdout for MCP messages. The repository root cannot be overridden by a tool.

MCP resource discovery exposes two fixed, read-only guides:
`unknown-knowledge://protocol/engine-interface` and
`unknown-knowledge://protocol/intent-retrieval`. They contain the shipped
package documentation, not repository evidence or approval. A client can list
and read these resources without IDE/file access. Other URIs do not provide
arbitrary filesystem access.

## Results and capacities

The API envelope has `interfaceVersion`, `operation`, `outputVersion`,
`status`, `diagnostics` and, when the native owner returned, `data`.

- `completed`: a native report was returned. Read its own outcome; this is
  **not** a claim of complete retrieval, eligibility, source support or approval.
- `refused`: admission/loading or an expected engine condition prevented a
  report. Diagnostics preserve the owning refusal.
- `failed`: an expected system I/O failure prevented a report. Unexpected
  implementation exceptions reject the API promise rather than masquerade
  as ordinary query results.

`subject.query` retains native complete/incomplete/refused status, counts,
coverage, explanations and diagnostics. Intent inspection/query modes retain
the existing specialized CLI envelopes (`mode`, `result`, context diagnostics).
Strict, alternative and recovery branches remain separate. Source review
obligations persist after successful query execution.

Native query execution output version 2 stores complete assignment outcomes in
`assignmentEvidence:{namespace,kind:'subject',purpose:'query',policy,outcomes}`.
Each row's ordered `assignments.ids` references outcomes by original Subject ID;
the table is scoped to that query/branch and captured namespace/policy. It retains
all Subject metadata, redirects and warrant pointers. Reconstruct an old inline
assignment element at offset `i` as `{originalId:id,index:i,path:'subjects['+i+']',
outcome:assignmentEvidence.outcomes[id]}`. Unknown versus known-empty assignments
stay distinct. Rows retain all other witnesses and source pointers. Missing or
incompatible table references are malformed output, never empty evidence.

Tables contain only evidence for admitted rows and are omitted for counts-only
results or when no admitted row has assignments. The explanation-node counter
charges each local bundle plus the shared table once; all real validation work
and output-byte limits remain. `input.versions.evaluator:2` changes fingerprints
in validation and execution. Full explanations do not cancel page truncation.
Do not expand inline outcomes before delivery and still claim compact byte costs.
MCP's result bound includes both its text and structuredContent copies.

Route/context operations likewise retain `{mode, result, contextDiagnostics}`;
their native `result.status` must be `complete` for CLI exit 0 or MCP success.
All count phases share the invocation's authentic operation allowance, alongside
the existing per-query and enumeration limits.

Tree preview retains the native result directly in `data`; only
`data.status: complete` counts as CLI exit 0 or MCP success. An incomplete
native preview remains available under an outer `completed` envelope, with
CLI exit 2 and MCP `isError: true`.

The request CLI exits 0 for native query completion, valid intent structure or
preflight `data.ok: true`;
otherwise it exits 2. It never uses findings exit 1. MCP returns the same
envelope in `structuredContent` and as JSON text, with `isError` true for the
corresponding non-success result. Partial reports remain available for
inspection. Protocol validation errors have SDK error responses instead.
The specialized `preflight.js` retains its existing 0/1/2 exit meanings; the
shared interface maps its findings to exit 2 while preserving the native report.

Governed calls require all version-1 `operationLimits` fields:

- `version: 1`, `maxSourceBytes`, `maxSingleCaptureBytes`, `maxOutputBytes`;
- `validation`: `maxCaptureBytes`, `maxDocumentNodes`, `maxDocumentTextUnits`,
  `maxSubjects`, `maxHistoryRows`, `maxValidationSteps`;
- `corpus`: `maxCanonicalRecords`, `maxAuthoredRecords`, `maxSubjects`,
  `maxHierarchyDepth`, `maxHistoryEvents`, `maxHistoryRows`,
  `maxAssignmentsPerRecord`, `maxAssignments`, `maxBodyBytesPerRecord`.

All capacities are explicit nonnegative safe integers. Each invocation owns
one allowance and one loaded context; it cannot reset its allowance between
validation and execution. Query AST/evaluation budgets remain separately
explicit inside the query.

**Output scope:** `invoke` returns an object and does not charge the existing
operation policy's `maxOutputBytes`. The request CLI separately bounds the
serialized envelope plus newline. MCP separately bounds the complete tool
result payload, including both text and structured copies, or the complete
documentation-resource payload; protocol framing, discovery metadata and SDK
error responses are outside that result cap. Its input cap is the
SDK stdio buffer capacity. These caps are not process-memory guarantees:
serialization occurs before output admission. Lookup and structural/metadata
inspection do not claim governed operation accounting. No capacity profile or
retrieval-quality qualification is implied by these interfaces.

Creation, assignment publication, subject lifecycle mutations, derived-tree writes
and all remaining engine operations are not registered in this interface yet.
Their internal libraries or specialized CLIs are not silently advertised as
MCP tools. This operation set is a delivery increment, not full P1–P11 completion.
