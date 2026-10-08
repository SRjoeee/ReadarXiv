// layer2.mjs's types: the layer v0 itself, iterations 2 and 3 (ported from the prototype at 9e56fca). Its values are the
// prototype's own plain objects; what a host or a test reads of them is typed, the rest is left open.
import type { Audit } from './check.mjs'
import type { Face, FontClass, Style } from './fonts.mjs'
import type { Patterns } from './hyph.mjs'
import type { Block, Rect } from './layer1.mjs'

/** the fit's parameters and the breaking's: the layout rules' for a target (rules/layout.mjs resolveRules), the field names
 *  v0's own. `maxScale`, `capScale`, `growTo`, `flowPast`, `refuse` and `_compress` are the run's own, set unit by unit */
export interface Params {
  cjk: boolean; leadBase: number; leadFloor: number; trackMin: number; compressMax: 0 | 1 | 2; borrow: 0 | 1; borrowGap: number
  floor: number; step: number; order: ('track' | 'borrow' | 'lead' | 'shrink')[]; cjkJust: number; spaceMax: number; autospace: number; spaceMin: number
  hyphen: 0 | 1; even: 0 | 1 | 2; maxScale?: number; _compress?: number
  /** the most the unit may be set at: its lines' room between the rules over and under them (cellBands) */
  capScale?: number
  /** step 3: the further steps for a unit the states leave clipped (run.mjs fitFurther), and the size the last goes down to */
  further: readonly ('widen' | 'flow' | 'shrink')[]; floorMin: number; refuse?: number; flowPast?: boolean
  /** step 3: the CJK runs' tracking the fit's first state takes, in em; null: a face's size correction given back (run.mjs) */
  trackStart: number | null
  /** the leading relative to the original's pitch (leadOf; false: leadBase on any pitch); fillBySize's cap (run.mjs
   *  fillSize, off at 0) and the size a unit may grow to (growTo) */
  leadRel: boolean; fillSize: number; growTo?: number
  /** run.mjs's adaptiveFill (D, the default since 2026-10-07; null: B): a loose original's units spread over their
   *  frames, page by page */
  adaptiveFill: { band: number; track: number; size: number } | null
  /** breaking: lines break only at spaces, which quotes are CJK's, centred punctuation, the characters no line starts or
   *  ends with, and the hyphenation patterns of a Latin word */
  keepAll: boolean; cjkQuotes: boolean; centredPunct: boolean; noStart: string; noEnd: string; latinPatterns: 'en' | 'de'
  /** a table cell's room to a rule (PDF units) and the least share of the size it may be capped to between its rules */
  cellClear: number; cellCapMin: number
  /** the shortest word hyphenated, and the fewest letters before and after a break, by language */
  hyphenation: { minWord: number; en: { left: number; right: number }; de: { left: number; right: number } }
}
/** a character of the original page: its box from its item (PDF units), its baseline and size, its item and place in it,
 *  its font's class */
export interface Char { ch: string; x0: number; x1: number; yb: number; size: number; item: number; ix: number; k: number; st: FontClass; ybEff?: number; page?: number; rect?: number[]; sep?: boolean; space?: boolean }
/** a unit of the units file, as the layer reads it */
export interface Unit { kind: string; src: string; pieces: { t: string; s?: string; src?: string }[]; state?: string; title?: boolean; group?: string }
// ---- the per-unit reading (prepareUnit): the contract the rest of v0 reads
//
// A line's key is `page|x0,y0,x1,y1` of its rectangle (rectKey); a page character's is `page|item|k` (charKey). The
// rest of v0 reads a Prepared and nothing else of how it was made: blocks2 (lineInfo, keep, regionOf, referenced), the
// tokens (the resolutions, referenced), the drawing (extents), the restore (uc, cat), the gate's lost ink (uc, cat,
// lineInfo) and the checker (the resolutions, uc, gaps, keep, label, cat). Each field is filled by one part; the four
// parts that read the page's geometry (lines, extents, label, renderings) are v0's heuristics or another source's
// (UnitParts), the rest are the same for every source.

/** a run of the unit's page characters: a gap (what its source does not write: a placeholder's rendering, a label), or a
 *  placeholder's rendering as its source found it. `of`: the gap it was cut from; `box`: where its ink is, where its
 *  source knows it exactly (drawnAs places a crop by it) */
