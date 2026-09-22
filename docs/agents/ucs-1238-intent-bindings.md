> Packaging stage 2/7, version `3.0.0-rc.3`. This stacked prerelease is for review and new-installation development. The existing-store migration/cutover workflow arrives in PR4; do not migrate existing installations with this intermediate tree.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# UCS-1238 — captured binding inspection

Decision rationale and documentation coverage are indexed in
[P5 decisions and documentation](ucs-1238-decisions-and-docs.md).

`inspectIntentBindings(plan, context)` in `payload/engine/lib/intent-bindings.js`
composes the structural intent-plan validator with actual record identity and
subject lookup functions. It performs no I/O and does not change the version 1
plan format. The `intent-plan.js` CLI does not automatically run this binding
inspection, including when its explicit query-validation mode is selected.

The result declares `inspectionScope: captured-navigation-only`,
`queryValidation: not-run`, and `governanceValidation: not-run`. Its
`planValidation` is the original structural result, including unresolved intent
and the complete evidence handoff. Structurally invalid plans yield no binding
inspection rows.

## Explicit installed CLI mode

```sh
node unknown-knowledge/engine/intent-plan.js plan.json --inspect-bindings \
  --root . --lookup-requests lookup-requests.json --json
```

Use `payload/engine/` in the kit repository. This mode requires an explicit
repository root and is mutually exclusive with query validation/execution.
`--lookup-requests` is optional and contains the keyed object described below;
missing requests remain unavailable. Query admission and Decision/assessment
capture flags are not accepted here. The actual store loader supplies the
identity index and optional subject document; record inspection does not
require a subject registry or historical governance evidence.

JSON is `{mode:'inspect-bindings',result,contextDiagnostics}` with the unchanged
domain inspection and actual loader diagnostics. Expected loading refusal uses
`result:null` and `diagnostics`. Exit 0 means inspection completed, including
unsupported, inference, stale and unavailable row outcomes; read those outcomes
before using a binding claim. Invalid plans, context failure, usage errors and
bugs exit 2. No result is aggregate binding approval or source proof. The
execution mode continues to report `bindingValidation:not-run`; it does not
implicitly consume this inspection or authenticate an earlier lookup.

The `subject.js lookup` response supplies exact values for the request's
`expected` object: `context.namespace` → `namespace`, `registryRevision` →
`revision`, `normalizer` → `normalizerVersion`, and `registryDigest` →
`documentSha256`. Retain the actual lookup text/options and its sourceRef;
do not guess missing capture metadata.

## Context

The caller supplies these optional inputs; missing inputs remain unavailable:

- `subjectDocument`: the full captured JSON document accepted by P2
  `indexSubjects`, including governance fields. This is detached, hashed with
  P6 `canonicalSha256`, then reindexed. Caller-owned derived Maps are not used.
- `identityIndex`: the opaque P1 `buildIdentityIndex` handle, whose private
  captured records support `resolveRecord`. No alternate target parser or
  record title lookup is introduced.
- `lookupRequests`: an object keyed by the binding's original `sourceRef`.
  Each value has exactly `text`, `options`, and `expected`. `options` are the
  actual P2 lookup options (`locale` and/or `context`, or an empty object).
  `expected` has exactly `namespace`, `revision`, `normalizerVersion`, and
  `documentSha256`. The digest is lowercase SHA-256 of the complete semantic
  JSON document, with sorted object keys and authored array order.

For example, the host can create a lookup request from its captured document:

```js
const context = {
  subjectDocument: registry.document,
  lookupRequests: {
    'lookup:color': {
      text: 'hue',
      options: { locale: 'en' },
      expected: {
        namespace: registry.namespace,
        revision: registry.revision,
        normalizerVersion: registry.normalizerVersion,
        documentSha256: canonicalSha256(registry.document),
      },
    },
  },
};
const inspection = inspectIntentBindings(plan, context);
```

The source reference and expectations are supplied claims. Matching them
establishes a rerun against this captured context, not authentication of an
earlier lookup, original source-file bytes, a live snapshot, or human approval.
The caller's context remains transient and subject to the same privacy handling
as the plan; neither is automatically persisted.

## Binding rows

Each row retains `key`, `sourceRef`, the entire supplied `claim`, `target`,
`lookup`, and `basisCheck`. Output is detached from all caller inputs.

Targets use exact `{namespace,kind,id}` references. Subject inspection uses the
shared canonical/proposal parsers and reports captured presence (`loaded` or
`missing`), preserving declared status and metadata. This does not resolve
lifecycle redirects or certify eligibility. Other kinds go through the actual
record resolver, retaining its loaded, declared-only, missing, retired, invalid
or ambiguous outcome. Ambiguity is never reduced to the first candidate.

A subject lookup retains the exact request text and options, expected metadata,
actual captured metadata (including hierarchy revision and document digest),
and **all** rerun candidates with qualified references and match witnesses.
Lookup status is `available`, `stale-context`, `unavailable`, or
`invalid-context`. A changed digest is stale even when the declared revision
number stays unchanged. Stale results retain rerun candidates for inspection,
but cannot support the original binding basis.

`basisCheck: supported` means the qualified selected target, exact preferred
label, and declared `label`/`alias` match kind agree with the available rerun.
Other names remain visible, including homonyms and non-active subjects.
`unsupported` reports a contradicted exact claim; `not-run` reports missing,
stale, invalid or unsupported lookup context. A declared inference always stays
`inference`, even if its text happens to match exactly in the rerun. Record
identity resolution alone never proves a label or alias lookup claim.

These checks do not establish intent completeness, query validity, subject
approval, record trust or adequate source evidence. Full effective-predicate
provenance is handled by the separate [query provenance validator](ucs-1238-intent-query-plan.md)
using P4's full query validator and its exact paths; this module contains no
AST walker or lifecycle evaluator. Real host trials
and evidence review remain separate acceptance work.
