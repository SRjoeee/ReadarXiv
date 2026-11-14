// The types of the JavaScript names today's ink makers (ledger, figure-text, ink-units beside this file) take from deps.mjs: its
// copies of front-half functions whose homes are still JavaScript (own/stream, own/own, source/latex-front, instrument/mt), each
// re-exported with its type (a package holds no declaration file). A copy leaves when its home is typed (a re-export of the home
// first), and this facade with the last of them (lane t2-locate, ruled 2026-11-14).
// @ts-ignore: JavaScript copied as it is, typed by this file alone
import * as deps from './deps.mjs'

/** a point of the marked compile as these readers take one: its name, and the glyphs and boxes the page showed before it */
export interface TodayPoint {
  name: string
  glyph: number
  box: number
}
/** a glyph or a box of a document by its page (1-based) and its index there */
export type PageItem = readonly [page: number, index: number]
/** a page as lineRulesOf reads one: each box's kind (`paths`: a path's index, else negative), its glyphs and its boxes (stride 4) */
export interface RulesPage {
  readonly paths: readonly number[]
  readonly glyphs: readonly {
    readonly u?: string
    readonly size: number
    readonly y: number
    readonly x0: number
    readonly x1: number
  }[]
  readonly boxes: readonly number[]
}

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
/** a page's column of a box across (x0 to x1) (stream.mjs columnsAt): 0 the left (or the only one), 1 the right, 2 across both */
export const columnsAt = deps.columnsAt as (page: {
  readonly points?: readonly { readonly name: string }[]
  readonly view?: readonly number[]
}) => (x0: number, x1: number) => number
/** a rule's call and a frame's (own.mjs OWN_WORK, RULE_EM, lineRulesOf): the comparisons a document's rules may take, a rule's
 *  thickness at most in its line's size, and the line rules among `boxes` with the work done and whether it passed `max` */
export const OWN_WORK = deps.OWN_WORK as number
export const RULE_EM = deps.RULE_EM as number
export const lineRulesOf = deps.lineRulesOf as <B extends PageItem>(
  pages: readonly RulesPage[],
  glyphs: readonly PageItem[],
  boxes: readonly B[],
  max?: number,
) => { rules: B[]; work: number; over: boolean }
/** a text the front end holds as UTF-8 bytes read latin-1, read back (mt.mjs utf8) */
export const utf8 = deps.utf8 as (s: string) => string
