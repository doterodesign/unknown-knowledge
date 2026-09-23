# Semantic metadata review package

This package records source-derived proposals for all 82 provisional record
attributions and independent cross-review. It does not allocate records, promote
proposals, approve subjects, implement applicability, or provide executable
fixtures. The factual source freeze and its 48 passage judgments are unchanged.

Each `proposal-*.json` is the metadata author's final artifact, copied unchanged.
Each `crossreview-*.json` is a different reviewer's source check, also unchanged;
it records the findings made before correction. Author resolution notes and the
package manifest identify the corrected artifact. Absolute paths in those files
record their original review context; use the package's relative filenames for
the retained copies. Original reviewers did not inspect runtime outputs, ranks,
private files, or held-out cases.

Lifecycle fields in these proposals describe source-derived standing under a
provisional record kind. `null` preserves an unresolved mapping; it is not a
runtime lifecycle value. `proposedLifecycle` is a representation proposal, not
approval. In particular, an accepted audit does not inherit its subject's active
state, and an accepted correction is not automatically a promoted Knowledge
record. Source review, record verification and subject governance remain separate.

The proposals retain missing classifications and unknown applicability, contextual
aliases in independently owned registries, and separate component scopes for
multi-topic records. Recorded topic conjunction does not establish a joint claim.
Partial VIP supersession does not retire ordinary-ticket rules. Source-attribution
IDs do not prove runtime allocation, especially for proposal-only artifacts.

`adjudication.md` proposes how to settle the remaining representation decisions.
Before materialization, P2 governance review and fixture curation must establish
record kind/lifecycle, proposal identity handling, warranted local subject
definitions and parent relations, deliberate empty versus absent assignments,
scope representation, and actual retained review/capture evidence. Then review
record-level grades and exact candidate expectations against those actual records.
Support/governance records consume trial budgets and need explicit judgments.

The current P4 applicability profile is still pending. These semantic scope
proposals must not be passed off as supported executable filters. No query,
reader, retrieval-improvement or full-acceptance result follows from this package.
