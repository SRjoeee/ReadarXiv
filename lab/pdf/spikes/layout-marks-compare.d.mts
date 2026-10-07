// layout-marks-compare.mjs's types, for its tests
/** a text item of a page as PDF.js gives it: its string, its origin, its width */
export interface Item { str: string; x: number; y: number; w: number; h?: number }
export interface Placed { page: number; k?: number; str: string; x: number; y: number }
export declare const ITEM_TOL: number
export declare const LINE_TOL: number
export declare function strictMoves(a: Item[][], b: Item[][]): { moved: Placed[]; extra: Placed[] }
export declare function joinRuns(items: Item[]): (Item & { k: number })[]
export interface Line { y: number; h: number; x0: number; x1: number }
export declare function linesOf(items: Item[]): { lines: Line[]; of: number[] }
export declare function lineAt(lines: Line[], x: number, y: number): number
export type FileState = 'same' | 'differs' | 'none'
export type Files = { aux: FileState; toc: FileState; lof: FileState; lot: FileState; out: FileState }
export declare function fileStates(a: Record<string, string | null>, b: Record<string, string | null>): Files
/** live.mjs readingsOf's */
export interface Readings {
  log: string
  cites: string
  labels: string
  bbl: string | null
  marks: { pages: number; width: number; height: number; columns: number[]; marks: Map<string, { page: number; x: number; y: number }> }
}
export declare const readingsText: (r: Readings) => string
export declare function compareReadings(r0: Readings, r1: Readings, units: readonly { kind: string }[]): { readings: 'same' | 'captions' | 'offsets' | 'differs'; captions: [unit: number, v0Page: number, v1Page: number][]; offsets?: [name: string, dx: number][]; parts?: string[] }
export interface BoxNode { text: string; children: BoxNode[]; parent: BoxNode | null }
export declare function pageBoxes(log: string): BoxNode[]
export interface Difference { page: number; v0: string | null; v1: string | null; near: string | null; line: string | null; inLine: string[] }
export declare function boxDiff(pages0: BoxNode[], pages1: BoxNode[]): Difference[]
export declare function causesOf(diffs: readonly Pick<Difference, 'page' | 'v0' | 'v1' | 'near' | 'line'>[]): Map<string, 'heading kern' | 'unexplained'>
export declare function lostLines(a: Item[][], b: Item[][], allA: Item[][], allB: Item[][], lines: { of: number[] }[]): { strict: Set<string>; joined: Set<string> }
export declare function classOfMark(name: string, units: readonly { kind: string; pieces?: unknown[] }[]): string | null
export declare function attribute(name: string | null, units: readonly { kind: string; pieces?: unknown[] }[]): string
export interface Row {
  id?: string
  v0: 'ok' | 'failed'
  v1?: 'ok' | 'failed'
  switched?: string[]
  unanswered?: string[]
  lost?: { strict: number; joined: number; tex?: number; all?: number }
  traced?: boolean
  cause?: 'tex' | 'pdf-only'
  causes?: { accepted: number; unexplained: number }
  unitMarksMoved?: number
  verdict?: string
}
export declare function verdictOf(row: Row): 'passed over' | 'failing' | 'switched' | 'clean' | 'accepted'
export declare function withFitr(main: string, markDef: string, layoutTex: string): string
export declare const traced: (t0: { ok?: boolean; pages?: number; pdfPages?: number } | null, t1: { ok?: boolean; pages?: number; pdfPages?: number } | null, pages0: number, pages1: number) => boolean
export declare const switchOffOf: (classes: Record<string, { lines?: number; carried?: number; lost?: number; texLost?: number }> | undefined, known: readonly string[]) => string[]
export declare function regressions(rows: readonly Row[], recorded: readonly Row[]): string[]
