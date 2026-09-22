import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectSplitCoreFixture } from './helpers/subject-split-core-fixture.js';
import { inspectSubjectSplitAssignmentScope as inspect } from '../payload/engine/lib/subject-split-core.js';
import { canonicalJsonBytes } from '../payload/engine/lib/canonical-json.js';

const counters={captureBytes:'maxCaptureBytes',documentNodes:'maxDocumentNodes',documentTextUnits:'maxDocumentTextUnits',
  subjects:'maxSubjects',historyRows:'maxHistoryRows',validationSteps:'maxValidationSteps'};
const retainedRows=c=>[c.allocation,c.assessment,...c.assignments,...c.authoredReferenceClosure.retainedUnknowns,
  ...c.authoredReferenceClosure.retainedHistoricalUses,...c.authoredReferenceClosure.retainedParents,
  ...c.authoredReferenceClosure.retainedInheritedUses,...c.authoredReferenceClosure.successorParents].filter(Boolean);

test('one authentic core allowance admits exact governance fit and refuses every one-short counter',async t=>{
  const f=subjectSplitCoreFixture(t,{historical:true,inherited:'introduced'});
  const original=await f.withCoreInput(inspect); assert.equal(original.core.ok,true,JSON.stringify(original.core.diagnostics));
  const used=original.core.resources.governance.used;
  const exact=Object.fromEntries(Object.entries(counters).map(([counter,limit])=>[limit,used[counter]]));
  const good=await f.withCoreInput(input=>{input.limits={...input.limits,governance:exact};return inspect(input);});
  assert.equal(good.core.ok,true,JSON.stringify(good.core.diagnostics)); assert.deepEqual(good.core,original.core);
  for(const [counter,limit] of Object.entries(counters)) await t.test(limit,async()=>{
    const failed=await f.withCoreInput(input=>{input.limits={...input.limits,governance:{...exact,[limit]:exact[limit]-1}};return inspect(input);});
    assert.equal(failed.core.ok,false);assert.equal(failed.candidateGovernance,null);
    const failure=failed.core.resources.governance.failure;
    assert.equal(failure.code,'subject-validation-budget');assert.equal(failure.counter,counter);
    assert.equal(failed.core.resources.governance.used[counter]<=exact[limit]-1,true);
    const prior=failed.operationBudget.used;
    assert.throws(()=>failed.operationBudget.assertActive(),{code:'subject-validation-budget'});
    assert.throws(()=>failed.operationBudget.charge('validationSteps',0,'after-failure'),{code:'subject-validation-budget'});
    assert.deepEqual(failed.operationBudget.used,prior);
  });
});

test('closure capacities charge complete rows before attaching any failed row',async t=>{
  const f=subjectSplitCoreFixture(t,{historical:true,inherited:'introduced'});
  const original=await f.withCoreInput(inspect);assert.equal(original.core.ok,true,JSON.stringify(original.core.diagnostics));
  const used=original.core.resources.closure.used; const exact={maxRows:used.rows,maxBytes:used.bytes};
  const good=await f.withCoreInput(input=>{input.limits={...input.limits,closure:exact};return inspect(input);});
  assert.equal(good.core.ok,true);assert.deepEqual(good.core,original.core);
  for(const [limit,value] of [['maxRows',0],['maxBytes',0],['maxRows',used.rows-1],['maxBytes',used.bytes-1]]) await t.test(`${limit}=${value}`,async()=>{
    const b=await f.withCoreInput(input=>{input.limits={...input.limits,closure:{...exact,[limit]:value}};return inspect(input);});
    assert.equal(b.core.ok,false);assert.equal(b.candidateGovernance,null);
    assert.equal(b.core.diagnostics[0].code,'split-closure-budget');
    assert.equal(b.core.resources.closure.failure.limit,limit);
    const rows=retainedRows(b.core);
    assert.deepEqual(b.core.resources.closure.used,{rows:rows.length,bytes:rows.reduce((n,row)=>n+canonicalJsonBytes(row).length,0)});
    if(value===0) {assert.equal(b.core.allocation,null);assert.equal(b.core.assessment,null);assert.equal(rows.length,0);}
    assert.notEqual(b.core.authoredReferenceClosure.status,'complete');
  });
});

test('allocation populations are admitted once and fail before raw evidence admission',async t=>{
  const f=subjectSplitCoreFixture(t); const b=await f.withCoreInput(inspect); assert.equal(b.core.ok,true,JSON.stringify(b.core.diagnostics));
  const used=b.core.resources.allocation.used;
  const exact={maxLedgerRows:used.ledgerRows,maxSuccessors:used.successors};
  const good=await f.withCoreInput(input=>{input.limits={...input.limits,allocation:exact};return inspect(input);});
  assert.equal(good.core.ok,true);assert.deepEqual(good.core.resources.allocation.used,used);
  for(const limit of Object.keys(exact)) await t.test(limit,async()=>{
    const failed=await f.withCoreInput(input=>{input.limits={...input.limits,allocation:{...exact,[limit]:exact[limit]-1}};return inspect(input);});
    assert.equal(failed.core.ok,false);assert.equal(failed.candidateGovernance,null);
    assert.equal(failed.core.diagnostics[0].code,'split-allocation-budget');
    assert.equal(failed.core.resources.allocation.failure.limit,limit);
    assert.deepEqual(failed.core.resources.allocation.used,{ledgerRows:0,successors:0});
    assert.equal(failed.core.resources.governance.used.captureBytes,0);assert.equal(failed.core.allocation,null);
  });
});

test('record and hierarchy inventory exhaustion refuse independently of model allocation success',async t=>{
  const f=subjectSplitCoreFixture(t);
  for(const limit of ['maxRecordVisits','maxRegistryReferenceVisits','maxHierarchyNodes','maxHierarchyEdges']) await t.test(limit,async()=>{
    const b=await f.withCoreInput(input=>{input.limits={...input.limits,inventory:{...input.limits.inventory,[limit]:0}};return inspect(input);});
    assert.equal(b.core.ok,false);assert.equal(b.candidateGovernance,null);assert.ok(b.core.allocation);
    assert.equal(b.core.diagnostics[0].code,'split-inventory-incomplete',JSON.stringify(b.core.diagnostics));
  });
});
