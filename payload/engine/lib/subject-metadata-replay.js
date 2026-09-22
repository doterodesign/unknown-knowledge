/** Fixed internal metadata recipe over actual contexts; no caller query oracle. */
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalJsonBytes, canonicalSha256 } from './canonical-json.js';
import { subjectEligibility } from './subject-governance.js';
import { subjectAncestors, subjectDescendants, lookupSubjects, normalizeSubjectLabel } from './subjects.js';
import { compareSubjectReplays } from './subject-replay-impact.js';
import { parseProposalKey } from './record-identity.js';
import { SubjectError } from './subject-error.js';

const policy = { id: 'subject-metadata-replay-v1', version: 1, views: ['current','all'],
  expansions: ['direct','self-and-descendants'], subjectPolicy: 'current', ranking: { profile: 'id-v1' },
  possibleMatches: true, baseline: ['all','none','subjects-present','not-subjects-present'],
  unary: ['assigned','not-assigned'], pairs: ['and','or','and-not-right','and-not-left'], order: 'canonical-adjacent-no-wrap' };
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const assigned = subject => ({ op: 'assigned', subject });
const not = arg => ({ op: 'not', arg });
const verified = (row,id) => row.eligible === true && row.verification === 'verified' && row.resolution.status === 'resolved'
  && row.resolution.id === id && row.resolution.redirects.length === 0;
const unavailable = row => row.eligible === null && row.verification === 'unavailable' && row.code === 'governance-unavailable'
  && row.resolution.status === 'resolved';

