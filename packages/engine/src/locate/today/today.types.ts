// The types of today's ink makers copied beside this file (ledger.mjs, ink-units.mjs, figure-text.mjs, deps.mjs: JavaScript as it
// is), what ink.ts reads of them; each value re-exported with its type (a package holds no declaration file).
// @ts-ignore: JavaScript copied as it is, typed by this file alone
import * as deps from './deps.mjs'
// @ts-ignore: JavaScript copied as it is, typed by this file alone
import * as fig from './figure-text.mjs'
// @ts-ignore: JavaScript copied as it is, typed by this file alone
import * as inkUnits from './ink-units.mjs'
// @ts-ignore: JavaScript copied as it is, typed by this file alone
import * as ledger from './ledger.mjs'

/** a page as today's makers read one (layout/wrap-final.mjs's pages: pageInk's result, its view, and the marks' points) */
export type TodayPage = Record<string, unknown>
/** a piece as today's front end holds one: its strings UTF-8 bytes read latin1; an element's `kind` where the instrument states it */
export interface TodayPiece {
  t: string
  s?: string
  src?: string
  id?: number
  kind?: string
}
/** a unit as the makers read today's front end's ({ kind, pieces }), null for none (a babel name's or a structural name's) */
export type TodayUnit = { kind: string; pieces: TodayPiece[] } | null
/** an owner a glyph or a box has (a group's name), null for none */
export type TodayOwn = { glyphs: (string | null)[][]; boxes: (string | null)[][] }
/** an ink unit or a kept block (inkUnitsOf, keptUnitsOf) */
export interface TodayInkUnit {
  id: number
  kind: string
  cls: string
  echo: number | null
  kept?: true
  /** a kept block of e-mail addresses and their separators alone (keptUnitsOf's, addressesAlone) */
  address?: true
  pieces: TodayPiece[]
  /** its text's glyphs, its placeholders' (`ph`), each kept run's by its placeholder's index among the pieces (`runs`,
   *  inkUnitsOf's; none for a kept block), and, of its text's, its label's where it has one (`label`: inkUnitsOf's,
   *  labelLength) */
  glyphs: {
    text: [number, number][]
    ph: [number, number][]
    runs?: [number, [number, number][]][]
    label?: [number, number][]
  }
  rows: { unit: [number, string, number, number, number] }
}
/** a figure's text (figureUnitsOf) */
export interface TodayFigureUnit {
  k: number
  text: string | null
  why: string | null
  set?: number
  ux?: number
  uy?: number
  /** its first glyph's origin, its box's length along its run, its anchor, its room before and after its box, the depth under
   *  its baseline of the nearest stroke under its text (null: none) */
  x?: number
  y?: number
  length?: number
  anchor?: 'start' | 'centre' | 'end'
  before?: number
  after?: number
  under?: number | null
  /** (CHANGED, F3) kept for being drawn twice over itself (figure-lines.ts doubledOf): the made unit's `double` */
  double?: true
  /** (CHANGED, F3) kept for a script or an accent set apart from its base (figure-lines.ts setApart): the made unit's `script` */
  script?: true
}
/** a path's lines as pageInk keeps them (`shapes`): its segments (x0, y0, x1, y1 each), whether it is stroked and filled, its
 *  half line width */
export interface TodayShape {
  segs: ArrayLike<number>
  stroke: boolean
  fill: boolean
  hw: number
}
/** an item of ink a figure text's band meets (roomOf's `met`, the copy's): a glyph of its page by its index, or a box by its index
 *  with its box [x0, y0, x1, y1], its lines where pageInk kept them, and its kind (a path's index, an image -3, …); `ground`, a
 *  tone painted before the text under part of it, which crowds nothing */
export type TodayMet =
  | { g: number }
  | { b: number; box: number[]; shape: TodayShape | null; kind: number | undefined; ground?: boolean }
export interface TodayFigures {
  units: TodayFigureUnit[]
  glyphs: Map<number, number>[]
  turned: Map<number, number>[]
  /** (the copy's) each crowded figure text's met ink, by its k, and the depth under its baseline of the stroke under its text;
   *  an uncrowded one's tones under part of it alone */
  met: Map<number, { items: TodayMet[]; under: number | null }>
  /** (CHANGED, F3) each closed path that holds two units or more alone, the innermost of nested ones: its page, its box index, the
   *  units it holds, its shape (figure-text.mjs containersOf) */
  holds?: { p: number; b: number; ks: number[]; shape: TodayShape }[]
  /** the reading's counts (figure-text.mjs `stats`): of them, F3's container step's, the closed paths whose box holds two units
   *  or more and the points read against a path's inside */
  stats?: { boxed?: number; interior?: number }
}
export interface TodayLedger {
  lines: unknown[]
  /** (ADDED) the lines the depth rule reads as their float's text, stated (listed at most ORPHAN_LINES_MAX) and counted */
  floatLines: FloatLine[]
  floatCount: { lines: number; letters: number; why: Record<FloatWhy, number> }
  /** the letters of the orphan lines (class `orphan`) */
  orphanLetters: number
}
/** why no unit owns a float line, as far as the ledger knows (ledger.mjs FLOAT_WHY) */
export type FloatWhy = 'code' | 'cells' | 'nocells' | 'other'
/** a line TeX set inside a counted float that no unit owns, read as its float's text by its depth alone (ledger.mjs, ADDED;
 *  PDF-READER §18.45): its page, its float's bracket number (`fs<n>`) and caption type, why, its text's characters, letters and
 *  words of three letters, its box (x0, x1, baseline y, size) and its text (a paper's words: the lab's run alone holds them) */
