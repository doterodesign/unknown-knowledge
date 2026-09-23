// Test-only evaluation. Missing executions are never scored as empty results.
/** @typedef {{id: string, grade: number, applicable: boolean}} Judgment */
/** @typedef {{id: string, passage: string}} EvidenceRef */

const fraction = (numerator, denominator) => ({ numerator, denominator, value: denominator ? numerator / denominator : null });
const discounted = gains => gains.slice(0, 10).reduce((sum, gain, i) => sum + gain / Math.log2(i + 2), 0);

/**
 * Score independently judged evidence; this does not authenticate source reads.
 * IDs are opaque, fully qualified fixture identities, never normalized here.
 * @param {{answerable: boolean, judgments: Object<string, Judgment[]>, bundles?: EvidenceRef[][]}} expected
 * @param {{rankings?: Object<string, string[]>, inspected?: {id: string, passages: string[]}[]}} [execution]
 */
export function scoreTask(expected, execution) {
  if (!execution) return { status: 'missing', reason: 'execution-not-recorded' };
  if (typeof expected.answerable !== 'boolean') throw new Error('missing answerability judgment');
  for (const store of Object.keys(execution.rankings ?? {})) {
    if (!Object.hasOwn(expected.judgments, store)) throw new Error(`unjudged store: ${store}`);
  }
  const stores = {};
  const allIds = new Set();
  let status = 'scored';
  for (const [store, judgments] of Object.entries(expected.judgments)) {
    const ids = new Set();
    for (const row of judgments) {
      if (allIds.has(row.id)) throw new Error(`duplicate judgment: ${row.id}`);
      allIds.add(row.id);
      ids.add(row.id);
      if (!Number.isInteger(row.grade) || row.grade < 0 || row.grade > 3) throw new Error(`invalid grade: ${row.id}`);
      if (typeof row.applicable !== 'boolean') throw new Error(`missing applicability judgment: ${row.id}`);
    }
    const ranking = execution.rankings?.[store];
    if (!ranking) {
      status = 'partial';
      stores[store] = { status: 'missing', reason: 'ranking-not-recorded' };
      continue;
    }
    if (new Set(ranking).size !== ranking.length) throw new Error(`duplicate ranked ID in ${store}`);
    for (const id of ranking) if (!ids.has(id)) throw new Error(`unjudged ranked ID: ${id}`);
    const ranks = ranking.slice(0, 10);
    const relevant = judgments.filter(row => row.applicable && row.grade >= 2);
    const numerator = relevant.filter(row => ranks.includes(row.id)).length;
    const gains = new Map(judgments.map(row => [row.id, row.applicable ? 2 ** row.grade - 1 : 0]));
    const dcg = discounted(ranks.map(id => gains.get(id)));
    const idcg = discounted([...gains.values()].sort((a, b) => b - a));
    const recall = fraction(numerator, relevant.length);
    if (!expected.answerable) recall.value = null;
    stores[store] = {
      recall,
      ndcg: { dcg, idcg, value: expected.answerable && idcg ? dcg / idcg : null },
    };
  }
  const bundle = scoreBundle(expected, execution.inspected);
  return { status, stores, bundle };
}

function scoreBundle(expected, inspected) {
  if (!expected.bundles) return { status: 'missing', reason: 'bundle-judgment-not-recorded' };
  if (!expected.answerable) return fraction(0, 0);
  const known = new Map(Object.values(expected.judgments).flat().map(row => [row.id, row]));
  for (const bundle of expected.bundles) {
    if (!bundle.length) throw new Error('empty adequate bundle');
    for (const ref of bundle) {
      const row = known.get(ref.id);
      if (!row?.applicable || row.grade < 2) throw new Error(`bundle requires judged applicable evidence: ${ref.id}`);
    }
  }
  if (!inspected) return { status: 'missing', reason: 'inspection-not-recorded' };
  if (inspected.length > 10) throw new Error('bundle budget is ten total inspected records');
  const seen = new Map();
  for (const row of inspected) {
    if (!known.has(row.id)) throw new Error(`unjudged inspected ID: ${row.id}`);
    if (seen.has(row.id)) throw new Error(`duplicate inspected ID: ${row.id}`);
    seen.set(row.id, new Set(row.passages));
  }
  const complete = expected.bundles.some(bundle => bundle.every(ref => seen.get(ref.id)?.has(ref.passage)));
  return fraction(Number(complete), 1);
}
