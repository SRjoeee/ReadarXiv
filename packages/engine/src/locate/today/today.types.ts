// The types of the JavaScript names today's ink makers (locate/ink-units.ts) take from deps.mjs: its copies of own/own's OWN_WORK,
// RULE_EM and lineRulesOf, whose home is still JavaScript, each re-exported with its type (a package holds no declaration file).
// This facade goes with them when own/own is typed (lane t2-locate's last step).
// @ts-ignore: JavaScript copied as it is, typed by this file alone
import * as deps from './deps.mjs'

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
