# Context — unknown-knowledge

Glossary for the standalone open-source product (D-015/D-016: free, permissive
license, public npm; named for the Unknown Creatives studio family) that stands
up self-improving knowledge-base + ontology structures in any codebase.
This file moves to the `unknown-knowledge` repo when it exists.

## Terms

**Kit** — The product itself: a free, open-source CLI (permissive license,
public npm — D-015) that scaffolds the three stores, engine, and agent
protocol into a target repo. Distribution is seeded-once-then-owned: after
`init`, the seeded repo has no relationship to the Kit. Revenue attaches to
services on top (bootstrap engagements, stewardship), never the code.

**Engine** — The vendored deterministic code: store/loader, structural validator,
value validator, extractor library, resolver. TypeScript/Node, no build step,
minimal dependencies. Never an agent; agents feed it and read it.

**Store** — One of three governed YAML repositories of facts, distinguished by
truth anchor:
- **Ontology** — facts the *artifact* owns (what the system is). Machine-verifiable
  via source-of-truth pointers and enumerates recipes.
- **Knowledge** — facts the *world* owns (what the domain is). Citation-anchored,
  human-gated writes only.
- **Decisions** — facts the *team* owns (why it is this way). YAML-schema'd,
  lifecycle-tracked (proposed → accepted → addressed → archived), append-mostly:
  status transitions never rewrite recorded reasoning.

**Truth anchor** — Who owns a fact's truth: artifact, world, or team. Determines
which store a fact belongs to and every governance property downstream
(verifiability, write gate, staleness policy). Litmus test: "if the repo were
deleted, would this still be true?"

**Anchor (extraction anchor)** — A reified structure in the target codebase that
declares a fact in machine-readable form: registry, enum, config file, directory
convention.

**Extractor kind** — A small deterministic recipe (~30-line parser) that reads a
value set out of an anchor (e.g. swift-enum, ts-const-array, dir-modules).
Agent-drafted, human-reviewed, deployed only as versioned tested code.

**Rung** — A fact's level on the checkability ladder: (1) existence, (2) value
agreement via enumerates, (3) reverse-audit coverage, (4) prose with
last-verified date. Every concept is born knowing its rung.

**Enumerates block** — A concept's claim of an enumerable value set plus the
extractor descriptor to re-derive it from source. Drift = diff between claim
and re-derivation, checked both directions.

**Miss-log** — The extract skill's record of registry-shaped anchors no extractor
kind can read. The demand-driven backlog for new kinds; compounds in the Kit
repo across deployments (via new pilots, not client updates).

**Init** — Two-phase standup. Phase 1 (deterministic, the CLI): `npx knowledge-kit
init` vendors stores, engine, protocol, wrappers from an explicit payload
allowlist into a visible, user-named root dir (default `knowledge-kit/`).
Phase 2 (agent bootstrap, `/kit-bootstrap`): survey → taxonomy proposal (human
gate) → concept emission → miss-log → KB interview + skeleton → validators green.

**Protocol files** — Platform-agnostic markdown (AGENTS.md + skills) holding all
agent intelligence: navigation, runtime loop, gate rules. Per-IDE wrappers
(Claude Code, Cursor, Copilot, Codex, Gemini — selectable at init) are thin
pointers to these.

**Runtime loop** — The per-request agent protocol: resolve → preflight →
gather (JIT reads of SSOT files; the map is never the fact) → act (concept
updates travel in the same commit as code changes) → record (consultation
trail + findings).

**Finding** — A structured note the agent appends during any session when one
of five triggers fires: correction, recurrence, retrieval-struggle,
retrieval-miss, quarantine (engine-attributed). Raw signal; no judgment at
capture time; content policy: concept IDs and file paths only, never
verbatim user text or secrets. Logs are fragment-based (one file per entry)
so concurrent sessions never merge-conflict; uncorroborated entries age out
after N reflect cycles.

**Steward** — The person or rotation owning the improvement loop in a client
repo: runs reflect on cadence, triages audit proposals, gates knowledge
promotions. Wired in via CODEOWNERS on the kit root; reflect output lands as
ordinary PRs. The ordinary engineer invokes nothing — the protocol rides
along invisibly.

**Reflect skill** — Human-run consolidation (daily/weekly): clusters findings
into a per-item approve/reject recommendation list. Gated changes require
multiple corroborating findings (one is a data point, three are a pattern).
Approved items apply, then the relevant validator re-runs.

**Trust graduation** — Future, per-category autonomy upgrades (e.g. alias
additions go autonomous after N approved-unmodified cycles). Each graduation
is recorded as a Decisions entry. Not built in v1; designed for in the schema.

**Stack** — A language/config ecosystem the extractor library covers (Swift,
TS/JS, config). Selected at init (auto-detected, confirmable); drives which
extractor fixtures ship. Distinct from **agent platform** (the IDE/agent axis
that drives wrapper generation).

**Acceptance fixture** — A synthetic codebase (Swift and TS) vendored in the
Kit repo with known anchors, planted drift, and unextractable shapes.
Acceptance runs against these. Never part of the init payload.

**Extractor fixture** — A per-kind sample-file → expected-values pair. Ships
to client repos for their selected stacks as the runnable extractor gate and
the authoring template for client-drafted kinds. Later stacks are
client-authored — warned at init (no update channel).

**Payload manifest** — The explicit allowlist of what init copies into a
target repo, with stack-conditional sections. Nothing ships by omission.

**Survey map** — The deterministic traversal-surface artifact: git-tracked
files minus a built-in denylist, per-directory histograms, and a regex
anchor-candidate pre-scan (signatures shared with extractor kinds). Agents
triage it; raw repo traversal is a protocol violation.

**Survey scope** — `survey-scope.yaml`, the human-confirmed include/exclude
boundary from the bootstrap scope+taxonomy gate. Reused by every audit and
reflect sweep; widened via retrieval-miss findings, never re-litigated.