export interface Gap { text: string; chars: Char[]; of?: Gap; unbracketed?: boolean; norm?: string; taken?: boolean; box?: RenderingBox }
/** a rendering's ink as its source knows it: its extent across, the baseline of the line it sits on, its lines */
export interface RenderingBox { x0: number; x1: number; top?: number; bottom?: number; baseline: number; lines: number }
/** a placeholder of the unit by its piece index `k` (placeholdersOf): its source, its class (phClass2), whether it is a
 *  paper's own macro, a nested footnote's mark; a citation's keys */
export interface Placeholder { k: number; src: string; cls: string; unknown?: boolean; nested?: boolean; keys?: string[] }
/** the paper's citations as learnt in lay order (a key's number), an author-year key's text, a macro's rendering */
export type CiteMap = Map<string, string | undefined> & { text?: Map<string, string>; macros?: Map<string, string> }
/** a line's baseline and size: measured from its characters or given exactly (exact; by a layout file, file), else from its rectangle */
export interface LineInfo { baseline: number; size: number; exact: boolean; file?: boolean }
/** a line's erase extent, before the drawing's padding: one box [x0, y0, x1, y1], or several */
export type Extent = number[] | number[][]
/** a placeholder's resolution: how it is drawn ('none', 'symbol', 'kept', 'crop', 'orig-text', 'cite-map', 'source'),
 *  with its placeholder (k, src, cls) and the rendering it took (gap) */
export interface Resolved { mode: string; text?: string; k?: number; src?: string; cls?: string; page?: number; crop?: number[]; baseline?: number; sup?: boolean; math?: boolean; gap?: Gap | null; region?: number; second?: boolean; [more: string]: unknown }
/** prepareUnit's answer: each placeholder's resolution by its piece's index, with the unit's reading of the page */
export interface Prepared extends Map<number, Resolved> {
  /** part 1, frames and lines: the unit's page characters line by line (each with its line, `rect`), a space between
   *  two items or two lines of one rectangle, a separator after each line */
  uc: Char[]
  /** part 1: each line's baseline and size, by its key (and by its key without x0) */
  lineInfo: Map<string, LineInfo>
  /** part 2, erase extents: each line's box (or boxes) to erase, by its rectangle */
  extents: Map<Rect, Extent>
  /** the alignment: the page characters that are the source's words */
  matchedKeys: Set<string>
  /** the alignment: the original's style (the majority of the source's words) */
  orig: { key: string; st: FontClass; size: number; runs: { key: string; n: number }[] } | null
  /** the alignment: where the first source word starts on the first line */
  firstX0?: number
  /** the lines kept as the original's, by key: the alignment's (no source word), part 4's displays, the finish's */
  keep?: string[]
  /** part 3, labels: a label the class sets before the unit's first line, kept as the original's */
  label?: { x1: number; text: string; chars: Char[] }
  /** part 4: the gaps as the renderings left them (the checker's and the categories') */
  gaps?: Gap[]
  /** the finish: each kept line's region (a run of kept lines), and the regions a kept placeholder holds */
  regionOf: Map<string, number>
  referenced: Set<number>
  /** the finish: what became of each of the unit's page characters, by its key */
  cat: Map<string, 'acc' | 'keep' | 'orphan' | 'undrawn'>
  /** the finish: the lines a located display holds */
  displayLines?: Set<string>
}
/** part 1 and part 2 as a source gives them */
export interface UnitLines {
  uc: Char[]; lineInfo: Map<string, LineInfo>; extents: Map<Rect, Extent>
  /** the lines (rectKey) the unit's source does not write, by the source's knowledge: kept as the original's */
  held?: string[]
}
/** what part 4 is given: the unit, its placeholders, its lines' characters, the gaps the labels left, the paper's
 *  citations and each placeholder's plain text and name (`plain`) */
export interface RenderingsContext {
  unit: Unit; phs: Placeholder[]; rects: readonly Rect[]; charsByPage: readonly (readonly Char[] | undefined)[]; citeMap: CiteMap | null
  gaps: Gap[]; uc: Char[]; plain: Map<Placeholder, { t: string; name: string }>; out: Prepared
}
/** part 4's answer: the gaps as it leaves them, and each placeholder's rendering (called once a placeholder, in the
 *  unit's order, for those the rules look for: 'cite', 'num', 'other'), or none found */
