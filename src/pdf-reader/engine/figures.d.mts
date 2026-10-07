// figures.mjs's types (JavaScript until the engine's port), for the reader's tests
export interface Region { kind: 'vector' | 'raster'; x0: number; y0: number; x1: number; y1: number; image?: string }
/** the figures placed on a page, from PDF.js's operator list (fnArray, argsArray) and its operator codes */
export declare function figureRegions(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Record<string, number>, options?: { min?: number }): Region[]
