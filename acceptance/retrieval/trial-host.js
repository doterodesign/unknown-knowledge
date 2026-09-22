// Test-only delivery boundary. The outer tool transcript must still be audited.
import { readFileSync, writeFileSync, realpathSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { invokeIntentOperation, inspectIntentDelivery, installedFiles } from './intent-host.js';

const DEFAULT_LIMITS = { operations: 60, records: 32, fullRecords: 32,
  sourceBytes: 65536, resultBytes: 262144, perResultBytes: 16384 };
const bytes = text => Buffer.byteLength(text, 'utf8');
const union = (old, added) => [...new Set([...old, ...added])];
const hash = text => createHash('sha256').update(text).digest('hex');

function returnedMetadata(payload, records) {
  const inspected = new Set();
  const add = (kind, localId) => {
    const record = records.find(record => record.kind === kind && record.localId === localId);
    if (!record) throw new Error('returned metadata outside declared inventory');
    inspected.add(record.id);
  };
  const leaf = row => {
    add('knowledge', row.id);
    for (const neighbor of Object.values(row.relates ?? {}).flat()) add('knowledge', neighbor.id);
    for (const successor of row['superseded-by'] ?? []) add('knowledge', successor.id);
  };
  for (const row of payload.results ?? []) {
    add('ontology', row.id);
    for (const related of row['confusable-with'] ?? []) add('ontology', related.id);
    for (const entry of row.knowledge ?? []) leaf(entry);
  }
  for (const row of payload.leaves ?? []) leaf(row);
  for (const row of payload.exclusions ?? []) leaf(row);
  for (const row of payload.decomposition?.concepts ?? []) add('ontology', row.id);
  for (const row of payload.decomposition?.['near-miss'] ?? []) {
    if (row.kind === 'concept') add('ontology', row.id);
  }
  for (const row of payload.verdicts ?? []) add('ontology', row.concept);
  for (const row of payload['leaf-verdicts'] ?? []) add('knowledge', row.leaf);
  return [...inspected];
}

function declaredPath(config, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.split('/').includes('..')) throw new Error('invalid declared path');
  const actual = realpathSync(resolve(config.root, path));
  const inside = relative(config.root, actual);
  if (inside === '..' || inside.startsWith('../') || isAbsolute(inside)) throw new Error('read outside declared root');
  return actual;
}

function verifySnapshot(config) {
  if (config.runtimeFiles && JSON.stringify(installedFiles(config.root)) !== JSON.stringify(config.runtimeFiles)) throw new Error('declared installation changed');
  for (const [path, digest] of Object.entries(config.fileHashes)) {
    if (hash(readFileSync(declaredPath(config, path))) !== digest) throw new Error('declared inventory changed');
  }
}

export function renderDelivery(result) {
  return result.silent ? '' : `${result.status} exit=${result.exitCode ?? '-'}${result.reason ? `: ${result.reason}` : ''}\n${result.text ?? ''}`;
}

export function createTrialHost(stateFile, configuration) {
  const limits = { ...DEFAULT_LIMITS, ...configuration.limits };
  if (Object.entries(limits).some(([key, value]) => !(key in DEFAULT_LIMITS) || !Number.isSafeInteger(value) || value < 0)) throw new Error('invalid trial limits');
  const config = { ...configuration, root: realpathSync(configuration.root), limits };
  if (!config.namespace || !Array.isArray(config.sourceFiles) || !Array.isArray(config.metadataFiles) || !Array.isArray(config.records)) throw new Error('invalid trial inventory');
  const identities = new Set();
  for (const record of config.records) {
    const expected = `${config.namespace}/${record.kind}/${record.localId}`;
    if (!['ontology', 'knowledge', 'decisions'].includes(record.kind) || !record.localId || record.id !== expected || identities.has(expected)) throw new Error('invalid record inventory');
    identities.add(expected);
  }
  const paths = union([...config.sourceFiles, ...config.metadataFiles, ...(config.runtimeFiles ?? []),
    ...Object.values(config.intentPolicies ?? {}), ...[config.decisionCaptures, config.assessmentCaptures].filter(Boolean)],
  config.records.flatMap(record => [record.file, record.catalog]));
  config.fileHashes = Object.fromEntries(paths.map(path => [path, hash(readFileSync(declaredPath(config, path)))]));
  writeFileSync(stateFile, JSON.stringify({ configuration: config,
    operations: 0, sourceBytes: 0, resultBytes: 0, recordIds: [], fullRecordIds: [], subjectIds: [], sourceFiles: [], sourcePassages: [], events: [] }), { flag: 'wx' });
}