export interface Renderings {
  gaps: Gap[]; gapFor(p: Placeholder, cls: 'cite' | 'num' | 'other'): Gap | null | undefined
  /** how a placeholder is drawn where the source knows it without the page (a layout file's macro that sets no ink: none;
   *  its text symbol: the character), else null */
  fixed?(p: Placeholder): { mode: 'none' | 'source'; text: string } | null
}
/** the parts of a unit another source gives in place of v0's; a part not given is v0's */
export interface UnitParts {
  /** part 1 (and part 2's default): the unit's lines and their characters */
  lines?: (rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[]) => UnitLines
  /** part 2: the erase extents, given the lines */
  extents?: (lines: UnitLines, rects: readonly Rect[]) => Map<Rect, Extent>
  /** part 3: sets out.label, returns the gaps without it */
  label?: (out: Prepared, unit: Unit, rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], gaps: Gap[]) => Gap[]
  /** part 4: which ink each placeholder is */
  renderings?: (ctx: RenderingsContext) => Renderings
}
/** a token of a unit's translation */
export interface Token { s?: string; st?: Style; face?: Face; cls?: 'cjk' | 'latin'; w100: number; space?: boolean; crop?: Resolved; sup?: boolean; glue?: boolean; ph?: string; k?: number; hyphenated?: boolean; [more: string]: unknown }
/** a laid line: its slot, and its items at their places */
export interface Line { block: number; page: number; x0: number; x1: number; baseline: number; target: number | null; mode: string; used: number; cap: number; items: { t: Token; x: number; w: number }[]; [more: string]: unknown }
/** layoutUnit2's answer */
export interface Layout { lines: Line[]; f: number; s: number; scale: number; state: { lead: number; scale: number; track: number; trackLatin?: number; compress: number; borrow: number; knob: string }; knob: string; clipped: boolean; lostChars: number; chars: number; tried: number; spilled: boolean; extents?: Map<string, number[]> }
/** the original page's ink at a fraction of its canvas's resolution */
export interface InkMap { w: number; h: number; ink: Uint8Array; factor: number }
/** a unit's block with its lines' measured baselines */
export interface Block2 extends Block { B: number[]; exact: boolean[]; sizes: number[]; pitch0: number | null; free: number; after?: number; freeOf?: () => number }
type ToDev = (x: number, y: number) => [number, number]

