// ink-pass.mjs's types
import type { InkOfWrap } from '../layout/ink-units.mjs'
import type { BundleUnit, InkBundleUnit } from '../layer-proto/units.mjs'
/** the ink units the host gave, where they are this paper's (their ids from the source units' count), less those on a page not
 *  drawable; null where none */
export declare function inkOfHost(ink: unknown, source: { units: readonly unknown[] }, undrawable?: readonly number[]): InkOfWrap | null
/** the bundle's units with the ink units after the source units' */
export declare function bundleWithInk(bundle: BundleUnit[], ink: InkOfWrap | null): (BundleUnit | InkBundleUnit)[]
/** each ink unit's anchor on the left: arXiv's tokens on its lines */
export declare function inkAnchors(doc: readonly { page: number; x: number; w: number; top: number; bottom: number }[], ink: InkOfWrap | null): Map<number, { rects: { page: number; x0: number; y0: number; x1: number; y1: number }[]; coverage: number; tokens: number[]; bounded: boolean; pairs: Map<number, number> }>
/** a layout with the ink units `ids` after its own */
export declare function layoutWithInk<L extends { fonts: string[] } | null>(layout: L, ink: InkOfWrap | null, ids: readonly number[]): L
/** the maker's stream with the ink units in it */
export declare function streamWithInk<S>(st: S, ink: InkOfWrap | null): S
