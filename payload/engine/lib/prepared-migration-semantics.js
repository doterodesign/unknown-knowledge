/** Fixed finite semantic proof, run only inside the final captured migration worker. */
import { existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';
import { EngineRefusal } from './engine-refusal.js';
import { withTreeSnapshot } from './commit-snapshot.js';
import { captureCommittedFile } from './captured-source.js';
import { inventoryCommittedSource } from './identity-migration-source.js';
import { planIdentityCorrespondence } from './identity-migration.js';
import { parseSource } from './yaml-source.js';
import { runPreparedMigrationGate } from './prepared-migration-gate.js';
import { loadStores, storeHealth, authoringRecords } from './load-stores.js';
import { loadStores as loadHistorical, storeHealth as historicalHealth } from '../compatibility/identity-migration-08066b5/engine/lib/load-stores.js';
import * as currentViews from './derived.js';
import * as historicalViews from '../compatibility/identity-migration-08066b5/engine/lib/derived.js';
import { synthesizeCallNumber } from './call-numbers.js';
import { synthesizeCallNumber as historicalSynthesis } from '../compatibility/identity-migration-08066b5/engine/lib/call-numbers.js';
import { verifyMigrationHistoricalRuntime } from './migration-historical-runtime.js';
import { executePreparedEngineCheck } from './prepared-engine-process.js';
import { buildOptionalStoreMigrationReplayRecipe } from './migration-semantic-recipe.js';
import { proveMigrationOperationalHistory } from './migration-operational-history.js';
import { ConsumerProofRefusal, proveInstallationConsumers } from './migration-consumer-proof.js';
import { compareMigrationRetrieval, compareMigrationViews, generateMigrationViews, migrationViewsWire, verifyMigrationRenderers } from './migration-semantic-compare.js';

class SemanticRefusal extends EngineRefusal { constructor(code) { super(code); this.code = code; } }
const refuse = (code) => { throw new SemanticRefusal(code); };
const closed = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const kinds = { knowledge: 'leaves', ontology: 'concepts', decision: 'decisions' };

function presence(root) {
  return Object.fromEntries(['knowledge', 'ontology', 'decisions'].map((store) => {
    const entry = lstatSync(join(root, store), { throwIfNoEntry: false });
    if (entry && !entry.isDirectory()) refuse('migration-store-kind-unsupported');
    return [store, Boolean(entry)];
  }));
}

function sourceProfile(before, candidate, oldPresence, newPresence) {
  const profile = (model, present, current) => Object.fromEntries(Object.entries(kinds).map(([kind, space]) => {
    const store = kind === 'decision' ? 'decisions' : kind;
    const records = current ? authoringRecords(model, kind).size : model[space].size;
    if (model.stores[store].present !== present[store] || (!present[store] && records !== 0)) refuse('migration-store-presence-unavailable');
    return [store, { present: present[store], records }];
  }));
  const oldProfile = profile(before, oldPresence, false); const newProfile = profile(candidate, newPresence, true);
  if (!isDeepStrictEqual(oldProfile, newProfile)) refuse('migration-store-profile-changed');
  if (Object.values(oldProfile).every((row) => row.records === 0)) refuse('migration-empty-source-profile');
  return { policy: 'migration-optional-stores-v1', status: 'complete', before: oldProfile, candidate: newProfile };
}

function identities(inventory, plan, before, candidate) {
  const source = Object.fromEntries(Object.keys(kinds).map((kind) => [kind, new Map()]));
  const targets = Object.fromEntries(Object.keys(kinds).map((kind) => [kind, new Set()]));
  const rows = new Map(plan.correspondence.map((row) => [row.source, row.target]));
  for (const row of inventory.records) {
    const target = rows.get(row.key);
    const original = before[kinds[row.kind]]?.get(row.id);
    const actual = target && authoringRecords(candidate, row.kind).get(target.id);
    if (!target || !original || !actual || source[row.kind].has(row.id) || targets[row.kind].has(target.id)
      || original.file !== actual.file || target.namespace !== candidate.identity.namespace || target.kind !== row.kind) refuse('migration-identity-correspondence-unavailable');
    source[row.kind].set(row.id, target.id); targets[row.kind].add(target.id);
  }
  for (const [kind, space] of Object.entries(kinds)) if (source[kind].size !== before[space].size
    || targets[kind].size !== authoringRecords(candidate, kind).size) refuse('migration-identity-coverage-incomplete');
  return { before: (kind, id) => {
    if (typeof id !== 'string' || !source[kind]?.has(id)) refuse('migration-identity-unavailable'); return source[kind].get(id);
  }, candidate: (kind, id) => {
    if (typeof id !== 'string' || !targets[kind]?.has(id)) refuse('migration-identity-unavailable'); return id;
  } };
}

function observed(output, model, seen) {
  const concept = (row) => { if (!model.concepts.has(row.id)) refuse('migration-observation-unavailable'); seen.ontology.add(row.id); };
  const leaf = (row) => {
    const entry = model.leaves.get(row.id);
    if (!entry) refuse('migration-observation-unavailable'); seen.knowledge.add(row.id);
    if (row.relates) for (const [kind, neighbors] of Object.entries(row.relates)) {
      const declared = entry.record.relates?.[kind] ?? [];
      if (!isDeepStrictEqual(neighbors.map((n) => n.id), [...declared].sort())) refuse('migration-relation-coverage-incomplete');
      for (const target of neighbors) seen.relations.add(JSON.stringify([row.id, kind, target.id]));
    }
    for (const s of row.signals ?? []) {
      const signal = typeof s === 'string' ? s.slice(0, s.indexOf(':')) : s.signal;
      const via = typeof s === 'string' ? s.slice(s.indexOf(':') + 1) : s.via;
      if (signal === 'concept' && !(entry.record.concepts ?? []).includes(via)) refuse('migration-signal-unavailable');
    }
    for (const successor of row['superseded-by'] ?? []) {
      if (!(model.leaves.get(successor.id)?.record.relates?.supersedes ?? []).includes(row.id)) refuse('migration-successor-unavailable');
      seen.relations.add(JSON.stringify([successor.id, 'supersedes', row.id]));
    }
  };
  if (output.mode === 'query') {
    output.decomposition.concepts.forEach(concept); output.results.forEach((row) => { concept(row); row.knowledge.forEach(leaf); });
    output.leaves.forEach(leaf); output.exclusions.forEach(leaf);
  } else if (output.mode === 'paths') output.paths.forEach((row) => { row.concepts.forEach(concept); row.knowledge.forEach(leaf); });
  else if (output.mode === 'doc') output.map.gather.forEach(leaf);
}

/** The mechanical report is freshly obtained here; caller-supplied reports cannot authorize comparison. */
export async function runPreparedMigrationSemantics(input) {
  const result = { version: 3, kind: 'prepared-migration-semantics', status: 'failed', namespace: null, mechanical: null,
    runtimeDigest: null, historicalProfile: null, sourceProfile: null, recipe: null, validation: [], operationalHistory: null, replays: [], generated: null, diagnostics: [] };
  if (Object.hasOwn(input?.migrationInputs ?? {}, 'installation')) { result.version = 4; result.consumers = null; }
  let replayDirectory = null;
  try {
    if (!closed(input, ['repoRoot', 'source', 'candidate', 'migrationInputs', 'limits', 'runtime', 'runtimeLimits', 'semantic'])
      || !closed(input.semantic, ['today', 'requiredAdapters', 'limits'])
      || !isDeepStrictEqual(input.semantic.requiredAdapters, ['md@1', 'txt@1'])) refuse('migration-semantic-input-unavailable');
    const plan = structuredClone(input);
    result.mechanical = await runPreparedMigrationGate({ repoRoot: plan.repoRoot, source: plan.source, candidate: plan.candidate,
      migrationInputs: plan.migrationInputs, limits: plan.limits });
    if (result.mechanical.mechanicalStatus !== 'passed') refuse('migration-mechanical-proof-incomplete');
    result.historicalProfile = verifyMigrationHistoricalRuntime(plan.runtime);
    result.runtimeDigest = canonicalSha256(plan.runtime.manifest);
    await withTreeSnapshot(plan.repoRoot, plan.source.tree, async ({ root: beforeRoot }) => {
      await withTreeSnapshot(plan.repoRoot, plan.candidate.tree, async ({ root: candidateRoot }) => {
        const beforeKit = join(beforeRoot, plan.source.kitPath); const candidateKit = join(candidateRoot, plan.candidate.kitPath);
        if (existsSync(join(beforeKit, 'subjects')) || existsSync(join(candidateKit, 'subjects')) || existsSync(join(beforeKit, '_identity.yaml'))) refuse('migration-subject-scope-unsupported');
        const oldPresence = presence(beforeKit); const newPresence = presence(candidateKit);
        const before = loadHistorical(beforeKit); const candidate = loadStores(candidateKit);
        if (!historicalHealth(before).ok || !storeHealth(candidate).ok) refuse('migration-store-health-failed');
        result.sourceProfile = sourceProfile(before, candidate, oldPresence, newPresence);
        result.namespace = candidate.identity?.namespace ?? null;
        if (result.namespace !== plan.migrationInputs.namespace) refuse('migration-namespace-mismatch');
        const inventory = inventoryCommittedSource({ repoRoot: plan.repoRoot, commit: plan.source.commit, kitRoot: plan.source.kitPath,
          adjudications: plan.migrationInputs.adjudications });
        if (!inventory.ok || (inventory.unclassifiedPaths.length && result.mechanical.installation?.status !== 'complete')) refuse('migration-source-scope-incomplete');
        const documents = inventory.files.map((row) => {
          if (!['knowledge-leaf', 'ontology-concept', 'decision-entry', 'catalog', 'registry', 'graduation-categories', 'phoenix-event',
            'finding', 'gap', 'miss'].includes(row.kind)) refuse('migration-source-role-unsupported');
          const capture = captureCommittedFile({ repoRoot: plan.repoRoot, commit: plan.source.commit, file: row.file });
          if (capture.locator.sha256 !== row.sha256 || capture.locator.blob !== row.blob || capture.mode !== row.mode) refuse('migration-source-capture-mismatch');
          const document = { file: row.file, kind: row.kind, bytes: capture.bytes };
          if (parseSource(document).value?.['schema-version'] !== (row.kind === 'knowledge-leaf' ? 2 : 1)) refuse('migration-source-version-unsupported');
          return document;
        });
        const correspondence = planIdentityCorrespondence(documents, plan.migrationInputs);
        if (!correspondence.ok) refuse('migration-identity-correspondence-unavailable');
        const identity = identities(inventory, correspondence, before, candidate);
        result.recipe = buildOptionalStoreMigrationReplayRecipe(before, plan.semantic.today, plan.semantic.limits, plan.source.kitPath);
        let consumerBytes = 0;
        if (result.version === 4) {
          result.consumers = await proveInstallationConsumers({ beforeRoot, candidateRoot, runtime: plan.runtime,
            runtimeLimits: plan.runtimeLimits, today: plan.semantic.today, identity, kitPath: plan.source.kitPath,
            maxBytes: plan.semantic.limits.maxInventoryBytes - canonicalJsonBytes(result.recipe).length - canonicalJsonBytes(result.sourceProfile).length });
          consumerBytes = canonicalJsonBytes(result.consumers).length;
        }
        result.operationalHistory = proveMigrationOperationalHistory({ repoRoot: plan.repoRoot, source: plan.source, candidate: plan.candidate,
          documents, migrationInputs: plan.migrationInputs, beforeModel: before, candidateModel: candidate, identity,
          maxBytes: plan.semantic.limits.maxInventoryBytes - canonicalJsonBytes(result.recipe).length - canonicalJsonBytes(result.sourceProfile).length - consumerBytes });
        const execute = async (kind, root, request) => {
          const output = await executePreparedEngineCheck(plan.runtime.root, plan.runtime.manifest, plan.runtimeLimits,
            request ? { kind, root, today: plan.semantic.today, request } : { kind, root });
          let parsed = null;
          if (output.reason || output.exitCode !== 0 || output.signal || output.stderr.length) refuse('migration-engine-execution-incomplete');
          try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output.stdout)); }
          catch { refuse('migration-engine-output-invalid'); }
          if (parsed['store-health']?.ok !== true || parsed['store-health'].errors !== 0) refuse('migration-engine-store-health-failed');
          return { ...output, stdout: output.stdout.toString('utf8'), stderr: output.stderr.toString('utf8'), result: parsed };
        };
        for (const [side, root, prefix] of [['before', beforeRoot, 'historical-'], ['candidate', candidateRoot, '']]) {
          for (const kind of ['structural', 'values']) result.validation.push({ side, kind, output: await execute(`${prefix}${kind}`, root) });
        }
        replayDirectory = join(dirname(plan.runtime.root), 'migration-replays');
        mkdirSync(replayDirectory, { mode: 0o700 });
        for (const row of result.recipe.documents) writeFileSync(join(plan.runtime.root, row.path), row.text, { mode: 0o400, flag: 'wx' });
        const seen = { knowledge: new Set(), ontology: new Set(), relations: new Set() };
        for (const row of result.recipe.cases) {
          const request = { kind: row.kind, value: row.value };
          const oldOutput = await execute('ordinary-historical', beforeRoot, request);
          const newOutput = await execute('ordinary-current', candidateRoot, request);
          const comparison = compareMigrationRetrieval(oldOutput.result, newOutput.result, identity);
          result.replays.push({ input: row, before: oldOutput, candidate: newOutput, comparison });
          if (comparison.status !== 'complete') refuse('migration-retrieval-difference');
          observed(oldOutput.result, before, seen);
          if (row.control) for (const { result: value } of [oldOutput, newOutput]) {
            if (value.mode === 'query' && (value.results.length || value.leaves.length || value.exclusions.length
              || value.decomposition.concepts.length || value.decomposition.operations.length || value.decomposition.jurisdictions.length
              || value.decomposition['near-miss'].length)) refuse('migration-control-matched');
            if (value.mode === 'paths' && value.paths.some((path) => path.concepts.length || path.knowledge.length)) refuse('migration-control-matched');
          }
          if (row.kind === 'document') {
            const doc = result.recipe.documents.find((value) => value.path === row.value);
            for (const { result: value } of [oldOutput, newOutput]) if (value.map.adapter !== doc.adapter
              || value.map.document !== doc.path || value.map.ir.sections !== doc.nativeSections) refuse('migration-document-coverage-incomplete');
          }
        }
        if (seen.knowledge.size !== before.leaves.size || seen.ontology.size !== before.concepts.size) refuse('migration-replay-record-coverage-incomplete');
        for (const [id, entry] of before.leaves) for (const [kind, refs] of Object.entries(entry.record.relates ?? {})) {
          for (const target of refs) if (!seen.relations.has(JSON.stringify([id, kind, target]))) refuse('migration-relation-coverage-incomplete');
        }
        let remaining = plan.semantic.limits.maxGeneratedBytes;
        const generate = (owner, entries) => {
          // Native owner allocations precede exact size measurement; this limit bounds admission/retention, not their heap.
          if (remaining < entries.length || remaining < 3) refuse('migration-generated-budget');
          const output = generateMigrationViews(owner, entries, plan.semantic.today);
          for (const artifact of output.artifacts) { remaining -= Buffer.byteLength(artifact.text); if (remaining < 0) refuse('migration-generated-budget'); }
          const wire = migrationViewsWire(output); remaining -= canonicalJsonBytes({ index: wire.index, trees: wire.trees }).length;
          if (remaining < 0) refuse('migration-generated-budget');
          return output;
        };
        const oldViews = generate(historicalViews, [...before.leaves.values()]);
        const newViews = generate(currentViews, [...authoringRecords(candidate, 'knowledge').values()]);
        // Same original tree through both actual renderers: only this frozen instruction may differ.
        // Typed tree/call-number comparison below separately covers the candidate identities.
        verifyMigrationRenderers(oldViews, currentViews, plan.semantic.today);
        const comparison = compareMigrationViews(oldViews, newViews, identity, { before: historicalSynthesis, candidate: synthesizeCallNumber });
        result.generated = { before: migrationViewsWire(oldViews), candidate: migrationViewsWire(newViews), comparison };
        if (comparison.status !== 'complete') refuse('migration-generated-difference');
        verifyMigrationHistoricalRuntime(plan.runtime);
        result.status = 'complete';
      });
    });
  } catch (error) {
    if (!(error instanceof EngineRefusal) && !Number.isInteger(error?.errno)) throw error;
    result.diagnostics.push({ code: error instanceof SemanticRefusal || error instanceof ConsumerProofRefusal ? error.code : 'migration-semantic-evidence-unavailable' });
  } finally {
    if (replayDirectory) rmSync(replayDirectory, { force: true, recursive: true });
  }
  return result;
}
