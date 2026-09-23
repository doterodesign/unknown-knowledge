# Development fixture preparation

`acceptance/retrieval/materialize-development.js` renders the reviewed source
packet into eight independently namespaced installations. Invoke it with a fresh
destination and an exported runtime at
`d5b2d37db67111466cafbc87e0fd5a77b7bfedc7`:

```sh
node acceptance/retrieval/materialize-development.js DESTINATION PINNED_RUNTIME
```

The builder verifies the frozen source and editorial hashes and the runtime's
tracked engine, CLI and package bytes. Canonical identities come from the real
allocator; unpublished records retain typed proposal keys. Each installation
contains original sources, exact excerpts, captured supporting Decision bytes,
and a complete initial subject activation event. Missing assignments remain
missing. Historical qualifications and independently scoped claims stay in the
rendered record text.

Preparation runs the real store loader, identity transition, subject governance,
capture consistency, detached initial subject transition, assignment, structural
and source-value checks. Ontology assertions describe source line sets only.
Their extractor does not establish source order, blank/comment preservation or
software behavior. `verifyDevelopmentSources` independently checks original and
excerpt hashes.

The evaluator-only `materialization.json` records attribution and actual
identities. It must never become a runtime crosswalk. UUIDs are intentionally new
for each preparation; a later run needs its own candidate-specific review and
oracle projection. The builder refuses to overwrite an existing destination.

## Retained first preparation

The reviewed fixture is `/private/tmp/ucs1243-development-data-v1`. Its durable
archive, custody inventory, independent fidelity reviews, negative probes,
detached transition checks and candidate-specific oracle manifest are retained
under:

```text
/Users/dimitriotero/.codex/visualizations/2026/09/18/01a0b650-6695-7d20-bdd4-0ce676526f01/implementation/
```

`development-record-oracle-manifest-v1.json` binds these artifacts to the frozen
source judgments. Three independent reviewers checked all 82 source records and
8 supporting Decisions. The projection covers 48 tasks and 720 judgments:
656 source-record judgments plus 64 independently graded support judgments.
The original grades, applicability, answer contracts and bundle memberships are
unchanged. All supporting Decisions receive grade zero and inapplicable status
for these tasks; they remain real records consuming reader budgets.

All eight detached initial transitions passed. Negative probes on a copy showed
that altered excerpts fail value and byte checks, altered originals fail byte
checks even when excerpt values still agree, missing captures cannot establish
eligibility, and corrupt captures refuse with an evidence digest mismatch.

The first preparation predates adding the detached transition and source-byte
assertions directly to the builder; those checks were applied separately to its
unchanged bytes and retained. Its custody snapshot is after preparation, not a
claim of pre/post Node or dependency capture. Restoring the archive requires
explicitly rebasing evaluator paths, without changing runtime identities.

These checks qualify prepared development data only. They do not establish a
filesystem publication gate, authenticated human approval, retrieval quality,
performance qualification, or the final paired experiment. A newer runtime must
be independently pinned and checked against the retained fixture bytes.
