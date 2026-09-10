# Changelog

All notable changes to the `unknown-knowledge` kit are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/) with the
kit-specific semantics recorded in decision D-021 (`decisions/entries/`):
MAJOR = store schema-version bump or breaking engine CLI contract change;
MINOR = new extractor kinds, new engine surfaces, or a new fixture vintage;
PATCH = fixes and documentation. Entries accrue under Unreleased as PRs land;
each release moves them under a version heading with the release date —
dates are recorded at release time, never retroactively.

## [Unreleased]

### Added

- Resolver leaf results expose direct incoming `superseded-by` navigation,
  derived from authored `relates.supersedes`, with target scope and lifecycle
  metadata across query, path and document output (UCS-1226).

- Repeatable resolver `--path` input preserves complete filenames, including
  commas and whitespace, with safe argv-array invocation guidance (UCS-1229).
  Legacy comma-separated `--paths` remains compatible; mixing the two forms
  fails with exit 2. This is an additive MINOR CLI surface change under D-021.
- Importable Verdict computation in `engine/lib/verdicts.js` (UCS-947),
  including store-wide degradation and leaf/time verdicts. Preflight uses
  the library with unchanged output, exit codes, and logging behavior.
- `engine/commit-check.js` runs both whole-store validators with named
  diagnostics and failure-dominant exit codes (UCS-1227).

### Fixed

- Reflect diagnoses recurring terminology, relationship and source-pointer gaps
  before proposing a minimal governed repair, routes all leaf revisions through
  kb-build, and verifies derived discovery plus before/after retrieval (UCS-1224).

- Leaf supersession cycles now produce `ref-cycle` findings for each cycle
  member, so target preflight quarantines circular replacement claims.
- Commit validation reads one isolated Git index snapshot, preserving local
  staging and working files. Unstaged repairs and untracked evidence cannot
  conceal candidate defects; preparation and cleanup failures block (UCS-1228).

- Installed pre-commit hooks now refuse source-value drift as well as
  structural findings. Real Git integration tests cover paired updates,
  findings and check failures. This gate still reads the working tree;
  partial-staging safety is not included in this change (UCS-1227).
- Generated agent wrappers now point to the canonical navigation contract as
  the first action before recursive product-source discovery (UCS-1222).
  Client-authored instructions keep the existing append/non-clobber behavior;
  existing seeds remain client-owned and are not automatically updated.
- Runtime preflight now explicitly selects every relied-upon concept and
  knowledge leaf with the current date, including leaf-only requests and
  targets discovered during gathering. Store health, review eligibility,
  freshness, and source verification remain distinct (UCS-1219).
- Catalog recovery guidance (UCS-1223): document per-store navigation and
  seeded-client versus kit-repository roots; preflight zero-hit queries,
  recover catalog wording before survey-scoped fallback, and distinguish
  retrieval struggles, in-scope misses and excluded topics.
- Clarify the cited, human-reviewed path from an organizational evidence gap
  through capture and kb-build to fresh-session retrieval (UCS-1225).

### Changed

- Preflight is a thin CLI adapter over library orchestration (UCS-953), with
  direct tests for Verdict rules and CLI regression tests for runtime crashes
  and partial finding-append failures. Output and exit codes are unchanged.

## [2.1.0] - 2026-09-09

### Added

- npm release preparation (UCS-955): remove the private publish guard and
  use an OIDC-capable npm CLI in the provenance-enabled publish workflow.

### Security

- Raise the `js-yaml` dependency floor to 5.4.1 and refresh the lockfile,
  excluding versions affected by GHSA-pm4m-ph32-ghv5 (exponential parsing
  time in nested flow collections).

### Changed

- Acceptance fixture world: design-studio domain, new fixture vintage. The
  acceptance and test fixtures (both app fixtures, the plant stores, the
  resolver/derived/phoenix/validator scenario stores, the payload extractor
  and adapter samples, and the A5 walkthroughs) now model a product-design
  studio — a design-tool web app and its iOS companion, over domains like
  `design-system/components`, `design-system/tokens`, `brand/identity`,
  `engineering/frontend`. Every fixture keeps its semantic role: the planted
  detection cases keep their exact codes and paths, the phoenix split keeps
  its leaf-granular one-goes-the-other-way story, and call numbers are
  regenerated from the new domain segments rather than hand-edited. Per D-021
  this is a new fixture vintage; engine behavior and the init payload contract
  are unchanged.

### Removed