/** a spacing accent TeX sets as a glyph of its own */
export declare const ACCENT: RegExp
/** a page's text content as characters, each with its font's class (`fontOf(fontName)`) */
export declare function pageChars2(textContent: { items: unknown[] }, fontOf: (fontName: string) => FontClass): Char[]
/** a placeholder's source as plain text, its environment, label and alignment marks left out */
export declare function texToText2(src: string): string
/** phClass with the paper's own macros told apart: { cls, unknown? } */
export declare function phClass2(src: string): { cls: string; unknown?: boolean }
/** the unit's characters by its rectangles; `exact`: each rectangle's baseline and size where a layout file gives them */
export declare function charsOfUnit2(rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], extents?: Map<Rect, number[]>, exact?: ReadonlyMap<Rect, { baseline: number; size: number }> | null): Char[]
export declare function extendRects2(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[], others: readonly (readonly Rect[] | undefined)[], src: string, wordsOfFn: unknown, normFn: unknown, pageViews: readonly number[][], wordChars?: readonly (readonly Char[] | undefined)[]): number
export declare function extendFirstLines(rects: Rect[], pageViews: readonly number[][], others: readonly (readonly Rect[] | undefined)[]): void
export declare function blocksOf2(rects: readonly Rect[], pageViews: readonly number[][], keep?: ReadonlySet<string> | null, regionOf?: ReadonlyMap<string, number> | null, referenced?: ReadonlySet<number> | null): Block[]
export declare function gapsOf2(unitChars: readonly Char[], src: string, deny?: ReadonlySet<string> | null): { text: string; chars: Char[] }[]
/** the unit against its page, in parts: v0's, or `parts` another source gives (the per-unit reading's contract above) */
export declare function prepareUnit(unit: Unit, rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], citeMap?: CiteMap | null, deny?: ReadonlySet<string> | null, parts?: UnitParts | null): Prepared
/** the unit's placeholders by piece index */
export declare function placeholdersOf(unit: Unit): Placeholder[]
/** parts 1 and 2, v0's: the unit's characters by its rectangles, each line's baseline and size, and its extent */
export declare function linesOf(rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[]): UnitLines
/** part 3, v0's: the first gap's label, out.label set; the gaps without it */
export declare function labelOf(out: Prepared, unit: Unit, rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], gaps: Gap[]): Gap[]
/** part 4, v0's: the renderings by the alignment's gaps */
export declare function v0Renderings(ctx: RenderingsContext): Renderings
/** a citation's keys from its source */
export declare const citeKeys: (src: string) => string[]
/** a citation's rendering without the source's own brackets round it, and what it says learnt for the paper */
export declare function learnCite(p: Placeholder, g: Gap, citeMap: CiteMap | null): Gap
export declare function displayTouched(res: Prepared, uc: readonly Char[]): Set<string>
/** a crop grown over the ink it touches */
export declare function growCrop(r: { crop: number[]; [more: string]: unknown }, ink: InkMap | undefined, toDev: ToDev, k: number, pageChars?: readonly Char[]): void
export declare function nearIn(letters: string, hay: string, src?: string): boolean
/** a page character's key: page|item|k */
export declare const charKey: (c: { page?: number; item: number; k: number }) => string
export declare function snapFirstRect(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[]): number | undefined
export declare function snapFirstRect2(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[]): number | undefined
/** wordChars: the page's characters the first line may grow over the words its source begins with (step 3) */
export declare function extendRects(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[], others: readonly (readonly Rect[] | undefined)[], src: string, wordsOfFn: unknown, normFn: unknown, wordChars?: readonly (readonly Char[] | undefined)[]): number
/** a unit's translation as tokens; `.base` is its base style. `measure(s, face)`: a run's width at 100 px (the canvas's, cached,
 *  by default); a host reading the tokens' faces and texts before the faces are loaded passes a measure that takes none */
export declare function tokensOf2(unit: Unit, resolved: Prepared, to: string, baseIn: Style, designs: { serif: string; sans: string; mono: string }, P: Params, lead?: { text: string; st: Partial<Style> } | null, measure?: (s: string, face: Face) => number): Token[] & { base: Style }
/** a float's label as the final sets it in the target: the target's name (capitals where the original's are), a space,
 *  the original's number and punctuation; null where the final keeps the paper's name or the name is the original's */
export declare function labelInTarget(label: { text?: string; chars?: { ch: string }[] } | null | undefined, names: { figure: string; table: string } | null | undefined, captions: { figure?: string; table?: string } | null | undefined, to: string): string | null
/** the target's likely faces measured once each, a task apart, the CJK ones too where `cjk` (the run's P.cjk); `ready(face, text)`
 *  is awaited before each measure (a face served in slices has the slice of the text by then) */
export declare function warmFaces(to: string, cjk: boolean, designs: { serif: string }, yieldNow: () => Promise<unknown>, ready?: (face: Face, text: string) => Promise<unknown>): Promise<void>
export declare function blocks2(rects: readonly Rect[], pageViews: readonly number[][], keep: ReadonlySet<string> | null, lineInfo: Prepared['lineInfo'], regionOf?: ReadonlyMap<string, number> | null, referenced?: ReadonlySet<number> | null): Block2[]
export declare function inkMapOf(canvas: HTMLCanvasElement | OffscreenCanvas, factor?: number): InkMap
export declare function freeBelow(map: InkMap | undefined, toDev: ToDev, k: number, x0: number, x1: number, yStart: number, yLimit: number): number
export declare const setHyphenData: (lang: string, data: Patterns | true | null) => Map<string, Patterns | true | null>
/** a crop's baseline: its glyphs' at its line's text size, else its line's measured baseline, else its largest glyphs' */
export declare function cropBaselineOf(real: readonly Char[], lineInfo: Prepared['lineInfo'] | null, main: readonly Char[]): number
/** a solid-set original's pitch, × its size (TeX's \baselineskip: 1.2 at 10 and 12 pt, 1.24 at 11) */
export declare const SOLID: number
/** the unit's leading relative to the original's own pitch: leadBase of a solid line, never closer than the original's */
export declare function leadOf(blocks: readonly Pick<Block2, 'pitch0'>[], s: number, P: Pick<Params, 'leadBase'>): number
export declare function layoutUnit2(tokens: readonly Token[], blocks: readonly Block2[], s: number, P: Params): Layout
/** a box in v0's device pixels on the page: [x, y, w, h] */
export type DevBox = [number, number, number, number]
/** one of the layer's drawing operations (unitOps'): the paper's white, the page's own pixels put back within the erased
 *  boxes, a crop of a page's pixels darkened in */
