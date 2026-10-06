// marks.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit, UnitMark } from '../latex-front.mjs'

export type MarkClass = 'math' | 'display' | 'cite' | 'ref' | 'eqref' | 'code' | 'url' | 'footnote' | 'macro'
/** every class, in this order */
export declare const MARK_CLASSES: readonly MarkClass[]
/** the classes the run marks when asked: the global default (Task 2's corpus check); the paper's own switch
 *  (layoutMarking's `switches`) takes marks off where TeX says they change what follows */
export declare const LAYOUT_CLASSES: readonly MarkClass[]
/** what TeX answered to the mark probe, per command (`\\cite`): a code a follower (FOLLOWERS) — 0 every mark, 1 no
 *  closing mark, 2 no mark, x no answer (an error in the follower's boxes: no mark) (for `call`: 0 a mark may stand
 *  between two calls, 2 none may) */
export type Switches = Record<string, string>
/** what the mark probe sets after a placeholder */
export declare const FOLLOWERS: readonly string[]
export declare const PROBE_MAX: number
/** a piece's leading command, or null */
export declare const commandOf: (p: unknown) => string | null
/** each command of the asked classes the paper writes, once, with a source TeX can set in a box */
export declare function probeSamples(units: readonly SourceUnit[]): { command: string; src: string; call: boolean }[]
/** the probe's schema: a new section adds rows of a tag of its own */
export declare const PROBE_SCHEMA: number
/** the TeX that writes one row `LAYOUT-PROBE <schema> <tag> <fields…>` */
export declare const probeRow: (tag: string, ...fields: (string | number)[]) => string
/** the probe document's body: its sections' TeX */
export declare const probeTex: (sections: readonly string[]) => string
/** every row of a probe's log */
export declare function readProbe(log: string): { schema: number; tag: string; fields: string[] }[]
/** the punctuation section (`punct`) */
export declare function punctuationSection(samples: readonly { src: string; call: boolean }[]): string
/** the layout marks' probe document, after \\begin{document} of the font probe */
export declare function markProbeTex(samples: readonly { src: string; call: boolean }[]): string
/** TeX's answers from the probe's `punct` rows, per sample's command */
export declare function readMarkProbe(log: string, samples: readonly { command: string }[]): Switches
/** the commands whose marks the answers take off anywhere but between two calls */
export declare const switchedOf: (switches: Switches | null) => string[]
/** the commands of the asked classes a paper writes */
export declare function askedCommands(units: readonly SourceUnit[]): Set<string>
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
 *  marks taken off where `switches` (TeX's answers) says they change what follows */
export declare function layoutMarking(units: readonly SourceUnit[], classes: readonly MarkClass[], o: { lines: boolean; switches?: Switches | null }): { units: SourceUnit[]; mark(u: SourceUnit): UnitMark }

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
