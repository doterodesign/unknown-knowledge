# AGENTS.md — navigation contract + runtime loop (PRD §7)

> Commands below run from the **repository root**. Store and protocol paths
> in prose are relative to the store/kit root in the layout table below;
> source-of-truth pointers and survey-scope paths are repository-relative.

You are a coding agent in a repo seeded with the unknown-knowledge kit: three
YAML stores that map the system, a deterministic engine that checks the map,
and this protocol. This file is the platform-agnostic contract — per-platform
wrapper files are thin pointers here. Follow it on every request.

**First action: read this contract before recursive product-source filename
or content discovery.** Locating and reading top-level agent instructions and
necessary top-level configuration is permitted. Before reading product source,
read the relevant KB catalogs and the entries they name, following the store
navigation contract below. A resolver hit does not replace these reads.
Targeted reads of source paths supplied by the KB are expected GATHER behavior;
source search after a coverage miss follows this contract's fallback rules.
These are agent instructions, not a host tool firewall.

## Layout and command roots

Read the entry instructions and necessary top-level configuration to identify
the layout before invoking the engine. These are the supported conventions:

| Location | Seeded client (default name) | Kit's own repository |
|---|---|---|
| Store/kit root | `unknown-knowledge/` | `.` |
| Ontology and knowledge | `unknown-knowledge/ontology/`, `unknown-knowledge/knowledge/` | absent by design; `payload/templates/` contains seed templates, not live stores |
| Decisions catalog | `unknown-knowledge/decisions/_catalog.yaml` | `decisions/_catalog.yaml` |
| Canonical protocol | `unknown-knowledge/protocol/AGENTS.md` | `payload/protocol/AGENTS.md` |
| Engine commands | `unknown-knowledge/engine/<command>.js` | `payload/engine/<command>.js` |
| Confirmed survey scope | `survey-scope.yaml` at repository root | `survey-scope.yaml` at repository root, if confirmed |
| Finding logs | `unknown-knowledge/logs/` | `logs/` |

Two `--root` conventions:

- Every store-reading CLI (`resolve.js`, `preflight.js`, `validate.js`,
  `validate-values.js`, `commit-check.js`, `audit.js`, `survey-map.js`) takes `--root` as the
  **repo root** (default: cwd). Store readers auto-locate
  `<root>/unknown-knowledge/` when present, otherwise stores at `<root>/`.
  `survey-map.js` reads `<root>/survey-scope.yaml`; source-of-truth pointers
  also resolve against the repo root (§9.1).
- `log-entry.js` takes `--root` as the **kit dir** (the directory containing
  `logs/`), e.g. `--root unknown-knowledge` in a seeded client, `--root .`
  in the kit's own repository.

For the kit's own decision-store use case, stay at the repository root:

```
node payload/engine/resolve.js "engine language" --json --root .
node payload/engine/preflight.js --json --root .
```

Then enter `decisions/_catalog.yaml` and read the named entries using the
shared lifecycle rules below. The resolver searches concepts/leaves, not
decision text; zero hits cannot establish that a decision is absent. Missing
ontology/knowledge warnings are expected in this decision-only layout.

If working from another directory, supply an absolute repo root to store
commands and an absolute store/kit root to logging. Do not use `--root payload`
or `--root unknown-knowledge` to make source pointers work by accident.
An initializer `--root <name>` selects the seed destination; it is **not**
a store-reader configuration flag. Renamed client directories are not
auto-discovered by the current engine. Honor explicit configuration only
where the invoked command supports it; if entry instructions name an
unsupported root, or the expected catalog cannot be read, report the layout
problem and stop that navigation path. Do not interpret missing-store
warnings in an unexpected layout as empty knowledge, guess alternative roots,
or repair custom-root discovery during the task. Ambiguous layouts that the
engine refuses are failures, not query misses.

## The SSOT contract — the map is never the fact

Stores hold **claims and pointers**; source files hold **facts**. Prose in
any store — summaries, definitions, even `enumerates` values — is navigation,
never truth. The rules that follow from this:

- **Always follow the pointer and read the source.** Never answer from a
  concept's prose or its `enumerates` values; they exist so the engine can
  diff them against the artifact, not so you can skip the read.
- **Reference by concept ID and path, never by copied value.** Anything you
  write into a store or a log carries `K-NNN` / `D-NNN` / leaf accession
  (`L-NNNNNN`) and
  file paths — copying a value out of source into prose mints a second,
  uncheckable claim.
- **Trust is per-run.** A verdict is valid for the run that computed it;
  never cache or carry one across sessions (D-011 — a stale "trusted" is a
  false all-clear).

