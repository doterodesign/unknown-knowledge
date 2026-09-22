/** Evidence-bound scope verification, never mechanical proof of semantic completeness. */
import { load, YAMLException } from 'js-yaml';
import { canonicalSha256 } from './canonical-json.js';
import { verifyCapturedBytes } from './captured-source.js';
import { isCaptureLocator } from './capture-locator.js';
import { validateIdentityLedger } from './identity-ledger.js';
import { parseSubjectRegistry } from './subject-registry-reader.js';
import { SubjectError } from './subjects.js';
import { parseCanonicalId } from './record-identity.js';

const same = (a, b) => canonicalSha256(a) === canonicalSha256(b);
const stateOf = ({ id, changes, ...state }) => state;
const fail = (message) => { throw new SubjectError('invalid-refusal-assessment', message); };
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
const digest = (value) => typeof value === 'string' && /^[0-9a-f]{64}(?![\s\S])$/.test(value);

export function verifyRefusalAssessment(event, captures, budget) {
  const assessment = event.refusalAssessment;
  if (!keys(assessment, ['version', 'scope', 'coverage', 'attestation', 'relevantRefusals'])
    || assessment.version !== 1 || assessment.coverage !== 'complete-registry'
    || assessment.attestation !== 'all-current-suppressed-meanings-assessed'
    || !keys(assessment.scope, ['beforeRegistry', 'identityDigest'])
    || !keys(assessment.scope.beforeRegistry, ['capture', 'documentDigest'])
    || !isCaptureLocator(assessment.scope.beforeRegistry.capture)
    || !digest(assessment.scope.beforeRegistry.documentDigest) || !digest(assessment.scope.identityDigest)
    || !Array.isArray(assessment.relevantRefusals)) fail('Assessment must bind complete captured scope and an explicit semantic review attestation.');
  const matching = captures.filter((pair) => pair?.registry?.capture
    && same(pair.registry.capture, assessment.scope.beforeRegistry.capture));
  if (!matching.length || !matching[0].identity?.bytes || !matching[0].registry?.bytes) return { status: 'unavailable' };
  if (matching.length !== 1) fail('Assessment source evidence is ambiguous.');
  const pair = matching[0];
  for (const part of ['registry', 'identity']) {
    const { capture, bytes, objectFormat } = pair[part];
    if (!verifyCapturedBytes({ locator: capture, bytes, objectFormat }).ok) fail(`Invalid retained ${part} byte evidence.`);
  }
  const registryFile = pair.registry.capture.file;
  const prefix = registryFile === 'subjects/registry.yaml' ? ''
    : registryFile.endsWith('/subjects/registry.yaml') ? registryFile.slice(0, -'subjects/registry.yaml'.length) : null;
  if (prefix === null || pair.identity.capture.file !== `${prefix}_identity.yaml`
    || !same(pair.registry.capture.source ?? null, pair.identity.capture.source ?? null)) {
    fail('Retained registry and ledger must name the selected authority paths and same declared source snapshot.');
  }
  let identity;
  try { identity = load(new TextDecoder('utf-8', { fatal: true }).decode(pair.identity.bytes)); }
  catch (error) {
    if (!(error instanceof YAMLException) && error.code !== 'ERR_ENCODING_INVALID_ENCODED_DATA') throw error;
    fail('Retained identity bytes must be valid UTF-8 YAML.');
  }
  budget?.guard(identity, 'parsed-before-identity');
  if (!validateIdentityLedger(identity).ok || canonicalSha256(identity) !== assessment.scope.identityDigest) fail('Retained before ledger differs from reviewed scope.');
  const parsed = parseSubjectRegistry({ bytes: pair.registry.bytes, identity, budget });
  if (!parsed.ok || canonicalSha256(parsed.subjectRegistry.document) !== assessment.scope.beforeRegistry.documentDigest) {
    fail('Retained before registry differs from reviewed scope or is invalid.');
  }
  const document = parsed.subjectRegistry.document;
  if (!Object.hasOwn(event, 'promotes') && document.subjects.length === 0
    && (document.history.length || document.revision !== 0 || document.hierarchyRevision !== 0
      || identity.allocations.some((allocation) => allocation.kind === 'subject'))) {
    fail('Empty-registry bootstrap requires an initial captured authority and no prior subject allocations.');
  }
  if (event.action !== 'activate' || !Array.isArray(event.rows) || !event.rows.length
    || event.decision.namespace !== document.namespace
    || event.rows.some((row) => !parseCanonicalId('subject', row.id).ok || row.before !== null
      || document.subjects.some((subject) => subject.id === row.id)
      || identity.allocations.some((allocation) => allocation.kind === 'subject' && allocation.id === row.id))) {
    fail('Assessed activation requires fresh canonical identities in its complete captured before scope.');
  }
  if (Object.hasOwn(event, 'promotes')) {
    const prior = parsed.subjectRegistry.proposals.get(event.promotes?.key);
    if (!keys(event.promotes, ['key', 'before']) || event.rows.length !== 1 || !prior || prior.status !== 'proposed'
      || prior.changes.length || Object.hasOwn(prior, 'refusal') || Object.hasOwn(prior, 'retirement')
      || !same(prior, event.promotes.before)) {
      fail('Promotion must retain the exact unused proposal from its captured before registry.');
    }
  }
  const refused = new Map();
  for (const subject of document.subjects) {
    if (subject.status !== 'suppressed') continue;
    budget?.charge('validationSteps', 1, 'current-refusal');
    const currentEvent = document.history.find((item) => item.id === subject.changes.at(-1));
    const row = currentEvent?.rows.find((item) => item.id === subject.id);
    if (currentEvent?.action !== 'suppress' || !row || !same(row.after, stateOf(subject))
      || !same(subject.refusal?.decision ?? null, currentEvent.decision) || subject.refusal?.reason !== currentEvent.reason) {
      fail('Each current suppressed identity requires its exact retained refusal event.');
    }
    refused.set(subject.id, currentEvent.id);
  }
  const seen = new Set();
  for (const row of assessment.relevantRefusals) {
    budget?.relevant();
    if (!keys(row, ['subject', 'refusal', 'disposition', 'reason']) || seen.has(row.subject)
      || !refused.has(row.subject) || refused.get(row.subject) !== row.refusal
      || row.disposition !== 'distinct-meaning' || typeof row.reason !== 'string' || row.reason.trim() === '') {
      fail('Relevant refusal rows require unique current identities/events and reviewed distinct-meaning explanations.');
    }
    seen.add(row.subject);
  }
  return { status: 'verified', registry: parsed.subjectRegistry, identity,
    refusalSetDigest: canonicalSha256([...refused].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
    evidence: 'captured-scope-and-listed-dispositions-only' };
}
