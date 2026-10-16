// run.mjs's types: the layer v0's driver, the prototype's page (main.js, ported at 9e56fca)
import type { Audit, CheckResult } from './check.mjs'
import type { Rect } from './layer1.mjs'
import type { Block2, Char, DrawOp, DrawSource, Layout, Params, Prepared, Token, Unit as LaidUnit } from './layer2.mjs'
import type { LayoutIndex, LayoutUnit } from '../layout/file.mjs'
import type { TexLines, Whole } from './tex.mjs'
import type { RemovalManifest } from '../layout/remove.mjs'
import type { FaceSources } from './fonts.mjs'
import type { FrozenRuleSet, RULES_SCHEMA } from '../rules/layout.mjs'
import type { ReadPart } from './format.mjs'
import type { OpenWords, PageWords } from './words.mjs'
import type { LayerStats, LinkRecord } from './reader.mjs'

/** a unit as the units record holds it (a row): its kind, source and state; its translation's pieces, none where it has
 *  none, each non-text one with its k (the layout file's index of its source piece: E6's row); its title, its table's
 *  consistency group */
export interface Unit { kind: string; src: string; pieces?: { t: string; s?: string; src?: string; k?: number }[]; state: string; title?: boolean; group?: string }
/** which floats the final names in the target's language (live.mjs captionsOf) */
export type { Captions } from '../layout/names.mjs'
import type { Captions } from '../layout/names.mjs'
/** the made output's geometry (schema 1): the pages' views, each unit's [id, stream, rects] on the original, its kind */
export interface Geometry { schema: number; kinds: string[]; left: { pages: number[][]; units: [number, number, Rect[]][] }; right?: unknown }
/** a unit v0 places: its rectangles (all of them: a unit cut by the pages shown is laid over its lines past them too), the
 *  pages shown it has lines on (`cut`: it has more past them), and once laid its reading, tokens, blocks and layout, until
 *  a run that frees (`free`) lets them go once it is painted for good (`full` gives it as laid on the gate's shelf) */
export interface Placed { id: number; stream: number; rects: Rect[]; unit: LaidUnit; pages: number[]; cut: boolean; blocks?: Block2[]; prep?: Prepared; tokens?: Token[]; layout?: Layout; s?: number; rec?: Rec; local?: Char[][]; refused?: boolean; why?: string; missing?: number[]; tex?: (Whole & { lu: LayoutUnit; lines?: TexLines }) | null }
/** the hybrid's options (openProto `tex`): the layout file, the units file's pieces by unit id, and how the file's
 *  geometry is taken */
export interface HybridOptions {
  index: LayoutIndex
  pieces: Map<number, unknown[]>
  /** 'ph': each placeholder's ink alone; 'lines': the unit's lines and label too */
  use: 'ph' | 'lines'
  /** with 'lines': the units the file locates whole that v0's geometry does not hold, but table cells */
  texOnly?: boolean
  /** locatedWhole's: 'text' (the default) asks no symbol drawn as text to be found; 'strict' asks it too */
  symbols?: 'text' | 'strict'
  /** with 'lines': each line's erase extent from its characters (v0's, the default) or the file's erase rectangles */
  extents?: 'v0' | 'tex'
}
/** which source each placed unit's geometry is (ids), and why the others are v0's (by locatedWhole's why) */
export interface Sources { tex: number[]; v0: number[]; why: Record<string, number>; texOnly?: number }
/** a page's fill numbers (adaptiveFill's pass, fillPage's answer): the median fill leading of the units begun on it (`own`),
 *  that of every body unit drawn on it (`anchor`), the target (`own` held within the band of `anchor`; null where only a
 *  continuation tells), whether its body units told its own */
export interface PageFill { own: number | null; anchor: number | null; target: number | null; body: boolean }
/** a page's record (the 1b design §1), kept for the run's life: its SVG at `w` × `h` CSS px as markup (the strings its names
 *  and units are set in, in turn: svgOf makes the element of them anew at each ask), its drawing as data (every painted
 *  unit's operations in turn: drawCopy draws them at any resolution), its view, its words (the page's word table, words.mjs:
 *  built as each unit is painted in `wordsOpen`, frozen into `words` once the page is final: null before) and its links (the
 *  engine's 3a: null until then), its fill numbers (null where no pass told them). Beside it the page's canvases at v0's own resolution
 *  (the original, its copy where `copy` keeps one): where `copy` keeps none, the original is let go as soon as the page is
 *  drawn and its ink read, `left` null from then on. `base`: the page is drawn and its canvases held, which v0's own copy cuts
 *  its crops and restores from, until the page is released (whether a crop is drawn at all is the page's own: it was read
 *  and did not fail) */
