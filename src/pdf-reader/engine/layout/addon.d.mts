// addon.mjs's types: a paper's shipped add-on, for the server's remover child, a browser worker, the layer gate and their tests
import type { RemovalManifest } from './addon-manifest.mjs'
import type { LayoutIndex } from './file.mjs'
import type { pageInk } from './ink.mjs'
import type { AlignFacts, PdfLib } from './remove.mjs'

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
 * hard memory limit (layout/remove.mjs head), `inflate` stopping at `limit + 1` bytes. Never throws, but a memory-class
 * failure (pipeline/memory.mjs, C8.4), which it lets through
 */
export declare function paperAddon(o: {
  bytes: Uint8Array; index: LayoutIndex; doc: AddonDocument; OPS: Record<string, number>; PL: PdfLib
  deflate(bytes: Uint8Array): Uint8Array; inflate(bytes: Uint8Array, limit: number): Uint8Array
}): Promise<{ ok: true; tail: Uint8Array; manifest: RemovalManifest; ms: Record<string, number>; ink: InkRead } | { ok: false; refused: string }>

/** the boxes' share of the manifest's caps (half of each): a paper-wide bound, spent in page order over the paper's parts */
export declare const BOXES_BYTES: number
export declare const BOXES_VALUES: number
/** what the remover takes out of a page with kept ink and checks: units [id, glyphs, paths], babel names [occurrence, glyphs],
 *  crops [glyphs, paths] (glyphs as n, k pairs, paths as painted paths' places), the showing operations the planner read, and
 *  the page's alignment facts */
export interface PageRemoval { units: [number, number[], number[]][]; names: [number, number[]][]; crops: [number[], number[]][]; shows: number | undefined; align: AlignFacts }
/** a page's plan for the add-on (pagePlanOf): its kept ink and rules as boxes (x0, y0, x1, y1 stride 4), why the manifest
 *  cannot hold them (null: it can), what they cost of the boxes' share, and the remover's part where there is kept ink */
export interface PagePlan { dirty: number[]; rules: number[]; unfit: string | null; cost: { bytes: number; values: number }; remove?: PageRemoval }
/** a page's plan from the layout file and its ink (pageInk with `indices`): null where nothing is planned; `facts` (or a
 *  function giving them) the page's alignment facts, read only for a page with kept ink the manifest can hold. Pure */
export declare function pagePlanOf(index: LayoutIndex, p: number, ink: ReturnType<typeof pageInk>, facts: AlignFacts | (() => AlignFacts)): PagePlan | null
/** every planned page's plan over PDF.js's document of arXiv's PDF, and the time its operator lists, inks and plans took */
/** the pages whose ink the walk did not read whole (no plan: its operator list not given within OPS_MS, or failing, and given up
 *  on; capped; timed out) or read with its boxes past BOXES_PAGE merged, each that page alone */
export interface InkRead { capped: number[]; timedOut: number[]; degraded: number[] }
export declare function pagePlansOf(o: { doc: AddonDocument; OPS: Record<string, number>; index: LayoutIndex }): Promise<{ plans: Map<number, PagePlan>; ms: { ops: number; ink: number; plan: number }; ink: InkRead }>
/** a manifest entry as the plans make it, before the remover: null for a page the remover is asked about */
export type PlannedEntry = RemovalManifest['page'][number] | null
/** pages `from` to `to` before the remover, the boxes' share spent in page order from `spent`: their entries, the pages the
 *  remover is asked about (rising), the share spent after them */
export declare function rangeEntries(planOf: (p: number) => PagePlan | null, from: number, to: number, spent: { bytes: number; values: number }): { page: Record<number, PlannedEntry>; asked: number[]; spent: { bytes: number; values: number } }
/** the asked pages' entries with the remover's word on each, written into `page` (and returned) */
export declare function withRemoved(page: Record<number, PlannedEntry>, asked: readonly number[], planOf: (p: number) => PagePlan | null, removed: RemovalManifest['page']): RemovalManifest['page']
