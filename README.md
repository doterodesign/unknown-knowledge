# unknown-knowledge

A free, open-source CLI that stands up self-improving knowledge-base and
ontology structures in any codebase: three governed YAML stores (ontology,
knowledge, decisions — split by truth anchor), a deterministic validation
engine (TypeScript/Node, zero build step), and a platform-agnostic agent
protocol. Distribution is seeded-once-then-owned: after `init`, the seeded
repo has no relationship to this kit. The full product definition lives in
[PRD.html](PRD.html); the domain glossary is [CONTEXT.md](CONTEXT.md); the
kit records its own decisions in [decisions/](decisions/). Full client-facing
documentation lands with KK-24/KK-28.

## Versioning and the manifest stamp

The kit follows semver with kit-specific semantics (D-021): **MAJOR** means a
store schema-version bump or a breaking change to the engine CLI contract;
**MINOR** means new extractor kinds, new engine surfaces, or a new fixture
vintage; **PATCH** means fixes and documentation. When the kit seeds a repo,
the manifest records the kit version that seeded it. That stamp is a birth
certificate, not a dependency pin: it tells you exactly what schema revision,
extractor-kind set, and fixture vintage the seed was born with, and per D-001
it never implies an update channel — upgrades of an existing seed are
deferred (PRD §11.1). Changes are tracked in [CHANGELOG.md](CHANGELOG.md)
(Keep a Changelog form).

## License and contributing

Licensed under [Apache-2.0](LICENSE) (D-020); redistribution carries the
[NOTICE](NOTICE) file. Contributions — especially new extractor kinds and
field miss reports — are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) for
the gate (parser + fixture + demo run, D-005) and PR expectations. Release
and supply-chain process (npm provenance, 2FA) is documented in
[docs/publishing.md](docs/publishing.md).