export interface Row {
  page: number; w: number; h: number; view?: number[]; markup: string[]; ops: DrawOp[]; words: PageWords | null; wordsOpen: OpenWords | null; links: LinkRecord[] | null; linksOpen: { rec: LinkRecord; stream?: number; id?: number; seq?: number; sources?: unknown }[] | null; fill: PageFill | null
  left: HTMLCanvasElement | null; right: HTMLCanvasElement | null; base: boolean; released?: boolean
}
/** what a run holds of a page (held(page)): its analysis state by name, the units on it still holding their own state, and the
 *  units still to be laid that read it */
export interface PageHeld { state: ('chars' | 'ink' | 'items' | 'accounted' | 'kept' | 'laid' | 'canvas' | 'removed')[]; units: number[]; reads: number }
/** a laid unit's record, as main.js kept it (each line: page, baseline, target baseline, exact, mode, overflow, x0, x1) */
export interface Rec {
  id: number; kind: string; v: 2; pages: number[]; cut: boolean; s?: number; f?: number; fitScale: number; knob: string; clipped: boolean
  lostChars: number; chars: number; lead: number; lines: (number | string | boolean | null)[][]; match?: { match: number; total: number; base?: boolean }
  sizeRatio?: number; modes: Record<string, number>
  /** the lines TeX's rule opened, and those it would have where the paper has no values for it (layer2.mjs Layout) */
  opened?: number; unopened?: number
  [more: string]: unknown
}
export declare const PDF_OPTIONS: { cMapPacked: true; enableHWA: true; disableStream: true; fontExtraProperties: true }
/** the most of its own work v0 runs in one task, ms: units are laid back to back under it, then it yields */
export declare const SLICE_MS: number
/** a slicer over a clock: `due()`, whether the work since its last yield has reached `budget` (SLICE_MS); `give()`, a yield
 *  (scheduler.yield, else a macrotask), the clock started again after it */
