// The types of today's ledger copied beside this file (ledger.mjs: JavaScript as it is), what locate reads of it; each value
// re-exported with its type (a package holds no declaration file). Folded into the module when it is typed.
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
