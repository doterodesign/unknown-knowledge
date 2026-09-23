# Reading versioned native query evidence

Native query output version 2 changes representation, not eligibility or truth.
`intent-host.js` accepts a closed v2 branch report and verifies its qualified
`assignmentEvidence` table and every row's ordered assignment references. It
accounts each emitted resolved Subject's metadata, including outcomes used by
prior completed branches when a later branch fails. Record metadata exposure
remains separate from full-record/source reads. Unmarked historical v1 reports
retain a separate explicit decoder for inline `assignmentSubjects`; unknown
versions or mixed v1/v2 fields refuse before delivery.

The v2 decoder rejects missing references, unused table entries, foreign
namespace/policy, mismatched original IDs and malformed resolution chains.
This is transport shape/exposure accounting, not independent proof of governance
or source truth. The source-reading witness tests check full Subject/warrant and
record content against retained original bytes, and corruption controls must fail.
See [the native contract](../../docs/agents/ucs-1237-subject-query.md#lossless-output-version-2)
and [the decision](../../decisions/entries/lossless-subject-query-output.yaml).

Each query/intent branch owns its evidence table. Do not flatten branches, share
tables across captures, expand rows while claiming compact byte cost, or interpret
complete explanations as an untruncated page. Whole delivered bytes still count,
including repeated delivery and wrapper copies. Pinned historical runtimes,
controllers, operational receipts, independent expectations and trial results
remain unchanged. Updating this decoder does not execute a reader trial or
requalify any existing workload.