- Root-level prototype and planning artifacts (`PRD.html`,
  `ORCHESTRATION.md`, and the reference-prototype HTML pages). None were
  part of the init payload (D-007) or wired to the engine; runtime behavior
  and the init payload are unchanged. Doc, test, and comment references to
  the removed files were updated in place;
  historical records (`decisions/`, `docs/agents/`, `logs/`) keep their
  original citations.

## [2.0.0] - 2026-08-16

The faceted knowledge store (GitHub #49), landed as one atomic release: the
`faceted-store-v2` integration branch collected every ticket in the arc, and
`main` moved from 1.0.0 to 2.0.0 in a single commit-graph event. The arc, in
one paragraph: **identity inverts** — the accession id (`L-NNNNNN`) is the
leaf's only identity and the only legal citation target, with notation demoted
to an optional legacy display field; **frontmatter v2** classifies every leaf
by governed facets whose vocabularies live in **warrant-governed registries**
(a value must be minted before it can be written, and minted only on literary
warrant); **one deterministic resolution pipeline** answers queries, repo
paths, and whole documents alike — decomposition with scored leaves, scope
exclusion, near-misses and residue; format adapters to one IR; the document
coverage map; typed edges with one-hop expansion and reverse lookup; the time
facet's trusted/stale verdicts; **governance becomes mechanism** — phoenix
events apply edition bumps by leaf-granular mapping, trust graduation narrows
moderation by category table, residue clusters feed reflect's corroborated
minting conduct, and seeded hooks make validation blocking; and the
**derived layer** (browse trees, synthesized call numbers, resolution index)
is regenerable and disposable by construction. This is a MAJOR release per
D-021 because the arc is a store schema-version-class break: the v2 leaf
contract retires `description`, requires the governed facet block, and
accepts accession ids as the only citation spelling — already-seeded repos
keep v1 (seeded-once-then-owned, D-001); the migration story is this kit repo
and future seeds.

### Added

- Seeded git hooks that enforce the protocol mechanically (UCS-1157):
  `hooks/pre-commit` runs blocking validation before a commit exists, and
  `hooks/reverse-lookup` runs the `--paths` reverse lookup over the staged
  diff — the AGENTS.md ACT step, performed without being remembered. Both are
  thin wrappers: each invokes exactly one engine command and exits with its
  code **unchanged**, with no bypass variable to read, because a hook with an
  off switch enforces nothing. They are explicitly **not a test seam** — the
  tested surface is the wrapped command, and the wiring is reviewed the way
  the per-IDE wrappers are (`tests/hooks.test.js` pins thinness, exit-code
  propagation, the absence of a bypass, and that no command whose output a
  hook depends on has its exit status swallowed by a pipeline; it
  deliberately tests no hook behavior, because there is none to test). The
  one code a hook authors itself is `exit 2`, for the one thing the engine
  cannot report: its own input never being read — a failed `git diff` is not
  an empty diff, and must never read as one. They **seed but do not install**:
  `init` never writes `.git/`, so the kit ships the gate and the client hangs
  it — the same boundary CI wiring keeps (D-006). Wire them with
  **event-named** symlinks (`pre-commit`, and `prepare-commit-msg` for the
  reverse lookup): git runs a hook only if its filename names an event git
  fires, which bites hardest under `core.hooksPath` pointed at the seeded
  directory, where a non-event-named file looks wired and never runs.

### Changed

- `/kb-build` rewritten as **thin orchestration** over engine commands
  (UCS-1157). Every mechanical step now names the command that performs it —
  `resolve.js` for coverage, `log-entry.js` for gap parking, the registries
  for facet fill, `validate.js` for the gate — and the agent's discretion is
  confined to three declared **judgment fills**: prose bodies, candidate
  confirmation, and mint proposals carrying literary warrant. Protocol
  compliance becomes a property of the mechanism rather than of agent
  obedience.
  The step list changes from CLASSIFY → CITE → DRAFT → INDEX → VALIDATE to
  **CLASSIFY → CITE → FACET → DRAFT → VALIDATE**: facet fill from the
  registries is promoted to its own step (it is where the `unregistered-value`
  gate bites), and the catalog row folds into DRAFT (the validator's `orphan`
  and `index-drift` checks verify it, so it was never a step an agent
  performed by eye). Entries enter at `draft` stage explicitly.
  All remaining notation-lifecycle prose is **gone** — mint-the-next-free-
  notation, move-is-a-new-leaf-plus-redirect, per-revision edition bumps, and
  the `notation` field walkthrough. `tests/kb-build.test.js` asserts their
  ABSENCE, because a dead instruction that survives a migration is worse than
  one never written: agents obey it.
- `acceptance/A5-kb-build-walkthrough.md` mirrors the rewritten skill
  step-for-step, with a new section watching both hooks propagate their engine
  exit codes. Every documented output was re-captured by running the commands.
- `CONTEXT.md` records the lineage framing — *a faceted classification with
  warrant-governed vocabularies, in the DDC editorial tradition* — and gains
  glossary terms for **Accession ID**, **Facet**, **Registry**, **Phoenix
  event**, **Coverage map**, and **Hooks**.

- Acceptance fixture v2 — the five planted cases with an expected-finding table
  (UCS-1159): the frontmatter-v2 counterpart to the ontology-side drift the
  fixtures already carried. `fixtures/ts-app` gains a second v2 leaf
  (`L-000200`, Time facet plus a resolving typed edge) and hosts three
  value-level plants: a stale volatile leaf (preflight `stale` at exit 1, always
  under an injected `--today`), a jurisdiction mismatch, and an unregistered
  facet value. The last two both emit `unregistered-value` and are told apart
  **only by `path`**, so the goldens pin the path. Two plants — a duplicate
  accession ID and an unresolvable `relates` ref — are loader-fatal: they set
  `model.ok = false`, after which every engine surface reports that diagnostic
  and abandons the run, so anything sharing their store is swallowed (verified:
  adding a `duplicate-id` to the main store makes both `unregistered-value`
  findings vanish, and no flag scopes past loader health). They therefore live
  in their own minimal roots — `fixtures/plant-duplicate-accession/` and
  `fixtures/plant-unresolved-relates/` — one defect apiece, asserted in
  isolation at exit 2. This honors "drift in values, never in shape" rather than
  bending it: both are WELL-FORMED records whose *meaning* is defective (two
  valid leaves claiming one accession; a valid edge citing an accession nothing
  mints), so nothing hides behind a malformed descriptor and the loader
  diagnostic IS the expected finding. The main store keeps only value-level
  plants, so it still loads clean and the fixture-store pin test stays green
  unchanged. Inventory and the five-row expected-finding table (case, target,
  anchor `file:line`, expected finding, root) live in `fixtures/ts-app/FIXTURE.md`,
  with the harness invariants stated alongside; `acceptance/run.js` §A3 asserts
  one golden per plant plus a `--today` control and an explicit
  "no plant masks another" check.

- Residue and document candidates as fragment-based findings (UCS-1160): the
  loop that turns misses into tomorrow's deterministic edges. Both flow through
  the EXISTING `log-entry.js` surface — one file per finding, so the concurrent
  sessions that produced them never merge-conflict — and each carries the
  context it fell out of. `finding.schema.json` gains three additive fields:
  `residue` (the unresolved terms), `resolved-context` (what DID resolve in the
  same ask), and `section` (a document candidate's locator: document, heading
  address, line or page). A locator addresses EXACTLY ONE coordinate system —
  neither is underspecified, both is contradictory — enforced as the
  `locator-shape` validator convention rather than a schema keyword, because
  the engine's JSON Schema subset has no conditionals and an unenforced keyword
  is silent contract drift. A bare unresolved token is a finding nobody can act
  on; `stencil` unresolved in an ask that resolved `add-token` localizes the
  gap precisely enough that the minting decision writes itself.
- The reflect skill's minting conduct: four mintable vocabularies (terms,
  aliases, operations, domain classes), each minted only on **literary warrant
  with its corroborating fragments attached**, each minting its own Decisions
  entry. A new `mint-proposal` change category, and
  `templates/decisions/reflect-mint-proposal.yaml` — whose `id` and `date` are
  deliberately invalid, so a proposal pasted unedited fails validation rather
  than reaching the Decisions store with a rationale nobody wrote (the
  registry-minting placeholder idiom, extended to the new vocabularies).
