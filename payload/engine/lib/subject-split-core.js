import { verifyLifecycleEvidenceSources } from './subject-lifecycle-context.js';
/** Fixed actual Git split scope; private handoff only, never caller proof or publication. */
import { isDeepStrictEqual as same } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readCommittedTree } from './commit-snapshot.js';
import { captureCommittedFile } from './captured-source.js';
import { locateKitRoot } from './kit-root.js';
import { canonicalSha256, canonicalJsonBytes, CapturedInputError } from './canonical-json.js';
import { validateSubjectSplitCreation } from './subject-governance.js';
import { createSubjectValidationBudget, getSubjectValidationBudget, adaptDocumentBudgetError } from './subject-validation-budget.js';
import { resolveRecord } from './record-identity-index.js';
import { inspectSubjectUses, inspectContinuedSubjectUses } from './subject-use-inventory.js';
import { validateAssignmentHistoryChain } from './subject-history.js';
import { runChecks } from '../commands/validate.js';
import { parseCanonicalId, RECORD_KINDS } from './record-identity.js';
import { SubjectError } from './subjects.js';
import { rethrowIfBug } from './engine-refusal.js';

const key = row => { const ref = row.ref ?? row.proposalRef; return JSON.stringify([ref.namespace,ref.kind,ref.id ?? ref.key]); };
const inheritedKey = row => JSON.stringify([key(row),row.assignedSubject]);
const parentKey = row => JSON.stringify([row.child,row.parent]);
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const repoPath = (kitPath,file) => kitPath === '.' ? file : `${kitPath}/${file}`;
const contentLocator = ({source,...locator}) => locator;
const fail = (code,message) => { throw new SubjectError(code,message); };
const requireThat = (condition,code,message) => { if (!condition) fail(code,message); };
const exactKeys = (actual,requests,rowKey) => new Set(requests.map(rowKey)).size === requests.length
  && same(actual.map(rowKey).sort(compare),requests.map(rowKey).sort(compare));

function closureBudget(limits) {
  requireThat(limits && Object.keys(limits).length === 2 && ['maxRows','maxBytes'].every(name =>
    Number.isSafeInteger(limits[name]) && limits[name] >= 0),'invalid-split-closure-budget','Supply exact closure capacities.');
  const report = {used:{rows:0,bytes:0},failure:null};
  return {report, admit(row) {
    if (report.failure) fail(report.failure.code,'The split closure allowance remains exhausted.');
    const request = {rows:1,bytes:canonicalJsonBytes(row).length};
    for (const [counter,limit] of [['rows','maxRows'],['bytes','maxBytes']]) if (request[counter] > limits[limit]-report.used[counter]) {
      report.failure = {code:'split-closure-budget',limit,used:report.used[counter],requested:request[counter]};
      fail(report.failure.code,`Split closure exceeds ${limit}.`);
    }
    report.used.rows += request.rows; report.used.bytes += request.bytes;
  }};
}

function selectOriginalBeforePair(input,budget) {
  const descriptor = input.before.descriptor;
  const expected = {commit:descriptor.commit,tree:descriptor.tree};
  const file = repoPath(descriptor.kitPath,'subjects/registry.yaml');
  const matches = [];
  for (const pair of input.evidence.assessmentCaptures) {
    budget.charge('validationSteps',1,'split-original-pair-selection');
    if (pair.registry.capture.file === file && same(pair.registry.capture.source,expected)) matches.push(pair);
  }
  requireThat(matches.length === 1,'split-original-before-pair','Retain the exact original before pair once, without reconstruction.');
  const pair = matches[0];
  requireThat(pair.identity.capture.file === repoPath(descriptor.kitPath,'_identity.yaml')
    && same(pair.identity.capture.source,expected),'split-original-before-pair','Both original authorities must name the exact before source and paths.');
  return {pair,historical:input.evidence.assessmentCaptures.filter(value => value !== pair)};
}

function captureActualFilePair(input,file,budget) {
  const captures = {};
  for (const side of ['before','candidate']) {
    const actual = captureCommittedFile({repoRoot:input.repoRoot,commit:input[side].descriptor.commit,file});
    budget.admitCapture(actual);
    const path = join(input[side].root,file); const stat = lstatSync(path);
    requireThat(stat.isFile() && (stat.mode & 0o777) === (Number.parseInt(actual.mode,8) & 0o777),
      'split-file-membership','Actual committed mode must equal the materialized regular file.');
    const materialized={bytes:readFileSync(path)};
    budget.admitCapture(materialized);
    requireThat(actual.bytes.equals(materialized.bytes),'split-file-membership','Actual committed bytes must equal the materialized regular file.');
    captures[side] = actual;
  }
  requireThat(captures.before.mode === captures.candidate.mode,'split-file-mode-changed','Split retains authority and owner file modes.');
  return captures;
}

