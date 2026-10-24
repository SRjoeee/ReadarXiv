// text-layer.mjs's types: a laid page's text layer as the reading view builds it over its place (docs/PDF-READER.md §11.11)
import type { TextLayerData } from '../layer-proto/reader.mjs'

export declare const ITEMS_MAX: number
export declare const STR_MAX: number
/** an item as the view places it: checked and copied */
export interface PlacedItem { str: string; x: number; base: number; w: number; fontSize: number; dir: 'ltr' | 'rtl'; from: 'kept' | 'moved' | 'translated'; eol: boolean }
/** the items of a page's text layer data the view can place, in their order, at most ITEMS_MAX */
export declare function textItems(data: TextLayerData | null | undefined): PlacedItem[]
/** the items as a PDF.js text content (getTextContent's shape): each an upright run at its baseline in one generic face */
export declare function textContentOf(items: readonly PlacedItem[], lang?: string | null): {
  items: { str: string; dir: string; transform: number[]; width: number; height: number; fontName: string; hasEOL: boolean }[]
  styles: Record<string, { fontFamily: string; ascent: number; descent: number; vertical: boolean }>
  lang: string | null
}
/** a built layer: its element (div.textLayer.axt-text) and its release (PDF.js's builder's cancel) */
export interface BuiltTextLayer { div: HTMLDivElement; cancel(): void }
/** a viewport as the layer is placed by: PDF.js's PageViewport */
export interface TextViewport { width: number; height: number; rotation?: number; scale: number; rawDims?: unknown }
/** PDF.js's TextLayerBuilder, as the layer uses it */
export type TextLayerBuilderClass = new (o: { pdfPage: { streamTextContent(): ReadableStream }; highlighter?: { setTextMapping(divs: HTMLElement[], strs: string[]): void; enable(): void; disable(): void } }) => { div: HTMLDivElement; render(o: { viewport: unknown }): Promise<void>; cancel(): void }
/** the page's text layer built by PDF.js's own builder over the place's viewport, or null */
export declare function textLayer(data: TextLayerData | null | undefined, o: { viewport: TextViewport | null | undefined; Builder: TextLayerBuilderClass | null | undefined; lang?: string | null }): Promise<BuiltTextLayer | null>
