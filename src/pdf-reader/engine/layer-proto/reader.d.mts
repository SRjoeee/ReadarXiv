// reader.mjs's types: the reader's door, the one module both readers take the instant layer's engine values from. The door's
// contract (BUNDLE 4: the bundle 4 contract C7 as amended by M9, M10 and M18, the reader view's D-1 to D-9, the engine lane's
// pageof-contract) lives here; door.d.mts names the same types for the hosts that code against it. The conformance suite
// tests/pdf-reader/helpers/door-conformance.ts holds every obligation below that is about readiness; the fake door
// (tests/pdf-reader/helpers/fake-door.ts) and this one run it
import type { FaceId } from '../rules/font-roles.mjs'
import type { ReadBundle } from './bundle.mjs'
import type { FaceSources } from './fonts.mjs'
import type { LayerIndex, ReadLeftPart, ReadPart, Ref } from './format.mjs'
import type { Row } from './rows.mjs'
import type { PageWords } from './words.mjs'
import type { FrozenRuleSet, RULES_SCHEMA } from '../rules/layout.mjs'

export { PDF_OPTIONS } from './run.mjs'
export { BUNDLE, BUNDLE_CAP, BUNDLE_VALUES, BundleRefusal, bundleKey, CTAG, readBundle, VTAG } from './bundle.mjs'
export { batchesOf, layerRows, rowOf, runRows, toTranslate, unitOf } from './rows.mjs'
export { ADDON_CAP, ADDON_MANIFEST_CAP, ADDON_MANIFEST_VALUES, parseAddonManifest } from '../layout/addon-manifest.mjs'
export { indexLayout, LAYOUT, LAYOUT_CAP, LAYOUT_VALUES, LayoutRefusal, parseLayout } from '../layout/file.mjs'
export { trPiecesOf } from '../layer/pieces.mjs'
export { FACES } from '../rules/font-roles.mjs'
export { translateUnits } from '../translate/mt.mjs'
export type { LayerBundle, ReadBundle } from './bundle.mjs'
export type { Row } from './rows.mjs'
export type { Unit } from './run.mjs'
export type { FaceId } from '../rules/font-roles.mjs'
export type { FaceSources } from './fonts.mjs'
export type { RemovalManifest } from '../layout/addon-manifest.mjs'

/** the composed document as PDF.js opened it (a PDFDocumentProxy): arXiv's PDF followed by the removed pages of the parts told
 *  (BUNDLE 4) or of the bundle's add-on (BUNDLE 3), opened once with PDF_OPTIONS, or arXiv's PDF alone */
export interface LayerDocument { numPages: number; getPage(n: number): Promise<unknown> }
/** what the layer has done so far */
export interface LayerStats {
  /** the units the layer awaits rows for: the target's (toTranslate) */
  units: number
  /** the units laid and drawn */
  drawn: number
  /** the pages ready, rising */
  pages: number[]
  /** the longest a unit's lay and paint took, ms (one unit a task) */
  slowestTaskMs: number
  /** each page's step, ms: its original drawn and read, its units laid and painted (less the rows it waited for) */
  pageMs: Readonly<Record<number, number>>
  /** the rows skipped as no unit of the paper's (unitOf's null) */
  dropped: number
  /** the Link annotations of the pages read, by what became of them: `total` the ones a reader can carry, `inPlace` those left
   *  over the original's ink, `moved` those laid over the layer's own drawing, `dropped` the rest by reason (`unmatched`: over
   *  erased text and matched by nothing; `ambiguous`; `unplaced`), `unsupported` those it cannot carry (a named action, a script,
   *  an attachment, a url outside the allow-list, a rectangle with no area), `unread` the pages whose annotations could not be
   *  read. `inPlace`, `moved` and `dropped` count the pages frozen so far, the others the pages drawn */
  links: { total: number; inPlace: number; moved: number; dropped: { unmatched: number; ambiguous: number; unplaced: number }; unsupported: number; unread: number }
  /** the layout rule set the layer was opened with: its schema and version */
  rules: { schema: typeof RULES_SCHEMA; version: number }
}

