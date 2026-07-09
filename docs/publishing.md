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
5. **Provision the CI token.** Create an npm granular automation token
   scoped to publish `unknown-knowledge` only, and store it as the
   `NPM_TOKEN` repository secret (or configure npm Trusted Publishing for
   this GitHub repo, which removes the long-lived token entirely — preferred
   when available).

## Release-time steps (in-repo, deliberate)

1. Flip `"private": true` off in `package.json`. It is kept on until the
   first real release as a publish guard — flipping it is a release
   decision, not housekeeping.
2. Set the release version in `package.json` per D-021 semantics
   (MAJOR = store schema-version bump or breaking engine CLI contract;
   MINOR = new extractor kinds / engine surfaces / fixture vintage;
   PATCH = fixes/docs).
3. Move the CHANGELOG's Unreleased entries under the new version heading
   with today's date.
4. Tag `vX.Y.Z` and push the tag; CI runs lint, tests, acceptance, then
   publishes with provenance.

Note: embedding LICENSE + NOTICE into the payload manifest (so every seeded
repo provably carries them) rides KK-17, which owns `kit.manifest.yaml` and
`cli/`.

## npx packaging (KK-19)

`package.json` maps `bin` `unknown-knowledge` → `cli/init.js`, and the
`files` allowlist ships exactly `cli/`, `payload/`, `LICENSE`, `NOTICE`, and
`README.md` — the kit's `fixtures/`, `tests/`, `acceptance/`, and docs stay
out of the tarball (the same D-007 posture as the payload manifest, one
layer up). Verify the tarball contents with `npm pack --dry-run` before a
release.

The real `npx unknown-knowledge init` only works **post-publish** — while
`private: true` guards the package, test the cold-run locally via
`node cli/init.js init` (or `npm link` and then `unknown-knowledge init`).
