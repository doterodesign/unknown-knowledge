// UNEXTRACTABLE shape #1 — spread inside an exported const array literal
// (PRD §5.1 out-of-envelope sentinel for ts-const-array). A descriptor
// naming ALL_LEAGUES must HARD-ERROR, never parse the two literal members
// and quietly miss the spread — a confident wrong parse is a false all-clear.
const US_LEAGUES = ['nfl', 'nba', 'mlb', 'nhl'];

export const ALL_LEAGUES = [...US_LEAGUES, 'epl', 'laliga'];
