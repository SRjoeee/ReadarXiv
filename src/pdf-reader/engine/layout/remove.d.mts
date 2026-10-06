// remove.mjs's types: the text-removed PDF, for the container's prepare, the gate and their tests
import type { Glyph } from './ink.mjs'

/** the remover's version: it enters the add-on's key */
export declare const REMOVAL: '1'
/** the page sets an add-on holds after arXiv's own N pages: R at N + p, P at 2N + p */
export declare const SETS: readonly ['R', 'P']
/** the check's sets after them: F (the removed glyphs alone), C (the crops' placeholders, each a colour) */
export declare const CHECK_SETS: readonly ['F', 'C']
/** a content stream's operators */
export declare function lex(bytes: Uint8Array): { op: string; args: unknown[]; s: number; e: number }[]
/** the PDF object layer's exports the remover reads (@cantoo/pdf-lib) */
export type PdfLib = Record<string, any>
export interface Remover { numPages: number; encrypted: boolean; alignPage(pageIndex: number, OPS: Record<string, number>, opList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }): { ok: boolean; why: string[] } }
export declare function openRemover(bytes: Uint8Array, o: { PL: PdfLib; inflate?: ((bytes: Uint8Array) => Uint8Array) | null }): Promise<Remover>
/** a unit's removal on a page: its glyphs as n, k pairs (pageInk's `indices`) and its rules as painted paths' places */
export interface PlannedUnit { id: number; glyphs: number[]; paths: number[] }
/** a crop's glyphs and rules, the placeholders' page's */
export interface PlannedCrop { id?: number; k?: number; glyphs: number[]; paths: number[] }
/** the plan: per page (1-based), its units' removals and its crops, and what the planner read of the page */
export interface RemovalPlan { pages: Record<number, { units: PlannedUnit[]; crops: PlannedCrop[]; shows?: number; glyphs?: number }> }
/** the add-on's manifest: per page whether it is removed (`ok`) or why not, and each unit's removed boxes (x0, y0, x1, y1
 *  stride 4, PDF units); the sets' places (each its page p at offset + p) */
export interface RemovalManifest {
  schema: 1; removal: string; pages: number; sets: Record<string, number>
  page: Record<number, { ok: boolean; refused?: string; units?: Record<number, number[]> }>
  appended: number; stats: Record<string, number>; colours?: Record<string, number[]>
}
/** arXiv's bytes with the sets appended as one incremental update */
export declare function makeAddon(o: {
  R: Remover; bytes: Uint8Array; OPS: Record<string, number>; opListOf(page: number): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>
  deflate(bytes: Uint8Array): Uint8Array; plan: RemovalPlan; sets?: readonly string[]
  boxesOf?: ((page: number, n: number, k: number) => number[] | null) | null; pathBoxOf?: ((page: number, m: number) => number[] | null) | null
}): Promise<{ bytes: Uint8Array; appended: number; manifest: RemovalManifest }>
type Ink = { glyphs: Glyph[]; boxes: number[]; paths: number[] }
/** an add-on's page p checked by PDF.js's own reading of it: R lacks exactly the planned glyphs and rules, P holds exactly
 *  the crops' */
export declare function checkPage(o: { orig: Ink; removed: Ink; kept: Ink; entry: RemovalPlan['pages'][number] | undefined }): {
  removed: number; missed: number; other: number; moved: number; extra: number; maxMove: number
  rulesRemoved: number; rulesMissed: number; rulesOther: number; pOwn: number; pMissing: number; pOther: number
}