- The moderator's interface is the **reflect queue**, not store browsing: mint
  proposals, corroborated findings, drafts awaiting promotion, and sampled
  spot-checks of what did NOT clear the threshold — because a threshold nobody
  audits is a threshold nobody can tune. Corroboration stays human judgment:
  the engine never counts it and no CLI reports a corroboration score.
- The derived layer (UCS-1158): everything discovery-shaped becomes engine
  output, regenerated from the flat store and disposable by construction. A
  tenth engine surface, `engine/derive.js`, writes `knowledge/derived/` — plural
  browse trees, synthesized call numbers, and a resolution index. Two verbs,
  read-only by default (`--check`), writing only when asked (`--write`), the
  shape phoenix established.
- Plural browse trees over one flat store: `tree.domain-form.md` orders by
  subject for stewards, `tree.form-domain.md` by kind of knowledge for agents.
  Plural is the point — the store's first life filed each leaf at one position
  that was also its identity, so a leaf in the wrong place stayed there. Once
  identity stopped being positional the cost of a second ordering fell to zero,
  and a third axis is now one row in the `AXES` table rather than a code change.
- Synthesized call numbers (`SPO/ODD/REF·L-000117`) as display strings in those
  trees, and NEVER as identity. The same leaf reads differently on each axis
  because a call number describes a position, not a record. No id grammar
  accepts one — the middle-dot separator is in no id space, and a test checks
  every synthesized call number against every entry in `ID_GRAMMARS`, so a new
  id space that accepted them fails the day it is added. A call number in a
  citation-shaped field is both a `pattern-mismatch` and an `unresolved-ref`,
  which the accession-only `leaf-ref` grammar (UCS-1147) already gave us; a
  planted fixture now proves it rather than leaving it as an inference.
