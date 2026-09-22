/** Route syntax is presentation; semantic validity belongs to subjects/query. */
import { parseCanonicalId } from './record-identity.js';
import { querySubjects, SUBJECT_QUERY_OUTPUT_VERSION } from './subject-query.js';
import { assertSubjectOperationContext, assertSubjectOperation, guardSubjectOperationDocument } from './subject-operation.js';

/** Execute an explicit intersection using the shared query evaluator. */
export function executeIntersectionRoute(context, route, queryOptions, options = {}) {
  const operation = options?.operation;
  assertSubjectOperationContext(operation, context);
  if (operation !== undefined) {
    guardSubjectOperationDocument(operation, route, 'route-request');
    guardSubjectOperationDocument(operation, queryOptions, 'route-query-options');
  }
  try { return executeRoute(context, route, queryOptions, options); }
  finally { if (operation !== undefined) assertSubjectOperation(operation); }
}

function executeRoute(context, route, queryOptions, options) {
  const compiled = compileIntersectionRoute(route);
  if (!compiled.ok) return { outputVersion: SUBJECT_QUERY_OUTPUT_VERSION,
    status: 'refused', groups: null, counts: null, diagnostics: compiled.diagnostics };
  if (queryOptions === null || typeof queryOptions !== 'object' || Array.isArray(queryOptions)
    || Object.hasOwn(queryOptions, 'where')) {
    return { outputVersion: SUBJECT_QUERY_OUTPUT_VERSION, status: 'refused', groups: null, counts: null, diagnostics: [{
      code: 'invalid-route-query-options', path: '', message: 'Supply query options without a second where predicate.',
    }] };
  }
  return { ...querySubjects(context, { ...queryOptions, where: compiled.where }, options), route: structuredClone(route) };
}

const refuse = (path, message) => ({
  ok: false, diagnostics: [{ code: 'invalid-intersection-route', path, message }],
});

/**
 * Compile route syntax only. P4 validates membership, lifecycle and capabilities
 * against P2's registry before execution. Operand order preserves provenance.
 */
export function compileIntersectionRoute(route) {
  if (!route || typeof route !== 'object' || Array.isArray(route)) {
    return refuse('', 'an explicit versioned intersection route object is required');
  }
  const extra = Object.keys(route).find((key) => !['version', 'kind', 'subjects'].includes(key));
  if (extra !== undefined) {
    return refuse(`/${extra.replace(/~/g, '~0').replace(/\//g, '~1')}`, 'unsupported route field');
  }
  if (route.version !== 1) return refuse('/version', 'unsupported route version');
  if (route.kind !== 'intersection') return refuse('/kind', 'semantic paths are not intersection predicates');
  if (!Array.isArray(route.subjects) || route.subjects.length === 0) {
    return refuse('/subjects', 'intersection subjects must be a nonempty array');
  }
  const seen = new Set();
  for (let i = 0; i < route.subjects.length; i += 1) {
    const subject = route.subjects[i];
    if (!parseCanonicalId('subject', subject).ok) return refuse(`/subjects/${i}`, 'invalid exact subject identity');
    if (seen.has(subject)) return refuse(`/subjects/${i}`, 'duplicate subject identity');
    seen.add(subject);
  }
  const args = route.subjects.map((subject) => ({ op: 'assigned', subject }));
  return { ok: true, where: args.length === 1 ? args[0] : { op: 'and', args } };
}
