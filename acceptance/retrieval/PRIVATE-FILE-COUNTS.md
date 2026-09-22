# Private-file counts: observed completion with retained warnings

Four untimed queries at `dd929005f25afd60b63e93e4b08c6c9cd26e1990`
completed within the original operation limits. Each evaluated all 1,000 records
and matched the independent count oracle. The frozen evaluator's
`allFourCountsAdmissionPassed` remains **false**: all four reports contain two
context warnings. This report records the evidence without changing that result.

The [operational Decision](../../decisions/entries/retrieval-operational-qualification.yaml)
records the separate preparation, independent review and execution authorization.
This is the new `private-file-counts-v1` profile, not a rerun or replacement of
the exposed-context profile's 28 preserved refusals.

## Execution and native results

The fixed sequence was joint API, joint CLI, near-byte API, near-byte CLI.
API calls used `querySubjectFiles`; CLI calls used the actual bounded
`query-subjects.js`. Each used one operation through serialized output, including
its newline. The original query was current-view, direct
`assigned(S-000001)` across K/O/D. Fixtures, query, capacities, Node 24.19.0 and
the preserved js-yaml dependency were unchanged. No retry, additional control,
reader, timing sample or RSS measurement ran.

| Outcome | All four calls |
| --- | --- |
| Native exit / status | `0` / `complete` |
| Counts mode | `groups: null` |
| Strict / possible | 21 / 0 in each store |
| Excluded K/O/D | 312 / 312 / 313 |
| Evaluated K/O/D | 333 / 333 / 334 |
| Unevaluated | 0 |
| Coverage | Complete evaluation; no unknown predicates, unvalidated records or page truncation |
| Query diagnostics / stderr | Empty / empty |
| Context diagnostics | Two `missing-rules` warnings |
| Output | 4,831 bytes including the newline; API/CLI byte-identical within each fixture |

All eight pre/post custody checks passed. Main independently verified all 21
sealed receipt files and both API/CLI byte comparisons. API terminal telemetry
has no exception, operation failure or uncertain write; admitted and written
output counters each equal 4,831. CLI internal counters were not observable and
must not be inferred from API telemetry.

| Final API counter | Joint | Near-byte |
| --- | ---: | ---: |
| Source bytes | 19,036,453 | 33,422,552 |
| Document nodes | 473,985 | 475,317 |
| Document text units | 33,415,989 | 47,795,761 |
| Subject work | 6,310 | 6,310 |
| History-row work | 2,048 | 2,048 |
| Validation steps | 48,225 | 48,225 |

These are actual operation counters, not timing or memory measurements. Both
fixtures contain zero assignment-history events, rows and baselines, so this
experiment does not qualify assignment-history capacity.

## Warning interpretation

The warnings name absent `knowledge/_rules.yaml` and `ontology/_rules.yaml`:
rules-dependent surfaces have no input. The committed loader emits these as
warnings. The query context preserves loader diagnostics while independently
requiring a structurally valid model and successful Subject governance.

At the pinned source, `selectSubjectQueryRecords` explicitly selects by record
lifecycle without preflight; the query then validates governed assignments and
evaluates the direct membership predicate. This query does not consume those
store rules. The observations therefore establish complete recorded-membership
counts under the original limits, while the missing rules remain unavailable
for rules-dependent work. They establish neither record truth nor preflight
readiness. The frozen evaluator conservatively requires review for any context
diagnostic and remains false; no warning was suppressed and no pass criterion
was retroactively edited.

Source boundaries: `payload/engine/lib/load-stores.js` (`loadCatalogAndRules`),
`subject-query-context.js` (`loadSubjectQueryContext`) and `subject-query.js`
(`selectSubjectQueryRecords`, `querySubjectFiles`, `runSubjectQuery`), all in the
frozen `dd92900` runtime export.
Current P2 independently reviewed these pinned source paths and the four raw
receipts and concurred with this scoped interpretation. No product call or
rerun was needed for that review.

## Receipt custody

Artifacts remain at
`local-history:implementation`:

- `private-file-counts-dd92900-preparation-v2/` contains the corrected reviewed
  controller and complete frozen input manifest. Preparation v1 remains intact.
- `private-file-counts-dd92900-results-v1/` contains the four raw stdout/stderr
  pairs, API telemetry, invocation/custody records and sealed receipt manifest.

| Artifact | SHA-256 |
| --- | --- |
| Preparation freeze | `f0f5740163277cad8b6d762b92ac959ba4605975c240374f3ba5c44b674c60df` |
| Input manifest | `7ec1ed88e471e1c3e5e6ca77188d5c80e7d6ab474282397eabe7e4779be9e561` |
| Execution release | `e8980f9ddb750c7ede9fc321ba998ad5c110f61fa5e0e593ba94d09d6643eff7` |
| Results | `58687545974a5b569ee1c1b31724c3f184aee19841b6c9a91bdb4217c5a6f2c1` |
| Receipt manifest | `9c9b612030082a381054656714aeb0d62857818869cd411d34f5be993597ada3` |

This is counts-only evidence. Emitted record identities, strict source witnesses,
context enumeration, shared-interface admission, assignment-history capacity,
latency/RSS, held-out retrieval quality and full spec gates A–H remain separate
requirements. See [remaining acceptance](DECISIONS-AND-EVIDENCE.md#remaining-acceptance).
