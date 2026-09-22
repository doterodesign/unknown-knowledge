# Private-file results v2: complete requested K/O/D pages

Four untimed calls at runtime `79c3efc0803963c6308ce483235c1d1d1d7f2b24`
completed once and passed their independent source checks. Each delivered ten
Knowledge, ten Ontology and ten Decision records with complete explanations.
The fixtures, query, page limits and operation capacities are unchanged from
the [earlier results experiment](PRIVATE-FILE-RESULTS.md). Native output version
2 shares complete assignment outcomes through query-local references; it does
not omit their evidence or increase limits.

| Observation | Each of four calls |
| --- | --- |
| Requested strict page | 10 records in each K/O/D store |
| Complete strict counts | 21 per store; zero possible |
| Evaluated records | 333 K, 333 O, 334 D; zero unevaluated |
| Exclusions | 312 K, 312 O, 313 D |
| Explanation nodes | 1,745 of 4,096 |
| Output bytes, including newline | 87,431 of 262,144 |
| Query-local assignment evidence | 16 entries, all independently checked |
| Coverage | Evaluation, ranking and explanations complete; page truncated |
| Transport | API/CLI bytes and parsed JSON identical within each fixture |
| Errors | Exit 0, empty stderr; no spawn, API or delivery failure |

The full strict result set is **not** delivered: the requested page contains ten
of each store's 21 matches. `pageTruncated: true` therefore remains correct.
Requested-page coverage and K/O page coverage pass; full strict-set witness
coverage remains false. Predicate unknowns and unvalidated records are zero.

The independent decoder validates native table qualifiers, original Subject IDs,
ordered references, full outcomes and actual serialized-node charging. Every
expanded emitted row matches the previously source-authored identity, metadata,
lifecycle, rank and witness expectations. The oracle does not supply omitted
output. Four repeated page observations are not 120 independent records.
Synthetic source declarations do not establish world/artifact truth.

Both API calls admitted and wrote exactly 87,431 bytes. Their source charges
were 19,036,453 and 33,422,552 bytes; document nodes 473,985 and 475,317; text
units 33,415,989 and 47,795,761. Both recorded 6,310 Subject validations, 2,048
history rows and 48,225 validation steps. CLI internal counters are unavailable.
The same two missing-rules warnings remain under the original scoped disposition;
query diagnostics are empty. No retry, extra probe, reader or timing sample ran.

## Custody and evidence

Main independently rehashed all 21 receipt files and checked both transport byte
comparisons and all four scoped assessments. All eight recorded before/after
custody checks passed: 1,829 runtime files (including 13 dependency files), two
1,008-file fixtures and 176 preserved evidence files. These are point-in-time
checks, not continuous monitoring. Earlier refusals, counts and results remain
unchanged.

Artifacts are under
`local-history:implementation`:
`private-file-results-79c3efc-preparation-v2/` holds the reviewed preparation;
`private-file-results-79c3efc-results-v1/` holds raw outputs, telemetry,
invocations and sealed receipts. Controller session 84053 completed with exit 0.

| Artifact | SHA-256 |
| --- | --- |
| Controller freeze | `7ab6658dc1e2f338751f9f87f82c17aa6f840c8721f526855d41d97615086422` |
| Input manifest | `d06aa554918e50f7d0061e62a0d2898db84064403b1e4b51bd5643d624e2f398` |
| Execution release | `453039f5f3a5a54e624c47a16798aeaa77f14138ff5ca47b94f27de4f6d0da6b` |
| Results | `cdac611dd3a556e27c3c7c5e6946084930498347cfe85ebea5a8225dd9597109` |
| Receipt manifest | `68aaab8880996c28fda4f920c95288ed6a2c6d7fd5e60c1549cd9f36ca997f29` |
| Joint API/CLI output | `7f17d92cf93f67b157cb20edf5ec26113035a0c0445dd7a12c6d3c3f4c2c2e8e` |
| Near-byte API/CLI output | `3b8adaaf5321f30f4265ed0a6e525f2f09dd66e5b17914dd7153b32acea77d6b` |

This closes the requested cross-store page/witness check for these fixtures.
It does not qualify performance, assignment-history capacity, context enumeration,
agent relevance, varied-corpus behavior or all spec gates A–H. See the
[operational Decision](../../decisions/entries/retrieval-operational-qualification.yaml)
and [remaining acceptance](DECISIONS-AND-EVIDENCE.md#remaining-acceptance).
