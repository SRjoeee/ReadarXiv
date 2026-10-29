// ocr-pass.mjs's types: the bitmap figures' pass over our base page (PDF-READER §19.15)
import type { OcrLine } from '../layout/bitmap-text.mjs'
import type { ChunkTotals, Written } from '../layer-proto/format.mjs'
import type { OcrBundleUnit } from '../layer-proto/units.mjs'

export declare const OCR_BUDGET_MS: number
export declare const OCR_MIN_SIDE: number
export declare const OCR_MIN_PX: number
export declare const OCR_SEGS_PAGE: number
export declare const OCR_IMAGE_WHYS: readonly ['small', 'big', 'error', 'timeout', 'budget']
/** the cache key of an image's reading: the recogniser's version, the host's reader (its runtime and canvas) and the pixels' name
 *  (their size and kind, then their SHA-256: `<w>x<h>k<kind>.<hex>`) */
export declare function ocrKey(pixels: string, reader: string): string
/** what the pass counts: images painted, read, from the cache, the same as one before, and each why one is not read; the lines
 *  read; the labels drawn and kept, and each why one is left; the recogniser's time; the cache's failures; why no chunk */
export interface OcrStats {
  pages: number
  /** the pages left unread past the host's clock (`until`), and those that could not be read (their images the original's) */
  pagesLeft: number
  pagesFailed: number
  images: { painted: number; read: number; cached: number; again: number; small: number; big: number; error: number; timeout: number; budget: number }
  lines: number
  /** the labels the extension's merge made of the lines: each drawn (`units`) or left with its why (`labels`) */
  boxes: number
  units: number
  kept: number
  labels: Record<string, number>
  recogniseMs: number
  cacheFailed: number
  refused: string | null
  /** the labels' sets (layout/bitmap-text.mjs setsOf): sets of two labels or more, the labels in them, the anchors their columns
   *  changed, the sizes their medians changed */
  sets: { sets: number; grouped: number; aligned: number; sized: number }
  /** ms each step took by `now`: the pages' operator lists, the images' decoding, their digests, the labels */
  ms: { pages: number; decode: number; digest: number; labels: number }
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
  /** what the recogniser runs on, its runtime's and its canvas's packages and versions (onnxruntime-node@1.30.0+napi-canvas@1.0.10) */
  reader: string
  cache?: { get(key: string): Promise<OcrLine[] | null>; put(key: string, lines: OcrLine[]): Promise<void> } | null
  budgetMs?: number
  /** the time by `now` past which no page is read and no image decoded or read (the host's clock on the whole pass) */
  until?: number
  now?: () => number
  unitsDoc?: number
  /** the host's collection, called after each image is read and let go */
  collect?: (() => void) | null
}): Promise<{ units: OcrBundleUnit[]; chunks: (Written & { from: number; to: number })[]; stats: OcrStats }>