- Stale and draft leaves are visibly DEMOTED in generated trees — annotated with
  their reason and sorted last within their node, never hidden. Hiding them
  would make a tree lie by omission: an empty shelf reads as "we know nothing
  about this" when the truth is "what we know has rotted", and those are
  opposite calls to action. Both demotions read the predicates that already own
  them (`timeVerdict`, `isPrePromotionStatus`), so a leaf cannot read stale in a
  tree and trusted in the resolver. Staleness needs `--today` injected as
  everywhere else; without it the time verdicts are `skipped` and every artifact
  says so in its header, never a silent pass (D-012).
- Deleting the derived layer loses nothing, and it is enforced rather than
  promised: the loader skips `derived/` by name (browse trees are markdown under
  `knowledge/`, exactly like leaves, so nothing but the name distinguishes
  output from a record), `--check` reports a missing, hand-edited, or
  engine-unknown file as findings, and a round-trip test deletes the directory,
  regenerates, and asserts the bytes are identical. A determinism twin fixture
  with reversed catalog rows and renamed leaf files pins that a tree's shape
  comes from the store's facts, never from the loader's enumeration order.
- The gated position of embedding recall, documented in
  `protocol/derived-layer.md` and structurally present as `RECALL_SLOT` plus
  `gateProposal()` — with the implementation deliberately ABSENT. Recall may
  live only in the derived layer, is consulted only after the deterministic
  layer is exhausted, and produces proposals that are neither citable nor
  persistable; the gate refuses every proposal by construction, so the only
  route into the store stays the ordinary one. Model selection and semantic
  search are out of scope; what ships is the position, so it cannot later be
  occupied somewhere worse — an embedding cached in frontmatter would be a guess
  sitting in the same file as cited facts, indistinguishable to every reader
  after. Docs-assertion tests hold the prose to the code, and a source assertion
  bans a recall implementation from shipping in these files.
- Trust graduation (UCS-1155): the mechanism that lets moderation narrow from
  100% inspection to sampling. Autonomy is per change CATEGORY and never per
  leaf — "this leaf was right ten times" is not evidence about the eleventh,
  which is a different claim by a different author, whereas "alias additions ran
  ten cycles approved unmodified" is evidence about a class of edit.
- A governed category table at `decisions/_registries/graduation-categories.yaml`
  (new `graduation-categories` record kind) declares each change category as
  either graduation-eligible with a threshold N, or PERMANENTLY GATED — new
  domain classes, contradicts/supersedes edges, authority assignments and
  anything citation-bearing. A gated category never graduates however long the
  streak: a judgment call does not become mechanical by having been made
  correctly N times. Filed under `decisions/` because graduation governs the
  change process, whose truth anchor is the team (D-003). A malformed table is a
  hard error (exit 2), never a finding — graduation checks judged against a
  table the engine could not read are checks that never ran.
