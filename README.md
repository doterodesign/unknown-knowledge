# unknown-knowledge

A free, open-source CLI that stands up a self-improving knowledge base in any
codebase, and a deterministic engine that keeps it honest.

**The map is never the fact.** The stores hold claims and pointers; your source
files hold the facts. The engine's only job is to diff the two and say exactly
where they disagree — so an agent reading the knowledge base is reading
something that was checked, not something somebody remembered.

Nothing here is a service. There is no runtime, no daemon, no network call, and
no update channel. Everything is YAML and JavaScript files in your repo,
branched and merged by your normal PRs.

## Quickstart

> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.


The 3.0 pilot is available explicitly with
`npx unknown-knowledge@3.0.0-rc.1 init`. The stable `latest` channel remains
2.1.0. Existing installations should follow the
[migration guide](https://github.com/doterodesign/unknown-knowledge/blob/main/docs/migration-3.md);
init refuses existing roots and does not overwrite client-owned records.

```bash
cd your-repo
npx unknown-knowledge init          # seeds unknown-knowledge/ and an agent wrapper
npm install --save-dev js-yaml      # the engine's one runtime dependency
```

Then run `/knowledge-bootstrap` in your coding agent. Phase 2 surveys the repo,
proposes Anchor candidates, and you approve each Concept. Nothing is captured
automatically — a fact nobody approved is a fact nobody checked.

## What you get

Three governed YAML stores, split by **truth anchor** — who is allowed to say a
thing is true:

| Store | Holds | Anchored to |
| --- | --- | --- |
| `ontology/` | what the system *is* | your source files |
| `knowledge/` | what the team *knows* | cited evidence |
| `decisions/` | what was *chosen*, and why | the team |

An **Ontology Concept** names a closed set of values and points at the file that
owns them. An **Extractor kind** re-derives that set by reading the file
lexically, and the value validator diffs the two. When someone adds a case to an
enum and forgets the store, the diff says so.

Thirteen extractor kinds ship — across TypeScript, Swift, JSON, YAML,
`.strings`, and newline-delimited lists. Twelve of them the survey map can
propose for you by signature; the thirteenth is reachable only when a human
names it, because "a file of lines" describes every text file ever written.

They **refuse rather than guess**: a kind that meets a spread, a
computed key, or a re-export barrel raises a hard error, because a confident
wrong parse is a false all-clear. What it could not read is recorded in
`logs/misses/` for a human to decide about.

## The engine

> Packaging stage 6/7, version `3.0.0-rc.7`. This stacked prerelease is for review and new-installation development. No release or customer migration is authorized.

Eighteen seeded command-line surfaces. JavaScript with JSDoc types, zero build step.

| Command | Purpose |
| --- | --- |
| `validate.js` | structural validation |
| `validate-values.js` | source value validation |
| `preflight.js` | record trust and freshness checks |
| `resolve.js` | record and path lookup |
| `survey-map.js` | bounded repository survey |
| `audit.js` | reverse coverage audit |
| `log-entry.js` | operational log entries |
| `ingest.js` | document ingestion |
| `phoenix.js` | governed reclassification |
| `derive.js` | disposable browse artifacts |
| `commit-check.js` | staged store gate |
| `reverse-staged.js` | staged attribution |
| `subject.js` | Subject metadata lookup |
| `query-subjects.js` | governed Subject query |
| `subject-view.js` | Subject tree, route and context views |
| `intent-plan.js` | intent validation and execution |
| `migrate-identity.js` | offline identity inventory |
| `invoke.js` | shared request-file API invocation |

Engine commands run with `node payload/engine/<command> --root .` in this repository. Installed paths use `<kit-root>/engine/`. Check each command’s help and the protocol before use.

### Exit codes are a contract

Validation surfaces use three codes, and agents ride them:

| Code | Means |
| --- | --- |
| `0` | the check ran and found nothing |
| `1` | the check ran and **found something** |
| `2` | the check **did not run** — an engine failure |

## Guarantees

- **The engine never executes your code** (D-000014). No `eval`, no importing your
  modules, no spawning your build. Parsing is lexical; subprocesses invoke
  Git for tracked-file navigation, raw snapshots, and isolated candidate object
  preparation, or Node for fixed checks from the captured trusted installed
  engine. Candidate code is never used as the validation runtime. Preparation
  and validation never advance a ref or change the user's index/worktree;
  retained check evidence does not certify publication.
- **No network, ever.** Nothing is uploaded, and nothing is fetched.
- **Deterministic.** Same tree in, byte-identical output out. Dates are
  injected, never read from the wall clock, so a report is reproducible from
  its inputs.
- **Nothing ships by omission** (D-000007). An explicit manifest lists every file
  `init` seeds; a file it does not name is never copied.

## Hooks — the protocol, enforced mechanically

Two POSIX-sh hooks seed under `hooks/`: `pre-commit` runs both whole-store
validators through `engine/commit-check.js` before a commit exists, and `reverse-lookup` invokes `engine/reverse-staged.js`
over your staged diff, so the knowledge governing the files you touched
surfaces without anyone remembering to ask. Each is a thin wrapper — it invokes
one engine command and exits with its code, unchanged — and neither reads a
bypass variable, because a hook with an off switch enforces nothing.

The gate reports each check by name. It exits 0 only when both checks pass;
findings exit 1, and a failed or never-run check exits 2 even if the other check
is clean or has findings. Both checks always run over the whole store (D-000012).
Reverse lookup is advisory attribution; its results never restrict validation
or prove that the agent updated the store. It reads NUL-delimited Git records
and includes additions, modifications, type changes, deletions and both paths
of detected copies and renames. Detection uses 50% similarity and a fixed
1000-candidate exhaustive-search limit; above it, Git may report additions and
deletions instead of a rename/copy relationship. Local Git limits cannot
change these settings. Each complete path is passed to the resolver
with `--path=value`, preserving spaces, commas, quotes, tabs and newlines.

Attribution prints a `staged attribution: candidate <tree-id>` section followed
by resolver JSON, then a `before <tree-id>` section for HEAD when it exists.
Both sections use the same complete path set; each reports only that snapshot's
own pointers. A staged pointer repair therefore cannot erase the old path's
previous governance. Before evidence is historical navigation, not a current
trust verdict. An empty staged diff produces no output and exits 0, including
an unborn repository with nothing staged. Git, resolver and snapshot failures
exit 2; attribution may be incomplete and must not be treated as a clean lookup.
These lexical checks detect store and vocabulary drift. Application behavior
remains the application's test suite's responsibility.

The gate validates an isolated copy of the Git index. Source, stores and
repo-relative rules come from the same candidate, so unstaged repairs cannot
hide broken staged bytes and unstaged edits cannot introduce findings. It
never stashes, resets or restages local work. Installed engine code, schemas
and runtime dependencies stay on the host; untracked evidence is never copied
into the candidate. Snapshot preparation and cleanup failures block with exit 2.
Real installed-hook tests check partial staging, committed bytes and cleanup.

Git submodules, symlinks that escape the snapshot, and non-UTF-8 path names
or symlink targets are refused explicitly when their evidence cannot be represented faithfully. It reads raw blobs without
checkout filters or archive attributes. Install required runtime dependencies
before committing; keep whole-store checks on the actual merge candidate in CI.

They **seed but do not install**: `init` never writes `.git/`, so wiring them is
your act, not the kit's. Git runs a hook only if it is executable, and the copy
engine seeds bytes rather than modes — so set the bit when you wire it:

```sh
chmod +x unknown-knowledge/hooks/*
ln -s ../../unknown-knowledge/hooks/pre-commit .git/hooks/pre-commit
ln -s ../../unknown-knowledge/hooks/reverse-lookup .git/hooks/prepare-commit-msg
```

Note the second symlink's name. Git runs a hook only if its filename is one of
the events git fires, and `reverse-lookup` is not one of them —
`prepare-commit-msg` runs after the index is staged and before the message
editor opens, which is when attribution is still actionable. (Git passes that
hook the message file and source as arguments; the script ignores them and
reads the staged diff itself.) The same rule bites harder under
`core.hooksPath` pointed at the seeded directory: git looks there for
event-named files only, so `reverse-lookup` would sit beside `pre-commit` and
never fire. Under that wiring, call it explicitly from your `pre-commit`.

## Seeded once, then owned

After `init`, the seeded directory has no relationship to this kit (D-000001).
There is no update channel and there never will be one. You own the engine, you
can read it, and you can change it — it is JavaScript, not a binary.

The seed stamps the kit version into `unknown-knowledge/kit.manifest.yaml`. That
stamp is a **birth certificate, not a dependency pin**: it records the schema
revision, extractor-kind set and fixture vintage the seed was born with. It
never implies an update channel — upgrading an existing seed is deferred by
design.

## Versioning

Semver, with kit-specific semantics (D-000021): **MAJOR** is a store
schema-version bump or a breaking change to the engine CLI contract (commands,
flags, exit codes, output consumed by wrappers); **MINOR** is new extractor
kinds, new engine surfaces, or a new fixture vintage; **PATCH** is fixes and
documentation. Changes are tracked in [CHANGELOG.md](CHANGELOG.md) (Keep a
Changelog form).

## Reading further

- [Delivery stages and availability](docs/pr-delivery/README.md)
- [Contribution rules](CONTRIBUTING.md)
- [Protocol](payload/protocol/AGENTS.md)
- [Decisions catalog](decisions/_catalog.yaml)
- [Migration status](docs/migration-3.md)

## License and contributing

Licensed under [Apache-2.0](LICENSE) (D-000020); redistribution carries the
[NOTICE](NOTICE) file. Contributions are welcome — especially new extractor
kinds, and field reports of anchors the extractors could not read. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the gate (parser + fixture + demo run,
D-000005) and PR expectations.

Every PR includes a package version increment, changelog notes, decision
traceability and updates to affected documentation and agent instructions.
Unreleased versions in the repository are not necessarily available on npm;
see [publishing](docs/publishing.md) for the separate release process.
