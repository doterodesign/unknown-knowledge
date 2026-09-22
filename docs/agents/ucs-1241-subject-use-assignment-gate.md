> Packaging stage 5/7, version `3.0.0-rc.6`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Actual merge assignment validation

Proposed rationale `a51231ef-db5b-49d4-a3ee-0bdd363fff75` is in [the P8 decision records](../../decisions/entries/typed-equivalent-merge-assignment-scope.yaml). The [documentation audit](ucs-1241-documentation-audit.md) records implementation and publication boundaries.

`runPreparedSubjectUseAssignmentGate(input)` accepts exactly the frozen public DTO in `ucs-1235-equivalent-merge-dto.md`. P2 admission detaches the complete input, including retained evidence bytes, before any asynchronous work. No caller model, scope report, callback or successful check is accepted.

The adapter builds actual before/candidate commit snapshots through the same private assembly used by `runPreparedAssignmentGate`. Both models pass the existing structural checks and bind their own actual governance, with both Decision and assessment capture groups supplied to the shared loader. The complete identity ledger and kit location remain unchanged.

The adapter invokes the fixed `inspectEquivalentMergeAssignmentScope` implementation with privately constructed actual descriptors, roots and contexts. P2 verifies registry transition, current Decision authority, complete explicit-reference inspection and exact unchanged unknown-owner retention. P8 verifies the returned actual descriptor/operation correspondence, complete event scope, assignment event digest and every independently derived after array. P2's exact refs become the common typed pipeline's selection; caller event rows never determine that selection.

The common P8 pipeline checks each existing effective allocated owner, full retained assignment chain, immutable ordered baselines, actual record captures and revisions, new Subject eligibility, grouped byte preservation and the complete changed-path set. The sole extra admitted path is the actual Subject registry, after P2 succeeds and P8 independently recaptures its before/candidate Git locators and bytes and verifies unchanged file mode. Those registry recaptures count against the assignment capture allowance, separately from P2's governance work. All Knowledge edits require the existing exact revision-note suffix.

P2's typed extension admits effective existing K/O/D direct uses, including O-only and D-only merges. Multiple selected O/D entries share one captured file and the union of selected subject spans; unselected known siblings remain byte-exact, and O/D acquire no notes. P2 still protects the entire authorizer file and each retained unknown owner's file, so selected siblings in either protected file refuse. This merge restriction is deliberately stricter than the separate promotion gate's unchanged-authorizer-record rule. Inactive/proposal uses and graph rewrites remain unsupported.

Registry and assignment review evidence must have the exact same typed Decision ref, review reference, accepted status, record digest and capture locator. The common P8 verifier independently checks the actual unchanged current authorizer and any declared historical commit membership. Neither report authenticates human attention.

The return shape is exactly `{version: 1, core, assignment}`. `core` is null before invocation, or P2's unchanged raw report, including failed results. `assignment` is the actual P8 report. There is no combined success or publication flag. A successful P8 assignment report records `impactPolicy.status: not-performed` with scope `joint-merge-impacts-owned-by-outer-gate`: P2's outer gate must perform its mandatory impact checks. The fixed Knowledge/current-policy replay recipe is not reused as equivalent-merge coverage. Actual runtime route capability, review and final publication remain later requirements.

Readable unclassified records retain their raw unknown assignment state and incomplete semantic inventory. Complete explicit-reference closure does not turn them into known-empty assignments or fabricate semantic completeness. Such unchanged owners gain no new assignment baseline or event row solely because they were inspected.

`tests/helpers/subject-use-assignment-fixture.js` exports `subjectUseAssignmentFixture(t)` for outer-gate tests. It builds actual commits with supported Knowledge frontmatter, exact notes, captured adoption baselines and a v2 transition event. It does not publish or approve a real installation.
