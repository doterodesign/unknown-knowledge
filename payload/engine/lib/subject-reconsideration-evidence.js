/** Fixed reconsideration evidence: supplied bytes and review assertions, never Git or world truth. */
import { load, YAMLException } from 'js-yaml';
import { isDeepStrictEqual as same } from 'node:util';
import { canonicalSha256, CapturedInputError } from './canonical-json.js';
import { verifyCapturedBytes } from './captured-source.js';
import { isCaptureLocator } from './capture-locator.js';
import { parseSubjectRegistry } from './subject-registry-reader.js';
import { parseCanonicalId, parseProposalKey, isIdentityUuid } from './record-identity.js';
import { SubjectError } from './subjects.js';

const fail = message => {
  throw new SubjectError('invalid-reconsideration-evidence', message);
};

const closed = (value, keys) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field?.enumerable && Object.hasOwn(field, 'value');
  });

const text = value => typeof value === 'string' && value.trim() !== '';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}(?![\s\S])$/.test(value);

const stateOf = ({ id, changes, ...state }) => state;

const typedRef = (value, namespace) => closed(value, ['namespace', 'kind', 'id'])
  && value.namespace === namespace
  && ['knowledge', 'ontology', 'decision'].includes(value.kind)
  && parseCanonicalId(value.kind, value.id).ok;

const canonical = value => {
  try {
    return canonicalSha256(value);
  } catch (error) {
    if (!(error instanceof RangeError))
      throw error;
    throw new CapturedInputError('Guarded reconsideration evidence exceeds native canonical capture capacity.');
  }
};

/** Exact fixed event grammar, also used by historical metadata validation. */

