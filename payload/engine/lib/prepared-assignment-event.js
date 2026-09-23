/** One bounded raw event capture inside the runner's verified candidate snapshot. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { load, YAMLException } from 'js-yaml';
import { assignmentEventDigest, validateAssignmentEventMetadata } from './assignment-event.js';
import { CapturedInputError } from './canonical-json.js';
import { isIdentityUuid } from './record-identity.js';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** Internal retention read only; the fixed caller supplies the verified snapshot root. */
export function readPreparedSubjectBytes({ root, file, maxBytes }) {
  const match = /^(?:unknown-knowledge\/)?subjects\/(registry\.yaml|_assignments\/([^/]+)\.yaml)$/.exec(file);
  if (!match || (match[2] !== undefined && !isIdentityUuid(match[2])) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) return null;
  return readPreparedBytes({ root, file, maxBytes });
}

/** Fixed candidate identity path; never an arbitrary-path read capability. */
export function readPreparedSplitIdentityBytes({ root, candidate, maxBytes }) {
  if (!['.', 'unknown-knowledge'].includes(candidate?.kitPath) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) return null;
  const file = `${candidate.kitPath === '.' ? '' : `${candidate.kitPath}/`}_identity.yaml`;
  return readPreparedBytes({ root, file, maxBytes });
}

/** Fixed reconsideration candidate identity path; source mode is checked by its owner. */
export function readPreparedReconsiderationIdentityBytes({ root, candidate, maxBytes }) {
  if (!['.', 'unknown-knowledge'].includes(candidate?.kitPath) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) return null;
  const file = `${candidate.kitPath === '.' ? '' : `${candidate.kitPath}/`}_identity.yaml`;
  return readPreparedBytes({ root, file, maxBytes });
}

function readPreparedBytes({ root, file, maxBytes }) {
  let fd;
  try {
    const parts = file.split('/');
    for (let index = 1; index < parts.length; index++) if (!lstatSync(join(root, ...parts.slice(0, index))).isDirectory()) return null;
    if (!lstatSync(join(root, file)).isFile()) return null;
    fd = openSync(join(root, file), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size > maxBytes) return null;
    const chunks = []; let position = 0;
    while (position < stat.size) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, stat.size - position));
      const count = readSync(fd, chunk, 0, chunk.length, position);
      if (count === 0) return null;
      chunks.push(chunk.subarray(0, count)); position += count;
    }
    if (fstatSync(fd).size !== stat.size) return null;
    return Buffer.concat(chunks, position);
  } catch (error) { if (Number.isInteger(error?.errno)) return null; throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
}

/**
 * The fixed worker supplies its actual verified snapshot root and gate output.
 * This function corroborates bytes/metadata, not domain acceptance or approval.
 * maxEventBytes covers this one retention read, not earlier gate parsing.
 */
export function capturePreparedAssignmentEvent({ root, source, candidate, eventId, maxEventBytes, gate }) {
  if (!isIdentityUuid(eventId) || !Number.isSafeInteger(maxEventBytes) || maxEventBytes <= 0
    || !['.', 'unknown-knowledge'].includes(candidate?.kitPath)) return null;
  const prefix = candidate.kitPath === '.' ? '' : `${candidate.kitPath}/`;
  const file = `${prefix}subjects/_assignments/${eventId}.yaml`;
  const hint = gate?.eventSource;
  if (gate?.mode !== 'read-only-prepared-assignment' || gate.checks?.source?.status !== 'passed'
    || gate.checks?.history?.status !== 'passed'
    || !isDeepStrictEqual(gate.inputs?.before, { kind: 'commit', ...source })
    || !isDeepStrictEqual(gate.inputs?.candidate, { kind: 'commit', ...candidate })
    || !closed(hint, ['file', 'eventId', 'eventDigest', 'candidate']) || hint.file !== file || hint.eventId !== eventId
    || !isDeepStrictEqual(hint.candidate, candidate)) return null;
  try {
    const bytes = readPreparedSubjectBytes({ root, file, maxBytes: maxEventBytes });
    if (bytes === null) return null;
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes)) return null;
    const event = load(text);
    if (!validateAssignmentEventMetadata(event).ok || event.event !== eventId
      || assignmentEventDigest(event) !== hint.eventDigest) return null;
    return { eventSource: { file, eventId, eventDigest: hint.eventDigest, candidate: { ...candidate } }, bytes };
  } catch (error) {
    if (error instanceof YAMLException || error instanceof CapturedInputError || Number.isInteger(error?.errno)) return null;
    throw error;
  }
}
