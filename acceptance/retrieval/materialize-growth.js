// Narrow evaluator overlay for the reviewed 16-source growth packet.
// Construction is an initial-condition setup, never a runtime publication proof.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyDevelopmentSources } from './materialize-development.js';

const PIN = '79c3efc0803963c6308ce483235c1d1d1d7f2b24';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const bytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const put = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.isBuffer(value) || typeof value === 'string' ? value : bytes(value), { flag: 'wx' });
};
function inventory(root) {
  assert(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), root);
  const files = {};
  const visit = directory => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), stat = lstatSync(path);
      assert(!stat.isSymbolicLink(), `symlink: ${path}`);
      if (stat.isDirectory()) visit(path);
      else { assert(stat.isFile(), path); files[relative(root, path)] = hash(readFileSync(path)); }
    }
  };
  visit(root);
  return files;
}

// Baseline materializer emits canonical JSON with the selected array last.
// Insertion preserves every original row byte; unsupported layouts refuse.
export function extendFixtureArray(raw, field, rows) {
  const before = JSON.parse(raw);
  assert(raw.equals(bytes(before)), 'unexpected fixture JSON representation');
  assert(Array.isArray(before[field]) && before[field].length && rows.length);
  const text = raw.toString(), suffix = '\n  ]\n}\n';
  assert(text.endsWith(suffix) && Object.keys(before).at(-1) === field);
  const addition = rows.map(row => JSON.stringify(row, null, 2).split('\n').map(line => `    ${line}`).join('\n')).join(',\n');
  const after = Buffer.from(`${text.slice(0, -suffix.length)},\n${addition}${suffix}`);
  assert.deepEqual(JSON.parse(after), { ...before, [field]: [...before[field], ...rows] });
  assert(after.subarray(0, raw.length - Buffer.byteLength(suffix)).equals(raw.subarray(0, raw.length - Buffer.byteLength(suffix))));
  return after;
}

