/** Internal graph predicates shared by full indexing and historical validation. */
import { parseCanonicalId } from './record-identity.js';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parentEdgeProblem(id, parent, hasVertex) {
  if (parent === undefined) return null;
  if (typeof parent !== 'string') return ['invalid-parent', 'A subject has at most one parent ID.'];
  if (parent === id) return ['self-parent', 'A subject cannot be its own parent.'];
  if (!hasVertex(parent)) return ['missing-parent', `Parent ${parent} is absent from the registry.`];
  return null;
}

export function associationEdgeProblem(source, edge, hasVertex) {
  if (!object(edge) || Object.keys(edge).length !== 2 || edge.type !== 'association'
    || !parseCanonicalId('subject', edge.target).ok) {
    return ['invalid-related', 'A related link requires exactly association type and a canonical subject target.'];
  }
  if (source === edge.target) return ['self-related', 'A subject cannot be related to itself.'];
  if (!hasVertex(edge.target)) return ['missing-related', `Related subject ${edge.target} is absent from the registry.`];
  return null;
}

export const associationPair = (source, target) => JSON.stringify(source < target ? [source, target] : [target, source]);
