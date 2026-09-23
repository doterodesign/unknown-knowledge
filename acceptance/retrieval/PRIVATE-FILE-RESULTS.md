# Private-file results: verified witnesses, incomplete cross-store pages

The four released `private-file-results-v1` calls confirmed the source-based
prediction: counts are complete, but the shared explanation allowance permits
only five Decision results. Knowledge and Ontology result pages are empty.
All five emitted records match independently prepared identities and witnesses;
this does **not** complete cross-store or full strict-result witness coverage.

The runtime remains `dd929005f25afd60b63e93e4b08c6c9cd26e1990`. Only collection
changed from the [counts experiment](PRIVATE-FILE-COUNTS.md): API uses results
mode and the actual bounded CLI omits `--counts`. The original fixtures, query,
operation/query capacities, Node 24.19.0 and dependency bytes remain unchanged.
Current P2 reviewed the controller changes and independent expectations; main
verified syntax/custody and separately released exactly four untimed calls.

## Observed behavior

Every call exited 0 with native status `complete` and exact counts: 21 strict
and zero possible per K/O/D store, all 1,000 records evaluated. These completion
flags describe evaluation, not complete returned pages.

| Dimension | All four calls |
| --- | --- |
| Emitted strict Decision IDs | D-000001, D-000017, D-000033, D-000049, D-000065 |
| Knowledge / Ontology strict pages | Empty / empty |
| Possible pages | Empty |
| Explanation work | 4,090 of 4,096 nodes; 818 nodes per admitted explanation |
| Coverage | `pageTruncated: true`, `explanationsComplete: false` |
| Output | 215,340 bytes including newline, within the unchanged 262,144-byte allowance |
| API/CLI parity | Byte-identical within each fixture |
| Errors | Empty stderr; no API exception, operation failure or uncertain write |
| Diagnostics | The same two exact missing-rules warnings, retained under the prospectively reviewed disposition |

The ten-per-store page limit excludes eleven strict matches per store. The
shared explanation allowance then withholds five selected Decision candidates
and all ten selected candidates in each other store. Repeated complete governed
assignment outcomes are a material output cost. This observation motivates
reviewing lossless output factoring, not raising limits or dropping evidence to
declare the original query qualified.

Each emitted row was compared against independent source expectations for its
qualified identity, file/metadata, lifecycle, rank, ordered assignments, all
sixteen complete governed Subject outcomes and exact direct-membership predicate
witness. Historical authorizer bytes, canonical Decision/event digests and
activation bindings were independently established before execution. Twenty row
observations across four calls represent five distinct qualified identities,
not twenty independent records. Synthetic membership and warrant declarations
do not establish real-world source truth.

All five scoped assessment dimensions passed: host/output admission, exact
complete counts, emitted identity/witness correctness, expected withholding and
the exact known-warning disposition. The result explicitly keeps
`knowledgeOntologyEmittedWitnessCoverageComplete` and
`fullStrictWitnessCoverageComplete` false. The earlier counts evaluator's false
result is unchanged. No timing, retry, extra control or reader ran.

## Custody and remaining evidence

All eight pre/post custody checks passed. Main independently rehashed all 21
sealed receipt files and checked both API/CLI byte comparisons. API admitted and
written output counters both equal 215,340; CLI internal counters remain
unavailable. Source and validation counters match the counts experiment.
Assignment-history capacity, performance, retrieval quality and complete spec
gates A–H remain unqualified.

Artifacts are under
`local-history:implementation`:
`private-file-results-dd92900-preparation-v1/` contains the reviewed controller,
independent source builder and all thirty candidate expectations per fixture;
`private-file-results-dd92900-results-v1/` contains the sealed raw outputs,
telemetry, invocation records and receipt manifest.

| Artifact | SHA-256 |
| --- | --- |
| Controller freeze | `8397d70185f2fb54206374401850efa119e56e66f970c2b909e1ba0bfc716b57` |
| Input manifest | `d6144499621107bc0d4007592f95e3e23a502a623bea74a3c532d1f793cb642b` |
| Independent expectations | `ccc9ca60fa727e459cce069f57f86cbdacf1a948ea46dc37813665409cfcc3c6` |
| Execution release | `10c7ceb2587c40010407958323e0ce5ffbb5ffd12ad74e059e0a1dbba2eae33c` |
| Results | `1b44a2b8a039633deb7b13ab9cc640c43cd32d0e34ade9ad52c4f389c0dea3e8` |
| Receipt manifest | `0893f38c6777560f715b4f6ca25a91a7bf52f635d70e63c0991156b46c6f8f46` |

See the [operational Decision](../../decisions/entries/retrieval-operational-qualification.yaml)
and [remaining acceptance](DECISIONS-AND-EVIDENCE.md#remaining-acceptance).
