/** Fixed typed gate composition, called only with its actual private snapshot pair. */
import { isDeepStrictEqual as same } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { captureCommittedFile } from './captured-source.js';
import { evaluateSubjectGovernance } from './subject-governance.js';
import { SubjectError } from './subjects.js';
import { loadSubjectQueryContext } from './subject-query-context.js';
import { canonicalSha256 } from './canonical-json.js';
import { iterateCurrentRecords } from './record-identity.js';
import { readAssignments } from './subject-assignments.js';
import { reportSubjectReach } from './subject-reach.js';
import { compareSubjectTreeViews } from './subject-view-impact.js';
import { compareTypedPromotionReplays } from './typed-promotion-replay.js';
import { typedPromotionPolicyRef } from './typed-promotion-policy.js';
import { runPreflight } from './preflight.js';
import { timeCheckStatus } from './time-verdicts.js';

const path = (kitPath, file) => kitPath === '.' ? file : `${kitPath}/${file}`;
const detached = ({ source, ...capture }) => capture;
const keys = (refs) => refs.map((ref) => canonicalSha256(ref)).sort();
const stores = { knowledge: 'knowledge', ontology: 'ontology', decision: 'decisions' };

export function createTypedPromotionResult() {
  return { version: 2, kind: 'typed-record-promotion-gate', mode: 'read-only-prepared-record-promotion',
    ok: false, publicationReady: false, inputDigest: null, inputs: null, recordKind: null,
    capabilities: { before: null, candidate: null },
    checks: Object.fromEntries(['admission', 'models', 'source', 'promotion', 'governance', 'assignments', 'preflight', 'preservation', 'authorizer', 'impacts']
      .map((name) => [name, { status: 'not-performed' }])),
    promotion: { status: 'not-performed', createdRefs: [], files: [], resources: null, diagnostics: [] }, assignment: null,
    preflight: { status: 'not-performed', recordKind: null, selectedIds: [], today: null, result: null },
    sources: { assignmentEvent: null },
    impacts: { status: 'not-performed', policy: null, applicability: null, required: null, reach: null, subjectTree: null,
      representativeReplays: null, unknownOwners: null,
      routes: { status: 'requires-final-capability', scope: 'kit-managed-subject-route-persistence' }, diagnostics: [] },
    resources: { limits: null, governance: null }, diagnostics: [] };
}

export function typedPromotionGovernance(creation, side, model, root) {
  const { request, budget } = creation;
  if (!model.subjectRegistry) {
    if (creation.continued && request.evidence.materialCaptures.length) return { ok: false,
      diagnostics: [{ code: 'promotion-material-authority-absent', message: 'Material continuation requires actual Subject authority.' }] };
    return { ok: true, context: { model } };
  }
  creation.governanceAttempted = true;
  try {
    const captured = captureCommittedFile({ repoRoot: request.repoRoot, commit: request[side].commit,
      file: path(request[side].kitPath, 'subjects/registry.yaml') });
    budget.admitCapture(captured); creation.registry[side] = captured;
    const file = join(root, captured.locator.file); const stat = lstatSync(file);
    const materialized = creation.continued ? { bytes: readFileSync(file) } : null;
    if (materialized) budget.admitCapture(materialized);
    if (!stat.isFile() || (stat.mode & 0o777) !== (Number.parseInt(captured.mode, 8) & 0o777)
      || !captured.bytes.equals(materialized ? materialized.bytes : readFileSync(file))) return { ok: false, diagnostics: [{ code: 'promotion-registry-membership',
      message: 'Loaded registry bytes and mode must match the actual committed source.' }] };
    const checked = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
      identityIndex: model.identityIndex, ...request.evidence }, { operationBudget: budget });
    if (!checked.ok) return checked;
    return { ok: true, context: { model, subjectGovernance: checked.governance } };
  } catch (error) {
    if (!(error instanceof SubjectError)) throw error;
    return { ok: false, diagnostics: [{ code: error.code, message: error.message }] };
  }
}

export function typedPromotionCapabilities(creation, models) {
  const { before, candidate } = creation.output.capabilities;
  const selectedStore = stores[creation.request.kind];
  if (['knowledge', 'ontology', 'decisions'].some((name) => before[name] !== candidate[name]
    || ['before', 'candidate'].some((side) => creation.output.capabilities[side][name] !== (models[side].stores[name]?.present === true)
      || (creation.output.capabilities[side][name] && !models[side].stores[name].catalog)))
    || !before[selectedStore] || !before.decisions || !candidate.assignmentHistory
    || !models.before.stores[selectedStore].catalog || !models.candidate.stores[selectedStore].catalog
    || before.subjectRegistry !== candidate.subjectRegistry) return false;
  if (before.subjectRegistry) {
    const old = creation.registry.before; const next = creation.registry.candidate;
    if (!old || !next || old.mode !== next.mode || !old.bytes.equals(next.bytes)) return false;
  }
  creation.output.checks.governance.status = 'passed'; return true;
}

