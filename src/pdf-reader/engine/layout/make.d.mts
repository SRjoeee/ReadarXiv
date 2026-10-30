// make.mjs's types (JavaScript until the engine's port), for the container's prepare and the maker's tests
import type { SourceUnit } from '../source/latex-front.mjs'
import type { LayoutFile } from './file.mjs'
import type { FrameRule } from '../pipeline/anchors.mjs'
import type { ArxivText } from './arxiv.mjs'
import type { LayoutMarks, MarkedEvent, MarkedHead, MarkedPage } from './marks.mjs'

export interface MakeInput {
  /** the paper's (openPaper(files).units), ids their indices */
  units: readonly SourceUnit[]
  /** of the marked original, made with the classes the marks file was made with */
  marks: LayoutMarks
  /** a PDF.js document of the base page: our compile's final pass (layout/paper.mjs markedOfPaper `base`), whose coordinates the
   *  file holds; the caller opens and destroys it */
  arxiv: unknown
  OPS: Record<string, number>
  paper: { id: string; version: number }
  left: string
  pdfjs: string
  /** the base page's text as layout/arxiv.mjs readArxivText read it from `arxiv` (step T), else read by the maker */
  text?: ArxivText | null
  /** the line check (carry.mjs lineCheckOf of the base page's own tokens, `text`'s, over arXiv's). A unit is laid only where
   *  every page it is on is drawable (`undrawable`; `stats.units.undrawn` the others), the file refused ('carry') where none is;
   *  its line counts information (`stats.lines`, each page's in `lines` and `pageLines()`); none: no line checked, every unit
   *  placed laid */
  lineCheck?: import('./carry.mjs').LineCheck | null
  /** anchors.mjs floatMatches of `text`'s tokens and the units' texts, else searched by the maker */
  floatMatch?: Map<number, number[] | null> | null
  /** the pages' frame's rule the maker's anchors are placed under, given (a whole run's); else the rule set's: frameOfTokens
   *  (rule 1), or pageFrame (rules.frame 'units', the whole run's) for the whole paper alone: the page stream (makerOf's stream, byStream) needs one, the
   *  whole document's, given or rule 1's (a TypeError without) */
  frame?: FrameRule | null
  /** the page stream's rules (RULES), DEFAULT_RULES' each where not given: the maker reads `frame`, `edges` and `floatSearch` */
  rules?: Partial<PageStreamRules> | null
  /** the indices of the units written inside a float (the source parse's), for rules.floatSearch 'forward' */
  inFloat?: readonly number[] | null
  /** the units in the order TeX sets them (openPaper's `texOrder`), which the anchoring reads as the text's; null: their own */
  texOrder?: readonly number[] | null
  /** the columns' text edges the names, the displays' numbers and the centred flag read (`page|column`,
   *  `twoCols|parity|column`, `twoCols|column` to [x0, x1]), given; else made of the placed units' body lines (rules.edges') */
  columnEdges?: ReadonlyMap<string, [number, number]> | null
  /** the rules near the table cells as well (`cellRules` in the result), of the ink the maker reads: each page's operator list read once */
  cellRules?: boolean
  /** the file is cut into parts (layer-proto/cut.mjs partCutter), which hold the bounds a part holds and the carry's share per
   *  part: made whatever share is carried, checked without those bounds; `lines` in the result */
  parts?: boolean
  /** each page's draw geometry as well (pipeline/draw-data.mjs), read with the page's operator list (its text `text.draw`'s, step T's,
   *  where read with it), held for `drawJsonOf` / `drawOf` */
  draw?: boolean
  /** the most encoded text of draws held at once (default DRAW_HELD_MAX; tests lower it): a page past it has none */
  drawHeldMax?: number
}
export interface LayoutStats {
  lines: { carried: number; total: number; held: number }
  /** `unplaced`: the units the text would place whose own marks stand on no page with ink, or not on their words (they stay
   *  the original's) */
  /** `undrawn`: the units placed on a page that is not drawable (the line check's), left the original's */
  units: { located: number; total: number; byKind: Record<string, [located: number, total: number]>; unplaced: number; undrawn: number }
  /** `marked`: the placeholders of the located units the marked original marks (an opening mark at least), by kind
   *  found among them; `unmarked`: those it gives no mark (LOST, beside them); `symbols`: the text symbols it gives no
   *  mark drawn as their character (PH_FLAG.TEXT, beside them); `inferred`: those found whose end is
   *  inferred, having no closing mark; `why`: the LOST among them by cause; `textTaken`: glyphs a placeholder took that are
   *  letters of the unit's own words as the anchor paired them (running text), to be none. The bars of the own ink:
   *  `owned` and `matched`, the glyphs and rules of the found pieces in the marks file and on the base page, `unmatched`
   *  their difference, and `twice`, the page's glyphs owned by two found pieces, each to be none (ownedOn takes each once
   *  and finds all or none); `foreign`, the page's glyphs half inside a found inline piece's segments (its crop) by their own ink
   *  that are not its own, and `shared`, those inside two found pieces' segments, each to be none; `texts`, the page
   *  texts written (the TEXT symbols' too); `heads`, the unmarked pieces before a unit's start mark or after its end mark
   *  (besideMarks) found by the text the probe showed them set, and EMPTY, having set nothing on the line beside the mark;
   *  `joined`, the later displays of a display group (PH_FLAG.JOINED, their ink the group's first display's); `outside`,
   *  the LOST pieces outside the unit's lines (PH_FLAG.OUTSIDE: before its start mark, a display after its end mark) */
  ph: { marked: number; found: number; empty: number; lost: number; joined: number; outside: number; byKind: Record<string, [found: number, marked: number]>; unmarked: number; symbols: number; inferred: number; why: Record<string, number>; textTaken: number; owned: number; matched: number; unmatched: number; twice: number; foreign: number; shared: number; texts: number; heads: [found: number, empty: number] }
  /** babel's names: the occurrences the marked original marks, those the file locates (and of them those leading a unit:
   *  RUN_IN), and why each other is not */
  names: { marked: number; located: number; runIn: number; why: Record<string, number> }
  /** the colour pieces of the units the file holds, and those whose run's fill TeX wrote (the file's `colours` rows) */
  colours: { pieces: number; evaluated: number }
  /** by the unit's kind: the units with a label, of the located units whose start mark was carried to their first line */
  labels: Record<string, [found: number, units: number]>
  frames: { units: number; split: number; lineCountChecked: number; lineCountEqual: number }
  /** |baseline − TeX's start or end mark|, pt */
  baselines: { first: number[]; last: number[] }
  /** pages past OPS_CAP, STEPS_MAX, GLYPHS_PAGE or BOXES_CAP, or drawing in a state lost past STACK_MAX (ink.mjs): no ink */
  capped: number[]
  /** pages whose operator list did not come within OPS_MS, or failed: no ink, each page alone */
  timedOut: number[]
  /** pages whose ink's walk passed its backstop, INK_MS (ink.mjs): no ink; the one count that depends on the machine */
  inkTimedOut: number[]
  /** pages past BOXES_PAGE boxes (ink.mjs), and in no list above: their ink kept, the boxes past it merged by cell */
  degraded: number[]
  bytes: { raw: number; gzip: number }
  ms: { text: number; ops: number; carry: number; anchor: number; rows: number }
  /** the marked original read a page at a time (the page stream): pieces found after their unit's own ink was taken (dropped),
   *  points read twice after their unit's placeholders were matched; none where it is read whole */
  late: { rows: number; vetoes: number }
  /** rule 3 (rules.edges 'earlier'): the pages and columns whose columns' edges are a later page's (a page before any of its
   *  kind with a body line takes the pools as they stand with the first that gives some): [page, column, that page] */
  edgesAhead: [page: number, column: number, from: number][]
  /** why the file was refused, where it was ('bounds': the parser's refusal) */
  refusal?: { path: string; why: string }
}
/** a paper's layout file, or why none is made */
export declare function makeLayout(o: MakeInput): Promise<{ file: LayoutFile; stats: LayoutStats; cellRules?: Map<number, number[]> | null; rulesFailed?: string; lines?: ReadonlyMap<number, readonly [carried: number, total: number]> } | { refused: 'carry' | 'pages' | 'bounds'; stats: LayoutStats }>
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
    /** the marks as they stand (whole()'s first step) */
    carrying(): void
    /** whether the draws are read (the `draw` option): the head of the layer made says so */
    draw: boolean
    /** page p's draw geometry (the `draw` option), once: the held text is let go with it; null for none (not read, failed, a font a host
     *  would read differently, past the held budget) */
    drawOf(p: number): import('../layer-proto/draw.mjs').Draw | null
    /** drawOf's draw as its JSON (wireText's: what the left part holds, format.mjs writeLeftPart `drawText`), once */
    drawJsonOf(p: number): string | null
    /** the draw reads: pages kept, pages with none and by why, the encoded bytes, the ms */
    drawStats: { pages: number; none: number; why: Record<string, number>; bytes: number; ms: number; /** the draws' fills: the items and glyphs read, the items told one fill, those told in runs (layout/fills.mjs) */ fills: { items: number; glyphs: number; told: number; runs: number } }
    /** each page's lines [in place, total], the line check's (none where none is given): information */
    pageLines(): ReadonlyMap<number, readonly [carried: number, total: number]>
    /** the maker a page at a time (after carrying(), the columns' edges and the whole document's frame rule given); with `marked` (markedPages' head, the marks
     *  marksOfHead's), the marked original's pages given a page at a time too (`markedPage`, `markedEnd`), carrying() not run */
    stream(o?: { marked?: MarkedHead | null }): MakerStream
    /** carrying() (or the marked original's pages beside arXiv's, `marked`: its head and the events after it), then stream()
     *  over every page read here, finished; or the line check's refusal ('carry': no unit laid, none in place) */
    byStream(marked?: { head: MarkedHead; events: AsyncIterable<MarkedEvent> } | null): Promise<MakerStream | { refused: 'carry'; stats: LayoutStats }>
  }
