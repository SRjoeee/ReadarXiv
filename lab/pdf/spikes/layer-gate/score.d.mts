// score.mjs's types, for its tests
export type Tier = 'model' | 'pixel'
export type Measure = [key: string, tier: Tier, cls: 'share' | 'ratio' | 'count' | 'defect', better: 'up' | 'down' | 'one', label: string]
export declare const MEASURES: Measure[]
export declare const REPORTED: [key: string, label: string][]
export declare const TOLERANCE: { share: number; ratio: number; count: number; defect: number }
/** a fixture's (or a page's) values: measures by key, and the defects' rates */
export type Totals = Record<string, unknown> & { rates?: Record<string, number>; modelRates?: Record<string, number> }
export interface PageEntry { p: number; [key: string]: unknown }
export interface Frames { body: unknown[]; fills: number[]; pitches: number[]; scales: number[] }
export declare function pageEntry(page: number, model: unknown, pixel: unknown): { entry: PageEntry; frames: Frames }
export declare function fixtureTotals(pages: PageEntry[], frames: Frames[], tier: Tier): Totals
export declare function ratesOf(t: Totals, tier: Tier): Record<string, number>
export declare function pooled(list: Totals[], tier: Tier): Totals | null
export declare function worse(m: Measure, prev: Totals, cur: Totals, tier?: Tier): { by: number; worse: boolean; better: boolean; from: number; to: number } | null
export interface Moved { fixture: string; measure: string; label: string; from: number; to: number }
export declare function compare(prev: Record<string, { totals: Totals; pages: PageEntry[] }>, cur: Record<string, { totals: Totals; pages: PageEntry[] }>, tier: Tier): { regressions: Moved[]; improvements: Moved[]; pages: { fixture: string; page: number; worse: string[]; better: string[] }[]; unmatched: string[] }
