export const SUBJECT_CREATION_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-subject-creation-check.js' });
/** Literal installed-engine inventory, shared by capture and retained readback. */
export const VALIDATION_ENTRYPOINTS = Object.freeze([
  Object.freeze({ id: 'structural', path: 'engine/validate.js' }),
  Object.freeze({ id: 'values', path: 'engine/validate-values.js' }),
]);
export const ASSIGNMENT_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-assignment-check.js' });
export const MIGRATION_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-migration-check.js' });
export const EQUIVALENT_MERGE_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-equivalent-merge-check.js' });
export const SUBJECT_SPLIT_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-subject-split-check.js' });
export const SUBJECT_RECONSIDERATION_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-subject-reconsideration-check.js' });
export const SUBJECT_RETIREMENT_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-subject-retirement-check.js' });
export const PROMOTION_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-promotion-check.js' });
export const RECORD_PROMOTION_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-record-promotion-check.js' });
export const SUBJECT_METADATA_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-subject-metadata-check.js' });
export const SUBJECT_PROPOSAL_SUPPRESSION_ENTRYPOINT = Object.freeze({ id: 'operation', path: 'engine/lib/prepared-subject-proposal-suppression-check.js' });
const operations = Object.freeze({ 'subject-assignment': ASSIGNMENT_ENTRYPOINT,
  'identity-migration': MIGRATION_ENTRYPOINT, 'subject-equivalent-merge': EQUIVALENT_MERGE_ENTRYPOINT,
  'subject-retirement': SUBJECT_RETIREMENT_ENTRYPOINT, 'subject-split': SUBJECT_SPLIT_ENTRYPOINT,
  'subject-reconsideration': SUBJECT_RECONSIDERATION_ENTRYPOINT, 'subject-metadata': SUBJECT_METADATA_ENTRYPOINT, 'subject-proposal-suppression': SUBJECT_PROPOSAL_SUPPRESSION_ENTRYPOINT, 'subject-creation': SUBJECT_CREATION_ENTRYPOINT, 'ordinary-promotion': PROMOTION_ENTRYPOINT, 'typed-record-promotion': RECORD_PROMOTION_ENTRYPOINT });
export const preparedOperationEntrypoint = (operation) => typeof operation === 'string' && Object.hasOwn(operations, operation) ? operations[operation] : null;
