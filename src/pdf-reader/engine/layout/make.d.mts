// make.mjs's types (JavaScript until the engine's port), for the container's prepare and the maker's tests
import type { SourceUnit } from '../source/latex-front.mjs'
import type { LayoutFile } from './file.mjs'
import type { FrameRule } from '../pipeline/anchors.mjs'
import type { ArxivText } from './arxiv.mjs'
import type { LayoutMarks } from './marks.mjs'
import type { PagePlan } from './addon.mjs'

export interface MakeInput {
  /** the paper's (openPaper(files).units), ids their indices */
  units: readonly SourceUnit[]
  /** of the marked original, made with the classes the marks file was made with */
  marks: LayoutMarks
  /** a PDF.js document of arXiv's PDF; the caller opens and destroys it */
  arxiv: unknown
  OPS: Record<string, number>
  paper: { id: string; version: number }
  left: string
  pdfjs: string
  /** arXiv's text as layout/arxiv.mjs readArxivText read it from `arxiv` (step T), else read by the maker */
  text?: ArxivText | null
  /** anchors.mjs floatMatches of `text`'s tokens and the units' texts, else searched by the maker */
  floatMatch?: Map<number, number[] | null> | null
  /** the pages' frame's rule the maker's anchors are placed under (anchors.mjs pageFrame, today's, where none is given); the
   *  page stream (makerOf's stream, byStream) needs one given, the whole document's: it throws a TypeError without */
  frame?: FrameRule | null
  /** the columns' text edges the names, the displays' numbers and the centred flag read (`page|column`,
   *  `twoCols|parity|column`, `twoCols|column` to [x0, x1]), given; else made of every placed unit's body lines (today's) */
  columnEdges?: ReadonlyMap<string, [number, number]> | null
  /** the add-on's plans as well (`plans` in the result), of the ink the maker reads: each page's operator list read once */
  plans?: boolean
  /** the file is cut into parts (layer-proto/cut.mjs partCutter), which hold the bounds a part holds and the carry's share per
   *  part: made whatever share is carried, checked without those bounds; `lines` in the result */
  parts?: boolean
}
export interface LayoutStats {
  lines: { carried: number; total: number; held: number }
  /** `unplaced`: the units arXiv's text would place whose own marks were not carried there (they stay the original's) */
  units: { located: number; total: number; byKind: Record<string, [located: number, total: number]>; unplaced: number }
  /** `marked`: the placeholders of the located units the marked original marks (an opening mark at least), by kind
   *  found among them; `unmarked`: those it gives no mark (LOST, beside them); `symbols`: the text symbols it gives no
   *  mark drawn as their character (PH_FLAG.TEXT, beside them); `inferred`: those found whose end is
   *  inferred, having no closing mark; `why`: the LOST among them by cause; `textTaken`: glyphs a placeholder took that are
   *  letters of the unit's own words as the anchor paired them (running text), to be none. The bars of the own ink:
   *  `owned` and `matched`, the glyphs and rules of the found pieces in the marks file and on arXiv's page, `unmatched`
   *  their difference, and `twice`, arXiv's glyphs matched by two found pieces, each to be none (each holds by the
   *  matcher's rule); `foreign`, arXiv's glyphs half inside a found inline piece's segments (its crop) by their own ink
   *  that are not its own, and `shared`, those inside two found pieces' segments, each to be none; `texts`, the page
   *  texts written (the TEXT symbols' too); `heads`, the unmarked pieces before a unit's start mark or after its end mark
   *  (besideMarks) found by the text the probe showed them set, and EMPTY, having set nothing on the line beside the mark;
   *  `joined`, the later displays of a display group (PH_FLAG.JOINED, their ink the group's first display's); `outside`,
   *  the LOST pieces outside the unit's lines (PH_FLAG.OUTSIDE: before its start mark, a display after its end mark) */
  ph: { marked: number; found: number; empty: number; lost: number; joined: number; outside: number; byKind: Record<string, [found: number, marked: number]>; unmarked: number; symbols: number; inferred: number; why: Record<string, number>; textTaken: number; owned: number; matched: number; unmatched: number; twice: number; foreign: number; shared: number; texts: number; heads: [found: number, empty: number] }
  /** the matcher's matches by kind (the same character, another Unicode at the place, loosely on the line, by a vote),
   *  those it rejected off their run, its work, the pieces past its bound, and the most work a page cost (`most`) */
  match: { same: number; recoded: number; loose: number; vote: number; rejected: number; work: number; over: number; most: number }
  /** babel's names: the occurrences the marked original marks, those the file locates (and of them those leading a unit:
   *  RUN_IN), and why each other is not */
  names: { marked: number; located: number; runIn: number; why: Record<string, number> }
  /** the link-anchor locator: the references and citations the matcher did not find that it tried, those it placed by
   *  their links ([unit, k], rising), and why each other stays LOST (its step) */
  links: { tried: number; placed: [unit: number, k: number][]; why: Record<string, number> }
  /** by the unit's kind: the units with a label, of the located units whose start mark was carried to their first line */
  labels: Record<string, [found: number, units: number]>
  frames: { units: number; split: number; lineCountChecked: number; lineCountEqual: number }
  /** |baseline − TeX's start or end mark|, pt */
  baselines: { first: number[]; last: number[] }
  /** pages past OPS_CAP, STEPS_MAX, STACK_MAX, GLYPHS_PAGE or BOXES_CAP (ink.mjs): no ink */
  capped: number[]
  /** pages whose operator list did not come within OPS_MS, or failed, or was never asked (past GIVEN_UP_MAX): no ink */
  timedOut: number[]
  /** pages whose ink's walk passed its backstop, INK_MS (ink.mjs): no ink; the one count that depends on the machine */
  inkTimedOut: number[]
  /** pages past BOXES_PAGE boxes (ink.mjs), and in no list above: their ink kept, the boxes past it merged by cell */
  degraded: number[]
  /** pages whose lines cost the carry more than its bound (carry.mjs `over`): no ink */
  over: number[]
  bytes: { raw: number; gzip: number }
  ms: { text: number; ops: number; carry: number; anchor: number; rows: number }
  /** why the file was refused, where it was ('bounds': the parser's refusal) */
  refusal?: { path: string; why: string }
}
/** a paper's layout file, or why none is made */
export declare function makeLayout(o: MakeInput): Promise<{ file: LayoutFile; stats: LayoutStats; plans?: Map<number, PagePlan> | null; plansFailed?: string; lines?: ReadonlyMap<number, readonly [carried: number, total: number]> } | { refused: 'carry' | 'pages' | 'bounds'; stats: LayoutStats }>
/** a task of the maker's passes: its key in the whole order (compared element by element), the pages it reads and writes */
export interface MakerTask { key: number[]; pages: number[]; run(): void }
/** tasks run in an order the whole order allows: each page's tasks in their order; `pick` the next of those that may run */
export declare function runInOrder(tasks: readonly MakerTask[], pick?: (ready: readonly MakerTask[]) => number): void
type Made = Awaited<ReturnType<typeof makeLayout>>
/**
 * The maker of a paper's layout file (makeLayout's), its pages read one at a time (`readPage`, in page order) and its passes
 * run whole (`whole()`: makeLayout's order) or as tasks in another order the whole order allows (`byTasks(pick)`, the
 * columns' edges given): the same file. `check`: a task reading ink outside its pages throws. `edges()` the columns' edges
 * the passes read (the whole run's, once made)
 */
