> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Read-only subject-use inventory

`inspectSubjectUses` in `payload/engine/lib/subject-use-inventory.js` inspects one
actual committed before/candidate pair. It supplies structural observations, never
lifecycle approval, action adjudication, or publication readiness. The dedicated
[equivalent-merge gate](ucs-1235-equivalent-merge-dto.md) repeats inspection against
its actual candidate; serialized output is not an authority input. Its rationale
is recorded in the [P2 decision audit](ucs-1235-decisions-and-docs.md).

## Exact input

```js
{
  repoRoot,
  before: { commit, tree, kitPath },
  candidate: { commit, tree, kitPath },
  subjects: ['S-000001'],
  evidence: { decisionCaptures: [], assessmentCaptures: [] },
  limits: {
    maxRecordVisits, maxRegistryReferenceVisits,
    maxHierarchyNodes, maxHierarchyEdges
  },
  impactPolicy: { required: [], requiredExtensions: [] }
}
```

All listed fields are required; the nested objects are closed. Limits are explicit
safe nonnegative integers with no defaults. `subjects` is a nonempty duplicate-free
list of exact canonical Subject IDs or qualified Subject proposal keys. Each must
exist in at least one side. Both sides must share the same actual namespace.
`commit` and `tree` must match Git's actual immutable objects; `kitPath` is the exact
repository-relative selected installation path (`.` for the repository root).
Caller models, inventory rows, profiles, and completeness assertions are not accepted.

Required surfaces are `managedRoutes`, `subjectTreeViews`, or
`representativeReplays`, without duplicates. Required extensions are distinct
nonblank names. This release has no admitted owner capability/profile evidence for
these surfaces: requesting any of them yields `incomplete`, with explicit
`required-surface-unavailable` potential impact. An empty policy limits inspection
to the owned record/registry scope. External saved routes remain unknown and excluded;
arbitrary repository files are not interpreted as operational references.

## Actual inventory and witnesses

The fixed universe is every original canonical and proposal record in every present
Knowledge, Ontology, and Decisions store, plus all K/O/D ledger allocations. Typed
owner iterators preserve the original wrappers. Every admitted canonical record or
unloaded allocation is resolved through the authentic identity index. An absent
store with zero allocations is known absent only within this typed loader scope.
Missing and declaration-only payloads are unresolved, including retired/cancelled
allocations without retained payloads. Retired payloads and inactive/proposal records
remain inspectable.

Every record observation corroborates its exact committed whole-file bytes with the
shared record parser. It requires one exact identity occurrence, equality with the
original loader wrapper, and (for canonical records) the private identity occurrence.
Multi-entry files retain separate occurrence paths. Capture locators are repository
relative; record occurrence locators are kit relative.

Known assignments preserve authored IDs and order. Known `[]` is distinct from
unknown absent metadata. Direct assignments are not redirected through equivalent
merges. Inherited uses contain the exact parent path from the selected ancestor to
the original assigned subject. An already directly assigned ancestor does not get a
second inherited membership. Distinct descendant assignments can have distinct
positive inherited witnesses. Associations do not transfer membership.

Registry uses enumerate current authored parent, association, retirement redirect,
and successor references. An association is emitted once in authored orientation
when either endpoint is selected. Full historical graph validation comes from actual
loading/governance; historical registry rows are not a second current-reference set.
Unsupported historical actions can still make a snapshot refuse before enumeration.

## Output fields

The version-1 report has:

- `status`: `complete`, `incomplete`, or `refused`, only for the disclosed scope.
- `scope`: exact selected subjects and fixed record/registry semantics, external
  inventory `unknown`, exclusions, and resource boundaries.
- `inputs.before/candidate`: actual commit/tree/kitPath, namespace, registry/identity
  digests, committed registry capture, and genuine governance descriptor.
- `coverage.before/candidate`: `records`, `assignments`, `registry`, and `hierarchy`
  completeness, plus store kind/presence/allocation counts.
- `records`: side, exact `ref` or `proposalRef`, original `locator`, committed `capture`,
  lifecycle-only state, identity `resolution` (`proposal` for proposals), and original
  `assignments` interpretation.
- `uses`: direct/inherited assignments with subject, original owner and witnesses;
  inherited uses add `assignedSubject` and `path`. Registry references instead carry
  `source`, `target`, `type`, `declaredStatus`, selected endpoint `subjects`, authored
  field `locator`, and committed registry `capture`.
- `potentialUses`: unknown assignments, unavailable allocated payloads, exhausted
  inspection scope, or unavailable required surfaces. Exhausted universes have
  `unexamined: true`; they never assert an empty affected set.
- `deltas`: `added`, `removed`, and `complete`. Incomplete inspection withholds both
  delta arrays; consumers must require `deltas.complete` before interpreting empty
  arrays as no change. Positive side observations remain in `uses`. Complete comparison
  ignores side/capture/locator changes and compares structural identity, lifecycle,
  assigned path and registry endpoint/status facts. Moving a file or changing an
  unrelated byte alone is not a structural use change.
- `impact`: exact required surface/extension lists and `not-required` or `unavailable`.
- `limits`, `used`, and structured `diagnostics`.

Output is deterministic for the same committed pair, evidence, limits and policy.
Malformed snapshot/model or referenced evidence integrity refuses; already observed witnesses may
remain in a refused result and must not be interpreted as complete. Missing retained
review bytes remain separately visible as governance verification `unavailable`.
`scope.evidence` is `referenced-historical-reviews`: unrelated supplied captures are
not preflighted or represented as verified. Structural completeness does not confer approval of their historical decisions.

## Logical limits and exclusions

Counters accumulate across before and candidate, even when they name the same commit:

- `recordVisits`: one admitted original record/proposal or unresolved allocation.
- `registryReferenceVisits`: each examined authored reference, selected or not.
- `hierarchyNodes` / `hierarchyEdges`: the existing ancestor walk's logical visits.
  Walks are cached per assigned ID within a side, never across sides.

These are inspection limits. They do not bound Git materialization, actual owner
loading/native parsing, eager typed enumeration, governance evaluation, source-file
capture/parsing work per admitted record, or output serialization. No CPU, allocation,
whole-operation source byte, or output byte guarantee follows. A budget-limited prefix
is positive evidence only; it cannot establish negative coverage.

## Verification

Actual Git fixtures cover original canonical/proposal records in all three stores,
unknown versus empty assignments, inherited witnesses, authored associations and
retirement redirects, required unavailable surfaces, cumulative limits, partial-delta
refusal, nested paths, shared multi-entry occurrences, namespace/tree/path mismatch,
absent stores, unresolved allocations/declarations, retained inactive records,
unavailable versus corrupt evidence, deterministic output and untouched dirty/index
state. Main owns the integrated full suite and publication acceptance.
## Continued retirement evidence

The [lifecycle material profile](lifecycle-material-continuation.md) adds an
internal continued-inventory entry for the retirement owner. It accepts already
owned evidence and the enclosing authentic governance allowance. Actual model
evaluation, binding and additional reads debit that owner; the inventory's
existing four logical counters and DTO remain unchanged. Standalone
`inspectSubjectUses` still does not accept material captures. This internal
entry must not be advertised as standalone interface support.
