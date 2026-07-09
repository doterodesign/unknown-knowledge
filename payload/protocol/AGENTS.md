# AGENTS.md — navigation contract + runtime loop (PRD §7)

> Paths in this document are client-relative — relative to the vendored kit
> root after init (`ontology/…`, `engine/…`, `protocol/…`). In the kit repo
> itself these live under `payload/`. Commands are written to run from the
> **repo root** with the kit dir at its default name `unknown-knowledge/`;
> substitute your chosen kit dir name if it differs.

You are a coding agent in a repo seeded with the unknown-knowledge kit: three
YAML stores that map the system, a deterministic engine that checks the map,
and this protocol. This file is the platform-agnostic contract — per-platform
wrapper files are thin pointers here. Follow it on every request.

Two `--root` conventions, stated once:

- Every store-reading CLI (`resolve.js`, `preflight.js`, `validate.js`,
  `validate-values.js`, `audit.js`, `survey-map.js`) takes `--root` as the
  **repo root** (default: cwd). The stores are auto-located at
  `<root>/unknown-knowledge/`; source-of-truth pointers resolve against the
  repo root (§9.1).
- `log-entry.js` takes `--root` as the **kit dir** (the directory containing
  `logs/`), e.g. `--root unknown-knowledge`.

## The SSOT contract — the map is never the fact

Stores hold **claims and pointers**; source files hold **facts**. Prose in
any store — summaries, definitions, even `enumerates` values — is navigation,
never truth. The rules that follow from this:

- **Always follow the pointer and read the source.** Never answer from a
  concept's prose or its `enumerates` values; they exist so the engine can
  diff them against the artifact, not so you can skip the read.
- **Reference by concept ID and path, never by copied value.** Anything you
  write into a store or a log carries `K-NNN` / `D-NNN` / leaf notation and
  file paths — copying a value out of source into prose mints a second,
  uncheckable claim.
- **Trust is per-run.** A verdict is valid for the run that computed it;
  never cache or carry one across sessions (D-011 — a stale "trusted" is a
  false all-clear).

## Store navigation contract

Three stores, one navigational grammar: **`_catalog.yaml` → `_rules.yaml` →
entries** (`classes/*.yaml`, tree leaves, `entries/*.yaml`). Enter through
the catalog, honor the rules file, then read the entry the catalog names —
never grep the store tree cold, and never raw-traverse the repo (triage
`engine/survey-map.js` output instead).

| Store | Truth anchor | Points | Write gate |
|---|---|---|---|
| `ontology/` | the artifact (code) | inward — `source-of-truth` into the repo | proposal-first; updates travel with the code change |
| `knowledge/` | the world | outward — `citations` to external evidence | human-only; the kb-build skill is the sole write path |
| `decisions/` | the team | sideways — typed refs to concepts & leaves | gated append-mostly; see the authoring path below |

Cross-reference semantics (knowledge leaves, §3.2):

- **`class-elsewhere` is a redirect — follow it.** The content lives at the
  target notation; the leaf you found is a signpost, not an answer.
- **`see-also` is context.** Related material; consult when useful, never a
  substitute for the leaf you resolved.
- **`including` is standing room.** Candidate topics parked under a heading —
  not authoritative, never citable as fact.

All cross-store references travel by ID (`used-by`, `confusable-with`,
`rationale`, `relates-to`, cross-refs) — content is never embedded across
store lines. A `confusable-with` entry on a resolved concept is an explicit
disambiguation: confirm you have the right concept before acting on it.

## The runtime loop (every request)

`RESOLVE → PREFLIGHT → GATHER → ACT → RECORD`

### 1. RESOLVE — request terms → concepts

```
node unknown-knowledge/engine/resolve.js "sport" --json --root .
```

Query terms are positional (joined into one query); results come scored with
`source-of-truth` pointers, `confusable-with` disambiguation, and knowledge
entry points. Exit 0 = the lookup ran (hits or none); exit 2 = it never ran —
stop, that is an engine failure, not an empty result.

**Zero resolution is a normal outcome** (common in month one — bootstrap is
deliberately non-exhaustive). Proceed **without store claims**: fall back to
search within the paths `survey-scope.yaml` includes, and append a
`retrieval-miss` finding (RECORD, below) only when the topic plausibly should
be mapped — an unmapped area the scope excludes is expected, not a miss.

### 2. PREFLIGHT — deterministic verdicts on what you resolved

```
node unknown-knowledge/engine/preflight.js --concepts K-101,K-102 --json --root .
```

One verdict per concept — `trusted` / `quarantined` / `unknown` — computed by
engine code, never by your judgment. Store-wide failures degrade every
requested verdict to `unknown`. Exit codes: 0 all trusted, 1 quarantines
present, 2 engine failure / check-never-ran. What you DO with a verdict is
the conduct policy below. Add `--log --today <YYYY-MM-DD>` so quarantine
findings auto-append (one fragment per quarantined concept).

With an empty/omitted `--concepts`, preflight validates store health only and
exits on the store verdict — the zero-resolution branch still preflights.

### 3. GATHER — read the fact, not the map

Follow each resolved concept's `source-of-truth` pointer and **read the
file**. One targeted read per fact. Knowledge leaves: read the leaf body and
follow `class-elsewhere` redirects. Never substitute a summary, an
`enumerates` list, or a leaf heading for the artifact.

### 4. ACT — execute, then attribute before committing

