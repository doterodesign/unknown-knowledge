// Synthetic UCS-1224 walkthrough fixture. Never shipped in the init payload.
// Preparation authors the baseline only; no repair or approval is automated.
import { chmodSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as yaml from 'js-yaml';

const kit = fileURLToPath(new URL('../..', import.meta.url));
export const TODAY = '2026-09-10';

export function prepareReflectionFixture(root) {
  function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`);
    return result.stdout;
  }
  function write(path, text) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const record = (path, value) => write(`unknown-knowledge/${path}`, yaml.dump(value, { lineWidth: 100 }));
  const envelope = (store, entries) => ({ 'schema-version': 1, store, entries });
  mkdirSync(root, { recursive: true });
  run(process.execPath, [join(kit, 'cli/init-copy.js'), '--target', root]);
  symlinkSync(join(kit, 'node_modules'), join(root, 'node_modules'), 'dir');
  write('.gitignore', 'node_modules/\n');
  write('survey-scope.yaml', yaml.dump({ 'schema-version': 1, include: ['src', 'docs'], exclude: [] }));
  write('src/formats.ts', "export const FORMATS = ['png', 'svg'];\n");
  write('src/delivery.ts', "export const DELIVERY = ['archive', 'manifest'];\n");
  write('src/locales.ts', "export const LOCALES = ['en', 'fr'];\n");
  write('docs/handbook.md', '# Synthetic handbook\n\n## Canvas output\nIn this fixture, canvas output means the export format in src/formats.ts.\nThe supported formats are PNG and SVG.\n\n## Delivery\nThe delivery profile in src/delivery.ts requires an archive and a manifest.\n\n## Locale\nThe locale list is owned by src/locales.ts. It is unrelated to canvas output.\n');
  const concepts = [
    ['K-101', 'Export format', 'src/formats.ts', 'FORMATS', ['png', 'svg']],
    ['K-102', 'Delivery profile', 'src/delivery.ts', 'DELIVERY', ['archive', 'manifest']],
    ['K-103', 'Locale', 'src/locales.ts', 'LOCALES', ['en', 'fr']],
  ].map(([id, term, source, symbol, values]) => ({
    id, term, class: '100-product', summary: `See ${source}.`,
    'source-of-truth': [source], status: 'active', 'last-verified': TODAY,
    enumerates: [{ kind: 'ts-const-array', source, symbol, values }],
  }));
  record('ontology/classes/100-product.yaml', { 'schema-version': 1, entries: concepts });
  record('ontology/_catalog.yaml', envelope('ontology', concepts.map(c => ({
    id: c.id, title: c.term, file: 'classes/100-product.yaml',
  }))));
  const leaves = [
    { id: 'L-000100', heading: 'Image encoding guidance', terms: ['encoding'], concepts: ['K-101'],
      body: 'The supported formats are PNG and SVG. See docs/handbook.md, Canvas output.' },
    { id: 'L-000200', heading: 'Packaging checklist', terms: ['packaging'], concepts: [],
      body: 'Delivery requires an archive and a manifest. See docs/handbook.md, Delivery.' },
  ];
  const leafPath = leaf => `L-00/${leaf.id}.md`;
  record('knowledge/_catalog.yaml', envelope('knowledge', leaves.map(l => ({ id: l.id, title: l.heading, file: leafPath(l) }))));
  for (const leaf of leaves) {
    const { body, ...fields } = leaf;
    write(`unknown-knowledge/knowledge/${leafPath(leaf)}`, `---\n${yaml.dump({
      'schema-version': 2, ...fields, domain: 'product', edition: 1,
      facets: { domain: 'product', form: 'reference', anchor: 'world', stage: 'verified' },
      verified: TODAY, volatility: 'stable', operations: [], applies: { jurisdictions: [] },
      citations: [{ source: 'docs/handbook.md', accessed: TODAY, authority: 'fixture-handbook' }],
      notes: [{ type: 'scope', text: 'Synthetic fixture only; no live company claims.' },
        { type: 'revision', date: TODAY, text: 'Initial reviewed fixture record.' }],
      provenance: { author: 'fixture-steward', 'skill-version': 'kb-build@2.1.0' },
    })}---\n\n${body}\n`);
  }
  for (const [registry, values] of Object.entries({ domains: ['product'], form: ['reference'],
    anchor: ['world'], stage: ['draft', 'verified'], 'authority-tiers': ['fixture-handbook'] })) {
    record(`knowledge/_registries/${registry}.yaml`, {
      'schema-version': 1, store: 'knowledge', registry,
      ...(registry === 'domains' ? { hierarchical: true } : {}),
      values: values.map(value => ({ value, gloss: `Fixture ${value}.`,
        warrant: 'L-000100 and L-000200; draft is used during their reviewed kb-build revisions.', decision: 'D-101', minted: TODAY })),
    });
  }
  record('decisions/_catalog.yaml', envelope('decisions', [{ id: 'D-101', title: 'Fixture vocabulary', file: 'entries/D-101.yaml' }]));
  record('decisions/entries/D-101.yaml', { 'schema-version': 1, entries: [{ id: 'D-101',
    title: 'Fixture vocabulary', category: 'governance', status: 'accepted', date: TODAY,
    deciders: ['fixture-steward'], context: 'Two synthetic handbook records need classification.',
    decision: 'Mint the fixture classifications for the two cited leaves and their draft revisions.',
    'relates-to': { leaves: ['L-000100', 'L-000200'] },
  }] });
  let suffix = 0;
  function finding(concept, summary, session, date) {
    run(process.execPath, [join(root, 'unknown-knowledge/engine/log-entry.js'), 'create', '--log', 'findings',
      '--root', join(root, 'unknown-knowledge'), '--date', date, '--suffix', String(++suffix).padStart(8, '0'),
      '--entry', JSON.stringify({ trigger: 'retrieval-struggle', summary, consulted: { concepts: [concept] }, session })]);
  }
  for (const [i, date] of ['2026-09-07', '2026-09-08', '2026-09-09'].entries()) {
    finding('K-101', 'K-101 recovered via ontology/_catalog.yaml; docs/handbook.md#canvas-output terminology absent.', `canvas-${i}`, date);
    finding('K-102', 'K-102 resolved; L-000200 recovered via knowledge/_catalog.yaml; docs/handbook.md#delivery supports relationship.', `delivery-${i}`, date);
  }
  for (let i = 0; i < 3; i++) finding('K-103', 'K-103 retrieval retried; docs/handbook.md#locale.', 'one-session', '2026-09-09');
  run('git', ['init', '-q']);
  run('git', ['config', 'user.name', 'Fixture Steward']);
  run('git', ['config', 'user.email', 'fixture@example.invalid']);
  run('git', ['config', 'core.hooksPath', 'unknown-knowledge/hooks']);
  chmodSync(join(root, 'unknown-knowledge/hooks/pre-commit'), 0o755);
  run(process.execPath, [join(root, 'unknown-knowledge/engine/derive.js'), '--root', root, '--today', TODAY, '--write']);
  run('git', ['add', '.']);
  run('git', ['commit', '-qm', 'Synthetic reflection baseline']);
  return root;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('usage: node acceptance/lib/reflection-fixture.js <new-directory>');
  console.log(prepareReflectionFixture(resolve(process.argv[2])));
}
