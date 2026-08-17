// UNEXTRACTABLE shape #1 — spread inside an exported const array literal
// (PRD §5.1 out-of-envelope sentinel for ts-const-array). A descriptor
// naming ALL_PRESETS must HARD-ERROR, never parse the two literal members
// and quietly miss the spread — a confident wrong parse is a false all-clear.
const MOBILE_PRESETS = ['ios-1x', 'ios-2x', 'ios-3x', 'android-xxhdpi'];

export const ALL_PRESETS = [...MOBILE_PRESETS, 'web-2x', 'print'];
