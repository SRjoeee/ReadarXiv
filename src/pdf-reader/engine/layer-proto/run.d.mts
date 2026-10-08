// run.mjs's types: the layer v0's driver, the prototype's page (main.js, ported at 9e56fca)
import type { Audit, CheckResult } from './check.mjs'
import type { Rect } from './layer1.mjs'
import type { Block2, Char, DrawOp, DrawSource, Layout, Params, Prepared, Token, Unit as LaidUnit } from './layer2.mjs'
import type { LayoutIndex, LayoutUnit } from '../layout/file.mjs'
import type { TexLines, Whole } from './tex.mjs'
import type { RemovalManifest } from '../layout/remove.mjs'
import type { FaceSources } from './fonts.mjs'
import type { FrozenRuleSet, RULES_SCHEMA } from '../rules/layout.mjs'

/** a unit as the units record holds it (a row): its kind, source and state; its translation's pieces, none where it has
 *  none, each non-text one with its k (the layout file's index of its source piece: E6's row); its title, its table's
 *  consistency group */
export interface Unit { kind: string; src: string; pieces?: { t: string; s?: string; src?: string; k?: number }[]; state: string; title?: boolean; group?: string }
/** which floats the final names in the target's language (live.mjs captionsOf) */
export interface Captions { figure: 'target' | 'source'; table: 'target' | 'source' }
/** the made output's geometry (schema 1): the pages' views, each unit's [id, stream, rects] on the original, its kind */
export interface Geometry { schema: number; kinds: string[]; left: { pages: number[][]; units: [number, number, Rect[]][] }; right?: unknown }
/** a unit v0 places: its rectangles (all of them: a unit cut by the pages shown is laid over its lines past them too), the
 *  pages shown it has lines on (`cut`: it has more past them), and once laid its reading, tokens, blocks and layout */
export interface Placed { id: number; stream: number; rects: Rect[]; unit: LaidUnit; pages: number[]; cut: boolean; blocks: Block2[]; prep?: Prepared; tokens?: Token[]; layout?: Layout; s?: number; rec?: Rec; local?: Char[][]; refused?: boolean; why?: string; missing?: number[]; tex?: (Whole & { lu: LayoutUnit; lines?: TexLines }) | null }
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
/** a page's canvases at v0's own resolution (the original, its copy where `copy` keeps one), its SVG at `w` × `h` CSS px,
 *  and its drawing as data (every painted unit's operations in turn: drawCopy draws them at any resolution) */