Do the work. Before committing, reverse-look-up every file you changed:

```
node unknown-knowledge/engine/resolve.js --paths src/registry/sports.ts,src/types/currency.ts --json --root .
```

This lists every concept whose pointer covers a changed path (folder pointers
match nested files). **Update those concepts in the same commit** — the store
change rides your normal PR — and re-run both validators filtered to them:

```
node unknown-knowledge/engine/validate.js --concepts K-101,K-108 --root .
node unknown-knowledge/engine/validate-values.js --concepts K-101,K-108 --root .
```

Exit 0 = clean; exit 1 = findings — fix the store or the code before
committing; exit 2 = the check never ran — stop. These validators are
blocking-grade; `engine/audit.js` is advisory (proposals for review) and is
never a gate.

### 5. RECORD — append findings when a trigger fires

See capture obligations below. Findings, misses, and gaps are appended via
`engine/log-entry.js` — never by hand-editing YAML.

## Conduct-on-verdict policy (D-011)

> **CLIENT-EDITABLE.** Verdicts are deterministic engine facts; what a
> session does about one is policy in this markdown, which you (the client)
> own. The table below is the recommended default — quarantine-and-continue.
> A stricter shop may edit `quarantined` to fail-stop. What is NOT editable:
> the engine's verdicts, exit codes, and evidence — and a policy edit must
> never tell an agent to bypass a gate or trust quarantined claims.

| Verdict / outcome | Conduct (recommended default) |
|---|---|
| `trusted` | Proceed. The verdict is fresh this run; never cache it. |
| `quarantined` | **Quarantine-and-continue**: continue the task, but do NOT trust the concept's claims — gather from the source artifact directly (falling back to survey-scoped search if the pointer itself is the problem), and make sure the quarantine finding was appended (run preflight with `--log --today <date>`; it does this for you). |
| `unknown` | Treat as unverified — draft/proposed concepts and store-wide degradations land here. Work from the source artifact; do not present store claims as checked. |
| exit 2 — engine failure / check-never-ran | **STOP.** A check that never ran is a blocking defect, never a silent pass. Report the engine error; do not proceed as if preflight passed. |

## Gate rules

- **All store mutations beyond logging are human-gated.** Agents draft;
  humans approve through the normal PR gate. Logging (`logs/`) is the one
  agent-writable surface, and only via `engine/log-entry.js`.
- **Ontology** edits are proposal-first and travel with the code change they
  describe (ACT step). **Knowledge** is written only through the kb-build
  skill — cited, human-gated. **Decisions** follow the authoring path below.
- **Never wire a parser you authored into the validator in the same session**
  (D-005). Unextractable anchors go to the miss-log; the governed path is
  `protocol/new-kind-pipeline.md`.
- **Never bypass a gate to go green**: do not delete or edit findings to
  unblock a merge, do not hand-edit log YAML, do not skip the ACT re-run,
  treat `audit.js` output as advisory (never blocking), and do not carry a
  cached verdict. Autonomy is graduated per change-category by recorded decision
  (category `trust`), never assumed.

## Capture obligations — the five triggers

Append a finding whenever one fires; capture is cheap and judgment-free
(consolidation happens later, in reflect). The `trigger` vocabulary is closed
(`schemas/finding.schema.json`):

| Trigger | Signal |
|---|---|
| `correction` | the user states the agent / a store is wrong |
| `recurrence` | the same thing is asked for repeatedly |
| `retrieval-struggle` | found, but slowly or indirectly (resolver missed; aliases lacking) |
| `retrieval-miss` | could not find it at all (and the topic plausibly belongs in scope) |
| `quarantine` | engine-attributed: preflight flagged a concept and the session proceeded degraded (auto-appended by `preflight.js --log`) |

Append with the helper — `--date` is mandatory and injected, never wall-clock:

```
node unknown-knowledge/engine/log-entry.js create --log findings --date 2026-07-08 \
  --root unknown-knowledge \
  --entry '{"trigger":"correction","summary":"K-101 stale vs src/registry/sports.ts","consulted":{"concepts":["K-101"]}}'
```

Each finding's `consulted:` refs ARE the consultation trail. Sibling logs,
same helper: `--log misses` (anchors no extractor kind can read) and
`--log gaps` (requests no protocol/skill could route).

**Capture content policy (§3.4 — not optional):** summaries carry concept IDs
and file paths only — **never verbatim user text, quoted session content, or
secrets**. The `session` field is an opaque ID. Committed fragments are
permanent git history in this repo and are reviewable content like any other
PR change.

## Decisions-authoring path (§3.5)

When your work surfaces a decision — a trade-off taken, a graduation of
trust, a scope call — it gets recorded, not lost in a PR description:

1. **Draft** a decision entry in `decisions/entries/` with a provisional
   date-suffixed id (`D-2026-07-08-<slug>`), `status: proposed`, and
   `relates-to` refs to the concepts/leaves/decisions it touches.
2. **Propose** it through the normal PR gate — anyone (agent or human) may
   draft a proposed entry; that IS the decisions store's write path.
3. **Human gate**: the steward assigns the final `D-NNN` at acceptance
   (minted within range, never renumbered once published). Status moves
   `proposed → accepted → addressed → archived` (plus `rejected` /
   `superseded`); transitions never rewrite `context`/`decision` — the store
   is append-mostly, and supersession chains must resolve and stay acyclic.