/** a page's state moves `waiting` > `laying` > `ready` or `failed`, nothing else (DR5), each told once (D-1). `waiting`: no
 *  part covers it yet, or what its closure (Need(p): the pages and units laying it reads) needs is not in (a part, a row), or
 *  the Layer has not taken it (it lays what is asked, a page by its closure alone, not every page before it); `laying`: taken
 *  with all of that in, when the drive turns to it (an asked page at once where nothing else is laid; one an ask overtook
 *  before the drive reached it is never taken), or laid with a page taken (its closure inside that one's); `ready`: laid, final
 *  within the Layer (DR3), told too where another page's closure made it so; `failed`: its composed page did not render or
 *  read, or no part will cover it (after endParts()). A page drawn for another page's closure and not laid with it stays
 *  `waiting`. A part with `layout: null` still covers its pages */
export type PageState = 'ready' | 'laying' | 'waiting' | 'failed'
/** a state `onPage` tells: `waiting` is the state before any is told */
export type PageEvent = Exclude<PageState, 'waiting'>
export type { PageWords } from './words.mjs'
/** a link of a laid page, plain data (links.mjs, the engine's 3a: a link over text the layer redraws laid over what is drawn of
 *  it, `moved: true`; one over the original's ink left where it stands, `moved: false`; one over erased text that matched
 *  nothing dropped, never left). The contract the gate measures (lab/pdf/README.md, "The links"):
 *  - `boxes`: [x0, y0, x1, y1] x n (x0 < x1, y0 < y1) in the page's PDF user space, unrotated, y up; moved, one box a drawn line
 *  - `dest` or `url`, exactly one. `dest` as PDF.js gives it, never resolved by the engine; `url` PDF.js's validated url only,
 *    and then of http:, https: or mailto: alone
 *  - `name`, never empty for a link with glyphs: the drawn characters under it (moved), over a crop the original's text under it
 *    (its overlaid text: what the crop shows there; the crop's own text where that is none and it is the crop's one link), the translated pair's
 *    text, PDF.js's overlaid text (in place); '' only for a glyphless link in place, which the view names
 *  - `moved`: true for every record laid over the layer's own drawing (a matched record), even where it lands on the original's
 *    spot; false for one left over the original's ink
 *  - `order`: the rank 0..n-1 of the list, sorted; a unit's links (in place ones too) at the unit's place in the reading order,
 *    then those no unit owns, moved before in place, in drawing order or PDF order
 *  - `border`: where the annotation has a border of a width and a colour; `style` as it draws */
export interface LinkRecord {
  /** [x0, y0, x1, y1] × n, PDF units of the page, one for each drawn line */
  boxes: number[]
  dest?: string | unknown[]
  url?: string
  name: string
  moved: boolean
  order: number
  border?: { width: number; rgb: [number, number, number]; style?: 'solid' | 'dashed' | 'underline' }
}
/** a laid page, new on every call (DR1): `svg` a new element of equal `outerHTML`, `words` and `links` equal data that are not
 *  the same objects (`words` always present: a page with no painted unit has an empty table, `tokens.n` 0); lang set, scale 2.5;
 *  the host's to keep or drop */
export interface LaidPage { svg: SVGSVGElement; w: number; h: number; words: PageWords; links: LinkRecord[] }
/** a page of the left, parsed: the part's tokens, spans and pairs (an empty part, `table.n` 0, has no shapes) */
export type LeftPage = ReadLeftPart

/** the layer of one paper and target, open. A run that cannot go on (a memory error, or any other its drawing meets) leaves the
 *  layer terminal: every page not ready is told `failed`, once; every pending and later pageOf (of a page not ready) and
 *  leftPageOf rejects with that error; addPart and endParts are no-ops; a ready page still answers, until dispose */
