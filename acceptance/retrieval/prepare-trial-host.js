// Operator setup only: never expose this inventory/ledger to a trial reader.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';
import { createTrialHost } from './trial-host.js';
import { installedFiles } from './intent-host.js';

export async function prepareInstalledTrialHost(stateFile, configuration) {
  const root = resolve(configuration.root);
  const kit = resolve(root, 'unknown-knowledge');
  const { loadStores } = await import(pathToFileURL(resolve(kit, 'engine/lib/load-stores.js')).href);
  const model = loadStores(kit);
  if (!model.ok) throw new Error('trial setup requires a valid installed inventory');
  const records = [];
  for (const [kind, entries] of [['ontology', model.concepts], ['knowledge', model.leaves], ['decisions', model.decisions]]) {
    const proposals = model.proposals?.[kind === 'decisions' ? 'decision' : kind] ?? new Map();
    const loaded = [...entries].map(([id, entry]) => [id, entry, 'canonical'])
      .concat([...proposals].map(([id, entry]) => [id, entry, 'proposal']));
    if (!model.stores[kind].present && loaded.length === 0) continue;
    const catalog = load(readFileSync(resolve(kit, kind, '_catalog.yaml'), 'utf8'));
    const rows = catalog.entries ?? [];
    if (rows.length !== loaded.length || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('catalog inventory mismatch');
    for (const [localId, entry, identityType] of loaded) {
      const row = rows.find(row => row.id === localId);
      if (!row || resolve(kit, kind, row.file) !== resolve(kit, entry.file)) throw new Error('catalog record mismatch');
      records.push({ id: `${configuration.namespace}/${kind}/${localId}`, kind, localId, identityType,
        file: `unknown-knowledge/${entry.file}`, catalog: `unknown-knowledge/${kind}/_catalog.yaml` });
    }
  }
  // Freeze installed bytes, including registries and support files. Dependencies
  // remain an operator-owned environment prerequisite; never follow symlinks.
  createTrialHost(stateFile, { ...configuration, root, records, identityNamespace: model.identity?.namespace,
    subjectInventory: (model.subjectRegistry?.document.subjects ?? []).map(subject => subject.id),
    runtimeFiles: installedFiles(root) });
  return { root, recordCount: records.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [stateFile, configurationFile] = process.argv.slice(2);
  try {
    const prepared = await prepareInstalledTrialHost(stateFile, JSON.parse(readFileSync(configurationFile, 'utf8')));
    process.stdout.write(`${JSON.stringify(prepared)}\n`);
  } catch {
    process.stderr.write('trial inventory preparation failed\n');
    process.exitCode = 2;
  }
}
