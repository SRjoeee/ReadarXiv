// text-rendering.mjs's types: how the layer's SVG text is rendered, decided once a document from a laid page's own words
// (docs/PDF-READER.md §11.8)

/** CSS px: the most one glyph's advance may differ between the two renderings for the layer to take `auto` */
export declare const ADVANCE_TOLERANCE: number
/** the fewest fractional advances a decision for `auto` rests on */
export declare const MIN_EVIDENCE: number
/** the most words a page's probe lays out again */
export declare const PROBE_RUNS: number
/** the attribute of <html> engine.css reads: `data-axt-layer-text="auto"` where the layer takes `auto` */
export declare const ATTRIBUTE: 'data-axt-layer-text'
/** the layer's text rendering: `auto` where the browser lays the layer's words out alike under both, else geometricPrecision */
export type LayerText = 'auto' | 'precise'
/** a word of a laid page drawn from one place, in its own face and size (the SVG's units) */
export interface ProbeWord { text: string; family: string; weight: string; style: string; size: string; spacing: string | null }
/** the decision from two layouts of the same words (each word's characters' start x, in units of `unit` CSS px), or null where they tell too little */
export declare function decideLayerText(precise: readonly (readonly number[] | null)[] | null | undefined, auto: readonly (readonly number[] | null)[] | null | undefined, unit?: number): LayerText | null
/** a laid page's words drawn from one place each (at most PROBE_RUNS) */
export declare function wordsOf(svg: SVGSVGElement | null | undefined, view?: Pick<Window, 'getComputedStyle'> | null): ProbeWord[]
/** the words laid out again under both renderings in a hidden SVG of the layer's scale, and the decision on them */
export declare function probeWords(doc: Document | null | undefined, words: readonly ProbeWord[] | null | undefined): LayerText | null
/** the document's decision from a laid page's SVG, made once and written on its <html>; null while no page has told */
export declare function applyLayerText(svg: SVGSVGElement | null | undefined, doc?: Document | null): LayerText | null