## Store navigation contract

Enter through the relevant catalog before recursive product-source filename
or content discovery. Honor the actual rules for that store, then read the
entry the catalog names. Targeted source reads from those pointers are GATHER;
they do not require rediscovering the repository. Never grep the store tree
cold or raw-traverse the repo; unresolved tasks use the survey map below.

| Store | Navigation order |
|---|---|
| Ontology | `ontology/_catalog.yaml` → `ontology/_rules.yaml` → catalog-named class/concept files |
| Knowledge | `knowledge/_catalog.yaml` → `knowledge/_rules.yaml` → catalog-named leaves |
| Decisions | `decisions/_catalog.yaml` → this document's **Gate rules** and **Decisions-authoring path** (shared lifecycle rules) → catalog-named entries |

There is no required `decisions/_rules.yaml`. Do not search for or invent one.
For a decision question, read the relevant entries' `status`, `supersedes`,
and `superseded-by` fields and follow those IDs through the catalog until the
current decision is reached. An older title or preserved reasoning is history,
not current policy; report broken or cyclic chains instead of guessing.

| Store | Truth anchor | Points | Write gate |
|---|---|---|---|
| `ontology/` | the artifact (code) | inward — `source-of-truth` into the repo | proposal-first; updates travel with the code change |
| `knowledge/` | the world | outward — `citations` to external evidence | human-only; the kb-build skill is the sole write path |
| `decisions/` | the team | sideways — typed refs to concepts & leaves | gated append-mostly; see the authoring path below |

Cross-reference semantics (knowledge leaves, §3.2):

- **`class-elsewhere` is a redirect — follow it.** The content lives at the
  target accession; the leaf you found is a signpost, not an answer.
- **`see-also` is context.** Related material; consult when useful, never a
  substitute for the leaf you resolved.
- **`including` is standing room.** Candidate topics parked under a heading —
  not authoritative, never citable as fact.

All cross-store references travel by ID (`used-by`, `confusable-with`,
`rationale`, `relates-to`, cross-refs) — content is never embedded across
store lines. A `confusable-with` entry on a resolved concept is an explicit
disambiguation: confirm you have the right concept before acting on it.

**`knowledge/derived/` is engine output, not a store.** Browse trees and the
resolution index are regenerated by `engine/derive.js` and deleting them loses
nothing. Two rules when you read one: never hand-edit a derived file, and
**never cite a synthesized call number** (`SPO/ODD/REF·L-000117`) — it is a
display string naming a position in one projection, it differs between trees,
and the citable half is the accession inside it. See
`protocol/derived-layer.md`.

## The runtime loop (every request)

`RESOLVE → PREFLIGHT → GATHER → ACT → RECORD`

### 1. RESOLVE — request terms → concepts

```
node unknown-knowledge/engine/resolve.js "export format" --json --root .
```

Query terms are positional (joined into one query); results come scored with
`source-of-truth` pointers, `confusable-with` disambiguation, and knowledge
entry points. Exit 0 = the lookup ran (hits or none); exit 2 = it never ran —
stop, that is an engine failure, not an empty result.

Leaf results expose `superseded-by`: direct incoming claims derived from other
leaves' `relates.supersedes`. Follow the listed accession and file when looking
for current evidence, and repeat hop by hop with a visited-ID set. Several
successors are several claims; do not choose by date, score, or list order.
Read target metadata to compare `applies` jurisdictions with the request
(empty means universal) and inspect stage and freshness before selecting
evidence. Metadata-only navigation does not add a target to the evidence set.
Before relying on a selected successor's claims or gathering its cited source,
run `preflight.js --leaves <IDs> --today <YYYY-MM-DD>` with the current
evaluation date, following PREFLIGHT below. Check every selected successor;
do not require a verdict for a candidate rejected during metadata navigation.
Resolver metadata is navigation, never target preflight or proof that a
successor applies. Historical requests can still use the predecessor's source;
an unresolved conflict, cycle, or inapplicable successor is not a current answer.

**Zero resolution is a normal outcome**, not proof of missing evidence.
Use this recovery path before source search:

1. **PREFLIGHT store health even with zero hits**: run `preflight.js --json
   --root .` without concept/leaf selectors. Follow its outcome; an exit 2
   stops the task. A lookup over a broken or unsupported store is not a miss.
2. Inspect relevant catalogs using the store navigation contract. Use the
   terms, titles, aliases and named entries there to recover the subject.
   Retry resolution when a catalog supplies a new relevant term; preflight
   recovered concepts/leaves before gathering their evidence. Decisions are
   recovered directly through their catalog and lifecycle links.
