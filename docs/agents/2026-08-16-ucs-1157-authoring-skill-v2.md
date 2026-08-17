# UCS-1157 — Authoring skill v2 + hooks: thin orchestration, blocking validation, automatic reverse lookup

Branch: `ucs-1157-authoring-skill-v2-hooks-thin-orchestration-blocking`
(from `faceted-store-v2` @ `11c27cf`). Gates: `npm test` 1006/1006,
`npm run lint` 205 files/0 failures, `npm run acceptance` OK.

## The thesis, and what it changed

The ticket's claim is that **protocol compliance should be a property of the
mechanism, not of agent obedience**. Two surfaces had to move for that to be
true rather than aspirational:

1. The authoring skill had to stop *telling* an agent how to do mechanical
   work and start *delegating* it to commands that already do it.
2. The gates had to run whether or not anyone remembered them — which means
   hooks.

Everything below follows from those two.

## What shipped

| Artifact | Path | What it is |
| --- | --- | --- |
| Rewritten skill | `payload/protocol/skills/kb-build.md` | thin orchestration over engine commands |
| Pre-commit hook | `payload/hooks/pre-commit` | blocking validation, exit code propagated |
| Reverse-lookup hook | `payload/hooks/reverse-lookup` | `--paths` over the staged diff |
| Hook pin | `tests/hooks.test.js` | thinness / propagation / no-bypass / manifest |
| Skill pin | `tests/kb-build.test.js` | rewritten; dead-vocabulary ABSENCE assertions |
| Glossary pin | `tests/context-glossary.test.js` | v2 vocabulary + lineage framing |
| Walkthrough | `acceptance/A5-kb-build-walkthrough.md` | mirrors the skill step-for-step |
| Manifest | `cli/kit.manifest.yaml` | new `unconditional.hooks` section |
| Docs | `CONTEXT.md`, `README.md`, `CHANGELOG.md`, `payload/protocol/AGENTS.md` | vocabulary, lineage, hook wiring |

## Decision 1 — the step list changed shape

Old: `CLASSIFY → CITE → DRAFT → INDEX → VALIDATE`.
New: **`CLASSIFY → CITE → FACET → DRAFT → VALIDATE`**.

Two moves, each with a reason that is not cosmetic:

- **FACET is promoted to its own step.** Facet fill from the registries is
  where the `unregistered-value` gate actually bites, and in the old skill it
  was a bullet buried inside DRAFT's frontmatter walkthrough. A mechanical,
  gate-bearing act reading as a sub-bullet of a judgment step is exactly the
  confusion the rewrite exists to remove. It is also where the third judgment
  fill (mint proposals with warrant) lives, so it needed room.
- **INDEX folds into DRAFT.** The catalog row is not a step an agent performs
  by judgment — `validate.js`'s `orphan` and `index-drift` checks verify the
  row against the file, and the old step's "done when" criterion was
  literally a restatement of what those two checks compute. Keeping it as a
  step invited the agent to audit the pairing by eye, which is the anti-goal.

The step count stayed at five, which matters only because the walkthrough
and both test files pin the list; they were updated together.

## Decision 2 — the judgment fills are declared, and enumerable

The skill now carries a table naming exactly three:

| Judgment fill | Where |
| --- | --- |
| Prose bodies | step 4 |
| Candidate confirmation | steps 1–2 |
| Mint proposals with warrant evidence | step 3 |

and states that everything else is the engine's. This is what makes AC1
testable: `tests/kb-build.test.js` asserts each fill is named, asserts the
"only free-form work" framing, and asserts each mechanical step names its
command (`resolve.js`, `log-entry.js`, the registries, `validate.js`).

## Decision 3 — the dead vocabulary is asserted by its ABSENCE

The removed notation-lifecycle prose, and the pattern that guards each:

