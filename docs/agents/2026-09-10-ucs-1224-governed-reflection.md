# UCS-1224: governed retrieval repair

Requirement: UCS-1224, under UCS-1217. Full issue, parent, comments (empty), and
native blockers (none) were fetched from Linear. This slice changes the existing
reflect protocol, not the resolver engine or another ticket's runtime protocol.

- Immutable review base: `200a01d29388604a4fe8263b633d0fdbb31e9d85`.
- Task branch: `codex/ucs-1224-governed-reflection`.
- Implementation: `90d62d2d0c6c088c8688a45f3609c1dedb36c44c`.
- Reviewed fixture correction: `399cfd529c7c6699f850ef0479e8547f49934479`.

## Behavior

Reflect diagnoses terminology, a missing concept-to-leaf relationship, an
inaccurate pointer, or an evidence gap before recommending the smallest
supported repair. Independent events still determine corroboration; files do
not vote. Alias/term minting retains warrant and Decisions provenance. All leaf
revisions, including frontmatter-only edits, use kb-build and its separate
promotion gate. Full structural validation, applicable filtered validators,
derive write/check, and original-query verification precede resolution.

The existing engine already supported the warranted alias and declared edge.
The new CLI test characterizes those real public surfaces; it does not simulate
an agent or a human approval. The behavioral protocol evidence is the actual
fresh-agent walkthrough. The baseline reflect run demonstrated the missing
closure behavior: it resolved the alias after concept validators without
derive/replay or an independent retrieval trial.

The fixture preparer uses public init/log-entry/derive commands, installs an
executable pre-commit hook, and creates a real baseline commit. Documentation
command probes now use a disposable directory: probing bare `derive --write`
had otherwise created generated files in the developer's repository.

## Corrected fresh-agent result

Identical user request and generic supported preflight syntax were given to
fresh agents (`fork_turns: none`, no model/effort override). The tool did not
expose exact model/effort metadata. No target IDs, alias suggestions, previous
traces, or expected answer were supplied. The request asked which canvas output
formats are supported and how to verify a delivery profile before acceptance.

| Observation | Before | After |
|---|---|---|
| Successful resolver query calls | 4 | 3 |
| Initial combined query | No leaf results | Both intended leaves |
| Additional packaging-leaf recovery | Required | Eliminated |
| Source-grounded answer | PNG/SVG from code; checksum inventory verification from handbook | Same correct answer |
| Consulted-leaf preflight | Each leaf trusted with injected date before reading | Both trusted with injected date before reading |

The agents chose different combined query wording; this is observed workflow
effort, not an identical-query benchmark. Separate public resolver JSON uses
the same `canvas output`, `delivery profile`, and `locale` queries and date
before/after. It proves the two repaired routes and unchanged unrelated Locale
output. Two concept-pointer follow-ups remain in the after trial, which logged
a new retrieval-struggle finding. No zero-friction or general reliability claim.

Final reflect fixture commit: `c27a2f62ea9987e2b72f2f0afab95931e5859965`.
The actual executable hook passed and the worktree is clean. Six original
findings resolved only after verification. Four remain open: three Locale
records representing one event and one newly observed pointer-recovery event.
The rejected relationship proposal was not duplicated on a no-new-evidence
sweep; recurrence reopened the original files. Its rejection reason was saved
in the trace before the helper cleared the current `reason`. The stamp records
alias approval plus relationship rejection and later approval. Separate exact
kb-build draft promotion approval is preserved. Derivation changed none of the
17 authored record/catalog/rule/registry hashes.

## Checks and review

- Full suite: **1,009 passed**, using Git 2.50.1 via `PATH=/usr/bin:$PATH`.
  Focused reflect/CLI checks and lint were rerun after review fixes.
- Focused checks: **20 passed**. Lint: **121 files, zero failures**.
- Automated acceptance: A1–A4 and A6 pass. A5 is the actual manual agent run.
- Repository structural validation: exit 0; two existing loader warnings.
- Typecheck: unavailable; this JavaScript/JSDoc repository has no configured
  typecheck script. No toolchain was added to manufacture a result.
- Standards: one P2 fixture defect fixed and cleared; zero open findings.
  The corrected leaves hold independent handbook guidance rather than copies
  of artifact-owned enumeration values. No actionable smell findings.
- Spec: zero open findings after reviewing final trace, stamp and hook commit.

## Evidence and limits

Local evidence bundle:
`/Users/dimitriotero/.codex/visualizations/2026/09/10/01a088c8-141e-7f70-a4f8-cb7c099dc73e/ucs-1224/`.

Final evidence files are `ucs-1224-verified-before-retrieval-trace.md`,
`ucs-1224-verified-after-retrieval-trace.md`, `ucs-1224-final-reflect-trace.md`,
`resolver-before/`, `resolver-after/`, `resolver-comparison.txt`, validation
logs, and `fixture-before.tar.gz` / `fixture-after.tar.gz` (including local Git
history, excluding dependencies). The scripted reproduction is
`acceptance/A5-reflection-retrieval-walkthrough.md`.

Earlier exploration is retained separately: an unprompted baseline omitted
leaf preflight, another correctly stopped on unsupported `--help`, and initial
fixture bodies were corrected during Standards review. Those are not counted
as successful final acceptance. Both final paired agents received the same
public CLI syntax; this does not prove unprompted CLI discovery. All approvals
and sources were synthetic, never promotion of live company knowledge.

No push, main merge, package publication, or successor-ticket implementation.