- Graduations and revocations are ordinary Decisions entries of category `trust`
  carrying a typed `graduation:` block, extended conservatively onto the
  existing schema rather than forked into a new record kind: a graduation IS an
  ADR. Six new structural checks hold them against the table —
  `gated-category-graduation`, `undeclared-category`, `missing-graduation-table`,
  `graduation-not-trust-category` (an entry that moves the trust boundary while
  filed under another decision category is invisible to anyone auditing that
  boundary by category), `disconnected-revocation` (a revocation whose link to
  the graduation it withdraws is missing or wrong — naming none while one
  stands, or naming an entry that is not a graduation or graduates a different
  category; resolution alone cannot tell a grant from an unrelated ADR), and
  `graduation-field-shape` (the block's fields disagreeing with its own action:
  a grant with no recorded `observed-cycles`, the only written record of what
  was counted since v1 computes nothing, or carrying withdrawal fields; a
  revocation naming no `defect`, its automatic trigger) — plus four loader
  diagnostics for the table's own defects (`graduation-table-name-mismatch`,
  `graduation-table-store-mismatch`, `duplicate-graduation-category`,
  `graduation-threshold-shape`). Revoking is always allowed, including for a
  gated category: revocation only ever narrows autonomy, and refusing to record
  one would be refusing the safe direction.
- Decision entries carry optional `provenance` (`author`, `skill-version`),
  surfaced in validator JSON and human output, so a defect is traceable to both
  — a bad skill revision becomes findable like any other defect rather than
  something someone has to remember.
- Documented conduct in the steward guide: revocation is AUTOMATIC on any
  defect (not a severity judgment), citation spot-checks stay in the sampling
  plan at EVERY trust level, and v1's analytics are explicitly MANUAL — the
  engine never computes approved-unmodified counts, so a green validator is not
  agreement that a graduation was earned. Templates
  (`templates/decisions/trust-graduation.yaml`, `trust-revocation.yaml`) and the
  empty seeded table ship via the payload allowlist.
- Phoenix events (UCS-1154): `phoenix.js`, the ninth engine surface and the
  FIRST that mutates a store. A phoenix event re-files a drifted subtree in bulk
  from a leaf-granular mapping, bumps the `edition` of every leaf it moves — the
  only thing that ever bumps it in v2 — and lands as an ordinary PR: a
  reviewable two-line-per-leaf diff, not a migration project.
- The mapping is leaf-granular because a class-level rule cannot express a
  SPLIT: when one class's material divides across two successors, only a
  per-accession table can say which leaf went where, and each row's `why` is
  what a reviewer reads. Mappings live at `knowledge/_phoenix/<event>.yaml`
  (new `phoenix-event` record kind) and are RETAINED in the store after the
  event, so the governance is checkable from the working tree with no git
  history.
- Citations are untouched BY CONSTRUCTION. Identity is the accession id and an
  event never changes one, so nothing that cites a leaf chases its
  reclassification. The rewriter replaces individual frontmatter lines and
  copies every other byte through — field order, comments, quoting, citations
  and body survive because they are never touched. A committed golden
  before/after pair (`tests/fixtures/phoenix/split{,-after}/`) shows the diff is
  exactly two lines per leaf.
- All-or-nothing by design: the whole mapping is planned against the whole store
  BEFORE a byte is written, and any finding refuses the entire event. A mapping
  that misses a leaf in its declared scope, names an unknown accession, or moves
  a leaf to an unminted value is exit 1 (findings — the input has defects its
  author fixes), never a partial apply. `--check` is the default verb; writing
  takes an explicit `--apply`.
- The rewriter matches on INDENTATION as well as name, at every level: a
  top-level field is matched only at column 0 and a nested one only at its own
  parent's indent. Without that, a `citations:` block containing an `edition:`
  key shadowed the leaf's own edition — the rewriter edited the citation and
  left the real field alone, which is precisely the corruption the by-
  construction claim rules out.
- Facet values are written through a YAML round-trip check, so a value like
  `010` or `2024` is quoted rather than reloading as a number and ceasing to
  equal the minted string it was validated against.
- A row whose `to` is where the leaf already sits is refused (`noop-row`), and a
  move with no `why` is refused (`unexplained-move`). The first makes "`to`
  present ⇔ the leaf moved" true by construction, which is what lets the
  applier and the validator agree without either consulting the other; the
  second is the rationale a split's whole review rests on.
- A write that fails part-way through `--apply` exits 2 and names every file it
  may have changed, in order, flagging the one the write threw on —
  `writeFileSync` can truncate a file and then fail, so the file whose write did
  not complete is the likeliest of all of them to need reverting. Exit 2 rather
  than 1, because the event did not finish and exit 1 would claim a clean
  refusal with nothing written.
- A steward's trailing `# comment` on a rewritten line is carried across,
  alignment included, rather than deleted with the value it annotates. A line
  whose value could hide a `#` inside quotes is refused at the gate instead of
  guessed at.
