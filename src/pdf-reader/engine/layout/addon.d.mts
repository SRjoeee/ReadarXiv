// addon.mjs's types: a paper's shipped add-on, for the server's remover child, a browser worker, the layer gate and their tests
import type { RemovalManifest } from './addon-manifest.mjs'
import type { LayoutIndex } from './file.mjs'
import type { PdfLib } from './remove.mjs'

/** a page of PDF.js's document as the maker reads it (a PDFPageProxy is one) */
export interface AddonPage {
  rotate: number
  commonObjs: { get(id: string): unknown }
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>
}
/** PDF.js's document of arXiv's PDF (a PDFDocumentProxy is one) */
export interface AddonDocument { numPages: number; getPage(page: number): Promise<AddonPage> }
/**
 * a paper's shipped add-on, one a paper whatever the target: the plan from the layout file (layer-proto/removal.mjs
 * pagePlan over each page's ink as `doc` reads it), the removed page R only on a page where kept ink lies under a unit's
 * rectangles (pageDirty), compact; the manifest's `dirty` and the cells' `rules` (pageRules) written; a page the remover
 * refuses written { ok: false, refused } (each reason at most REFUSED_MAX characters), and so is a page whose kept ink or
 * rules the manifest cannot hold (a box past the page's view, an empty one, more than the manifest's caps leave it),
 * which is also left out of R: one such page costs that page, not the paper. `tail` is the bytes after arXiv's (an
 * incremental update): arXiv's bytes followed by it are the add-on's document. The manifest is the shipped form, read back
 * by parseAddonManifest (byte and value caps too) before it is returned; where that fails the paper is refused whole.
 * Imports no `node:*` module (a Node child and a browser worker alike); run it in a process or worker of its own under a
 * hard memory limit (layout/remove.mjs head), `inflate` stopping at `limit + 1` bytes. Never throws
 */
export declare function paperAddon(o: {
  bytes: Uint8Array; index: LayoutIndex; doc: AddonDocument; OPS: Record<string, number>; PL: PdfLib
  deflate(bytes: Uint8Array): Uint8Array; inflate(bytes: Uint8Array, limit: number): Uint8Array
}): Promise<{ ok: true; tail: Uint8Array; manifest: RemovalManifest; ms: Record<string, number> } | { ok: false; refused: string }>
