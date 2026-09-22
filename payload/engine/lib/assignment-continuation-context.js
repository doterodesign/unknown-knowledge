/** Fixed actual snapshot continuation, called only by the ordinary gate. */
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { captureCommittedFile, describeCandidateBytes } from './captured-source.js';
import { readCommittedTree } from './commit-snapshot.js';
import { getSubjectValidationBudget } from './subject-validation-budget.js';
import { evaluateSubjectGovernance, validateSubjectGovernanceCapture } from './subject-governance.js';
import { SubjectError } from './subject-error.js';
import { rethrowIfBug } from './engine-refusal.js';

const sides = ['before', 'candidate'];
const detached = ({ source, ...capture }) => capture;
const fail = (code, message) => { throw new SubjectError(code, message); };

/** No caller policy, source recovery, fake commit, or publicly supplied proof. */
export function createAssignmentContinuationContexts({ repoRoot, snapshot, roots, kitPaths, models, evidence, operationBudget }) {
  const budget = getSubjectValidationBudget(operationBudget);
  budget.assertActive();
  budget.charge('validationSteps', 1, 'assignment-continuation-source-format');
  const { objectFormat } = readCommittedTree(repoRoot, snapshot.before.commit);
  const commits = { before: snapshot.before.commit, candidate: snapshot.candidate.commit };
  const captures = new Map(), currentFiles = new Map();
  const committed = (commit, file) => {
    budget.charge('validationSteps', 1, 'assignment-continuation-source-lookup');
    const key = JSON.stringify([commit, file]);
    if (!captures.has(key)) {
      let actual;
      try { actual = captureCommittedFile({ repoRoot, commit, file }); }
      catch (error) {
        rethrowIfBug(error);
        fail('assignment-continuation-source-unavailable', error.message);
      }
      budget.admitCapture(actual);
      captures.set(key, actual);
    }
    return captures.get(key);
  };
  const current = (side, file) => {
    budget.charge('validationSteps', 1, 'assignment-continuation-current-file');
    const key = JSON.stringify([side, file]);
    if (currentFiles.has(key)) return currentFiles.get(key);
    const parts = file.split('/');
    for (let index = 1; index < parts.length; index++) {
      if (!lstatSync(join(roots[side], ...parts.slice(0, index)), { throwIfNoEntry: false })?.isDirectory()) return null;
    }
    const path = join(roots[side], file), stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat?.isFile()) return null;
    const mode = `100${(stat.mode & 0o777).toString(8)}`;
    if (!['100644', '100755'].includes(mode)) return null;
    const raw = { bytes: readFileSync(path) };
    budget.admitCapture(raw);
    const locator = describeCandidateBytes({ file, bytes: raw.bytes, objectFormat });
    if (commits[side]) {
      const actual = committed(commits[side], file);
      if (actual.mode !== mode || !actual.bytes.equals(raw.bytes) || !same(detached(actual.locator), locator)) {
        fail('assignment-continuation-current-mismatch', 'Materialized files must match their exact committed bytes and modes.');
      }
    }
    const result = { locator, bytes: raw.bytes, mode, objectFormat };
    currentFiles.set(key, result);
    return result;
  };
  if (kitPaths.before !== kitPaths.candidate) fail('assignment-installation-changed', 'Ordinary assignment preserves the installation path.');
  for (const name of ['subjects/registry.yaml', '_identity.yaml']) {
    const file = kitPaths.before === '.' ? name : `${kitPaths.before}/${name}`;
    const before = current('before', file), candidate = current('candidate', file);
    if (!before || !candidate || before.mode !== candidate.mode || !before.bytes.equals(candidate.bytes)) {
      fail('assignment-continuation-authority-changed', 'Ordinary continuation preserves exact registry and identity bytes and modes.');
    }
  }
  const prove = supplied => {
    budget.charge('validationSteps', 1, 'assignment-continuation-evidence-membership');
    if (supplied.capture.source) {
      const actual = committed(supplied.capture.source.commit, supplied.capture.file);
      if (!same(actual.locator, supplied.capture) || actual.objectFormat !== supplied.objectFormat || !actual.bytes.equals(supplied.bytes)) {
        fail('assignment-continuation-evidence-source', 'Declared evidence must equal actual committed full-file bytes and source.');
      }
      return sides.filter(side => commits[side] && same(supplied.capture.source,
        { commit: commits[side], tree: side === 'before' ? snapshot.before.tree : snapshot.candidate.tree }));
    }
    const matches = sides.filter(side => {
      const actual = current(side, supplied.capture.file);
      return actual && actual.objectFormat === supplied.objectFormat && same(actual.locator, supplied.capture) && actual.bytes.equals(supplied.bytes);
    });
    if (!matches.length) fail('assignment-continuation-evidence-correspondence', 'Source-less evidence must match its exact file on an actual side.');
    return matches;
  };
  for (const capture of evidence.decisionCaptures) prove(capture);
  for (const pair of evidence.assessmentCaptures) {
    const registrySides = prove(pair.registry), identitySides = prove(pair.identity);
    if ((!pair.registry.capture.source || !pair.identity.capture.source)
      && !registrySides.some(side => identitySides.includes(side))) {
      fail('assignment-continuation-assessment-side', 'Assessment authorities require the same actual side.');
    }
  }
  for (const capture of evidence.materialCaptures) prove(capture);
  const contexts = {};
  for (const side of sides) {
    const model = models[side];
    const evaluated = evaluateSubjectGovernance({ registry: model.subjectRegistry, identity: model.identity,
      identityIndex: model.identityIndex, ...evidence }, { operationBudget });
    if (!evaluated.ok) fail('assignment-continuation-governance', `Actual ${side} governance refused: ${JSON.stringify(evaluated.diagnostics)}`);
    const binding = validateSubjectGovernanceCapture(evaluated.governance, { model }, { operationBudget });
    if (!binding.ok) fail('assignment-governance-mismatch', `Actual ${side} governance binding refused: ${JSON.stringify(binding.diagnostics)}`);
    contexts[side] = { model, subjectGovernance: evaluated.governance };
  }
  budget.assertActive();
  return contexts;
}
