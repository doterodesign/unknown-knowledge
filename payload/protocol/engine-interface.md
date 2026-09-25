# Shared engine API, terminal and MCP

The agent interprets the request, calls deterministic operations and reads the
original sources. The engine finds, counts and checks records. Neither an MCP
connection nor a returned report makes the agent's interpretation correct or
supplies human approval.

## Operations available now

All operations are read-only. Interface, input and output versions are 1. The
MCP tool arguments are the API operation's `input` object; the MCP server
supplies the version and its fixed repository root. Every operation can also
be called through the request-file CLI.

| API operation | MCP tool | Required input; optional fields in parentheses |
| --- | --- | --- |
| `engine.capabilities` | `engine_capabilities` | `{}` |
| `subject.lookup` | `subject_lookup` | `text`, (`options`: `locale`, `context`) |
| `record.ask` | `record_ask` | `question` for search; (`mode`: `search`, `count`, `fields`; `where`; `countBy`; `under`; `limit`; `top`) |
| `record.preflight` | `record_preflight` | `concepts`, `leaves`, `today` |

Extra outer fields and operation input fields refuse. Capabilities list actual
registered handlers. Lookup returns every matching label or alias with IDs,
definitions, status and captured registry attribution. Lookup does not
establish that a Subject is approved for any particular use.

`record.ask` is the same service as `ask.js`, and returns the same payload the
CLI prints with `--json`. Search mode ranks Knowledge, Ontology and Decision
records for `question` and returns at most `limit` (default 8, maximum 50),
with `confidence.tier` (`covered`, `partial`, `none` or `unavailable`) and the
signals behind it. `fields` mode lists the metadata fields present in a
selection with their most common values. `count` mode selects exactly by
`where` (`[{field, value}]`; Subjects match by descendant), groups by
`countBy` (`under` rolls Subjects up to that parent's children) and returns up
to `top` groups (default 10, maximum 100) with `missing` and `tieAtCut`. An
unknown field refuses with `unknown-field`. The long-running MCP server keeps
one index per root in memory and drops it on any change under the kit root, so
repeat calls skip reloading the stores. The tier reports whether the right
records were found, not whether they answer the question.

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
rules.

## Calling the API and terminal

Import `invoke` from the installed `engine/api/index.js` (the kit repository
uses `payload/engine/api/index.js`):

```js
const result = await invoke({
  interfaceVersion: 1,
  operation: 'record.ask',
  inputVersion: 1,
  root: '/absolute/path/to/repository',
  input: { question: 'how do we export colors?' }
});
```

Store that request object as JSON to call the identical API from bash:

```sh
unknown-knowledge-engine --request request.json \
  --max-request-bytes 1048576 --max-output-bytes 1048576
```

The installed equivalent is `node unknown-knowledge/engine/invoke.js` with
the same arguments. The specialized CLIs (`ask.js`, `subject.js lookup`,
`preflight.js`) remain available. These byte numbers are example host
capacities, not production defaults. The request-file CLI requires explicit
capacities and rejects an oversized request before parsing or an oversized
result before writing it to stdout.

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
`unknown-knowledge://protocol/agents` (the runtime loop: `record_ask` first,
then preflight and source review) and
`unknown-knowledge://protocol/engine-interface` (this guide). They contain the
shipped package documentation, not repository evidence or approval. Other URIs
do not provide arbitrary filesystem access.

## Results and capacities

The API envelope has `interfaceVersion`, `operation`, `outputVersion`,
`status`, `diagnostics` and, when the native owner returned, `data`.

- `completed`: a native report was returned. Read its own outcome; this is
  **not** a claim of complete retrieval, source support or approval.
- `refused`: admission, loading or an expected engine condition prevented a
  report. Diagnostics preserve the owning refusal.
- `failed`: an expected system I/O failure prevented a report. Unexpected
  implementation exceptions reject the API promise rather than masquerade
  as ordinary results.

The request CLI exits 0 when the native report succeeded: preflight
`data.ok: true`, or `record.ask` over stores that loaded cleanly. Otherwise it
exits 2. It never uses findings exit 1. MCP returns the same envelope in
`structuredContent` and as JSON text, with `isError` true for the corresponding
non-success result; the report remains available for inspection. Protocol
validation errors have SDK error responses instead. The specialized
`preflight.js` retains its existing 0/1/2 exit meanings; the shared interface
maps its findings to exit 2 while preserving the native report.

**Output scope:** `invoke` returns an object. The request CLI bounds the
serialized envelope plus newline. MCP bounds the complete tool result payload,
including both text and structured copies, or the complete
documentation-resource payload; protocol framing, discovery metadata and SDK
error responses are outside that result cap. Its input cap is the SDK stdio
buffer capacity. These caps are not process-memory guarantees: serialization
occurs before output admission.

Record creation, Subject changes and every other write stay outside this
interface. Stores change through ordinary commits reviewed as code (D-000010).
