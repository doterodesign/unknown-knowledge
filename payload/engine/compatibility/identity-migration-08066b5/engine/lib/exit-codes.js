/**
 * Engine exit-code contract (PRD §5, D-011) — uniform across every engine
 * module: validate, validate-values, audit, resolve, survey-map, preflight.
 *
 *   0 — clean
 *   1 — findings / quarantines
 *   2 — engine or environment failure. A check that never ran is a
 *       blocking defect, never a silent pass.
 */
export const EXIT_CODES = Object.freeze({
  CLEAN: 0,
  FINDINGS: 1,
  FAILURE: 2,
});
