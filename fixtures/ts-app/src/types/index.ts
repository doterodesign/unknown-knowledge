// UNEXTRACTABLE shape #3 — re-exports (PRD §5.1 out-of-envelope sentinel).
// ReleaseStatus is only re-exported here; its members live in ./release-status.
// A ts-union descriptor naming this file as source must HARD-ERROR rather
// than resolve the re-export chain (parsing is lexical, single-file only).
export * from './asset-kind';
export { type ReleaseStatus, TERMINAL_STATUSES } from './release-status';
