// figure-fit.mjs's types: a figure's text drawn in its run's place, a set of them at one size
/** a figure unit as the fit rule reads it: its box's length, its size, its anchor, its room before and after its box */
export interface FitUnit { length: number; size: number; anchor: 'start' | 'centre' | 'end'; before?: number; after?: number }
/** where a translation is drawn: its size, its start along the run's direction from the run's origin, its width */
export interface Fit { size: number; offset: number; width: number }
/** where the translations of one set are drawn, item by item, at one size; null for one that does not fit at `floor` */
export declare function fitFigureSet(items: readonly { f: FitUnit; width1: number }[], floor: number): (Fit | null)[]
/** where a translation `width1` wide at size 1 is drawn in figure unit `f` alone, or null where it does not fit at `floor` of its size */
export declare function fitFigure(f: FitUnit, width1: number, floor: number): Fit | null
/** whether a translation says nothing other than its source (its letters and digits, case and spacing aside) */
export declare function sameAsSource(tr: string, src: string): boolean
