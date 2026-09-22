/** Finite fixed recipe from the complete actual historical model, never caller cases. */
import { EngineRefusal } from './engine-refusal.js';
import { isCalendarDate } from './iso-date.js';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';

export const MIGRATION_ZERO_QUERY = 'zzmigrationunmatchedqvx';
export const MIGRATION_ZERO_PATH = '__migration_unmatched_qvx__/no-source.txt';
const refuse = () => { throw new EngineRefusal('migration replay inventory unavailable or over capacity'); };
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function buildMigrationReplayRecipe(model, today, limits, kitPath = '.') {
  return buildRecipe(model, today, limits, kitPath, false);
}

/** Optional stores are corroborated by the enclosing actual snapshot profile. */
export function buildOptionalStoreMigrationReplayRecipe(model, today, limits, kitPath = '.') {
  return buildRecipe(model, today, limits, kitPath, true);
}

function buildRecipe(model, today, limits, kitPath, optional) {
  const keys = ['maxCases', 'maxInventoryBytes', 'maxGeneratedBytes'];
  if (typeof today !== 'string' || !isCalendarDate(today) || !limits || Object.keys(limits).length !== keys.length
    || !keys.every((key) => Number.isSafeInteger(limits[key]) && limits[key] > 0)
    || !(model.leaves instanceof Map) || !(model.concepts instanceof Map) || !(model.registries instanceof Map)
    || (optional ? !(model.decisions instanceof Map) || model.leaves.size + model.concepts.size + model.decisions.size === 0
      : !model.leaves.size || !model.concepts.size) || !['.', 'unknown-knowledge'].includes(kitPath)) refuse();
  const queries = new Set(); const paths = new Set(); let bytes = 0;
  const add = (set, value) => {
    if (typeof value !== 'string' || !value || value.includes('\0') || Buffer.from(value).toString() !== value) refuse();
    if (set === queries && value.startsWith('--')) refuse();
    if (set.has(value)) return;
    bytes += Buffer.byteLength(value);
    if (bytes > limits.maxInventoryBytes || queries.size + paths.size + 1 + 4 > limits.maxCases) refuse();
    set.add(value);
  };
  for (const { record } of model.concepts.values()) {
    add(queries, record.term);
    for (const value of record.aliases ?? []) add(queries, value);
    for (const value of record['source-of-truth'] ?? []) add(paths, value);
  }
  for (const { file, record } of model.leaves.values()) {
    add(paths, kitPath === '.' ? file : `${kitPath}/${file}`);
    for (const value of record.paths ?? []) add(paths, value);
    for (const term of record.terms ?? []) {
      add(queries, term);
      for (const value of [...(record.operations ?? []), ...(record.applies?.jurisdictions ?? [])]) add(queries, `${value} ${term}`);
    }
  }
  for (const key of ['knowledge/operations', 'knowledge/jurisdictions']) {
    const registry = model.registries.get(key);
    for (const value of registry?.minted ?? []) add(queries, value);
    for (const value of registry?.suppressed ?? []) add(queries, value);
  }
  // A collision is not silently replaced with a different control.
  if (queries.has(MIGRATION_ZERO_QUERY) || paths.has(MIGRATION_ZERO_PATH)) refuse();
  const vocabulary = [...queries].sort(order);
  const split = Math.max(1, Math.ceil(vocabulary.length / 2));
  const sections = [{ heading: 'Passage one', text: vocabulary.slice(0, split).join('. ') },
    { heading: 'Passage two', text: vocabulary.slice(split).join('. ') }, { heading: 'Unmatched', text: MIGRATION_ZERO_QUERY }]
    .filter((row) => !optional || row.text.length > 0);
  const documents = [
    { path: '../migration-replays/probe.md', adapter: 'md@1', nativeSections: sections.length,
      text: `${sections.map((row) => `# ${row.heading}\n\n${row.text}`).join('\n\n')}\n` },
    { path: '../migration-replays/probe.txt', adapter: 'txt@1', nativeSections: 1, text: `${sections.map((row) => row.text).join('\n\n')}\n` },
  ];
  const cases = [...vocabulary.map((value) => ({ kind: 'query', value, control: false })),
    ...[...paths].sort(order).map((value) => ({ kind: 'path', value, control: false })),
    { kind: 'query', value: MIGRATION_ZERO_QUERY, control: true }, { kind: 'path', value: MIGRATION_ZERO_PATH, control: true },
    ...documents.map((row) => ({ kind: 'document', value: row.path, control: false }))];
  const recipe = { version: optional ? 2 : 1, policy: optional ? 'migration-representative-v2' : 'migration-representative-v1', today, cases, documents,
    coverage: { claim: 'finite-representative-inputs', kitPath, knowledge: model.leaves.size, ontology: model.concepts.size,
      ...(optional ? { decisions: model.decisions.size, decisionRetrieval: 'not-supported-by-ordinary-resolver' } : {}),
      nativeTextSections: 1, requiredAdapters: ['md@1', 'txt@1'] } };
  if (cases.length > limits.maxCases || canonicalJsonBytes(recipe).length > limits.maxInventoryBytes) refuse();
  return { ...recipe, digest: canonicalSha256(recipe) };
}
