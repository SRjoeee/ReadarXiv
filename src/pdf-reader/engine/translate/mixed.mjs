// The identity a unit carries when its pieces came from more than one engine (mt.mjs translateUnits: the runs of one unit
// answered by two). A module of its own, importing nothing, so that the translation's wire and the cached copy's rule
// (pipeline/record.ts: a mixed unit is never current) agree on the word without one loading the other.

/** `by` when a unit's pieces came from more than one identity */
export const MIXED = 'mixed'
