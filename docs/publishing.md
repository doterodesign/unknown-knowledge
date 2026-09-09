# Publishing `unknown-knowledge`

Release policy: bare `unknown-knowledge` is the one canonical package
(D-018); the license is Apache-2.0 (D-020); version semantics are semver per
D-021. Publishing runs from CI only — `.github/workflows/publish.yml`
publishes on `v*.*.*` tags with npm provenance attestation via GitHub
Actions OIDC (`npm publish --provenance --access public`, `id-token:
write`). Never publish from a laptop: provenance attestation is the point.

## Manual account-side steps (cannot be done from this repo)

These are npm/GitHub account operations the maintainer performs once,
before the first publish:

1. **Verify the `unknown-creatives` npm org reservation.** D-018 records the
   org as reserved for brand protection — verify it exists and is controlled
   by the right account (https://www.npmjs.com/org/unknown-creatives).
2. **Enable npm publish 2FA.** On npmjs.com, account Settings → Two-Factor
   Authentication → require 2FA for both authorization and writes. After the
   first publish, additionally set the package's publishing access to
   "Require two-factor authentication or an automation token".
3. **Restrict publish access to the org.** Package Settings → Publishing
   access: limit maintainers to the `unknown-creatives` org; no individual
   accounts outside it.
4. **Re-verify name availability at publish time.** D-017's availability
   check is a point-in-time fact from 2026-07-08 — confirm `unknown-knowledge`
   is still unpublished immediately before the first release.
5. **Authenticate the first publish.** Before the package exists, its npm
   settings cannot hold a trusted-publisher configuration. Provision a
   short-lived granular token with the minimum permissions npm permits for
   creating this unscoped package, and store it as the `NPM_TOKEN` secret in
   `doterodesign/unknown-knowledge`. Never paste a token into an issue, PR, or
   release log. Confirm its expiry and publishing permissions before tagging.
6. **After the first publish, configure Trusted Publishing.** In the npm
   package settings, authorize GitHub user `doterodesign`, repository
   `unknown-knowledge`, workflow filename `publish.yml`, with no environment
   name (the job declares none). Permit direct `npm publish`. Verify a
   subsequent OIDC publish succeeds before revoking the bootstrap token and
   deleting the GitHub secret. The workflow supports both paths and installs
   npm 11.17.0 explicitly because Node 22's bundled npm 10 cannot authenticate
   through Trusted Publishing. See [npm's current setup guide](https://docs.npmjs.com/trusted-publishers/).

## Release-time steps (in-repo, deliberate)

1. Confirm `package.json` does not have `"private": true`. UCS-955 removes
   the initial publish guard for the 2.1.0 release.
2. Set the release version in `package.json` and both root version fields in
   `package-lock.json` per D-021 semantics
   (MAJOR = store schema-version bump or breaking engine CLI contract;
   MINOR = new extractor kinds / engine surfaces / fixture vintage;
   PATCH = fixes/docs).
3. Move the CHANGELOG's Unreleased entries under the new version heading
   with today's date.
4. Run lint, tests, acceptance, `npm audit`, and `npm pack --dry-run`.
   Verify the tarball's allowlist and all payload-manifest source files.
5. Merge the release change, then tag `vX.Y.Z` at the merged commit and push
   the tag; CI runs lint, tests, acceptance, then
   `scripts/check-tag-version.js`, then publishes with provenance.
6. Verify the registry version, provenance, tarball, and cold install below.
   Create the GitHub Release only after npm publication succeeds.

**The version lands in the manifest BEFORE the tag exists.** Step 2 is not
bookkeeping you can do afterwards. The workflow fires on the tag and reads
the manifest that the tag points at, so a `v1.0.0` tag on a commit whose
`package.json` still reads `0.0.0` would publish `0.0.0` under a tag claiming
otherwise. `scripts/check-tag-version.js` refuses that before `npm publish`
runs, because a published version is **immutable** — the mistake is not
correctable, only superseded, and every repo seeded from the wrong artifact
in the meantime carries a birth certificate naming a release that never
existed (D-021).

If the guard fires, nothing was published. Fix the manifest (or the tag),
delete the bad tag, and push again:

```
node scripts/check-tag-version.js v1.0.0    # run it locally first
git tag -d v1.0.0 && git push origin :v1.0.0
```

`cli/kit.manifest.yaml` includes LICENSE and NOTICE in every seeded repo.

## npx packaging (KK-19)

`package.json` maps `bin` `unknown-knowledge` → `cli/init.js`, and the
`files` allowlist ships exactly `cli/`, `payload/`, `LICENSE`, `NOTICE`, and
`README.md` — the kit's `fixtures/`, `tests/`, `acceptance/`, and docs stay
out of the tarball (the same D-007 posture as the payload manifest, one
layer up). Verify the tarball contents with `npm pack --dry-run` before a
release.

The shipped extractor and adapter sample pairs under `payload/` are
intentional (D-009). They must remain in the tarball: the init manifest
references them. The excluded material is the kit's root `fixtures/`,
`tests/`, and `acceptance/`, not those client-facing sample pairs.

## Verify the published release

Use a new temporary directory and a fresh npm cache so a local checkout or
previous npx download cannot satisfy the command. Substitute the released
version for `2.1.0` on later releases:

```sh
release_probe=$(mktemp -d)
mkdir "$release_probe/repo"
git -C "$release_probe/repo" init
cd "$release_probe/repo"
npm_config_cache="$release_probe/cache" npx --yes unknown-knowledge@2.1.0 init --yes
npm install --save-dev js-yaml
node unknown-knowledge/engine/validate.js --root unknown-knowledge
npm view unknown-knowledge@2.1.0 version dist.attestations --json
```

Confirm `unknown-knowledge/kit.manifest.yaml` records the expected kit
version, the wrapper exists, and LICENSE/NOTICE were seeded. Download the
registry tarball with `npm pack unknown-knowledge@2.1.0`, inspect its contents,
and verify the provenance statement identifies this repository, tag, and
publish workflow. Only then close the release issue.
