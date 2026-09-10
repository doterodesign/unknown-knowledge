# unknown-knowledge — this repo's knowledge base

This directory was seeded once by the [unknown-knowledge](https://github.com/doterodesign/unknown-knowledge)
kit and is now yours (D-001): three YAML stores that map the system
(`ontology/`, `knowledge/`, `decisions/`), a deterministic engine that checks
the map (`engine/`), and the agent protocol that runs the loop (`protocol/`).
There is no service, no runtime, and no update channel — everything is files
in this repo, branched and merged by your normal PRs.

One idea governs everything here: **the map is never the fact.** Stores hold
claims and pointers; your source files hold facts. The engine's job is to
diff the two and say exactly where they disagree.

> Commands run from the **repo root** with this directory at its default
> name `unknown-knowledge/`; substitute your chosen name if it differs.

## What you own vs. what was vendored

Everything is client-owned after seeding; the zone map in
`kit.manifest.yaml` records what an uninstall or audit needs to know — which
paths arrived from the kit and which your own loop produced.

| Zone | Paths | Meaning |
|---|---|---|
| seeded | `engine/`, `protocol/`, `schemas/`, `templates/`, `kit.manifest.yaml` | vendored at init: engine code, schemas, protocol markdown. Protocol conduct policy is explicitly yours to edit (see `docs/boundaries.md`) |
| client | `ontology/`, `knowledge/`, `decisions/`, `logs/`, `survey-scope.yaml` | your team's data. The kit shipped only empty scaffolding here; everything else was written by your loop |

## Running the gates

### Following replacements from an old result

Resolver JSON leaf projections include `superseded-by`, a stable array that
is empty when no loaded leaf directly supersedes the match. It appears on
query leaves, concept knowledge entry points, path knowledge, scope exclusions
and document gather rows. Each reference has these fields:

| Fields | Meaning |
|---|---|
| `id`, `notation`, `heading`, `file` | Accession and navigational metadata; notation is only a legacy display label |
| `stage`, `time`, `downranked`, `demotions` | The target's normal lifecycle and freshness metadata; `time.verdict` checks freshness only, not trust |
| `applies` | Declared jurisdictions, sorted; an empty array means universal |

This is an additive output contract under D-021. Existing fields and scores
retain their meaning. Authors write only `relates.supersedes` on the successor;
the loader derives the inverse from the store on every load, without reading
or storing reciprocal edges in `knowledge/derived/`.

References are deduplicated and sorted by accession. They contain no body,
excerpt, score or nested edges. Follow one hop at a time, keeping visited IDs
to avoid revisiting a cycle. Multiple successors remain explicit; order never
selects a winner. The predecessor remains available for historical requests.

Successor scope is declared metadata, not an applicability verdict. Compare
it with the request's jurisdiction; without a jurisdiction, establish whether
the target applies before selecting an answer. A scoped-out successor stays
visible as navigation and does not enter the ranked results merely because
it supersedes a match. Draft and stale successors keep their normal flags.
Run `preflight.js --leaves <IDs>` for consulted targets and read their cited
sources. Existing health gates report dangling references; structural
`ref-cycle` findings quarantine every leaf in a supersession cycle.

### Validation commands

The engine is plain Node (≥ 22, no build step) with one library
dependency, `js-yaml`, resolved from your repo like any other package: if
your repo does not already carry it, run `npm install --save-dev js-yaml`
once.

The blocking-grade checks all take `--root` as the **repo root** and share
one exit-code contract: 0 = clean, 1 = findings/quarantines, 2 = the check
never ran. **A check that never ran is a blocking defect, never a silent
pass** — treat exit 2 as a stop, not a shrug.

```
node unknown-knowledge/engine/validate.js --root .          # structure: ids, refs, pointers
node unknown-knowledge/engine/validate-values.js --root .   # enumerated values vs. source
node unknown-knowledge/engine/preflight.js --root .         # store health + per-concept verdicts
```

`engine/audit.js` is different in kind — advisory (never blocking). It
proposes draft concepts for anchors the map does not cover yet; a human
reviews every draft. Run it on the steward cadence, never as a gate
(`docs/steward-guide.md`).

## Reverse lookup for complete filenames

Use one `--path` per filename to find the concepts and knowledge leaves that
govern it:

```sh
node unknown-knowledge/engine/resolve.js --root . --path 'src/a,b.ts' --path 'src/my file.ts' --json
```

Both `--path value` and `--path=value` work. Use the equals form for a name
beginning with `--`, for example `--path=--draft.ts`. Each value stays one
complete path: commas, quotes, tabs, newlines, Unicode, leading/trailing
whitespace and POSIX backslashes are literal data. Paths still use POSIX
normalization for `.`, `..`, repeated `/` and absolute paths relative to
`--root`. Complete normalized paths are deduplicated and sorted.

Programmatic callers should pass an argument array with no shell. This
example assumes `repoRoot` and `changedPaths` contain the root and filename
strings already obtained by the caller:

```js
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(process.execPath, [
  resolve(repoRoot, 'unknown-knowledge/engine/resolve.js'),
  '--root', repoRoot, '--json',
  ...changedPaths.map((path) => `--path=${path}`),
], { encoding: 'utf8', shell: false });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || 'Reverse lookup did not complete');
const attribution = JSON.parse(result.stdout);
```

Do not join filenames into a shell command or split them on commas or
newlines. Skip the invocation when there are no changed paths. An empty or
missing `--path` value, a repo-root-only path, or mixing `--path` with
`--paths`, query terms or `--doc` fails with a usage message and exit 2.
An unmatched path is a normal result: exit 0 with empty attribution.

Legacy `--paths a.ts,b.ts` remains supported, including its comma splitting,
whitespace trimming and backslash conversion. For equivalent ordinary path
sets, both inputs return the same attribution and deterministic output.
The repeatable flag is an additive MINOR surface change under D-021.

## How the loop works

The runtime contract — `RESOLVE → PREFLIGHT → GATHER → ACT → RECORD` — lives
in [`protocol/AGENTS.md`](protocol/AGENTS.md). That file is the single
source of truth for how agents navigate the stores, what a verdict obliges,
and when findings get appended; start every integration question there. The
procedures live in the skills under `protocol/skills/`, referenced by name
(D-019): `/knowledge-bootstrap` (first population), `/knowledge-reflect`
(consolidating findings into reviewed fixes), `/kb-build` (cited knowledge
writes), `/knowledge-audit` (the loop's heartbeat report).

## Extractor fixtures and later stacks (D-009)

Extractor fixtures for the stacks selected at init are included under
`engine/tests`. If you adopt another stack later, you author your own pack
from the included template (`templates/new-kind/`, plus the fixture
authoring README seeded beside the packs) — there is no update channel. The
governed path for teaching the engine a new anchor shape is
`protocol/new-kind-pipeline.md`.

## Commit gate (opt-in)

The seeded `hooks/pre-commit` invokes `engine/commit-check.js`, which runs both
whole-store structural and value validation. Each check reports its name and
status. Exit 0 means both pass; 1 means findings; 2 means a check failed or
could not run. Failure dominates findings and success. There is no bypass
variable. Validators inspect source lexically and never execute application
code; application behavior still needs its own tests.

Install from the repo root when you choose (init never edits `.git/`):

```sh
chmod +x unknown-knowledge/hooks/pre-commit
ln -s ../../unknown-knowledge/hooks/pre-commit .git/hooks/pre-commit
```

Use your chosen kit directory name if different; `KIT_DIR` selects that name.
Preserve existing hooks when integrating this invocation into your setup.
`hooks/reverse-lookup` provides advisory attribution and never selects a subset
for the commit gate. Real installed-hook Git tests exercise gate behavior.

The gate checks an isolated Git index snapshot. Both validators read staged
source, stores and repo-relative rules; unstaged and untracked evidence cannot
affect their findings. Local work is never stashed, reset or restaged. Installed
engine code, schemas and dependencies run from the host and are not linked into
the evidence snapshot. Missing dependencies, snapshot preparation failures and
cleanup failures block with exit 2. Git submodules and escaping symlinks are
unsupported and refused explicitly, as are non-UTF-8 path names. Raw blob reads
do not invoke checkout
filters or apply archive attributes. Run from the repository root and install
the runtime dependencies before committing. Check the actual merge candidate
in CI as described below.

## CI

Session-level preflight is a sufficient gate for a small team, not for
hundreds of engineers. At team scale, wire the validators into CI — copyable
templates and the PR drift-attribution recipe are in
[`docs/ci-wiring.md`](docs/ci-wiring.md). Init never wires CI for you
(D-006).

## Version stamp and license

`kit-version` in `kit.manifest.yaml` records the kit version that seeded
this directory — a birth certificate, not a dependency pin (D-021): it says
which schema revision, extractor-kind set, and fixture vintage the seed was
born with, and implies no update channel. The vendored code is Apache-2.0
(D-020); the seeded `LICENSE` and `NOTICE` carry the terms and the
attribution. Your stores and logs are your own content, not the kit's.

## Uninstalling

Delete this directory and remove the thin per-platform wrapper files init
generated at their conventional paths (e.g. under `.claude/`) — that is the
whole uninstall; nothing else in your repo belongs to the kit. Before you
delete, mind the zone map above: `ontology/`, `knowledge/`, `decisions/`,
`logs/`, and `survey-scope.yaml` are your team's data, and `logs/` in
particular is the recorded history of where your map and your code
disagreed — export what you want to keep first.

## Further reading

- [`docs/ci-wiring.md`](docs/ci-wiring.md) — CI templates + PR drift attribution (D-012)
- [`docs/steward-guide.md`](docs/steward-guide.md) — the steward role, cadence, CODEOWNERS, hygiene recipes
- [`docs/boundaries.md`](docs/boundaries.md) — what the kit guarantees, and what it will never catch