3. Stop reformulating when the task is resolved or the relevant catalog
   entries supply no new lead. Do not repeat equivalent queries or generate
   an unbounded synonym loop; the stopping condition is exhausted catalog
   evidence, not an arbitrary retry count.
4. Only the unresolved portion proceeds to **Scoped fallback** below. If
   catalog recovery found the answer, gather the named evidence and record
   `retrieval-struggle` for the wording friction, not `retrieval-miss`.

### Scoped fallback — unresolved evidence only

Read **`<repo-root>/survey-scope.yaml`**, not a file under the seeded kit
directory. Its include/exclude values are repository-relative path prefixes;
exclusions win. `.` includes root-level files only, not every subtree.
If no confirmed scope exists, use the bootstrap scope gate before source
search; a proposed map is not an agreed boundary. Do not widen scope yourself.
An unreadable or malformed scope must be reported, never replaced with a
guessed path or interpreted as an empty knowledge base.

```
node unknown-knowledge/engine/survey-map.js --json --root .
```

In the kit repo, use `node payload/engine/survey-map.js --json --root .`.
Confirm the map reports `scope.source: survey-scope.yaml`. Search only
relevant candidate paths or directories named by this map, within its
confirmed includes and excluding every configured exclusion. A directory
histogram is not permission to recurse into excluded children: bound any
filename/content search accordingly. Non-candidate files in those directories
may hold evidence; lack of an extractor-shaped candidate is not absence.
The map covers tracked files minus its built-in denylist. Honor those limits
and disclose `unsurveyed` paths rather than searching around them.

Report the boundary reached and classify the outcome:

| Outcome | RECORD behavior |
|---|---|
| Existing indexed evidence recovered through different catalog wording | `retrieval-struggle`, naming the recovered IDs and paths |
| Required in-scope fact or pointer still missing after catalog recovery and bounded search | `retrieval-miss`, naming the searched paths and any consulted IDs; do not claim absence beyond the surveyed scope |
| Topic outside the agreed scope | Expected absence; explain the boundary, without automatically logging an index defect or searching excluded material |
| Unsupported layout, unreadable store/scope, or an engine check that never ran | Report the concrete failure; do not recast it as a retrieval miss |

General knowledge can explain a concept if clearly attributed. It cannot
establish undocumented company policy or other company-specific facts. Findings
use `log-entry.js` and the capture content policy below; do not copy the user's
question or source contents into a finding.

For recovery findings, `consulted` accepts `concepts` (`K-NNN`) and `leaves`
(`L-NNNNNN`) only. Decision paths belong in `summary`; there is no
`consulted.decisions` field. Ordinary decision-catalog navigation is expected,
not itself wording friction: log a struggle only when retrieval was indirect.

Preserve each command's own exit code and stderr in walkthrough evidence.
Resolver exit 0 includes zero hits. Survey-map exit 1 discloses blind spots;
exit 2 means the engine check failed. A search tool's no-match status or a
failed file read is that tool's outcome, not an engine failure. Do not combine
commands so the last command's status hides earlier outcomes.

### 2. PREFLIGHT — check every concept and leaf you rely on

Maintain the **evidence set**: the concept IDs and leaf accessions whose
claims will support your answer or action. Select every one explicitly in
preflight, whether found by the resolver or through the catalogs. Merely
visible related candidates need not be checked unless you rely on them.

Mixed concept-and-leaf request (replace these IDs with your evidence set):

```sh
node unknown-knowledge/engine/preflight.js --concepts K-101,K-102 --leaves L-000100,L-000200 --today <YYYY-MM-DD> --log --json --root .
```

Leaf-only request — no ontology hit is needed to check knowledge:

```sh
node unknown-knowledge/engine/preflight.js --leaves L-000100 --today <YYYY-MM-DD> --log --json --root .
```

Replace `<YYYY-MM-DD>` with the **current evaluation date** on every run,
including concept-only and store-health runs. The engine never reads the
clock; omitting the date skips freshness checks. `--log` appends quarantine
findings for selected quarantined records. Use `--concepts` only for concept
IDs and `--leaves` for accessions; there is **no decision-preflight flag**.
Read decision lifecycle and supersession records when selecting rationale,
and check any supporting concepts or leaves you rely on through these flags.

**GATHER can expand the evidence set.** Read entry metadata to navigate, but
before relying on a newly reached `class-elsewhere` target, `depends-on`
prerequisite, replacement/successor, or other supporting entry, return to
PREFLIGHT with its ID. Incremental batches are fine: each relied-upon concept
and leaf must have a verdict from this run before its claims support the
answer or action. Following a redirect does not transfer its verdict to the
target. Before answering or acting, reconcile the evidence set with the
returned `verdicts` and `leaf-verdicts`; resolver metadata is not a substitute.

