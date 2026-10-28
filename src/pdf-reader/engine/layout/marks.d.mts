// marks.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit, UnitMark } from '../source/latex-front.mjs'
import type { NameKey } from './names.mjs'

export type MarkClass = 'math' | 'display' | 'cite' | 'ref' | 'eqref' | 'code' | 'url' | 'footnote' | 'macro' | 'number'
/** every class, in this order */
export declare const MARK_CLASSES: readonly MarkClass[]
/** the classes the run marks when asked: the global default (Task 2's corpus check); the paper's own switch
 *  (layoutMarking's `switches`) takes marks off where TeX says they change what follows */
export declare const LAYOUT_CLASSES: readonly MarkClass[]
/** what TeX answered to the mark probe, per command (`\\cite`): a code a follower (FOLLOWERS) — 0 every mark, 1 no
 *  closing mark, 2 no mark, x no answer (an error in the follower's boxes: no mark) (for `call`: 0 a mark may stand
 *  between two calls, 2 none may); and per look-ahead pair (aheadKey), one code: 0 every mark, 1 the macro's opening mark
 *  alone and the placeholder's, 2 none on the placeholder, x no answer */
export type Switches = Record<string, string>
/** what the mark probe sets after a placeholder */
export declare const FOLLOWERS: readonly string[]
export declare const PROBE_MAX: number
/** a piece's leading command, or null */
export declare const commandOf: (p: unknown) => string | null
/** a look-ahead pair the probe asks about: a paper's macro (`src`), the white space after it (`gap`, ' ' or ''), the
 *  placeholder it precedes (`follows`, `math` where it is an inline formula), and their key in the switch */
export type AheadSample = { key: string; src: string; gap: '' | ' '; follows: string; math: boolean; ahead: true }
/** each command of the asked classes the paper writes, once, with a source TeX can set in a box; the paper's complete
 *  macros' calls (`own`); and last the look-ahead pairs (aheadSamples) */
export declare function probeSamples(units: readonly SourceUnit[], complete?: Complete | ReadonlyMap<string, number> | readonly (readonly [string, number])[] | null): ({ command: string; src: string; call: boolean; own?: true; glued?: string } | AheadSample)[]
/** the look-ahead pairs the probe asks about at most, a paper */
export declare const AHEAD_PROBE_MAX: number
/** a look-ahead pair's key in the switch: the macro's source, the white space after it and the placeholder's, joined by `#` */
export declare const aheadKey: (src: string, gap: '' | ' ', follows: string) => string
/** each placeholder of the paper's own macros followed, right after it or past white space alone, by a placeholder of a
 *  class the maker cannot find unmarked, paired with it, each pair once, in the paper's order */
export declare function aheadSamples(units: readonly SourceUnit[]): AheadSample[]
/** the look-ahead section (`ahead`): each pair set as the paper sets it, with every mark and with the openings alone */
export declare function aheadSection(samples: readonly AheadSample[]): string
/** the asked classes' commands the probe asks about at most, and the complete macros apart */
export declare const COMPLETE_PROBE_MAX: number
/** the probe's schema: a new section adds rows of a tag of its own */
export declare const PROBE_SCHEMA: number
/** the TeX that writes one row `LAYOUT-PROBE <schema> <tag> <fields…>` */
export declare const probeRow: (tag: string, ...fields: (string | number)[]) => string
/** the probe document's body: its sections' TeX */
export declare const probeTex: (sections: readonly string[]) => string
/** every row of a probe's log */
export declare function readProbe(log: string): { schema: number; tag: string; fields: string[] }[]
/** the punctuation section (`punct`) */
export declare function punctuationSection(samples: readonly { src: string; call: boolean; glued?: string }[], from?: number): string
/** the layout marks' probe document, after \\begin{document} of the font probe: the punctuation section, then the ink
 *  section where `ink` holds samples, and last an ink section of `leads` (leadSamples), numbered on from `ink` */
