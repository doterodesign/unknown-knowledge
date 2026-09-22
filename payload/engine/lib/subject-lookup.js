/** Shared captured metadata projection for the existing CLI and versioned API. */
import { lookupSubjects } from './subjects.js';
import { canonicalSha256 } from './canonical-json.js';

export function subjectLookupReport(model, text, options = {}) {
  const registry = model.subjectRegistry;
  return { operation: 'subject.lookup', scope: 'declared-metadata',
    context: { consistency: 'captured-model', namespace: registry.namespace,
      identityFormat: model.identity['identity-format'], subjectSchema: registry.schemaVersion,
      normalizer: registry.normalizerVersion, registryRevision: registry.revision,
      hierarchyRevision: registry.hierarchyRevision, registryDigest: canonicalSha256(registry.document) },
    input: { text, options }, result: lookupSubjects(registry, text, options) };
}
