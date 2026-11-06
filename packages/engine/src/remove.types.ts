// The types of remove.mjs (today's module, moved as it is into the engine package, JavaScript until its port): what
// its declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as remove_js from './remove.mjs'

/** a content stream's operators (those of `keep`, null: every one), holding at most `limit` bytes by COST (past it LexLimit), with what they hold */
export const lex = remove_js.lex as (
  bytes: Uint8Array,
  limit?: number,
  keep?: ReadonlySet<string> | null,
) => { op: string; args: unknown[]; s: number; e: number }[] & { bytes: number }
/** lex's refusal of a stream holding more than it was allowed */
export interface LexLimit extends Error {
  limit: number
}
export const LexLimit = remove_js.LexLimit as { new (...args: unknown[]): LexLimit }
/** decode's refusal of a stream decoding to more than it was allowed */
export interface DecodeLimit extends Error {
  limit: number
}
export const DecodeLimit = remove_js.DecodeLimit as { new (...args: unknown[]): DecodeLimit }
/** a decoding stream's bytes (PDF.js's DecodeStream, as the object layer ports it) no further than `limit`, as bytes of their own */
export const readAtMost = remove_js.readAtMost as (
  stream: { getBytes(n?: number): Uint8Array; reset(): void },
  limit: number,
) => Uint8Array
/** the heap a lexed token, and a recorded event, is held in, by its kind */
export const COST = remove_js.COST as Readonly<
  Record<'op' | 'num' | 'name' | 'str' | 'mark' | 'kw' | 'atom' | 'event' | 'code', number>
>
/** what a page's walk may hold: its streams' operators and its events by COST, each stream lexed once, and their decoded bytes */
export const HELD_MAX = remove_js.HELD_MAX as number
export const BYTES_MAX = remove_js.BYTES_MAX as number
/** the PDF object layer's exports the remover reads (@cantoo/pdf-lib) */
export type PdfLib = Record<string, any>
/** the operators a page's walk may visit, its forms' as often as they are painted; past it the page is refused */
export const WALK_MAX = remove_js.WALK_MAX as number
/** PDF.js's operator list of a page, as the remover reads it */
export interface OpList {
  fnArray: ArrayLike<number>
  argsArray: ArrayLike<unknown>
}
/** what alignPage reads of a page's operator list (alignOf): each text-showing operation's glyph codes outside an annotation
 *  (null: a glyph with no code, not compared; -1: one that is not a code, equal to none), and the paths it constructs */
export interface AlignFacts {
  codes: (number | null)[][]
  paths: number
}
/** a page's alignment facts from PDF.js's operator list (pure): the page aligns by them exactly as by the list */
export const alignOf = remove_js.alignOf as (OPS: Record<string, number>, opList: OpList) => AlignFacts
export interface Remover {
  numPages: number
  encrypted: boolean
  /** a page against PDF.js's reading of it: its alignment facts, or (OPS, opList) the list itself; any difference refuses the page */
  alignPage(pageIndex: number, facts: AlignFacts): { ok: boolean; why: string[] }
  alignPage(pageIndex: number, OPS: Record<string, number>, opList: OpList): { ok: boolean; why: string[] }
  /** a page walked: what could not be walked (`problems`, any one refuses the page) and the operators visited */
  walkPage(pageIndex: number): {
    problems: string[]
    walked: number
    held: number
    bytes: number
    events: { kind: string; codes?: unknown[] }[]
  }
  /** the decoded streams and the fonts read let go (a remover kept across asks holds the object layer's parse alone) */
  release(): void
}
export const openRemover = remove_js.openRemover as (
  bytes: Uint8Array,
  o: {
    PL: PdfLib
    inflate?: ((bytes: Uint8Array, limit: number) => Uint8Array) | null
    walkMax?: number
    heldMax?: number
    bytesMax?: number
  },
) => Promise<Remover>
