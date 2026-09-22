# Typed existing-record assignment review

These raw staged/prepared APIs also accept optional
[continuation evidence](ucs-1241-assignment-continuation.md) for actual K/O/D
assignment eligibility. Continuation changes the owner report to version 2;
the typed event remains independently schema version 2. Omitted continuation
keeps the original owner report. It does not add typed retained workers,
representative replays or publication: even a typed Knowledge selection remains
outside the existing domain-based Knowledge publication profile.

Proposed rationale: state/genesis `ab799c5e-c506-458c-b642-5a6b8fb8b7ba` and grouped preservation `8c9f8f9e-5775-4098-ba5a-f4776c375533` in [the P8 decision records](ucs-1241-documentation-audit.md). See the [scope and documentation audit](ucs-1241-documentation-audit.md).

The staged `runAssignmentGate` and immutable-commit `runPreparedAssignmentGate` APIs share the same actual snapshot, history, capture, Decision and preservation pipeline. Add a closed `selection` to request version 2 existing-record review:

```js
selection: {
  kind: 'typed-records',
  refs: [{ namespace, kind: 'ontology', id: 'O-000001' }]
}
```

Refs are unique, nonempty canonical K/O/D owners in this installation. The selection is reviewed caller intent, independently corroborated against actual original records and the exact event row set. It is not complete global affected-use discovery. Every selected owner must already be allocated, uniquely loaded and effective on both actual sides with identical lifecycle. The entire identity ledger and all unrelated paths remain unchanged. Proposal promotion, canonical creation, lifecycle transitions and Subject registry changes are unsupported by this operation.

The actual event must use `schema-version: 2`, `operation: existing-subjects` and the closed scope `{kind: typed-records, refs}`. Its other fields and changed/unchanged row capture/revision rules retain the established assignment event contract. The v2 schema is separate so the v1 Knowledge-domain schema remains unchanged. Version 1 accepts no typed selection, and version 2 cannot borrow domain scope or infer selection solely from its own rows. These existing-record gate APIs refuse canonical creation and Subject lifecycle transitions, including structurally valid events supported by the history reader.

The metadata reader separately recognizes closed v2 `canonical-creation` and `subject-use-transition` events. A creation row has null before state, capture and revision, disposition `created`, and after revision zero. Its baseline has immutable `origin: {kind: creation, event: <UUID>}` and must exactly match that row's authored after state and Git content capture `{file, blob, sha256}`. The capture has no source field. Each created ref requires its own matching birth row; one event may create several refs. Missing or malformed origins cannot fall back to adoption, and later ordinary revisions never replace the birth capture. This establishes chain integrity only. The separate [Decisions-only promotion gate](ucs-1241-decision-promotion-gate.md) verifies actual freshness, proposal consumption and candidate ownership for its admitted branch; approval remains a publication-layer obligation.

Subject transition metadata uses scope `{kind: subject-use-transition, operation: <UUID>, action: merge-equivalent, survivor, absorbed, registry-events}` and ordinary changed/unchanged rows. Distinct absorbed IDs exclude the survivor, and ordered registry event IDs are unique. Parsing this scope does not establish actual registry changes, complete affected-use discovery or joint Decision authority; those require the actual P2/P8 merge gate.

Plain retirement adds the separately closed scope `{kind: subject-use-transition,
operation: <UUID>, action: retire, subject, registry-events}` through
[`assignment-retirement-event.schema.json`](../../payload/schemas/assignment-retirement-event.schema.json).
Its fixed `runPreparedSubjectRetirementAssignmentGate` adapter requires the actual
complete withdrawal set and shared registry/Decision evidence. Ordinary typed
assignment gates still refuse this operation. The outer
[retirement gate](ucs-1235-plain-retirement-dto.md) owns mandatory impacts and the
separate zero-use branch, which retains no assignment event or P8 success report.
The schema validator's supported keyword subset and existing merge schema stay
unchanged; metadata recognition alone does not authorize retirement.

Existing unknown metadata, explicit empty assignments and positive lists remain distinct. Version 2 permits an explicit reviewed known-to-absent withdrawal with a nonblank row reason and actual unknown after state. It advances the revision exactly once and preserves prior history. Knowledge's exact appended revision note says `subjects unknown (classification withdrawn)`; it never describes withdrawal as empty. Version 1 keeps its known-after restriction for changed classification. Unchanged effective assignments retain the existing P3 rules, while every actual newly added Subject must pass candidate new-assignment eligibility.

Selected refs are grouped by physical file. Each file is captured once per actual byte witness, then every selected canonical occurrence is corroborated with P1's shared full-file parser. O/D preservation compares the union of selected `subjects` spans, retaining unselected sibling bytes, schema envelope, comments, evidence, dates and provenance exactly. Knowledge reuses the existing frontmatter and exact note-suffix checker. O/D schemas gain no notes fields: row reasons are hashed event evidence; actor and skill remain the explicit `reviewNote` operation input. A future publisher must retain/bind that input. This read-only gate neither retains it as durable publication evidence nor authenticates authorship.

The positional editor supports block record mappings and block `entries` sequences, plain field keys, and subjects as a field after the sequence-leading field. Subject arrays may be flow or block sequences. Anchors, aliases, explicit tags, comments inside editable spans and ambiguous layouts refuse. All semantics still come from the shared parser; syntax events locate byte spans only. BOM, CRLF and Unicode remain exact outside admitted edits. Multiple selected siblings cannot authorize formatting changes in an unselected sibling.

All old event files remain unchanged and baselines retain their literal ordered prefix. Newly tracked existing owners adopt actual before-state/capture at revision zero. The common chain retains v2 operation/version and replays its changed/unchanged rows directly, without treating them as creation or resetting earlier history.

`limits.maxRecords` bounds the complete typed selection and `used.selectedRecords` counts actual selected owners. Version 1 retains its existing allocated-Knowledge universe/count. Capture bytes count each physical file witness once even when several selected rows share it; per-row parser corroboration still occurs. These counters do not bound snapshot materialization, loading, native parsing/canonicalization, all historical-chain CPU, or all memory use.

Route and generated-view comparisons remain actual optional owner reports under the supplied required-impact policy. The existing fixed `assignment-replay-v1` is Knowledge-only, so supplying it for typed K/O/D authoring explicitly refuses with `typed-assignment-replays-unsupported`. A required but absent replay remains incomplete. A separately released typed publication/replay policy is still needed; `ok` here never means publication-ready or human-approved. Existing P1/P7 assignment-only publication transport is not implicitly expanded by this API.
