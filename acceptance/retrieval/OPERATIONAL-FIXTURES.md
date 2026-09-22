# Prebuilt operational qualification fixtures

`operational-fixtures.js` prepares synthetic data against immutable runtime
`cf41e1111a6f45836b905fec36f103d7e00880cf`. It exports
`prepareOperationalCase({ destination, runtime, shape, history, recordCount,
assignmentMode, bodyBytes })` and `planOperationalQueries(fixture)`.

Preparation verifies tracked runtime bytes, the actual dependency files, Node
and builder bytes before and after. It requires a fresh destination. Generation
is separate from all measured processes; its elapsed time is not query latency.

The three forest shapes each contain 256 subjects. Deep and mixed forests reach
16 parent edges. The mixed-store record total includes the supporting Decision;
1,000 dense records therefore have exactly 16,000 assignments. Missing and empty
assignments remain distinct. The limited-assignment shape permits complete
context enumeration under the explicitly declared 16-context cap.

With `history: true`, the builder performs one 256-row activation followed by
85 renames, 85 reparentings and 85 association changes. The 255 later events have
three changed rows each except the last, which has six: 1,024 rows total. Every
event validates against the actual prior disk model, retains complete before and
after states and records the validation result. Association targets and parent
changes are constructed to avoid dangling links, self links and cycles.

The baseline first activates the vocabulary with unassigned records, then
authors assignments. If assigning the supporting Decision changes its bytes,
both captures are retained: original bytes for the initial event and the newly
assigned current authorizer for later events. The baseline detached bootstrap
already has subject allocations in its prior ledger. It must not be relabeled
as a successful future two-model activation gate. That future workflow requires
a genuinely captured empty authority and fresh candidate allocations.

The query planner independently calculates T/F/U counts from authored record
assignments and parent edges, without calling P4. It records the exact candidate
universe and per-store counts for each selected context. It distinguishes unknown
assignments, the context cap and context AST overflow. Its 62/64-node conjunctions
use four nested groups, keeping every immediate branch below the accepted
16-child bound. The base queries are valid; adding context predicates can exceed
the unchanged inner limits. Above-envelope cases need separate expectations.

## Retained preparation evidence

Artifacts are under:

```text
local-history:implementation
```

- `operational-history-probe-v2.json`: 256 actual transition checks passed for
  12 mixed-store records, 256 subjects and 1,024 history rows.
- `operational-history-independent-replay-v1.json`: independent structural
  replay checked every prior/final state, changed field, atomic parent forest
  and related pair; maximum history depth is 16.
- `operational-builder-correctness-v2.json`: 27 query and 27 context checks across
  wide/dense, deep/unknown and mixed/limited fixtures matched independently
  declared counts, statuses and coverage.
- `operational-matrix-draft-v1/`: five 1,000-record fixtures, including 16-KiB
  bodies and 16,000 assignments. Its original wide 62/64-node ASTs exceed the
  branch-width profile and are retained as superseded plans.
- `operational-matrix-plans-v2/`: 45 corrected plans bound to those unchanged
  fixture manifests. Source and AST shape checks are retained separately.
- `operational-matrix-plans-v3/`: the same corrected ASTs with the exact context
  universe and independently calculated counts per context. The expanded
  `operational-builder-correctness-v3.json` checks every returned context count
  in all 27 query/context pairs across the three focused fixture shapes.
- `operational-builder-preparation-attempts-v1.json`: earlier preparation
  failures and corrections, each with a distinct retained destination.

These are preparation and correctness checks, not performance qualification.
Promotion/refusal and historical retirement inspection, the joint resource
boundary, near-limit actual read bytes, and above-ceiling behavior remain
separate matrix work. No production admission controls, supported maxima,
timing guarantees, filesystem publication or full paired acceptance follow.
