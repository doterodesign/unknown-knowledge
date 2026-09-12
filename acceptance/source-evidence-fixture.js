#!/usr/bin/env node
// Synthetic A5 overlay; source URLs belong to the host agent, never the engine.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dump, load } from 'js-yaml';

const repo = fileURLToPath(new URL('..', import.meta.url));
const [destination, variant = 'verified', sourceUrl] = process.argv.slice(2);
if (!destination || !sourceUrl) {
  throw new Error('usage: node acceptance/source-evidence-fixture.js <new-directory> <variant> <source-url>');
}
const setup = spawnSync(process.execPath, [join(repo, 'acceptance/runtime-preflight-fixture.js'), destination, variant], { stdio: 'inherit' });
if (setup.status !== 0) process.exit(setup.status ?? 2);
const kit = join(destination, 'unknown-knowledge');
const leafPath = join(kit, 'knowledge/freshness/301.1-stable-at-the-limit.md');
const leaf = load(readFileSync(leafPath, 'utf8').split('---')[1]);
leaf.citations = [{ source: sourceUrl, accessed: '2026-09-10', authority: 'vendor-doc' }];
writeFileSync(leafPath, `---\n${dump(leaf)}---\n\nConsult the cited vendor guidance for the stable cache recommendation. Local implementation is separate. This leaf does not establish a company retention contract or a telemetry provider.\n`);

// Current rationale must come from the actual lifecycle records, not titles.
const decisions = join(kit, 'decisions');
const catalogPath = join(decisions, '_catalog.yaml');
const catalog = load(readFileSync(catalogPath, 'utf8'));
const entries = [
  { id: 'D-402', title: 'Stable cache decision', status: 'superseded', decision: 'Previously adopt a 180-day stable limit.', supersedes: [], 'superseded-by': ['D-403'] },
  { id: 'D-403', title: 'Current stable cache decision', status: 'accepted', decision: 'Adopt a 365-day stable limit for the synthetic client. Annual source review is the team rationale. Vendor guidance is advisory, not a company retention contract.', supersedes: ['D-402'], 'superseded-by': [] },
];
for (const entry of entries) {
  const file = `entries/${entry.id}.yaml`;
  catalog.entries.push({ id: entry.id, title: entry.title, file });
  writeFileSync(join(decisions, file), dump({ 'schema-version': 1, entries: [{
    ...entry, category: 'architecture', date: '2026-09-09', deciders: ['fixture-steward'],
    context: 'Controlled source-evidence acceptance scenario.',
    'relates-to': { concepts: ['K-102'], leaves: ['L-000301'], decisions: [] },
  }] }));
}
writeFileSync(catalogPath, dump(catalog));
writeFileSync(join(destination, 'survey-scope.yaml'), dump({ 'schema-version': 1, include: ['src'], exclude: [] }));
cpSync(join(repo, 'payload/hooks'), join(kit, 'hooks'), { recursive: true });
writeFileSync(join(destination, 'fixture-version.json'), JSON.stringify({
  fixture: 'source-evidence-v1', parent: 'runtime-preflight-v1', variant,
  today: '2026-09-10', sourceUrl,
  kitVersion: JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version,
}, null, 2) + '\n');
