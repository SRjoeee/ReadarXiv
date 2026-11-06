// The types of xref.mjs (today's module, moved as it is into the engine package, JavaScript until its port): what
// its declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as xref_js from './xref.mjs'
/** the refusal of a document this reader will not read: `code` the delta's why */
export interface XrefRefusal extends Error {
  code: import('./delta-wire.types.ts').DeltaWhy
}
export const XrefRefusal = xref_js.XrefRefusal as { new (...args: unknown[]): XrefRefusal }
/** a page of the page tree: its ref, its dict and the attributes it inherits (its own over its ancestors') */
export interface PageNode {
  ref: unknown
  node: unknown
  inherited: { Resources?: unknown; MediaBox?: unknown; CropBox?: unknown; Rotate?: unknown }
}
export interface PdfObjects {
  kind: 'table' | 'stream'
  startxref: number
  size: number
  trailer: { root: unknown; info?: unknown; id?: unknown; size?: number }
  /** the newest section's own /Root, /Info and /ID, as written */
  own: { root?: unknown; info?: unknown; id?: unknown }
  /** the object a ref names (a stream's data the bytes its resolved /Length names), undefined for none */
  lookup(ref: unknown): unknown
  numbers(): number[]
  pages(): PageNode[]
  entryOf(n: number): { t: 0 } | { t: 1; off: number; g: number } | { t: 2; stm: number; i: number; g: 0 } | null
  dataAt(ref: unknown): [start: number, length: number] | null
}
/** the objects of a PDF by its cross-reference sections; throws XrefRefusal where it will not read the document */
export const openObjects = xref_js.openObjects as (
  bytes: Uint8Array,
  o: { PL: import('./remove.types.ts').PdfLib; objectsMax: number; decodedMax: number },
) => PdfObjects
