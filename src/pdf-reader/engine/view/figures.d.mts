// figures.mjs's types (JavaScript until the engine's port), for the reader's tests
export interface Region { kind: 'vector' | 'raster'; x0: number; y0: number; x1: number; y1: number; image?: string }
/** the figures placed on a page, from PDF.js's operator list (fnArray, argsArray) and its operator codes */
export declare function figureRegions(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Record<string, number>, options?: { min?: number }): Region[]
/** a label inside a figure: the text items whose middle lies in the figure's rectangle, runs on one baseline joined */
export interface FigureLabel { figure: number; text: string; x: number; y: number; w: number; size: number; angle: number; x0: number; y0: number; x1: number; y1: number }
/** the labels inside figures, from the page's text items and the figures' regions */
export declare function figureLabels(items: readonly { str?: string; [k: string]: unknown }[], regions: readonly Region[]): FigureLabel[]
/** a block's lines as one text for the engine, in the chain's wire format; null for an engine that keeps no placeholder (runs) */
export declare function blockWire(texts: readonly string[], format?: 'markers' | 'tags' | 'runs'): string | null
/** the engine's answer → one text per line, or null when the placeholders did not come back one for one, in order */
export declare function splitBlock(text: string, n: number, format?: 'markers' | 'tags'): string[] | null
/** a vector figure's labels as lines the way the recogniser gives them for a bitmap: corners as fractions of the figure, a turned line's direction */
export declare function vectorLines(labels: readonly FigureLabel[], region: Region): { text: string; conf: number; quad: [number, number][]; angle?: number; len?: number; thick?: number }[]
