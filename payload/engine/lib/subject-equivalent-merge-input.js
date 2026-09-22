/** Closed equivalent-merge interface; its original input and digest are unchanged. */
import { admitSubjectLifecycleInput } from './subject-lifecycle-input.js';
export { subjectLifecycleInputWire as equivalentMergeInputWire } from './subject-lifecycle-input.js';
export function admitEquivalentMergeInput(input) { return admitSubjectLifecycleInput(input, 'merge-equivalent'); }
