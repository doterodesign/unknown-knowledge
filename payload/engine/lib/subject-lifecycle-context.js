/** Fixed internal lifecycle evidence and context composition; no caller policy or authority DTO. */
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { loadStores } from './load-stores.js';
import { locateKitRoot } from './kit-root.js';
import { getSubjectValidationBudget } from './subject-validation-budget.js';
import { evaluateSubjectGovernance } from './subject-governance.js';
import { captureCommittedFile, describeCandidateBytes } from './captured-source.js';
import { SubjectError } from './subject-error.js';

export function loadContinuedLifecycleContext({ root, evidence, operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  const model = loadStores(locateKitRoot(root));
  if (!model.ok || !model.subjectRegistry) return { ok: false, diagnostics: model.diagnostics };
  const evaluated = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
    identityIndex: model.identityIndex, ...evidence }, { operationBudget: budget });
  if (!evaluated.ok) return evaluated;
  // The actual caller binds this fresh handle once at its own model boundary.
  return { ok: true, context: { model, subjectGovernance: evaluated.governance } };
}

/** The fixed actual owner supplies both immutable roots; all supplied families are checked. */
export function verifyLifecycleEvidenceSources({ repoRoot, before, candidate, evidence, operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget); budget.assertActive();
  const sides = { before, candidate }, cache = new Map(), files = new Map();
  const fail = (code, message) => { throw new SubjectError(`lifecycle-continuation-${code}`, message); };
  const actual = (commit, file) => {
    budget.charge('validationSteps', 1, 'lifecycle-continuation-source-lookup');
    const key = JSON.stringify([commit, file]);
    if (!cache.has(key)) {
      const captured = captureCommittedFile({ repoRoot, commit, file }); budget.admitCapture(captured);
      if (!['100644', '100755'].includes(captured.mode)) fail('source-mode', 'Declared evidence must be a regular Git file.');
      cache.set(key, captured);
    }
    return cache.get(key);
  };
  const current = (side, file) => {
    budget.charge('validationSteps', 1, 'lifecycle-continuation-current-file');
    const key = JSON.stringify([side, file]); if (files.has(key)) return files.get(key);
    const { root, descriptor } = sides[side], parts = file.split('/');
    for (let i = 1; i < parts.length; i++) if (!lstatSync(join(root, ...parts.slice(0, i)), { throwIfNoEntry: false })?.isDirectory()) return null;
    const path = join(root, file), stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat?.isFile()) return null;
    const mode = `100${(stat.mode & 0o777).toString(8)}`; if (!['100644', '100755'].includes(mode)) return null;
    const raw = { bytes: readFileSync(path) }; budget.admitCapture(raw);
    const committed = actual(descriptor.commit, file);
    const locator = describeCandidateBytes({ file, bytes: raw.bytes, objectFormat: committed.objectFormat });
    const { source, ...detached } = committed.locator;
    if (mode !== committed.mode || !raw.bytes.equals(committed.bytes) || !same(detached, locator)) fail('current-mismatch', 'Current snapshot bytes and mode must match their actual commit.');
    const result = { locator, bytes: raw.bytes, objectFormat: committed.objectFormat }; files.set(key, result); return result;
  };
  const prove = supplied => {
    budget.charge('validationSteps', 1, 'lifecycle-continuation-evidence-membership');
    const locator = supplied.capture;
    if (locator.source) {
      const captured = actual(locator.source.commit, locator.file);
      if (!same(captured.locator, locator) || captured.objectFormat !== supplied.objectFormat || !captured.bytes.equals(supplied.bytes)) fail('evidence-source', 'Declared evidence differs from actual committed full-file bytes.');
      return Object.keys(sides).filter(side => same(locator.source, { commit: sides[side].descriptor.commit, tree: sides[side].descriptor.tree }));
    }
    const matched = Object.keys(sides).filter(side => {
      const captured = current(side, locator.file);
      return captured && same(captured.locator, locator) && captured.objectFormat === supplied.objectFormat && captured.bytes.equals(supplied.bytes);
    });
    if (!matched.length) fail('evidence-correspondence', 'Source-less evidence must match an actual side.');
    return matched;
  };
  for (const row of evidence.decisionCaptures) prove(row);
  for (const pair of evidence.assessmentCaptures) {
    const registry = prove(pair.registry), identity = prove(pair.identity);
    if ((!pair.registry.capture.source || !pair.identity.capture.source) && !registry.some(side => identity.includes(side))) fail('assessment-side', 'Assessment authorities require one common actual side.');
  }
  for (const row of evidence.materialCaptures) prove(row);
}
