#!/usr/bin/env node
/**
 * The release tag and the package version must be the same thing (UCS-937).
 *
 * The publish workflow fires on a `v*.*.*` tag and runs the full gate before
 * publishing — but nothing checked that the tag agreed with the manifest.
 * Pushing `v1.0.0` while package.json still read `0.0.0` would publish `0.0.0`
 * to the registry, under a tag claiming otherwise.
 *
 * A published version is IMMUTABLE. That mistake is not correctable, only
 * superseded — and every repo seeded from the wrong artifact in the meantime
 * carries a birth certificate naming a release that does not exist (D-021: the
 * version stamp seeded into a client repo must name a real released version).
 *
 * So this runs BEFORE `npm publish`, and refuses rather than guesses. It is a
 * plain script, not a YAML `if:`, because a guard nobody can run locally is a
 * guard nobody tests.
 *
 * Usage:  node scripts/check-tag-version.js [tag]
 * The tag defaults to $GITHUB_REF_NAME, which Actions sets to `v1.0.0` for a
 * tag push.
 */
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Exactly `vMAJOR.MINOR.PATCH`, matching the workflow's `v*.*.*` trigger. */
const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;

/**
 * @param {string | undefined} tag the release tag, e.g. `v1.0.0`
 * @param {string} version the version in package.json
 * @returns {string | null} why the release must not proceed, or null
 */
export function tagVersionProblem(tag, version) {
  if (typeof tag !== 'string' || tag === '') {
    return 'no tag to check — expected $GITHUB_REF_NAME (e.g. v1.0.0) or an argument';
  }
  const match = RELEASE_TAG.exec(tag);
  if (match === null) {
    return `tag ${JSON.stringify(tag)} is not a release tag — expected vMAJOR.MINOR.PATCH`;
  }
  if (match[1] !== version) {
    return `tag ${JSON.stringify(tag)} names version ${JSON.stringify(match[1])}, `
      + `but package.json says ${JSON.stringify(version)} — a published version is immutable, `
      + 'so fix the manifest (or the tag) and push again; nothing was published';
  }
  return null;
}

/** @returns {number} an exit code */
export function main(argv, { stderr = process.stderr, stdout = process.stdout } = {}) {
  const tag = argv[0] ?? process.env.GITHUB_REF_NAME;
  const manifest = fileURLToPath(new URL('../package.json', import.meta.url));
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'));

  const problem = tagVersionProblem(tag, version);
  if (problem !== null) {
    stderr.write(`check-tag-version: ${problem}\n`);
    return 1;
  }
  stdout.write(`check-tag-version: tag ${tag} agrees with package.json ${version}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