export declare function slicer(o?: { now?: () => number; budget?: number; give?: () => Promise<unknown> }): { due(): boolean; give(): Promise<void> }
/** main.js's lay order, by the page whose drawing lays each unit: [page, ids] */
export declare function layGroups(placed: readonly { id: number; pages: readonly number[] }[], batch?: number): [number, number[]][]
export declare const layOrder: (placed: readonly { id: number; pages: readonly number[] }[], batch?: number) => number[]
/** a unit's layout made final: a CJK cell's lines moved into their bands between the rules at the size it is drawn at */
export declare function settleLayout(p: { clear?: { bands: Map<number, import('./layer2.mjs').CellBand[]> } | null; layout: { lines?: { block: number; baseline: number }[]; scale?: number }; s: number }): void
/** a page's fill target (pageTarget's answer, fillPage's too): see PageFill */
export type Filled = PageFill
/** a page's fill target as a pure function of its page: the units that begin on it and those running on to it (each with its fit's `fillLead` and `fitLines`), and the band. Null where nothing tells a fill leading */
export declare function pageTarget(units: readonly unknown[], continuing: readonly unknown[], band: number): Filled | null
/** the page fill (adaptiveFill) over the units that begin on a page (`continuing`: the page's units begun before it, read for the anchor alone): each spread over its frame at its fitted state, the page's target held within the band of its own page's anchor (pageTarget), the page's body grown at one size where it grows, each filled unit laid anew in place and settled, then onFilled; null where nothing tells */
export declare function fillPage(units: unknown[], P: Params & { adaptiveFill: { band: number; track: number; size: number } }, onFilled?: (p: Placed, target: number) => void, o?: { continuing?: unknown[] }): Filled | null
/** the leftover packed (P.leftover 'pack'): a page's body units of one block moved up to keep the original's gap to the one above, the moves by id (PDF units up). `rects`: every unit's rectangles on the page, [id, [page, x0, y0, x1, y1]]; `chars`: the page's characters */
export declare function packPage(page: number, units: unknown[], rects: readonly [number, readonly number[]][], chars: readonly { ch: string; x0: number; x1: number; yb: number; size: number }[], stays?: ((x0: number, x1: number, y0: number, y1: number) => number | null) | null, gap?: number): Map<number, number>
/** the ink of a page that stays visible: its ink map less the glyphs the drawing takes away, and the add-on's dirty boxes; foot(x0, x1, y0, y1) gives the PDF y of the lowest such ink's foot in a box, or null */
export declare function stayingInk(o: { map: { w: number; h: number; ink: Uint8Array; factor: number }; toDev: (x: number, y: number) => number[]; toPdf: (x: number, y: number) => number[]; accounted?: readonly number[][]; dirty?: readonly number[][] }): (x0: number, x1: number, y0: number, y1: number) => number | null
/** a babel name of a page laid (D1a) */
export interface NameDrawn {
  occurrence: number; key: string; page: number; drawn: boolean; why: string | null; chars: (Char & { page: number })[]
  /** the original's line box (the layout file's) */
  box: { x0: number; x1: number; baseline: number; top: number; bottom: number; size: number }
  /** where drawn: its word, size, left edge and width (unfit: its word, its width at the original's size and the room) */
  text?: string; size?: number; x?: number; w?: number; room?: number
  /** the unit it leads (the file's RUN_IN): set as the start of that unit's first line, drawn with it (`inline: <why>`
   *  where the unit is left the original's) */
  unit?: number
}
export interface ProtoRun {
  N: number
  P: Params
  /** the layout rule set the run was opened with (rules/layout.mjs): its schema and version */
  readonly rules: { schema: typeof RULES_SCHEMA; version: number }
  /** each page's row (under parts, null at runtime for a page whose view no part has told yet: none is drawn there) */
  rows: Row[]
  placed: Placed[]
  /** the units left the original's and why: `unanchored`, `author`, `unfit`, `group: …`, and, in the role table's faces, `served`
   *  (a character in no served slice of its runs' faces and their fallbacks, or a run's own face not served: `missing`, the
   *  first code points) and `face` (a table or a slice that failed) */
  skipped: { id: number; kind: string; why: string; chars: number; pages?: number[]; missing?: number[] }[]
  /** each laid unit's record (with `records`; empty without) */
  stats: Rec[]
  /** the records that could not be made (with `records`), by unit: its drawing is the same, the record the error alone */
  recordErrors: { id: number; error: string }[]
  /** the drawing's audit (with `records`; empty without) */
  audit: Audit[]
  /** the units laid and drawn, recorded or not */
  readonly drawn: number
  order: number[]
  ms: Map<number, number>
  pageMs: number[]
  /** each page's costs, ms: its original drawn, its text read, the removal's ink reading and plan, its removed and
   *  placeholders' pages drawn, its units laid (less the faces they waited for, `fonts`), their operations made, drawn on the
   *  copy and set as SVG */
  pageTimes: { render: number; text: number; ink: number; rp: number; lay: number; fonts: number; ops: number; compose: number; svg: number; words: number; links: number }[]
  /** the deterministic work counters of each page (work.mjs): integer counts, the same for the same input */
  pageWork: (import('./work.mjs').Work | undefined)[]
  workTotal(): import('./work.mjs').Work
  /** each page's characters (with `free` and `records`, the shelf's: every page's, let go or not) */
  chars: (Char[] | undefined)[]
  views: { convertToViewportPoint(x: number, y: number): number[]; convertToPdfPoint(x: number, y: number): number[] }[]
  /** babel's names of the pages laid (D1a, the layout file's `names`): drawn in the target's word, or why not (`no word`,
   *  `source`, `same`, `unread`, `unfit`, `served`, `face`); a drawn one's characters, text, size and left edge */
  names: NameDrawn[]
  readonly designs: { serif: string; sans: string; mono: string }
  /** the hybrid's: each placed unit's source (empty lists where `tex` is null) */
  readonly sources: Sources
  /** `page` once it is ready, Infinity before (the lab's and the gate's) */
  doneAt(page: number): number
  /** every page up to `page` ready or failed: each page's closure laid in turn from page 1 (the gate's in-order run), in slices
   *  of SLICE_MS, once what it reads has come; `still`, read between pages and units and at each wait, false ends it there (a page
   *  under way is finished first) */
  until(page: number, still?: () => boolean): Promise<void>
  /** page `page`'s closure laid (Need(p), the 1b-D design §2.1): page 1 drawn first, then its pages, its rows decided, and once
   *  its parts and rows are in its units in their rank, back to back in slices of SLICE_MS; it ends once the page is ready or failed, or
   *  `still` is false (what is done stays done). One closure at a time, as until's */
  layFor(page: number, still?: () => boolean): Promise<void>
  /** the page's closure over K so far (need.mjs closureOf; the prefix needsOf lays, where the rules lay in order) */
  closure(page: number): import('./need.mjs').Closure
  /** whether the page is ready: drawn and laid, final within the run */
  ready(page: number): boolean
  /** the ids of the units whose rows laying the page still waits for (its closure's over K so far), in id order */
  rowsFor(page: number): number[]
  /** the unit ids of K's entries (a closure's `lay` or `rows`, K indices), in their order */
  idsOf(entries: readonly number[]): number[]
  /** parts: the next part, read by readPart against the chain (its layout merged into the hybrid's index before: facade.mjs) */
  grow(part: ReadPart): void
  /** parts: no more parts; every page past the last covered fails as it is reached */
  endParts(): void
  /** parts: the newest composed document, read from now on; the one it replaces told to `onRetired` once no read holds it */
  swap(doc: { numPages: number; getPage(n: number): Promise<unknown> }): void
  /** the last page a part covers (every page, a whole open) */
  readonly through: number
  readonly partsEnded: boolean
  /** the last page up to which every page is ready or failed */
  readonly drawnTo: number
  /** whether laying the page waits for nothing more to come, neither a part nor a row: its closure's bound covered (or the
   *  parts ended) and every entry it decides in and settleable */
  inputs(page: number): boolean
  /** whether the page failed: its drawing threw, or no part covers it and the parts have ended */
  failed(page: number): boolean
  /** a wait under way looks again at what it waits for */
  poke(): void
  /** units as they arrive (id → row): a row wins over one taken before it until its unit is placed; the hybrid's pieces
   *  read from each translated row's pieces' k; a row no unit of this paper's (not a unit's shape, its kind not the
   *  layout file's or the geometry's, its group not the open's `groups`, a k past its source's pieces) left the
   *  original's, in `skipped`. The pages newly complete (inputs: each by its own closure, out of the stream's order): those not
   *  reported complete before */
  take(rows: ReadonlyMap<number, Unit>): { complete: number[] }
  /** no more units: every page is complete with what it holds */
  end(): void
  /** inputs(page): laying the page waits for no take and no part */
  complete(page: number): boolean
  /** every id taken whose row could no longer change the drawing, and changed nothing: its unit placed already (its
   *  page perhaps not laid yet), its row fixed by a table group read, taken after end(), or never expected. Never a
   *  page to draw again: no laid page changes */
  late(): number[]
  /** a done page's copy at `k` device pixels a PDF unit onto `ctx`, from `source`, the page as PDF.js drew it at k */
  drawCopy(page: number, ctx: CanvasRenderingContext2D, source: DrawSource, k: number): Promise<void>
  /** page `page`'s SVG, a new element each call, made of its record's markup (class, size and spacing as the page's own): a
   *  parse alone, no layout, face, ink or PDF.js call, 0.3 to 8.6 ms (420 to 12,000 elements) */
  svgOf(page: number): SVGSVGElement
  /** the page's word table, a new record on every ask (words.mjs; the 1b design §4), frozen at the first ask if the page is not already; a RangeError for a page that is not final (ready) */
  wordsOf(page: number): PageWords
  /** the page's links, a new copy on every ask (links.mjs; the 3a design), frozen at the first ask if the page is not already; a RangeError for a page that is not final (ready) */
  linksOf(page: number): LinkRecord[]
  /** the counts of the links read and frozen so far (LayerStats.links), a copy */
  readonly linkStats: LayerStats['links']
  /** with `records` (the gate's): each record of the page's source annotations and the tier that made it, in the records' order; absent without */
  linkSources?(page: number): { annots: [number, number][]; tier: string }[]
  /** what the run lets go (`free`), keeps of its units' records and audit (`records`), and keeps on the gate's shelf */
  held(): { free: boolean; records: boolean; shelf: boolean }
  /** what the run holds of a page */
  held(page: number): PageHeld
  /** a placed unit as it was laid: the shelf's where the run let it go (`free` and `records`), else the unit itself */
  full(p: Placed): Placed
  /** a done page's canvases let go (a copy's, the gate's): no unit paints it again, and no crop is cut from it */
  release(page: number): void
  checkPage(page: number): CheckResult
  check(): CheckResult
  /** how the removal went */
  removalStats(): RemovalStats | null
  /** a done page's removed page at v0's own resolution (mode 'draw', with v0's copy), until it is released */
  removedCanvas(page: number): HTMLCanvasElement | null
  /** the run let go: its sheet removed, every page's canvases released (a page under way, once it ends), nothing drawn
   *  or laid after; an until under way resolves */
  dispose(): void
}
/** how the text-removed PDF went: pages removed, pages drawn the old way, units drawn by it (tex: the layout file's
 *  rectangles) and the old way (v0: its own reading), the rectangles filled with paper and swapped from the removed page,
 *  the characters erased the file gives no rectangle for, the pages a swap drew the removed page for */