export function validateReconsiderationEvent(event, namespace, budget) {
  if (!closed(event, ['id', 'action', 'decision', 'review', 'rows', 'promotes', 'priorRefusal', 'reconsideration', 'reconsiderationAssessment'])
    || event.action !== 'activate'
    || !Array.isArray(event.rows)
    || event.rows.length !== 1
    || !closed(event.promotes, ['key', 'before'])
    || !parseProposalKey('subject', event.promotes.key).ok
    || !isIdentityUuid(event.priorRefusal))
    fail('Reconsideration requires one exact assessed activation and consumed proposal.');
  const prior = event.promotes.before;
  const row = event.rows[0];
  if (!prior
    || prior.id !== event.promotes.key
    || prior.status !== 'suppressed'
    || !Array.isArray(prior.changes)
    || prior.changes.at(-1) !== event.priorRefusal
    || !prior.refusal
    || !text(prior.refusal.reason)
    || !typedRef(prior.refusal.decision, namespace)
    || prior.refusal.decision.kind !== 'decision'
    || !typedRef(event.decision, namespace)
    || event.decision.kind !== 'decision'
    || same(event.decision, prior.refusal.decision)
    || !closed(row, ['id', 'before', 'after'])
    || row.before !== null
    || !parseCanonicalId('subject', row.id).ok
    || !row.after
    || row.after.status !== 'active'
    || !same(row.after.originDecision, event.decision))
    fail('Reconsideration preserves a suppressed proposal and needs a distinct new Decision and canonical birth.');
  const { status: oldStatus, refusal, originDecision: oldOrigin, warrant: oldWarrant, ...oldMeaning } = stateOf(prior);
  const { status: newStatus, originDecision: newOrigin, warrant: newWarrant, ...newMeaning } = row.after;
  if (!same(oldMeaning, newMeaning))
    fail('Reconsideration must preserve the exact refused meaning and graph edges.');
  const material = event.reconsideration;
  if (!closed(material, ['reason', 'records', 'sources'])
    || !text(material.reason)
    || !Array.isArray(material.records)
    || !Array.isArray(material.sources)
    || material.records.length + material.sources.length === 0
    || !newWarrant
    || !Array.isArray(newWarrant.records)
    || !Array.isArray(newWarrant.sources))
    fail('Reconsideration requires captured material and an explicit reviewed reason.');
  const seen = new Set();
  const warrantRecords = new Set(), warrantSources = new Set();
  // Pre-admit material rows; the named warrant/history lookups below own their visits.
  for (const item of material.records) budget?.charge('validationSteps', 1, 'reconsideration-material-row');
  for (const item of material.sources) budget?.charge('validationSteps', 1, 'reconsideration-material-row');
  for (const item of newWarrant.records) {
    budget?.charge('validationSteps', 1, 'reconsideration-warrant-record');
    warrantRecords.add(canonical(item));
  }
  for (const item of newWarrant.sources) {
    budget?.charge('validationSteps', 1, 'reconsideration-warrant-source');
    warrantSources.add(canonical(item));
  }
  for (const item of material.records) {
    if (!closed(item, ['ref', 'capture'])
      || !typedRef(item.ref, namespace)
      || !isCaptureLocator(item.capture)
      || !warrantRecords.has(canonical(item))
      || seen.has(canonical(item)))
      fail('Record material must bind an exact distinct final warrant citation.');
    seen.add(canonical(item));
  }
  for (const item of material.sources) {
    if (!closed(item, ['locator', 'revision', 'capture'])
      || !text(item.locator)
      || !text(item.revision)
      || !isCaptureLocator(item.capture)
      || !warrantSources.has(canonical({ locator: item.locator, revision: item.revision }))
      || seen.has(canonical(item)))
      fail('Source material requires archived bytes and its exact final warrant citation.');
    seen.add(canonical(item));
  }
  const assessment = event.reconsiderationAssessment;
  if (!closed(assessment, ['version', 'scope', 'coverage', 'attestation', 'relevantRefusals'])
    || assessment.version !== 1
    || assessment.coverage !== 'complete-registry'
    || assessment.attestation !== 'all-current-suppressed-meanings-assessed'
    || !closed(assessment.scope, ['beforeRegistry', 'identityDigest'])
    || !closed(assessment.scope.beforeRegistry, ['capture', 'documentDigest'])
    || !isCaptureLocator(assessment.scope.beforeRegistry.capture)
    || !hash(assessment.scope.beforeRegistry.documentDigest)
    || !hash(assessment.scope.identityDigest)
    || !Array.isArray(assessment.relevantRefusals))
    fail('Reconsideration requires its closed complete original-scope assessment.');
  const subjects = new Set();
  let selected = 0;
  for (const item of assessment.relevantRefusals) {
    budget?.charge('validationSteps', 1, 'reconsideration-refusal-shape');
    if (!closed(item, ['subject', 'refusal', 'disposition', 'reason'])
      || subjects.has(item.subject)
      || !isIdentityUuid(item.refusal)
      || !text(item.reason))
      fail('Reconsideration refusal rows must be unique exact identities and reasons.');
    subjects.add(item.subject);
    if (item.subject === prior.id) {
      selected++;
      if (item.refusal !== event.priorRefusal
        || item.disposition !== 'same-meaning-reconsidered'
        || item.reason !== material.reason)
        fail('The selected current refusal needs the exact reconsideration reason.');
    } else if (item.disposition !== 'distinct-meaning') fail('Other listed refusals require distinct-meaning review.');
  }
  if (selected !== 1)
    fail('Exactly one selected refusal disposition is mandatory.');
}

/** No source reads. The caller admits raw captures; each performed document/row visit is charged here. */