- `validate.js` gains `unaccounted-edition`: a leaf's edition must EQUAL
  `1 + the retained phoenix events that moved it`. An equality rather than a
  floor, so a hand-typed number, an edition that lags its event, and a mapping
  landed without being applied are all findings.
- `payload/templates/decisions/phoenix-event.yaml`, manifest-listed: the
  Decisions-entry template a steward copies to record the event that sanctions a
  bulk re-taxonomy.
- Document coverage map (UCS-1156): `resolve --doc <document>` makes a
  document-sized request processable. `resolve` is now the ONE ENTRY POINT for
  three input shapes — a query, `--paths`, and a document — and the pipeline is
  size- and format-invariant because a query is processed as a ONE-BLOCK
  DOCUMENT through the same join core. A query and its equivalent one-block
  document produce identical joins by construction, not by two implementations
  agreeing; a golden equivalence pair pins it.
- The coverage map itself: per-section joins each carrying a LOCATOR usable for
  a just-in-time section read, a gather rollup that de-duplicates leaves across
  sections and carries time verdicts and scope-mismatch flags, and ranked
  candidates each addressed to the sections they came from. An agent's context
  cost is the map plus the sections it chooses to open, never the document.
- Salience extraction on PINNED signatures: emphasis spans, multi-word
  Title-Case phrases, and repetition above a threshold that is a pinned STEP
  FUNCTION of document size (spelled as a table, and published in the map so a
  candidate list is re-derivable). Known vocabulary, stopwords, code blocks,
  and suppressions are subtracted. Repetition must also be CONCENTRATED —
  boilerplate repeated once per section in a long document is spread, not
  stressed, and never becomes a candidate.
- Document candidates are suppressible through the SAME entry grammar the
  reverse audit uses (`{ term, sourcePath, reason, date }`, exact match, fails
  open), where `sourcePath` is the submitted document. A suppressed candidate
  is REPORTED as suppressed, never silently absent.
- Output grows with content richness, not length: sections whose coverage
  exactly repeats an earlier section fold into it (keeping every address
  openable), and address lists are capped with the overflow reported as an
  exact count. A long redundant document therefore yields a smaller map than a
  short rich one, asserted on a fixture pair.
- Resubmission dedupes on the adapter's content hash, carried in the map — the
  same bytes produce a byte-identical map under any filename. No submissions
  log: the output stays a pure function of the input (D-012).
- Query decomposition (UCS-1152): `resolve` now decomposes the query itself
  against the governed vocabularies rather than matching text against concepts
  alone. Three axes, three vocabularies, no guessing — verb joins the
  `knowledge/operations` registry, noun joins concept terms and aliases, place
  joins `knowledge/jurisdictions`. A verb-shaped ask ("add a token") therefore
  reaches the leaves that DECLARED the operation without needing a noun to hang
  them on.
- Leaves are now FIRST-CLASS SCORED RESULTS in a `leaves` section, not only
  attachments to a concept's `knowledge` list. Each carries the `signals` that
  scored it, so `sum(signals[].score)` equals the published `score` and a
  ranking is reproducible from the output rather than asserted. The scoring
  table itself ships in the payload under `scoring`, so a consumer reproducing
  a ranking never vendors a copy that goes stale.
- Scope exclusion with reasons: a leaf whose `applies.jurisdictions` excludes
  the query's jurisdiction is published under `exclusions` with the reason —
  excluded, never silently absent. "No knowledge about this" and "the knowledge
  is for another jurisdiction" demand opposite conduct from a reader, and a
  filtered-away leaf makes the two indistinguishable. An empty `applies` is
  universal and never excluded; an unscoped query excludes nothing.
- Near-miss reporting: a vocabulary entry that shares tokens with the query but
  did not clear the match threshold is reported with the overlap that carried
  it — the answer that was nearly right, which is what a reader needs most when
  the right one is missing.
- Residue: the unconsumed non-stopword tokens, emitted with the
  `resolved-context` that DID resolve, so a retrieval-miss finding localizes the
  gap precisely. The stopword list is pinned and shipped in the engine
  (`lib/decomposition.js`), never configurable per run — residue is a
  governance signal, and a per-store list would make "unresolved" mean something
  different in every repo.
- Zero resolution carries its fallback `conduct` IN THE PAYLOAD, not only on the
  human surface: exit 0 with an explicit empty result is machine-distinguishable
  from a failure, and an agent reading JSON is told what to do next rather than
  left to infer it from empty arrays.
