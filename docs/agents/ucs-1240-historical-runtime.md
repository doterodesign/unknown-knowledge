# Fixed historical migration runtime

The migration compatibility distribution is exactly release
`08066b5f527b9d7d9705a3367bc26dcf080271ad`, beneath the literal path
`payload/engine/compatibility/identity-migration-08066b5`. Its 85 files total
2,478,434 bytes: 49 original engine modules, 12 schemas, the original payload
package scope, root lockfile, LICENSE and NOTICE, plus 20 complete local js-yaml
5.4.1/argparse 2.0.1 package files. No package scripts run. Dependency evidence
binds actual installed bytes; it does not claim npm tarball integrity verification.

The canonical closed subset profile is
`payload/engine/policies/identity-migration-08066b5.json`, SHA-256
`42104db4a8b9ba0b9ebb99379531c094b458e25c9b4194b2f70040f90914dfcf`.
It describes captured file mode 0400. Existing recursive runtime capture retains
all historical bytes and this profile in the same runtime manifest/validation
bundle, without a separate evidence hierarchy or caller-selected runtime path.
The narrow Git ignore exception permits only this fixed dependency subtree.
Actual npm dry-run packaging includes all 85 files.

`verifyMigrationHistoricalRuntime(runtime)` checks the fixed complete subset,
actual file/directory inventory, owned bounded file reads, the profile artifact,
and existing full runtime/executable verification. Extra modules/directories,
symlinks, missing packages, altered bytes, or a rehashed caller manifest do not
replace the fixed profile. It returns actual profile/subset bindings, not a
compatibility, semantic-preservation, human-approval or publication verdict.
The final migration composition must call it around actual bounded execution.

Original historical modules are preserved byte for byte, including modules not
invoked by the migration recipe. Only the fixed structural/value/resolve/derive
entrypoints are designated by the profile. A6 continues inspecting all shipped
code; it additionally checks every historical file hash and admits only the two
original literal Git launch locations under the compatibility subtree. A changed
profile does not waive the process/import guards.

The historical fixture in `tests/fixtures/migration-08066b5` is copied from that
release's `tests/fixtures/derived/store` raw Git blobs. Actual captured-runtime
tests run healthy structural/value checks, term/zero/path retrieval, and generation
plus a successful freshness check for all three ordinary derived artifacts. A
negative fixture reproduces historical resolver exit 0 with unhealthy store output:
exit status alone is not a compatibility predicate.

New validation under the expanded runtime is required before migration publication.
Older evidence remains readable but lacks these historical bytes and the eventual
final migration shim. This slice does not implement final migration semantic
comparison or publication, and does not close the whole migration work item.

The shared `prepared-engine-process.js` collector admits twelve fixed validation,
operation and historical/current retrieval entrypoints. Existing validation uses
the same combined-output cap, deadline and child reaping. Children inherit the
private worker process group. Retrieval accepts only typed query/path requests
and the two fixed Markdown/text replay paths; flag-shaped queries refuse before
spawn, while paths use one literal `--path=value` argument. This is transport,
not semantic proof. A6 pins its complete selector table and launch expression.

The separate [v4 final migration profile](ucs-1240-final-migration.md) now consumes
this distribution for actual semantic comparison and reviewed publication. The
historical files and frozen profile remain unchanged by that integration.

The [installation cutover profile](ucs-1240-installation-cutover.md) additionally
invokes the existing frozen `engine/audit.js` through the literal
`historical-audit` selector and current `engine/audit.js` through `current-audit`.
It retains original outputs, corroborates each actual survey and compares
effective source inputs, findings, suppressions and warnings. These dispatch
additions are pinned in A6; the historical file inventory, profile digest and
original profile entrypoint metadata remain unchanged. Source-bound seeded
protocol/template/fixture evidence is a separate policy artifact and never
modifies the historical compatibility distribution.