export function verifySubjectReconsiderationEvidence(event, assessmentCaptures, materialCaptures, budget) {
  validateReconsiderationEvent(event, event.decision?.namespace, budget);
  const assessment = event.reconsiderationAssessment;
  const matches = [];
  for (const pair of assessmentCaptures) {
    budget?.charge('validationSteps', 1, 'reconsideration-assessment-match');
    if (same(pair?.registry?.capture, assessment.scope.beforeRegistry.capture)) matches.push(pair);
  }
  if (matches.length === 0)
    return { status: 'unavailable' };
  if (matches.length !== 1)
    fail('The original reconsideration assessment pair is ambiguous.');
  const pair = matches[0];
  for (const part of ['registry', 'identity']) {
    if (!pair[part]?.bytes)
      return { status: 'unavailable' };
    if (!verifyCapturedBytes({ locator: pair[part].capture, bytes: pair[part].bytes, objectFormat: pair[part].objectFormat }).ok)
      fail('Original reconsideration capture bytes differ.');
  }
  const file = pair.registry.capture.file;
  const prefix = file === 'subjects/registry.yaml'?'': file.endsWith('/subjects/registry.yaml')?file.slice(0, -'subjects/registry.yaml'.length): null;
  if (prefix === null
    || pair.identity.capture.file !== `${prefix}_identity.yaml`
    || !same(pair.registry.capture.source ?? null, pair.identity.capture.source ?? null))
    fail('Original authority paths and declared source must agree.');
  let identity;
  try {
    identity = load(new TextDecoder('utf-8', { fatal: true }).decode(pair.identity.bytes));
  } catch (error) {
    if (!(error instanceof YAMLException) && error.code !== 'ERR_ENCODING_INVALID_ENCODED_DATA')
      throw error;
    fail('Original identity must be valid UTF-8 YAML.');
  }
  budget?.guard(identity, 'reconsideration-parsed-before-identity');
  if (canonical(identity) !== assessment.scope.identityDigest)
    fail('Original identity differs from assessed scope.');
  const parsed = parseSubjectRegistry({ bytes: pair.registry.bytes, identity, budget });
  if (!parsed.ok
    || canonical(parsed.subjectRegistry.document) !== assessment.scope.beforeRegistry.documentDigest)
    fail('Original registry differs from assessed scope.');
  const registry = parsed.subjectRegistry;
  const original = registry.proposals.get(event.promotes.key);
  let occupied = false;
  for (const row of identity.allocations) {
    budget?.charge('validationSteps', 1, 'reconsideration-before-allocation-reference');
    if (row.kind === 'subject' && row.id === event.rows[0].id) occupied = true;
  }
  if (!same(original, event.promotes.before) || registry.subjects.has(event.rows[0].id) || occupied)
    fail('Reconsideration must consume the exact original proposal and create a fresh identity.');
  const history = new Map();
  for (const prior of registry.document.history) {
    budget?.charge('validationSteps', 1, 'reconsideration-refusal-history');
    const rows = new Map();
    for (const row of prior.rows) {
      budget?.charge('validationSteps', 1, 'reconsideration-refusal-history-row');
      rows.set(row.id, row);
    }
    history.set(prior.id, { event: prior, rows });
  }
  const refused = new Map();
  for (const subject of registry.document.subjects) {
    budget?.charge('validationSteps', 1, 'reconsideration-current-refusal');
    if (subject.status !== 'suppressed') continue;
    const entry = history.get(subject.changes.at(-1));
    const prior = entry?.event;
    const row = entry?.rows.get(subject.id);
    if (prior?.action !== 'suppress'
      || !row
      || !same(row.after, stateOf(subject))
      || !same(subject.refusal?.decision, prior.decision)
      || subject.refusal.reason !== prior.reason)
      fail('Current suppressed subjects require their exact refusal histories.');
    refused.set(subject.id, prior.id);
  }
  for (const item of assessment.relevantRefusals) {
    budget?.relevant();
    if (refused.get(item.subject) !== item.refusal)
      fail('A listed refusal is not current in the original capture.');
  }
  let unavailable = false;
  for (const item of [...event.reconsideration.records, ...event.reconsideration.sources]) {
    const matched = [];
    for (const capture of materialCaptures) {
      budget?.charge('validationSteps', 1, 'reconsideration-material-match');
      if (same(capture?.capture, item.capture)) matched.push(capture);
    }
    if (matched.length === 0) {
      unavailable = true;
      continue;
    }
    if (matched.length !== 1)
      fail('Material evidence is ambiguous.');
    const capture = matched[0];
    if (!verifyCapturedBytes({ locator: capture.capture, bytes: capture.bytes, objectFormat: capture.objectFormat }).ok)
      fail('Reconsideration material bytes differ from the exact citation.');
  }
  return { status: unavailable?'unavailable': 'verified', registry, identity, refusalSetDigest: canonical([...refused].sort(([a], [b]) => a < b?-1: a>b?1: 0)),
    evidence: 'captured-scope-and-material-bindings-only', semanticCompleteness: 'asserted-in-reviewed-evidence' };
}