- Every array the resolver publishes off a leaf is sorted rather than passed
  through in the order it was authored: the per-leaf `signals` (within each
  weight class), `operations`, and `applies`. Byte-stable output must be a
  function of what a store DECLARES, never of the sequence somebody typed a
  list in — two stores with identical content and different authoring order now
  provably resolve to identical bytes, pinned by a reordered twin fixture
  (`tests/fixtures/resolver-v2-reordered/`).
- Scoring extracted into `payload/engine/lib/scoring.js` as an explicit
  signal→score table, done BEFORE the new signals were added. Concept rungs
  (100/80/60/50/40, −30 draft downrank) keep their numbers and never add up;
  leaf structured joins (operation 3, concept 2, term 1) DO add up, because a
  leaf reached by two independent joins is more strongly the answer than one
  reached by either alone.
- Typed edges (UCS-1151): leaves gain three edge families, giving structural
  neighborhood without term luck. `concepts` (leaf → ontology concept),
  `paths` (leaf → repo tree), and `relates` (`depends-on` / `see-also` /
  `contradicts` / `supersedes`, leaf → leaf).
- `concepts` and the four `relates` kinds are rows in the ref-field table, so
  an unresolvable target is the existing `unresolved-ref` with no bespoke
  check. `paths` names the working tree rather than an id space, so it takes
  the path-existence treatment instead: a leaf path that is not in the working
  tree is a `missing-path` finding — the same code a concept's dead
  source-of-truth pointer earns, because it is the same defect.

### Fixed

- Declared pointers into the working tree are now checked for CONTAINMENT
  before existence, in both families (concept `source-of-truth` and the new
  leaf `paths`). A pointer resolving outside the repo root — `../elsewhere`,
  or an absolute path — used to be judged against whatever sat there, so a
  store passed or failed on what existed OUTSIDE it: clean on the author's
  machine, broken on a machine without that file. It is now a `missing-path`
  finding on its shape. Containment is judged on the CANONICAL paths, not
  lexically: a symlink sitting inside the repo whose target is outside it
  passes every string test there is, and would otherwise carry the whole
  escape back in through a path that looks contained. Both sides are
  canonicalized, since the root itself may be reached through a link. A
  dangling symlink reports as missing rather than escaping — which is what it
  is, and it sends the author to the edit they can actually make. A pointer naming the repo root is refused for the
  matching reason: it attributes to everything, which attributes nothing, and
  `resolve --paths` already refused the same shape as an input. A deprecated
  concept still demotes an ABSENT pointer to a warning (§3.5's source-deletion
  hatch) but never an escaping or root one — that hatch is for a path that used
  to exist, not for a claim the store was never entitled to make.
- The leaf↔concept edge is derived BIDIRECTIONALLY at load
  (`model.leavesByConcept`). It is authored once, leaf-side, because deciding
  what a leaf is about is curatorial work under the human write gate — and
  traversable from either end, so resolving a concept surfaces its declaring
  leaves even when no term or alias text matches. Knowledge stops depending on
  two authors choosing the same words.
- `resolve --paths` joins over leaf `paths` alongside concept source-of-truth
  pointers, so a diff-shaped path list surfaces the leaves that govern those
  files before an edit. Each published leaf carries `via`, naming which join
  reached it (`direct` / `concept` in reverse lookup, `declared` / `terms` in
  query mode) — two joins of different strength, so the result says which one
  fired rather than leaving a reader to assume the stronger.
- Every leaf the resolver publishes carries `relates`: its ONE-HOP
  neighborhood, keyed by edge kind, each neighbor a minimal stable reference
  (`id`, `notation`, `heading`, `file`). Outgoing edges only — what the leaf's
  own author asserted. Exactly one hop: a neighbor's neighbors are absent,
  because depth 2 is most of the store arriving unranked.
- Frontmatter v2 core (UCS-1149): the leaf classification layer, built
  entirely from governed vocabularies. `facets.form`, `facets.anchor`, and
  `facets.stage` join `facets.domain` as registry-checked fields — three
  declarations in `FACET_REGISTRIES`, no new membership code path — with
  three new registry templates (`form`, `anchor`, `stage`) seeded into the
  client's knowledge store.
- Optional `provenance` (`author`, `skill-version`) on leaves, recorded but
  never judged: it round-trips untouched through resolver and validator
  output.
