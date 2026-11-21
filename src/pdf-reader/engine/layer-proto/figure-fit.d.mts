// figure-fit.mjs's types: a figure's text drawn in its run's place, a set of them at one size
/** a figure unit as the fit rule reads it: its box's length, its size, its anchor, its room before and after its box, and the
 *  depth under its baseline of the stroke under its text (PDF units; none or null where none is) */
export interface FitUnit { length: number; size: number; anchor: 'start' | 'centre' | 'end'; before?: number; after?: number; under?: number | null }
/** where a translation is drawn: its size, its start along the run's direction from the run's origin, its width */
export interface Fit { size: number; offset: number; width: number }
/** a CJK face's em box under its baseline, of its size: the depth a CJK run of a translation is held to at the most */
export declare const CJK_FOOT: number
/** where the translations of one set are drawn, item by item, at one size; null for one that does not fit at `floor`, false for one
 *  whose translation (`depth1` deep at size 1) reaches the stroke under its unit's text at the size it is given */
export declare function fitFigureSet(items: readonly { f: FitUnit; width1: number; depth1?: number }[], floor: number): (Fit | null | false)[]
/** where a translation `width1` wide at size 1 is drawn in figure unit `f` alone; null where it does not fit at `floor` of its
 *  size, false where (`depth1` deep at size 1) it reaches the stroke under its text */
export declare function fitFigure(f: FitUnit, width1: number, floor: number, depth1?: number): Fit | null | false
/** whether a translation says nothing other than its source (its letters and digits, case and spacing aside) */
export declare function sameAsSource(tr: string, src: string): boolean