/** Called only by the fixed actual-pair gate, with shared closure usage. */
export function compareSubjectMetadataReplays(input) { return compareReplays(input, false); }
export function compareSubjectProposalSuppressionReplays(input) { return compareReplays(input, true); }
function compareReplays({ before, after, event, inventory, limits, closure }, suppression) {
  const activePolicy = suppression ? { ...policy, id: 'subject-proposal-suppression-replay-v1' } : policy;
  const result = { version: 1, kind: suppression ? 'subject-proposal-suppression-replay' : 'subject-metadata-replay', status: 'refused',
    policy: { id: activePolicy.id, version: 1, digest: canonicalSha256(activePolicy) }, subjects: [], inventory: null, comparison: null,
    resources: { eligibility: { calls: 0, returnedCalls: 0, unreportedCalls: 0, redirects: 0 },
      relevance: { nodes: 0, edges: 0 }, requiredCases: null, requiredQueryCalls: null }, diagnostics: [] };
  const fail = (code,message) => { result.diagnostics.push({code,message}); return result; };
  const registries = { before: before.context.model.subjectRegistry, after: after.context.model.subjectRegistry };
  const append = row => {
    const bytes = canonicalJsonBytes(row).length;
    if (closure.used.rows >= limits.closure.maxRows || bytes > limits.closure.maxBytes - closure.used.bytes)
      throw new SubjectError('metadata-closure-budget', 'Qualification rows must fit before attachment.');
    closure.used.rows++; closure.used.bytes += bytes; result.subjects.push(row);
  };
  try {
    const ids = [...new Set([...registries.before.subjects.keys(), ...registries.after.subjects.keys()])].sort(order);
    if (ids.length > limits.replays.maxSubjects) return fail('metadata-replay-subject-budget','Admit the full canonical union before filtering.');
    const all = [...new Set([...ids, ...registries.before.proposals.keys(), ...registries.after.proposals.keys()])].sort(order);
    const relevant = new Set(event.rows.map(row => row.id));
    if (event.action === 'relate') for (const row of event.rows) {
      for (const state of [row.before,row.after]) for (const edge of state.related) relevant.add(edge.target);
    }
    if (event.action === 'reparent') {
      const endpoints = new Set();
      for (const row of event.rows) if (row.before.parent !== row.after.parent) {
        endpoints.add(row.id); for (const state of [row.before,row.after]) if (state.parent) endpoints.add(state.parent);
      }
      const usage = result.resources.relevance;
      for (const registry of Object.values(registries)) for (const id of endpoints) {
        relevant.add(id);
        for (const walk of [subjectAncestors,subjectDescendants]) {
          const reached = walk(registry,id,{ includeSelf: true, budget: {
            nodes: limits.reach.maxHierarchyNodes - usage.nodes, edges: limits.reach.maxHierarchyEdges - usage.edges } });
          usage.nodes += reached.used.nodes; usage.edges += reached.used.edges;
          if (reached.status !== 'complete') return fail('metadata-relevance-incomplete','Both actual ancestry and descendant closures must complete.');
          for (const reachedId of reached.ids) relevant.add(reachedId);
        }
      }
    }
    const used = new Set(inventory.uses.filter(row => row.kind === 'direct-assignment').map(row => row.subject));
    const eligible = [], usage = result.resources.eligibility;
    for (const id of all) {
      const row = { id, before: null, after: null, binding: {}, disposition: 'blocked' };
      for (const [side, pair] of [['before',before],['after',after]]) {
        const registry = registries[side], subject = registry.subjects.get(id) ?? registry.proposals.get(id);
        row.binding[side] = { subject: subject ?? null,
          history: subject ? registry.document.history.filter(event => subject.changes.includes(event.id)) : [],
          identity: pair.context.model.identity.allocations.filter(item => item.kind === 'subject' && item.id === id) };
        usage.calls++;
        try {
          row[side] = subjectEligibility(pair.context.subjectGovernance,id,{purpose:'query',policy:'current',
            budget:{ redirects:limits.replays.maxEligibilityRedirects - usage.redirects }});
          usage.returnedCalls++; usage.redirects += row[side].resolution.redirects.length;
        } finally { usage.unreportedCalls = usage.calls - usage.returnedCalls; }
      }
      const selected = suppression && event.rows.find(item => item.id === id);
      if (selected && parseProposalKey('subject',id).ok && row.before.eligible === false && row.after.eligible === false
        && row.before.code === 'subject-proposed' && row.after.code === 'subject-suppressed'
        && row.before.resolution.subject.status === 'proposed' && row.after.resolution.subject.status === 'suppressed'
        && row.before.resolution.redirects.length === 0 && row.after.resolution.redirects.length === 0
        && same(row.after.resolution.subject.refusal,{decision:event.decision,reason:event.reason})) {
        row.disposition = 'selected-proposal-suppressed';
      }
      else if (verified(row.before,id) && verified(row.after,id)) { row.disposition = 'verified-both'; if (ids.includes(id)) eligible.push(id); }
      else if (!relevant.has(id) && same(row.binding.before,row.binding.after) && same(row.before,row.after)) {
        if (row.before.eligible === false) row.disposition = 'stable-ineligible';
        else if (unavailable(row.before) && !used.has(id)) row.disposition = 'stable-unavailable-unrelated';
      }
      append(row);
    }
    if (result.subjects.some(row => row.disposition === 'blocked')) return fail('metadata-qualification-blocked','Changed, relevant or asymmetric unavailable governance cannot be excluded.');
    const stores = ['knowledge','ontology','decisions'].filter(store => [before,after].some(side => side.context.model.stores[store]?.present));
    if (!stores.length || stores.some(store => [before,after].some(side => !side.context.model.stores[store]?.present))) return fail('metadata-store-mismatch','All installed stores are required on both sides.');
    const E = BigInt(eligible.length), C = BigInt(stores.length) * 4n * (4n + 2n * E + 4n * BigInt(Math.max(eligible.length - 1,0)));
    if (C > BigInt(limits.replays.maxCases) || 2n*C > BigInt(Number.MAX_SAFE_INTEGER)) return fail('metadata-replay-case-budget','Reserve the full fixed recipe before calls.');
    result.resources.requiredCases = Number(C); result.resources.requiredQueryCalls = Number(2n*C);
    const predicates = [['all',{op:'all'}],['none',{op:'none'}],['subjects-present',{op:'subjects-present'}],['not-subjects-present',not({op:'subjects-present'})]];
    for (const id of eligible) predicates.push([`assigned/${id}`,assigned(id)],[`not-assigned/${id}`,not(assigned(id))]);
    for (let i=1;i<eligible.length;i++) {
      const a=assigned(eligible[i-1]),b=assigned(eligible[i]),name=`${eligible[i-1]}/${eligible[i]}`;
      predicates.push([`and/${name}`,{op:'and',args:[a,b]}],[`or/${name}`,{op:'or',args:[a,b]}],
        [`and-not-right/${name}`,{op:'and',args:[a,not(b)]}],[`and-not-left/${name}`,{op:'and',args:[b,not(a)]}]);
    }
    const cases=[];
    for (const store of stores) for (const view of policy.views) for (const expansion of policy.expansions) for (const [name,where] of predicates) {
      cases.push({id:`${store}/${view}/${expansion}/${name}`,query:{version:1,stores:[store],view,expansion,subjectPolicy:'current',
        ranking:{profile:'id-v1'},possibleMatches:true,where,budgets:limits.query}});
    }
    result.inventory={version:1,coverage:'complete',cases:cases.sort((a,b)=>order(a.id,b.id))};
    result.inventoryDigest=canonicalSha256(result.inventory);
    result.comparison=compareSubjectReplays({version:1,before,after,inventory:result.inventory,
      limits:{version:1,maxCases:limits.replays.maxCases,maxInventoryBytes:limits.replays.maxInventoryBytes}});
    if (result.comparison.status !== 'complete' || result.comparison.resources.queries.calls !== Number(2n*C)) return fail('metadata-query-incomplete','Every native paired query must complete, including all assigned governance.');
    for (const row of result.comparison.cases) {
      const query=row.specification.query;
      const invariant=event.action !== 'reparent' || query.expansion === 'direct' || ['all','none'].includes(query.where.op);
      if (row.candidates.status !== 'exact' || invariant && ['strict','possible'].some(key => row.candidates[key].added.length || row.candidates[key].removed.length))
        return fail('metadata-membership-delta','Direct memberships and invariant descendant memberships must remain exact.');
    }
    result.status='complete'; return result;
  } catch (error) {
    if (!(error instanceof SubjectError)) throw error;
    return fail(error.code,error.message);
  }
}

