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
  /** the reader's toggles (rules/content-classes.mjs TOGGLE_DEFAULTS where not given): a class they do not show is the original's */
  classes?: Partial<Record<'heads' | 'tables' | 'figures' | 'references' | 'names', boolean>> | null
  faceSources: FaceSources
  hyphUrl(lang: string): string
  rules?: FrozenRuleSet
  /** every object of the layer by its ref: its bytes (the host owns the route, any cache and retries; the side runs the
   *  format's readers on them: cap, digest against the ref, values, shape, chain). A rejection is that object refused */
  fetchObject(ref: Ref, signal: AbortSignal): Promise<Uint8Array>
  /** the host's base check, once, after the head is read and before any composed document: true where the host's source of
   *  arXiv's bytes is head.base; false (or a rejection) is no layer (refused 'base') */
  bind(base: { bytes: number; sha256: string; xref: number }): Promise<boolean>
  /** the composed document (our wrapped base, whole or as a delta over arXiv's PDF; the first argument is always null: no tail),
   *  opened with the view's assets, PDF_OPTIONS and disableAutoFetch, once a head; the task is the side's (destroyed once no door
   *  reads it, and at dispose) */
  composed: ComposedOpener
  /** the engine's door (the tests'); the layer entry's openLayer by default */
  openLayer?: typeof openLayer
  /** the most device pixels of laid pages' drawings kept off the view (this device's keepBudget by default; 0 keeps none) */
  keepPixels?: number
  /** how many pages past the near ones are laid ahead while the reader rests (AHEAD_PAGES by default; 0 lays none) */
  ahead?: number
}
export interface LayerSide {
  /** what the host has heard, any number of times, from any source, in any order: merged, deduplicated by digest, fetched
   *  through fetchObject (units and head at once, parts in parallel, read and added in page order); a part beginning at or
   *  before the last told under another digest is a fork: the door opened again over the new chain */
  tell(refs: { units?: readonly TellRef[]; head?: TellRef | null; parts?: readonly TellRef[]; end?: { through: number; refused?: string } | null }): void
  /** the index once read; null where the layer is refused or the side disposed. The rows' parsers read it */
  index(): Promise<LayerIndex | null>
  /** rows the host read before any part (a first open's deltas, told while the box lays the paper out), for the first page's
   *  early wave of faces alone: their CJK characters, of the units warm.mjs firstPageUnits estimates on page 1, asked of the
   *  target's CJK face; not taken, nothing laid of them, nothing once a part is read or the parts' end told */
  warmEarly(rows: readonly Row[]): void
  /** rows: before the door opens held (latest per unit id); kept for the contents, the sentences and a fork's open again */
  take(rows: readonly Row[]): void
  /** no more rows this attempt */
  end(): void
  /** a later attempt: the door disposed and opened again over the latest document with every part added, and no row carried
   *  (the host takes its rows again). Pages laid keep their drawing until the new door's page is ready */
  again(): void
  /** the layer in another language, in place (`to` a target of the rules'; the same target or a refused side: nothing): the door
   *  laying the one before let go at once, so that nothing it lays or copies is put in place, then the open again as again() does,
   *  over the same composed document (no document opened or read again). The host takes the new target's rows as they come; a page
   *  laid keeps the target before until the new one's page commits or fails, or dropOthers */
  retarget(to: string): void
  /** the reader's toggles changed: the door opened again over the same documents, parts and rows (nothing fetched or translated),
   *  each laid page keeping its drawing until the new door's commits; the same toggles again, nothing */
  setClasses(classes: Partial<Record<'heads' | 'tables' | 'figures' | 'references' | 'names', boolean>> | null): void
  /** every page that still shows another target's layer back to the original's page: the host's word that this target's rows
   *  will not come (its service failed, or the translation stopped short) */
  dropOthers(): void
  /** the ids of the units whose rows the open door's page still waits for (the door's rowsFor: its closure's, Need(page)),
   *  for a host that translates as it shows to translate first; [] with no door, out of the paper, or once the page is ready */
  rowsFor(page: number): number[]
  /** `late` and `skipped` are the door's to tell (engine gap: not in its stats): 0 and {} until it does; `original`, the pages asked
   *  near the view that this door shows as arXiv's by the rule (noLayoutPage), never laid */
  coverage(): { laid: number; original: number; total: number; late: number; failed: number; stalled: number; skipped: Record<string, number>; parts: { through: number; told: number } }
  /** the harness's hooks: counts and states, a ring of the last commits (page@ms), never a page's text */
  probe(): Readonly<Record<string, number | string | boolean | null>>
  /** the door and every composed task let go; each place back to its pre-layer content; 'layer' not emitted after */
  dispose(): void
}
/** sync; opens nothing until it can. One side per view: a second while one lives throws */
export declare function createLayerSide(view: ReaderView, o: LayerSideOptions): LayerSide
export declare const PAGE_MS: number
/** the most device pixels of laid pages' drawings kept off the view on any device, put back as their pages come near again */
export declare const KEEP_PIXELS: number
/** the share of a device's memory its kept drawings may take */
export declare const KEEP_SHARE: number
/** the memory a device is taken to have where its browser does not say, GB */
export declare const KEEP_MEMORY_GB: number
/** this device's budget of kept drawings, device pixels: KEEP_SHARE of its memory, at least two screens, at most KEEP_PIXELS */
export declare function keepBudget(o?: { deviceMemory?: number; screenPixels?: number; ios?: boolean }): number
/** the most kept on iOS and iPadOS */
export declare const IOS_KEEP_PIXELS: number
/** whether the browser runs on iOS or iPadOS */
export declare function onIos(nav?: { userAgent?: string; maxTouchPoints?: number } | null): boolean
/** how many pages past the near ones are laid ahead while the reader rests, once the rows have ended */
export declare const AHEAD_PAGES: number
/** how long the view rests before the pages ahead are laid, ms */
export declare const AHEAD_IDLE_MS: number
/** the translating card's padding where the sheet gives none (engine.css --axt-tr-pad-x and -pad-y), CSS pixels at the reader's 100 % */
export declare const PAD_X: number
export declare const PAD_Y: number
export declare const COPY_PIXELS: number
export declare const RECOPY_MS: number
/** the longest a laid page's copy waits for the left's page to be drawn before it is put in place, ms */
export declare const LEFT_WAIT_MS: number
/** how long a laid page's text layer may wait for the main thread to be idle before it is built anyway (ms) */
export declare const TEXT_IDLE_MS: number
export declare const LEFT_RETRY_MS: number
/** the most other pages a wanted page's running units bring their left parts from, the nearest first */
export declare const SPREAD_MAX: number
/** whether page `n` is laid by no layout: some part owns it by its pages and no part that holds it, by its pages or its reach, has a layout */
export declare function noLayoutPage(parts: readonly { readonly pages: readonly [number, number]; readonly reach?: number; readonly layout: unknown }[], n: number): boolean
/** the pages whose left parts page p's running units bring: their other pages not in yet, each once, nearest first, at most `max` */
export declare function spreadPages(p: number, ids: readonly number[], pagesOf: (id: number) => readonly number[] | undefined, isIn: (page: number) => boolean, max?: number): number[]
