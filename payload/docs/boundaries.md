# Guarantees and boundaries

What the kit promises, what it deliberately does not, and which of its rules
are yours to change. Each section names the decision that pinned it — the
full record is in the kit's decision log, and the seeded copy of every rule
below lives in `protocol/AGENTS.md`.

## What the kit will never catch (D-008)

The kit catches **conceptual drift**: names, value sets, and pointers — the
map disagreeing with the artifact. A registry gained a value no concept
knows; a concept enumerates a value the source dropped; a pointer dangles at
a file that moved.

It will **never** catch **behavioral drift**: logic bugs, inverted
conditions, a wrong calculation behind a correctly-named function, a
registry whose values are all present and all handled badly. Behavior is
your test suite's job. Budget your trust accordingly: a green validator run
means the map matches the code, not that the code is right.

## The engine never executes your code (D-014)

The engine only ever **reads your files lexically**. It never imports,
evals, or runs repo content; JSON and YAML are parsed as data, never
loaded as code; it makes no network calls. The one child process the
engine spawns is `git` (in `survey-map.js`, to list tracked files) — it
reads git's index, never your code. This is the answer to "does this tool
run our code in CI?": no — guaranteed by design and pinned by a grep test
in the kit's own CI. Any future adapter that would break it (e.g. a
remote-config fetch at validate time) must be explicitly opt-in.

## Findings privacy — the capture content policy

Findings, misses, and gaps are committed YAML fragments: permanent git
history **in your repo**, reviewable in PRs like any other change — and
they never leave it. The kit has no runtime and no telemetry; nothing is
collected or sent anywhere.

The capture policy is what keeps the fragments safe to commit: summaries
carry **concept IDs and file paths only** — never verbatim user text,
quoted session content, or secrets; the `session` field is an opaque ID.
This strips context by design — a finding is a signal that something
disagreed, not a transcript of the disagreement. The SSOT is the artifact
the finding points at; anyone judging a finding follows the pointer and
reads the source.

## Preflight conduct is yours to set (D-011)

Verdicts are deterministic engine facts; **what a session does about a
verdict is policy in markdown you own**. The place to edit is the
CLIENT-EDITABLE conduct table in `protocol/AGENTS.md`
("Conduct-on-verdict policy"): the recommended default is
quarantine-and-continue, and a stricter shop may edit `quarantined` to
fail-stop — that is the sanctioned edit, made by normal PR through your
steward gate.

The non-editable floor: the engine's verdicts, exit codes, and evidence are
computed facts, not policy — and no policy edit may tell an agent to bypass
a gate, trust a quarantined concept's claims, or treat exit 2 (a check that
never ran) as anything but a stop.
