// gates.mjs's types, for its tests (tests/scripts/release-check.test.ts)
export type Tier = 'fast' | 'full' | 'release'
export type Stage = 'unit' | 'pipeline' | 'reader' | 'platform' | 'box' | 'corpus'
export interface Ctx { root: string; labData: string | null; refactor: string; work: string; online: boolean; minFree: number }
/** a step: `as` names it for its gate's judge (run.mjs passes it on to the step's result) */
export interface Step { cmd: string[]; slot?: 'test' | 'run' | 'e2e' | 'docker'; env?: Record<string, string>; fresh?: string; all?: boolean; as?: string }
export interface StepRun { cmd: string[]; as?: string; exit: number; ms: number; log: string; text: string }
export type Numbers = Record<string, unknown>
export interface Finding { held: boolean; count: number | string }
export interface Judged { pass?: boolean; skip?: string; numbers?: Numbers; findings?: Record<string, Finding>; note?: string }
export interface Gate {
  id: string
  title: string
  tier: Tier
  stage: Stage
  holds: string[]
  steps?: (ctx: Ctx) => Step[]
  needs?: (ctx: Ctx) => { what: string; path: string }[]
  after?: string[]
  disk?: boolean
  network?: 'live'
  private?: boolean
  /** a cut-over blocker: the report's cut-over verdict is NO-GO until it passes */
  cutover?: boolean
  judge?: (ctx: Ctx, steps: StepRun[]) => Judged
}
export interface Invariant { id: string; says: string; gap: string | null }
export interface Target { id: string; measure: string; baseline: string; target: string; from: string | null; why?: string; value?: (n: Numbers) => string | false; met?: (n: Numbers) => boolean | null }
export declare const TIERS: Tier[]
export declare const STAGES: Stage[]
export declare const INVARIANTS: Invariant[]
export declare const TARGETS: Target[]
export declare const GATES: Gate[]
/** a gate retired: when, what holds its question now, and why */
export interface Retired { id: string; retired: string; by: string[]; why: string }
export declare const RETIRED: Retired[]
export declare function censusOf(text: string): Numbers
export declare function checksOf(text: string): { passed?: number; checks?: number }
/** harness-lab's verdict: its checks, the papers laid from this run's bundles and rows (`run`) and from lane L1's (`l1`), and
 *  the harness's refusal of bundles and rows that do not belong together as its note */
export declare function harnessLabJudge(step: StepRun): Judged
export declare function vitestOf(text: string): { tests?: number; failed?: number; skipped?: number; files?: number }
export declare function diffOf(text: string): Partial<Record<'files' | 'of' | 'units' | 'shownBefore' | 'shown' | 'lost' | 'accepted' | 'gained' | 'changed', number>>
/** a typesetter runner's numbers; `added`: the added pairs' (lab/typeset/added.mjs), read after its heading */
export declare function typesetOf(text: string): Record<string, number> & { added?: Record<string, number> }
/** whether sentence-cover fails on a paragraph point run on: the engine half's lane turns it on (gates.mjs) */
export declare const PARAS_HELD: boolean
export declare function sentenceCoverJudge(steps: StepRun[], parasHeld?: boolean): Judged
/** one run of the reader gate's runner with --entry: its numbers, the added pairs' apart, whether it ended whole and held */
export declare function entryRunOf(step: StepRun | undefined, parasHeld?: boolean): { t: Record<string, number> & { added?: Record<string, number> }; a?: Record<string, number>; whole: boolean; held: boolean }
/** the Google rows tool's totals, each count by its words in camel case */
export declare function rowsOf(text: string): Record<string, number>
/** reader-parts' counts at the last integrated round (lab/release-check/reader-parts.json) */
export interface ReaderPartsRecord { commit: string; counts: Record<string, Partial<Record<'I3' | 'I4' | 'I5', number>>> }
/** reader-parts' verdict over its steps `door`, `rows`, `google`, its counts held to `record` */
export declare function readerPartsJudge(steps: StepRun[], parasHeld?: boolean, record?: ReaderPartsRecord | null): Judged
export declare function readerPartsRecord(root: string): ReaderPartsRecord
/** production-rows.mjs's totals and the pairs that are not production's */
export declare function productionRowsOf(text: string): { pairs?: number; of?: number; rows?: number; stored?: number; not?: string[] }
/** a display gate's verdict over its parity runs and its checks of today's rows */
export declare function displayJudge(steps: StepRun[], planned: number, modes: [string, string[]][], rows: string[]): Judged
export declare function corpusLogOf(file: string): { papers: number; made: number; failed: string[]; refused: string[]; missingCompile: string[]; proofs: { a: number; c: number; on: number; offOutside: number } }
export declare function drawnOf(dir: string, within?: string | null): { source: number; ink: number; figures: number; refusedWhole: number; papers: number }
export declare function cachesOf(text: string): string
export declare function canvasOf(text: string, ids?: string[]): { papers: number; pages: number; over: string[] }
