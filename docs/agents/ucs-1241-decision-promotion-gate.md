> Packaging stage 3/7, version `3.0.0-rc.4`. This stacked prerelease is for review and new-installation development. The existing-store migration/cutover workflow arrives in PR4; do not migrate existing installations with this intermediate tree.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Actual Decision promotion gate

Proposed rationale `53e6b70b-75d3-476b-bd2c-1b11ef075ebc` is in [the P8 decision records](../../decisions/entries/subjectless-decision-promotion-proof.yaml). See the [scope and documentation audit](ucs-1241-documentation-audit.md) for evidence, version ownership and remaining creation coverage.

`runPreparedDecisionPromotionGate(input)` has exact input keys:

```js
{
  repoRoot,
  before: {commit, tree, kitPath}, candidate: {commit, tree, kitPath},
  publication: {id, review},
  promotion: {version: 1, rows: [{proposalRef, canonicalRef, targetLifecycle: 'accepted', beforeCapture}]},
  eventId, reviewNote: {date, author, skill},
  limits: {
    promotion: {maxFiles, maxFileBytes, maxSourceBytes, maxPromotions},
    assignments: {maxRecords, maxCaptureBytes, maxRedirects}
  }
}
```

BeforeCapture is the exact committed proposal-file locator including source pair; canonical genesis before remains null. All objects are closed, arrays dense/unique where identities require it, and data properties only. Admission detaches before any await. InputDigest is canonicalSha256 of exactly `{version:1,before,candidate,publication,promotion,eventId,reviewNote,limits}`, excluding repoRoot and retaining authored array order/locators.

Exact closed result:

```js
{
  version: 1,
  kind: 'decision-promotion-gate',
  mode: 'read-only-prepared-decision-promotion',
  ok: false, publicationReady: false,
  inputDigest: null, // SHA-256 after closed input admission
  inputs: null, // {before:{commit,tree,kitPath},candidate:{commit,tree,kitPath}} after actual source assembly
  capabilities: {before: null, candidate: null},
  promotion: {
    status: 'not-performed', // or failed/passed
    createdRefs: [],
    files: [],
    resources: null, // exact P1 resources after successful planning
    diagnostics: []
  },
  assignment: null // actual raw common P8 prepared-assignment report once invoked
}
```

Each established capability observation is exact `{knowledge:boolean,ontology:boolean,decisions:boolean,subjectRegistry:boolean,assignmentHistory:boolean}` from the actual healthy loaded snapshot/layout; null until observed. Successful branch requires K/O false, Decisions true, registry false both, history false before and true after. Candidate history must contain only exact selected genesis rows with unknown/known-empty states and no SID references. Unsupported or malformed histories refuse; the shared reader is unchanged.

Each promotion.files row is exact `{file,before:{mode,capture},after:{mode,capture}}`, populated only after actual candidate bytes/mode equal P1's expected complete file change. Raw planned byte Buffers are not serialized as an approval report. P1 core remains a fixed internal call; expected identity, exact created set, actual old allocation/canonical absence, unique effective candidate occurrence and actual proposal consumption are corroborated. Remaining changed paths may only be exact new genesis files. P8 checks current candidate states, captures, immutable history, P3 before:null new-assignment, and separate effective unchanged existing Decision authorizer.

Publication.review must equal actual creation event.review.reference. P8 recaptures actual before Decision bytes and any differing historical source locator independently; no caller retained evidence or event assertion substitutes for verification. Shared-file selected promotions may alter the containing Decision file while preserving the authorizer's exact record/digest/provenance and corroborated candidate occurrence. Human receipt reference remains a separate publication-layer binding.

The raw assignment report uses existing fixed fields/check names. For this branch, scope basis is actual-decision-proposal-promotion; impactPolicy is passed only for the actual Decisions-only capability predicate and structural/value/identity/consumption obligations, with required Subject impact list empty because the branch has no Subject authority or assignments. Optional Subject reports remain not-assessed, never fake complete. HumanApproval remains not-performed. Final publication requires retained runtime/review/fresh gate and CAS in P7.

The fixed P1 planner is invoked after actual healthy snapshot loading. Its source allowance covers its own captured-source planning work. P8 separately charges its actual before file, candidate file and materialized candidate byte witnesses against the assignment capture allowance, once per planned physical file, then reuses those witnesses for each selected canonical occurrence. Authorizer capture work retains the common gate's accounting. These owner allowances do not bound all snapshot materialization, native Git/parser work, earlier model loading or all retained-history CPU.

`promotion.status` becomes failed when actual planning starts and remains failed until exact file/identity/scope comparison and the full changed-path check pass. Verified file rows can be partial on refusal; they never stand in for overall success. Failed input admission leaves the assignment report null and carries its diagnostic in promotion.diagnostics. Failed model/capability checks retain actual observations only for successfully loaded sides; unobserved sides stay null. The `ok` flag requires both the actual transformation and the complete common assignment gate to pass, and publicationReady always remains false.

The gate is read-only and uses actual immutable commits. The staged index, branch and dirty checkout are not candidate inputs. `tests/helpers/decision-promotion-gate-fixture.js` composes P1's released committed proposal fixture with actual v2 creation events, content captures and new candidate commits. It is available for final-gate integration tests; it does not establish publication approval.
