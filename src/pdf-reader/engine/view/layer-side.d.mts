// layer-side.mjs's types: the layer's side of the reading view, the one sink of a paper's layer
import type { FaceSources } from '../layer-proto/fonts.mjs'
import type { LayerIndex, Ref } from '../layer-proto/format.mjs'
import type { openLayer } from '../layer-proto/reader.mjs'
import type { Row } from '../layer-proto/rows.mjs'
import type { FrozenRuleSet } from '../rules/layout.mjs'
import type { TellRef } from './feed.mjs'
import type { ComposedOpener, ReaderView } from './reader-view.mjs'

export type { TellRef } from './feed.mjs'
/** the layer's transport and its two openers, the host's */
export interface LayerSideOptions {
  paper: { id: string; version: number }
  /** the target's language tag (the rows', the layer's, the SVG's lang) */
  target: string
  faceSources: FaceSources
  hyphUrl(lang: string): string
  rules?: FrozenRuleSet
  /** every object of the layer by its ref: its bytes (the host owns the route, any cache and retries; the side runs the
   *  format's readers on them: cap, digest against the ref, values, shape, chain). A rejection is that object refused */
  fetchObject(ref: Ref, signal: AbortSignal): Promise<Uint8Array>
  /** the host's base check, once, after the head is read and before any composed document: true where the host's source of
   *  arXiv's bytes is head.base; false (or a rejection) is no layer (refused 'base') */
  bind(base: { bytes: number; sha256: string; xref: number }): Promise<boolean>
  /** the composed document: arXiv's PDF followed by every tail told (null for none), opened with the view's assets,
   *  PDF_OPTIONS and disableAutoFetch; the task is the side's (destroyed once no door reads it, and at dispose) */
  composed: ComposedOpener
  /** the engine's door (the tests'); the layer entry's openLayer by default */
  openLayer?: typeof openLayer
}
export interface LayerSide {
  /** what the host has heard, any number of times, from any source, in any order: merged, deduplicated by digest, fetched
   *  through fetchObject (units and head at once, parts in parallel, read and added in page order); a part beginning at or
   *  before the last told under another digest is a fork: the door opened again over the new chain */
  tell(refs: { units?: readonly TellRef[]; head?: TellRef | null; parts?: readonly TellRef[]; end?: { through: number; refused?: string } | null }): void
  /** the index once read; null where the layer is refused or the side disposed. The rows' parsers read it */
  index(): Promise<LayerIndex | null>
  /** rows: before the door opens held (latest per unit id); kept for the contents, the sentences and a fork's open again */
  take(rows: readonly Row[]): void
  /** no more rows this attempt */
  end(): void
  /** a later attempt: the door disposed and opened again over the latest document with every part added, and no row carried
   *  (the host takes its rows again). Pages laid keep their drawing until the new door's page is ready */
  again(): void
  /** the ids of the units whose rows the open door's page still waits for (the door's rowsFor: its closure's, Need(page)),
   *  for a host that translates as it shows to translate first; [] with no door, out of the paper, or once the page is ready */
  rowsFor(page: number): number[]
  /** `late` and `skipped` are the door's to tell (engine gap: not in its stats): 0 and {} until it does */
  coverage(): { laid: number; total: number; late: number; failed: number; stalled: number; skipped: Record<string, number>; parts: { through: number; told: number } }
  /** the harness's hooks: counts and states, a ring of the last commits (page@ms), never a page's text */
  probe(): Readonly<Record<string, number | string | boolean | null>>
  /** the harness's registration check of a page this door laid near the view: its copy drawn twice, from the source a commit
   *  takes (PDF.js's canvas of the left's or the place's page) and from the page drawn at the place's k (exact by
   *  construction), the two compared pixel by pixel over their common size. Null where page `n` is not laid near the view */
  registration(n: number, o?: { tolerance?: number; canvases?: boolean }): Promise<Registration | null>
  /** the door and every composed task let go; each place back to its pre-layer content; 'layer' not emitted after */
  dispose(): void
}
/** what registration() found: the place's k and the source's, the device pixels of the page's width PDF.js left off the
 *  source (`lost`: k × width − the source's width), and, where the source is a canvas of PDF.js's (`from` 'left' or
 *  'place'), the pixels compared and those differing by more than the tolerance in a channel */
export interface Registration {
  page: number
  /** the page's width and height in PDF units */
  size: [number, number]
  from: 'left' | 'place' | 'doc'
  k: number
  kSource: number
  lost: number
  source: [number, number]
  /** the commit's own path timed (ms): its source got (a canvas PDF.js drew, or the page drawn from the document), its copy drawn;
   *  `doc`: the page drawn from the composed document, timed where the commit's own source was a canvas of PDF.js's */
  ms: { source: number; copy: number; doc?: number }
  /** the size of the page drawn from the document */
  doc?: [number, number]
  /** the pixels compared with the other source's copy, and those differing: the other source is the page drawn from the document
   *  (when the commit's is a canvas of PDF.js's), or, over our base, the left's canvas where PDF.js drew it at this k */
  compared?: number
  differing?: number
  maxDiff?: number
  /** with `canvases`: the two copies (the commit's source's, the other's), which the caller lets go */
  copies?: { source: HTMLCanvasElement; doc: HTMLCanvasElement }
}
/** sync; opens nothing until it can. One side per view: a second while one lives throws */
export declare function createLayerSide(view: ReaderView, o: LayerSideOptions): LayerSide
export declare const PAGE_MS: number
export declare const COPY_PIXELS: number
export declare const RECOPY_MS: number
/** how long a laid page's text layer may wait for the main thread to be idle before it is built anyway (ms) */
export declare const TEXT_IDLE_MS: number
export declare const LEFT_RETRY_MS: number
/** the most other pages a wanted page's running units bring their left parts from, the nearest first */
export declare const SPREAD_MAX: number
/** whether page `n` is laid by no layout: some part owns it by its pages and no part that holds it, by its pages or its reach, has a layout */
export declare function noLayoutPage(parts: readonly { readonly pages: readonly [number, number]; readonly reach?: number; readonly layout: unknown }[], n: number): boolean
/** the pages whose left parts page p's running units bring: their other pages not in yet, each once, nearest first, at most `max` */
export declare function spreadPages(p: number, ids: readonly number[], pagesOf: (id: number) => readonly number[] | undefined, isIn: (page: number) => boolean, max?: number): number[]
