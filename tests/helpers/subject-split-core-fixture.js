/** Real Git split pairs; all expected candidate rows are independently authored. */
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { subjectSplitCreationFixture } from './subject-split-creation-fixture.js';
import { retirementInput } from './subject-retirement-input-fixture.js';
import { registryWire } from './equivalent-merge-fixture.js';
import { canonicalSha256 } from '../../payload/engine/lib/canonical-json.js';
import { withTreeSnapshot } from '../../payload/engine/lib/commit-snapshot.js';
import { loadStores } from '../../payload/engine/lib/load-stores.js';
import { locateKitRoot } from '../../payload/engine/lib/kit-root.js';

const assessmentKeys = { refusalAssessment:'refusal-assessment', beforeRegistry:'before-registry',
  documentDigest:'document-digest', identityDigest:'identity-digest', relevantRefusals:'relevant-refusals' };
const assessmentWire = value => Array.isArray(value) ? value.map(assessmentWire) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key,item]) => [assessmentKeys[key] ?? key,assessmentWire(item)])) : value;
const key = ref => JSON.stringify([ref.namespace, ref.kind, ref.id ?? ref.key]);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function subjectSplitCoreFixture(t, { objectFormat = 'sha1', nested = false, kinds = ['knowledge'],
  knowledgePresent = true, zero = false, historical = false, inherited = 'none', recordFormat = 'json', beforeChange, candidateChange } = {}) {
  assert.ok(knowledgePresent || !kinds.includes('knowledge'));
  assert.ok(['json','block'].includes(recordFormat),'recordFormat must be json or block');
  const f = subjectSplitCreationFixture(t, { objectFormat, nested, count: 2,
    parents: inherited === 'introduced' ? ['S-000002'] : [] });
  // All Git mutations are confined to the temporary fixture repository.
  f.git('reset', '--hard', f.before.commit);
  const namespace = f.ref.namespace; const ref = (id, kind = 'knowledge') => ({ namespace, kind, id });
  const parse = text => recordFormat === 'json' ? JSON.parse(text) : load(text);
  const fields = record => Object.entries(record).map(([key,value]) => key === 'notes' && Array.isArray(value) && value.length
    ? `notes:\n${value.map(note=>`  - ${JSON.stringify(note)}\n`).join('')}`
    : `${key}: ${JSON.stringify(value)}\n`).join('');
  const putEntries = (file,doc) => f.put(file,recordFormat === 'json' ? doc
    : Object.entries(doc).map(([key,value]) => key === 'entries' && Array.isArray(value) && value.length
      ? `entries:\n${value.map(record=>Object.entries(record).map(([field,item],index)=>`${index?'    ':'  - '}${field}: ${JSON.stringify(item)}\n`).join('')).join('')}`
      : `${key}: ${JSON.stringify(value)}\n`).join(''));
  const editEntries = (file,edit) => { const doc=parse(f.read(file)); edit(doc.entries); putEntries(file,doc); };
  const editKnowledge = (file, edit) => {
    const pieces = f.read(file).split('---\n'); const record = parse(pieces[1]); edit(record);
    pieces[1] = recordFormat === 'json' ? `${JSON.stringify(record)}\n` : fields(record); f.put(file, pieces.join('---\n'));
  };
  const ledger = JSON.parse(f.read('_identity.yaml')); const owners = [];
  if (knowledgePresent) {
    editKnowledge('knowledge/draft.md', record => { record.subjects = []; });
    for (let index = 1; index <= 6; index++) editKnowledge(`knowledge/K-${String(index).padStart(6, '0')}.md`, record => {
      if (index === 5) delete record.subjects; else record.subjects = [];
      if (index === 4 && historical) { record.subjects = ['S-000001']; record.facets.stage = 'draft'; }
      if (index === 6 && inherited !== 'none') record.subjects = ['S-000002'];
    });
  } else {
    rmSync(join(f.kitRoot, 'knowledge'), { recursive: true });
    ledger.allocations = ledger.allocations.filter(row => row.kind !== 'knowledge');
  }
  const beforeIds = [['S-000001'], ['S-000003', 'S-000001'], ['S-000002', 'S-000001', 'S-000003']];
  const subsets = [[], ['S-000004'], ['S-000004', 'S-000005']];
  for (const kind of kinds) {
    const rows = [];
    for (let index = 0; index < 3; index++) {
      const id = `${kind === 'knowledge' ? 'K' : kind === 'ontology' ? 'O' : 'D'}-${String(index + (kind === 'decision' ? 3 : 1)).padStart(6, '0')}`;
      const subjects = zero ? [] : [...beforeIds[index]];
      const file = kind === 'knowledge' ? `knowledge/${id}.md` : `${kind === 'ontology' ? 'ontology/classes' : 'decisions/entries'}/split-owners.yaml`;
      owners.push({ ref: ref(id, kind), file, before: subjects, successors: [...subsets[index]] });
      if (kind === 'knowledge') editKnowledge(file, record => { record.subjects = subjects; });
      else {
        ledger.allocations.push({ id, kind, state: 'allocated', publication: { id: 'b2000000-0000-4000-8000-000000000001', review: 'review:existing-owners' } });
        rows.push(kind === 'ontology' ? { id, term: id, class: 'general', summary: 'Original class', definition: 'Original meaning',
          status: 'active', 'source-of-truth': [nested ? 'unknown-knowledge/src/owned.js' : 'src/owned.js'], 'last-verified': '2026-09-20', subjects }
          : { id, title: id, category: 'architecture', status: 'accepted', date: '2026-09-20', deciders: ['steward'],
            context: 'Original context', decision: 'Original choice', subjects });
      }
    }
    if (kind !== 'knowledge') {
      const file = owners.find(row => row.ref.kind === kind).file;
      putEntries(file, { 'schema-version': 2, entries: rows });
      const catalogFile = `${kind === 'ontology' ? 'ontology' : 'decisions'}/_catalog.yaml`;
      const catalog = kind === 'ontology' ? { 'schema-version': 2, store: 'ontology', entries: [] } : JSON.parse(f.read(catalogFile));
      catalog.entries.push(...rows.map(row => ({ id: row.id, title: row.title ?? row.term,
        file: kind === 'ontology' ? 'classes/split-owners.yaml' : 'entries/split-owners.yaml' })));
      f.put(catalogFile, catalog); if (kind === 'ontology') f.put('src/owned.js', 'export const original = true;\n');
    }
  }
  f.put('_identity.yaml', ledger);
  const hooks = { ...f, owners, ref, editKnowledge, editEntries, ledger };
  beforeChange?.(hooks);
  const before = f.commit('actual core before owners'); const beforeModel = loadStores(f.kitRoot);
  assert.equal(beforeModel.ok, true, JSON.stringify(beforeModel.diagnostics));
  const beforeCaptures = { registry: f.capture(before, 'subjects/registry.yaml'), identity: f.capture(before, '_identity.yaml') };
  const operation = { version: 1, ...structuredClone(f.operation), action: 'split',
    assignmentEvent: zero ? null : { id: 'c2000000-0000-4000-8000-000000000001', changeDigest: 'a'.repeat(64) },
    mappings: zero ? [] : owners.map(row => ({ ref: row.ref, successors: row.successors, reason: 'Reviewed independent mapping' })).sort((a,b) => compare(key(a.ref),key(b.ref))),
    retainedUnknowns: [ref('D-000001','decision'),ref('D-000002','decision'), ...(knowledgePresent ? [ref('K-000005')] : [])]
      .map(ref => ({ ref, reason: 'Retain original unknown classification' })).sort((a,b) => compare(key(a.ref),key(b.ref))),
    retainedHistoricalUses: historical && knowledgePresent ? [{ ref: ref('K-000004'), reason: 'Retain inactive original use' }] : [],
    retainedParents: [{ child:'S-000002',parent:'S-000001',reason:'Preserve original narrower meaning' }],
    retainedInheritedUses: [], successorParents: f.ids.map((subject,index) => ({ subject,
      parent: f.activation.rows[index].after.parent ?? null, reason:'Reviewed parent choice' })) };
  f.activation.refusalAssessment.scope = { beforeRegistry: { capture: beforeCaptures.registry.capture,
    documentDigest: canonicalSha256(beforeModel.subjectRegistry.document) }, identityDigest: canonicalSha256(beforeModel.identity) };
  const identity = { ...structuredClone(beforeModel.identity), allocations: [...structuredClone(beforeModel.identity.allocations),
    ...f.ids.map(id => ({ id, kind:'subject',state:'allocated',publication:{id:operation.id,review:f.activation.review.reference} }))] };
  for (const owner of owners) {
    const after = owner.before.flatMap(id => id === operation.subject ? owner.successors : [id]);
    if (owner.ref.kind === 'knowledge') editKnowledge(owner.file, record => { record.subjects = after; });
    else editEntries(owner.file,rows=>{rows.find(row=>row.id===owner.ref.id).subjects=after;});
    if (!zero && owner.before.includes('S-000002')) operation.retainedInheritedUses.push({ref:owner.ref,assignedSubject:'S-000002',reason:'Expose old descendant membership'});
    if (!zero && inherited === 'introduced' && owner.successors.includes('S-000004')) operation.retainedInheritedUses.push({ref:owner.ref,assignedSubject:'S-000004',reason:'Introduce reviewed successor path'});
  }
  if (knowledgePresent && inherited !== 'none') operation.retainedInheritedUses.push({ref:ref('K-000006'),assignedSubject:'S-000002',reason:'Retain inherited source use'});
  operation.retainedInheritedUses.sort((a,b) => compare(JSON.stringify([...JSON.parse(key(a.ref)),a.assignedSubject]),JSON.stringify([...JSON.parse(key(b.ref)),b.assignedSubject])));
  const document = { ...structuredClone(beforeModel.subjectRegistry.document), history: [...structuredClone(beforeModel.subjectRegistry.document.history), f.activation, f.split] };
  const input = retirementInput(); Object.assign(input,{ repoRoot:f.root,before,operation,
    evidence:{decisionCaptures:f.input.decisionCaptures,assessmentCaptures:[beforeCaptures]} });
  input.impact.policy = 'subject-split-impact-v1'; input.limits.allocation = {maxLedgerRows:1000,maxSuccessors:10};
  const rebuild = () => {
    for (const event of [f.activation,f.split]) { const {review,...body}=event; review.changeDigest=canonicalSha256(body); }
    const states=new Map(); const changes=new Map();
    for(const event of document.history) for(const row of event.rows) { states.set(row.id,structuredClone(row.after)); changes.set(row.id,[...(changes.get(row.id)??[]),event.id]); }
    document.subjects=[...states].map(([id,state])=>({id,...state,changes:changes.get(id)}));
    document.revision=document.history.length; document.hierarchyRevision=document.history.filter(event=>event.rows.some(row=>(row.before?.parent??null)!==(row.after.parent??null))).length;
    operation.registryEvents=[f.activation,f.split].map(event=>({id:event.id,changeDigest:event.review.changeDigest}));
    f.put('_identity.yaml',identity); f.put('subjects/registry.yaml',registryWire(assessmentWire(document)));
  };
  rebuild(); candidateChange?.({...hooks,input,operation,document,identity,activation:f.activation,split:f.split,rebuild});
  input.candidate=f.commit('actual core literal split candidate');
  const withCoreInput=fn=>withTreeSnapshot(f.root,input.before.tree,old=>withTreeSnapshot(f.root,input.candidate.tree,next=>{
    const sides={}; for(const [side,snapshot] of [['before',old],['candidate',next]]) {
      const model=loadStores(locateKitRoot(snapshot.root));
      sides[side]={descriptor:input[side],root:snapshot.root,model};
    }
    return fn({repoRoot:f.root,...sides,operation:input.operation,reviewNote:input.reviewNote,evidence:input.evidence,
      limits:{inventory:input.limits.inventory,governance:input.limits.governance,closure:input.limits.closure,allocation:input.limits.allocation}});
  }));
  return {...hooks,input,operation,document,identity,activation:f.activation,split:f.split,beforeCaptures,rebuild,withCoreInput};
}