export function runTrialOperation(stateFile, operation) {
  // A concurrent invocation cannot read the old counters and spend them twice.
  const lockFile = `${stateFile}.lock`;
  const lock = openSync(lockFile, 'wx');
  try { return runLockedOperation(stateFile, operation); }
  finally { closeSync(lock); unlinkSync(lockFile); }
}

function runLockedOperation(stateFile, operation) {
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  const config = state.configuration;
  state.operations += 1;
  let result;
  let sourceSize = 0;
  let inspected = [];
  let detailed = [];
  let subjects = [];
  let command = null;
  const receipt = executed => ({ exitCode: executed.status, signal: executed.signal ?? null,
    errorCode: executed.error?.code ?? null,
    stdoutBytes: Buffer.byteLength(executed.stdout ?? ''), stdoutSha256: hash(executed.stdout ?? ''),
    stderrBytes: Buffer.byteLength(executed.stderr ?? ''), stderrSha256: hash(executed.stderr ?? '') });
  let passages = [];
  try {
    if (state.operations > config.limits.operations) throw new Error('operation budget exhausted');
    verifySnapshot(config);
    if (operation.type === 'read') {
      const allowed = [...config.sourceFiles, ...config.metadataFiles,
        ...config.records.flatMap(record => [record.file, record.catalog])];
      if (!allowed.includes(operation.path)) throw new Error('read outside declared inventory');
      const path = declaredPath(config, operation.path);
      let text = readFileSync(path, 'utf8');
      if (operation.startLine !== undefined || operation.endLine !== undefined) {
        if (config.sourceFiles.includes(operation.path)
          || config.records.some(record => record.file === operation.path || record.catalog === operation.path)
          || !Number.isSafeInteger(operation.startLine) || operation.startLine < 1
          || !Number.isSafeInteger(operation.endLine) || operation.endLine < operation.startLine) {
          throw new Error('line windows require declared non-record metadata');
        }
        text = text.split('\n').slice(operation.startLine - 1, operation.endLine).join('\n');
      }
      sourceSize = config.sourceFiles.includes(operation.path) ? bytes(text) : 0;
      inspected = config.records.filter(record => record.file === operation.path || record.catalog === operation.path).map(record => record.id);
      detailed = config.records.filter(record => record.file === operation.path).map(record => record.id);
      passages = config.sourceFiles.includes(operation.path) ? [`${config.namespace}/${operation.path}#whole-file`,
        ...[...text.matchAll(/^## (.+)$/gm)].map(match => `${config.namespace}/${operation.path}#${match[1]}`)] : [];
      result = { status: 'completed', exitCode: 0, text };
    } else if (['resolve', 'preflight'].includes(operation.type)) {
      const args = [resolve(config.root, `unknown-knowledge/engine/${operation.type}.js`)];
      if (operation.type === 'resolve') {
        if (typeof operation.query !== 'string' || operation.query.startsWith('-')) throw new Error('invalid query');
        args.push(operation.query);
      } else {
        for (const key of ['concepts', 'leaves']) {
          if (operation[key] !== undefined) {
            if (!Array.isArray(operation[key]) || operation[key].some(id => typeof id !== 'string' || !/^[A-Z]-[0-9]+$/.test(id))) throw new Error('invalid selection');
            args.push(`--${key}`, operation[key].join(','));
          }
        }
      }
      args.push('--json', '--root', config.root);
      if (config.today) args.push('--today', config.today);
      const executed = spawnSync(process.execPath, args, { cwd: config.root, encoding: 'utf8',
        maxBuffer: config.limits.resultBytes + 1, timeout: 30000 });
      command = receipt(executed);
      if (executed.error || executed.status === null) throw new Error('engine invocation failed');
      let payload = {};
      try { payload = JSON.parse(executed.stdout); } catch { /* Engine diagnostics retain their actual status below. */ }
      inspected = returnedMetadata(payload, config.records);
      result = { status: 'completed', exitCode: executed.status,
        text: executed.stdout + (executed.stderr ? `\n[stderr]\n${executed.stderr}` : '') };
    } else if (['subject-lookup', 'intent-plan'].includes(operation.type)) {
      const executed = invokeIntentOperation(config, operation, stateFile);
      command = receipt(executed);
      if (executed.error || executed.status === null) throw new Error('engine invocation failed');
      // Non-JSON diagnostics and additional stderr are not typed exposure containers.
      // Refuse them without leaking their content; the private receipt preserves status.
      if (executed.stderr?.length) throw new Error('engine diagnostics require operator review');
      let payload;
      try { payload = JSON.parse(executed.stdout.toString('utf8')); }
      catch { throw new Error('unrecognized engine response'); }
      ({ inspected, detailed, subjects } = inspectIntentDelivery(payload, operation, config));
      result = { status: 'completed', exitCode: executed.status, text: executed.stdout.toString('utf8') };
    } else throw new Error('unsupported host operation');
    verifySnapshot(config);
    if (state.sourceBytes + sourceSize > config.limits.sourceBytes) throw new Error('source budget exhausted');
    if (union(state.recordIds, inspected).length > config.limits.records) throw new Error('record budget exhausted');
    if (union(state.fullRecordIds, detailed).length > config.limits.fullRecords) throw new Error('full-record budget exhausted');
    const deliverySize = bytes(renderDelivery(result));
    if (deliverySize > config.limits.perResultBytes || state.resultBytes + deliverySize > config.limits.resultBytes) {
      throw new Error('result budget exhausted');
    }
  } catch (error) {
    // Expected filesystem errors never echo filesystem contents or an engine payload.
    result = { status: 'refused', exitCode: 2,
      reason: error.code ? 'read failed' : error.message };
  }
  let delivery = renderDelivery(result);
  if (bytes(delivery) > config.limits.perResultBytes || state.resultBytes + bytes(delivery) > config.limits.resultBytes) {
    result = { status: 'refused', exitCode: 2, silent: true };
    delivery = '';
  }
  if (result.status === 'completed') {
    state.sourceBytes += sourceSize;
    state.recordIds = union(state.recordIds, inspected);
    state.fullRecordIds = union(state.fullRecordIds, detailed);
    state.subjectIds = union(state.subjectIds ?? [], subjects);
    if (passages.length) state.sourceFiles = union(state.sourceFiles, [`${config.namespace}/${operation.path}`]);
    state.sourcePassages = union(state.sourcePassages, passages);
  }
  state.resultBytes += bytes(delivery);
  state.events.push({ operation: operation.type, path: operation.path ?? null, request: operation, status: result.status,
    requestBytes: bytes(JSON.stringify(operation)), command,
    exitCode: result.exitCode, deliveredBytes: bytes(delivery), deliveredSha256: hash(delivery),
    sourceBytes: result.status === 'completed' ? sourceSize : 0 });
  writeFileSync(stateFile, JSON.stringify(state));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [stateFile, type, input] = process.argv.slice(2);
  let operation = { type };
  if (type === 'read') {
    operation.path = input;
    if (process.argv[5] !== undefined) {
      operation.startLine = Number(process.argv[5]);
      operation.endLine = Number(process.argv[6]);
    }
  }
  else if (type === 'resolve') operation.query = input;
  else if (['preflight', 'subject-lookup', 'intent-plan'].includes(type)) {
    try { operation = { ...JSON.parse(input ?? '{}'), type }; }
    catch { operation = { type: 'invalid' }; }
  }
  try {
    const result = runTrialOperation(stateFile, operation);
    process.stdout.write(renderDelivery(result));
    process.exitCode = result.exitCode ?? 2;
  } catch {
    process.stderr.write('trial host state unavailable\n');
    process.exitCode = 2;
  }
}
