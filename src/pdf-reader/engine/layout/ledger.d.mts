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
  gs: number[]; region: number; zone: 'contents' | 'references' | 'index' | null; para: number | null; opens: boolean; y: number; size: number; x0: number; x1: number
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
  /** the paragraphs' points (ink.mjs `paras`) */
  paras?: { name: string; glyph: number; box: number }[]
}
export interface OrphanLine { page: number; text: string; letters: number; x0: number; x1: number; y: number }
export interface Ledger {
  /** per page, each glyph's class code (CLASS_IDS) */
  classes: Uint8Array[]
  counts: Record<ClassId, { glyphs: number; letters: number }>
  letters: number
  orphanLetters: number
  orphans: OrphanLine[]
  /** every line of glyphs no unit owns, in stream order; `opens` where its paragraph's point lies on it */
  lines: { page: number; cls: ClassId; gs: number[]; region: number; zone: 'contents' | 'references' | 'index' | null; para: number | null; opens?: boolean; y: number; size: number; x0: number; x1: number; letters: number }[]
}
export declare function ledgerOf(pages: LedgerPage[], own: { glyphs: (string | null)[][] } | null, o?: { units?: readonly unknown[] | null }): Ledger
export declare const HEAD_ORPHANS: number
export declare const HEAD_TEXT: number
/** flat, as a head holds it: `classes` [class, glyphs, letters, …], `orphans` [page, letters, text, …] */
export interface LedgerSummary { classes: (ClassId | number)[]; letters: number; orphanLetters: number; orphans: (number | string)[] }
export declare function ledgerSummary(ledger: Ledger): LedgerSummary
export interface OrphanRow { inv: 'o'; sev: 'violation'; paper: string; page: number; unit: null; what: 'orphan text'; text: string; detail: { letters: number; x0: number; x1: number; y: number } }
export declare function orphanRows(ledger: Ledger, o: { paper: string }): OrphanRow[]
/** the ledger once the ink units own what they own: its orphans those no unit owns still */
export declare function inkLeft(ledger: Ledger, own: { glyphs: (string | null)[][] } | null, pages: LedgerPage[]): Ledger
export interface HeadOrphanRow { inv: 'o'; sev: 'violation'; paper: string; page: number | null; unit: null; what: 'orphan text' | 'orphans not listed'; text: string; detail: { letters: number } }
/** invariant (o) from a head's base ledger */
export declare function orphanRowsOfHead(head: { base?: { ledger?: LedgerSummary } | object } | null | undefined, o: { paper: string }): HeadOrphanRow[]