export function compareSubjectMetadataLookups({before,after,event,limits}) {
  const result={version:1,status:'refused',terms:[],rows:[],resources:{terms:0,termBytes:0,reservedMatches:0,returnedMatches:0,calls:0,bytes:0},diagnostics:[]};
  const fail=message=>{result.diagnostics.push({code:'metadata-lookup-budget',message});return result;};
  const terms=[...new Set(event.rows.filter(row=>!same(row.before,row.after)).flatMap(row=>[row.before,row.after]
    .flatMap(state=>[state.label,...state.aliases.map(alias=>alias.label)])))].sort(order);
  const bytes=terms.reduce((sum,term)=>sum+Buffer.byteLength(term,'utf8'),0);
  if(terms.length>limits.maxTerms || bytes>limits.maxTermBytes)return fail('Actual distinct terms and UTF-8 bytes must fit before lookup.');
  result.terms=terms; result.resources.terms=terms.length; result.resources.termBytes=bytes;
  for(const term of terms)for(const [side,registry] of [['before',before],['after',after]]){
    const count=(registry.labels.get(normalizeSubjectLabel(term))??[]).length;
    if(count>limits.maxMatches-result.resources.reservedMatches)return fail('Native label bucket occurrences must fit before lookup.');
    result.resources.reservedMatches+=count; result.resources.calls++;
    const output=lookupSubjects(registry,term,{}); const row={term,side,output}; const size=canonicalJsonBytes(row).length;
    result.resources.returnedMatches+=output.matches.length;
    if(size>limits.maxBytes-result.resources.bytes)return fail('Complete homonym output must fit before attachment.');
    result.resources.bytes+=size;result.rows.push(row);
  }
  result.status='complete';return result;
}
