# UCS-1220 — unverified and failure conduct

Requirements: [UCS-1220](https://linear.app/unknown-creatives-studio/issue/UCS-1220)
and its parent [UCS-1215](https://linear.app/unknown-creatives-studio/issue/UCS-1215).
Review fixed point: `a4e0bdd3b7bd892d18b14adbc20a5ea2146e0e10`.

## Behavior and compatibility

Missing `facets.stage` previously fell through to trusted. A leaf with no
declared promotion state now returns unknown with the existing `review-stage`
action and a factual missing-stage reason. Draft/proposed reasons describe
declared metadata without claiming to authenticate human review. No engine
conduct prose, new action code, schema requirement, promotion, date refresh,
hook change or numeric exit redesign is introduced.

Store-wide failure still outranks all selected checks. Within a healthy store,
attributable structural errors still outrank stage, and stage outranks age.
A missing date under time governance therefore retains `missing-verified`
evidence, quarantine and exit 1; omitting the evaluation date on an otherwise
eligible governed leaf retains skipped freshness, unknown and exit 2. Static
or absent volatility never establishes review or original-source freshness.
Legacy missing-stage records still load, validate and remain inspectable.

The client-owned protocol applies the whole-command exit before action rows.
Exit 2 stops GATHER/ACT, including mixed trusted/unknown results. Exit 1 allows
only explicit client conduct, with stale/quarantined claims kept unverified.
Recovery instructions are next steps after stopping, never permission to
gather through exit 2 or silently promote a record.

Under D-021 this is a conservative trust bug fix: the CLI shape, code vocabulary,
numeric meanings and store schema remain unchanged. Consumers must nevertheless
handle a legacy missing-stage leaf changing from trusted/exit 0 to unknown/exit 2.
Do not fill missing stages mechanically to regain green. Steward review belongs
in the existing gated write path. Making stage schema-required or changing
numeric exit semantics would require separate MAJOR scope. UCS-954's preceding
action-code replacement is already classified MAJOR; this slice does not reduce
that release requirement, bump versions or publish anything. D-011 and D-021
settle these choices; no new Decision ID is minted.

## Verification seams

`tests/preflight.test.js` exercises the external CLI in JSON and human modes:
missing stage, draft/proposed, stale age, static and absent-volatility exemptions,
missing/malformed verification dates, omitted evaluation date, structural
precedence, store-wide degradation and mixed selections. It checks deterministic
output, distinct reasons/evidence and unchanged record bytes. The missing-stage
test was red against the pinned baseline (trusted/exit 0) before the verdict fix.

Fresh-agent conduct trials use `acceptance/runtime-preflight-fixture.js` with
synthetic local sources. Added `missing-stage` and `missing-date` variants alter
only controlled fixture metadata. Dependencies are runtime inputs excluded by
the generated `.gitignore`; they are not committed evidence. The existing
complete-evidence-set protocol and platform wrappers are retained. See the
walkthrough report for actual runs, traces and limitations; static assertions
about prompt wording do not count as agent trials.