| Retired instruction | Guard |
| --- | --- |
| mint-the-next-free-notation | `/next free notation/i` |
| move-is-a-new-leaf-plus-redirect | `/new leaf plus a? ?\`?class-elsewhere\`? redirect/i` |
| the rename-in-place prohibition | `/never a rename in place/i` |
| per-revision edition bumps | `/bump \`?edition\`?/i` |
| the `notation` field walkthrough | `/\`notation\`\*{0,2}\s+—\s+OPTIONAL/i` |
| domain/**division** spine | `/division/i` |

Absence assertions, not presence ones, because **a dead instruction that
survives a migration is worse than one never written: agents obey it.** A
test that only checks for the new prose would pass on a file that carried
both.

Note the last row. `division` had to go from the skill entirely — it was a
positional slot, and the spine is now domains. The fixture's leaf frontmatter
still carries `domain:`/`division:` fields (schema v2 keeps them), so this is
a *skill prose* assertion, not a store-wide one; the walkthrough's leaf still
shows them because that is what the fixture validates.

## Decision 4 — hooks land at `<root>/hooks/`, seeded but not installed

Surveyed first: **there were zero hook scripts of any kind in this repo** —
no git hooks, no husky, no pre-commit framework. `.git/hooks/` held only the
stock samples. "pre-commit" appeared as prose in the PRD and in
`resolve.js`'s comments describing the ACT-step lookup, and that was all. So
this is a new surface, not a migration.

Placement was the one real constraint. The manifest's `unconditional`
sections write **relative to the seeded root**; the only mechanisms that
write at the client repo root are the `platforms:` registry and the
`root-files:` allowlist, and the latter is hard-limited to
`['LICENSE', 'NOTICE']`. Seeding directly into `.git/hooks/` was never on the
table anyway — `init` writing a client's git config would break the same
boundary D-006 keeps for CI. So: seed at `<root>/hooks/`, and the client
symlinks or points `core.hooksPath`.

**Gotcha worth carrying forward:** the copy engine seeds *bytes, not modes*,
so a seeded hook arrives non-executable and git silently will not run it. I
documented the `chmod +x` at the wiring step (README, manifest comment)
rather than teaching the manifest per-entry permissions — that would be a
second thing to keep true for one bit the client sets in the same breath as
the symlink. Verified end-to-end: `node cli/init-copy.js` seeds both hooks
(110 files total).

## Decision 5 — what "not a test seam" meant in practice

The ticket says hooks are explicitly not test seams and that testing the
wrapped command IS testing the hook. That is only true if the hook adds
nothing — so `tests/hooks.test.js` tests **no hook behavior at all**. It pins
the four properties that make the claim true:

1. **Thin** — at most 8 executable lines (comments and blanks excluded). The
   per-IDE wrapper pin uses the same shape ("must stay a THIN pointer",
   < 25 lines); this is its executable-line equivalent.
2. **Propagates unchanged** — `exit $?` present; no `|| true`, no
   `|| exit 0`, no self-authored `exit 1`/`exit 2`.
3. **No bypass** — no `SKIP`/`NO_VERIFY`/`DISABLE`/`FORCE`/`BYPASS`. A hook
   with an off switch enforces nothing, and the switch gets reached for
   exactly when it matters.
4. **Manifest-listed** — an unseeded hook enforces nothing either.

**Trap I hit:** properties 2 and 3 must be checked against the **executable
lines only**, not the raw source. My first pass grepped the whole file and
failed on my own comments — the pre-commit hook's prose explains what exit 1
means and says it has no bypass to read, which is the *opposite* of having
one. Documentation is not a code path. The helper is a three-line `code()`
that strips comments and blanks; anyone extending this file should use it.

## Decision 6 — walkthrough outputs were re-captured by running, never edited

Per AC3 and the UCS-1159 warning about AUTHORED EXPECTATION blocks. Every
block in the walkthrough came from a real run against `fixtures/ts-app`:

| Block | Command | Observed |
| --- | --- | --- |
| step 1 | `resolve.js "frontend" --root .` | exit 0, unchanged from prior capture |
| step 2 | `log-entry.js create --log gaps …` | exit 0, fragment `2026-07-09-80864041.yaml` |
| step 3 probe | `validate.js` w/ planted `form: settlement-note` | `unregistered-value` on `L-000110` |
| step 5 orphan probe | `validate.js --root .` | exit 1, 3 findings |
| step 5 final | `validate.js --root .` | exit 1, 2 findings (fixture baseline) |
| hooks | `sh hooks/pre-commit` | exit 1, byte-identical to the direct run |
| hooks | `sh hooks/reverse-lookup` (staged) | exit 0, 2 paths |
| hooks | `sh hooks/reverse-lookup` (empty) | exit 0, no engine invocation |

The step-3 `grep` line and the empty-diff one-liner were both re-run *as
written in the document* to confirm they work verbatim, not just in spirit.

Two prior blocks were **dropped**, not updated: the `L-000999` unresolved-ref
probe and the `"100.1"` dotted-notation probe. Both are citation-grammar
checks that UCS-1147's `tests/citation-migration.test.js` already owns, and
keeping them here made the walkthrough test the validator rather than the
skill. The FACET probe replaced them because it is the gate *this* rewrite
introduced.

The final `validate` is **exit 1, not 0** — the fixture's own UCS-1159
planted cases 2 and 4 (`L-000100`'s unminted `facets.form` and
`applies.jurisdictions`) ride along in every structural run on this fixture.
The walkthrough says so explicitly and carries a negative check that the
agent must NOT "fix" them to go green. Inherited from UCS-1159; not a
regression.

## Decision 7 — the new hook section in the walkthrough

The walkthrough gains a "The hooks — the same gates, run mechanically"
section between VALIDATE and Done. It exists because AC2's claim
(propagation unchanged) is only observable by comparing the hook's output to
the direct command's, and the walkthrough is where observable claims live.
The fixture has no vendored engine, so the section symlinks the kit's in —
same trick the rest of the file uses with `$KIT`.

## Glossary and lineage

`CONTEXT.md` gains a **Lineage** section carrying the spec's sentence
verbatim: *a faceted classification with warrant-governed vocabularies, in
the DDC editorial tradition*, plus both halves of the framing (what Dewey's
machinery is retained — literary warrant, editions, phoenix schedules, the
relative index — and what is abandoned: notation-as-identity, mono-hierarchy,
enumerative pre-allocation).

New terms: **Accession ID**, **Facet**, **Registry**, **Phoenix event**,
**Coverage map**, **Hooks**. (`Residue`, `Derived layer`, `Call number`
already existed from UCS-1158/1160.)

**WRAP-TRAP, confirmed live.** The lineage assertion failed on first run:
CONTEXT.md wraps after "warrant-governed", *and* the `**` bold markers
straddle the break. A `\s+` at the wrap point is not enough when emphasis
markers are also in play. The fix is collapse-then-includes — strip `\s+`
to single spaces AND strip `**`, then `.includes()`:

```js
assert.ok(context.replace(/\s+/g, ' ').replace(/\*\*/g, '')
  .includes('a faceted classification with warrant-governed vocabularies, in the DDC editorial tradition'));
