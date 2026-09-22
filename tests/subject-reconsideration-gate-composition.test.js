import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('actual gate invokes one native plan and model, then two fresh context operations', () => {
  const source = `
    import { test, mock } from 'node:test';
    import assert from 'node:assert/strict';
    import * as ledger from './payload/engine/lib/identity-ledger.js';
    let plans = 0, models = 0, contexts = 0;
    mock.module('./payload/engine/lib/identity-ledger.js', { namedExports: { ...ledger,
      planAllocations(...args) { plans++; return ledger.planAllocations(...args); }
    }});
    const governance = await import('./payload/engine/lib/subject-governance.js');
    mock.module('./payload/engine/lib/subject-governance.js', { namedExports: { ...governance,
      validateSubjectReconsiderationCreation(...args) { models++; return governance.validateSubjectReconsiderationCreation(...args); }
    }});
    const queryContext = await import('./payload/engine/lib/subject-query-context.js');
    const operations = [];
    mock.module('./payload/engine/lib/subject-query-context.js', { namedExports: { ...queryContext,
      loadSubjectQueryContext(input) { contexts++; operations.push(input.operation); return queryContext.loadSubjectQueryContext(input); }
    }});
    const { subjectReconsiderationGateFixture } = await import('./tests/helpers/subject-reconsideration-gate-fixture.js');
    const { inspectSubjectReconsiderationGate } = await import('./payload/engine/lib/subject-reconsideration-gate.js');
    test('literal actual call composition', async t => {
      const f = subjectReconsiderationGateFixture(t);
      const report = await inspectSubjectReconsiderationGate(f.gateInput());
      assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
      assert.deepEqual({plans,models,contexts}, {plans:1,models:1,contexts:2});
      assert.notEqual(operations[0],operations[1]);
      assert.equal(report.resources.contexts.before.outputBytesWritten,0);
      assert.equal(report.resources.contexts.after.outputBytesWritten,0);
    });
  `;
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--test-reporter=tap', '--input-type=module', '-e', source],
    { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 120000, maxBuffer: 8000000 });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout, /# fail 0/);
});
