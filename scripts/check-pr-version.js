#!/usr/bin/env node
// Repository maintenance only; never shipped as an engine surface.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { tagVersionProblem } from './check-tag-version.js';

function parts(version) {
  if (typeof version !== 'string' || version.includes('\n') || tagVersionProblem(`v${version}`, version)) return null;
  const [core, rc] = version.split('-rc.');
  return [...core.split('.').map(BigInt), rc === undefined ? null : BigInt(rc)];
}

export function versionAdvances(before, after) {
  const a = parts(before), b = parts(after);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return a[3] !== null && (b[3] === null || b[3] > a[3]);
}

export function main(base) {
  try {
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(base ?? '')) throw new Error('supply the exact PR base commit hash');
    const previous = (file) => execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
    const oldVersion = JSON.parse(previous('package.json')).version;
    if (!versionAdvances(oldVersion, version)) throw new Error(`version must advance from ${oldVersion}; found ${version}`);
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    if (lock.version !== version || lock.packages?.['']?.version !== version) throw new Error('both package-lock versions must match package.json');
    const notes = readFileSync('CHANGELOG.md', 'utf8');
    if (notes === previous('CHANGELOG.md')) throw new Error('every PR must update CHANGELOG.md');
    if (!notes.split(/\r?\n/).some((line) => line.startsWith(`## [${version}] - `))) throw new Error(`CHANGELOG.md needs a heading for ${version}`);
    process.stdout.write(`check-pr-version: ${oldVersion} → ${version}; manifests and changelog agree\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`check-pr-version: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv[2]);