export interface FloatLine {
  page: number
  float: number | null
  type: string | null
  why: FloatWhy
  chars: number
  letters: number
  words: number
  x0: number
  x1: number
  y: number
  size: number
  text: string
}

export const figureUnitsOf = fig.figureUnitsOf as (
  pages: readonly TodayPage[],
  own: { glyphs: (string | null)[][] },
  /** `done`, told each page once its figure texts are read: nothing of the reading reads that page's shapes again */
  o?: {
    unitsPage?: number
    unitsDoc?: number
    done?: ((page: number) => void) | null
    /** the faces the document sets at one pitch: a run goes into or out of none of them (Rule 1's fact, PDF-READER §18.22) */
    fixed?: ReadonlySet<string> | null
  },
) => TodayFigures
export const figureGroup = fig.figureGroup as (k: number) => string
export const interiorOf = fig.interiorOf as (segs: ArrayLike<number>, x: number, y: number) => boolean
export const containersOf = fig.containersOf as (
  pg: TodayPage,
  units: { k: number; gs: number[] }[],
  p: number,
  stats?: { boxed: number; interior: number },
) => { p: number; b: number; ks: number[]; shape: TodayShape }[]
/** the figure reading's measures, in its sizes (figure-text.mjs) */
export const RUN_DY = fig.RUN_DY as number
export const ANCHOR_REACH = fig.ANCHOR_REACH as number
export const RUN_GAP = fig.RUN_GAP as number
export const SPACE_GAP = fig.SPACE_GAP as number
export const DRAW_BAND = fig.DRAW_BAND as readonly [number, number]
export const ledgerOf = ledger.ledgerOf as (
  pages: readonly TodayPage[],
  own: { glyphs: (string | null)[][] },
  /** `floats`, each unit's caption float type by its id (InstrumentUnit's `float`), which the float lines read */
  o: { units: readonly TodayUnit[]; floats?: readonly (string | null)[] },
) => TodayLedger
/** the ledger once the ink units own what they own (claimInk): its orphan letters those no unit owns still */
export const inkLeft = ledger.inkLeft as (
  ledger: TodayLedger,
  own: TodayOwn,
  pages: readonly TodayPage[],
) => TodayLedger
export const inkUnitsOf = inkUnits.inkUnitsOf as (
  pages: readonly TodayPage[],
  ledger: TodayLedger,
  o: { units: readonly TodayUnit[]; from: number },
) => TodayInkUnit[]
/** a line's scripts (ink-units.mjs scriptsOf, rule 4): of its glyphs `order`, those TeX set smaller than the line's text and off its
 *  baseline, each raised (1) or lowered (-1) */
export const scriptsOf = inkUnits.scriptsOf as (
  G: readonly { size: number; y: number }[],
  order: readonly number[],
  largest?: boolean,
) => Map<number, 1 | -1>
export const keptUnitsOf = inkUnits.keptUnitsOf as (
  pages: readonly TodayPage[],
  ledger: TodayLedger,
  owner: (page: number, glyph: number) => string | null,
  o: { from: number },
) => TodayInkUnit[]
export const claimInk = inkUnits.claimInk as (
  own: TodayOwn,
  ink: readonly TodayInkUnit[],
  pages: readonly TodayPage[],
) => number
export const UNIT_FLAG = deps.UNIT_FLAG as Readonly<
  Record<'CENTRED' | 'FLUSH_LEFT' | 'FLUSH_RIGHT' | 'JUSTIFIED', number>
>
export const classOf = deps.classOf as (piece: TodayPiece) => string | null
/** an e-mail address as a text writes it (the front end's, latex-front.mjs EMAIL_ADDRESS) */
export const EMAIL_ADDRESS = deps.EMAIL_ADDRESS as RegExp
/** several addresses at one domain written once, a group of their local parts before it (the front end's, latex-front.mjs
 *  ADDRESS_GROUP) */
export const ADDRESS_GROUP = deps.ADDRESS_GROUP as RegExp
/** each identifier of a text, [start, end) code units (the front end's, latex-front.mjs identifiersIn) */
export const identifiersIn = deps.identifiersIn as (s: string) => [number, number][]
/** the letters a text is told by, without accents, lower case (stream.mjs spellOf) */
export const spellOf = deps.spellOf as (s: string) => string
/** each glyph's and box's region by the page's brackets (stream.mjs regionsOf): depth * 2 + 1 in a column's body */
export const regionsOf = deps.regionsOf as (page: {
  glyphs: { n: number }
  boxes: ArrayLike<number>
  points: readonly { name: string; glyph: number; box: number }[]
}) => { glyph: Int32Array; box: Int32Array; at: Int32Array; bodies: boolean }
