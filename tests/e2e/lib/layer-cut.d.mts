// layer-cut.mjs's types: the sample paper as BUNDLE 8's objects, a layer over our own compile, for the stand-in of the layer API and
// the reader's browser checks
import type { LayerIndex, Ref } from '../../../src/pdf-reader/engine/layer-proto/format.mjs'
import type { Row } from '../../../src/pdf-reader/engine/layer-proto/rows.mjs'

export interface SampleCut {
  objects: Map<string, Uint8Array>
  refs: { head: Ref; units: Ref[]; parts: (Ref & { from: number; to: number; prev: string | null })[]; end: { through: number; refused?: string } }
  catalog: Uint8Array
  index: LayerIndex
  paper: { id: string; version: number; pages: number }
  /** our base page the head names: the wrapped pass's length, digest and bytes (the stand-in serves it at
   *  /api/v1/base/<id>v<n>/<sha256>); null where the base is a delta */
  base: { bytes: number; sha256: string; data: Uint8Array } | null
  /** the delta a `base: 'delta'` cut's head names (its bytes `data`, served at the layer's object route by its digest; its key
   *  deltaKey's), our page it was made of, and the original it extends; null for a cut of `base: 'ours'` */
  delta: { bytes: number; sha256: string; key: string; xref: number; replaced: [from: number, to: number][]; data: Uint8Array } | null
  ours: Uint8Array | null
  orig: { bytes: number; sha256: string; xref?: number }
  /** each page's left part's digest */
  leftRefs: Record<number, string>
  stats: Record<string, number>
  located: [id: number, stream: number, rects: [page: number, x0: number, y0: number, x1: number, y1: number][]][]
  views: [number, number, number, number][]
  kinds: (string | null)[]
  /** the original's numbers no unit holds (a table's cells of numbers among them), as located units are given */
  numbers: [text: string, stream: null, rects: [page: number, x0: number, y0: number, x1: number, y1: number][]][]
}
/** the wrap's head fields of the sample's wrapped pass (tests/fixtures/pdf/ocg/sample-1-wrapped.json) */
export interface SampleWrap { bytes: number; sha256: string; xref: number; stats: Record<string, unknown>; unhidden: [id: number, why: string][]; labelKept: number[]; figures: { units: object[]; stats: Record<string, number> } }
/** the sample cut, its base the wrapped pass itself (`ours`, the default) or held as a delta over the stand-in PDF (`delta`) */
export declare function cutSample(files: { pdf: Uint8Array; bundle: Uint8Array; wrapped: Uint8Array; wrap: SampleWrap }, o?: { base?: 'ours' | 'delta' }): Promise<SampleCut>
export declare function rowsOf(index: LayerIndex, lang: string, make: (id: number, text: string) => string): Row[]
export declare function sampleFiles(dir?: URL, ocg?: URL): { pdf: Uint8Array; bundle: Uint8Array; wrapped: Uint8Array; wrap: SampleWrap }
