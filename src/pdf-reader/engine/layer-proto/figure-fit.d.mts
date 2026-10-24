// figure-fit.mjs's types: a figure's text drawn in its run's box
/** where a translation `width1` wide at size 1 is drawn in figure unit `f`, or null where it does not fit at `floor` of its size */
export declare function fitFigure(f: { length: number; size: number; anchor: 'start' | 'centre' | 'end' }, width1: number, floor: number): { size: number; offset: number; width: number } | null
/** whether a translation says nothing other than its source (its letters and digits, case and spacing aside) */
export declare function sameAsSource(tr: string, src: string): boolean
