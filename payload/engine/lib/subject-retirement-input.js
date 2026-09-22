/** Closed retirement interface; null assignment intent requires separate actual proof. */
import { admitSubjectLifecycleInput } from './subject-lifecycle-input.js';
export { subjectLifecycleInputWire as subjectRetirementInputWire } from './subject-lifecycle-input.js';
export function admitSubjectRetirementInput(input) { return admitSubjectLifecycleInput(input, 'retire'); }