/** Assignment has already passed actual identity, genesis, authorizer and whole-path checks. */
export function completeTypedPromotion(creation, roots, models, assignment) {
  const { request, output } = creation;
  const fail = (check, code, message, details) => {
    output.checks[check].status = 'failed';
    output.diagnostics.push({ code, path: check, message, ...(details === undefined ? {} : { details }) }); return false;
  };
  const preflight = output.preflight;
  preflight.status = 'failed'; preflight.recordKind = request.kind; preflight.today = request.today;
  preflight.selectedIds = request.promotion.rows.map(({ canonicalRef }) => canonicalRef.id);
  if (request.kind === 'decision') {
    preflight.status = 'not-applicable'; preflight.today = null;
    output.checks.preflight.status = 'not-applicable';
  } else {
    const knowledge = request.kind === 'knowledge';
    const mode = knowledge ? 'leaves' : 'concepts';
    preflight.result = runPreflight(models.candidate, { repoRoot: roots.candidate, [mode]: preflight.selectedIds,
      today: request.today, log: false });
    const checked = preflight.result;
    const verdicts = knowledge ? checked.payload['leaf-verdicts'] : checked.payload.verdicts;
    if (checked.exitCode !== 0 || checked.payload.ok !== true || checked.payload.mode !== mode
      || checked.payload['store-verdict'] !== 'trusted' || !Array.isArray(verdicts) || verdicts.length !== preflight.selectedIds.length
      || !same(verdicts.map((row) => row[knowledge ? 'leaf' : 'concept']).sort(), [...preflight.selectedIds].sort())
      || verdicts.some(({ verdict }) => verdict !== 'trusted')
      || (knowledge && checked.payload['time-check'] !== timeCheckStatus(request.today))) {
      return fail('preflight', 'promotion-selected-preflight-refused', 'Every exact newly effective record needs an actual trusted selected verdict.');
    }
    preflight.status = 'passed'; output.checks.preflight.status = 'passed';
  }
  const countedCapture = (side, file) => {
    const capture = captureCommittedFile({ repoRoot: request.repoRoot, commit: request[side].commit, file });
    assignment.used.captureBytes += capture.bytes.length;
    if (assignment.used.captureBytes > request.limits.assignments.maxCaptureBytes) {
      assignment.ok = false; assignment.checks.captures = { status: 'failed' }; return null;
    }
    return capture;
  };
  const event = countedCapture('candidate', assignment.eventSource.file);
  if (!event) return fail('preservation', 'promotion-capture-budget', 'Actual event capture exceeds the assignment allowance.');
  output.sources.assignmentEvent = { eventId: assignment.eventSource.eventId, eventDigest: assignment.eventSource.eventDigest, eventCapture: event.locator };
  const impact = output.impacts;
  impact.status = 'failed'; impact.policy = typedPromotionPolicyRef();
  const impactFail = (code, message, details) => { impact.diagnostics.push({ code, path: 'impacts', message }); return fail('impacts', code, message, details); };
  if (!output.capabilities.before.subjectRegistry) {
    impact.applicability = { kind: 'subject-registry-absent-both' }; impact.required = [];
    impact.status = 'passed'; output.checks.impacts.status = 'passed'; return true;
  }
  impact.applicability = { kind: 'subject-registry-present' }; impact.required = ['reach', 'subjectTree', 'representativeReplays'];
  const inputs = {};
  for (const [side, target] of [['before', 'before'], ['candidate', 'after']]) {
    const loaded = loadSubjectQueryContext({ root: roots[side], ...request.evidence });
    if (!loaded.ok) return impactFail('promotion-impact-context-unavailable', 'Actual impact context loading refused.', loaded.diagnostics);
    if (!same(loaded.context.model.identity, models[side].identity)) return impactFail('promotion-impact-context-mismatch', 'Reloaded impact identity must equal the actual checked snapshot.');
    inputs[target] = { capturedInputRef: canonicalSha256(request[side]), context: loaded.context };
  }
  const kinds = Object.keys(stores).filter((kind) => models.before.stores[stores[kind]]?.present === true);
  const records = { before: iterateCurrentRecords(models.before, { kinds }), after: iterateCurrentRecords(models.candidate, { kinds }) };
  const snapshot = (side) => ({ capturedInputRef: inputs[side].capturedInputRef, registry: inputs[side].context.model.subjectRegistry,
    records: records[side], coverage: kinds.map((kind) => ({ kind, status: 'complete' })) });
  const reach = reportSubjectReach({ before: snapshot('before'), after: snapshot('after'), kinds, limits: request.limits.reach });
  impact.reach = reach;
  if (!['complete', 'incomplete'].includes(reach.status) || ['before', 'after'].some((side) => !reach[side]
    || !['coverage', 'records', 'hierarchy'].every((name) => reach[side].completeness[name] === true) || reach[side].unvalidatedRecords !== 0)) {
    return impactFail('promotion-reach-incomplete', 'Actual structural record and hierarchy coverage must finish before interpreting absence.');
  }
  const unknown = impact.unknownOwners = { status: 'incomplete', retained: [], created: [] };
  const old = new Map(records.before.map((row) => [canonicalSha256(row.ref), row]));
  const next = new Map(records.after.map((row) => [canonicalSha256(row.ref), row]));
  if ([...old].some(([key, row]) => !same(next.get(key)?.entry, row.entry))
    || !same(keys(records.after.filter(({ ref }) => !old.has(canonicalSha256(ref))).map(({ ref }) => ref)), keys(output.promotion.createdRefs))) {
    return impactFail('promotion-reach-owner-mismatch', 'Preserve every old canonical owner and add exactly the proven creation set.');
  }
  const captures = new Map();
  const capture = (side, file) => {
    const key = `${side}:${file}`;
    if (!captures.has(key)) captures.set(key, countedCapture(side, file));
    return captures.get(key);
  };
  for (const row of records.after) if (readAssignments(row.entry).state === 'unknown') {
    const file = path(request.candidate.kitPath, row.entry.file); const after = capture('candidate', file);
    if (!after) return impactFail('promotion-capture-budget', 'Unknown-owner after capture exceeds the assignment allowance.');
    if (old.has(canonicalSha256(row.ref))) {
      const before = capture('before', file);
      if (!before) return impactFail('promotion-capture-budget', 'Unknown-owner before capture exceeds the assignment allowance.');
      if (before.mode !== after.mode || (!creation.plan.changes.some((change) => change.file === file) && !before.bytes.equals(after.bytes))) {
        return impactFail('promotion-unknown-owner-changed', 'Each old unknown owner needs exact preserved bytes, including any verified selected sibling spans.');
      }
      unknown.retained.push({ ref: row.ref, beforeCapture: detached(before.locator), afterCapture: detached(after.locator) });
    } else unknown.created.push({ ref: row.ref, afterCapture: detached(after.locator), eventId: request.eventId });
  }
  const retained = unknown.retained.map(({ ref }) => ref); const created = unknown.created.map(({ ref }) => ref);
  if (!same(keys(reach.before.unknownAssignments), keys(retained)) || !same(keys(reach.after.unknownAssignments), keys([...retained, ...created]))
    || !same(keys(reach.unknownImpact.map(({ ref }) => ref)), keys([...retained, ...created]))
    || reach.records.some((row) => created.some((ref) => same(ref, row.ref)) && row.before.presence !== 'absent')) {
    return impactFail('promotion-unknown-scope-mismatch', 'Raw unknown reach must equal exact unchanged old owners plus proven unknown births.');
  }
  unknown.status = 'complete';
  const tree = compareSubjectTreeViews({ version: 1, ...inputs, limits: request.limits.views,
    inventory: { version: 1, coverage: 'complete', views: [{ id: 'whole-registry', kind: 'subject-tree', options: request.limits.tree }] } });
  impact.subjectTree = tree;
  const paths = ['subjects/derived/tree.md', 'subjects/derived/metadata.json'].sort();
  if (tree.status !== 'complete' || tree.coverage.assessedViews !== 1 || tree.resources.derivations.calls !== 2 || tree.views.length !== 1
    || tree.views[0].delta.status !== 'exact' || ['added', 'removed', 'changed'].some((name) => tree.views[0].delta[name].length !== 0)
    || ['before', 'after'].some((side) => tree.views[0][side].status !== 'complete' || !same(tree.views[0][side].artifacts.map(({ path }) => path).sort(), paths))) {
    return impactFail('promotion-tree-incomplete', 'One complete identical whole-registry artifact pair is required for the unchanged registry.');
  }
  impact.representativeReplays = compareTypedPromotionReplays({ version: 1, ...inputs, limits: request.limits.replays, queryBudgets: request.limits.query });
  if (impact.representativeReplays.status !== 'complete') return impactFail('promotion-replays-incomplete', 'Every case in the complete fixed typed-current recipe must finish.');
  impact.status = 'passed'; output.checks.impacts.status = 'passed'; return true;
}
