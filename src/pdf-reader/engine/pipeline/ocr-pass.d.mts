// ocr-pass.mjs's types: the bitmap figures' pass over our base page (PDF-READER §19.15)
import type { OcrLine } from '../../../shared/ocr'
import type { ChunkTotals, Written } from '../layer-proto/format.mjs'
import type { OcrBundleUnit } from '../layer-proto/units.mjs'

export declare const OCR_BUDGET_MS: number
export declare const OCR_MIN_SIDE: number
export declare const OCR_MIN_PX: number
export declare const OCR_SEGS_PAGE: number
export declare const OCR_IMAGE_WHYS: readonly ['small', 'big', 'error', 'timeout', 'budget']
/** the cache key of an image's reading: the recogniser's version and its pixels' digest */
export declare function ocrKey(sha256: string): string
/** what the pass counts: images painted, read, from the cache, the same as one before, and each why one is not read; the lines
 *  read; the labels drawn and kept, and each why one is left; the recogniser's time; the cache's failures; why no chunk */
export interface OcrStats {
  pages: number
  images: { painted: number; read: number; cached: number; again: number; small: number; big: number; error: number; timeout: number; budget: number }
  lines: number
  units: number
  kept: number
  labels: Record<string, number>
  recogniseMs: number
  cacheFailed: number
  refused: string | null
}
/** a page's images under their transforms and clips, and the paths drawn on it */
export declare function paintsOf(list: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }, OPS: Record<string, number>): {
  images: { k: number; id: string; w: number | null; h: number | null; ctm: number[]; clips: number[][][] | 'complex' }[]
  paths: { k: number; segs: number[][]; fill: boolean; box: number[] }[]
}
/** an image's pixels as RGBA */
export declare function rgbaOf(image: { data: Uint8Array | Uint8ClampedArray; width: number; height: number; kind: number }): Uint8ClampedArray
export declare function ocrPass(o: {
  doc: { numPages: number; getPage(n: number): Promise<unknown> }
  OPS: Record<string, number>
  paper: { id: string; version: number }
  source?: { units: readonly unknown[] } | null
  from: number
  before?: ChunkTotals | null
  recognise(pixels: { data: Uint8ClampedArray; width: number; height: number }): Promise<OcrLine[]>
  cache?: { get(key: string): Promise<OcrLine[] | null>; put(key: string, lines: OcrLine[]): Promise<void> } | null
  budgetMs?: number
  now?: () => number
  unitsDoc?: number
}): Promise<{ units: OcrBundleUnit[]; chunks: (Written & { from: number; to: number })[]; stats: OcrStats }>
