// ink-pass.mjs's types
import type { InkOfWrap } from '../layout/ink-units.mjs'
import type { BundleUnit, InkBundleUnit } from '../layer-proto/units.mjs'
/** the ink units the host gave, where they are this paper's (their ids from the source units' count, the wrap's), `off` those not
 *  laid (on a page not drawable, or the wrap's `off`); null where none */
export declare function inkOfHost(ink: unknown, source: { units: readonly unknown[] }, undrawable?: readonly number[]): InkOfHost | null
export interface InkOfHost extends Omit<InkOfWrap, 'off'> { off: Set<number> }
/** the ink units where their chunks fit beside the source units' within a head's bounds, else null */
export declare function inkWithinChunks(paper: { id: string; version: number }, sourceUnits: readonly BundleUnit[], ink: InkOfHost | null): Promise<InkOfHost | null>
/** the bundle's units with the ink units after the source units' */
export declare function bundleWithInk(bundle: BundleUnit[], ink: InkOfHost | null): (BundleUnit | InkBundleUnit)[]
/** each ink unit's anchor on the left: arXiv's tokens on its lines */
export declare function inkAnchors(doc: readonly { page: number; x: number; w: number; top: number; bottom: number }[], ink: InkOfHost | null): Map<number, { rects: { page: number; x0: number; y0: number; x1: number; y1: number }[]; coverage: number; tokens: number[]; bounded: boolean; pairs: Map<number, number> }>
/** each figure unit's anchor on the left: arXiv's tokens on its page whose middle stands in its run's band */
export declare function figureAnchors(doc: readonly { page: number; x: number; w: number; top: number; bottom: number }[], figures: ReadonlyMap<number, readonly (readonly unknown[])[]> | null | undefined): Map<number, { rects: { page: number; x0: number; y0: number; x1: number; y1: number }[]; coverage: number; tokens: number[]; bounded: boolean; pairs: Map<number, number> }>
/** a layout with the ink units `ids` after its own */
export declare function layoutWithInk<L extends { fonts: string[] } | null>(layout: L, ink: InkOfHost | null, ids: readonly number[]): L
/** the maker's stream with the ink units in it */
export declare function streamWithInk<S>(st: S, ink: InkOfHost | null): S
