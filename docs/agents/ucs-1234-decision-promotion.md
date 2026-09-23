# Captured Decision promotion

`planCapturedDecisionPromotion` in `payload/engine/lib/record-promotion.js` plans
exact byte changes from an actual immutable committed source. It is the P1
transformation component for ordinary promotion, not a publication gate.

The [versioned K/O planner](ucs-1234-typed-promotion-planner.md) now shares this
private byte-planning implementation. This Decision function keeps its original
input and proposed-to-accepted behavior; callers do not add `version` or `kind`.
The separate K/O planner does not widen the Decisions-only publication profile.

Implementation rationale is captured as proposed records in
[the P1 Decision record](../../decisions/entries/ordinary-decision-promotion-proof.yaml).
Proposal status records the rationale without asserting human acceptance or
allocating new canonical IDs.

```js
{
  repoRoot,
  source: { commit, tree, kitPath },
  publication: { id, review },
  selected: [{
    proposalRef: { namespace, kind: 'decision', key },
    canonicalRef: { namespace, kind: 'decision', id },
    targetLifecycle: 'accepted',
    beforeCapture: { file, blob, sha256, source: { commit, tree } }
  }],
  limits: { maxFiles, maxFileBytes, maxSourceBytes, maxPromotions }
}
```

All objects are closed data properties. Limits are explicit positive safe
integers; maxFileBytes must fit the shared 64 MiB Git capture limit. Source kitPath
is `.` or `unknown-knowledge`. Inputs detach before the first async boundary.

The implementation verifies the source commit/tree and actual kit root, scans
regular committed files, loads the current healthy model, and selects proposals
through the shared parser and typed proposal iterable. Each supplied before
capture must equal the actual whole-file Git locator. No caller model or approved
report is accepted. Proposed Decision lifecycle is required; accepted is only
the requested candidate state.

Selected proposal keys sort bytewise. Requested canonical IDs must equal the
shared allocator's result against the actual before ledger and new publication.
Only selected ID/status scalar spans, typed Decision references to selected
targets, and corresponding catalog ID spans may change. Subjects, dates, reasoning,
evidence, siblings, comments, quoting, line endings and file modes remain intact.
New ledger rows insert before existing rows without reserializing existing bytes;
the actual result is checked with the shared identity transition validator.

Every YAML/JSON scalar in the scanned kit is inspected for selected proposal
keys, including escaped values. Selected references outside the admitted spans
refuse with file/path. Remaining literal keys in comments, untyped files or body
text also refuse conservatively. Unsupported YAML representation, nonregular
files and unreadable source refuse; this first slice does not adjudicate them or
claim arbitrary external-reference discovery. It does not rewrite unselected
records or operational owners.

Success returns `{ok:true,publicationReady:false,source,identity,createdRefs,
changes,resources}`. Each change uses the existing candidate byte executor shape
`{file,before:{mode,capture},after:{mode,bytes}}`. These detached buffers are expected
candidate bytes, not an externally supplied proof. Failure returns
`{ok:false,publicationReady:false,code,diagnostics}` without partial changes.
Unexpected implementation exceptions still throw.

`maxSourceBytes` counts actual snapshot scans plus loader reads through one shared
source budget. Its usage is reported as `resources.sourceReads`. Native Git
capture/materialization, parser allocations and other work remain outside that
counter and do not acquire a whole-operation scale guarantee.

The P8 ordinary-promotion adapter must call this fixed component itself, compare
the returned bytes/modes with the actual candidate and check the entire changed
path set, permitting only its separately defined event/history artifacts. It must
validate actual proposal consumption, fresh canonical creation/genesis with null
canonical before, every newly effective Subject assignment, and the separate
existing effective authorizing Decision. Existing P7 retained validation, actual
human review, final execution and candidate CAS remain mandatory. The old
subject-assignment gate does not gain promotion support from this planner.

Tests cover actual SHA-1/SHA-256 source capture and candidate creation with dirty
checkout preservation, exact typed reference/catalog changes, absent versus empty
subjects, outside-scope and escaped references, wrong capture/namespace/allocation,
terminal proposals, malformed siblings, data-property admission, limits and block
ledger byte preservation. They exercise the existing byte executor only; complete
review/publication acceptance still requires the final owner integration.

An additional real-Git integration test uses the released P8 genesis metadata:
history is absent before promotion, then the candidate contains only the exact
two Decision creation baselines/events with unknown and known-empty assignment
states. The Subject registry remains absent. Actual after-file hashes agree with
birth captures, the authorizer record remains unchanged in its shared changed
file, current-history checks and ordinary store validators pass, and malformed
origins/birth states make the loader fail. The reader still correctly labels
capture verification and approval as not performed and publicationReady false;
this does not replace the final promotion adapter or publication gate.

## Released prepared gate and remaining integration

P8 release `3731a4f` adds `runPreparedDecisionPromotionGate` in
`payload/engine/lib/assignment-gate.js`. It invokes the fixed P1 planner, verifies
the actual candidate bytes and modes, ledger, fresh canonical set, proposal
consumption, exact genesis and complete changed paths, then checks the existing
effective authorizer. The first supported pair has Decisions present, Knowledge
and Ontology absent, no Subject registry, and history absent before with exact
creation history afterward. Selected assignments are absent or `[]`.

The gate uses the shared committed-source fixture released in `950a45d`. P1's
bounded source review found a non-enumerable array-index admission defect; P8
fixed it before release, and P1 independently verified the public-gate refusal
regression. That review and the genesis tests do not establish final publication.
The raw gate keeps `publicationReady:false`, optional Subject impact reports
`not-assessed`, and human approval `not-performed`.

P7 must explicitly admit the operation through runtime capture, worker dispatch,
retention and readback, verify an independently approved complete runtime
profile, and rerun the exact gate at review and publication before ref CAS.
Full K/O/D and classified promotion remain beyond this first released slice.
