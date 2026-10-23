// delta.mjs's types: our base page as an incremental update over arXiv's PDF, built and proved in the box
import type { DeltaWhy, PageRanges } from './delta-wire.mjs'
import type { PdfLib } from './remove.mjs'

/** the canonical forms' text held at most, and the object and cross-reference streams' decoded bytes at most, per document */
export declare const DELTA_HELD_MAX: number
export declare const DELTA_DECODED_MAX: number
/** the builder's work at most (bytes hashed or compared, objects read): past it the delta is refused */
export declare const DELTA_WORK_MAX: number
/** what a delta reused of the original (the objects its resources name at their top, by kind) and wrote (pages included) */
export interface DeltaStats { replaced: number; reused: { fonts: number; images: number; forms: number; other: number }; included: { bytes: number; objects: number } }
/** a delta built: its section's bytes and digest, the pages it writes, its counts, its startxref in the composed document,
 *  its cross-reference's kind (the original's) and its /Size (the remover's first tail's next number) */
export interface Delta { delta: Uint8Array; sha256: string; replaced: PageRanges; stats: DeltaStats; xref: number; kind: 'table' | 'stream'; size: number }
/** a refusal: the whole base is kept (`full`), its why */
export interface DeltaRefusal { refused: DeltaWhy; why: string }
/** the delta of our final pass over arXiv's PDF (pure, deterministic): the pages the layer lays on (`replacedPages`, every page
 *  of ours by default) that differ from arXiv's written again, their resources mapped to the original's objects where
 *  canonically equal; or a refusal. Never throws but a failed allocation */
export declare function deltaOf(origBytes: Uint8Array, finalBytes: Uint8Array, o: { PL: PdfLib; replacedPages?: number[] | null; heldMax?: number; decodedMax?: number; objectsMax?: number; workMax?: number }): Promise<Delta | DeltaRefusal>
/** the structural proof of a delta in the box: the section exact, the composed page graphs ours (replaced) or the original's,
 *  PDF.js opening the composed bytes with no message of its own, its page count, boxes and text. Never throws but a failed
 *  allocation */
export declare function proveDelta(origBytes: Uint8Array, deltaBytes: Uint8Array, finalBytes: Uint8Array, o: {
  PL: PdfLib
  /** PDF.js's getDocument (the engine's pinned one, its warnings on `console`) */
  getDocument: (options: Record<string, unknown>) => { promise: Promise<unknown>; destroy?: () => Promise<void> }
  documentOptions?: Record<string, unknown>
  replaced: PageRanges
  objectsMax?: number; decodedMax?: number; heldMax?: number
}): Promise<{ ok: true; pages: [ours: number, arxiv: number]; replaced: number } | { ok: false; code: 'delta-proof' | 'delta-xref'; why: string }>
