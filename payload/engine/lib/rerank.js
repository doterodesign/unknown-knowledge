/**
 * Fitted re-rank score (UCS-1612): a small logistic model over signals `ask`
 * already computes for each candidate record, turning them into a relevance
 * probability. Applying it is arithmetic over fixed coefficients: no model
 * call, no randomness, no network (D-000014). The coefficients live in
 * rerank-model.js, which acceptance/retrieval/fit-rerank.js regenerates from
 * the labelled sets in acceptance/retrieval/rerank/training.json. The model
 * evolves by adding labelled sets and refitting; held-out cases never train it.
 */
import { RERANK_MODEL } from './rerank-model.js';

/** Lifecycle states a question rarely wants first. */
const INACTIVE = new Set(['superseded', 'deprecated', 'retired', 'rejected', 'suppressed']);

/** Feature names, in the order the coefficients use them. */
export const FEATURES = Object.freeze(['relativeScore', 'reciprocalRank', 'coverage', 'titleCoverage', 'named', 'inactive']);

/**
 * Feature vectors for BM25-ordered candidates.
 * @param {Array<{doc: object, score: number, matched: string[], titled: string[]}>} candidates sorted by score
 * @param {(terms: Iterable<string>) => number} covered idf-weighted share of the question
 * @param {(candidate: object) => boolean} isNamed
 */
export function candidateFeatures(candidates, covered, isNamed) {
  const top = candidates[0]?.score || 1;
  return candidates.map((c, i) => [
    c.score / top,
    1 / (i + 1),
    covered(c.matched),
    covered(c.titled),
    isNamed(c) ? 1 : 0,
    INACTIVE.has(c.doc.status) || c.doc.proposal ? 1 : 0,
  ]);
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Relevance probability for one feature vector under `model`. */
export function relevance(features, model = RERANK_MODEL) {
  let z = model.bias;
  for (let i = 0; i < FEATURES.length; i += 1) z += model.weights[FEATURES[i]] * features[i];
  return sigmoid(z);
}
