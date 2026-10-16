// links.mjs's types: the links of a laid page (3a; the contract is reader.d.mts `LinkRecord`)
import type { LinkRecord } from './reader.mjs'

/** the schemes a record's `url` may have */
export declare const LINK_SCHEMES: readonly string[]
/** whether `url` is one a record may carry */
export declare function urlAllowed(url: unknown): boolean
/** a page's annotations as PDF.js reports them, or null: a throw, a rejection, a page with no such call, a reply that is no list. Never rejects */
export declare function readAnnots(page: unknown): Promise<unknown[] | null>
/** glyph points as parallel columns */
export interface GlyphPoints { x: number[]; y: number[]; ch: string[] }
/** the glyph points of a page's text items: each non-space character's advance centre on its baseline (PDF.js's rule) */
export declare function pointsOf(items: readonly unknown[] | null | undefined): GlyphPoints
/** a Link annotation a reader can carry, as the page keeps it until it is final */
export interface Annot {
  i: number
  rect: number[]
  boxes: number[][]
  dest?: string | unknown[]
  url?: string
  /** PDF.js's overlaid text, white space collapsed */
  ov: string
  border: { width: number; rgb: number[]; style: 'solid' | 'dashed' | 'underline' } | null
  /** the glyph points inside it */
  g: GlyphPoints
  unsupported?: undefined
}
/** one a reader cannot carry */
export interface Unsupported { i: number; unsupported: true }
/** a page's Link annotations, in PDF.js's order (`i` the rank among them), with the counts of those carried and those not */
export declare function annotsOf(raw: readonly unknown[] | null | undefined, points: GlyphPoints): { list: (Annot | Unsupported)[]; total: number; unsupported: number }
/** whether a point (device pixels) lies where the operations left the paper erased */
export declare function erasedOf(ops: readonly unknown[] | null | undefined): (x: number, y: number) => boolean
/** a unit placed on a page, as ownership reads it: its rectangles [page, x0, y0, x1, y1] */
export interface OwnerUnit { id: number; stream: number; rects: readonly (readonly number[])[] }
/** the unit whose rectangles on page q hold most of the annotation's points (ties: the smaller area, then the smaller id), or null */
export declare function ownerOf(a: Annot, units: readonly OwnerUnit[], q: number): OwnerUnit | null
/** the record of an annotation left over the original's ink (`order` set when the list is ranked) */
export declare function inPlaceOf(a: Annot): LinkRecord
/** the attribution of a record: its source annotations [page, i] and the tier that made it */
export interface LinkSource { annots: [number, number][]; tier: string }
/** a page's links once it is final: the annotations no unit took and none of whose points is erased, in place; any other dropped and counted; sorted and ranked */
export declare function freezeLinks(o: {
  list: readonly (Annot | Unsupported)[] | null
  q: number
  ops: readonly unknown[] | null | undefined
  devOf: (x: number, y: number) => [number, number]
  units: readonly OwnerUnit[]
  consumed?: ReadonlySet<number> | null
  moved?: readonly { rec: LinkRecord; stream?: number; sources?: LinkSource }[]
  sources?: boolean
}): { records: LinkRecord[]; sources: LinkSource[] | null; inPlace: number; dropped: number }
/** a copy of a page's kept links, none of its objects the record's */
export declare function copyLinks(records: readonly LinkRecord[] | null | undefined): LinkRecord[]
