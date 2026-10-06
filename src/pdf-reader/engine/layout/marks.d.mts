// marks.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit, UnitMark } from '../latex-front.mjs'

export type MarkClass = 'math' | 'display' | 'cite' | 'ref' | 'eqref' | 'code' | 'url' | 'footnote' | 'macro'
/** every class, in this order */
export declare const MARK_CLASSES: readonly MarkClass[]
/** the classes the run marks when asked: the global default (Task 2's corpus check); a paper's own switch
 *  (punctuationMovers) takes the marks off the placeholders of a class its punctuation follows */
export declare const LAYOUT_CLASSES: readonly MarkClass[]
type PaperFiles = { fsys: { read(path: string): Uint8Array | null }; project: { main: string } }
/** whether the paper's citations take the punctuation after them before them (cite.sty's and natbib's super, natmove,
 *  overcite, biblatex's footnote or superscript \autocite): from the preamble the engine reads and `log`, a log of any
 *  compile of the paper's preamble (the font probe's) */
export declare function superCitations(paper: PaperFiles, log?: string): boolean
/** the paper's own switch: the classes a package of its moves the punctuation after before (`cite` where superCitations),
 *  for layoutMarking's and originalFiles' `movesPunctuation` */
export declare function punctuationMovers(paper: PaperFiles, log?: string): MarkClass[]
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
 *  unit's mark for patch(): MARK_DEF's for a marked unit (with \axtlines when `lines`), a cell's and a heading's own;
 *  no mark for a placeholder of a class in `movesPunctuation` (the paper's own switch) the punctuation follows */
export declare function layoutMarking(units: readonly SourceUnit[], classes: readonly MarkClass[], o: { lines: boolean; movesPunctuation?: readonly MarkClass[] }): { units: SourceUnit[]; mark(u: SourceUnit): UnitMark }

/** the marks file (internal, prep/<mid>/marks-<sha>.json): what the layout maker reads from the marked original */
export interface LayoutMarks {
  schema: 1
  /** the engine that compiled it (meta.compiler) */
  engine: string
  /** what the marked original was marked with: layoutMarking's classes and the paper's own switch (punctuationMovers),
   *  so that whoever reads the file knows which pieces have marks */
  marking: { classes: MarkClass[]; movesPunctuation: MarkClass[] }
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
export declare function layoutMarksOf(marked: unknown, log: string, o: { engine: string; classes?: readonly MarkClass[]; movesPunctuation?: readonly MarkClass[] }): Promise<LayoutMarks>
export declare function encodeLayoutMarks(m: LayoutMarks): string
/** bytes, then values, then JSON.parse, then every bound below; throws LayoutRefusal */
export declare function parseLayoutMarks(bytes: Uint8Array): LayoutMarks
