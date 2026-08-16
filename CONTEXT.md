# Context — unknown-knowledge

Glossary for the standalone open-source product (D-015/D-016: free, permissive
license, public npm; named for the Unknown Creatives studio family) that stands
up self-improving knowledge-base + ontology structures in any codebase.

## Lineage

The knowledge store is **a faceted classification with warrant-governed
vocabularies, in the DDC editorial tradition**. What is retained from Dewey is
the editorial machinery — literary warrant (a class earns its place from
material that exists, never from anticipation), editions, phoenix schedules for
re-taxonomizing a drifted subtree in full, and the relative index that reaches
a topic from every word a reader might bring to it. What is deliberately
abandoned is notation-as-identity, mono-hierarchy, and enumerative
pre-allocation: identity is an opaque **accession ID**, subject is a **facet**
drawn from a **registry**, and a leaf may be projected into as many browse trees
as there are axes worth browsing.

## Terms

**Kit** — The product itself: a free, open-source CLI (permissive license,
public npm — D-015) that scaffolds the three stores, engine, and agent
protocol into a target repo. Distribution is seeded-once-then-owned: after
`init`, the seeded repo has no relationship to the Kit. Revenue attaches to
services on top (bootstrap engagements, stewardship), never the code.

**Engine** — The vendored deterministic code. Ten command-line surfaces —
structural validator, value validator, preflight, resolver, survey map, reverse
audit, log-entry helper, document ingest, phoenix events, derived layer — over a
store loader, an extractor library, and a format-adapter library.
JavaScript (ESM) with JSDoc types, no build step, minimal dependencies (D-022).
Never an agent; agents feed it and read it. It computes **Verdicts**; it does
not decide what to do about them (D-011).

**Store** — One of three governed YAML repositories of facts, distinguished by
truth anchor:
- **Ontology** — facts the *artifact* owns (what the system is). Machine-verifiable
  via source-of-truth pointers and enumerates recipes.
- **Knowledge** — facts the *world* owns (what the domain is). Citation-anchored,
  human-gated writes only.
- **Decisions** — facts the *team* owns (why it is this way). YAML-schema'd,
  lifecycle-tracked (proposed → accepted → addressed → archived), append-mostly:
  status transitions never rewrite recorded reasoning.

**Accession ID** — A knowledge leaf's identity (`L-NNNNNN`): opaque, minted from
a sequence, never reused, never positional. It is what the loader indexes by and
the only spelling a citation resolves through — the catalog, other leaves,
decisions and log fragments all name a leaf this way. Because it says nothing
about where the leaf sits, refiling the leaf changes no citation, which is the
whole reason identity was inverted away from notation. A dotted **notation** may
still ride along as a legacy display label; nothing indexes by it.

**Facet** — One governed axis of a leaf's classification, filled from a
**registry** rather than invented: `domain` (the hierarchical subject path),
`form` (what kind of knowledge it is), `anchor` (which truth anchor settles it),
and `stage` (where it sits in the promotion path). Faceting is what replaced the
single positional slot: a leaf is described along several axes at once instead of
being filed at one address, so no axis has to carry every question.

**Registry** — A warrant-governed vocabulary file under
`knowledge/_registries/` (domains, form, anchor, stage, operations,
jurisdictions, authority-tiers). Every governed value a leaf carries must already
be minted in its registry, and minting one is a registry edit plus a Decisions
entry carrying its **literary warrant** — the material that exists for the value
to hold. A value the registry does not carry is a blocking `unregistered-value`
finding, which is the mechanism refusing an ad-hoc string rather than trusting an
author not to write one.

**Phoenix event** — A governed bulk re-taxonomy: a drifted subtree re-filed
wholesale under a new classification, applied by the `phoenix` surface in full or
not at all. The whole mapping is planned against the whole store before a byte is
written, and any finding refuses the entire event — there is no partial apply.
Dewey's phoenix schedule, kept: the admission that a classification sometimes has
to be rebuilt rather than patched, made a reviewable act with a Decisions entry
behind it.

**Coverage map** — What `resolve --doc` returns for an ingested document:
per-section joins and candidates, a gather rollup with verdicts and
scope-mismatch flags, and ranked candidates carrying section addresses. It
reports what the store's vocabulary did and did not reach in the document —
bounded by the document's own content richness, never by how hard the engine
tried.

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

**Init** — Two-phase standup. Phase 1 (deterministic, the CLI): `npx unknown-knowledge
init` vendors stores, engine, protocol, wrappers from an explicit payload
allowlist into a visible, user-named root dir (default `unknown-knowledge/`).
Phase 2 (agent bootstrap, `/knowledge-bootstrap`): survey → taxonomy proposal (human
gate) → concept emission → miss-log → KB interview + skeleton → validators green.

