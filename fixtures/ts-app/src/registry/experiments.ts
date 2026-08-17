// UNEXTRACTABLE shape #2 — computed key inside an exported object literal
// (PRD §5.1 out-of-envelope sentinel for ts-object-keys). A descriptor
// naming EXPERIMENTS must HARD-ERROR: the real key set is unknowable
// lexically, so extracting only 'quick-insert' would be a confident wrong parse.
const NS = 'exp';

export const EXPERIMENTS = {
  [`${NS}-new-toolbar`]: { rollout: 0.5 },
  'quick-insert': { rollout: 1 },
};
