// Test-only: the development-v2 corpus as 2.x installations (UCS-1581).
//
// The agent comparison needs the same eight installations for both runtimes.
// This builds them with the original 08066b5 runtime, one record per reviewed
// source passage, the way materialize.js builds a pilot task. Each record's
// kind, lifecycle, scope and supersession come from the committed canonical
// fixture; its source file comes from the curation record decisions. The
// current runtime's copy is then made from these with arms.js (migrate.js on
// the same stores), so both runtimes hold identical text.
//
// 2.x cannot express everything the canonical fixture records: Subjects are
// dropped, and a Knowledge record that is neither proposed nor draft becomes
// `verified`, as in the pilot materializer.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { materializeCorpusInstallation } from './materialize.js';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const canonical = join(repository, 'fixtures/canonical');
const decisions = JSON.parse(readFileSync(join(repository,
  'acceptance/retrieval/development-v2/curation-review/record-decisions.json'), 'utf8')).records;

/** The canonical record entries of one installation, by 3.0 ID. */
function canonicalEntries(installation) {
  const kit = join(canonical, installation, 'unknown-knowledge');
  const byId = new Map();
  const yaml = (file) => load(readFileSync(file, 'utf8'));
  const dir = (path) => existsSync(path) ? readdirSync(path) : [];
  for (const file of dir(join(kit, 'ontology/classes'))) {
    for (const entry of yaml(join(kit, 'ontology/classes', file)).entries) byId.set(`ontology:${entry.id}`, entry);
  }
  for (const file of dir(join(kit, 'decisions/entries'))) {
    for (const entry of yaml(join(kit, 'decisions/entries', file)).entries) byId.set(`decision:${entry.id}`, entry);
  }
  // Proposals sit in knowledge/proposals/; accepted records at the top.
  const leaves = dir(join(kit, 'knowledge')).map((f) => join('knowledge', f))
    .concat(dir(join(kit, 'knowledge/proposals')).map((f) => join('knowledge/proposals', f)));
  for (const file of leaves.filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(kit, file), 'utf8');
    const entry = load(text.split(/^---$/m)[1]);
    byId.set(`knowledge:${entry.id}`, entry);
  }
  return byId;
}

const STORE = { ontology: 'ontology', knowledge: 'knowledge', decision: 'decisions' };

/** Build specs for every canonical installation. */
export function corpusSpecs() {
  const inventory = JSON.parse(readFileSync(join(canonical, 'records.json'), 'utf8'));
  const sourceOf = new Map(decisions.map((row) => [`${row.installation}:${row.source.passage}`, row.source.file]));
  return inventory.installations.map(({ installation, records }) => {
    const entries = canonicalEntries(installation);
    const organization = records.length ? installation : installation;
    let spare = 0;
    const rows = records.map((record) => {
      const passage = record.passage ?? record.excerpt.split('/').at(-1).replace(/\.txt$/, '');
      const kind = record.kind === 'decisions' ? 'decision' : record.kind;
      const entry = entries.get(`${kind}:${record.id}`);
      if (!entry) throw new Error(`${installation}: no canonical entry for ${kind} ${record.id}`);
      const origin = sourceOf.get(`${installation}:${passage}`);
      if (!origin) throw new Error(`${installation}: no reviewed source for passage ${passage}`);
      const lifecycle = kind === 'knowledge' ? (entry.facets?.stage ?? 'verified')
        : entry.status === 'deprecated' ? 'retired' : entry.status;
      const proposal = record.id.startsWith('proposal:');
      const legacyId = proposal ? `${kind === 'knowledge' ? 'L' : kind === 'decision' ? 'D' : 'K'}-9${String(++spare).padStart(5, '0')}` : undefined;
      return {
        id: `${installation}/${STORE[kind]}/${record.id}`,
        ...(legacyId ? { legacyId } : {}),
        passage,
        source: origin.replace(/^acceptance\/retrieval\//, 'sources/').replace(/sources\/(pilot|development-v2)\/sources\//, 'sources/$1/'),
        origin: join(repository, origin),
        lifecycle: kind === 'knowledge' && ['draft', 'proposed'].includes(lifecycle) ? 'proposed' : lifecycle,
        scope: entry.applies?.jurisdictions ?? null,
        supersedes: (entry.supersedes ?? []).map((id) => `${installation}/decisions/${id}`),
      };
    });
    return { id: `corpus-${installation}`, organization, records: rows };
  });
}

/** Build all eight installations under `destination`; returns their inventories by name. */
export function materializeCorpus(destination, runtime) {
  mkdirSync(destination);
  return Object.fromEntries(corpusSpecs().map((spec) => {
    const name = spec.id.replace(/^corpus-/, '');
    return [name, materializeCorpusInstallation(spec, join(destination, name), runtime)];
  }));
}
