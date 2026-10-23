// delta.mjs's types: our base page as an incremental update over arXiv's PDF, built and proved in the box
import type { TextRecord } from './page-text.mjs'
/** a host's reading of one of the proof's documents: the getDocument options of its own over the proof's, and its reading of the
 *  document the proof opened and gives it (each page's text record), the document the host's to keep and destroy */
export interface DeltaReader { options?: Record<string, unknown>; read(doc: { numPages: number; getPage(n: number): Promise<unknown>; loadingTask?: unknown }): Promise<readonly (TextRecord | null)[]> }
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
  /** the host's own readings of arXiv's PDF (`orig`) and of our final pass (`ours`), in place of the proof's: the proof opens the
   *  document of its own bytes (ours given up where `own`) at verbosity 1, with `options` over `documentOptions`, under its capture
   *  of the console, and gives it to `read`, which reads every page's text record (readArxivText `pageTexts`) and keeps it */
  readers?: { orig?: DeltaReader; ours?: DeltaReader & { own?: boolean } } | null
  objectsMax?: number; decodedMax?: number; heldMax?: number
}): Promise<{ ok: true; pages: [ours: number, arxiv: number]; replaced: number } | { ok: false; code: 'delta-proof' | 'delta-xref'; why: string }>
export declare function wrappedPagesOf(PL: import('./remove.mjs').PdfLib, doc: unknown): number[]
