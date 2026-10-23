// xref.mjs's types: a PDF's objects as PDF.js reads them, by the cross-reference
/** the refusal of a document this reader will not read: `code` the delta's why */
export declare class XrefRefusal extends Error { code: import('./delta-wire.mjs').DeltaWhy }
/** a page of the page tree: its ref, its dict and the attributes it inherits (its own over its ancestors') */
export interface PageNode { ref: unknown; node: unknown; inherited: { Resources?: unknown; MediaBox?: unknown; CropBox?: unknown; Rotate?: unknown } }
export interface PdfObjects {
  kind: 'table' | 'stream'; startxref: number; size: number
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
export declare function openObjects(bytes: Uint8Array, o: { PL: import('./remove.mjs').PdfLib; objectsMax: number; decodedMax: number }): PdfObjects
