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
/** the layout marks' probe document, after \\begin{document} of the font probe: the punctuation section, then the ink
 *  section where `ink` holds samples */
export declare function markProbeTex(samples: readonly { src: string; call: boolean }[], ink?: readonly string[]): string
/** the distinct sources of the paper's macros the ink section asks about, at most */
export declare const INK_MAX: number
/** the ink section's samples: each macro's source once, in the paper's order, that TeX can set in a box of its own */
export declare function inkSamples(units: readonly SourceUnit[]): string[]
/** the ink section (`ink`): each sample in a box, the box shown in the log */
export declare function inkSection(samples: readonly string[]): string
/** the samples TeX set no ink for, from the probe's log */
export declare function readInkProbe(log: string, samples: readonly string[]): string[]
/** a macro's text as the ink section shows it set, at most */
export declare const INK_TEXT_MAX: number
/** each sample's text, where the probe showed it sets letters and digits of text fonts alone: [source, text] */
export declare function readInkTexts(log: string, samples: readonly string[]): [string, string][]
/** where a unit's start mark goes, as patch places it: the first piece at or after it, from `from` */
export declare function headEnd(pieces: readonly unknown[], from?: number): number
/** LaTeX's text symbols, each the one character it sets */
export declare const TEXT_SYMBOLS: Readonly<Record<string, string>>
/** a symbol's text (TEXT_SYMBOLS), its source alone or followed by `{}`, else null */
export declare function symbolText(src: string | undefined): string | null
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
/** the TeX that goes after MARK_DEF in the marked original: the gate and the marks' macros, the points last */
export declare const LAYOUT_TEX: string
/** LAYOUT_TEX's last part: a point (`/axt-<name> ri`) beside each destination, around each column's body and each
 *  float's box */
export declare const POINTS_TEX: string
/** the source pieces of a unit that TeX ligatures and LaTeX's quotes set as other characters, as the glyphs have them */
export declare const asSet: (s: string) => string
/** every destination name the marked original may hold (without its 'axt-'): a unit's start or end (MARK_DEF), a page's
 *  columns, a cell's (t) or a heading's (h) start or end, a placeholder's (p) or a footnote call's (n) opening or closing
 *  mark by its unit and source piece index, a draft image frame's corner (g) */
export declare const MARK_NAME: RegExp
/** the units with their layout marks as pieces of their own (each unit copied; the paper's units untouched), and each
 *  unit's mark for patch(): MARK_DEF's for a marked unit (with \axtlines when `lines`), a cell's and a heading's own;
 *  marks taken off where `switches` (TeX's answers) says they change what follows */
export declare function layoutMarking(units: readonly SourceUnit[], classes: readonly MarkClass[], o: { lines: boolean; switches?: Switches | null; inkless?: readonly string[] | null }): { units: SourceUnit[]; mark(u: SourceUnit): UnitMark }

/** the marks file (internal, prep/<mid>/marks-<sha>.json): what the layout maker reads from the marked original */
export interface LayoutMarks {
  schema: 3
  /** the engine that compiled it (meta.compiler) */
  engine: string
  /** what the marked original was marked with: layoutMarking's classes and the paper's own switch (TeX's answers to the
   *  mark probe, readMarkProbe; null where the probe was not run), so that whoever reads the file knows which pieces
   *  have marks */
  /** `texts`: the probe's texts, flat (source, text, source, text, …), null where no probe ran */
  marking: { classes: MarkClass[]; switches: Switches | null; inkless: string[] | null; texts: string[] | null }
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
  /** its text tokens (tokenizeDocument): page, x, y, w, h, word (stride 6); word -1 the rest of the word before, given
   *  in parts */
  tokens: number[]
  /** the owned glyphs' distinct characters */
  chars: string[]
  /** each marked piece's own ink by its points in the content stream (layout/stream.mjs), by its opening mark's name,
   *  rising: [name, how] where it is not owned (how ≥ OWNED, OWNED_HOW), else [name, how, n, …n glyphs (page, x0,
   *  baseline, size, a character of chars), …its rules (page, x0, y0, x1, y1)] */
  owned: (string | number)[][]
}
export declare const MARKS_CAP: number
export declare const MARKS_VALUES: number
export declare const MARKS_DEPTH: number
export declare const MARKS_SCHEMA: 3
/** a piece's own ink at most, its glyphs and its rules; and a paper's in all */
export declare const GLYPHS_PIECE: number
export declare const RULES_PIECE: number
export declare const OWNED_ALL: number
/** from a PDF.js document of the marked original and its last TeX pass's log; the caller opens and destroys the
 *  document. With the paper's `units` and PDF.js's operator codes, each marked piece's own ink from its operator lists */
export declare function layoutMarksOf(marked: unknown, log: string, o: { engine: string; classes?: readonly MarkClass[]; switches?: Switches | null; inkless?: readonly string[] | null; texts?: readonly (readonly [string, string])[] | readonly string[] | null; units?: readonly SourceUnit[] | null; OPS?: Record<string, number> | null }): Promise<LayoutMarks>
export declare function encodeLayoutMarks(m: LayoutMarks): string
/** bytes, then values, then JSON.parse, then every bound below; throws LayoutRefusal */
export declare function parseLayoutMarks(bytes: Uint8Array): LayoutMarks
