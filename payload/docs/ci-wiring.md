# CI wiring — validators in CI, attribution on PRs

> Commands run from the **repo root** with the kit dir at its default name
> `unknown-knowledge/`; substitute your chosen name if it differs. The CI
> snippets below are honest templates: written to be correct, **not executed
> against every CI product** — adapt runners, images, and paths to your
> setup, then watch the first run.

The kit never wires CI at init (D-006) — CI systems churn; your pipeline is
yours. But at team scale CI stops being optional in practice: session-level
preflight is a sufficient gate for a small team, not for hundreds of
engineers. Wire the two validators in.

## What may gate, and what never does

- `engine/validate.js` and `engine/validate-values.js` are blocking-grade
  and MAY gate a merge. Exit codes: 0 = clean, 1 = findings, 2 = the check
  never ran. Fail the job on both 1 and 2 — **a check that never ran is a
  blocking defect, never a silent pass** (a non-zero exit fails the job by
  default in every system below, so the templates need no special casing).
- `engine/preflight.js` with no `--concepts` checks store health only — add
  it as a third gating step if you want the store verdict pinned in CI.
- `engine/audit.js` is advisory (never blocking): it drafts proposals for
  human review, and presenting it as a required check would flip the whole
  protocol from proposal-first to gate-first. Keep it out of CI. Its
  `--fail-on-findings` flag exists for a human's local run — never a CI
  default.

The engine needs Node ≥ 22 and its one library dependency, `js-yaml`,
resolvable in the checkout (see the seeded README) — the templates below
install dependencies for that reason. It reads your files lexically — it
never executes your code and never touches the network
(`docs/boundaries.md`) — so the jobs need no secrets, tokens, or extra
permissions.

## GitHub Actions

```yaml
# .github/workflows/knowledge-gates.yml — untested template, adapt.
name: knowledge-gates
on: pull_request
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci # js-yaml must resolve; use `npm install js-yaml` if you keep no lockfile
      - run: node unknown-knowledge/engine/validate.js --root .
      - run: node unknown-knowledge/engine/validate-values.js --root .
```

## GitLab CI

```yaml
# .gitlab-ci.yml fragment — untested template, adapt.
knowledge-gates:
  image: node:22
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm ci # js-yaml must resolve; use `npm install js-yaml` if you keep no lockfile
    - node unknown-knowledge/engine/validate.js --root .
    - node unknown-knowledge/engine/validate-values.js --root .
```

## Xcode Cloud

Xcode Cloud runs custom scripts from `ci_scripts/`; its images ship no Node
runtime, so the script installs one.

```sh
#!/bin/sh
# ci_scripts/ci_post_clone.sh — untested template, adapt.
set -e
brew install node
npm ci --prefix "$CI_PRIMARY_REPOSITORY_PATH" # js-yaml must resolve
node "$CI_PRIMARY_REPOSITORY_PATH/unknown-knowledge/engine/validate.js" --root "$CI_PRIMARY_REPOSITORY_PATH"
node "$CI_PRIMARY_REPOSITORY_PATH/unknown-knowledge/engine/validate-values.js" --root "$CI_PRIMARY_REPOSITORY_PATH"
```

## PR drift attribution (D-012) — whose findings are these?

Filtering validation down to the concepts a PR touched is rejected by
design: any gap in the reverse index (folder pointers, renames, module
adds/deletes) turns the filter into a false all-clear, which is worse than
no check. Attribution instead diffs **two honest whole-store runs** — the
finding set at the PR's merge-base against the set at HEAD. Both validators
emit stable, sorted JSON precisely so this diff means something.

```sh
git worktree add /tmp/kk-base "$(git merge-base HEAD origin/main)"

# Exit 1 just means findings exist — attribution wants the sets, not the gate.
node unknown-knowledge/engine/validate.js --json --root /tmp/kk-base > /tmp/base.json || true
node unknown-knowledge/engine/validate.js --json --root . > /tmp/head.json || true

# Right side only = drift this PR introduced; left side only = drift it fixed.
diff <(jq -S '.findings' /tmp/base.json) <(jq -S '.findings' /tmp/head.json)

git worktree remove /tmp/kk-base
```

Run the same pair with `engine/validate-values.js` for value drift. In a CI
gate, fail on findings the diff attributes to the PR rather than on the raw
exit code — the baseline may legitimately be red while the map catches up,
and a PR should answer for its own drift, not the backlog's.