export interface Row { page: number; left: HTMLCanvasElement; right: HTMLCanvasElement | null; svg: SVGSVGElement; w: number; h: number; base: boolean; ops: DrawOp[]; view?: number[]; released?: boolean }
/** a laid unit's record, as main.js kept it (each line: page, baseline, target baseline, exact, mode, overflow, x0, x1) */
export interface Rec {
  id: number; kind: string; v: 2; pages: number[]; cut: boolean; s?: number; f?: number; fitScale: number; knob: string; clipped: boolean
  lostChars: number; chars: number; lead: number; lines: (number | string | boolean | null)[][]; match?: { match: number; total: number; base?: boolean }
  sizeRatio?: number; modes: Record<string, number>; [more: string]: unknown
}
export declare const PDF_OPTIONS: { cMapPacked: true; enableHWA: true; disableStream: true }
/** main.js's lay order, by the page whose drawing lays each unit: [page, ids] */
export declare function layGroups(placed: readonly { id: number; pages: readonly number[] }[], batch?: number): [number, number[]][]
export declare const layOrder: (placed: readonly { id: number; pages: readonly number[] }[], batch?: number) => number[]
/** a unit's layout made final: a CJK cell's lines moved into their bands between the rules at the size it is drawn at */
export declare function settleLayout(p: { clear?: { bands: Map<number, import('./layer2.mjs').CellBand[]> } | null; layout: { lines?: { block: number; baseline: number }[]; scale?: number }; s: number }): void
/** the targets a page's fill is held to: the last page's, and the fullest page's own (`anchor`, of `lines` body lines) */
export interface Held { last: number; anchor: number; lines: number }
/** a page's fill pass's answer: its target and its own (null where the units begun on it tell none), whether its body told one, and for the anchor every body unit's lines on the page and their fill leadings' median */
export interface Filled { target: number | null; own: number | null; body: boolean; lines: number; anchor: number | null }
/** the page fill (adaptiveFill) over the units that begin on a page (`page`; `continuing`: the page's units begun before it, read for the anchor alone): each spread over its frame at its fitted state, the page's target held within the band of the last page's and of the fullest page's (`held`, null for none), the page's body at one size, each filled unit laid anew in place and settled, then onFilled; null where nothing tells */
export declare function fillPage(units: unknown[], P: Params & { adaptiveFill: { band: number; track: number; size: number } }, held?: Held | null, onFilled?: (p: Placed, target: number) => void, o?: { page?: number | null; continuing?: unknown[] }): Filled | null
/** the targets the next page is held to after a page's pass: its target the last where it told one, the fullest page's the anchor (the earliest of equals) */
export declare function nextHeld(held: Held | null, r: Filled | null): Held | null
/** the leftover packed (P.leftover 'pack'): a page's body units of one block moved up to keep the original's gap to the one above, the moves by id (PDF units up). `rects`: every unit's rectangles on the page, [id, [page, x0, y0, x1, y1]]; `chars`: the page's characters */
export declare function packPage(page: number, units: unknown[], rects: readonly [number, readonly number[]][], chars: readonly { ch: string; x0: number; x1: number; yb: number; size: number }[], stays?: ((x0: number, x1: number, y0: number, y1: number) => number | null) | null, gap?: number): Map<number, number>
/** the ink of a page that stays visible: its ink map less the glyphs the drawing takes away, and the add-on's dirty boxes; foot(x0, x1, y0, y1) gives the PDF y of the lowest such ink's foot in a box, or null */
export declare function stayingInk(o: { map: { w: number; h: number; ink: Uint8Array; factor: number }; toDev: (x: number, y: number) => number[]; toPdf: (x: number, y: number) => number[]; accounted?: readonly number[][]; dirty?: readonly number[][] }): (x0: number, x1: number, y0: number, y1: number) => number | null
export interface ProtoRun {
  N: number
  P: Params
  /** the layout rule set the run was opened with (rules/layout.mjs): its schema and version */
  readonly rules: { schema: typeof RULES_SCHEMA; version: number }
  rows: Row[]
  placed: Placed[]
  /** the units left the original's and why: `unanchored`, `author`, `unfit`, `group: …`, and, in the role table's faces, `served`
   *  (a character in no served slice of its runs' faces and their fallbacks, or a run's own face not served: `missing`, the
   *  first code points) and `face` (a table or a slice that failed) */
  skipped: { id: number; kind: string; why: string; chars: number; pages?: number[]; missing?: number[] }[]
  stats: Rec[]
  audit: Audit[]
  order: number[]
  ms: Map<number, number>
  pageMs: number[]
  /** each page's costs, ms: its original drawn, its text read, the removal's ink reading and plan, its removed and
   *  placeholders' pages drawn, its units laid (less the faces they waited for, `fonts`), their operations made, drawn on the
   *  copy and set as SVG */
  pageTimes: { render: number; text: number; ink: number; rp: number; lay: number; fonts: number; ops: number; compose: number; svg: number }[]
  chars: Char[][]
  views: { convertToViewportPoint(x: number, y: number): number[]; convertToPdfPoint(x: number, y: number): number[] }[]
  readonly designs: { serif: string; sans: string; mono: string }
  /** the hybrid's: each placed unit's source (empty lists where `tex` is null) */
  readonly sources: Sources
  /** the page after whose units page `page` is done; Infinity until the units it reads have come */
  doneAt(page: number): number
  /** every page up to the one that finishes page `page` drawn and its units laid, a unit a task, once they have come */
  until(page: number): Promise<void>
  /** units as they arrive (id → row): a row wins over one taken before it until its unit is placed; the hybrid's pieces
   *  read from each translated row's pieces' k; a row no unit of this paper's (not a unit's shape, its kind not the
   *  layout file's or the geometry's, its group not the open's `groups`, a k past its source's pieces) left the
   *  original's, in `skipped`. The pages newly complete: those not reported complete before */
  take(rows: ReadonlyMap<number, Unit>): { complete: number[] }
  /** no more units: every page is complete with what it holds */
  end(): void
  /** whether every unit laying page `page` reads has come (or end()): until(page) waits for no take. It turns false
   *  again only where a table cell's row is taken again before its group is read */
  complete(page: number): boolean
  /** every id taken whose row could no longer change the drawing, and changed nothing: its unit placed already (its
   *  page perhaps not laid yet), its row fixed by a table group read, taken after end(), or never expected. Never a
   *  page to draw again: no laid page changes */
  late(): number[]
  /** a done page's copy at `k` device pixels a PDF unit onto `ctx`, from `source`, the page as PDF.js drew it at k */
  drawCopy(page: number, ctx: CanvasRenderingContext2D, source: DrawSource, k: number): Promise<void>
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
  /** the text-removed PDF: null, v0's own drawing */
  removal?: RemovalOptions | null
  /** which floats the final names in the target's language (live.mjs captionsOf): a float's label is drawn in the target's
   *  name for it, which the rule set gives, where the final's is; null, every label kept as the original's */
  labels?: { captions: Captions | null } | null
  /** the layout rule set every choice made for the target is read from, resolved once at the open (absent: BUILTIN_RULES) */
  rules?: FrozenRuleSet
}): Promise<ProtoRun>
