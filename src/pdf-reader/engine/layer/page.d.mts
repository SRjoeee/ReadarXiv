// page.mjs's types: page-even
import type { LayerRules } from '../layer-rules.mjs'
import type { LayoutIndex } from '../layout/file.mjs'
import type { LaidUnit } from './fit.mjs'

/** the kinds a page evens; the scorer's BODY_KINDS (Plan 8a) is the same three, which Plan 8d asserts */
export declare const EVEN_KINDS: readonly ['para', 'abstract', 'theorem']
/** a page's body units: located units of EVEN_KINDS whose frames all lie on the page */
export declare function bodyUnits(file: LayoutIndex, page: number): number[]
/** the page's even setting once all its body units are laid: the smallest scale any needs; null where nothing needs
 *  re-laying ('unit', or every unit already at it). The units above it (a scale above maxScale) are laid again with it,
 *  each from the rules' own leading, once; one that comes back unfit keeps its first fit. The leading is never evened */
export declare function evenOf(laid: readonly LaidUnit[], rules: LayerRules): { maxScale: number } | null