export declare function markProbeTex(samples: readonly ({ src: string; call: boolean; own?: true; glued?: string } | AheadSample)[], ink?: readonly string[], leads?: readonly string[]): string
/** the distinct sources of the paper's macros the ink section asks about, at most */
export declare const INK_MAX: number
/** the ink section's samples: each macro's source once, in the paper's order, that TeX can set in a box of its own */
export declare function inkSamples(units: readonly SourceUnit[]): string[]
/** the distinct samples the ink section asks about a bibliography's entries, past the body's INK_MAX */
export declare const ENTRY_INK_MAX: number
/** the sources the ink section's answers name, at most: INK_MAX + ENTRY_INK_MAX */
export declare const INK_ANSWERS_MAX: number
/** the ink section's answers from the probe's log, each the asked source's own: the one reader */
export declare function readInkAnswers(log: string, units: readonly SourceUnit[]): { inkless: string[]; texts: [string, string][]; apart: string[] }
/** the leads the ink section asks about past the paper's macros inkSamples takes, at most */
export declare const LEAD_MAX: number
/** the leads' samples: the placeholders at a unit's head (headEnd) of inline code or a paper's macro that `asked` does not
 *  hold, once, in the paper's order, that TeX can set in a box of its own, at most LEAD_MAX */
export declare function leadSamples(units: readonly SourceUnit[], asked?: readonly string[]): string[]
/** the ink section (`ink`): each sample in a box, the box shown in the log, its rows numbered from `from` */
export declare function inkSection(samples: readonly string[], from?: number): string
/** the samples TeX set no ink for, from the probe's log */
export declare function readInkProbe(log: string, samples: readonly string[]): string[]
/** a macro's text as the ink section shows it set, at most */
export declare const INK_TEXT_MAX: number
/** what a lead's text holds for a glyph of a formula's whose character it does not spell: one glyph, whatever its text */
export declare const INK_ANY: string
/** each sample's text, where the probe showed it sets characters a text names: a text font's letters, digits and ASCII's
 *  punctuation, a formula's, its glyphs it does not spell INK_ANY, one spelled at least: [source, text] */
export declare function readInkTexts(log: string, samples: readonly string[]): [string, string][]
/** one glyph of a lead's ink (its text `t`) read against the text `want` up to `end` from its end: the end past it, or -1 */
export declare function leadStep(want: string, end: number, t: string): number
/** the samples whose box TeX began with no character (a kern, glue, a box, a formula, a colour): glued to a word, none of its letters */
export declare function readInkApart(log: string, samples: readonly string[]): string[]
/** the paper's macros a marking takes for reading nothing past their arguments, at most */
export declare const COMPLETE_MAX: number
/** the paper's macros that read nothing past their arguments, by name: their arity */
export type Complete = Record<string, number>
/** whether a placeholder is a call of such a macro (name → arity) with all its arguments in it */
export declare function completeCall(p: unknown, complete: ReadonlyMap<string, number> | null | undefined): boolean
/** of the front end's complete macros ([name, arity]), those the units call, by name; null for none given */
export declare function completeCalled(units: readonly SourceUnit[], complete: readonly (readonly [string, number])[] | null | undefined): Complete | null
/** each babel name's macro, by key (\\refname's `ref`) */
export declare const NAME_MACROS: Readonly<Record<NameKey, string>>
/** each babel name's English value (babel's en [captions]) */
export declare const NAME_ENGLISH: Readonly<Record<NameKey, string>>
/** the name section of the probe (`name`): each wrapped name, whether its own text holds a lowercase letter */
export declare function nameSection(): string
/** the name section's answers: 1 a name's own text holds a lowercase letter, 0 not, by key */
export declare function readNameProbe(log: string): Partial<Record<NameKey, 0 | 1>>
/** the probe's skip section: the paper's \lineskip (its natural size) and \lineskiplimit at the document's start */
export declare function skipSection(): string
/** the paper's \lineskip and \lineskiplimit from the probe's log, PDF units; null where the probe gave none */
export declare function readSkipProbe(log: string): [number, number] | null
/** the marking's lineskip: null, or two finite numbers within TeX's \maxdimen; else a LayoutRefusal at `path` */
export declare function checkLineskip(v: unknown, path: string): [number, number] | null
/** a babel name a style writes literally in the definition of the construct its macro names, wrapped as the macro's
 *  own text is; the text unchanged where it holds none */
