// marks.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit, UnitMark } from '../latex-front.mjs'

export type MarkClass = 'math' | 'display' | 'cite' | 'ref' | 'eqref' | 'code' | 'url' | 'footnote' | 'macro'
/** every class, in this order */
export declare const MARK_CLASSES: readonly MarkClass[]
/** the classes the run marks when asked (Task 2 removes any class that moves a line of any paper) */
export declare const LAYOUT_CLASSES: readonly MarkClass[]
/** a placeholder whose rendering is never ink: matched on its leading control sequence */
export declare const INVISIBLE: RegExp
/** a displayed formula's source */
export declare const DISPLAY: RegExp
/** a piece's class, or null where it is not marked (text, a group's open or close, an invisible placeholder) */
export declare function classOf(piece: { t: string; src?: string }): MarkClass | null
/** the TeX that goes after MARK_DEF in the marked original: the gate and the marks' macros */
export declare const LAYOUT_TEX: string
/** every destination name the marked original may hold (without its 'axt-'): a unit's start or end (MARK_DEF), a page's
 *  columns, a cell's (t) or a heading's (h) start or end, a placeholder's (p) or a footnote call's (n) opening or closing
 *  mark by its unit and source piece index, a draft image frame's corner (g) */
export declare const MARK_NAME: RegExp
/** the units with their layout marks as pieces of their own (each unit copied; the paper's units untouched), and each
 *  unit's mark for patch(): MARK_DEF's for a marked unit (with \axtlines when `lines`), a cell's and a heading's own */
export declare function layoutMarking(units: readonly SourceUnit[], classes: readonly MarkClass[], o: { lines: boolean }): { units: SourceUnit[]; mark(u: SourceUnit): UnitMark }

/** the marks file (internal, prep/<mid>/marks-<sha>.json): what the layout maker reads from the marked original */
export interface LayoutMarks {
  schema: 1
  /** the engine that compiled it (meta.compiler) */
  engine: string
  pages: number
  /** per page: x0, y0, x1, y1 (stride 4) */
  views: number[]
  /** per page: 1 or 2 (MARK_DEF's c<n>-<k>), 0 unread */
  columns: number[]
  /** every destination MARK_NAME takes, but `dropped` */
  marks: [name: string, page: number, x: number, y: number][]
  /** names the log reports set twice */
  dropped: string[]
  /** each unit's line count (LINES_TEX's AXT-LINES) */
  lines: [id: number, n: number][]
  /** the marked original's distinct words */
  words: string[]
  /** its text tokens (tokenizeDocument): page, x, y, w, h, word (stride 6) */
  tokens: number[]
}
export declare const MARKS_CAP: number
export declare const MARKS_VALUES: number
export declare const MARKS_DEPTH: number
/** from a PDF.js document of the marked original and its last TeX pass's log; the caller opens and destroys the document */
export declare function layoutMarksOf(marked: unknown, log: string, o: { engine: string }): Promise<LayoutMarks>
export declare function encodeLayoutMarks(m: LayoutMarks): string
/** bytes, then values, then JSON.parse, then every bound below; throws LayoutRefusal */
export declare function parseLayoutMarks(bytes: Uint8Array): LayoutMarks