function verifyEvidenceSources(input,historicalPairs,selectedReview,budget) {
  // The original before pair has already been checked against both actual
  // authority files. Other declared sources need their own physical proof.
  const captures=[...input.evidence.decisionCaptures,...historicalPairs.flatMap(pair=>[pair.registry,pair.identity])];
  for (const capture of captures) {
    const locator=capture.capture;
    if (!locator.source) continue;
    budget.charge('validationSteps',1,'split-evidence-source-lookup');
    const actual=captureCommittedFile({repoRoot:input.repoRoot,commit:locator.source.commit,file:locator.file});
    budget.admitCapture(actual);
    requireThat(same(actual.locator,locator) && actual.objectFormat === capture.objectFormat && actual.bytes.equals(capture.bytes),
      same(locator,selectedReview) ? 'split-authorizer-source' : 'split-evidence-source',
      'Every declared retained source must equal its actual committed locator and bytes.');
  }
}

function retainWholeOwner(input,before,after,budget) {
  requireThat(after && same(before.assignments,after.assignments) && same(before.lifecycle,after.lifecycle)
    && same(before.locator,after.locator) && before.resolution === after.resolution
    && same(contentLocator(before.capture),contentLocator(after.capture)),
  'split-retained-owner-changed','Protected unknown/historical owners retain assignments, lifecycle, occurrence and whole file.');
  const captures = captureActualFilePair(input,before.capture.file,budget);
  requireThat(captures.before.bytes.equals(captures.candidate.bytes),'split-retained-owner-changed','Protected owner file bytes remain exact.');
}

