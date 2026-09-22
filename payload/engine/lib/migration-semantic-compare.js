/** Private typed comparison. Never return rebased objects or identity pairs. */
import { isDeepStrictEqual } from 'node:util';
import { EngineRefusal } from './engine-refusal.js';

const refuse = () => { throw new EngineRefusal('migration semantic shape or identity unavailable'); };
const string = (v) => typeof v === 'string';
const number = (v) => typeof v === 'number' && Number.isFinite(v);
const boolean = (v) => typeof v === 'boolean';
const nullable = (test) => (v) => v === null || test(v);
const strings = [string];
const demotions = [{ reason: string, detail: string }];
const time = { volatility: nullable(string), verified: nullable(string), age: nullable(number), limit: nullable(number),
  stale: boolean, verdict: string, reason: string };
const neighbor = { id: 'knowledge', notation: nullable(string), heading: nullable(string), file: string };
const metadata = { ...neighbor, stage: nullable(string), downranked: boolean, demotions, time };
const successor = { ...metadata, applies: strings };
const relates = Object.fromEntries(['depends-on', 'see-also', 'contradicts', 'supersedes'].map((key) => [key, [neighbor]]));
const leaf = { ...metadata, excerpt: nullable(string), provenance: (v) => v === null
  || (Object.keys(v).length === 2 && Object.hasOwn(v, 'author') && Object.hasOwn(v, 'skill-version')
    && nullable(string)(v.author) && nullable(string)(v['skill-version'])), relates, 'superseded-by': [successor] };
const signal = { signal: (v) => ['concept', 'operation', 'term'].includes(v), via: string, score: number };
const scored = { ...leaf, score: number, signals: [signal], applies: strings, operations: strings };
const concept = { id: 'ontology', term: string, match: nullable(string), tokens: strings };
const vocabulary = { value: string, matched: string, tokens: strings };
const health = { ok: (v) => v === true, errors: (v) => v === 0, warnings: number };
const common = { mode: string, 'time-check': string, 'store-health': health };
const query = { ...common, query: string,
  decomposition: { tokens: strings, operations: [vocabulary], concepts: [concept], jurisdictions: [vocabulary],
    'near-miss': [{ kind: (v) => ['concept', 'operation', 'jurisdiction'].includes(v), id: string, overlap: strings }],
    residue: strings, 'resolved-context': strings },
  scoring: { concept: { 'exact-term': number, 'exact-alias': number, 'term-match': number, 'alias-match': number, 'summary-match': number },
    leaf: { operation: number, concept: number, term: number }, 'status-downrank': number },
  results: [{ id: 'ontology', term: string, summary: nullable(string), status: nullable(string), score: number, match: string,
    file: string, 'source-of-truth': strings, 'confusable-with': [{ id: 'ontology', term: nullable(string) }], knowledge: [{ ...leaf, via: string }] }],
  leaves: [scored], exclusions: [{ ...neighbor, applies: strings, asked: strings, 'superseded-by': [successor], reason: string }] };
const paths = { ...common, paths: [{ path: string, concepts: [{ id: 'ontology', term: string, status: nullable(string), pointer: string }],
  knowledge: [{ ...leaf, via: string }] }] };
const locator = { line: number, endLine: number };
const candidate = { term: string, count: number, signatures: strings, sections: strings, 'sections-more': number };
const document = { ...common, map: { document: string, adapter: (v) => ['md@1', 'txt@1'].includes(v), hash: string,
  ir: { blocks: number, sections: number, 'repetition-threshold': number },
  sections: [{ section: string, locator, joins: { operations: strings, concepts: ['ontology'], jurisdictions: strings, leaves: ['knowledge'] },
    candidates: strings, repeats: [{ section: string, locator }], 'repeats-count': number }],
  gather: [{ ...neighbor, score: number, signals: strings, sections: strings, 'sections-more': number, verdict: string,
    'scope-mismatch': nullable(string), demotions, 'superseded-by': [successor] }],
  'candidates-ranked': [candidate], suppressed: [candidate], 'suppression-warnings': [string] } };

function walk(value, schema, identity) {
  if (typeof schema === 'function') { if (!schema(value)) refuse(); return value; }
  if (typeof schema === 'string') return identity(schema, value);
  if (Array.isArray(schema)) {
    if (!Array.isArray(value) || Object.keys(value).length !== value.length) refuse();
    return value.map((row) => walk(row, schema[0], identity));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== Object.keys(schema).length || Object.keys(schema).some((key) => !Object.hasOwn(value, key))) refuse();
  return Object.fromEntries(Object.entries(schema).map(([key, shape]) => [key, walk(value[key], shape, identity)]));
}

/** identity maps only known source IDs; candidate identity validates membership. */
function retrieval(value, identity) {
  let schema = { query, paths, doc: document }[value?.mode];
  if (value?.mode === 'query' && Array.isArray(value.results) && Array.isArray(value.leaves)
    && value.results.length === 0 && value.leaves.length === 0) schema = { ...schema, conduct: string };
  if (!schema) refuse();
  const out = walk(value, schema, identity);
  if (value.mode === 'query') {
    const d = value.decomposition;
    const context = [...d.operations.map((r) => r.value), ...d.concepts.map((r) => r.id), ...d.jurisdictions.map((r) => r.value)];
    if (!isDeepStrictEqual(d['resolved-context'], context)) refuse();
    out.decomposition['resolved-context'] = [...d.operations.map((r) => r.value),
      ...out.decomposition.concepts.map((r) => r.id), ...d.jurisdictions.map((r) => r.value)];
    for (const row of out.decomposition['near-miss']) if (row.kind === 'concept') row.id = identity('ontology', row.id);
    for (const row of out.leaves) for (const s of row.signals) if (s.signal === 'concept') s.via = identity('ontology', s.via);
  }
  if (value.mode === 'doc') for (const row of out.map.gather) row.signals = row.signals.map((s) => {
    const at = s.indexOf(':'); const kind = s.slice(0, at); const via = s.slice(at + 1);
    if (at < 1 || !via || !['concept', 'term', 'operation'].includes(kind)) refuse();
    return kind === 'concept' ? `concept:${identity('ontology', via)}` : s;
  });
  return out;
}

