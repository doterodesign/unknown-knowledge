// Test-only scale fixture: one development installation grown to N records.
//
// Copies a materialized development installation and adds N synthetic
// "customer complaint" leaves with canonical IDs, catalog rows, identity
// allocations and Subject assignments drawn from the installation's existing
// registry. Content is repetitive on purpose; the fixture measures load, index
// and aggregation cost, not ranking quality.
//
// Usage: node acceptance/retrieval/materialize-scale.js SOURCE_INSTALLATION DESTINATION COUNT
import { cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const THEMES = ['late delivery', 'damaged packaging', 'billing error', 'rude support', 'missing parts',
  'slow refund', 'wrong size', 'app crash', 'account lockout', 'hidden fees'];
const CHANNELS = ['email', 'phone', 'chat', 'store'];

/** Deterministic pseudo-random sequence so every run writes identical bytes. */
function* sequence(seed) {
  let x = seed;
  for (;;) { x = (x * 1103515245 + 12345) % 2147483648; yield x; }
}

export function materializeScale(source, destination, count) {
  if (!Number.isInteger(count) || count < 1 || count > 900000) throw new Error('COUNT must be 1..900000');
  cpSync(source, destination, { recursive: true });
  const kit = join(destination, 'unknown-knowledge');
  const identityFile = join(kit, '_identity.yaml');
  const catalogFile = join(kit, 'knowledge/_catalog.yaml');
  const identity = JSON.parse(readFileSync(identityFile, 'utf8'));
  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
  const registry = JSON.parse(readFileSync(join(kit, 'subjects/registry.yaml'), 'utf8'));
  const subjects = registry.subjects.filter((s) => s.status === 'active').map((s) => s.id);
  const publication = identity.allocations.find((a) => a.publication)?.publication;
  const first = 1 + Math.max(...identity.allocations.filter((a) => a.kind === 'knowledge').map((a) => Number(a.id.slice(2))));
  const random = sequence(count);
  const pick = (list) => list[random.next().value % list.length];
  mkdirSync(join(kit, 'knowledge/scale'), { recursive: true });
  for (let i = 0; i < count; i += 1) {
    const id = `K-${String(first + i).padStart(6, '0')}`;
    const theme = pick(THEMES);
    const channel = pick(CHANNELS);
    const record = {
      'schema-version': 3,
      id,
      domain: 'engineering',
      heading: `Customer complaint ${first + i}: ${theme}`,
      terms: ['customer complaint', theme],
      subjects: [pick(subjects)],
      citations: [{ source: `sources/complaints/${id}.txt` }],
      facets: { stage: 'verified' },
      verified: '2026-09-19',
      volatility: 'static',
    };
    const body = `A customer reported ${theme} through ${channel}.`;
    const file = `scale/${id}.md`;
    writeFileSync(join(kit, 'knowledge', file), `---\n${JSON.stringify(record, null, 2)}\n---\n\n# ${record.heading}\n\n${body}\n`);
    catalog.entries.push({ id, title: record.heading, file });
    identity.allocations.push({ id, kind: 'knowledge', state: 'allocated', ...(publication ? { publication } : {}) });
  }
  writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(identityFile, `${JSON.stringify(identity, null, 2)}\n`);
  return { destination, added: count, firstId: `K-${String(first).padStart(6, '0')}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [source, destination, count] = process.argv.slice(2);
  if (!source || !destination || !count) throw new Error('usage: node materialize-scale.js SOURCE_INSTALLATION DESTINATION COUNT');
  console.log(JSON.stringify(materializeScale(source, destination, Number(count))));
}
