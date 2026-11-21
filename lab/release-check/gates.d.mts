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
export interface TypesetNumbers {
  [k: string]: number | number[] | TypesetNumbers | Record<string, number> | undefined
  added?: TypesetNumbers
  /** I3, I4 and I5 on the entry's lay (gate-l1.mjs with --entry) */
  entry?: Record<string, number>
  /** F28's four lines' counts */
  F28?: number[]
}
export declare function typesetOf(text: string): TypesetNumbers
/** whether sentence-cover fails on a paragraph point run on: the engine half's lane turns it on (gates.mjs) */
export declare const PARAS_HELD: boolean
export declare function sentenceCoverJudge(steps: StepRun[], parasHeld?: boolean): Judged
/** the counts of one part of a reader gate's run each invariant is read by (null where its line is absent) */
export declare function entryCountsOf(x: Record<string, unknown> | undefined): Record<'I3' | 'I4' | 'I5' | 'I5floor' | 'I6head' | 'I6other' | 'purity' | 'I10' | 'I11' | 'readsOutside' | 'parasOff' | 'F28' | 'threw' | 'unread', number | null>
/** the counts reader-parts holds to the last round's record */
export declare const RECORDED: readonly string[]
/** one run of the reader gate's runner with --entry: its numbers, the added pairs' apart, whether every count is stated (`whole`,
 *  `missing`), the counts held to 0 that are not (`faults`), and whether none is (`held`) */
export declare function entryRunOf(step: StepRun | undefined, parasHeld?: boolean): { t: TypesetNumbers; a?: TypesetNumbers; whole: boolean; held: boolean; missing: string[]; faults: string[] }
/** the Google rows tool's totals, each count by its words in camel case */
export declare function rowsOf(text: string): Record<string, number>
/** reader-parts' counts at the last integrated round (lab/release-check/reader-parts.json) */
export interface ReaderPartsRecord { commit: string; counts: Record<string, Partial<Record<'I3' | 'I4' | 'I5' | 'I5floor' | 'I6head', number>>> }
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
/** a canvas.mjs line of a paper: its pages, the pages that differ with their pixels, the largest share and delta, those outside */
export type CanvasRow = { id: string; refused?: string; pages?: number; differingPages?: [number, number][]; outsidePages?: [number, number][]; shareMax?: number; maxDelta?: number }
export declare function canvasOf(
  text: string,
  ids?: string[],
): {
  papers: number
  pages: number
  renderer: { renderer: string; canvas2d: string | null; gl: string | null; browser: string } | null
  over: string[]
  /** the papers asked that have no line */
  unseen: string[]
  rows: CanvasRow[]
}
/** the canvas gate's record (lab/release-check/canvas.json): each paper's residue by page, its largest share and delta */
export type CanvasRecord = { format: string; says: string; commit: string; round: string; papers: Record<string, { pages: Record<string, number>; share: number; delta: number }>; why: Record<string, string> }
export declare function canvasRecord(root: string): CanvasRecord
/** canvas' verdict over its papers' lines, each paper's residue held to its record; never its exit */
export declare function canvasJudge(text: string, ids: string[], record: CanvasRecord | null): Judged
/** text-order.mjs's totals (pairs, laid pages, members, runs, missing, out of order, ms), its first listed member, and every
 *  member it lists (`<pair> p<n> ord <ord>`) */
export declare function textOrderOf(text: string): {
  pairs?: number
  laidPages?: number
  pages?: number
  members?: number
  runs?: number
  missing?: number
  outOfOrder?: number
  ms?: number
  first?: string
  missingListed?: string[]
  outOfOrderListed?: string[]
}
/** text-order's record (lab/release-check/text-order.json): the out-of-order members by pair, `p<n> ord <ord>` */
export type TextOrderRecord = { format: string; says: string; commit: string; round: string; outOfOrder: Record<string, string[]>; why: Record<string, string> }
export declare function textOrderRecord(root: string): TextOrderRecord
/** text-order's verdict over its totals and its list, each out-of-order member held to its record; never its exit */
export declare function textOrderJudge(text: string, record: TextOrderRecord | null): Judged
/** the corpus pages harness-lab turns each group off on (I2), `<id>:<page>`, by the rule its comment states */
export declare const GROUP_PAGES: string[]
