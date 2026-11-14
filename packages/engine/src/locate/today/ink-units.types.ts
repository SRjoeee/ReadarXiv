// The types of today's ink units copied beside this file (ink-units.mjs: JavaScript as it is), what locate reads of it; each value
// re-exported with its type (a package holds no declaration file). Folded into the module when it is typed.
// @ts-ignore: JavaScript copied as it is, typed by this file alone
import * as inkUnits from './ink-units.mjs'
import type { TodayLedger, TodayOwn, TodayPage, TodayPiece, TodayUnit } from './ledger.types.ts'

/** an ink unit or a kept block (inkUnitsOf, keptUnitsOf) */
export interface TodayInkUnit {
  id: number
  kind: string
  cls: string
  echo: number | null
  kept?: true
  /** a kept block of e-mail addresses and their separators alone (keptUnitsOf's, addressesAlone) */
  address?: true
  /** a kept block of a display TeX set (keptUnitsOf's: its region `display`), its lines the display rule's rows (geometry.ts) */
  display?: true
  /** of the names: it holds whole the text of an author command's argument a macro stores (inkUnitsOf's rule 8, `stored`), the
   *  block's wherever it stands */
  stored?: true
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

export const inkUnitsOf = inkUnits.inkUnitsOf as (
  pages: readonly TodayPage[],
  ledger: TodayLedger,
  /** `unplaced`, the author and affiliation units with no place of their own on A, and `stored`, the author commands' arguments a
   *  macro stores: rule 8's source ties */
  o: { units: readonly TodayUnit[]; from: number; unplaced?: readonly TodayUnit[]; stored?: readonly TodayUnit[] },
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
export const UNIT_FLAG = inkUnits.UNIT_FLAG as Readonly<
  Record<'CENTRED' | 'FLUSH_LEFT' | 'FLUSH_RIGHT' | 'JUSTIFIED', number>
>
export const statedClassOf = inkUnits.statedClassOf as (piece: TodayPiece) => string | null