export declare function literalNames(text: string): string
/** where a unit's start mark goes, as patch places it: the first piece at or after it, from `from` */
export declare function headEnd(pieces: readonly unknown[], from?: number): number
/** LaTeX's text symbols, each the one character it sets, and a symbol's text: the table the layer reads too */
export { symbolText, TEXT_SYMBOLS } from '../rules/text-symbols.mjs'
/** TeX's answers from the probe's `punct` rows, per sample's command */
export declare function readMarkProbe(log: string, samples: readonly ({ command: string } | AheadSample)[]): Switches
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
/** the TeX that goes after MARK_DEF in the marked original: the gate and the marks' macros, the names, the points last */
export declare const LAYOUT_TEX: string
/** the control sequences \\axt@unmark takes out of a title's copy with their arguments: the regex's alternation and the
 *  prefilter that keeps it from running on a list holding none of them are both built from this list */
export declare const UNMARK_CS: readonly string[]
export declare const NAME_MARK_FILE: RegExp
export declare function withoutNameMarks(text: string): string
/** LAYOUT_TEX's names: \\axtnma{<key>} and \\axtnmb{<key>} around each babel name macro's own text */
export declare const NAMES_TEX: string
/** LAYOUT_TEX's last part: a point (`/axt-<name> ri`) beside each destination, around each column's body and each
 *  float's box */
export declare const POINTS_TEX: string
/** POINTS_TEX's point under `latex` (latex-front.mjs dviEngine), where pdfTeX writes no PDF: xdvipdfmx's `pdf:code` special */
export declare const DVI_POINTS_TEX: string
/** LAYOUT_TEX's destination and points under `latex`, where pdfTeX writes no PDF: xdvipdfmx's specials (DVI_MARK_DEF's
 *  destination, DVI_POINTS_TEX); after LAYOUT_TEX, for such a paper alone */
export declare const DVI_LAYOUT_TEX: string
/** the source pieces of a unit that TeX ligatures and LaTeX's quotes set as other characters, as the glyphs have them */
export declare const asSet: (s: string) => string
/** every destination name the marked original may hold (without its 'axt-'): a unit's start or end (MARK_DEF), a page's
 *  columns, a cell's (t) or a heading's (h) start or end, a placeholder's (p) or a footnote call's (n) opening or closing
 *  mark by its unit and source piece index, a draft image frame's corner (g), a babel name's start or end (n<occurrence>.<key>.s) */
export declare const MARK_NAME: RegExp
/** the units with their layout marks as pieces of their own (each unit copied; the paper's units untouched), and each
 *  unit's mark for patch(): MARK_DEF's for a marked unit (with \axtlines when `lines`), a cell's and a heading's own;
 *  marks taken off where `switches` (TeX's answers) says they change what follows */
export declare function layoutMarking(units: readonly SourceUnit[], classes: readonly MarkClass[], o: { lines: boolean; switches?: Switches | null; inkless?: readonly string[] | null; complete?: Complete | ReadonlyMap<string, number> | readonly (readonly [string, number])[] | null; apart?: readonly string[] | null }): { units: SourceUnit[]; mark(u: SourceUnit): UnitMark }

/** the marks file (internal, prep/<mid>/marks-<sha>.json): what the layout maker reads from the marked original */
export interface LayoutMarks {
  schema: 13
  /** the engine that compiled it (meta.compiler) */
  engine: string
  /** what the marked original was marked with: layoutMarking's classes and the paper's own switch (TeX's answers to the
   *  mark probe, readMarkProbe; null where the probe was not run), so that whoever reads the file knows which pieces
   *  have marks */
  /** `texts`: the probe's texts, flat (source, text, source, text, …), null where no probe ran */
  /** `names`: whether each babel name's own text holds a lowercase letter (readNameProbe), null where no probe ran */
  /** `lineskip`: the paper's \lineskip and \lineskiplimit, PDF units (readSkipProbe), null where the probe gave none */
  marking: { classes: MarkClass[]; switches: Switches | null; inkless: string[] | null; texts: string[] | null; names: Partial<Record<NameKey, 0 | 1>> | null; lineskip: [number, number] | null; complete: Complete | null; apart: string[] | null }
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
  /** each unit's alignment as TeX set its paragraph (readAlign): centred, flush left, flush right, justified; ids rising */
  align: [id: number, code: AlignCode][]
  /** each colour piece's fill as TeX set its run (readColours): [unit, k, 0xRRGGBB], rising by unit and k */
  colours: [id: number, k: number, rgb: number][]
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
  /** the marked compile's Link annotations that name a destination (a string `dest`), on the pages a placeholder that names a
   *  link (linkablePiece) has a point on, pages rising, then PDF.js's order: the rectangle, the least and greatest origin of the
   *  glyphs under it (PDF.js's rule: a glyph's advance centre on its baseline strictly inside), their count and characters; n 0
   *  where none, too many or a text too long (counted for the order, never an anchor: make.mjs's link-anchor locator). []
   *  where a page's could not be read, past LINKS_MAX, or not read (no `units` and `OPS`) */
  links: LinkRow[]
}
/** a link of the marked compile: [dest, page, x0, y0, x1, y1, a, b, n, text] */
export type LinkRow = [dest: string, page: number, x0: number, y0: number, x1: number, y1: number, a: number, b: number, n: number, text: string]
/** a placeholder whose source names a link and whose class may hold it: the pieces the link-anchor locator pairs */
export declare const linkablePiece: (piece: unknown) => boolean
/** the links a marks file holds at most: a paper past it has none */
export declare const LINKS_MAX: number
/** a Link annotation as both PDFs' links are ranked by (ours in the marks file, arXiv's in the maker): its rectangle's corners
 *  in order, to a hundredth, where it names a destination the file can hold and its rectangle has an area there; else null */