**Protocol files** — Platform-agnostic markdown (AGENTS.md + skills) holding all
agent intelligence: navigation, runtime loop, gate rules. Per-IDE wrappers
(Claude Code, Cursor, Copilot, Codex, Gemini — selectable at init) are thin
pointers to these.

**Hooks** — Seeded git hooks that enforce the protocol mechanically rather than
relying on anyone remembering it: `hooks/pre-commit` runs blocking validation
before a commit exists, `hooks/reverse-lookup` runs the reverse lookup over the
staged diff. Both are **thin wrappers** — each invokes one engine command and
exits with its code, unchanged, with no bypass variable to read — so the tested
surface is the wrapped command, and the wiring is reviewed the way the per-IDE
wrappers are. They seed but do not install: `init` never writes `.git/`, so the
client hangs the gate the kit ships (D-006).

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
after N reflect cycles. A retrieval-miss finding may carry `residue` (the
unresolved terms), `resolved-context` (what did resolve in the same ask), and
a `section` locator when it came from a document candidate.

**Verdict** — Preflight's per-concept output: `trusted / quarantined /
unknown`. Computed deterministically by the engine; what an agent does about
a verdict is protocol-layer policy the client owns (D-011).

**Suppression** — A client-zone record (term, sourcePath, reason, date)
telling the reverse audit "this is deliberately not a concept." Exact-match
only in v1 — can only under-suppress, never falsely silence (D-013).
Rejection memory for the steward.

**Steward** — The person or rotation owning the improvement loop in a client
repo: runs reflect on cadence, triages audit proposals, gates knowledge
promotions. Wired in via CODEOWNERS on the kit root; reflect output lands as
ordinary PRs. The ordinary engineer invokes nothing — the protocol rides
along invisibly.

**Reflect skill** — Human-run consolidation (daily/weekly): clusters findings
into a per-item approve/reject recommendation list. Gated changes require
multiple corroborating findings (one is a data point, three are a pattern) —
counted by hand, never by the engine. Approved items apply, then the relevant
validator re-runs. Minting a vocabulary value (term, alias, operation, domain
class) from a corroborated residue cluster needs **literary warrant** on top of
corroboration, carries its evidence, and writes one Decisions entry per mint.

**Reflect queue** — The moderator's interface, and the reason they never browse
the store: four sections — mint proposals, corroborated findings, drafts
awaiting promotion, and sampled spot-checks of what did NOT clear the evidence
threshold. Browsing is unbounded and finds whatever the eye lands on; the queue
is bounded, evidenced, and complete. The spot-check sample is what makes the
threshold itself auditable.

**Residue** — The non-stopword query tokens no join consumed (`resolve`'s
`decomposition.residue`), and, for `resolve --doc`, the document's own residue
as ranked candidates. Logged as findings through `log-entry.js` carrying
`resolved-context` (what DID resolve alongside) and, for candidates, a `section`
locator — so a miss arrives localized enough to mint from. Zero resolution is a
normal outcome, not a miss.

**Trust graduation** — Per-category autonomy upgrades: moderation narrows from
100% inspection to sampling for one change category at a time, never globally
and never per leaf. A governed category table
(`decisions/_registries/graduation-categories.yaml`) declares each category as
either graduation-eligible with a threshold N of approved-unmodified cycles, or
permanently **gated** (new domain classes, contradicts/supersedes edges,
authority assignments, anything citation-bearing). Graduations and revocations
are Decisions entries of category `trust` carrying a typed `graduation:` block;
any defect in a graduated category revokes it automatically, and citation
spot-checks remain in the sampling plan at every trust level. The mechanism and
its validation ship in v1; the **analytics stay manual** — the moderator judges
the recorded approved-unmodified counts, and the engine never computes them.

**Derived layer** — Everything discovery-shaped, regenerated from the flat store
and disposable by construction: plural **browse trees**, **synthesized call
numbers**, and a **resolution index**, written under `knowledge/derived/` by the
`derive` surface. Nothing authored lives here and nothing reads it back — the
loader skips the directory by name — so deleting it loses nothing, and a
round-trip test proves regeneration is byte-identical. It is also the only place
**embedding recall** may ever live: a declared slot, consulted only after the
deterministic layer is exhausted, producing proposals that are neither citable
nor persistable without a human gate. The slot and the gate ship; the
implementation is deliberately out of scope.

**Browse tree** — One generated projection of the flat store along one axis
(`domain-first` for stewards, `form-first` for agents). Plural on purpose: the
accession inversion removed the cost of filing a leaf in the wrong place, so no
single ordering has to be the right one. Stale and draft leaves are **annotated
and sorted last, never hidden** — omitting them would report an empty shelf
where the truth is a rotted one.

**Call number** — A synthesized display string naming a leaf's position in one
browse tree (`SPO/ODD/REF·L-000117`). It is **never an identity**: no id grammar
accepts one, no citation resolves through one, and it differs between axes
because it describes a position rather than a record. The accession it contains
is the citable half.

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
