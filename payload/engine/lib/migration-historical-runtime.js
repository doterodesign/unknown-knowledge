/** Verify the one fixed historical distribution inside an actual captured runtime. */
import { opendirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalSha256 } from './canonical-json.js';
import { rawSha256 } from './prepared-evidence.js';
import { directory, readOwnedFile } from './prepared-evidence-files.js';
import { verifyPreparedRuntime } from './prepared-runtime.js';
import { EngineRefusal } from './engine-refusal.js';

const profilePath = 'engine/policies/identity-migration-08066b5.json';
const profileBytes = readFileSync(new URL('../policies/identity-migration-08066b5.json', import.meta.url));
const profile = JSON.parse(profileBytes);
const prefix = 'engine/compatibility/identity-migration-08066b5';
const profileDigest = canonicalSha256(profile);
const profileRow = { path: profilePath, mode: 0o400, size: profileBytes.length, sha256: rawSha256(profileBytes) };
const files = new Map(profile.files.map((row) => [row.path, row]));
const directories = new Set([prefix]);
for (const file of files.keys()) {
  for (let parent = posix.dirname(file); parent.startsWith(`${prefix}/`); parent = posix.dirname(parent)) directories.add(parent);
}
const refuse = () => { throw new EngineRefusal('historical runtime: fixed distribution unavailable or changed'); };

/** Subset integrity only; compatibility and actual semantic execution are separate checks. */
export function verifyMigrationHistoricalRuntime(runtime) {
  try {
    if (profile.root !== prefix || profile.id !== 'identity-migration-08066b5-v1'
      || !isDeepStrictEqual(runtime.manifest.files.filter((row) => row.path.startsWith(`${prefix}/`)), profile.files)
      || !isDeepStrictEqual(runtime.manifest.files.find((row) => row.path === profilePath), profileRow)
      || !readOwnedFile(join(runtime.root, profilePath), profileBytes.length).equals(profileBytes)) refuse();
    // Inspect actual entries as well as manifest rows: extra modules and package
    // resolution directories are outside this fixed reviewed distribution.
    let observed = 0;
    const visit = (path) => {
      directory(join(runtime.root, path));
      const handle = opendirSync(join(runtime.root, path));
      try {
        let entry;
        while ((entry = handle.readSync()) !== null) {
          const relative = `${path}/${entry.name}`;
          if (entry.isDirectory() && directories.has(relative)) { visit(relative); continue; }
          const expected = files.get(relative);
          if (!entry.isFile() || !expected) refuse();
          const bytes = readOwnedFile(join(runtime.root, relative), expected.size);
          if (bytes.length !== expected.size || rawSha256(bytes) !== expected.sha256) refuse();
          observed += 1;
        }
      } finally { handle.closeSync(); }
    };
    directory(runtime.root);
    directory(join(runtime.root, 'engine'));
    directory(join(runtime.root, 'engine/compatibility'));
    visit(prefix);
    if (observed !== files.size) refuse();
    verifyPreparedRuntime(runtime.root, runtime.manifest);
    return { profileDigest, sourceCommit: profile.sourceCommit, root: prefix,
      files: files.size, bytes: profile.files.reduce((total, row) => total + row.size, 0),
      entrypoints: structuredClone(profile.entrypoints) };
  } catch (error) {
    if (error instanceof EngineRefusal || Number.isInteger(error?.errno)) refuse();
    throw error;
  }
}
