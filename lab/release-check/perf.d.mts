// perf.mjs's types, for its tests (tests/scripts/release-check-perf.test.ts)
export declare const WORK_TOLERANCE: number
export declare function median(values: readonly number[]): number
export declare function percentile(values: readonly number[], q: number): number
export declare function spread(values: readonly number[]): number
export interface ReaderRep {
  papers: number
  drawn: number
  firstMs: number
  commitP50: number
  commitP90: number
  commits: number
  longTasks: number
  longestTask: number
  framesOverPerMille: number
  heapMiB: number
  canvasMiB: number
  rendererMiB: number
  page1Bytes: number
  page1Data: number
  wholeData: number
  codeBytes: number
  switchMs: number
  switchAgain: number
}
export interface PrepareRep { papers: number; made: number; wallS: number; cpuS: number; memPeakMiB: number; compiles: number; passes: number; storedBytes: number }
export interface Rep { reader?: Partial<ReaderRep>; prepare?: Partial<PrepareRep> }
export interface Measure { id: string; label: string; of: (r: Rep) => number | undefined; exact: boolean }
export declare const MEASURES: Measure[]
/** one visit of reader.mjs (the fields the summary reads) */
export interface Visit {
  rep?: number
  warmup?: boolean
  firstOk?: boolean
  firstTranslatedMs?: number | null
  page1?: Record<string, number>
  whole?: Record<string, number>
  scroll?: { commitList?: [number, number][]; frames?: number; framesOverBudget?: number; longTasks?: number; longestTask?: number }
  memory?: { jsHeapMiB?: number | null; canvasMiB?: number; rendererMiB?: number }
  switch?: { ms: number | null; askedAgain?: [string, string, number][] }
  code?: [string, number][]
}
export declare function repOf(visits: Visit[]): ReaderRep
/** one prepare of prepare.sh (the fields the summary reads) */
export interface PrepareRun {
  side: 'today' | 'new'
  ok: boolean
  measured: { wallS: number; cpuS: number; memPeakMiB: number; compiles: number; passes: number }
  objects?: { bytes: number }[]
  instrument?: { bytes: number }[]
  told?: { role: string; bytes?: number; chunks?: [string, string, number][]; left?: [number, string, number][] }[]
}
export declare function prepareRepOf(runs: PrepareRun[]): PrepareRep
export declare function storedToday(r: Pick<PrepareRun, 'told'>): number
export interface Compared { label: string; reading: 'better' | 'worse' | 'equal' | 'not measured'; a: number | null; b: number | null; n?: [number, number]; spreadA?: number | null; spreadB?: number | null; p90A?: number | null; p90B?: number | null; diff?: number | null; bound?: number | null }
export declare function compare(a: Rep[], b: Rep[], measures?: Measure[]): Record<string, Compared>
export declare function batchVerdict(head: Rep[], base: Rep[]): { pass: boolean; worse: string[]; measures: Record<string, Compared> }
export declare function lastRound<R extends { at: string; pass?: boolean; accepted?: boolean }>(records: R[]): R | null
export declare function perfOf(text: string): Record<string, unknown> | null
