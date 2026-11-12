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
  gpuMiB: number
  mainToFirstMs: number
  page1Bytes: number
  page1Data: number
  wholeData: number
  codeBytes: number
  switchMs: number
  switchAgain: number
}
export interface PrepareRep { papers: number; made: number; wallS: number; cpuS: number; memPeakMiB: number; compiles: number; passes: number; storedBytes: number }
export interface Rep { reader?: Partial<ReaderRep>; prepare?: Partial<PrepareRep> }
export interface Measure { id: string; label: string; of: (r: Rep) => number | undefined; exact: boolean; judged?: boolean }
export declare const MEASURES: Measure[]
/** a visit's bytes by class as served, and `wire` as they cross the network */
export type Bytes = { [k: string]: number | Record<string, number> | undefined; wire?: Record<string, number> }
/** one visit of reader.mjs (the fields the summary reads) */
export interface Visit {
  pair?: string
  rep?: number
  warmup?: boolean
  firstOk?: boolean
  firstTranslatedMs?: number | null
  mainToFirstMs?: number | null
  page1?: Bytes | null
  whole?: Bytes | null
  scroll?: { commitList?: [number, number][]; frames?: number; framesOverBudget?: number; longTasks?: number; longestTask?: number; ms?: number }
  memory?: { jsHeapMiB?: number | null; canvasMiB?: number; rendererMiB?: number; gpuMiB?: number }
  switch?: { ms: number | null; askedAgain?: [string, string, number][] }
  code?: [string, number][]
}
export declare function repOf(visits: Visit[]): ReaderRep
/** one prepare of prepare.sh (the fields the summary reads) */
export interface PrepareRun {
  side: 'today' | 'new'
  ok: boolean
  warm?: boolean
  warmOk?: boolean | null
  measured: { wallS: number; cpuS: number; memPeakMiB: number; anonShmemPeakMiB?: number; compiles: number; passes: number }
  objects?: { bytes: number }[]
  instrument?: { bytes: number }[]
  told?: { role: string; bytes?: number; chunks?: [string, string, number][]; left?: [number, string, number][] }[]
}
export declare function prepareRepOf(runs: PrepareRun[]): PrepareRep
export declare function storedToday(r: Pick<PrepareRun, 'told'>): number
export interface Compared { label: string; reading: 'better' | 'worse' | 'equal' | 'not measured' | 'missing'; judged?: boolean; a: number | null; b: number | null; n?: [number, number]; spreadA?: number | null; spreadB?: number | null; p90A?: number | null; p90B?: number | null; diff?: number | null; bound?: number | null }
export declare function compare(a: Rep[], b: Rep[], measures?: Measure[]): Record<string, Compared>
export declare function failingOf(c: Record<string, Compared>): string[]
export declare function batchVerdict(head: Rep[], base: Rep[]): { pass: boolean; worse: string[]; measures: Record<string, Compared> }
export declare function lastRound<R extends { at: string; pass?: boolean; accepted?: boolean; void?: string }>(records: R[]): R | null
export interface Stall { pair: string | null; rep: number | null; taskMs: number; scrollMs: number; ownMs: number }
export declare function stallOf(visit: Visit): Stall | null
export declare function voidOf(visits: Visit[]): Stall[]
export declare function stallWords(x: Stall): string
export declare function perfOf(text: string): Record<string, unknown> | null
