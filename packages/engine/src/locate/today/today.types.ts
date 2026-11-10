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
}
export interface TodayFigures {
  units: TodayFigureUnit[]
  glyphs: Map<number, number>[]
  turned: Map<number, number>[]
}
export interface TodayLedger {
  lines: unknown[]
}

export const figureUnitsOf = fig.figureUnitsOf as (
  pages: readonly TodayPage[],
  own: { glyphs: (string | null)[][] },
  /** `done`, told each page once its figure texts are read: nothing of the reading reads that page's shapes again */
  o?: { unitsPage?: number; unitsDoc?: number; done?: ((page: number) => void) | null },
) => TodayFigures
export const figureGroup = fig.figureGroup as (k: number) => string
export const ledgerOf = ledger.ledgerOf as (
  pages: readonly TodayPage[],
  own: { glyphs: (string | null)[][] },
  o: { units: readonly TodayUnit[] },
) => TodayLedger
export const inkUnitsOf = inkUnits.inkUnitsOf as (
  pages: readonly TodayPage[],
  ledger: TodayLedger,
  o: { units: readonly TodayUnit[]; from: number },
) => TodayInkUnit[]
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
/** the letters a text is told by, without accents, lower case (stream.mjs spellOf) */
export const spellOf = deps.spellOf as (s: string) => string
/** each glyph's and box's region by the page's brackets (stream.mjs regionsOf): depth * 2 + 1 in a column's body */
export const regionsOf = deps.regionsOf as (page: {
  glyphs: { n: number }
  boxes: ArrayLike<number>
  points: readonly { name: string; glyph: number; box: number }[]
}) => { glyph: Int32Array; box: Int32Array; at: Int32Array; bodies: boolean }