>
/** the maker a page at a time: `pageRead(p)` after each page read in order, `finish()` after the last */
export interface MakerStream {
  pageRead(p: number): void
  /** the marked original's page (markedPages' page event's), pages in order; its end after its last */
  markedPage(page: MarkedPage): void
  markedEnd(end: Extract<MarkedEvent, { end: unknown }>['end']): void
  /** the line check's refusal ('carry': no unit laid), once finished; null before */
  carryRefusal(): 'carry' | null
  /** the units the file holds so far */
  laid(): number
  finish(): void
  /** each page's cell rules, made as the page is let go (null without `cellRules`) */
  cellRules: Map<number, number[]> | null
  rulesFailed(): string | null
  /** the file's rows of the units settled (those of `ids`, every unit settled where none is given), as the whole file's parse
   *  holds them, why each of them it does not lay is the original's (`unlaid`), and the names taken in */
  layout(ids?: number[]): Pick<LayoutFile, 'fonts' | 'units' | 'lines' | 'frames' | 'erase' | 'ph' | 'labels' | 'headings' | 'pageText' | 'held' | 'names'> & LayoutFile
  /** the pages from 1 let go */
  released(): number
  /** whether unit i's rows are made, or it has none */
  settled(i: number): boolean
  progress(): { read: number; marked?: number; anchored: number; decided: number; released: number; held: number; glyphs: number }
  trace?: { read: number; marked?: number; anchored: number; decided: number; released: number; held: number; glyphs: number }[]
}
/** the page stream's rules, each rule's values the whole run's first: the pages' frame ('units' | 'tokens', rule 1), the columns'
 *  text edges a page without its own takes ('all' | 'earlier', rule 3), the left side's far-push columns ('units' | 'tokens',
 *  rule 4: the page pass's), a float's whole-document search ('whole' | 'forward': from its last body neighbour's page, rule 5) */
export interface PageStreamRules { frame: 'units' | 'tokens'; edges: 'all' | 'earlier'; columns: 'units' | 'tokens'; floatSearch: 'whole' | 'forward' }
export declare const RULES: { readonly [K in keyof PageStreamRules]: readonly PageStreamRules[K][] }
/** the rules where none is given: rules 1, 3 and 4 (frame 'tokens', edges 'earlier', columns 'tokens'), rule 5 off */
export declare const DEFAULT_RULES: Readonly<PageStreamRules>
/** the whole run's rules, each reading the whole document (next's before the page stream): the lab's comparisons with it */
export declare const WHOLE_RULES: Readonly<PageStreamRules>
/** a rule set checked, each rule DEFAULT_RULES' where it is not given; a TypeError for a rule or a value that is none */
export declare function rulesOf(rules?: Partial<PageStreamRules> | null): PageStreamRules
/** a page's operator list waited for at most, ms */
export declare const OPS_MS: number
/** a font's PostScript name as the file holds it: 1 to 128 printable ASCII characters */
export declare function fontName(name: unknown): string