export declare function destRect(a: unknown): [x0: number, y0: number, x1: number, y1: number] | null
export declare const MARKS_CAP: number
export declare const MARKS_VALUES: number
export declare const MARKS_DEPTH: number
export declare const MARKS_SCHEMA: 13
/** a unit's alignment code (readAlign) */
export type AlignCode = 'c' | 'l' | 'r' | 'j'
export declare const ALIGN_CODES: readonly AlignCode[]
/** each unit's alignment from the marked original's log (LAYOUT_TEX's AXT-ALIGN at its end mark): [[unit, code]], ids rising;
 *  none for a unit TeX set in an hbox or that wrote no line */
export declare function readAlign(log: string | null | undefined): [number, AlignCode][]
/** each colour piece's fill from the marked original's log (LAYOUT_TEX's AXT-COLOUR at the piece): [[unit, k, 0xRRGGBB]],
 *  rising; none for a piece set in two colours or whose colour string is of no form known */
export declare function readColours(log: string | null | undefined): [number, number, number][]
/** whether a piece is a colour piece: a \textcolor's open or a \color switch, which the marking writes its colour at */
export declare function colourPieceOf(p: { t?: string; src?: string } | null | undefined): boolean
/** a piece's own ink at most, its glyphs and its rules; and a paper's in all */
export declare const GLYPHS_PIECE: number
export declare const RULES_PIECE: number
export declare const OWNED_ALL: number
/** from a PDF.js document of the marked original and its last TeX pass's log; the caller opens and destroys the
 *  document. With the paper's `units` and PDF.js's operator codes, each marked piece's own ink from its operator lists */
export declare function layoutMarksOf(marked: unknown, log: string, o: { engine: string; classes?: readonly MarkClass[]; switches?: Switches | null; inkless?: readonly string[] | null; texts?: readonly (readonly [string, string])[] | readonly string[] | null; names?: Partial<Record<NameKey, 0 | 1>> | null; lineskip?: readonly [number, number] | null; complete?: Complete | null; apart?: readonly string[] | null; units?: readonly SourceUnit[] | null; OPS?: Record<string, number> | null }): Promise<LayoutMarks>
/** the unit marks the left is anchored by: `<id>s` / `<id>e` → the destination's place and the word it stands by (markWords) */
export type UnitMarks = Map<string, { page: number; x: number; y: number; t: string | null }>
/** an owned row as a page hands it on: [name, how], or [name, how, n, glyphs (page, x0, y, size, the character itself or its
 *  index in the marks' `chars`), rules (page, x0, y0, x1, y1)] */
export type OwnedRow = (string | number)[]
/** the options of the marked original's reading: layoutMarksOf's, and `paper` (the marks file's paper-wide bounds too) */
export type MarkedOptions = Parameters<typeof layoutMarksOf>[2] & { paper?: boolean }
/** why a page of the marked original has no ink (null: it has): its operator list not given within OPS_MS, or its ink's walk
 *  past its backstop ('timedOut'); past OPS_CAP's operations, GLYPHS_PAGE's glyphs or a guard of pageInk's own ('capped');
 *  its boxes past BOXES_PAGE merged ('degraded'); no piece on it is owned */
