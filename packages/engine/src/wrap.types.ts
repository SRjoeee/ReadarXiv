// The types of wrap.mjs (today's wrapOf and planOf, moved as they are into the engine package, JavaScript until their port):
// what their declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
import type { WrapStats } from './delta-wire.types.ts'
import type { PdfLib } from './remove.types.ts'
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
}
export const planOf = wrap_js.planOf as (
  glyphs: { n?: number; k?: number }[],
  groupOfGlyph: (string | null)[],
  paths: ArrayLike<number>,
  groupOfBox: (string | null)[],
  facts?: { images?: number } | null,
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
export type Wrap = {
  bytes: Uint8Array
  xref: number
  sha256: string
  pages: Map<number, WrapPage>
  groups: Map<string, number>
  stats: Omit<WrapStats, 'unhidden' | 'labelKept'>
  forms?: number
  unwrapped?: true
}
export const wrapOf = wrap_js.wrapOf as (
  finalBytes: Uint8Array,
  plans: Map<number, WrapPlan>,
  o: {
    PL: PdfLib
    deflate: (b: Uint8Array) => Uint8Array
    inflate: (b: Uint8Array, limit: number) => Uint8Array
    groupsPage?: number
    sequencesPage?: number
    groupsDoc?: number
  },
) => Promise<Wrap | WrapRefusal>
/** a page's wrap's bounds: its content streams' decoded bytes, its operators' heap */
export const WRAP_DECODED_PAGE = wrap_js.WRAP_DECODED_PAGE as number
export const WRAP_HELD_PAGE = wrap_js.WRAP_HELD_PAGE as number
