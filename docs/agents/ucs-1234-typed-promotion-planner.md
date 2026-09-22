> Packaging stage 3/7, version `3.0.0-rc.4`. This stacked prerelease is for review and new-installation development. The existing-store migration/cutover workflow arrives in PR4; do not migrate existing installations with this intermediate tree.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Captured Knowledge and Ontology promotion plans

`planCapturedRecordPromotion` in `payload/engine/lib/record-promotion.js` extends
the actual committed byte planner to homogeneous Knowledge or Ontology batches.
The [proposed implementation Decision](../../decisions/entries/typed-record-promotion-byte-plans.yaml)
records this bounded choice. The existing
[Decision planner](ucs-1234-decision-promotion.md) keeps its original input and
proposed-to-accepted behavior through the same private implementation.

```js
{
  version: 1,
  kind: 'ontology', // or 'knowledge'; never mixed and not 'decision'
  repoRoot,
  source: { commit, tree, kitPath },
  publication: { id, review },
  selected: [{ proposalRef, canonicalRef, targetLifecycle, beforeCapture }],
  limits: { maxFiles, maxFileBytes, maxSourceBytes, maxPromotions }
}
```

The refs use the selected kind and actual installation namespace. A proposal ref
is `{namespace,kind,key}` and a canonical ref is `{namespace,kind,id}`.
`beforeCapture` is the exact actual whole-file Git locator
`{file,blob,sha256,source:{commit,tree}}`. The source kit path is `.` or
`unknown-knowledge`. All objects contain only their declared enumerable data
properties; selected arrays must be dense enumerable data slots. Admission
detaches the input before asynchronous capture. Limits remain explicit positive
safe integers, with the existing 64 MiB maximum file size.

| Kind | Actual source lifecycle | Exact target | Authored fields |
| --- | --- | --- | --- |
| Ontology | `draft` or `proposed` | `active` | `entries[i].id`, `entries[i].status` |
| Knowledge | `draft` or `proposed` | `verified` | frontmatter `id`, `facets.stage` |

K/O source eligibility uses the shared `isPrePromotionStatus` predicate on the
actual lifecycle scalar. A proposal key alone does not prove eligibility. A
missing lifecycle field, custom or already-effective state, deprecated Ontology,
suppressed Knowledge or canonical draft activation refuses. No field is inserted
to manufacture a lifecycle. Decision callers continue using the separate wrapper;
this public version does not add classified Decision promotion.

The planner loads and corroborates the actual committed source and identity
index, then sorts selected proposal keys bytewise and requires their requested
canonical IDs to equal the shared per-kind allocator's fresh result. Fixed
installed descriptors select the parser, catalog, lifecycle path and typed ref
space; callers cannot supply field paths, parser callbacks or passed reports.

Only the selected identity/lifecycle scalar spans, matching-kind references
within selected owners, matching catalog IDs and new allocation rows may change.
References use the loader's actual `REF_FIELDS` declaration. Knowledge relations
and cross-references can change together; Ontology `used-by` and
`confusable-with` can change together. Other typed ref spaces remain unchanged.
Every selected occurrence is corroborated against the actual parsed model and
whole-file capture. Old ledger bytes are preserved by insertion, not reserialization.

Unselected owners, sibling records, comments, quoting, BOM/line endings, file
modes, subjects, bodies, citations, authority, dates, volatility, source pointers,
provenance, scope and evidence remain exact. No verification date is refreshed.
An incoming reference to a consumed proposal outside these admitted owner/catalog
spans refuses, including parsed escaped YAML/JSON values and literal references
in bodies or untyped files. Unsupported escaped rewrite scalars and YAML
anchors/aliases/tags refuse under the existing scalar parser. This is a bounded
scan of the selected kit, not discovery of arbitrary external consumers.

Success retains the existing result shape:
`{ok:true,publicationReady:false,source,identity,createdRefs,changes,resources}`.
Created refs follow sorted proposal order. Changes are sorted by path and use
`{file,before:{mode,capture},after:{mode,bytes}}`. Failure supplies
`{ok:false,publicationReady:false,code,diagnostics}` with no partial changes.
Expected admission/capture/parser refusals remain distinct from unexpected bugs.
`resources.sourceReads` counts the actual shared-budget scan and loader reads;
native Git work and parser allocations are not a complete operation budget.

## Integration and limits of this release

This release supplies both K/O byte plans. It does not enable Knowledge in an
Ontology-only prepared gate or widen the released Decisions-only publication
profile. P8 must call this planner itself, compare every actual candidate byte
and mode and the complete changed-path set, prove proposal consumption/fresh
identity creation, preserve or append exact genesis history, verify existing
authorizer evidence, and validate every newly effective assignment. Registry
governance and classified impact checks remain P8/P2/P3/P4/P6 responsibilities.

Selected Ontology promotion requires actual candidate source-pointer/extractor
preflight. Selected Knowledge promotion requires actual candidate leaf evidence
and freshness checks under an explicit digest-bound evaluation date. A healthy
source model or a successful byte plan cannot replace those checks. P7 retains
the separate runtime-profile, review, fresh final verification and CAS boundary.
No new CLI, installed authoring workflow, public callback, schema or extractor
is introduced here.

`tests/typed-record-promotion.test.js` uses actual SHA-1/SHA-256 Git fixtures at
root and nested kit paths, independently expected replacement bytes, selected
references, old ledger rows, dirty checkout/index preservation, executable modes,
actual candidate loading and structural checks. It exercises missing versus
empty assignments, lifecycle refusals, escaped/outside references, capture and
allocation mismatch, closed admission, capacities and detached inputs. The
shared helper is `tests/helpers/typed-record-promotion-fixture.js`.
Existing Decision planner/gate tests remain regression coverage. These tests
establish byte planning, not human approval or complete typed publication.

Documentation coverage: this new API guide, the existing Decision guide and the
proposed Decision/catalog are updated. Root version/changelog/README/AGENTS and
final PR completeness remain the integration owner's responsibility; this
internal release is not a separate PR. Existing installed workflow instructions
remain accurate because this change adds an internal planner, not a user command.
