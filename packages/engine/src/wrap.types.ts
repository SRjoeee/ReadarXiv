// The types of wrap.mjs (today's wrapOf and planOf, moved as they are into the engine package, JavaScript until their port):
// what their declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
import type { WrapStats } from './delta-wire.ts'
import type { PdfLib } from './remove.ts'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as wrap_js from './wrap.mjs'

export const GROUPS_PAGE = wrap_js.GROUPS_PAGE as number
export const SEQUENCES_PAGE = wrap_js.SEQUENCES_PAGE as number
export const GROUPS_DOC = wrap_js.GROUPS_DOC as number
export const WRAP_WHYS = wrap_js.WRAP_WHYS as readonly ['wrap-parse', 'wrap-proof', 'wrap-bound']
export type WrapWhy = (typeof WRAP_WHYS)[number]
/** an optional-content group's name (`axt:<group>`) and its resource name (`axt<group>`), of a group's name */
export const ocgName = wrap_js.ocgName as (group: string) => string
export const propName = wrap_js.propName as (group: string) => string
export interface WrapPlan {
  facts: { codes: (number | null)[][]; paths: number; images?: number }
  shows: Map<number, (string | null | undefined)[]>
  paths: Map<number, string>
  images?: Map<number, string>
  /** the plan's naming where it is not today's: which groups are figure texts' (their runs in a form are wrapped in the form)
   *  and the text group an element's or a label's folds into on a page past its bounds */
  isFigure?: (group: string) => boolean
  textOf?: (group: string) => string
}
export const planOf = wrap_js.planOf as (
  glyphs: { n?: number; k?: number }[],
  groupOfGlyph: (string | null)[],
  paths: ArrayLike<number>,
  groupOfBox: (string | null)[],
  facts?: { codes?: unknown; paths?: unknown; images?: number } | null,
) => Omit<WrapPlan, 'facts'> & { images: Map<number, string>; lost: Set<string> }
export type WrapRefusal = { refused: WrapWhy; why: string }
export type WrapPage = {
  ok: boolean
  why?: string
  groups?: number
  sequences?: number
  split?: number
  merged?: boolean
  names?: Map<string, number>
  figureWhy?: Map<string, string>
}
/** what a wrap made of the pages, whichever way its bytes are given */
type WrapMade = {
  xref: number
  pages: Map<number, WrapPage>
  groups: Map<string, number>
  stats: Omit<WrapStats, 'unhidden' | 'labelKept'>
  forms?: number
  unwrapped?: true
}
/** the document composed: finalBytes and the section, and its digest (wrapFinal's) */
export type Wrap = WrapMade & { bytes: Uint8Array; sha256: string }
/** the section alone (`compose: false`, the back half's: wrap.ts keeps the add-on alone), empty where no page is wrapped */
export type WrapSection = WrapMade & { section: Uint8Array }
type WrapOptions = {
  PL: PdfLib
  deflate: (b: Uint8Array) => Uint8Array
  inflate: (b: Uint8Array, limit: number) => Uint8Array
  groupsPage?: number
  sequencesPage?: number
  groupsDoc?: number
}
export const wrapOf = wrap_js.wrapOf as {
  (
    finalBytes: Uint8Array,
    plans: Map<number, WrapPlan>,
    o: WrapOptions & { compose: false },
  ): Promise<WrapSection | WrapRefusal>
  (
    finalBytes: Uint8Array,
    plans: Map<number, WrapPlan>,
    o: WrapOptions & { compose?: true },
  ): Promise<Wrap | WrapRefusal>
}
/** a page's wrap's bounds: its content streams' decoded bytes, its operators' heap */
export const WRAP_DECODED_PAGE = wrap_js.WRAP_DECODED_PAGE as number
export const WRAP_HELD_PAGE = wrap_js.WRAP_HELD_PAGE as number