export type DrawOp =
  | { op: 'erase'; box: DevBox }
  | { op: 'paper'; rects: DevBox[] }
  | { op: 'restore'; page: number; clip: DevBox[]; boxes: DevBox[] }
  | { op: 'crop'; page: number; src: DevBox; dst: DevBox; plane?: Plane; clip?: DevBox[] }
  | { op: 'swap'; page: number; rects: DevBox[] }
/** which drawing of a page an operation cuts from: the original, its text-removed page, its placeholders alone */
export type Plane = 'O' | 'R' | 'P'
/** a canvas a drawing operation cuts from: the page as PDF.js drew it */
export type DrawSource = CanvasImageSource
/** the unit's lines erased on the page, what no painted unit accounts for put back, its crops: as operations */
export declare function unitOps(L: Layout, blocks: readonly Block2[], page: number, o: { px: ToDev; k: number; hasSource: (page: number) => boolean; pxOf: (page: number) => ToDev; extents?: Map<string, number[]>; audit?: Audit[] | null; id?: number | null; restore?: unknown }): DrawOp[]
/** the unit on a page whose text the removed PDF has taken out: the removed page's pixels swapped in over its own glyphs
 *  (`rects`), its crops cut from the placeholders' page where `removed` says its source page is removed */
export declare function removalOps(L: Layout, page: number, o: { px: ToDev; k: number; hasSource: (page: number) => boolean; pxOf: (page: number) => ToDev; rects: DevBox[]; erase?: DevBox[]; lines?: number[][]; removed: (page: number) => boolean; audit?: Audit[] | null; id?: number | null; clips?: Map<number, { rects: DevBox[]; own: DevBox[] }> | null }): DrawOp[]
/** the operations drawn on a copy of the page at `z` times v0's resolution, cut from each page and plane as PDF.js drew it
 *  there */
export declare function drawOps(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ops: readonly DrawOp[], z: number, sourceOf: (page: number, plane: Plane) => DrawSource | null | undefined): void
export declare function pageItemsOf(chars: readonly Char[], page: number, px: ToDev, ink: InkMap | undefined): { items: { chars: Char[]; keys: string[]; box: number[] }[]; cover: Uint8Array | null }
/** the unit's lines on one page as SVG markup (a <g data-u="id">) */
export declare function svgOfUnit(L: Layout, page: number, toPx: (x: number, y: number) => number[], scale: number, id: number): string
export declare function drawnRuns(tokens: readonly Token[]): { key: string; n: number }[]
export declare function styleMatch(orig: Prepared['orig'] | undefined, drawn: readonly { key: string; n: number }[], drawnBase?: string): { match: number; total: number; base?: boolean; ob?: string; db?: string }
/** a line's band between the rules over and under it: its original baseline, and how low and high its em box may reach */
export interface CellBand { B: number; lo: number; hi: number }
/** a table cell's room between the rules over and under its lines: the largest size its em boxes fit at, and each line's band by block */
export declare function cellBands(blocks: readonly { page: number; B: readonly number[]; rects: readonly (readonly number[])[] }[], rulesOf: (page: number) => readonly number[] | undefined, s: number, P: Pick<Params, 'cellClear' | 'cellCapMin'>): { cap: number; bands: Map<number, CellBand[]> } | null
/** each laid line on one of the original's lines moved into that line's band at the size it is drawn at */
export declare function clearLines(lines: { block: number; baseline: number }[], bands: Map<number, CellBand[]>, f: number): void