- `missing-authority`: a leaf citation with no authority tier is a finding
  in any store that carries an authority-tiers registry. The tier records how
  far the source can be trusted — without it a regulator's text and a hallway
  conversation read identically. The tier is governed as vocabulary only:
  nothing compares two tiers yet, and automatic conflict ranking arrives with
  the resolution pipeline.
- The stage vocabulary is `draft`, `proposed`, `verified` — three values, not
  four. There is deliberately no `deprecated` stage: the concept lifecycle gives
  that word real semantics (§3.5 demotes its findings to warnings) and no leaf
  surface implements the match, so the term would rank a retired leaf above a
  draft one and read as `trusted`. Retiring a leaf lands with its semantics in a
  later ticket.
- `preflight --leaves <ids>`: leaf-facing verdicts, counted and gated
  alongside concept verdicts. A leaf at a pre-promotion stage (`draft` or
  `proposed`) receives an **`unknown`** verdict — which gates the run at exit
  2, since a check that never ran is never a silent pass — and is downranked
  in resolver output, both through the SAME `isPrePromotionStatus` predicate,
  so the two surfaces cannot disagree about which leaves are provisional.
- Resolver knowledge entry points publish `stage`, `excerpt`, `provenance`,
  and `downranked`, each a stable key that may be null.

### Changed (BREAKING — major, per D-021)

- The leaf `description` field is RETIRED. Under `additionalProperties:
  false` a leaf still carrying it fails as an unknown property. Display
  prose is now DERIVED from the body's first sentence, so a leaf's one-liner
  cannot drift from the content it summarizes — bodies must open with a
  topic sentence. This is a store schema-version-class break and the reason
  the next release is a major one.

## [1.0.0] - 2026-07-09

The first released version. The kit is seeded once and then owned (D-001):
what a repo receives here is what it keeps, so this release fixes every
exit-code defect found before it, rather than shipping them into client
repos that have no update channel.

### Added

- Open-source launch artifacts: Apache-2.0 LICENSE and NOTICE, version
  policy (D-021), publishing/provenance workflow, CONTRIBUTING.md, and
  issue templates (KK-28).
- Client-facing docs shipped in the payload (KK-24): the seeded-repo README
  (`payload/docs/README.md`, seeded to the kit-dir root), the CI wiring
  guide with the D-012 PR drift-attribution recipe, the steward guide, and
  the guarantees-and-boundaries note (D-008 honest boundary, D-011 conduct
  policy, D-014 no-code-execution) — all manifest-listed and pinned by
  `tests/client-docs.test.js`.
- One flag grammar and one crash epilogue for all nine command-line
  surfaces (`lib/cli.js`), and an entry shim over each so a module-load
  failure cannot be mistaken for findings.
- `lib/iso-date.js` — one definition of an ISO date, calendar-checked.
- `lib/suppressions.js` — the reverse audit's rejection memory behind its
  own seam; each Finding carries the identity that would silence it.
- `scripts/check-tag-version.js` — the publish workflow refuses a release
  tag that disagrees with the package version, before publishing.

### Changed

**The exit-code contract is now enforceable, and several commands changed
exit codes to honour it.** Exit 1 means FINDINGS; exit 2 means the check
did not run. An agent riding those codes quarantines and continues on 1,
so a crash wearing it walks past a check that never happened (PRD §5,
D-011).

- A module-load failure — a corrupt engine file, or an uninstalled
  `js-yaml` — now exits 2 on every surface. It exited **1**.
- `audit --today 2026-02-30` now exits 2. It exited 0 and measured
  staleness from March 2nd, because `Date.parse` rolls the date forward.
- `log-entry --date 2026-13-01` now exits 2. It exited 0 and wrote
  `logs/findings/2026-13-01-<suffix>.yaml` — month thirteen, in a
  permanent audit trail.
- An empty flag value is refused rather than read as a default:
  `survey-map --root ''` surveyed the current directory and exited 0;
  `audit --stale-days=` meant "everything is stale" and exited 0.
- `survey-map` refuses a root named both positionally and by `--root`,
  rather than letting argument order decide.
- Every command accepts `--flag=value` as well as `--flag value`. `init`
  never did.
- The reverse audit stays advisory: findings alone never gate, and
  `--fail-on-findings` is never a shipped CI default (D-013).

### Fixed

- An empty or comment-only `suppressions.yaml` warned "unparseable YAML".
  It has no entries, which is what it says.
- The engine's language is recorded correctly: D-022 supersedes D-002,
  which claimed TypeScript. The engine has always been JavaScript with
  JSDoc types and no build step.
