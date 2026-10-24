// ledger.mjs's types
import type { ClassId } from '../rules/content-classes.mjs'
export declare const LINE_DY: number
export declare const LINE_GAP: number
export declare const FOOT_GAP: number
export declare const MATH_WORDS: number
export declare const MATH_SHARE: number
export declare const DISPLAY_WORDS: number
export declare const DISPLAY_SHARE: number
export declare const MONO_SHARE: number
export declare const FORM_SHARE: number
export declare const ORPHAN_LINES_MAX: number
/** an unowned line as the rules read it */
export interface LedgerLine {
  gs: number[]; region: number; zone: 'contents' | 'references' | 'index' | null; y: number; size: number; x0: number; x1: number
  n: number; letters: number; words: number; pairs: number; math: number; mono: number; form: number; relation: boolean; depth: number
  outside: boolean; head: boolean; foot: boolean
}
/** the line rules, in order */
export declare const RULES: readonly { readonly cls: ClassId; readonly code: number; readonly test: (l: LedgerLine) => boolean }[]
/** a page as the ledger reads it (own.mjs ownOf's) */
export interface LedgerPage {
  glyphs: { u?: string; x0: number; x1: number; y: number; size: number; font?: string; form?: boolean; blank?: boolean }[]
  boxes?: ArrayLike<number>
  points?: { name: string; glyph: number; box: number }[]
}
export interface OrphanLine { page: number; text: string; letters: number; x0: number; x1: number; y: number }
export interface Ledger {
  /** per page, each glyph's class code (CLASS_IDS) */
  classes: Uint8Array[]
  counts: Record<ClassId, { glyphs: number; letters: number }>
  letters: number
  orphanLetters: number
  orphans: OrphanLine[]
}
export declare function ledgerOf(pages: LedgerPage[], own: { glyphs: (string | null)[][] } | null, o?: { units?: readonly unknown[] | null }): Ledger
export interface LedgerSummary { classes: Partial<Record<ClassId, [glyphs: number, letters: number]>>; letters: number; orphanLetters: number }
export declare function ledgerSummary(ledger: Ledger): LedgerSummary
export interface OrphanRow { inv: 'o'; sev: 'violation'; paper: string; page: number; unit: null; what: 'orphan text'; text: string; detail: { letters: number; x0: number; x1: number; y: number } }
export declare function orphanRows(ledger: Ledger, o: { paper: string }): OrphanRow[]
