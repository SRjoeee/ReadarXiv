// layer2.mjs's types: the layer v0 itself, iterations 2 and 3 (ported from the prototype at 9e56fca). Its values are the
// prototype's own plain objects; what a host or a test reads of them is typed, the rest is left open.
import type { Audit } from './check.mjs'
import type { Face, FontClass, Style } from './fonts.mjs'
import type { Patterns } from './hyph.mjs'
import type { Block, Rect } from './layer1.mjs'

/** the fit's parameters, per script (the sweep's choice) */
export interface Params {
  cjk: boolean; leadBase: number; leadFloor: number; trackMin: number; compressMax: number; borrow: number; borrowGap: number
  floor: number; step: number; grid: number; order: string[]; cjkJust: number; spaceMax: number; autospace: number; spaceMin: number
  hyphen: number; even?: number; maxScale?: number; _compress?: number
}
/** a character of the original page: its box from its item (PDF units), its baseline and size, its item and place in it,
 *  its font's class */
export interface Char { ch: string; x0: number; x1: number; yb: number; size: number; item: number; ix: number; k: number; st: FontClass; ybEff?: number; page?: number; rect?: number[]; sep?: boolean; space?: boolean }
/** a unit of the units file, as the layer reads it */
export interface Unit { kind: string; src: string; pieces: { t: string; s?: string; src?: string }[]; state?: string; title?: boolean }
/** a placeholder's resolution: how it is drawn */
export interface Resolved { mode: string; text?: string; k?: number; src?: string; cls?: string; page?: number; crop?: number[]; baseline?: number; sup?: boolean; math?: boolean; gap?: unknown; region?: number; [more: string]: unknown }
/** prepareUnit's answer: each placeholder's resolution by its piece's index, with the unit's reading of the page */
export interface Prepared extends Map<number, Resolved> {
  extents: Map<Rect, number[]>
  uc: Char[]
  lineInfo: Map<string, { baseline: number; size: number; exact: boolean }>
  orig: { key: string; st: FontClass; size: number; runs: { key: string; n: number }[] } | null
  keep?: string[]
  label?: { x1: number; text: string; chars: Char[] }
  firstX0?: number
  gaps?: { text: string; chars: Char[] }[]
  regionOf: Map<string, number>
  referenced: Set<number>
  cat: Map<string, 'acc' | 'keep' | 'orphan' | 'undrawn'>
  matchedKeys: Set<string>
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

export declare function defaultParams(to: string): Params
/** a spacing accent TeX sets as a glyph of its own */
export declare const ACCENT: RegExp
/** a page's text content as characters, each with its font's class (`fontOf(fontName)`) */
export declare function pageChars2(textContent: { items: unknown[] }, fontOf: (fontName: string) => FontClass): Char[]
/** a placeholder's source as plain text, its environment, label and alignment marks left out */
export declare function texToText2(src: string): string
/** phClass with the paper's own macros told apart: { cls, unknown? } */
export declare function phClass2(src: string): { cls: string; unknown?: boolean }
export declare function charsOfUnit2(rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], extents?: Map<Rect, number[]>): Char[]
export declare function extendRects2(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[], others: readonly (readonly Rect[] | undefined)[], src: string, wordsOfFn: unknown, normFn: unknown, pageViews: readonly number[][]): number
export declare function extendFirstLines(rects: Rect[], pageViews: readonly number[][], others: readonly (readonly Rect[] | undefined)[]): void
export declare function blocksOf2(rects: readonly Rect[], pageViews: readonly number[][], keep?: ReadonlySet<string> | null, regionOf?: ReadonlyMap<string, number> | null, referenced?: ReadonlySet<number> | null): Block[]
export declare function gapsOf2(unitChars: readonly Char[], src: string, deny?: ReadonlySet<string> | null): { text: string; chars: Char[] }[]
export declare function prepareUnit(unit: Unit, rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], citeMap?: Map<string, string> | null, deny?: ReadonlySet<string> | null): Prepared
export declare function displayTouched(res: Prepared, uc: readonly Char[]): Set<string>
/** a crop grown over the ink it touches */
export declare function growCrop(r: { crop: number[]; [more: string]: unknown }, ink: InkMap | undefined, toDev: ToDev, k: number, pageChars?: readonly Char[]): void
export declare function nearIn(letters: string, hay: string, src?: string): boolean
/** a page character's key: page|item|k */
export declare const charKey: (c: { page?: number; item: number; k: number }) => string
export declare function snapFirstRect(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[]): number | undefined
export declare function snapFirstRect2(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[]): number | undefined
export declare function extendRects(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[], others: readonly (readonly Rect[] | undefined)[], src: string, wordsOfFn: unknown, normFn: unknown): number
/** a unit's translation as tokens; `.base` is its base style */
export declare function tokensOf2(unit: Unit, resolved: Prepared, to: string, baseIn: Style, designs: { serif: string; sans: string; mono: string }, P: Params): Token[] & { base: Style }
/** the target's likely faces measured once each, a task apart */
export declare function warmFaces(to: string, designs: { serif: string }, yieldNow: () => Promise<unknown>): Promise<void>
export declare function blocks2(rects: readonly Rect[], pageViews: readonly number[][], keep: ReadonlySet<string> | null, lineInfo: Prepared['lineInfo'], regionOf?: ReadonlyMap<string, number> | null, referenced?: ReadonlySet<number> | null): Block2[]
export declare function inkMapOf(canvas: HTMLCanvasElement | OffscreenCanvas, factor?: number): InkMap
export declare function freeBelow(map: InkMap | undefined, toDev: ToDev, k: number, x0: number, x1: number, yStart: number, yLimit: number): number
export declare const setHyphenData: (lang: string, data: Patterns | true | null) => Map<string, Patterns | true | null>
export declare function layoutUnit2(tokens: readonly Token[], blocks: readonly Block2[], s: number, P: Params, to: string): Layout
/** the unit's lines erased on the page's copy, what no painted unit accounts for put back, its crops drawn */
export declare function paintBase(ctx: CanvasRenderingContext2D, L: Layout, blocks: readonly Block2[], page: number, o: { px: ToDev; k: number; origCanvasOf: (page: number) => HTMLCanvasElement | null; pxOf: (page: number) => ToDev; extents?: Map<string, number[]>; audit?: Audit[] | null; id?: number | null; restore?: unknown }): void
export declare function pageItemsOf(chars: readonly Char[], page: number, px: ToDev, ink: InkMap | undefined): { items: { chars: Char[]; keys: string[]; box: number[] }[]; cover: Uint8Array | null }
/** the unit's lines on one page as SVG markup (a <g data-u="id">) */
export declare function svgOfUnit(L: Layout, page: number, toPx: (x: number, y: number) => number[], scale: number, id: number): string
export declare function drawnRuns(tokens: readonly Token[]): { key: string; n: number }[]
export declare function styleMatch(orig: Prepared['orig'] | undefined, drawn: readonly { key: string; n: number }[], drawnBase?: string): { match: number; total: number; base?: boolean; ob?: string; db?: string }
