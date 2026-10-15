// fill-measures.mjs's types, for its tests
export interface DumpStat { id: number; kind: string; pages: number[]; lead: number; lines: (number | string | boolean | null)[][]; fill?: { target: number; lead: number } }
export interface FillMeasures {
  pages: number
  targets: Map<number, number | null>
  purity: { checked: number; mismatches: { page: number; recorded: number | null; recomputed: number }[] }
  fillStep: { steps: number; max: number | null }
  rhythmSpread: number | null
  rhythmDrift: number | null
}
/** one output's fill numbers from its dump's records */
export declare function fillMeasures(dump: { stats?: DumpStat[] }, band?: number): FillMeasures
/** the pages (`page:from->to`) and the units whose drawn leading differ between two dumps of one output */
export declare function movedBetween(base: { stats?: DumpStat[] }, head: { stats?: DumpStat[] }): { pages: string[]; units: number[] }