export interface Layer {
  /** each row as v0's unit (a row that is no unit is skipped and counted): `complete`, the pages newly complete, each told once:
   *  laying it waits for no row and no part more (its closure's, Need(p)), so pages come out of the stream's order (page 137
   *  before page 3, whose closure waits for a float translated later) */
  take(rows: readonly Row[]): { complete: number[] }
  /** no more rows: every page is complete with what it holds */
  end(): void
  /**
   * The next part, read against this Layer's index (readPart). `doc`: the composed document through this part's tail, opened
   * with PDF_OPTIONS; required iff `part.addon?.tail`, refused (TypeError) otherwise. Sync. Throws BundleRefusal for another
   * head, for a part out of order (pages[0] is not through + 1, or prev is not the last part's digest), for a `doc` whose
   * numPages is not N + part.chain.r; TypeError for a missing or invalid doc; changing nothing. The same part again (its
   * sha256 told) is a no-op. After endParts() (and on a BUNDLE 3 layer) it throws BundleRefusal; after dispose() it is a no-op.
   * A part with a tail swaps the document: the one it replaces is told to `onRetired` once no task reads it
   */
  addPart(part: ReadPart, o?: { doc?: LayerDocument }): void
  /** no more parts (the catalog's end): every page no part covers becomes `failed`, told once; its pageOf and leftPageOf reject */
  endParts(): void
  /** sync; throws after dispose. A page a part covers is never `waiting` for that part again */
  pageState(page: number): PageState
  /** each page's `laying`, then its `ready` or `failed`, once, in the order they happen (pages of a closure too). Returns the unsubscribe */
  onPage(listener: (page: number, state: PageEvent) => void): () => void
  /** the ids of the units whose rows laying the page still waits for (taken neither, nor ended), in id order: its closure's
   *  over the parts told so far (a later part may add to it), [] once it is ready or nothing waits. A host that translates as it
   *  shows (the extension) translates a jump's units first by it. Throws after dispose */
  rowsFor(page: number): number[]
  /**
   * The page laid, a fresh LaidPage on every call (D-2). On `waiting` or `laying` it resolves when laid. It rejects on
   * `failed`, on a page uncovered when endParts() ends the parts, on dispose, and on `signal` abort (an AbortError). An aborted
   * ask drops its page from the targets: a page still `waiting` is not laid when a part covers it unless asked again; a page
   * already `laying` is laid anyway (a state never goes back). The newest ask is laid first, by its closure alone; a page told
   * `laying` is finished before the drive goes idle, and a newer ask overtakes it once at most (no page told `laying` waits
   * behind every later ask). Throws synchronously after dispose
   */
  pageOf(page: number, o: { lang: string; signal?: AbortSignal }): Promise<LaidPage>
  /**
   * The page of the left, parsed and cached (D-5): its ref is fetched once, on the first want, through `openLayer`'s
   * `leftPart(page, ref)`. Waits until the part covering the page is added; rejects on a page uncovered when endParts() ends the
   * parts and on dispose; a failed fetch is not cached. `signal` aborts the wait: an AbortError for this ask, and once no ask is left
   * for a page still awaiting its covering part, nothing is fetched. Throws synchronously after dispose
   */
  leftPageOf(page: number, o?: { signal?: AbortSignal }): Promise<LeftPage>
  /** the ready page's copy at a view's resolution, for any ready page after end() until dispose (D-4); a page not ready
   *  rejects; throws after dispose */
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

/** BUNDLE 4's open */
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
/** BUNDLE 3's open, until the pin move: the whole paper at once (every page covered, no part to come) */
export interface OpenBundleLayerOptions {
  bundle: ReadBundle
  doc: LayerDocument
  target: string
  faceSources: FaceSources
  hyphUrl: (lang: string) => string
  rules?: FrozenRuleSet
  /** the document no longer read, once at dispose (optional) */
  onRetired?: (doc: LayerDocument) => void
}
/** the layer of one paper and target, as either reader shows it: v0 opened over the composed document with the paper's left,
 *  layout and add-on, the target's caption names on every float (L7), the served faces and hyphenation, at scale 2.5 and dpr 1
 *  (one set of choices on every device); its rows taken as they come. One open layer per page: v0's faces are the page's, and a
 *  second open before the first's dispose throws. `rules`: the layout rule set every choice for the target is read from
 *  (absent: the built-in one); it must be a set `readRules` or `parseRules` returned, or `BUILTIN_RULES`: the door checks only
 *  its shape (an object holding `scripts` and `languages`, else a TypeError), not its values. BUNDLE 4: the parts told at the
 *  open must follow one another (BundleRefusal) over a document of N + the last one's chain.r pages */
export declare function openLayer(o: OpenLayerOptions | OpenBundleLayerOptions): Promise<Layer>
/** the face a host asks for first, at the open, before the paper's family is known: the target's CJK body face (light
 *  where the rule set says so beside the family v0 opens with), else null; `rules`: the set the layer is opened with
 *  (absent: the built-in one) */
export declare function firstFaceOf(target: string, rules?: FrozenRuleSet): FaceId | null
