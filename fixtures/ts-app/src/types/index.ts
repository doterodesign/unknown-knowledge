// UNEXTRACTABLE shape #3 — re-exports (PRD §5.1 out-of-envelope sentinel).
// BetStatus is only re-exported here; its members live in ./bet-status.
// A ts-union descriptor naming this file as source must HARD-ERROR rather
// than resolve the re-export chain (parsing is lexical, single-file only).
export * from './withdrawal';
export { type BetStatus, TERMINAL_STATUSES } from './bet-status';
