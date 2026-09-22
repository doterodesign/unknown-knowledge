> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# UCS-1238 — declared intent inventory validation, first slice

Decision rationale and documentation coverage are indexed in
[P5 decisions and documentation](ucs-1238-decisions-and-docs.md).

This slice validates a transient host-authored plan and returns its evidence
handoff. It does not interpret natural language, execute queries, resolve target
identities, verify source claims or establish that the host noticed every
material requirement. No store, finding or evidence date is changed.

```sh
node payload/engine/intent-plan.js /path/to/plan.json --json
```

The same domain function is `validateIntentPlan(plan)` in
`payload/engine/lib/intent-plan.js`. In default mode the CLI is a JSON file
reader and renderer around it, independent of YAML and query modules. The
separate [explicit query-validation mode](ucs-1238-intent-query-plan.md#explicit-cli-mode)
loads actual captured context; it still performs no query execution or model/
network interpretation.

## Request version 1

All fields below are required except `baseBranch`. Unknown fields are refused.
Arrays may be empty except the material inventory and each item's `unitKeys`.
Keys are unique within their section; reference arrays are unique.

| Object | Fields |
| --- | --- |
| Plan | `version: 1`, `inputRef`, `inventoryStatus: open / declared-complete`, `units`, `bindings`, `constraints`, `requirements`, `branches`, `clarifications` |
| Unit | `key`, `sourceRef`, `disposition: mapped / grammatical / unresolved` |
| Binding | `key`, `unitKeys`, `target` object, `label`, `basis: label / alias / inference`, `sourceRef` |
| Constraint | `key`, `unitKeys`, `origin: explicit / inferred`, `bindingKeys`, `queryRefs`, `requirementKeys` |
| Query reference | `branch`, `path` (JSON Pointer into that branch's query) |
| Requirement | `key`, `unitKeys`, `description` |
| Branch | `key`, `unitKeys`, `kind: strict / alternative / recovery`, `query` object, `assumptions` strings, `relaxes` constraint keys; recovery also has `baseBranch` |
| Clarification | `key`, `unitKeys`, `prompt` |

Strings must be nonblank. Source references may be opaque privacy-safe handles;
the validator does not retrieve or authenticate them. Input is acyclic JSON
data. The host owns privacy review; do not persist request text or these plans
in production findings. The CLI writes only its output streams.

Mapped intent must reach a constraint or source requirement. A candidate binding
alone cannot discharge it. Unresolved intent must reach clarification, an
alternative interpretation, or source review; its unresolved state remains in
the handoff. Grammatical units cannot also supply semantic items. Empty/missing
inventory and inventories containing only grammatical units refuse.

Constraints must route to query references or evidence requirements. References
resolve within their declared section; linked bindings and requirements must
share intent with the constraint. JSON Pointers use own properties and exact
array indexes. This is pointer validation only, not validation of AST semantics.

At most one branch is strict. Alternatives state assumptions. Recovery states
its non-recovery base, relaxed constraints and reasons/assumptions, and retains
all affected units. Every relaxed constraint must refer to the base query.
Recovery never overwrites the strict query or removes its evidence requirements.

## Outcomes and exit contract

Results always declare `validationScope: declared-inventory-only`,
`queryValidation: not-run` and `targetValidation: not-run`. `valid` only reports
the structural contract. Diagnostics are stable-sorted `{code,path,message}`.

- Invalid input: `readiness: invalid`, `handoff: null`, CLI exit 2.
- Valid open inventory: `readiness: inventory-open`, CLI exit 0.
- Valid unresolved units, clarifications or no query branch:
  `readiness: unresolved-intent`, CLI exit 0.
- Otherwise: `readiness: ready-for-query-validation`, CLI exit 0.

Readiness precedence is the order above. Valid results include a detached
handoff with every declared unit, binding, constraint, requirement, branch and
clarification. No requirement is marked satisfied. An unresolved result can be
handled by a stated alternative; it does not automatically require asking the
user another question. A structural success does not authorize source reliance.

Malformed JSON, read errors, usage errors and module failures return exit 2.
There is no exit 1, query execution or automatic persistence. JSON parse errors
do not echo fragments of request text. Human output explicitly states the same
validation limits and includes the outstanding handoff.

## Validation evidence and remaining integration

Observed behavioral red: a mapped effect unit with no remaining query/evidence
destination was accepted by the initial callable seam. After implementation,
the domain tests reject it and retain red/effect/country evidence requirements
in valid handoffs. CLI behavioral red separately observed an invalid inventory
returning exit 0; the implemented CLI returns exit 2 and no handoff.

Focused tests also cover open/empty inventory, candidate-only coverage,
unresolved alternatives, escaped and invalid pointers, relaxed intent retention,
input/output isolation, malformed references, actual CLI/domain parity and
file preservation. Existing module-load and seeded-copy checks exercise the
new shim through the repository's real discovery/allowlist seams.

This structural slice leaves target objects and nested queries opaque. The
separate [captured binding inspection](ucs-1238-intent-bindings.md) now composes
P1 identity resolution and P2 subject lookup through the explicit
`--inspect-bindings` mode, without changing the default structural mode.
The separate [query provenance validator](ucs-1238-intent-query-plan.md) now
uses actual P4 validation and its exact semantic paths to check every authored
effective predicate and selector while recording generated default provenance.
Neither dependent operation is run in this CLI's default structural mode. Namespace
and canonical ID resolution must use the shared owning modules, never a second
parser in this validator. Existing gate/source-read protocol remains unchanged.

No production size/latency guarantee or new protocol behavior is claimed.
P10 owns measured limits and actual repeated fresh-agent trials. Structural
tests do not establish Gate D, source adequacy, or improved retrieval quality.