Keep these four checks separate:

- **Store health** says whether the stores loaded. Only when BOTH selectors
  are empty/omitted does preflight run in store-health-only mode, with no
  selected verdicts. The zero-resolution branch still checks health, but a
  health pass never checks a leaf's claims.
- **Review eligibility** comes from the declared lifecycle/stage. Draft or
  proposed records are `unknown`. A declared `verified` stage is metadata,
  not authenticated proof that a human approved the evidence.
- **Freshness** uses the leaf's `verified` date and `volatility` against
  `--today`. Stale is distinct from quarantined and unknown. No declared
  volatility means time-governance **exemption**, not proof of freshness;
  static knowledge never ages out, which also does not verify its source.
- **Original-source verification** still requires GATHER's source reads.
  Even `trusted` reports the attributable engine checks, not an independent
  reading of citations. The engine remains offline; the host follows sources.

Exit 0 means every selected record is trusted. Exit 1 means completed checks
found quarantined or stale records: apply the permitted conduct below and
keep stale claims visibly unverified; browsing never authorizes promotion or
timestamp refresh. **Exit 2 stops the governed task**, including draft/proposed
`unknown` results and malformed-store failures. This stop takes precedence
over any source-gathering advice accompanying an unknown verdict: report the
blocking result, do not continue GATHER/ACT as if the check passed. Store-wide
failures degrade every requested verdict to `unknown`. Never cache verdicts.

### 3. GATHER — read the fact, not the map

Follow each resolved concept's `source-of-truth` pointer and **read the
file**. One targeted read per fact. Knowledge leaves: read the leaf body and
follow `class-elsewhere` redirects. Never substitute a summary, an
`enumerates` list, or a leaf heading for the artifact.

### 4. ACT — execute, then attribute before committing

Do the work. Before committing, reverse-look-up every file you changed:

```
node unknown-knowledge/engine/resolve.js --paths src/registry/export-formats.ts,src/types/color-space.ts --json --root .
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

Where the client has wired the seeded hooks (`hooks/pre-commit`,
`hooks/reverse-lookup`), both of these run automatically: the pre-commit hook
runs both whole-store validators through `engine/commit-check.js` before the
commit exists, and the reverse-lookup hook runs the `--paths` lookup over the
staged diff. Attribution never limits the gate to a concept subset (D-012).
The gate currently reads working-tree evidence and does not provide
partial-staging safety. Each hook is a thin wrapper around its engine command
and exits with its code, unchanged — so a wired repo
enforces this step mechanically rather than depending on you to remember it.
Run the commands yourself anyway: seeing the findings before the commit is
cheaper than being refused by it, and a hook the client never wired enforces
nothing.

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
  do not pass `--no-verify` or unwire a hook to get a commit through,
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
  --entry '{"trigger":"correction","summary":"correction: K-101 src/registry/export-formats.ts","consulted":{"concepts":["K-101"]}}'
```

Each finding's `consulted:` refs ARE the consultation trail. Sibling logs,
same helper: `--log misses` (anchors no extractor kind can read) and
`--log gaps` (requests no protocol/skill could route).

**Capture content policy (§3.4 — not optional):** summaries carry concept IDs
and file paths only — **never verbatim user text, quoted session content, or
secrets**. The `session` field is an opaque ID. Committed fragments are
permanent git history in this repo and are reviewable content like any other
PR change.

**Missing evidence is different from missing wording.** After scoped source
and catalog navigation, an undocumented organizational fact stays
**unestablished**. General knowledge can explain what telemetry providers or
safeguards usually do; it cannot establish which ones this organization uses.
An in-scope evidence gap is a `retrieval-miss`; a fact recovered through
another term or catalog is a `retrieval-struggle`. Expected absence outside
`survey-scope.yaml` is neither a demand to search excluded paths nor warrant
for taxonomy expansion.

For an in-scope miss, the helper may record permitted `residue` and
`resolved-context` from the resolver alongside `consulted` IDs and paths.
Review tokens before persisting them: these fields are not an exception to
the content policy, and a query can contain secrets or identifying text.
Omit unsafe tokens; never paste the question into a summary. Findings record
navigation evidence, not the missing company fact. Reflect judges independent
corroboration; a later cited addition goes through `protocol/skills/kb-build.md`.

For later answers about a recorded gap, follow PREFLIGHT for each consulted
leaf itself (a concept verdict does not cover its leaves), then GATHER its
cited evidence. Preserve the source's limits and attribute accession and source.

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
