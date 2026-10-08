// reader.mjs's types: the reader's door, the one module both readers take the instant layer's engine values from
import type { FaceId } from '../rules/font-roles.mjs'
import type { ReadBundle } from './bundle.mjs'
import type { FaceSources } from './fonts.mjs'
import type { Row } from './rows.mjs'
import type { FrozenRuleSet } from '../rules/layout.mjs'

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

/** the composed document as PDF.js opened it (a PDFDocumentProxy): arXiv's PDF followed by the bundle's add-on, opened
 *  once with PDF_OPTIONS, or arXiv's PDF alone where the bundle has no add-on */
export interface LayerDocument { numPages: number; getPage(n: number): Promise<unknown> }
/** what the layer has done so far */
export interface LayerStats {
  /** the units the layer awaits rows for: the target's (toTranslate) */
  units: number
  /** the units laid and drawn */
  drawn: number
  /** the pages laid, rising */
  pages: number[]
  /** the longest a unit's lay and paint took, ms (one unit a task) */
  slowestTaskMs: number
  /** each page's step, ms: its original drawn and read, its units laid and painted (less the rows it waited for) */
  pageMs: Readonly<Record<number, number>>
  /** the rows skipped as no unit of the bundle's (unitOf's null) */
  dropped: number
  /** the layout rule set the layer was opened with: its schema and version */
  rules: { schema: 1; version: number }
}
/** the layer of one paper and target, open */
export interface Layer {
  /** each row as v0's unit, into the run: the pages newly complete; a row that is no unit of the bundle's is skipped and
   *  counted (stats().dropped) */
  take(rows: readonly Row[]): { complete: number[] }
  /** no more rows: every page is complete with what it holds */
  end(): void
  /** the page done (every page up to it drawn and laid, those done let go; a page done already waits for nothing), as the
   *  run set it: its own SVG element at the run's scale with its lang set, and its size in CSS px */
  pageOf(page: number, o: { lang: string }): Promise<{ svg: SVGSVGElement; w: number; h: number }>
  /** the done page's copy at a view's resolution: a canvas of `source`'s size, `source` (the page as PDF.js drew it at k
   *  device pixels a PDF unit) under v0's drawing scaled to k; a page done already waits for no other page being laid */
  copyOf(page: number, source: CanvasImageSource & { width: number; height: number }, k: number): Promise<HTMLCanvasElement>
  /** the unit at a point of a page (the left's shapes, PDF units: the identity map), the smallest shape where several
   *  hold it; null where none (the reading line) */
  unitAt(page: number, x: number, y: number): number | null
  stats(): LayerStats
  /** the run let go: every sheet it inserted removed, every page's canvases released, nothing answered after but stats
   *  and unitAt; what the page's runs share stays: the FontFaces added to document.fonts and the faces' classes' sheet */
  dispose(): void
}
/** the layer of one paper and target, as either reader shows it: v0 opened over the composed document with the bundle's
 *  left, layout and add-on, the target's caption names on every float (L7), the served faces and hyphenation, at scale 2.5
 *  and dpr 1 (one set of choices on every device); its rows taken as they come. One open layer per page: v0's faces are
 *  the page's, and a second open before the first's dispose throws. `rules`: the layout rule set every choice for the target
 *  is read from (absent: the built-in one); it must be a set `readRules` or `parseRules` returned, or `BUILTIN_RULES`: the
 *  door checks only its shape (an object holding `scripts` and `languages`, else a TypeError), not its values */
export declare function openLayer(o: { bundle: ReadBundle; doc: LayerDocument; target: string; faceSources: FaceSources; hyphUrl: (lang: string) => string; rules?: FrozenRuleSet }): Promise<Layer>
/** the face a host asks for first, at the open, before the paper's family is known: the target's CJK body face (light
 *  where the rule set says so beside the family v0 opens with), else null; `rules`: the set the layer is opened with
 *  (absent: the built-in one) */
export declare function firstFaceOf(target: string, rules?: FrozenRuleSet): FaceId | null