export type MarkedDark = 'timedOut' | 'capped' | 'degraded' | null
/** the marked original's head (markedPages' first event): the names read, each page looked up once */
/** the head's verdict on the paper's links (read before any page): how many its link pages hold and their destinations' names,
 *  or null where it has none (a page's not read within OPS_MS or past MAX_LINKS, or all past LINKS_MAX) */
export interface MarkedLinks { count: number; dests: string[] }
export interface MarkedHead { pages: number; marking: LayoutMarks['marking']; dropped: string[]; set: Set<string>; named: [string, number | null, number, number][]; destPage: Map<string, number>; pageOf: Map<string, number>; lines: [number, number][]; align: [number, AlignCode][]; colours: [number, number, number][]; unitMarks: UnitMarks | null; links: MarkedLinks | null }
/** one page of the marked original as it is read: its tokens, the words first seen on it, the pieces found once it was read,
 *  why it has no ink (null: it has), the page before which every opening point's piece is found, the points read again on it */
export interface MarkedPage { p: number; view: number[]; tokens: number[]; words: string[]; owned: [string, OwnedRow][]; links: LinkRow[] | null; dark: MarkedDark; found: number; repeats: string[] }
/** what the marked original gives a page at a time (markedPages): its head, each page, its end */
export type MarkedEvent =
  | { head: MarkedHead }
  | { page: MarkedPage }
  | { end: { owned: [string, OwnedRow][]; twice: Set<string>; lines: [number, number][]; align: [number, AlignCode][]; colours: [number, number, number][] } }
/** the marked original read a page at a time, an async generator: its head, each page in order, its end */
export declare function markedPages(marked: unknown, log: string, o: MarkedOptions): AsyncGenerator<MarkedEvent>
/** the marked original read once, a page at a time (markedPages, drained): the marks in memory (as parseLayoutMarks reads their
 *  file; never trimmed to the file's bounds; the paper-wide bounds with `paper` alone) and the unit marks (null: a unit mark's
 *  page could not be looked up), and the pages with no ink, by why */
export declare function readMarked(marked: unknown, log: string, o: MarkedOptions): Promise<{ marks: LayoutMarks; unitMarks: UnitMarks | null; dark: { timedOut: number[]; capped: number[]; degraded: number[] } }>
/** each opening point's piece as the page stream finds it (layout/stream.mjs Follow): of the units and the destinations' names */
export declare function followsOf(units: readonly SourceUnit[], names: ReadonlySet<string>, texts?: readonly string[] | ReadonlyMap<string, string> | null): (name: string) => import('./stream.mjs').Follow | null
/** whether a destination the head names is a mark of the marks file: on a page of the paper, within its page's view (`views`
 *  the pages' read so far, stride 4) */
export declare function markAt(views: readonly number[], pages: number, page: number | null, x: number, y: number): boolean
/** each page's columns as the marks file has them, of the head's names alone */
export declare function columnsOf(head: MarkedHead): number[]
/** the marks of a marked original whose pages are still to be read: its head's marking, columns, dropped names and line counts */
export declare function marksOfHead(head: MarkedHead, engine: string): LayoutMarks & { linkCount: number; linkDests: string[] }
/** a point read twice on pages apart: its piece 'a mark set twice', nor the displays of its group, on `rows` in place */
export declare function vetoTwice(rows: Map<string, OwnedRow>, twice: ReadonlySet<string>, follows: (name: string) => { group?: string[] } | null): void
/** the marks file as the lab writes it of the marks in memory: encodeLayoutMarks of them as they are, which its parser reads back
 *  as them; marks past one of the file's own bounds throw the parser's LayoutRefusal (no file is trimmed to other marks) */
export declare function marksFile(m: LayoutMarks): string
export declare function encodeLayoutMarks(m: LayoutMarks): string
/** bytes, then values, then JSON.parse, then every bound below; throws LayoutRefusal */
export declare function parseLayoutMarks(bytes: Uint8Array): LayoutMarks
/** \\rule's call: what TeX's ink section measures, not the role table (a strut, \\rule{0pt}{2ex}, none; a bar, ink) */
export declare const RULE: RegExp
