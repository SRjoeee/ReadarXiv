// layer-cut.mjs's types: the sample paper as BUNDLE 4's objects, for the stand-in of the layer API and the reader's browser checks
import type { LayerIndex, Ref } from '../../../src/pdf-reader/engine/layer-proto/format.mjs'
import type { Row } from '../../../src/pdf-reader/engine/layer-proto/rows.mjs'

export interface SampleCut {
  objects: Map<string, Uint8Array>
  refs: { head: Ref; units: Ref[]; parts: (Ref & { from: number; to: number; prev: string | null })[]; end: { through: number; refused?: string } }
  catalog: Uint8Array
  index: LayerIndex
  paper: { id: string; version: number; pages: number }
  /** each page's left part's digest */
  leftRefs: Record<number, string>
  stats: Record<string, number>
  located: [id: number, stream: number, rects: [page: number, x0: number, y0: number, x1: number, y1: number][]][]
  views: [number, number, number, number][]
  kinds: (string | null)[]
}
export declare function cutSample(files: { pdf: Uint8Array; bundle: Uint8Array }): Promise<SampleCut>
export declare function rowsOf(index: LayerIndex, lang: string, make: (id: number, text: string) => string): Row[]
export declare function sampleFiles(dir?: URL): { pdf: Uint8Array; bundle: Uint8Array }
