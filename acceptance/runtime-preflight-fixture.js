#!/usr/bin/env node
// Synthetic A5 overlay on the existing time-facet fixture. Never edits the
// source fixture or promotes live knowledge. Destination must not exist.
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, load } from 'js-yaml';

const repo = fileURLToPath(new URL('..', import.meta.url));
const [destination, variant = 'verified'] = process.argv.slice(2);
if (!destination || !['verified', 'stale', 'draft', 'proposed', 'missing-stage', 'missing-date', 'malformed'].includes(variant)) {
  throw new Error('usage: node acceptance/runtime-preflight-fixture.js <new-directory> [verified|stale|draft|proposed|missing-stage|missing-date|malformed]');
}
mkdirSync(destination); // Refuse an existing destination rather than overwrite it.
const kit = join(destination, 'unknown-knowledge');
cpSync(join(repo, 'tests/fixtures/structural-validator/time-facet'), kit, { recursive: true });
cpSync(join(kit, 'src'), join(destination, 'src'), { recursive: true });
for (const name of ['engine', 'schemas', 'protocol']) {
  cpSync(join(repo, 'payload', name), join(kit, name), { recursive: true });
}
cpSync(join(repo, 'node_modules'), join(destination, 'node_modules'), { recursive: true });
// Runtime dependencies must not become Git snapshot evidence in a trial.
writeFileSync(join(destination, '.gitignore'), '/node_modules\n');
writeFileSync(join(destination, 'AGENTS.md'), 'Read unknown-knowledge/protocol/AGENTS.md and follow its runtime loop.\n');

const directory = join(kit, 'knowledge/freshness');
for (const file of readdirSync(directory)) {
  const path = join(directory, file);
  const [, frontmatter] = readFileSync(path, 'utf8').split('---');
  const leaf = load(frontmatter);
  leaf.citations = [{ source: 'src/freshness.ts', accessed: '2026-09-10', authority: 'vendor-doc' }];
  // Keep the original IDs, catalog, facets, and time classes. This controlled
  // evaluation's current date is 2026-09-10; only K-000001 is newly dated.
  if (leaf.id === 'K-000001') {
    leaf.verified = variant === 'stale' ? '2025-09-08' : '2026-09-09';
    if (variant === 'draft' || variant === 'proposed') leaf.facets.stage = variant;
    if (variant === 'missing-stage') delete leaf.facets.stage;
    if (variant === 'missing-date') delete leaf.verified;
    leaf.relates = { supersedes: ['K-000007'] };
  }
  if (leaf.id === 'K-000005') leaf['cross-references'] = { 'class-elsewhere': ['K-000006'] };
  if (leaf.id === 'K-000006') leaf.relates = { 'depends-on': ['K-000007'] };
  const bodies = {
    'K-000001': 'For the current stable freshness boundary, read the stable member in src/freshness.ts. This replaces K-000007.\n',
    'K-000005': 'This is a signpost. Follow the class-elsewhere target for the current freshness guide.\n',
    'K-000006': 'The freshness guide needs K-000007 before selecting the applicable stable limit.\n',
    'K-000007': 'This undated guide is replaced by K-000001. Follow that leaf before answering the current stable limit.\n',
  };
  const body = bodies[leaf.id] ?? 'Related historical boundary example; read src/freshness.ts for the implemented limits.\n';
  writeFileSync(path, `---\n${dump(leaf, { lineWidth: 100 })}---\n\n${body}`);
}
if (variant === 'malformed') {
  writeFileSync(join(kit, 'decisions/entries/D-401-frontmatter-v2.yaml'), 'entries: [broken\n');
}
writeFileSync(join(destination, 'fixture-version.json'), JSON.stringify({
  fixture: 'runtime-preflight-v2', variant, today: '2026-09-10',
  kitVersion: JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version,
  source: 'tests/fixtures/structural-validator/time-facet',
}, null, 2) + '\n');
console.log(destination);
