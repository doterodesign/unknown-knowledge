> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# P6 decision and documentation coverage

This records the rationale and documentation coverage of the delivered P6
Subject views. It adds no runtime behavior, supported capacity, approval or
public interface. The three records below are scoped proposals; authorization
to implement did not publish canonical Decisions.

| Choice | Decision and rationale | Implementation/evidence |
| --- | --- | --- |
| Declared forest, explicit intersections, one-step contexts and disposable output | [Views and contexts](../../decisions/entries/subject-views-and-contexts.yaml): preserve identity/ancestry boundaries and shared semantics; reject duplicate evaluators and eager subsets. | [Tree factory](../../payload/engine/lib/subject-views.js), [routes](../../payload/engine/lib/subject-routes.js), [contexts](../../payload/engine/lib/subject-contexts.js); [tree tests](../../tests/subject-views.test.js), [route tests](../../tests/subject-routes.test.js), [context tests](../../tests/subject-contexts.test.js), [actual CLI invariants](../../tests/subject-view-query-cli.test.js). |
| Supplied impact coverage, authenticated contexts, exact full-result and raw-byte deltas | [Impact boundaries](../../decisions/entries/subject-view-impact-boundaries.yaml): keep absent/partial/empty distinct and leave complete installation authority/publication with composing owners. | [Route comparator](../../payload/engine/lib/subject-route-impact.js), [view comparator](../../payload/engine/lib/subject-view-impact.js), [shared candidate delta](../../payload/engine/lib/subject-query-delta.js); [route impact tests](../../tests/subject-route-impact.test.js), [view impact tests](../../tests/subject-view-impact.test.js), [delta tests](../../tests/subject-query-delta.test.js). |
| P6 adoption of an authentic cumulative operation and shared CLI failure policy | [Operation admission](../../decisions/entries/subject-view-operation-admission.yaml): retain one context/allowance, separate host and domain limits, preserve tree independence and use the actual shared reporter. | [Command](../../payload/engine/commands/subject-view.js), [entry shim](../../payload/engine/subject-view.js), [operation tests](../../tests/subject-view-operation.test.js), [source guards](../../tests/exit-code-contract.test.js). P4 owns the shared operation and reporter. |

Existing accepted records remain applicable without rewriting them:
[D-000003](../../decisions/entries/D-003-three-stores-truth-anchor.yaml) separates
truth anchors; [D-000010](../../decisions/entries/D-010-git-native-concurrency.yaml)
places review in Git; [D-000011](../../decisions/entries/D-011-verdicts-engine-conduct-protocol.yaml)
separates deterministic reports from conduct and prohibits cached trust;
[D-000014](../../decisions/entries/D-014-engine-never-executes-client-code.yaml)
constrains execution; [D-000022](../../decisions/entries/D-022-engine-is-javascript-jsdoc.yaml)
retains the JS/ESM/JSDoc implementation. The new P6 records do not supersede them.

## Documentation disposition

| Surface | Disposition |
| --- | --- |
| [Subject views](ucs-1239-subject-views.md) and [context counts](ucs-1239-subject-contexts.md) | Current CLI, request, completion and budget contracts retained; add proposal links and explicit shared-reporter ownership. |
| [Route impact](ucs-1239-route-impact.md) and [regenerated views](ucs-1239-regenerated-view-impact.md) | Current authentic-capture, supplied-inventory, exactness and publication limitations retained; link the impact proposal. |
| [Derived-layer protocol](../../payload/protocol/derived-layer.md) | Clarify that default tree action checks, while `--write` writes; document route/context operation opt-in, bounded receipts, tree exclusion and qualification limits. |
| [README](../../README.md) | Integration owner maintains the root command table; it must describe tree, route and context modes. P6 supplied this correction and observed it in the integration working tree. No independent root edit or committed-state claim is made here. |
| [Protocol AGENTS](../../payload/protocol/AGENTS.md) and platform wrappers | Existing navigation points to the derived-layer protocol. No new workflow, permission, command entry point or wrapper contract is introduced by this rationale backfill, so no P6 instruction change is required. Root AGENTS policy is integration-owned. |
| Schemas, manifests, templates and publishing/migration guides | No input schema, package payload path, authoring format, publication or migration behavior changes in this backfill. Existing engine directory inclusion remains sufficient; no new template/manifest rule is required. |
| Root package/lockfiles, changelog, CONTRIBUTING, PR template and CI | Integration owner applies the user-required version advance once per actual PR, including docs-only PRs, with matching lockfile and versioned notes. Internal commits do not each create a version bump. [D-000021](../../decisions/entries/D-021-version-policy.yaml) supplies existing semver semantics; no tagging/publishing is authorized by a version change. |
| Acceptance reports, frozen runtimes and experiment inputs | Unchanged. Existing results are not recomputed, relabeled as scale qualification, or retuned. P7 publication and P10 measured operational qualification remain separate from P6 delivery. |

The backfill records decisions already embodied in released P6 commits. It does
not turn fixture success into supported maxima, claim exact installation route
discovery, grant historical authenticity to caller labels or erase prior
failures. No new reader, benchmark, SDK or production data change is introduced.

## Subsequent retained evidence continuation

The [read-only consumer contract](ucs-1237-reconsideration-consumers.md) now
forwards both assessment and material captures through route/context view modes,
under the [reconsideration Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml).
This includes an actual promoted-Subject assessment regression, as well as
reconsidered-Subject membership and context counts. View/context guides and the
installed derived-layer protocol describe the new flags; tree mode remains
evidence-independent. Root/protocol AGENTS and thin platform pointers retain
their existing navigation roles. No route/context algorithm, derived artifact
authority, publication permission or supported capacity is inferred from this
transport integration.
