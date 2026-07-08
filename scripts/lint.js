#!/usr/bin/env node
/**
 * Zero-dependency lint (D-002): recursively syntax-checks every .js/.mjs/.cjs
 * file with `node --check`. Skips node_modules, .git, and fixture trees —
 * acceptance and extractor fixtures deliberately contain malformed shapes
 * (PRD §9.2) and must never fail the kit's own lint.
 *
 * Usage: node scripts/lint.js [root-dir]   (defaults to the repo root)
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const SKIP_DIRS = new Set(['node_modules', '.git', 'fixtures', 'extractor-fixtures']);
const LINTABLE = /\.(js|mjs|cjs)$/;

function collect(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(join(dir, entry.name), out);
    } else if (entry.isFile() && LINTABLE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const root = process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url));
const files = collect(root, []).sort();

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    process.stderr.write(`${relative(root, file)}\n${result.stderr}\n`);
  }
}

console.log(`lint: checked ${files.length} file${files.length === 1 ? '' : 's'}, ${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);
