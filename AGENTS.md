# Working on unknown-knowledge

Read [CONTEXT.md](CONTEXT.md), the relevant entries in
[decisions/_catalog.yaml](decisions/_catalog.yaml), and the kit-repository
navigation rules in [payload/protocol/AGENTS.md](payload/protocol/AGENTS.md).

## Complete changes together

- Capture each substantive implementation, architecture, governance or scope
  decision in `decisions/entries/` and its catalog. Record the reason,
  alternatives/tradeoffs, consequences and supporting implementation/evidence
  links. Reuse an existing decision when it already covers the choice; record
  changed choices explicitly without rewriting historical reasoning.
- Keep this repository's own Decisions at one entry per file, with one exact
  catalog row per entry. IDs remain independent of filenames; this local
  editing convention does not restrict grouped records in client stores.
- Unpublished decisions use proposal keys and the governed promotion workflow;
  never invent a canonical ID or approval. Record user authorization separately
  from the record's publication status.
- Every PR, including documentation-only PRs, advances the package version,
  updates both root lockfile version fields and includes versioned changelog
  notes. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for semver and prerelease rules.
  Recheck the target base before merge. Internal commits are not separate PRs.
- Review every affected documentation surface in the same PR: README files,
  `AGENTS.md`/`agents.md`, protocol and wrapper instructions, CLI/API examples,
  schemas, manifests, contributor/publishing/migration guides and acceptance
  documentation. Update those whose claims or instructions changed; explain
  non-applicability in the PR. Preserve pinned historical evidence and examples.
- Include decision links, documentation coverage, validation evidence and
  remaining limitations in the PR. Passing code tests alone is not completion.
- When fixed engine or worker entrypoints change, update the exact dispatch
  allowlists in `acceptance/run.js` and run repository acceptance. Preserve
  literal worker names and paths; do not make the guard permissive to pass it.

For parallel work, each owner maintains its scoped decisions and documentation.
The integration owner reconciles shared root files, version numbers and the
changelog before each PR, preserving other owners' changes. Updating a version
does not authorize tagging, publishing or migration of customer records.
