> Packaging stage 4/7, version `3.0.0-rc.5`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Single-Subject allocation comparison

The fixed `validateSubjectCreationAllocation` export in
[`subject-allocation.js`](../../payload/engine/lib/subject-allocation.js) proves
that a candidate ledger is exactly the native allocation of one fresh Subject.
The [proposed reconsideration Decision](../../decisions/entries/suppressed-subject-reconsideration.yaml)
records the reason for this reusable creation primitive. It is not itself a
reconsideration, activation, reservation or publication owner.

```js
validateSubjectCreationAllocation(
  { beforeIdentity, candidateIdentity, subject, publication },
  { limits: { maxLedgerRows }, operationBudget }
)
```

Input and option objects are closed own-data objects. `subject` must be an exact
canonical Subject ID. `maxLedgerRows` is an explicit nonnegative safe integer;
there is no caller-selected count or policy. The owner derives `publication`
from its operation ID and actual selected registry review reference. This pure
comparison does not authenticate that external ownership.

The helper authenticates and asserts the shared operation allowance before
inspecting nested ledgers. Both ledgers require own enumerable data allocation
arrays. It admits their complete lengths B+C before document guards or planning.
One-short admission refuses with zero admitted work; later refusal retains the
admitted population `{ledgerRows:B+C,subjects:1}`. These are per-invocation
population observations, not cumulative charges or measured planner slots.
The valid native scan bound is mathematically `min(999999,B+1)`.

After admission, the same allowance guards both identity documents, the one-ID
array and publication. Native `planAllocations` runs exactly once. Both its IDs
and entire resulting ledger must match the supplied candidate. Prior allocation
order, states, publications, namespace, lineage and K/O/D rows stay exact.
Cancelled, retired and unloaded occupied IDs are not reusable. There is no
second occupancy count, generic transition pass or duplicated allocator.

The result has exactly `ok`, `publicationReady`, `allocation`, `resources` and
`diagnostics`. `publicationReady` is always false. Successful `allocation` has
six fields: `publication`, `ids`, `beforeIdentityDigest`,
`candidateIdentityDigest`, `occupied` and `remaining`. Failure leaves allocation
null. The resource report has `accountingBasis`, `limits`, `used` and `failure`;
its basis is `per-invocation-admitted-populations`.

Fixed wrapper codes are `invalid-subject-creation-allocation-input`,
`subject-creation-allocation-budget` and `subject-creation-allocation-mismatch`.
Native refusal codes, diagnostics and exhaustion counts remain native. Authentic
document-budget and canonical errors retain their existing codes. The creation
guard phases are `subject-creation-before-identity`,
`subject-creation-candidate-identity`, `subject-creation-subjects` and
`subject-creation-allocation-publication`.

The same module privately shares comparison mechanics with the fixed split
export. [`subject-split-allocation.js`](../../payload/engine/lib/subject-split-allocation.js)
re-exports that identical function. Split still requires at least two successors
and retains its old signatures, messages, codes, phases and counter keys. No
caller can supply an internal profile or replace the planner.

## Validation evidence

The new [creation tests](../../tests/subject-creation-allocation.test.js) use
literal expected ledgers. They cover empty and gapped ledgers, mixed K/O/D and
occupied tombstones, exact/one-short admission, whole-ledger tampering, canonical
spelling, publication reuse, own-data/getter boundaries, authentic sticky
allowances, partial admitted failures and shared split compatibility. A real
999,998-occupied ledger successfully allocates S-999999; the next request against
the full ledger retains native occupied 999999 / remaining 0 without proof.

- Actual initial RED: missing new module, 0/1, exit 1, 26.620208 ms;
  `local-history:unknown-knowledge-subject-creation-allocation-red.log`.
- Initial creation control plus existing split regression: 19/19, exit 0,
  356.381792 ms;
  `local-history:unknown-knowledge-subject-creation-allocation-basic.log`.
- Completed expanded creation plus unchanged split regression: 42/42, session
  18118 closed exit 0, 8317.756958 ms;
  `local-history:unknown-knowledge-subject-creation-allocation-focused.log`.

Exact focused command:

```sh
PATH=local-history:bin node --test tests/subject-creation-allocation.test.js tests/subject-split-allocation.test.js
```

These tests establish the primitive and split compatibility. Historical
reconsideration, actual Git ownership, ordinary-consumer evidence propagation,
retained workers, fresh review and publication remain separate dependent work.
Native identity, governance, runtime and CAS implementations are unchanged by
this slice. Main owns shared documentation, version reconciliation and broader
consumer integration evidence; no commit or publication is performed here.