function inspectOwnerClosure(input,core,budget,append) {
  const operation = input.operation; const source = operation.subject;
  const before = core.inventory.records.filter(row => row.side === 'before');
  const after = new Map(core.inventory.records.filter(row => row.side === 'candidate').map(row => [key(row),row]));
  requireThat(after.size === before.length && before.every(row => after.has(key(row))),
    'split-owner-universe-changed','Split preserves the complete original canonical/proposal owner universe.');
  const old = new Map(before.map(row => [key(row),row]));
  const resolutions = {before:new Map(),candidate:new Map()};
  const allocated = (row,side) => {
    if (!row.ref || !RECORD_KINDS.includes(row.ref.kind)) return false;
    const cache = resolutions[side]; const id = key(row);
    if (!cache.has(id)) {
      budget.charge('validationSteps',1,'split-owner-identity-lookup');
      try {
        cache.set(id,resolveRecord(input[side].model.identityIndex,row.ref,
          {documentBudget:budget.documentBudget,phase:'split-owner-identity-lookup'}).status === 'loaded');
      } catch (error) { throw adaptDocumentBudgetError(error); }
    }
    return cache.get(id);
  };
  const uses = (side,kind) => core.inventory.uses.filter(row => row.side === side && row.kind === kind && row.subject === source);
  const direct = uses('before','direct-assignment'); const nextDirect = uses('candidate','direct-assignment');
  for (const [side,rows] of [['before',direct],['candidate',nextDirect]]) requireThat(rows.every(row => allocated(row,side)
    && ['effective','non-effective'].includes(row.lifecycle.state)),'split-source-use-unsupported','Source uses require allocated canonical owners with known lifecycle.');
  const effective = direct.filter(row => row.lifecycle.state === 'effective');
  const historical = direct.filter(row => row.lifecycle.state === 'non-effective');
  requireThat((effective.length === 0) === (operation.assignmentEvent === null),
    'split-assignment-event-intent','Null assignment intent is required exactly for empty actual effective scope.');
  requireThat(exactKeys(effective,operation.mappings,key),'split-mapping-scope','Mappings must equal the complete actual effective direct set.');
  requireThat(exactKeys(historical,operation.retainedHistoricalUses,key) && exactKeys(nextDirect,historical,key),
    'split-historical-scope','Candidate direct source uses must equal the exact reviewed inactive originals.');
  const unknown = before.filter(row => row.assignments.state === 'unknown');
  requireThat(exactKeys(unknown,operation.retainedUnknowns,key)
    && exactKeys([...after.values()].filter(row => row.assignments.state === 'unknown'),operation.retainedUnknowns,key),
  'split-unknown-scope','Unknown retentions must equal both actual absent-field owner sets.');
  for (const request of operation.retainedUnknowns) {
    const original = old.get(key(request)); const candidate = after.get(key(request));
    requireThat(same(original.assignments,{state:'unknown',reason:'absent'}) && original.lifecycle.state !== 'unknown'
      && ['loaded','proposal'].includes(original.resolution),'split-unknown-owner-unsupported','Retain only supported actual unknown owners.');
    retainWholeOwner(input,original,candidate,budget);
    append(core.authoredReferenceClosure.retainedUnknowns,{...structuredClone(request),before:original,after:candidate});
  }
  for (const request of operation.retainedHistoricalUses) {
    const beforeRecord = old.get(key(request)); const candidateRecord = after.get(key(request));
    retainWholeOwner(input,beforeRecord,candidateRecord,budget);
    append(core.authoredReferenceClosure.retainedHistoricalUses,{...structuredClone(request),beforeRecord,candidateRecord});
  }
  const selected = new Map(operation.mappings.map(row => [key(row),row]));
  for (const request of operation.mappings) {
    const original = old.get(key(request)); const candidate = after.get(key(request));
    const subset = operation.successors.filter(id => request.successors.includes(id));
    requireThat(same(subset,request.successors),'split-mapping-order','Mapping successor subsets retain operation order and uniqueness.');
    const expected = {state:'known',ids:original.assignments.ids.flatMap(id => id === source ? subset : [id])};
    requireThat(allocated(candidate,'candidate') && same(candidate.assignments,expected),
      'split-assignment-substitution','Actual raw assignments replace source at its original position with the exact ordered subset.');
    append(core.assignments,{ref:structuredClone(request.ref),after:expected});
  }
  for (const original of before) {
    const candidate = after.get(key(original));
    requireThat(same(original.lifecycle,candidate.lifecycle) && same(original.locator,candidate.locator)
      && original.resolution === candidate.resolution,'split-owner-changed','All owner lifecycles and physical occurrences remain unchanged.');
    if (!selected.has(key(original))) requireThat(same(original.assignments,candidate.assignments),
      'split-unselected-assignment-changed','Unselected owners retain literal original assignments.');
  }
  for (const id of operation.successors) {
    const actual = core.inventory.uses.filter(row => row.side === 'candidate' && row.kind === 'direct-assignment' && row.subject === id);
    const expected = operation.mappings.filter(row => row.successors.includes(id));
    requireThat(exactKeys(actual,expected,key),'split-successor-use-scope','Fresh successor assignments equal the exact actual mapped owners.');
  }
  return {old,after,selected,allocated,uses};
}

