/** Shared owned-file primitives for fixed validation and candidate-review bundles. */
import { constants, closeSync, fchmodSync, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { EngineRefusal } from './engine-refusal.js';

const refuse = (message) => { throw new EngineRefusal(`prepared evidence: ${message}`); };
export const syncDirectory = (path) => { const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); } };

export function directory(path, create = false) {
  if (create) { try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) {
    refuse('managed directories must be owned by the runner user, regular directories, and mode 0700');
  }
}

export function readOwnedFile(path, limit, synchronize = false) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o400
      || !Number.isSafeInteger(stat.size) || stat.size > limit) refuse('existing retained bytes or mode differ, or exceed limit');
    const chunks = []; let total = 0;
    const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1));
    let size;
    while ((size = readSync(fd, buffer, 0, Math.min(buffer.length, limit - total + 1), null)) !== 0) {
      total += size;
      if (total > limit) refuse('retained bytes exceed limit');
      chunks.push(Buffer.from(buffer.subarray(0, size)));
    }
    if (total !== stat.size) refuse('retained bytes changed while reading');
    if (synchronize) fsyncSync(fd);
    return Buffer.concat(chunks, total);
  } finally { closeSync(fd); }
}

export function verifyFile(path, expected, synchronize = false) {
  if (!readOwnedFile(path, expected.length, synchronize).equals(expected)) refuse('existing retained bytes or mode differ');
}

export function finalizedFile(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fchmodSync(fd, 0o400); fsyncSync(fd); } finally { closeSync(fd); }
}

export function install(source, destination, bytes) {
  try { linkSync(source, destination); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  verifyFile(destination, bytes);
}