export async function materializeGrowth({ planFile, planSha256, releaseFile, releaseSha256 }) {
  const planBytes = readFileSync(planFile);
  assert.equal(hash(planBytes), planSha256, 'plan changed');
  const plan = JSON.parse(planBytes);
  assert.equal(plan.runtimeCommit, PIN);
  assert.equal(plan.mode, 'synthetic-initial-condition-overlay');
  assert.equal(plan.sources.length, 16);
  assert.equal(plan.newSupportRecords, 0);
  assert.deepEqual({ ...process.env }, plan.childEnvironment, 'construction environment must match the reviewed clean environment');
  const releaseBytes = readFileSync(releaseFile);
  assert.equal(hash(releaseBytes), releaseSha256, 'release changed');
  const release = JSON.parse(releaseBytes);
  assert.deepEqual(release, { operation: 'construct-synthetic-growth-fixture', planSha256,
    destination: plan.destination, runtimeCommit: PIN, queryExecution: false });
  const baseline = resolve(plan.baselineRoot), destination = resolve(plan.destination), runtime = resolve(plan.runtimeRoot);
  assert.equal(baseline, '/private/tmp/ucs1243-development-data-v1');
  assert.equal(runtime, '/private/tmp/ucs1243-private-file-runtime-79c3efc');
  assert.equal(process.cwd(), runtime, 'construction cwd must be the frozen runtime root');
  assert(destination.startsWith('/private/tmp/ucs1243-growth-') && !existsSync(destination), 'fresh growth destination required');
  for (const dependency of plan.preparationDependencies) assert.equal(hash(readFileSync(dependency.path)), dependency.sha256, dependency.path);
  const baselineBefore = inventory(baseline), runtimeBefore = inventory(runtime);
  assert.deepEqual(baselineBefore, plan.baselineFiles);
  assert.deepEqual(runtimeBefore, plan.runtimeFiles);
  assert.equal(hash(readFileSync(process.execPath)), plan.nodeSha256);
  const original = json(join(baseline, 'materialization.json'));
  assert(verifyDevelopmentSources(original).ok);
  assert.equal(new Set(plan.sources.map(row => row.handle)).size, 16);
  for (const row of plan.sources) assert.equal(hash(Buffer.from(row.sourceText)), row.sourceTextSha256);

  // All product calls start here, after exact plan, release and custody checks.
  const lib = name => import(pathToFileURL(join(runtime, 'payload/engine/lib', `${name}.js`)));
  const { planAllocations, validateIdentityTransition } = await lib('identity-ledger');
  const { describeCandidateBytes } = await lib('captured-source');
  const { loadStores } = await lib('load-stores');
  const { evaluateSubjectGovernance, getSubjectGovernanceDescriptor, validateSubjectGovernanceCapture } = await lib('subject-governance');
  const { validateAssignments } = await lib('assignment-validation');
  const { runChecks } = await import(pathToFileURL(join(runtime, 'payload/engine/commands/validate.js')));
  const { validateValues } = await import(pathToFileURL(join(runtime, 'payload/engine/commands/validate-values.js')));
  const results = [], changed = new Set(), added = new Set();
  cpSync(baseline, destination, { recursive: true, errorOnExist: true, force: false });
  try {
    for (const installation of original.installations) {
      const name = installation.installation, root = join(destination, name), kit = join(root, 'unknown-knowledge');
      const selected = plan.sources.filter(row => row.installation === name);
      assert.equal(selected.length, 2);
      assert(selected.every(row => row.namespace === installation.namespace && row.kind === selected[0].kind));
      const kind = selected[0].kind;
      assert.equal(kind, name === 'policy' ? 'decision' : 'knowledge');
      assert(!existsSync(join(kit, 'subjects/_assignments')), 'baseline assignment-history absence must remain');
      const ledgerFile = join(kit, '_identity.yaml'), rawLedger = readFileSync(ledgerFile), before = JSON.parse(rawLedger);
      const allocation = planAllocations(before, { kind, count: 2, publication: { id: randomUUID(),
        review: `synthetic-initial-condition-overlay:${planSha256}:${name}; not runtime publication` } });
      assert(allocation.ok, JSON.stringify(allocation));
      const identityCheck = validateIdentityTransition(before, allocation.ledger);
      assert(identityCheck.ok, JSON.stringify(identityCheck));
      const newAllocations = allocation.ledger.allocations.slice(before.allocations.length);
      writeFileSync(ledgerFile, extendFixtureArray(rawLedger, 'allocations', newAllocations));
      changed.add(relative(destination, ledgerFile));
      const records = [], catalogRows = [];
      for (const [index, source] of selected.entries()) {
        const id = allocation.ids[index], locator = `sources/growth-v1/source-${index + 1}.txt`;
        const heading = `Source report: ${source.heading}`;
        const caveat = 'Synthetic source fixture. Source review establishes faithful reporting only; stated scope and standing remain unchanged. No real source-owner approval, operational implementation or runtime publication is asserted.';
        let record, file, rendered;
        if (kind === 'knowledge') {
          file = `knowledge/${id}.md`;
          record = { 'schema-version': 3, id, domain: name, heading, subjects: source.assignments,
            citations: [{ source: locator }], facets: { stage: 'verified' }, verified: plan.fixtureDate,
            volatility: 'static', provenance: { author: 'simulated-fixture-curation', 'skill-version': 'growth-initial-condition-1' },
            notes: [{ type: 'scope', text: caveat }] };
          rendered = Buffer.from(`---\n${JSON.stringify(record, null, 2)}\n---\n\n# ${heading}\n\n${caveat}\n\n${source.sourceText}`);
        } else {
          file = `decisions/entries/${id}.yaml`;
          record = { id, title: heading, category: 'governance', status: 'accepted', subjects: source.assignments,
            date: plan.fixtureDate, deciders: ['simulated-source-transcription'],
            context: `${caveat} Original source: ${locator}.`, decision: source.sourceText,
            consequences: 'Source standing and scope remain as stated. The injected fixture date establishes no historical precedence.' };
          rendered = bytes({ 'schema-version': 2, entries: [record] });
        }
        put(join(root, locator), source.sourceText);
        put(join(kit, file), rendered);
        added.add(relative(destination, join(root, locator))); added.add(relative(destination, join(kit, file)));
        catalogRows.push({ id, title: heading, file: file.slice((kind === 'knowledge' ? 'knowledge/' : 'decisions/').length) });
        records.push({ handle: source.handle, namespace: installation.namespace, kind, id, file, source: locator,
          sourceSha256: source.sourceTextSha256, recordSha256: hash(rendered), assignments: source.assignments,
          sourceCapture: describeCandidateBytes({ file: locator, bytes: Buffer.from(source.sourceText), objectFormat: 'sha1' }),
          recordCapture: describeCandidateBytes({ file: `unknown-knowledge/${file}`, bytes: rendered, objectFormat: 'sha1' }) });
      }
      const catalogFile = join(kit, kind === 'knowledge' ? 'knowledge/_catalog.yaml' : 'decisions/_catalog.yaml');
      writeFileSync(catalogFile, extendFixtureArray(readFileSync(catalogFile), 'entries', catalogRows));
      changed.add(relative(destination, catalogFile));
      const model = loadStores(kit);
      assert(model.ok, JSON.stringify(model.diagnostics));
      const decisionCaptures = json(join(root, 'decision-captures.json')).map(({ bytesBase64, ...row }) => ({ ...row, bytes: Buffer.from(bytesBase64, 'base64') }));
      const governance = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity, identityIndex: model.identityIndex, decisionCaptures });
      assert(governance.ok, JSON.stringify(governance.diagnostics));
      const consistency = validateSubjectGovernanceCapture(governance.governance, { model });
      assert(consistency.ok, JSON.stringify(consistency.diagnostics));
      const assignments = records.map(record => {
        const entry = (kind === 'knowledge' ? model.leaves : model.decisions).get(record.id);
        const check = validateAssignments({ ref: { namespace: installation.namespace, kind, id: record.id }, entry }, governance.governance,
          { purpose: 'new-assignment', budget: { redirects: 100 } });
        assert(check.ok, JSON.stringify(check.diagnostics));
        return { id: record.id, state: check.assignments.state, ok: check.ok };
      });
      const structural = runChecks(model, root), values = validateValues(model, null, root);
      assert(!structural.some(row => row.severity === 'error'), JSON.stringify(structural));
      assert.equal(values.hardErrors.length, 0, JSON.stringify(values));
      assert.equal(values.findings.length, 0, JSON.stringify(values));
      results.push({ installation: name, namespace: installation.namespace, root, records, identityCheck, assignments, structural, values,
        governance: getSubjectGovernanceDescriptor(governance.governance) });
    }
    const after = inventory(destination);
    assert.equal(changed.size, 16); assert.equal(added.size, 32);
    assert.deepEqual(Object.keys(after).sort(), [...Object.keys(baselineBefore), ...added].sort());
    for (const [file, digest] of Object.entries(baselineBefore)) if (!changed.has(file)) assert.equal(after[file], digest, file);
    assert.deepEqual(inventory(baseline), baselineBefore); assert.deepEqual(inventory(runtime), runtimeBefore);
    assert.equal(hash(readFileSync(planFile)), planSha256);
    assert.equal(hash(readFileSync(releaseFile)), releaseSha256);
    for (const dependency of plan.preparationDependencies) assert.equal(hash(readFileSync(dependency.path)), dependency.sha256, dependency.path);
    // Rebase only this ephemeral evaluator object; preserve the old manifest file.
    const rebased = { ...original, installations: original.installations.map(row => ({ ...row, root: join(destination, row.installation) })) };
    assert(verifyDevelopmentSources(rebased).ok);
    const result = { version: 'growth-synthetic-overlay-1', mode: plan.mode, runtimeCommit: PIN, planSha256,
      baselineRoot: baseline, destination, installations: results, newSourceRecords: 16, newSupportRecords: 0,
      preservation: { originalFiles: Object.keys(baselineBefore).length, changedContainers: [...changed],
        unchangedFiles: Object.keys(baselineBefore).length - changed.size, originalContainerRowsRetainedByteExactly: true,
        registryAndCapturesUnchanged: true, assignmentHistoryStillAbsent: true },
      custodyBefore: baselineBefore, custodyAfter: after,
      runtimePublication: false, queryExecution: false, independentFidelityReview: 'pending', finalQrels: 'pending' };
    put(join(destination, 'growth-materialization.json'), result);
    return result;
  } catch (error) {
    put(join(destination, 'growth-construction-failure.json'), { status: 'failed-retained-do-not-query', message: error.message });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [planFile, planSha256, releaseFile, releaseSha256] = process.argv.slice(2);
  assert(process.argv.length === 6, 'usage: node materialize-growth.js PLAN PLAN_SHA RELEASE RELEASE_SHA');
  const result = await materializeGrowth({ planFile, planSha256, releaseFile, releaseSha256 });
  console.log(JSON.stringify({ status: 'constructed-pending-independent-review', destination: result.destination, sources: 16, support: 0 }));
}