function inspectGraphClosure(input,core,budget,append,owners) {
  const operation = input.operation; const source = operation.subject;
  const {old,after,selected,allocated,uses} = owners;
  const oldRegistry = input.before.model.subjectRegistry; const nextRegistry = input.candidate.model.subjectRegistry;
  const references = core.inventory.uses.filter(row => row.kind === 'registry-reference');
  const involved = new Set([source,...operation.successors]);
  requireThat(!references.some(row => (row.type === 'association' && (involved.has(row.source) || involved.has(row.target)))
    || (['redirect','successor'].includes(row.type) && row.target === source)),
  'split-graph-use-unsupported','Incident associations and inbound source redirects/successors require a separate adjudication profile.');
  const alternatives = references.filter(row => row.side === 'candidate' && ['redirect','successor'].includes(row.type)
    && operation.successors.includes(row.target));
  requireThat(alternatives.length === operation.successors.length && alternatives.every(row => row.type === 'successor' && row.source === source),
    'split-alternative-scope','Only the exact source split alternatives may introduce successor references.');
  const parentRows = side => references.filter(row => row.side === side && row.type === 'parent' && (row.source === source || row.target === source));
  const endpoints = row => ({child:row.source,parent:row.target});
  const beforeParents = parentRows('before'); const candidateParents = parentRows('candidate');
  requireThat(exactKeys(beforeParents.map(endpoints),operation.retainedParents,parentKey)
    && exactKeys(candidateParents.map(endpoints),operation.retainedParents,parentKey),
  'split-parent-scope','Review the exact unchanged source-incident parent edges.');
  for (const request of operation.retainedParents) {
    const endpoint = {child:request.child,parent:request.parent};
    const beforeWitness = beforeParents.find(row => same(endpoints(row),endpoint));
    const candidateWitness = candidateParents.find(row => same(endpoints(row),endpoint));
    requireThat(beforeWitness.locator === candidateWitness.locator,'split-parent-changed','Retained parent occurrence must remain exact.');
    append(core.authoredReferenceClosure.retainedParents,{...structuredClone(request),beforeWitness,candidateWitness});
  }
  requireThat(same(operation.successorParents.map(row => row.subject),operation.successors),
    'split-successor-parent-scope','Review all fresh successor parent choices in operation order, including roots.');
  for (const request of operation.successorParents) {
    const subject = nextRegistry.subjects.get(request.subject);
    requireThat((subject.parent ?? null) === request.parent,'split-successor-parent-mismatch','Parent review must equal the actual fresh state.');
    const candidateWitness = references.find(row => row.side === 'candidate' && row.type === 'parent' && row.source === request.subject) ?? null;
    requireThat(request.parent === null ? candidateWitness === null : candidateWitness?.target === request.parent,
      'split-successor-parent-mismatch','Actual new edge witness must match the reviewed choice.');
    append(core.authoredReferenceClosure.successorParents,{...structuredClone(request),candidateWitness});
  }
  const oldUses = uses('before','inherited-assignment'); const nextUses = uses('candidate','inherited-assignment');
  for (const [side,rows] of [['before',oldUses],['candidate',nextUses]]) requireThat(rows.every(row => allocated(row,side)
    && ['effective','non-effective'].includes(row.lifecycle.state) && parseCanonicalId('subject',row.assignedSubject).ok),
  'split-inherited-use-unsupported','Inherited source uses require supported allocated canonical owners and descendants.');
  const oldWitnesses = new Map(oldUses.map(row => [inheritedKey(row),row]));
  const nextWitnesses = new Map(nextUses.map(row => [inheritedKey(row),row]));
  const union = new Map([...oldWitnesses,...nextWitnesses]);
  requireThat(exactKeys([...union.values()],operation.retainedInheritedUses,inheritedKey),
    'split-inherited-scope','Review the complete actual source witness union.');
  const chain = (registry,id) => {
    const path = []; const seen = new Set();
    while (id !== undefined) {
      budget.charge('subjects',1,'split-inherited-parent-step'); budget.charge('validationSteps',1,'split-inherited-parent-step');
      requireThat(!seen.has(id),'split-inherited-chain','Actual inherited chain must be acyclic.'); seen.add(id);
      const row = registry.subjects.get(id); requireThat(Boolean(row),'split-inherited-chain','Every actual inherited ancestor must exist.');
      path.push(id); if (id === source) return path; id = row.parent;
    }
    fail('split-inherited-chain','Assigned descendant must actually reach source.');
  };
  for (const request of operation.retainedInheritedUses) {
    const beforeWitness = oldWitnesses.get(inheritedKey(request)) ?? null;
    const candidateWitness = nextWitnesses.get(inheritedKey(request));
    const beforeRecord = old.get(key(request)); const candidateRecord = after.get(key(request));
    requireThat(candidateWitness && beforeRecord && candidateRecord && beforeRecord.assignments.state === 'known'
      && candidateRecord.assignments.state === 'known' && candidateRecord.assignments.ids.includes(request.assignedSubject),
    'split-inherited-changed','Inherited candidate membership and original owner must exist.');
    const candidateChain = chain(nextRegistry,request.assignedSubject); const mapping = selected.get(key(request));
    let disposition;
    if (beforeWitness || beforeRecord.assignments.ids.includes(request.assignedSubject)) {
      requireThat(same(chain(oldRegistry,request.assignedSubject),candidateChain)
        && (!beforeWitness || same(beforeWitness.path,candidateWitness.path)),
      'split-inherited-changed','Retained descendant paths remain exact.');
      if (beforeWitness) disposition = 'retained';
      else {
        requireThat(mapping && beforeRecord.assignments.ids.includes(source),'split-inherited-exposure','Exposure requires actual prior direct-source suppression.');
        disposition = 'exposed-by-direct-substitution';
      }
    } else {
      requireThat(mapping && operation.successors.includes(request.assignedSubject) && mapping.successors.includes(request.assignedSubject),
        'split-inherited-introduction','A new descendant assignment must be the exact mapped fresh successor.');
      disposition = 'introduced-by-successor-assignment';
    }
    append(core.authoredReferenceClosure.retainedInheritedUses,{...structuredClone(request),beforeRecord,candidateRecord,beforeWitness,candidateWitness,disposition});
  }
}

