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

Eleven command-line surfaces. JavaScript with JSDoc types, zero build step, one
dependency (D-022).

| Command | Answers |
| --- | --- |
| `validate.js` | is the store structurally sound? |
| `validate-values.js` | do the Concepts still match the code they point at? |
| `commit-check.js` | do both whole-store validators pass the commit gate? |
| `preflight.js` | which Concepts may this agent trust, right now? |
| `resolve.js` | what does the store know about these terms or paths? |
| `survey-map.js` | what is in this repo, and what could not be surveyed? |
| `audit.js` | what looks like knowledge but was never written down? |
| `log-entry.js` | append a finding, miss or gap — never by hand-editing YAML |
| `ingest.js` | normalize a document (md, txt, html, pdf) to one intermediate representation |
| `phoenix.js` | apply a phoenix event: re-file a drifted subtree in bulk, in full or not at all |
| `derive.js` | regenerate the derived layer: plural browse trees, call numbers, resolution index |

### Exit codes are a contract

Every surface obeys the same three codes, and agents ride them:

| Code | Means |
| --- | --- |
| `0` | the check ran and found nothing |
| `1` | the check ran and **found something** |
| `2` | the check **did not run** — an engine failure |

The distinction between `1` and `2` is the load-bearing one. An agent that reads
`1` quarantines the affected Concepts and continues. If a crashed command could
exit `1`, that agent would walk straight past a check that never happened. So a
crash always exits `2`, and a test enumerates every surface, forces a bug into
each, and proves it.

The reverse audit is advisory: its findings are proposals for human review, and
never a gate. A human may opt in with `--fail-on-findings`, and that is never a
shipped CI default.

## Guarantees

- **The engine never executes your code** (D-014). No `eval`, no importing your
  modules, no spawning your build. Parsing is lexical; the one subprocess it
  runs is `git ls-files`.
- **No network, ever.** Nothing is uploaded, and nothing is fetched.
- **Deterministic.** Same tree in, byte-identical output out. Dates are
  injected, never read from the wall clock, so a report is reproducible from
  its inputs.
- **Nothing ships by omission** (D-007). An explicit manifest lists every file
  `init` seeds; a file it does not name is never copied.

## Hooks — the protocol, enforced mechanically

Two POSIX-sh hooks seed under `hooks/`: `pre-commit` runs both whole-store
validators through `engine/commit-check.js` before a commit exists, and `reverse-lookup` runs the `--paths`
lookup over your staged diff, so the knowledge governing the files you touched
surfaces without anyone remembering to ask. Each is a thin wrapper — it invokes
one engine command and exits with its code, unchanged — and neither reads a
bypass variable, because a hook with an off switch enforces nothing.

The gate reports each check by name. It exits 0 only when both checks pass;
findings exit 1, and a failed or never-run check exits 2 even if the other check
is clean or has findings. Both checks always run over the whole store (D-012).
Reverse lookup is advisory attribution; its results never restrict validation.
These lexical checks detect store and vocabulary drift. Application behavior
remains the application's test suite's responsibility.

**Current limitation:** the gate reads the working tree, not an isolated staged
snapshot. It does not provide partial-staging safety: unstaged repairs can hide
invalid staged content, and unstaged defects can block valid staged content.
Installed-hook behavior is covered by real Git commit tests in the kit.

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

After `init`, the seeded directory has no relationship to this kit (D-001).
There is no update channel and there never will be one. You own the engine, you
can read it, and you can change it — it is JavaScript, not a binary.

The seed stamps the kit version into `unknown-knowledge/kit.manifest.yaml`. That
stamp is a **birth certificate, not a dependency pin**: it records the schema
revision, extractor-kind set and fixture vintage the seed was born with. It
never implies an update channel — upgrading an existing seed is deferred by
design.

## Versioning

Semver, with kit-specific semantics (D-021): **MAJOR** is a store
schema-version bump or a breaking change to the engine CLI contract (commands,
flags, exit codes, output consumed by wrappers); **MINOR** is new extractor
kinds, new engine surfaces, or a new fixture vintage; **PATCH** is fixes and
documentation. Changes are tracked in [CHANGELOG.md](CHANGELOG.md) (Keep a
Changelog form).

## Reading further

- [CONTEXT.md](CONTEXT.md) — the domain glossary. Start here.
- [decisions/](decisions/) — the kit records its own decisions, in the same
  format it asks you to use. It eats its own cooking.
- [docs/publishing.md](docs/publishing.md) — release and supply-chain process
  (npm provenance, 2FA).

## License and contributing

Licensed under [Apache-2.0](LICENSE) (D-020); redistribution carries the
[NOTICE](NOTICE) file. Contributions are welcome — especially new extractor
kinds, and field reports of anchors the extractors could not read. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the gate (parser + fixture + demo run,
D-005) and PR expectations.
