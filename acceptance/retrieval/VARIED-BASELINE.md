# Varied fixed-plan baseline

At runtime `79c3efc0803963c6308ce483235c1d1d1d7f2b24`, the reviewed controller
executed exactly 60 untimed top-level calls once: 40 baseline API queries,
eight exact replays, eight contexts and four CLI representatives. Process
73773 exited 0. The evaluator passed **39/60**, so the baseline is **not fully
qualified**. Controller completion is separate from acceptance.

All 21 failed expectations are `unavailable-store` refusals at `/stores`:
15 baseline queries, three replays and three contexts for cultural-research,
professional-services and cedar-holding explicitly selected absent Ontology
stores. Spec r3 §6 requires an unavailable/incomplete result for a request
requiring an unavailable store. The successful-baseline expectations were
incorrect; these results do not justify changing the engine to silently omit
an explicitly selected store. Preserve the frozen failed assessments.

The 39 passing assessments comprise 32 queries with source-verified complete
requested pages and full candidate availability, five contexts with complete
known-candidate counts but incomplete enumeration, and two expected refusal
controls. Five completed contexts report 32 internal query calls; three refused
contexts have unavailable query-call accounting. The registered 52 internal
calls were conditional, not 52 observed completed calls.

All ten replay/API-CLI comparisons have identical native bytes and JSON, but
three pairs contain refusals and fail their successful-result checks. Equality
does not establish semantic success. All 120 before/after custody checks passed.
Main independently rehashed all 299 receipt files and checked these dimensions.
No retries, timing samples, reader sessions or growth calls occurred.

Results reside at
`local-history:varied-baseline-79c3efc-results-v1`.

| Artifact | SHA256 |
| --- | --- |
| `results.json` | `2639b5f0425f3616e024b9ed55d00bbd9db92fced17e9e5151e75e21be515c41` |
| `receipt-manifest.json` | `6ff3bfebbde53f71f81da6ba309db7998b2a056913a1a3ec63847c7d4d2c5926` |
| Reviewed preparation freeze | `41f82edb886ef42f2ca122c01c6181611e4645c8fed0a2bb385b35d53f0343e6` |
| Exact execution release | `12f68dbcfcc397c61c463a4e1b01d0448e33efe6bc66b8c136c7d49006839622` |

Main and the evaluator agreed preparation of a separate 21-call correction:
15 affected plans, three exact replays and three contexts, with 20 conditional
internal context queries accounted separately. Change only those plans' explicit
store selection to installed Knowledge/Decisions; derive expectations from
preserved sources before execution. Preserve predicates, lifecycle/scope,
ranking, limits, decoder and runtime. Reuse the 39 unaffected receipts. This
preparation authorization permits no product call before a separate exact
release and preserves the original 39/60 result. Broader agent quality, growth,
repair and operational qualification remain separate work.

## Reviewed store-selection correction

Main/P2 accepted the narrow correction, then the separately released controller
executed exactly 21 calls once at the same `79c3efc` runtime. Process 26084
exited 0 and **21/21 scoped assessments passed**. All 18 query calls exited 0
and delivered complete requested pages and full candidate sets. Three contexts
exited 2 as expected: known-candidate counts are complete, while unknown
assignments keep enumeration incomplete. Their observed internal query counts
are 7, 10 and 3, totaling 20. All three replay pairs match in native bytes and
JSON. All 42 before/after custody checks passed; all stderr streams are empty.
Main independently rehashed all 108 receipt files and checked these dimensions.

The results directory is the sibling `varied-loaded-stores-79c3efc-results-v1`
of the original results directory above.

| Artifact | SHA256 |
| --- | --- |
| Corrected `results.json` | `e924d1504c1595cfd73d1887f47304c3692d8b4788e96c21ae18fcab78254115` |
| Corrected `receipt-manifest.json` | `6b7233ee921446d6afa8637e6af3e5b892740d0321cb2ee56c18b8b5642658bf` |
| Corrected preparation freeze | `5f9bd27d8da5083acd7d3837b4cc5865c8b8d3d837d1c30f525ba1e08747fb1d` |
| Corrected execution release | `165db104fcff945da84a266204f23e4938b9db4182e55c0344b918f2bcb443ac` |

The 39 unaffected original passing receipts plus these 21 corrected receipts
cover the corrected 60-call plan with explicit provenance. This is a combined
coverage view, not a new all-green score for the original run. No original
query, refusal or assessment is rewritten. No retry, timing sample, growth
publication or reader session occurred. This proves the fixed executor/context
cases, not relevance, agent quality, complete discovery or operational scale.
