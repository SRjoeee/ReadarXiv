// The types of today's figure reading copied beside this file (figure-text.mjs: JavaScript as it is), what locate reads of it; each
// value re-exported with its type (a package holds no declaration file). Folded into the module when it is typed.
// @ts-ignore: JavaScript copied as it is, typed by this file alone
import * as fig from './figure-text.mjs'
import type { TodayPage } from '../ledger.ts'

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
  /** (CHANGED, §18.61) held with its label, a decorated word standing in another line of it or on its printed line
   *  (figure-lines.ts figureLinesOf): the made unit's `decorated: 'label'` */
  decorated?: 'label'
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
   *  units it holds, its shape, and the glyphs inside it that no unit holds, the line reading's to place (figure-text.mjs
   *  containersOf; figure-lines.ts takes the path where it sets each on one of the path's lines) */
  holds?: { p: number; b: number; ks: number[]; shape: TodayShape; others?: number[] }[]
  /** the reading's counts (figure-text.mjs `stats`): of them, F3's container step's, the closed paths whose box holds two units
   *  or more and the points read against a path's inside */
  stats?: { boxed?: number; interior?: number }
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
