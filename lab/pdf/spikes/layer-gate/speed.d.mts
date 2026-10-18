// speed.mjs's types: the speed check's pure arithmetic
export declare const WORK_KEYS: readonly string[]
export declare const WORK_TOLERANCE: number
export declare const SLOW_MS: readonly number[]
export declare function percentile(values: readonly number[], q: number): number
export declare function median(values: readonly number[]): number
export declare function spread(values: readonly number[]): number
export declare function slope(ys: readonly number[]): number
export interface WorkSummary { totals: Record<string, number>; perPage: Record<string, { p50: number; p95: number }>; pages: number }
export interface RunSummary { time: Record<string, number>; work: WorkSummary | null }
export declare function summarizeRun(run: { fixtures?: Record<string, { pages?: { perf?: Record<string, unknown> }[] }> }): RunSummary
export interface Verdict {
  verdict: 'PASS' | 'FAIL' | 'INCOMPARABLE'
  time: Record<string, { head: number; base: number; spread: number; fail: boolean }>
  work: Record<string, { head?: number; base?: number; missing?: boolean; unstable?: boolean; fail: boolean }>
}
export declare function verdictOf(head: readonly RunSummary[], base: readonly RunSummary[]): Verdict
export declare function report(v: Verdict, head: readonly RunSummary[], base: readonly RunSummary[]): string[]
export declare function repetitions(dir: string, side: 'head' | 'base', reps: number): RunSummary[]
