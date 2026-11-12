// gates.mjs's types, for its tests (tests/scripts/release-check.test.ts)
export type Tier = 'fast' | 'full' | 'release'
export type Stage = 'unit' | 'pipeline' | 'reader' | 'platform' | 'box' | 'corpus'
export interface Ctx { root: string; labData: string | null; refactor: string; work: string; online: boolean; minFree: number }
export interface Step { cmd: string[]; slot?: 'test' | 'e2e' | 'docker'; env?: Record<string, string>; fresh?: string; all?: boolean }
export interface StepRun { cmd: string[]; exit: number; ms: number; log: string; text: string }
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
export declare function censusOf(text: string): Numbers
export declare function checksOf(text: string): { passed?: number; checks?: number }
export declare function vitestOf(text: string): { tests?: number; failed?: number; skipped?: number; files?: number }
export declare function diffOf(text: string): Partial<Record<'files' | 'of' | 'units' | 'shownBefore' | 'shown' | 'lost' | 'accepted' | 'gained' | 'changed', number>>
export declare function typesetOf(text: string): Record<string, number>
export declare function corpusLogOf(file: string): { papers: number; made: number; failed: string[]; refused: string[]; missingCompile: string[]; proofs: { a: number; c: number; on: number; offOutside: number } }
export declare function drawnOf(dir: string, within?: string | null): { source: number; ink: number; figures: number; refusedWhole: number; papers: number }
export declare function cachesOf(text: string): string
export declare function canvasOf(text: string, ids?: string[]): { papers: number; pages: number; over: string[] }
