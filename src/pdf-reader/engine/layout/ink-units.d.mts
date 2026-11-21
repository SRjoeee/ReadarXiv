// ink-units.mjs's types
import type { Ledger, LedgerPage } from './ledger.mjs'
/** the ledger's classes made units, and each one's kind */
export declare const INK_KIND: Readonly<{ heads: 'inkheads'; contents: 'inkcontents'; notes: 'inknotes'; orphan: 'inkorphan'; names: 'inknames'; references: 'inkreferences' }>
export declare const NAMES_SHARE: number
export declare const BLOCK_DY: number
export declare const PARA_DY: number
export declare const EDGE: number
export declare const INDENT: number
/** a kept block's next line: within this many of its size below the block's lowest (rule 10) */
export declare const KEPT_DY: number
export type InkKind = 'inkheads' | 'inkcontents' | 'inknotes' | 'inkorphan' | 'inknames' | 'inkreferences'
/** an ink unit's piece: the front end's shapes (a text, a placeholder, a style run's group open and close, rule 9; an echo's its
 *  source unit's pieces) */
export type InkPiece = { t: 'text'; s: string; src?: string } | { t: 'ph'; src: string } | { t: 'open' | 'close'; id: number; src: string }
/** an ink unit's rows as the layout file holds a unit's: `unit` [id, kind, depth, flags, pieces]; `lines` 8 numbers a line, the
 *  face's name at 7 (the page pass gives it its index); `frames` 6 a frame; `erase` 5 a rectangle; `ph` a placeholder's row,
 *  its kind by name */
export interface InkRows {
  unit: [id: number, kind: InkKind, depth: number, flags: number, pieces: number]
  lines: (number | string)[]
  frames: number[]
  erase: number[]
  ph: [k: number, kind: 'math' | 'url', flags: number, ...segments: number[]][]
}
export interface InkUnit {
  id: number; kind: InkKind; cls: 'heads' | 'contents' | 'notes' | 'orphan' | 'names' | 'references' | 'code' | 'math' | 'symbols' | 'index'; echo: number | null; pieces: InkPiece[]
  glyphs: { text: [page: number, glyph: number][]; ph: [page: number, glyph: number][] }
  rows: InkRows
  /** a kept block (rule 10): never translated, no pieces, its rows its lines' boxes alone */
  kept?: true
}
/** the ink units as the wrap gives them on (`ours.ink`): their ids from `base` */
export interface InkOfWrap { base: number; units: Omit<InkUnit, 'glyphs'>[]; off?: number[] }
export declare function inkUnitsOf(pages: (LedgerPage & { view: number[] })[], ledger: Ledger, o?: { units?: readonly { kind?: string; pieces?: readonly InkPiece[] }[] | null; from?: number | null }): InkUnit[]
/** the kept blocks (rule 10): units of the ledger's lines no unit owns once the ink units have claimed theirs, never translated;
 *  `owner(page, glyph)` the group that owns a glyph (null: none); ids from `from` on, after the ink units */
export declare function keptUnitsOf(pages: (LedgerPage & { view: number[] })[], ledger: Ledger, owner: (page: number, glyph: number) => string | null | undefined, o: { from: number }): (InkUnit & { kept: true })[]
/** the ink units' glyphs claimed in `own` (each one no unit owned), and with `pages` (the wrap's, their boxes and paths) the
 *  rules TeX painted on their lines (own.mjs lineRulesOf, MR 2b) in `own.boxes`; returns the glyphs claimed */
export declare function claimInk(own: { glyphs: (string | null)[][]; boxes?: (string | null)[][] }, ink: readonly InkUnit[], pages?: readonly { glyphs: readonly { u?: string; x0: number; x1: number; y: number; size: number }[]; boxes: ArrayLike<number>; paths: ArrayLike<number> }[] | null): number
/** the ink units the wrap could not hide alone: one with a glyph on a page not wrapped, or a placeholder on a page whose groups were merged */
export declare function inkOff(ink: readonly InkUnit[], pages: Map<number, { ok?: boolean; merged?: boolean }>): number[]
