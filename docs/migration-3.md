# Migrating to the 3.0 pilot

`3.0.0-rc.1` is a release candidate on npm's `next` channel. Install the exact
version during a pilot. `latest` remains the stable 2.1.0 release.

## What changes

Preflight's `next-action` field now contains machine codes in both JSON and
human output. Use the client protocol's conduct table instead of matching the
old prose. See [the code migration](agents/ucs-954-action-code-migration.md).
Numeric exits retain their meanings: 2 stops the governed task; 1 permits only
the client's explicit degraded conduct; 0 means the selected checks passed.

A leaf without `facets.stage` remains loadable but is now `unknown` with
`review-stage`, exit 2. Migration must not fill in `verified` or refresh dates
to make a check pass. Preserve legacy data for inspection and obtain review
before promotion. Static or absent volatility does not certify freshness.

The installed commit hook validates staged bytes, including referenced source
files. An unstaged repair no longer hides a broken proposed commit. Both
validators run against the candidate; reverse attribution also reads the prior
tree so deletions and renames retain their previous governance. Escaping
symlinks, submodules, unsupported Git names and failed reads are explicit stops.

## Existing seeded installations

Init is deliberately not an updater: it refuses an existing root. Work in an
isolated branch and record the starting commit, local changes, installed kit
version and customizations before editing.

1. Seed the exact old and candidate versions into separate temporary Git
   repositories. Use a fresh npm cache for the candidate and install its pinned
   `js-yaml` dependency in the client runtime. Keep runtime dependencies out of
   staged evidence; `/node_modules` also ignores a symlink.
2. Compare the two seed manifests. Review changes to `engine/`, `schemas/`,
   hooks and templates against local customizations. Apply the reviewed vendor
   delta; do not replace the entire client directory.
3. Merge protocol, skill and wrapper changes deliberately. Keep client conduct
   rules and existing instructions. Shared wrappers use sentinel sections;
   dedicated files such as an existing `CLAUDE.md` are skipped by init and need
   a reviewed pointer update.
4. Preserve `ontology/`, `knowledge/`, `decisions/`, logs, survey scope, accession
   IDs, citations, historical metadata and authored relations. Regenerate
   disposable derived indexes only after authored records validate.
5. Keep the original seed manifest as provenance. Record the new runtime
   version, reviewed file delta and preserved customizations in a separate
   migration record; do not stamp a mixed installation as a pristine seed.
6. Run structural/value validation, dated preflight on selected concepts and
   leaves, query/path recovery, source reads and an opt-in real Git commit.
   Compose with existing hooks rather than replacing them. Test deletion or
   rename attribution and a deliberately broken staged claim in a disposable
   checkout. Confirm local work and index contents are preserved.

Rollback is the migration commit's reviewed inverse or a return to the prior
pilot branch. Never reset a user's dirty checkout to perform a rollback.

## Older custom knowledge bases

A repository with its own catalog schema, concept IDs or knowledge frontmatter
is an import pilot, not a 2.1.0 in-place upgrade. Keep its original records and
consumers intact. Use an explicit, retained mapping to the kit's `K-*` concept
IDs and opaque `L-*` accessions; preserve old IDs as aliases or provenance.
Do not treat representation conversion as human verification of claims.

When an application already owns a root-level `knowledge/` or `ontology/`,
keep it intact and commit `.unknown-knowledge.json` at the repository root:

```json
{"kitRoot": "unknown-knowledge"}
```

The only other supported choice is `{"kitRoot": "."}` for root-level stores.
Keep `--root` pointing at the **repository root**, so source pointers retain
meaning. Every store-reading surface shares this selection. Stage the file
with the migration: commit validation reads the staged selection, and reverse
attribution reads each tree's own selection. Without a selection, two candidate
layouts still refuse rather than guess. Invalid configuration also stops.

Missing review provenance should remain unverified. Missing citations,
unsupported extractor descriptors and source-pointer drift are migration
findings to review, not fields to drop merely to obtain a green verdict.

## Pilot exit criteria

- Fresh install and migration use the published registry artifact and correct
  version, with reproducible commands and output/exit capture.
- Original records and existing application behavior are preserved.
- Agents answer covered questions from followed evidence, identify gaps and
  stop on unknown evidence; a correct answer alone is not protocol compliance.
- A controlled source change is detected, followed by a reviewed index update.
- Record original trial failures separately from prompted corrective runs.

Promote a stable release only after reviewing the pilot's findings. Publishing
the candidate does not certify every imported record or every agent run.