/** Both inputs remain untouched; only a verdict escapes this private comparison. */
export function compareMigrationRetrieval(before, candidateOutput, identities) {
  try {
    return { status: isDeepStrictEqual(retrieval(before, identities.before), retrieval(candidateOutput, identities.candidate))
      ? 'complete' : 'failed', code: null };
  } catch (error) {
    if (!(error instanceof EngineRefusal)) throw error;
    return { status: 'failed', code: 'migration-retrieval-shape-or-identity' };
  }
}

const projection = { id: 'knowledge', path: strings, 'call-number': string, heading: nullable(string), file: string,
  stage: nullable(string), time, demoted: boolean, demotions };
function tree(value, identity, synthesize, targetSynthesize) {
  if (!value || Object.keys(value).length !== 3 || !Object.hasOwn(value, 'name') || !Object.hasOwn(value, 'children')
    || !Object.hasOwn(value, 'leaves') || !nullable(string)(value.name) || !(value.children instanceof Map) || !Array.isArray(value.leaves)) refuse();
  return { name: value.name, children: [...value.children].map(([name, child]) => {
    if (typeof name !== 'string' || name !== child.name) refuse();
    return [name, tree(child, identity, synthesize, targetSynthesize)];
  }), leaves: value.leaves.map((row) => {
    const mapped = walk(row, projection, identity);
    if (row['call-number'] !== synthesize(row.path, row.id)) refuse();
    mapped['call-number'] = targetSynthesize(row.path, mapped.id); return mapped;
  }) };
}

/** Actual owner functions and actual entries only; native generation is separately bounded by the caller. */
export function generateMigrationViews(owner, entries, today) {
  const artifacts = owner.deriveArtifacts(entries, today);
  const index = owner.buildIndex(entries, today);
  const trees = owner.AXES.map((axis) => ({ axis: { key: axis.key, label: axis.label, audience: axis.audience },
    tree: owner.buildTree(entries, axis, today) }));
  const expected = [{ path: 'knowledge/derived/index.json', text: `${JSON.stringify(index, null, 2)}\n` },
    ...trees.map(({ tree: value }, i) => ({ path: `knowledge/derived/tree.${owner.AXES[i].key}.md`,
      text: owner.renderTree(value, owner.AXES[i], today) }))].sort((a, b) => a.path < b.path ? -1 : 1);
  if (!isDeepStrictEqual(artifacts, expected) || !isDeepStrictEqual(trees.map((row) => row.axis.key), ['domain-form', 'form-domain'])) refuse();
  return { artifacts, index, trees };
}

function views(value, identity, synthesize, targetSynthesize) {
  const indexSchema = { note: string, 'call-numbers': string, 'time-check': string,
    axes: [{ key: string, label: string, audience: string }],
    'recall-slot': { status: string, location: string, consulted: string, output: string, citable: boolean, persistable: boolean,
      gate: string, 'in-scope-here': string, 'out-of-scope-here': string }, counts: { leaves: number, demoted: number },
    leaves: [{ id: 'knowledge', heading: nullable(string), file: string, stage: nullable(string), time, demoted: boolean, demotions,
      positions: { 'domain-form': { path: strings, 'call-number': string }, 'form-domain': { path: strings, 'call-number': string } } }] };
  const index = walk(value.index, indexSchema, identity);
  for (let i = 0; i < index.leaves.length; i++) for (const key of ['domain-form', 'form-domain']) {
    const raw = value.index.leaves[i]; const position = raw.positions[key];
    if (position['call-number'] !== synthesize(position.path, raw.id)) refuse();
    index.leaves[i].positions[key]['call-number'] = targetSynthesize(position.path, index.leaves[i].id);
  }
  return { index, trees: value.trees.map((row) => ({ axis: row.axis, tree: tree(row.tree, identity, synthesize, targetSynthesize) })) };
}

export function compareMigrationViews(before, candidateOutput, identities, synthesis) {
  try {
    return { status: isDeepStrictEqual(views(before, identities.before, synthesis.before, synthesis.candidate),
      views(candidateOutput, identities.candidate, synthesis.candidate, synthesis.candidate)) ? 'complete' : 'failed', code: null };
  } catch (error) {
    if (!(error instanceof EngineRefusal)) throw error;
    return { status: 'failed', code: 'migration-generated-shape-or-identity' };
  }
}

/** Same original tree through both actual renderers; no arbitrary text normalization. */
export function verifyMigrationRenderers(before, candidateOwner, today) {
  for (const [i, row] of before.trees.entries()) {
    const raw = before.artifacts.find((artifact) => artifact.path === `knowledge/derived/tree.${row.axis.key}.md`).text;
    const expected = raw.replace('\nare NOT identities: cite the accession id (L-NNNNNN), never a call number.\n',
      '\nare NOT identities: cite the canonical Knowledge id (K-000001 through K-999999), never a call number.\n');
    if (expected === raw || candidateOwner.renderTree(row.tree, candidateOwner.AXES[i], today) !== expected) refuse();
  }
}

/** Lossless wire for original (never rebased) trees. */
export function migrationViewsWire(value) {
  const encode = (node) => ({ ...node, children: [...node.children].map(([name, child]) => [name, encode(child)]) });
  return { ...value, trees: value.trees.map((row) => ({ axis: row.axis, tree: encode(row.tree) })) };
}
