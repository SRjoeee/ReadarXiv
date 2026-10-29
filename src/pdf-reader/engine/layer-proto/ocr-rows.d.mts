// ocr-rows.mjs's types: the place of a bitmap figure's label on its page, in its unit (PDF-READER §19.15)

export type OcrAnchor = 'start' | 'centre' | 'end'
export type Point = readonly [number, number]
export type Quad = readonly [Point, Point, Point, Point]
/** a place read: its page, its patches' colour and its ink's (0xRRGGBB), its anchor, its size (PDF units), its set's first label's
 *  id, each line's quad and patch */
export interface OcrPlace {
  readonly page: number
  readonly bg: number
  readonly fg: number
  readonly anchor: OcrAnchor
  readonly size: number
  readonly set: number
  readonly lines: readonly { readonly quad: Quad; readonly patch: Quad }[]
}
export declare const OCR_PLACE_HEAD: number
export declare const OCR_LINE: number
export declare const OCR_PLACE_LINES: number
export declare const OCR_ANCHOR_CODES: readonly ['start', 'centre', 'end']
/** a label on page `page` as its place's numbers, `set` its set's first label's id */
export declare function ocrPlace(page: number, u: { bg: number; fg: number; anchor: OcrAnchor; size: number; quads: readonly (readonly [readonly (readonly [number, number])[], readonly (readonly [number, number])[]])[] }, set: number): number[]
/** whether a value is a place's shape */
export declare function placeStands(v: unknown): boolean
/** a place read, or null where it has no shape */
export declare function placeOf(v: unknown): OcrPlace | null
