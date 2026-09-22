> Packaging stage 2/7, version `3.0.0-rc.3`. This stacked prerelease is for review and new-installation development. The existing-store migration/cutover workflow arrives in PR4; do not migrate existing installations with this intermediate tree.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Supplied regenerated Subject view comparison

Recorded [impact comparison rationale](../../decisions/entries/subject-view-impact-boundaries.yaml) remains a
proposal; implemented behavior does not imply canonical Decision approval.

`compareSubjectTreeViews` in `payload/engine/lib/subject-view-impact.js`
accepts a closed version 1 envelope:

```js
{
  version: 1,
  before: { capturedInputRef, context: { model, subjectGovernance } },
  after: { capturedInputRef, context: { model, subjectGovernance } },
  inventory: { // optional; null also means not assessed
    version: 1,
    coverage: 'complete', // or 'partial'
    views: [{
      id: 'tree', kind: 'subject-tree',
      options: { budget: { nodes: 100, edges: 100, rows: 100 }, maxBytes: 10000 }
    }]
  },
  limits: { version: 1, maxViews: 1 }
}
```

Numbers above are examples, not supported production scale claims. Limits
bound view pairs; each actual derivation receives its own explicit identical
options on both sides. Envelope validation, authentication, indexing and hashing
are outside the traversal/render budgets. `maxBytes` covers the tree including
its fingerprint banner, not metadata JSON or the overall report.

Each supplied inventory authenticates both captured models against actual P2
governance handles, including an explicitly empty inventory. Different
installation namespaces are refused. Caller reference strings label captures;
they do not prove authenticity or an atomic filesystem snapshot.

Entries run in caller-ID order through `deriveSubjectTreeArtifacts`, the same
factory used by the CLI. Each side preserves its actual status, metadata and
artifacts, adding SHA-256 of each unchanged UTF-8 text and its byte length.
Only a complete declared inventory and two fully complete builds produce exact
artifact path/byte deltas. Added/removed/changed/unchanged contain sorted path
records with before/after hashes and byte lengths (absent sides are null).
Incomplete builds or partial inventories retain observed output but all four
delta collections are null. No empty artifact list proves absence.

Overall completeness also requires every supplied pair to be assessed.
Coverage lists every unassessed ID. Missing inventory is `not-assessed` with
null views, input and unassessed IDs. Explicit complete empty inventory is an
authenticated complete result with zero calls. Partial empty inventory remains
incomplete. Complete deltas for assessed pairs do not cover unassessed pairs.

Resources report actual returned projection nodes/edges/rows and render bytes/
rows summed across calls; unavailable counters are null and unreported calls
are explicit. Artifact output bytes are reported separately from renderer work.
The report fingerprint binds registry/governance captures, sorted inventory,
limits and actual per-side generator fingerprints.

These are artifact-byte changes only: metadata and fingerprint banners can
change even when displayed labels do not. Structural declared lifecycle does
not certify Subject approval or candidate semantics. No writes, saved-view
registry, discovery or publication decision occurs here. P8 may embed the
unchanged result as `optionalImpact.regeneratedViews`; required inventory and
publication policy remain external and independent of route inventory.
