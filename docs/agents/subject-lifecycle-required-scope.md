> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Subject lifecycle completion scope

This clarification follows a main/P2/P7 audit of the authoritative r3 §4
lifecycle table and §12B acceptance requirements. It corrects an implementation
team interpretation; it does not declare unfinished behavior complete or remove
an explicit specification requirement. The existing
[reconsideration Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml)
records the correction and preserves the earlier interpretation.

| Requirement | Evidence and remaining work |
| --- | --- |
| Proposal rejection/suppression | The [suppression profile](ucs-1240-subject-proposal-suppression-publication.md) implements reviewed publication that retains the proposal, refused meaning/term and reason. It preserves canonical subjects, records and query memberships; the selected proposal remains ineligible. Its guide records scoped verification and integration evidence. |
| Warranted reversal | A new effective Decision cites the retained prior refusal and changed evidence. The [reconsideration publication path](ucs-1240-reconsideration-publication.md) has actual SHA-1/SHA-256 publication coverage. Native history tests require the original refusal, new Decision and changed material; a new spelling alone cannot reverse refusal. |
| Ordinary fresh activation and unrefused proposal promotion | The [creation profile](ucs-1240-subject-creation.md) implements actual source, native allocation, reviewed warrant, unchanged prior identities/history, fresh validation and publication. Scoped verification and integration evidence are recorded in its guide. |
| Union/broadening | The creation profile publishes a fresh identity with the changed meaning and warrant. Original subjects remain unchanged and active; no automatic equivalence redirect or assignment transfer. Actual nested SHA-256 publication coverage exercises this path. |
| Same-meaning metadata and graph changes | The [implemented metadata profile](ucs-1240-subject-metadata-publication.md) preserves identity and unchanged meaning where required, validates the graph, exposes actual reach/query effects and completes reviewed publication. Its scoped receipts do not prove every remaining acceptance requirement. |
| Equivalent merge, split and retirement | Prove the explicit lifecycle rules and required acceptance cases using their actual implemented profiles; retain documented refusals and exact coverage limits. |

R3's rejection/suppression row explicitly preserves a **proposal**; its reversal
rule requires a new Decision and changed evidence. Neither that row nor §12B
requires suppressing an already-active canonical subject and later restoring
that same ID. Those operations remain unsupported. Treating them as mandatory
was introduced by the team's proposed Decision at `f246a40`, then repeated at
`6166a6a`; no separate user authorization for that expansion was identified in
the audited task/specification. This clarification supersedes that interpretation.

Likewise, "broader merge variants" is not an unbounded completion requirement.
Every explicit spec scenario must be mapped to evidence. The
[repeated-merge implementation](ucs-1240-repeated-equivalent-merge.md) now admits
absorbing a prior survivor with preserved, verified inbound equivalence redirects.
Actual sequential publication proves A→B followed by B→C without rewriting A or
its history. Other graph incidences retain their documented refusals; this bounded
proof does not introduce arbitrary graph mutation or waive its governance.

Internal operation profiles, standalone inventory endpoints and one public
mutation command per lifecycle verb are implementation choices, not additional
requirements. Required publication and acceptance must still be demonstrated
through the supported reviewed workflow. Historical test receipts keep their
original scope and cannot be promoted to whole-lifecycle evidence.

A subsequent read-only Gate B audit confirmed the reversal mapping in
[history tests](../../tests/subject-reconsideration-history.test.js) and
[publication tests](../../tests/subject-reconsideration-publication.test.js).
The fixture commits an actual suppressed before-state; requiring an additional
sequence that chains the newer suppression worker into this existing reversal
test would add a test permutation, not close a missing specification behavior.
This finding reuses the retained verification evidence and does not certify
whole-project acceptance. Chain-extension publication has its own independent
and integrated evidence in the repeated-merge guide.