export declare function makerOf(o: MakeInput & { check?: boolean }): Promise<
  | { refused: 'pages'; stats: LayoutStats }
  | {
    refused?: undefined; pages: number; stats: LayoutStats; readPage(p: number): Promise<void>; whole(): Promise<Made>; byTasks(pick?: (ready: readonly MakerTask[]) => number): Promise<Made>
    edges(): Map<string, [number, number]> | null
    /** the marks carried to arXiv's PDF (whole()'s first step): null, or 'carry' where no line is */
    carrying(): 'carry' | null
    /** each marked page's lines [carried, total], once carried */
    pageLines(): ReadonlyMap<number, readonly [carried: number, total: number]>
    /** the maker a page at a time (after carrying(), the columns' edges and the whole document's frame rule given) */
    stream(): MakerStream
    /** carrying(), then stream() over every page read here, finished */
    byStream(): Promise<MakerStream | { refused: 'carry'; stats: LayoutStats }>
  }
>
/** the maker a page at a time: `pageRead(p)` after each page read in order, `finish()` after the last */
export interface MakerStream {
  pageRead(p: number): void
  finish(): void
  /** each page's plan, made as the page is let go (null without `plans`) */
  plans: Map<number, PagePlan> | null
  plansFailed(): string | null
  /** the file's rows of the units settled (those of `ids`), as the whole file's parse holds them, and the names taken in */
  layout(ids?: number[]): Pick<LayoutFile, 'fonts' | 'units' | 'lines' | 'frames' | 'erase' | 'ph' | 'labels' | 'headings' | 'pageText' | 'held' | 'names'> & LayoutFile
  /** the pages from 1 let go */
  released(): number
  /** whether unit i's rows are made, or it has none */
  settled(i: number): boolean
  progress(): { read: number; anchored: number; decided: number; released: number }
  trace?: { read: number; anchored: number; decided: number; released: number }[]
}
/** the share of the marked original's lines that must be carried, else no file */
export declare const CARRY_MIN: number
/** a page's operator list waited for at most, ms */
export declare const OPS_MS: number
/** a paper's pages given up on (timed out past OPS_MS, or capped) at most: every later page is dark unread, `timedOut` */
export declare const GIVEN_UP_MAX: number
/** a font's PostScript name as the file holds it: 1 to 128 printable ASCII characters */
export declare function fontName(name: unknown): string
