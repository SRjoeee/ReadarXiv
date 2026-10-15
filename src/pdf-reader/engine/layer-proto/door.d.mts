// The door's contract, BUNDLE 4 (types only; E4b folds it into reader.d.mts). The layer of one paper and target as the view
// reads it: parts arrive over time (addPart), a page is `waiting` until a part covers it and the rows it needs are in,
// `laying` once asked (or in an asked page's closure), `ready` once laid, `failed` if it cannot be. Sources: the bundle 4
// contract C7 as amended by M9 and M10, and the reader view's D-1 to D-9 (reader-view-contract.md 2.4). The conformance suite
// tests/pdf-reader/helpers/door-conformance.ts holds every obligation below that is about readiness; the fake door
// (tests/pdf-reader/helpers/fake-door.ts) and E4b's real one run it.
import type { Ref, LayerIndex, ReadLeftPart, ReadPart } from './format.mjs'
import type { FaceSources } from './fonts.mjs'
import type { LayerDocument, LayerStats } from './reader.mjs'
import type { Row } from './rows.mjs'
import type { FrozenRuleSet } from '../rules/layout.mjs'

export type { LayerDocument, LayerStats } from './reader.mjs'

/** a page's state moves `waiting` > `laying` > `ready` or `failed`, nothing else (DR5), each told once (D-1). `waiting`: no
 *  part covers it yet, or what its closure needs is not in (a part, a row), or nobody has asked for it (the Layer lays what is
 *  asked, and the pages of an asked page's closure); `laying`: asked, or in an asked page's closure, with all of that in;
 *  `ready`: laid, final within the Layer (DR3); `failed`: its composed page did not render or read, or no part will cover it
 *  (after endParts()). A part with `layout: null` still covers its pages */
export type PageState = 'ready' | 'laying' | 'waiting' | 'failed'
/** a state `onPage` tells: `waiting` is the state before any is told */
export type PageEvent = Exclude<PageState, 'waiting'>

/** the page's drawn tokens in drawing order, plain data (the engine's 2b; D-9: empty until then, the view mirrors the left) */
export interface PageWords { readonly [key: string]: unknown }
/** a link of a laid page, plain data (the engine's 3a; D-9: empty until then) */
export interface LinkRecord {
  /** [x0, y0, x1, y1] × n, PDF units of the page, one for each drawn line */
  boxes: number[]
  dest?: string | unknown[]
  url?: string
  name: string
  moved: boolean
  order: number
  border?: { width: number; rgb: [number, number, number] }
}
/** a laid page, new on every call (DR1): `svg` a new element of equal `outerHTML`, `words` and `links` equal data that are not
 *  the same objects; lang set, scale 2.5; the host's to keep or drop */
export interface LaidPage { svg: SVGSVGElement; w: number; h: number; words: PageWords; links: LinkRecord[] }
/** a page of the left, parsed: the part's tokens, spans and pairs (an empty part, `table.n` 0, has no shapes) */
export type LeftPage = ReadLeftPart

export interface Layer {
  /** each row as v0's unit: the pages that no longer wait for rows (a row that is no unit is skipped and counted) */
  take(rows: readonly Row[]): { complete: number[] }
  /** no more rows: every page is complete with what it holds */
  end(): void
  /**
   * The next part, read against this Layer's index (readPart). `doc`: the composed document through this part's tail, opened
   * with PDF_OPTIONS; required iff `part.addon?.tail`, refused (TypeError) otherwise. Sync. Throws BundleRefusal for another
   * head, for a part out of order (pages[0] is not through + 1, or prev is not the last part's digest), for a `doc` whose
   * numPages is not N + part.chain.r; TypeError for a missing or invalid doc; changing nothing. The same part again (its
   * sha256 told) is a no-op. After endParts() it throws BundleRefusal; after dispose() it is a no-op. A part with a tail
   * swaps the document: the one it replaces is told to `onRetired` once no task reads it
   */
  addPart(part: ReadPart, o?: { doc?: LayerDocument }): void
  /** no more parts (the catalog's end): every page no part covers becomes `failed`, told once; its pageOf and leftPageOf reject */
  endParts(): void
  /** sync; throws after dispose. A page a part covers is never `waiting` for that part again */
  pageState(page: number): PageState
  /** each page's `laying`, then its `ready` or `failed`, once, in the order they happen (pages of a closure too). Returns the unsubscribe */
  onPage(listener: (page: number, state: PageEvent) => void): () => void
  /**
   * The page laid, a fresh LaidPage on every call (D-2). On `waiting` or `laying` it resolves when laid. It rejects on
   * `failed`, on a page uncovered when endParts() ends the parts, on dispose, and on `signal` abort (an AbortError). An aborted
   * ask drops its page from the targets: a page still `waiting` is not laid when a part covers it unless asked again; a page
   * already `laying` is laid anyway (a state never goes back). Throws synchronously after dispose
   */
  pageOf(page: number, o: { lang: string; signal?: AbortSignal }): Promise<LaidPage>
  /**
   * The page of the left, parsed and cached (D-5): its ref is fetched once, on the first want, through `openLayer`'s
   * `leftPart(page, ref)`. Waits until the part covering the page is added; rejects on a page uncovered when endParts() ends the
   * parts and on dispose; a failed fetch is not cached. `signal` aborts the wait: an AbortError for this ask, and once no ask is left
   * for a page still awaiting its covering part, nothing is fetched. Throws synchronously after dispose
   */
  leftPageOf(page: number, o?: { signal?: AbortSignal }): Promise<LeftPage>
  /** the ready page's copy at a view's resolution, for any ready page after end() until dispose (D-4); throws after dispose */
  copyOf(page: number, source: CanvasImageSource & { width: number; height: number }, k: number): Promise<HTMLCanvasElement>
  /** the unit at a point of a page (the parts' left rectangles, PDF units), the smallest where several hold it; null where none
   *  is located or the page is uncovered (D-6). Answers after dispose */
  unitAt(page: number, x: number, y: number): number | null
  /** answers after dispose */
  stats(): LayerStats & { parts: { through: number; told: number } }
  /** idempotent. Every pending pageOf and leftPageOf rejects; the last document is told to `onRetired`; after it addPart is a
   *  no-op and pageOf, leftPageOf, copyOf and pageState throw */
  dispose(): void
}

export interface OpenLayerOptions {
  /** indexOf(head, chunks): the head and every unit */
  index: LayerIndex
  /** arXiv's PDF followed by the tails of `parts`, opened once with PDF_OPTIONS: numPages is N + the last part's chain.r */
  doc: LayerDocument
  /** the parts told at open, in order (a warm visit); the document is the one through the last tail */
  parts?: readonly ReadPart[]
  target: string
  faceSources: FaceSources
  hyphUrl: (lang: string) => string
  rules?: FrozenRuleSet
  /** the host's transport for the left parts: the bytes of the object `ref` names (the Layer runs readLeftPart on them) */
  leftPart(page: number, ref: Ref & { page: number }): Promise<Uint8Array>
  /** a superseded document is no longer read (told at the swap, once the tasks reading it are done), and once at dispose for the
   *  last: the host destroys it. The Layer never destroys a document */
  onRetired(doc: LayerDocument): void
}
/** one open layer at a time: a second before the first's dispose throws */
export declare function openLayer(o: OpenLayerOptions): Promise<Layer>
