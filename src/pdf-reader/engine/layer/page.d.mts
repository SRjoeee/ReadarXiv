// page.mjs's types: page-even
import type { LayerRules } from '../layer-rules.mjs'
import type { LayoutIndex } from '../layout/file.mjs'
import type { LaidUnit } from './fit.mjs'

/** the kinds a page evens; the scorer's BODY_KINDS (Plan 8a) is the same three, which Plan 8d asserts */
export declare const EVEN_KINDS: readonly ['para', 'abstract', 'theorem']
/** a page's body units: located units of EVEN_KINDS whose frames all lie on the page */
export declare function bodyUnits(file: LayoutIndex, page: number): number[]
/** the page's even setting once all its body units are laid: the smallest scale any needs, and in 'size-and-lead' the
 *  smallest leading (in 'size', the rules' leadBase); null where nothing needs re-laying ('unit', or every unit already at
 *  it). The units above it (a scale above maxScale, or in 'size-and-lead' a leading above lead) are laid again with it,
 *  once; one that comes back unfit keeps its first fit */
export declare function evenOf(laid: readonly LaidUnit[], rules: LayerRules): { maxScale: number; lead: number } | null
