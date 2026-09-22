> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

This contract includes final design and historical checkpoints. See [stage availability](../pr-delivery/README.md) before using an operation; internal checks do not supply a publication workflow.

# Bounded candidate ref transaction

`compareAndSwapCandidateRef` in `payload/engine/lib/candidate-ref-transaction.js`
is a low-level Git primitive. Its `committed` outcome certifies only the ref
transaction. It does not inspect validation evidence, authenticate a reviewer,
run impact policy, merge Knowledge, or authorize domain publication. The final
publisher must satisfy those separate gates before calling it.

The closed input is:

```js
{
  repoRoot,
  source: { ref, expectedCommit },
  output: { ref, expectedCommit: null /* absent */ },
  candidateCommit,
  limits: {
    maxOutputBytes,
    maxCommandMilliseconds,
    maxTransactionMilliseconds,
    maxWorktrees
  }
}
```

All limits are explicit positive safe integers. Millisecond limits fit Node's
32-bit timer range. `maxOutputBytes` bounds combined stdout/stderr for each
read command and for the whole interactive transaction. The command limit
bounds each probe and acknowledgement wait; the transaction limit includes
all preflight, lock acquisition, final checks and acknowledgement cleanup.
The worktree limit applies to both complete inventories.

The source is a full `refs/heads/` ref with ASCII alphanumeric-led path
components containing only alphanumerics, periods, underscores and hyphens,
also accepted by `git check-ref-format`. Output is exactly
`refs/unknown-knowledge/candidates/<lowercase-v4-uuid>`. Both must be direct.
The candidate must have exactly the source as its raw commit parent; grafts and
revision-walking overrides cannot supply that proof. Source, candidate and an
existing expected output must be actual commits with
full lowercase OIDs in the repository's SHA-1 or SHA-256 format. The repository
argument must resolve to its actual worktree root. Bare repositories are not
supported by this slice.

The implementation uses fixed `/usr/bin/git`, a fixed minimal environment,
disabled reference-transaction hooks and replacement/lazy-fetch mechanisms.
It never invokes client code or alters the user's index, working files or
source ref. Git must support `show-ref --exists` and transactional
`update-ref --stdin -z` (tested with Git 2.50.1).

One interactive `update-ref --no-deref --stdin -z` transaction verifies the
source and creates/updates output with its expected old value. After `prepare`
acknowledges ref locks, directness and the complete worktree HEAD inventory
are checked again before `commit`. This is necessary because Git's `verify`
accepts a symbolic ref that resolves to the expected OID even with
`--no-deref`. Missing, prunable or unrecognized worktree HEAD evidence refuses.
The atomic guarantee covers source/output refs. Arbitrary concurrent manual
HEAD rewrites and worktree creation outside this protocol are not globally
locked.

Results contain `outcome`, a static `code` (null on clean completion), and the
original source/output/candidate tuple for valid inputs:

- `not-committed`: no commit command was sent, or preflight refused.
- `committed`: the actual transaction acknowledged `commit: ok`. Later
  cleanup failure may add a diagnostic code; it never triggers rollback.
- `unknown`: commit was attempted without its exact acknowledgement. The
  original tuple is retained for reconciliation; there is no compensating
  ref rewrite. A later output equality check does not prove this transaction
  committed.

Malformed input returns `not-committed` without echoing unvalidated input.
Unexpected programming errors propagate. Tests use real temporary Git
repositories and intercept Node's built-in process streams for process-loss
and acknowledgement-loss controls; the production API has no test callback
or caller-selected executable.