/** INTERNAL: fixed actual materialization supplies models; only core is serialized. */
export async function inspectSubjectSplitAssignmentScope(input) {
  return inspectSplit(input, null);
}

export async function inspectContinuedSplitAssignmentScope(input, { operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  return inspectSplit(input, budget);
}

async function inspectSplit(input, continuedBudget) {
  const budget = continuedBudget ?? createSubjectValidationBudget(input.limits.governance); const closure = closureBudget(input.limits.closure);
  const core = {version:1,ok:false,inputs:null,operation:null,registry:null,decision:null,allocation:null,assessment:null,
    authoredReferenceClosure:{status:'not-performed',semanticCompleteness:'unknown',affectedRefs:[],retainedUnknowns:[],
      retainedHistoricalUses:[],retainedParents:[],retainedInheritedUses:[],successorParents:[]},inventory:null,assignments:[],
    resources:{governance:null,closure:closure.report,allocation:null},diagnostics:[]};
  const bundle = {core,candidateGovernance:null,operationBudget:budget};
  const finish = () => {core.resources.governance={used:budget.used,failure:budget.failure}; return bundle;};
  const append = (rows,row) => {closure.admit(row); rows.push(row);};
  const stable = value => typeof value === 'string' ? value.replaceAll(input.before.root,'<before>').replaceAll(input.candidate.root,'<candidate>').replaceAll(input.repoRoot,'<repository>')
    : Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,stable(v)])) : value;
  try {
    budget.guard(input.operation,'split-core-operation'); core.operation=structuredClone(input.operation);
    const {operation}=input;
    for (const side of ['before','candidate']) {
      const {descriptor,root,model}=input[side];
      requireThat(readCommittedTree(input.repoRoot,descriptor.commit).tree === descriptor.tree,'split-tree-mismatch','Actual committed tree must equal its descriptor.');
      requireThat((relative(root,locateKitRoot(root)) || '.') === descriptor.kitPath && model.ok,'split-model-unavailable','Load the healthy actual model at its exact kit path.');
    }
    requireThat(input.before.descriptor.kitPath === input.candidate.descriptor.kitPath,'split-installation-changed','Kit location must remain unchanged.');
    core.inputs={before:structuredClone(input.before.descriptor),candidate:structuredClone(input.candidate.descriptor)};
    const selected = selectOriginalBeforePair(input,budget);
    const proof = validateSubjectSplitCreation({beforeModel:input.before.model,candidateModel:input.candidate.model,
      beforeCaptures:selected.pair,decisionCaptures:input.evidence.decisionCaptures,assessmentCaptures:selected.historical,
      ...(continuedBudget ? {materialCaptures:input.evidence.materialCaptures} : {}),
      operation:{id:operation.id,subject:operation.subject,successors:operation.successors,registryEvents:operation.registryEvents},
      allocationLimits:input.limits.allocation},{operationBudget:budget});
    core.resources.allocation=proof.resources.allocation;
    if (!proof.ok) {core.diagnostics.push(...stable(proof.diagnostics)); return finish();}
    const file = name => repoPath(input.before.descriptor.kitPath,name);
    const registry = captureActualFilePair(input,file('subjects/registry.yaml'),budget);
    const identity = captureActualFilePair(input,file('_identity.yaml'),budget);
    for (const [part,actual] of [['registry',registry.before],['identity',identity.before]]) requireThat(same(actual.locator,selected.pair[part].capture)
      && actual.objectFormat === selected.pair[part].objectFormat && actual.bytes.equals(selected.pair[part].bytes),
    'split-original-before-membership','Original retained authority bytes and complete source locators must equal actual before Git.');
    const prior=input.before.model.subjectRegistry.document; const next=input.candidate.model.subjectRegistry.document;
    const [activation,split]=next.history.slice(-2); const original=prior.subjects.find(row=>row.id===operation.subject);
    const expectedSubjects=prior.subjects.map(row=>row.id===operation.subject ? {...row,status:'retired',retirement:{kind:'split',successors:operation.successors},changes:[...row.changes,split.id]} : row);
    expectedSubjects.push(...activation.rows.map(row=>({id:row.id,...row.after,changes:[activation.id]})));
    requireThat(same(next,{...prior,subjects:expectedSubjects,history:[...prior.history,activation,split],revision:prior.revision+2,
      hierarchyRevision:prior.hierarchyRevision+(activation.rows.some(row=>row.after.parent !== undefined)?1:0)}),
    'split-unrelated-registry-change','Only the exact two-event append and fresh states may change the complete registry.');
    requireThat(original?.status === 'active','split-source-ineligible','Source must remain an original active meaning.');
    core.registry={file:file('subjects/registry.yaml'),beforeCapture:registry.before.locator,candidateCapture:registry.candidate.locator,events:structuredClone(operation.registryEvents)};
    const allocation={before:{capture:identity.before.locator,mode:identity.before.mode},candidate:{capture:identity.candidate.locator,mode:identity.candidate.mode},
      publication:proof.allocation.publication,allocatedIds:proof.allocation.ids,occupied:proof.allocation.occupied,remaining:proof.allocation.remaining};
    closure.admit(allocation); core.allocation=allocation; closure.admit(proof.assessment); core.assessment=proof.assessment;
    const {review}=split; const entry=input.before.model.decisions.get(split.decision.id);
    const decisionFile=file(entry.file); const authorizer=captureActualFilePair(input,decisionFile,budget);
    requireThat(authorizer.before.bytes.equals(authorizer.candidate.bytes)
      && same(contentLocator(authorizer.before.locator),contentLocator(review.decisionCapture)),
    'split-authorizer-changed','The entire selected authorizer file/mode and reviewed bytes must remain exact.');
    if (continuedBudget) verifyLifecycleEvidenceSources({ repoRoot:input.repoRoot,before:input.before,candidate:input.candidate,
      evidence:{...input.evidence,assessmentCaptures:selected.historical},operationBudget:budget });
    else verifyEvidenceSources(input,selected.historical,review.decisionCapture,budget);
    core.decision={ref:split.decision,reference:review.reference,acceptedStatus:review.acceptedStatus,decisionDigest:review.decisionDigest,decisionCapture:review.decisionCapture};
    for (const side of ['before','candidate']) {
      const model=input[side].model; const errors=runChecks(model,input[side].root).filter(row=>row.severity==='error');
      const history=model.assignmentHistory;
      const chain=history ? validateAssignmentHistoryChain({namespace:model.identity.namespace,baselines:history.baselines,events:history.events}) : null;
      requireThat(!errors.length && (!chain || chain.ok),'split-structure-or-history','Actual model structure and complete existing assignment history must validate.');
    }
    for (const store of ['knowledge','ontology','decisions']) requireThat(input.before.model.stores[store].present === input.candidate.model.stores[store].present,
      'split-store-presence-changed','Every actual store keeps its presence.');
    const subjects=[...new Set([...prior.subjects,...next.subjects].map(row=>row.id))].sort(compare);
    const inventoryInput={repoRoot:input.repoRoot,...core.inputs,subjects,evidence:input.evidence,limits:input.limits.inventory,
      impactPolicy:{required:[],requiredExtensions:[]}};
    core.inventory=await (continuedBudget ? inspectContinuedSubjectUses(inventoryInput,{operationBudget:budget}) : inspectSubjectUses(inventoryInput));
    requireThat(['complete','incomplete'].includes(core.inventory.status) && ['before','candidate'].every(side=> {
      const coverage=core.inventory.coverage[side]; const model=input[side].model;
      return coverage && ['records','registry','hierarchy'].every(part=>coverage[part]==='complete')
        && core.inventory.inputs[side]?.registryDigest===canonicalSha256(model.subjectRegistry.document)
        && core.inventory.inputs[side]?.identityDigest===canonicalSha256(model.identity);
    }) && core.inventory.potentialUses.every(row=>row.reason==='unknown-assignments'),
    'split-inventory-incomplete','Complete actual record/reference/hierarchy inventory is mandatory.');
    const owners=inspectOwnerClosure(input,core,budget,append); inspectGraphClosure(input,core,budget,append,owners);
    budget.assertActive(); core.authoredReferenceClosure.affectedRefs=core.assignments.map(row=>row.ref);
    core.authoredReferenceClosure.status='complete';
    if (!core.authoredReferenceClosure.retainedUnknowns.length) core.authoredReferenceClosure.semanticCompleteness='complete';
    core.ok=true; bundle.candidateGovernance=proof.governance; return finish();
  } catch (error) {
    if (!(error instanceof SubjectError || error instanceof CapturedInputError)) rethrowIfBug(error);
    core.diagnostics.push(stable({code:error.code ?? 'split-source-unavailable',path:'splitScope',message:error.message}));
    return finish();
  }
}