export interface RemovalStats {
  pages: number; refused: number; units: number; tex: number; v0: number; fills: number; swaps: number; swapPages: number; extra: number
  byPage: Record<number, { units: number; tex: number; v0: number }>
  /** the time it took, ms in all: the removed pages drawn, the rectangles worked out */
  ms: { render: number; rects: number }
}
/** the text-removed PDF (removal.mjs, layout/remove.mjs) */
export interface RemovalOptions {
  /** PDF.js's OPS: read by no drawing (the gate's instrument reads a page's ink with it) */
  OPS?: Record<string, number>
  /** 'draw': drawn by the add-on */
  mode: 'draw'
  /** arXiv's PDF with the paper's add-on (it may be openProto's `doc` itself, one document), its manifest (arXiv's page
   *  count, each page's state and the kept ink under its units' rectangles) */
  doc: { getPage(n: number): Promise<unknown> }
  manifest: RemovalManifest
}
export declare function openProto(o: {
  doc: { numPages: number; getPage(n: number): Promise<unknown> }
  geometry: Geometry
  /** the units by id; sparse where `expect` names units still to come (take) */
  units: readonly (Unit | undefined)[]
  /** the ids of the units the run will report, taken as they arrive; null (the default): every unit is in `units` */
  expect?: readonly number[] | null
  /** each unit's table group (groups.mjs groupOf), known at open: a group is read once its own cells' rows are in, and a
   *  row whose group is another is no unit of this paper's; null (the default): a group waits for every row */
  groups?: ReadonlyMap<number, string> | null
  target: string
  /** the last page drawn at most (default 999). The run shows N, the least of it, the document's pages and the
   *  manifest's, and the proof's `shown` is N: a piece whose segments all lie past it is drawn as its page text or as
   *  nothing, for good, so a reader passes the paper's pages or none, never how far the parts received so far reach
   *  (BUNDLE 4's PartChain.reach, which grows as parts are added) */
  pages?: number
  scale?: number
  dpr?: number
  batch?: number
  phMode?: 'auto' | 'source'
  restoring?: boolean
  order?: number[] | null
  faces?: 'roles' | 'prototype'
  /** what the host serves of each role table face, asynchronously: its slices (each { url, ranges }), null where it is not
   *  served. A face is asked the first time a unit needs it and awaited; a unit with a character in no served slice of its
   *  runs' faces and their fallbacks is left the original's (`served`), one whose slice fails to load too (`face`). Absent:
   *  each face's whole file at `faceUrl(file)`, covering its COVERAGE. With faces 'roles' only */
  faceSources?: FaceSources | null
  faceUrl?: (file: string) => string
  fontUrl?: (file: string) => string
  hyphUrl?: (lang: string) => string
  /** whether each page's copy is kept at v0's own resolution (the checker's and the gate's plane); default true */
  copy?: boolean
  /** the hybrid (tex.mjs): null, v0 alone */
  tex?: HybridOptions | null
  /** with `tex` null, every unit still drawn under the proof, which nothing proves but TeX's own nothing, a space and a
   *  text symbol (a reader's paper with no layout file: reader.mjs); default false, v0 alone with no proof (the lab's) */
  proof?: boolean
  /** the text-removed PDF: null, v0's own drawing */
  removal?: RemovalOptions | null
  /** which floats the final names in the target's language (live.mjs captionsOf): a float's label is drawn in the target's
   *  name for it, which the rule set gives, where the final's is, and every babel name in the target's word whatever the
   *  captions say; null, every label and name kept as the original's */
  labels?: { captions: Captions | null } | null
  /** the layout rule set every choice made for the target is read from, resolved once at the open (absent: BUILTIN_RULES) */
  rules?: FrozenRuleSet
  /** the paper in parts (grow, endParts): no view and no left unit given, `groups`, `tex` and `removal` ('draw') required */
  parts?: boolean
  /** a document the run read and no longer reads (a swap, dispose), told once */
  onRetired?: ((doc: unknown) => void) | null
  /** a page is ready (or failed), told once */
  onStep?: ((page: number) => void) | null
  /** the run waits: for a part, or for rows (an instrument) */
  onWait?: ((what: 'part' | 'rows') => void) | null
  /** the memory contract (the reader's): a page's analysis state let go once the page is done and no unit still to be laid
   *  reads it, a unit's own state once it is painted for good; default false, every state kept */
  free?: boolean
  /** each laid unit's record (`stats`) and the drawing's audit kept, the gate's (default true); without, their count alone */
  records?: boolean
}): Promise<ProtoRun>