```

This is the `context-glossary.test.js` house idiom already (the `Engine` term
uses `.replace(/\s+/g, ' ')` then `.includes()`), extended for emphasis. **I
did not reflow the prose to suit the test.**

The registry-coverage test is code-derived rather than a hardcoded list: it
reads `payload/templates/knowledge/_registries/*.yaml` and asserts the
Registry glossary term names each one, so a registry added later fails here
until the glossary learns it.

## Count pins — deliberately untouched

No engine command was added, so nothing touched the count pins.
`tests/readme.test.js` pins "Ten command-line surfaces" derived from
`readdirSync(payload/engine)`; `payload/engine/` still holds 10 `.js` files.
CONTEXT.md's identical claim is (still) not pinned by anything — noted as a
latent gap, not fixed here, because fixing it is not this ticket's surface.

## Post-review fixes (CodeRabbit on PR #68)

Four fixes landed after review; three findings were declined with reasoning
posted on the PR.

### FIX 1 — the reverse-lookup hook could pass silently (the real one)

Original line:

```sh
PATHS=$(git diff --cached --name-only --diff-filter=ACMR | paste -sd, -)
[ -z "$PATHS" ] && exit 0
```

**A pipeline's exit status is its LAST stage's.** If `git diff` failed,
`paste` still succeeded, `PATHS` came back empty, and the hook exited 0 —
reporting "nothing to attribute" for a lookup that never ran. That is
precisely the silent pass the engine's exit-2 contract exists to prevent,
committed by the artifact whose whole thesis is refusing them. It was mine,
and the review caught it.

Fixed by separating capture from join and reading git's status:

```sh
STAGED=$(git diff --cached --name-only --diff-filter=ACMR) || {
  echo "reverse-lookup: git diff failed — the staged paths could not be read, so the lookup never ran" >&2
  exit 2
}
[ -z "$STAGED" ] && exit 0
PATHS=$(printf '%s' "$STAGED" | paste -sd, -)
```

Verified by running the hook outside a git repository: **exit 2** with the
stderr line, where the old form gave exit 0.

Two test consequences worth knowing:

- **The thinness ceiling moved 8 → 12 executable lines.** Refusing to pass
  silently costs lines; checking a status and reporting the failure is three
  lines a hook that swallowed it would not spend. Those lines are the
  opposite of a hook growing behavior.
- **The "never authors an exit code" pin had to be split.** The hook may not
  author a *verdict* (0 or 1 standing in for what the engine said), but
  `exit 2` is the one code it must author, for the one thing the engine
  cannot report: its own input never being read. The pin now forbids
  `exit 1` and a bare `exit 0` line, and permits the exit-2 never-ran signal.

A new static pin, `never lets a failed command read as a clean one`, walks
the executable lines and asserts that any `VAR=$(git …)` capture both checks
its status (`||`) and does not pipe within the same assignment. Static, per
this file's philosophy — still no behavior seam.

### FIX 2 — `stage` was spelled unqualified in DRAFT

`knowledge-leaf.schema.json` has no top-level `stage`; it nests under
`facets` alongside `domain`, `form`, `anchor` (verified against the schema).
The DRAFT bullet and its completion criterion now say `facets.stage`, as does
the walkthrough's checklist item. The FACET table row and the walkthrough's
facet list were already context-qualified and left alone. Pinned both ways:
`facets.stage` must appear, and a top-level `- **\`stage\`**` bullet must not.

### FIX 3 — the reverse-lookup hook needed an event-named wiring

The original wiring comment ("a pre-commit companion, a post-checkout hook,
or run it by hand") left a trap: **git runs a hook only if its filename is
one of the events git fires**, and `reverse-lookup` is not one. Under
`core.hooksPath` pointed at the seeded directory this is worse than useless —
the file sits next to `pre-commit` looking wired and never fires.

Concrete wiring now documented in the hook, the README, and the walkthrough:

```sh
ln -s ../../unknown-knowledge/hooks/reverse-lookup .git/hooks/prepare-commit-msg
```

`prepare-commit-msg` runs after the index is staged and before the message
editor opens, which is when attribution is still actionable. Git passes it
the message file and source as arguments; the script ignores them and reads
the staged diff itself. Under `core.hooksPath` wiring, call it explicitly
from `pre-commit` instead. Script behavior unchanged.

### FIX 4 — FACET's enforcement pointer is pinned

The step-delegation test asserted FACET against `/_registries\//` only. The
registries **are** the step's delegation surface (no engine command performs
faceting), but the section also names the mechanism that enforces the fill at
step 5, and that pointer could have silently dropped out. Added
`assert.match(sections.FACET, /unregistered-value/)`.

### Declined, with reasoning

- **"Unresolved cross-references should be exit 1, not 2"** — wrong for this
  engine. `unresolved-ref` is loader error severity (`load-stores.js` ref
  table), which sets `model.ok = false` → exit 2, and UCS-1159's
  `fixtures/plant-unresolved-relates` pins exit 2 empirically. The doc
  describes actual behavior; changing the behavior is not this ticket.
- **"Comma-delimited PATHS breaks filenames containing commas"** — real, and
  a **latent gap worth its own ticket**. Comma-joining is
  `resolve.js --paths`' own documented CLI contract (`--paths <file1,file2>`,
  single-arg comma-split), so a thin hook must use it; re-encoding paths or
  adding an input shape is an engine-interface change outside UCS-1157.
  Candidate follow-up: a newline-delimited stdin input shape for `--paths`,
  which would also lift the argv length ceiling on very large diffs.
- **"Add an engine-owned accession-allocation command"** — scope creep. This
  ticket adds no engine command by design (the count pins are untouched);
  collisions are already refused deterministically by the `duplicate-id` hard
  error at validate, and allocation happens inside the human-gated one-PR
  flow. A mint-next-accession command is a v-next candidate.

## Traps for whoever picks this up next

1. **`git checkout -b` fails under the sandbox** ("could not lock config
   file"): the branch ref gets created, HEAD does not move. It bit this
   ticket exactly as warned. Recovery is `git checkout <branch>` (the ref
   already exists), then `git branch --show-current` before anything else.
2. **`\Z` is not JavaScript.** My step-section regex used it out of habit;
   the JS spelling is `$(?![\s\S])`. It failed loudly (a missing final
   section) rather than silently, but only because the test compared the
   full step list.
3. **Grep the executable lines, not the file**, for any "this code does not
   do X" assertion. See Decision 5.
4. **Emphasis markers count as wrap hazards**, not just whitespace. See the
   lineage trap above.
5. **`cmd | join` reports the JOIN's exit status, not the command's.** In any
   shell wrapper meant to refuse silent passes, capture first and check the
   status before piping. This bit the reverse-lookup hook (FIX 1 above) in a
   file written specifically to prevent silent passes — the pattern is easy
   to write and invisible on a green run, because the failure mode only
   appears when the upstream command fails.
6. **Writing a doc block by hand invites the same defect it documents.** My
   first draft of the walkthrough's git-failure block used
   `… | tail -1; echo "exit ${PIPESTATUS[0]}"` — which masked the exit code
   through a pipe (and `PIPESTATUS` is not portable to `sh`). Running the
   block caught it. Every documented command must be *run as written*, not
   just plausibly correct.
